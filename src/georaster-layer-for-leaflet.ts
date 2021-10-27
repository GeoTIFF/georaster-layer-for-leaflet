/* global proj4 */
import "regenerator-runtime/runtime";
import * as L from "leaflet";
import chroma from "chroma-js";
import isUTM from "utm-utils/src/isUTM";
import getProjString from "utm-utils/src/getProjString";
import type { Coords, DoneCallback, LatLngBounds, LatLngTuple } from "leaflet";
import proj4FullyLoaded from "proj4-fully-loaded";
import { GeoExtent } from "geo-extent";
import snap from "snap-bbox";

import type {
  CustomCRS,
  CustomCSSStyleDeclaration,
  GeoRasterLayerOptions,
  GeoRaster,
  GeoRasterKeys,
  GetRasterOptions,
  DrawTileOptions,
  PixelValuesToColorFn,
  Tile
} from "./types";

const EPSG4326 = 4326;
const PROJ4_SUPPORTED_PROJECTIONS = new Set([3785, 3857, 4269, 4326, 900913, 102113]);
const MAX_NORTHING = 1000;
const MAX_EASTING = 1000;
const ORIGIN: LatLngTuple = [0, 0];

const log = (obj: any) => console.log("[georaster-layer-for-leaflet] ", obj);

// figure out if simple CRS
// even if not created with same instance of LeafletJS
const isSimpleCRS = (crs: CustomCRS) =>
  crs === L.CRS.Simple ||
  (!crs.code &&
    crs.infinite &&
    crs?.transformation?._a === 1 &&
    crs?.transformation?._b === 0 &&
    crs?.transformation?._c === -1 &&
    crs?.transformation?._d === 0);

const GeoRasterLayer: (new (options: GeoRasterLayerOptions) => any) & typeof L.Class = L.GridLayer.extend({
  options: {
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 25,
    resolution: 2 ** 5,
    debugLevel: 0
  },

  initialize: function (options: GeoRasterLayerOptions) {
    try {
      if (options.georasters) {
        this.georasters = options.georasters;
      } else if (options.georaster) {
        this.georasters = [options.georaster];
      } else {
        throw new Error("You initialized a GeoRasterLayer without a georaster or georasters value.");
      }

      if (this.sourceType === "url") {
        options.updateWhenIdle = false;
        options.updateWhenZooming = true;
        options.keepBuffer = 16;
      }

      if (options.resampleMethod) {
        this.resampleMethod = options.resampleMethod;
      }

      /*
          Unpacking values for use later.
          We do this in order to increase speed.
      */
      const keys = [
        "height",
        "width",
        "noDataValue",
        "palette",
        "pixelHeight",
        "pixelWidth",
        "projection",
        "sourceType",
        "xmin",
        "xmax",
        "ymin",
        "ymax"
      ];
      if (this.georasters.length > 1) {
        keys.forEach(key => {
          if (this.same(this.georasters, key)) {
            this[key] = this.georasters[0][key];
          } else {
            throw new Error("all GeoRasters must have the same " + key);
          }
        });
      } else if (this.georasters.length === 1) {
        keys.forEach(key => {
          this[key] = this.georasters[0][key];
        });
      }

      this._cache = {
        innerTile: {},
        tile: {}
      };

      this.extent = new GeoExtent([this.xmin, this.ymin, this.xmax, this.ymax], { srs: this.projection });

      // used later if simple projection
      this.ratio = this.height / this.width;

      this.debugLevel = options.debugLevel;
      if (this.debugLevel >= 1) log({ options });

      if (this.georasters.every((georaster: GeoRaster) => typeof georaster.values === "object")) {
        this.rasters = this.georasters.reduce((result: number[][][], georaster: GeoRaster) => {
          // added double-check of values to make typescript linter and compiler happy
          if (georaster.values) {
            result = result.concat(georaster.values);
            return result;
          }
        }, []);
        if (this.debugLevel > 1) console.log("this.rasters:", this.rasters);
      }

      this.chroma = chroma;
      this.scale = chroma.scale();

      // could probably replace some day with a simple
      // (for let k in options) { this.options[k] = options[k]; }
      // but need to find a way around TypeScript any issues
      L.Util.setOptions(this, options);

      /*
          Caching the constant tile size, so we don't recalculate everytime we
          create a new tile
      */
      const tileSize = this.getTileSize();
      this.tileHeight = tileSize.y;
      this.tileWidth = tileSize.x;

      if (this.georasters.length > 1 && !options.pixelValuesToColorFn) {
        throw "you must pass in a pixelValuesToColorFn if you are combining rasters";
      }

      // total number of bands across all georasters
      this.numBands = this.georasters.reduce((total: number, g: GeoRaster) => total + g.numberOfRasters, 0);
      if (this.debugLevel > 1) console.log("this.numBands:", this.numBands);

      // in-case we want to track dynamic/running stats of all pixels fetched
      this.currentStats = {
        mins: new Array(this.numBands),
        maxs: new Array(this.numBands),
        ranges: new Array(this.numBands)
      };

      if (
        this.georasters.length === 1 &&
        this.georasters[0].sourceType === "url" &&
        this.georasters[0].numberOfRasters === 1 &&
        !options.pixelValuesToColorFn
      ) {
        this.calcStats = true;
      }
    } catch (error) {
      console.error("ERROR initializing GeoTIFFLayer", error);
    }
  },

  getRasters: function (options: GetRasterOptions) {
    const {
      innerTileTopLeftPoint,
      heightOfSampleInScreenPixels,
      widthOfSampleInScreenPixels,
      zoom,
      numberOfSamplesAcross,
      numberOfSamplesDown,
      ymax,
      xmin
    } = options;
    if (this.debugLevel >= 1) console.log("starting getRasters with options:", options);

    // called if georaster was constructed from URL and we need to get
    // data separately for each tile
    // aka 'COG mode'

    /*
      This function takes in coordinates in the rendered image inner tile and
      returns the y and x values in the original raster
    */
    const rasterCoordsForTileCoords = (h: number, w: number): { x: number; y: number } | null => {
      const xCenterInMapPixels = innerTileTopLeftPoint.x + (w + 0.5) * widthOfSampleInScreenPixels;
      const yCenterInMapPixels = innerTileTopLeftPoint.y + (h + 0.5) * heightOfSampleInScreenPixels;

      const mapPoint = L.point(xCenterInMapPixels, yCenterInMapPixels);
      if (this.debugLevel >= 1) log({ mapPoint });

      const { lat, lng } = this.getMap().unproject(mapPoint, zoom);

      if (this.projection === EPSG4326) {
        return {
          y: Math.floor((ymax - lat) / this.pixelHeight),
          x: Math.floor((lng - xmin) / this.pixelWidth)
        };
      } else if (this.getProjector()) {
        /* source raster doesn't use latitude and longitude,
           so need to reproject point from lat/long to projection of raster
        */
        const [x, y] = this.getProjector().inverse([lng, lat]);
        if (x === Infinity || y === Infinity) {
          if (this.debugLevel >= 1) console.error("projector converted", [lng, lat], "to", [x, y]);
        }
        return {
          y: Math.floor((ymax - y) / this.pixelHeight),
          x: Math.floor((x - xmin) / this.pixelWidth)
        };
      } else {
        return null;
      }
    };

    // careful not to flip min_y/max_y here
    const topLeft = rasterCoordsForTileCoords(0, 0);
    const bottomRight = rasterCoordsForTileCoords(numberOfSamplesDown - 1, numberOfSamplesAcross - 1);

    const getValuesOptions = {
      bottom: bottomRight?.y,
      height: numberOfSamplesDown,
      left: topLeft?.x,
      right: bottomRight?.x,
      top: topLeft?.y,
      width: numberOfSamplesAcross
    };

    if (!Object.values(getValuesOptions).every(isFinite)) {
      console.error("getRasters failed because not all values are finite:", getValuesOptions);
    } else {
      // !note: The types need confirmation - SFR 2021-01-20
      return Promise.all(
        this.georasters.map((georaster: GeoRaster) =>
          georaster.getValues({ ...getValuesOptions, resampleMethod: this.resampleMethod || "bilinear" })
        )
      ).then(valuesByGeoRaster =>
        valuesByGeoRaster.reduce((result: number[][][], values) => {
          result = result.concat(values as number[][]);
          return result;
        }, [])
      );
    }
  },

  createTile: function (coords: Coords, done: DoneCallback) {
    /* This tile is the square piece of the Leaflet map that we draw on */
    const tile = L.DomUtil.create("canvas", "leaflet-tile") as HTMLCanvasElement;

    // we do this because sometimes css normalizers will set * to box-sizing: border-box
    tile.style.boxSizing = "content-box";

    const context = tile.getContext("2d");
    // note that we aren't setting the tile height or width here
    // drawTile dynamically sets the width and padding based on
    // how much the georaster takes up the tile area
    return this.drawTile({ tile, coords, context, done });
  },

  drawTile: function ({ tile, coords, context, done }: DrawTileOptions) {
    try {
      const { debugLevel = 0 } = this;

      if (debugLevel >= 2) console.log("starting drawTile with", { tile, coords, context, done });

      let error: Error;

      const { z: zoom } = coords;

      // stringified hash of tile coordinates for caching purposes
      const cacheKey = [coords.x, coords.y, coords.z].join(",");
      if (debugLevel >= 2) log({ cacheKey });

      const mapCRS = this.getMapCRS();
      if (debugLevel >= 2) log({ mapCRS });

      const inSimpleCRS = isSimpleCRS(mapCRS);
      if (debugLevel >= 2) log({ inSimpleCRS });

      // Unpacking values for increased speed
      const { rasters, xmin, ymax } = this;
      const rasterHeight = this.height;
      const rasterWidth = this.width;

      const extentOfLayer = new GeoExtent(this.getBounds(), { srs: inSimpleCRS ? "simple" : 4326 });
      if (debugLevel >= 2) log({ extentOfLayer });

      const pixelHeight = inSimpleCRS ? extentOfLayer.height / rasterHeight : this.pixelHeight;
      const pixelWidth = inSimpleCRS ? extentOfLayer.width / rasterWidth : this.pixelWidth;
      if (debugLevel >= 2) log({ pixelHeight, pixelWidth });

      // these values are used, so we don't try to sample outside of the raster
      const { xMinOfLayer, xMaxOfLayer, yMinOfLayer, yMaxOfLayer } = this;
      const boundsOfTile = this._tileCoordsToBounds(coords);
      if (debugLevel >= 2) log({ boundsOfTile });

      const { code } = mapCRS;
      if (debugLevel >= 2) log({ code });
      const extentOfTile = new GeoExtent(boundsOfTile, { srs: inSimpleCRS ? "simple" : 4326 });
      if (debugLevel >= 2) log({ extentOfTile });

      // create blue outline around tiles
      if (debugLevel >= 4) {
        if (!this._cache.tile[cacheKey]) {
          this._cache.tile[cacheKey] = L.rectangle(extentOfTile.leafletBounds, { fillOpacity: 0 })
            .addTo(this.getMap())
            .bindTooltip(cacheKey, { direction: "center", permanent: true });
        }
      }

      const extentOfTileInMapCRS = inSimpleCRS ? extentOfTile : extentOfTile.reproj(code);
      if (debugLevel >= 2) log({ extentOfTileInMapCRS });

      let extentOfInnerTileInMapCRS = extentOfTileInMapCRS.crop(inSimpleCRS ? extentOfLayer : this.extent);
      if (debugLevel >= 2)
        console.log(
          "[georaster-layer-for-leaflet] extentOfInnerTileInMapCRS",
          extentOfInnerTileInMapCRS.reproj(inSimpleCRS ? "simple" : 4326)
        );
      if (debugLevel >= 2) log({ coords, extentOfInnerTileInMapCRS, extent: this.extent });

      // create blue outline around tiles
      if (debugLevel >= 4) {
        if (!this._cache.innerTile[cacheKey]) {
          const ext = inSimpleCRS ? extentOfInnerTileInMapCRS : extentOfInnerTileInMapCRS.reproj(4326);
          this._cache.innerTile[cacheKey] = L.rectangle(ext.leafletBounds, {
            color: "#F00",
            dashArray: "5, 10",
            fillOpacity: 0
          }).addTo(this.getMap());
        }
      }

      const widthOfScreenPixelInMapCRS = extentOfTileInMapCRS.width / this.tileWidth;
      const heightOfScreenPixelInMapCRS = extentOfTileInMapCRS.height / this.tileHeight;
      if (debugLevel >= 3) log({ heightOfScreenPixelInMapCRS, widthOfScreenPixelInMapCRS });

      const xScaleSignInMapCRS = Math.sign(mapCRS?.transformation?._a || 1);
      const yScaleSignInMapCRS = Math.sign(mapCRS?.transformation?._c || -1);
      if (debugLevel >= 3) log({ xScaleSignInMapCRS, yScaleSignInMapCRS });

      const xScaleOfScreenPixelInMapCRS = xScaleSignInMapCRS * widthOfScreenPixelInMapCRS;
      const yScaleOfScreenPixelInMapCRS = yScaleSignInMapCRS * heightOfScreenPixelInMapCRS;
      if (debugLevel >= 3) log({ xScaleOfScreenPixelInMapCRS, yScaleOfScreenPixelInMapCRS });

      const snapped = snap({
        bbox: extentOfInnerTileInMapCRS.bbox,
        container: extentOfTileInMapCRS.bbox,
        debug: debugLevel >= 2,
        origin: [extentOfTileInMapCRS.xmin, extentOfTileInMapCRS.ymax],
        padding: [1, 1], // add extra padding to cautiously handle floating point arithmetic
        scale: [xScaleOfScreenPixelInMapCRS, yScaleOfScreenPixelInMapCRS]
      });

      if (debugLevel >= 3)
        console.log(
          "[georaster-layer-for-leaflet] extent of inner tile before snapping " +
            extentOfInnerTileInMapCRS.reproj(inSimpleCRS ? "simple" : 4326).bbox.toString()
        );

      // reset inner tile to the snapped version
      extentOfInnerTileInMapCRS = new GeoExtent(snapped.bbox_in_coordinate_system, {
        srs: inSimpleCRS ? "simple" : code
      });
      if (debugLevel >= 3)
        console.log(
          "[georaster-layer-for-leaflet] extent of inner tile after snapping " +
            extentOfInnerTileInMapCRS.reproj(inSimpleCRS ? "simple" : 4326).bbox.toString()
        );

      // we round here because sometimes there will be slight floating arithmetic issues
      // where the padding is like 0.00000000000001
      const padding = {
        left: Math.round((extentOfInnerTileInMapCRS.xmin - extentOfTileInMapCRS.xmin) / widthOfScreenPixelInMapCRS),
        right: Math.round((extentOfTileInMapCRS.xmax - extentOfInnerTileInMapCRS.xmax) / widthOfScreenPixelInMapCRS),
        top: Math.round((extentOfTileInMapCRS.ymax - extentOfInnerTileInMapCRS.ymax) / heightOfScreenPixelInMapCRS),
        bottom: Math.round((extentOfInnerTileInMapCRS.ymin - extentOfTileInMapCRS.ymin) / heightOfScreenPixelInMapCRS)
      };
      if (debugLevel >= 3) log({ padding });

      const innerTileHeight = this.tileHeight - padding.top - padding.bottom;
      const innerTileWidth = this.tileWidth - padding.left - padding.right;
      if (debugLevel >= 3) log({ innerTileHeight, innerTileWidth });

      const xMinOfInnerTileInMapCRS = extentOfTileInMapCRS.xmin + padding.left * widthOfScreenPixelInMapCRS;
      const yMinOfInnerTileInMapCRS = extentOfTileInMapCRS.ymin + padding.bottom * heightOfScreenPixelInMapCRS;
      const xMaxOfInnerTileInMapCRS = extentOfInnerTileInMapCRS.xmax - padding.right * widthOfScreenPixelInMapCRS;
      const yMaxOfInnerTileInMapCRS = extentOfTileInMapCRS.ymax - padding.top * heightOfScreenPixelInMapCRS;
      if (debugLevel >= 4)
        log({ xMinOfInnerTileInMapCRS, yMinOfInnerTileInMapCRS, xMaxOfInnerTileInMapCRS, yMaxOfInnerTileInMapCRS });

      // set padding and size of canvas tile
      tile.style.paddingTop = padding.top + "px";
      tile.style.paddingRight = padding.right + "px";
      tile.style.paddingBottom = padding.bottom + "px";
      tile.style.paddingLeft = padding.left + "px";

      tile.height = innerTileHeight;
      tile.style.height = innerTileHeight + "px";

      tile.width = innerTileWidth;
      tile.style.width = innerTileWidth + "px";
      if (debugLevel >= 3) console.log("setting tile height to " + innerTileHeight + "px");

      // calculate height and width of the Leaflet tile
      // in the number of pixels from the original raster
      let rasterPixelsAcross = 0;
      let rasterPixelsDown = 0;
      if (inSimpleCRS) {
        rasterPixelsAcross = Math.ceil(extentOfInnerTileInMapCRS.width / pixelWidth);
        rasterPixelsDown = Math.ceil(extentOfInnerTileInMapCRS.height / pixelHeight);
      } else {
        const extentOfInnerTileInRasterCRS = extentOfInnerTileInMapCRS.reproj(this.projection);
        rasterPixelsAcross = Math.ceil(extentOfInnerTileInRasterCRS.width / pixelWidth);
        rasterPixelsDown = Math.ceil(extentOfInnerTileInRasterCRS.height / pixelHeight);
      }
      if (debugLevel >= 4) log({ rasterPixelsAcross, rasterPixelsDown });

      const { resolution } = this.options;

      const percentHeight = innerTileHeight / this.tileHeight;
      const percentWidth = innerTileWidth / this.tileWidth;
      if (debugLevel >= 4) log({ percentHeight, percentWidth });

      const maxNumberOfSamplesAcross = Math.ceil(percentWidth * resolution);
      const maxNumberOfSamplesDown = Math.ceil(percentHeight * resolution);
      if (debugLevel >= 4) console.log({ maxNumberOfSamplesAcross, maxNumberOfSamplesDown });

      // limit repeat sampling of the same pixel but also reducing aliasing at high zoom
      const numberOfSamplesAcross = Math.min(maxNumberOfSamplesAcross, 3 * rasterPixelsAcross);
      if (debugLevel >= 4) console.log({ resolution, rasterPixelsAcross, numberOfSamplesAcross });
      const numberOfSamplesDown = Math.min(maxNumberOfSamplesDown, 3 * rasterPixelsDown);

      // set how large to display each sample in screen pixels
      const heightOfSampleInScreenPixels = innerTileHeight / numberOfSamplesDown;
      const heightOfSampleInScreenPixelsInt = Math.ceil(heightOfSampleInScreenPixels);
      const widthOfSampleInScreenPixels = innerTileWidth / numberOfSamplesAcross;
      const widthOfSampleInScreenPixelsInt = Math.ceil(widthOfSampleInScreenPixels);

      const map = this.getMap();
      const tileSize = this.getTileSize();

      // this converts tile coordinates (how many tiles down and right)
      // to pixels from left and top of tile pane
      const tileNwPoint = coords.scaleBy(tileSize);
      if (debugLevel >= 4) log({ tileNwPoint });
      const xLeftOfInnerTile = tileNwPoint.x + padding.left;
      const yTopOfInnerTile = tileNwPoint.y + padding.top;
      const innerTileTopLeftPoint = { x: xLeftOfInnerTile, y: yTopOfInnerTile };
      if (debugLevel >= 4) log({ innerTileTopLeftPoint });

      // render asynchronously so tiles show up as they finish instead of all at once (which blocks the UI)
      setTimeout(async () => {
        try {
          let tileRasters: number[][][] | null = null;
          if (!rasters) {
            tileRasters = await this.getRasters({
              innerTileTopLeftPoint,
              heightOfSampleInScreenPixels,
              widthOfSampleInScreenPixels,
              zoom,
              pixelHeight,
              pixelWidth,
              numberOfSamplesAcross,
              numberOfSamplesDown,
              ymax,
              xmin
            });
            if (tileRasters && this.calcStats) {
              const { noDataValue } = this;
              for (let bandIndex = 0; bandIndex < tileRasters.length; bandIndex++) {
                let min = this.currentStats.mins[bandIndex];
                let max = this.currentStats.maxs[bandIndex];
                const band = tileRasters[bandIndex];
                for (let rowIndex = 0; rowIndex < band.length; rowIndex++) {
                  const row = band[rowIndex];
                  for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
                    const value = row[columnIndex];
                    if (value !== noDataValue) {
                      if (min === undefined || value < min) min = value;
                      if (max === undefined || value > max) max = value;
                    }
                  }
                }
                this.currentStats.mins[bandIndex] = min;
                this.currentStats.maxs[bandIndex] = max;
                this.currentStats.ranges[bandIndex] = max - min;
              }
            }
          }

          for (let h = 0; h < numberOfSamplesDown; h++) {
            const yCenterInMapPixels = yTopOfInnerTile + (h + 0.5) * heightOfSampleInScreenPixels;
            const latWestPoint = L.point(xLeftOfInnerTile, yCenterInMapPixels);
            const { lat } = map.unproject(latWestPoint, zoom);
            if (lat > yMinOfLayer && lat < yMaxOfLayer) {
              const yInTilePixels = Math.round(h * heightOfSampleInScreenPixels);

              let yInRasterPixels = 0;
              if (inSimpleCRS || this.projection === EPSG4326) {
                yInRasterPixels = Math.floor((yMaxOfLayer - lat) / pixelHeight);
              }

              for (let w = 0; w < numberOfSamplesAcross; w++) {
                const latLngPoint = L.point(
                  xLeftOfInnerTile + (w + 0.5) * widthOfSampleInScreenPixels,
                  yCenterInMapPixels
                );
                const { lng: xOfLayer } = map.unproject(latLngPoint, zoom);
                if (xOfLayer > xMinOfLayer && xOfLayer < xMaxOfLayer) {
                  let xInRasterPixels = 0;
                  if (inSimpleCRS || this.projection === EPSG4326) {
                    xInRasterPixels = Math.floor((xOfLayer - xMinOfLayer) / pixelWidth);
                  } else if (this.getProjector()) {
                    const inverted = this.getProjector().inverse({ x: xOfLayer, y: lat });
                    const yInSrc = inverted.y;
                    yInRasterPixels = Math.floor((ymax - yInSrc) / pixelHeight);
                    if (yInRasterPixels < 0 || yInRasterPixels >= rasterHeight) continue;

                    const xInSrc = inverted.x;
                    xInRasterPixels = Math.floor((xInSrc - xmin) / pixelWidth);
                    if (xInRasterPixels < 0 || xInRasterPixels >= rasterWidth) continue;
                  }
                  let values = null;
                  if (tileRasters) {
                    // get value from array specific to this tile
                    values = tileRasters.map(band => band[h][w]);
                  } else if (rasters) {
                    // get value from array with data for entire raster
                    values = rasters.map((band: number[][]) => {
                      return band[yInRasterPixels][xInRasterPixels];
                    });
                  } else {
                    done && done(Error("no rasters are available for, so skipping value generation"));
                    return;
                  }

                  // x-axis coordinate of the starting point of the rectangle representing the raster pixel
                  const x = Math.round(w * widthOfSampleInScreenPixels);

                  // y-axis coordinate of the starting point of the rectangle representing the raster pixel
                  const y = yInTilePixels;

                  // how many real screen pixels does a pixel of the sampled raster take up
                  const width = widthOfSampleInScreenPixelsInt;
                  const height = heightOfSampleInScreenPixelsInt;

                  if (this.options.customDrawFunction) {
                    this.options.customDrawFunction({
                      values,
                      context,
                      x,
                      y,
                      width,
                      height,
                      rasterX: xInRasterPixels,
                      rasterY: yInRasterPixels,
                      sampleX: w,
                      sampleY: h,
                      sampledRaster: tileRasters
                    });
                  } else {
                    const color = this.getColor(values);
                    if (color && context) {
                      context.fillStyle = color;
                      context.fillRect(x, y, width, height);
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          error = e;
        }

        done && done(error, tile);
      }, 0);

      // return the tile so it can be rendered on screen
      return tile;
    } catch (error) {
      done && done(error, tile);
    }
  },

  // copied from Leaflet with slight modifications,
  // including removing the lines that set the tile size
  _initTile: function (tile: HTMLCanvasElement) {
    L.DomUtil.addClass(tile, "leaflet-tile");

    tile.onselectstart = L.Util.falseFn;
    tile.onmousemove = L.Util.falseFn;

    // update opacity on tiles in IE7-8 because of filter inheritance problems
    if (L.Browser.ielt9 && this.options.opacity < 1) {
      L.DomUtil.setOpacity(tile, this.options.opacity);
    }

    // without this hack, tiles disappear after zoom on Chrome for Android
    // https://github.com/Leaflet/Leaflet/issues/2078
    if (L.Browser.android && !L.Browser.android23) {
      (<CustomCSSStyleDeclaration>tile.style).WebkitBackfaceVisibility = "hidden";
    }
  },

  // method from https://github.com/Leaflet/Leaflet/blob/bb1d94ac7f2716852213dd11563d89855f8d6bb1/src/layer/ImageOverlay.js
  getBounds: function () {
    this.initBounds();
    return this._bounds;
  },

  getMap: function () {
    return this._map || this._mapToAdd;
  },

  getMapCRS: function () {
    return this.getMap()?.options.crs || L.CRS.EPSG3857;
  },

  // add in to ensure backwards compatability with Leaflet 1.0.3
  _tileCoordsToNwSe: function (coords: Coords) {
    const map = this.getMap();
    const tileSize = this.getTileSize();
    const nwPoint = coords.scaleBy(tileSize);
    const sePoint = nwPoint.add(tileSize);
    const nw = map.unproject(nwPoint, coords.z);
    const se = map.unproject(sePoint, coords.z);
    return [nw, se];
  },

  _tileCoordsToBounds: function (coords: Coords) {
    const [nw, se] = this._tileCoordsToNwSe(coords);
    let bounds: LatLngBounds = new L.LatLngBounds(nw, se);

    if (!this.options.noWrap) {
      const { crs } = this.getMap().options;
      bounds = crs.wrapLatLngBounds(bounds);
    }
    return bounds;
  },

  _isValidTile: function (coords: Coords) {
    const crs = this.getMapCRS();

    if (!crs.infinite) {
      // don't load tile if it's out of bounds and not wrapped
      const globalBounds = this._globalTileRange;
      if (
        (!crs.wrapLng && (coords.x < globalBounds.min.x || coords.x > globalBounds.max.x)) ||
        (!crs.wrapLat && (coords.y < globalBounds.min.y || coords.y > globalBounds.max.y))
      ) {
        return false;
      }
    }

    const bounds = this.getBounds();

    if (!bounds) {
      return true;
    }

    const { x, y, z } = coords;

    // not sure what srs should be here when simple crs
    const layerExtent = new GeoExtent(bounds, { srs: 4326 });

    const boundsOfTile = this._tileCoordsToBounds(coords);

    // check given tile coordinates
    if (layerExtent.overlaps(boundsOfTile)) return true;

    // if not within the original confines of the earth return false
    // we don't want wrapping if using Simple CRS
    if (isSimpleCRS(crs)) return false;

    // width of the globe in tiles at the given zoom level
    const width = Math.pow(2, z);

    // check one world to the left
    const leftCoords = L.point(x - width, y) as Coords;
    leftCoords.z = z;
    const leftBounds = this._tileCoordsToBounds(leftCoords);
    if (layerExtent.overlaps(leftBounds)) return true;

    // check one world to the right
    const rightCoords = L.point(x + width, y) as Coords;
    rightCoords.z = z;
    const rightBounds = this._tileCoordsToBounds(rightCoords);
    if (layerExtent.overlaps(rightBounds)) return true;

    return false;
  },

  getColor: function (values: number[]): string | undefined {
    if (this.options.pixelValuesToColorFn) {
      return this.options.pixelValuesToColorFn(values);
    } else {
      const numberOfValues = values.length;
      const haveDataForAllBands = values.every(value => value !== undefined && value !== this.noDataValue);
      if (haveDataForAllBands) {
        if (numberOfValues == 1) {
          const value = values[0];
          if (this.palette) {
            const [r, g, b, a] = this.palette[value];
            return `rgba(${r},${g},${b},${a / 255})`;
          } else if (this.georasters[0].mins) {
            const { mins, ranges } = this.georasters[0];
            return this.scale((values[0] - mins[0]) / ranges[0]).hex();
          } else if (this.currentStats.mins) {
            const min = this.currentStats.mins[0];
            const range = this.currentStats.ranges[0];
            return this.scale((values[0] - min) / range).hex();
          }
        } else if (numberOfValues === 2) {
          return `rgb(${values[0]},${values[1]},0)`;
        } else if (numberOfValues === 3) {
          return `rgb(${values[0]},${values[1]},${values[2]})`;
        } else if (numberOfValues === 4) {
          return `rgba(${values[0]},${values[1]},${values[2]},${values[3] / 255})`;
        }
      }
    }
  },

  /**
   * Redraws the active map tiles updating the pixel values using the supplie callback
   */
  updateColors(
    pixelValuesToColorFn: /**The callback used to determine the colour based on the values of each pixel */ PixelValuesToColorFn,
    { debugLevel = -1 } = { debugLevel: -1 }
  ) {
    if (!pixelValuesToColorFn) {
      throw new Error("Missing pixelValuesToColorFn function");
    }

    // if debugLevel is -1, set it to the default for the class
    if (debugLevel === -1) debugLevel = this.debugLevel;

    if (debugLevel >= 1) console.log("Start updating active tile pixel values");

    // update option to ensure correct colours at other zoom levels.
    this.options.pixelValuesToColorFn = pixelValuesToColorFn;

    const tiles = this.getActiveTiles();
    if (!tiles) {
      console.error("No active tiles available");
      return this;
    }

    if (debugLevel >= 1) console.log("Active tiles fetched", tiles);

    tiles.forEach((tile: Tile) => {
      const { coords, el } = tile;
      this.drawTile({ tile: el, coords, context: el.getContext("2d") });
    });
    if (debugLevel >= 1) console.log("Finished updating active tile colours");
    return this;
  },

  getTiles(): Tile[] {
    // transform _tiles object collection into an array
    return Object.values(this._tiles);
  },

  getActiveTiles(): Tile[] {
    const tiles: Tile[] = this.getTiles();
    // only return valid tiles
    return tiles.filter(tile => this._isValidTile(tile.coords));
  },

  isSupportedProjection: function () {
    if (this._isSupportedProjection === undefined) {
      const projection = this.projection;
      if (isUTM(projection)) {
        this._isSupportedProjection = true;
      } else if (PROJ4_SUPPORTED_PROJECTIONS.has(projection)) {
        this._isSupportedProjection = true;
      } else if (typeof proj4FullyLoaded === "function" && `EPSG:${projection}` in proj4FullyLoaded.defs) {
        this._isSupportedProjection = true;
      } else if (
        typeof proj4 === "function" &&
        typeof proj4.defs !== "undefined" &&
        `EPSG:${projection}` in proj4.defs
      ) {
        this._isSupportedProjection = true;
      } else {
        this._isSupportedProjection = false;
      }
    }
    return this._isSupportedProjection;
  },

  getProjectionString: function (projection: number) {
    if (isUTM(projection)) {
      return getProjString(projection);
    }
    return `EPSG:${projection}`;
  },

  initBounds: function (options: GeoRasterLayerOptions) {
    if (!options) options = this.options;
    if (!this._bounds) {
      const { debugLevel, height, width, projection, xmin, xmax, ymin, ymax } = this;
      // check if map using Simple CRS
      if (isSimpleCRS(this.getMapCRS())) {
        if (height === width) {
          this._bounds = L.latLngBounds([ORIGIN, [MAX_NORTHING, MAX_EASTING]]);
        } else if (height > width) {
          this._bounds = L.latLngBounds([ORIGIN, [MAX_NORTHING, MAX_EASTING / this.ratio]]);
        } else if (width > height) {
          this._bounds = L.latLngBounds([ORIGIN, [MAX_NORTHING * this.ratio, MAX_EASTING]]);
        }
      } else if (projection === EPSG4326) {
        if (debugLevel >= 1) console.log(`georaster projection is in ${EPSG4326}`);
        const minLatWest = L.latLng(ymin, xmin);
        const maxLatEast = L.latLng(ymax, xmax);
        this._bounds = L.latLngBounds(minLatWest, maxLatEast);
      } else if (this.getProjector()) {
        if (debugLevel >= 1) console.log("projection is UTM or supported by proj4");
        const bottomLeft = this.getProjector().forward({ x: xmin, y: ymin });
        const minLatWest = L.latLng(bottomLeft.y, bottomLeft.x);
        const topRight = this.getProjector().forward({ x: xmax, y: ymax });
        const maxLatEast = L.latLng(topRight.y, topRight.x);
        this._bounds = L.latLngBounds(minLatWest, maxLatEast);
      } else {
        if (typeof proj4FullyLoaded !== "function") {
          throw `You are using the lite version of georaster-layer-for-leaflet, which does not support rasters with the projection ${projection}.  Please try using the default build or add the projection definition to your global proj4.`;
        } else {
          throw `GeoRasterLayer does not provide built-in support for rasters with the projection ${projection}.  Add the projection definition to your global proj4.`;
        }
      }

      // these values are used so we don't try to sample outside of the raster
      this.xMinOfLayer = this._bounds.getWest();
      this.xMaxOfLayer = this._bounds.getEast();
      this.yMaxOfLayer = this._bounds.getNorth();
      this.yMinOfLayer = this._bounds.getSouth();

      options.bounds = this._bounds;
    }
  },

  getProjector: function () {
    if (this.isSupportedProjection()) {
      if (!proj4FullyLoaded && !proj4) {
        throw "proj4 must be found in the global scope in order to load a raster that uses this projection";
      }
      if (!this._projector) {
        const projString = this.getProjectionString(this.projection);
        if (this.debugLevel >= 1) log({ projString });
        let proj4Lib;
        if (projString.startsWith("EPSG")) {
          if (typeof proj4 === "function" && typeof proj4.defs === "function" && projString in proj4.defs) {
            proj4Lib = proj4;
          } else if (
            typeof proj4FullyLoaded === "function" &&
            typeof proj4FullyLoaded.defs === "function" &&
            projString in proj4FullyLoaded.defs
          ) {
            proj4Lib = proj4FullyLoaded;
          } else {
            throw "[georaster-layer-for-leaflet] projection not found in proj4 instance";
          }
        } else {
          if (typeof proj4 === "function") {
            proj4Lib = proj4;
          } else if (typeof proj4FullyLoaded === "function") {
            proj4Lib = proj4FullyLoaded;
          } else {
            throw "[georaster-layer-for-leaflet] projection not found in proj4 instance";
          }
        }
        this._projector = proj4Lib(projString, `EPSG:${EPSG4326}`);

        if (this.debugLevel >= 1) console.log("projector set");
      }
      return this._projector;
    }
  },

  same(array: GeoRaster[], key: GeoRasterKeys) {
    return new Set(array.map(item => item[key])).size === 1;
  }
});

/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof window === "object") {
  (window as any)["GeoRasterLayer"] = GeoRasterLayer;
}
if (typeof self !== "undefined") {
  (self as any)["GeoRasterLayer"] = GeoRasterLayer;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default GeoRasterLayer;

// Explicitly exports public types
export type { GeoRaster, GeoRasterLayerOptions, PixelValuesToColorFn } from "./types";
