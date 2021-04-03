/* global proj4 */
import "regenerator-runtime/runtime";
import * as L from "leaflet";
import chroma from "chroma-js";
import isUTM from "utm-utils/src/isUTM";
import getProjString from "utm-utils/src/getProjString";
import type { Coords, DoneCallback, LatLngTuple } from "leaflet";
import type {
  GeoRasterLayerOptions,
  GeoRaster,
  GeoRasterKeys,
  GetRasterOptions,
  DrawTileOptions,
  PixelValuesToColorFn,
  Tile
} from "./types";

const EPSG4326 = 4326;
const PROJ4_SUPPORTED_PROJECTIONS = new Set([3857, 4269]);
const MAX_NORTHING = 1000;
const MAX_EASTING = 1000;
const ORIGIN: LatLngTuple = [0, 0];

const GeoRasterLayer = L.GridLayer.extend({
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

      // used later if simple projection
      this.ratio = this.height / this.width;

      this.debugLevel = options.debugLevel;
      if (this.debugLevel >= 1) console.log("georaster:", options);

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

      if (
        this.georasters.length === 1 &&
        this.georasters[0].sourceType === "url" &&
        this.georasters[0].numberOfRasters === 1 &&
        !options.pixelValuesToColorFn
      ) {
        // For COG, we can't determine a data min max for color scaling,
        // so pixelValuesToColorFn is required.
        throw "pixelValuesToColorFn is a required option for single-band rasters initialized via URL";
      }
    } catch (error) {
      console.error("ERROR initializing GeoTIFFLayer", error);
    }
  },

  getRasters: function (options: GetRasterOptions) {
    const {
      tileNwPoint,
      heightOfSampleInScreenPixels,
      widthOfSampleInScreenPixels,
      coords,
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
      This function takes in coordinates in the rendered image tile and
      returns the y and x values in the original raster
    */
    const rasterCoordsForTileCoords = (h: number, w: number): { x: number; y: number } | null => {
      const xCenterInMapPixels = tileNwPoint.x + (w + 0.5) * widthOfSampleInScreenPixels;
      const yCenterInMapPixels = tileNwPoint.y + (h + 0.5) * heightOfSampleInScreenPixels;

      const mapPoint = L.point(xCenterInMapPixels, yCenterInMapPixels);
      if (this.debugLevel >= 1) console.log("mapPoint:", mapPoint);

      const { lat, lng } = this.getMap().unproject(mapPoint, coords.z);

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
      return Promise.all(this.georasters.map((georaster: GeoRaster) => georaster.getValues(getValuesOptions))).then(
        valuesByGeoRaster =>
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
    tile.height = this.tileHeight;
    tile.width = this.tileWidth;
    const context = tile.getContext("2d");

    return this.drawTile({ tile, coords, context, done });
  },

  drawTile: function ({ tile, coords, context, done }: DrawTileOptions) {
    let error: Error;

    const inSimpleCRS = this.getMap().options.crs === L.CRS.Simple;

    // Unpacking values for increased speed
    const { rasters, xmin, ymax } = this;
    const rasterHeight = this.height;
    const rasterWidth = this.width;

    const pixelHeight = inSimpleCRS ? this.getBounds()._northEast.lat / rasterHeight : this.pixelHeight;
    const pixelWidth = inSimpleCRS ? this.getBounds()._northEast.lng / rasterWidth : this.pixelWidth;

    // these values are used, so we don't try to sample outside of the raster
    const { xMinOfLayer, xMaxOfLayer, yMinOfLayer, yMaxOfLayer } = this;
    const boundsOfTile = this._tileCoordsToBounds(coords);

    const xMinOfTileInMapCRS = boundsOfTile.getWest();
    const xMaxOfTileInMapCRS = boundsOfTile.getEast();
    const yMinOfTileInMapCRS = boundsOfTile.getSouth();
    const yMaxOfTileInMapCRS = boundsOfTile.getNorth();

    let rasterPixelsAcross = 0;
    let rasterPixelsDown = 0;
    if (inSimpleCRS || this.projection === EPSG4326) {
      // width of the Leaflet tile in number of pixels from original raster
      rasterPixelsAcross = Math.ceil((xMaxOfTileInMapCRS - xMinOfTileInMapCRS) / pixelWidth);
      rasterPixelsDown = Math.ceil((yMaxOfTileInMapCRS - yMinOfTileInMapCRS) / pixelHeight);
    } else {
      const projector = this.getProjector();
      // convert extent of Leaflet tile to projection of the georaster
      const topLeft = projector.inverse({ x: xMinOfTileInMapCRS, y: yMaxOfTileInMapCRS });
      const topRight = projector.inverse({ x: xMaxOfTileInMapCRS, y: yMaxOfTileInMapCRS });
      const bottomLeft = projector.inverse({ x: xMinOfTileInMapCRS, y: yMinOfTileInMapCRS });
      const bottomRight = projector.inverse({ x: xMaxOfTileInMapCRS, y: yMinOfTileInMapCRS });

      rasterPixelsAcross = Math.ceil(Math.max(topRight.x - topLeft.x, bottomRight.x - bottomLeft.x) / pixelWidth);
      rasterPixelsDown = Math.ceil(Math.max(topLeft.y - bottomLeft.y, topRight.y - bottomRight.y) / pixelHeight);
    }

    const { resolution } = this.options;

    // prevent sampling more times than number of pixels to display
    const numberOfSamplesAcross = Math.min(resolution, rasterPixelsAcross);
    const numberOfSamplesDown = Math.min(resolution, rasterPixelsDown);

    // set how large to display each sample in screen pixels
    const heightOfSampleInScreenPixels = this.tileHeight / numberOfSamplesDown;
    const heightOfSampleInScreenPixelsInt = Math.ceil(heightOfSampleInScreenPixels);
    const widthOfSampleInScreenPixels = this.tileWidth / numberOfSamplesAcross;
    const widthOfSampleInScreenPixelsInt = Math.ceil(widthOfSampleInScreenPixels);

    const map = this.getMap();
    const tileSize = this.getTileSize();

    // this converts tile coordinates (how many tiles down and right)
    // to pixels from left and top of tile pane
    const tileNwPoint = coords.scaleBy(tileSize);

    // render asynchronously so tiles show up as they finish instead of all at once (which blocks the UI)
    setTimeout(async () => {
      let tileRasters: number[][][] | null = null;
      if (!rasters) {
        tileRasters = await this.getRasters({
          tileNwPoint,
          heightOfSampleInScreenPixels,
          widthOfSampleInScreenPixels,
          coords,
          pixelHeight,
          pixelWidth,
          numberOfSamplesAcross,
          numberOfSamplesDown,
          ymax,
          xmin
        });
      }

      for (let h = 0; h < numberOfSamplesDown; h++) {
        const yCenterInMapPixels = tileNwPoint.y + (h + 0.5) * heightOfSampleInScreenPixels;
        const latWestPoint = L.point(tileNwPoint.x, yCenterInMapPixels);
        const { lat } = map.unproject(latWestPoint, coords.z);
        if (lat > yMinOfLayer && lat < yMaxOfLayer) {
          const yInTilePixels = Math.round(h * heightOfSampleInScreenPixels);

          let yInRasterPixels = 0;
          if (inSimpleCRS || this.projection === EPSG4326) {
            yInRasterPixels = Math.floor((yMaxOfLayer - lat) / pixelHeight);
          }

          for (let w = 0; w < numberOfSamplesAcross; w++) {
            const latLngPoint = L.point(tileNwPoint.x + (w + 0.5) * widthOfSampleInScreenPixels, yCenterInMapPixels);
            const { lng: xOfLayer } = map.unproject(latLngPoint, coords.z);
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
                if (color) {
                  context.fillStyle = color;
                  context.fillRect(x, y, width, height);
                }
              }
            }
          }
        }
      }

      done && done(error, tile);
    }, 0);

    // return the tile so it can be rendered on screen
    return tile;
  },

  // method from https://github.com/Leaflet/Leaflet/blob/bb1d94ac7f2716852213dd11563d89855f8d6bb1/src/layer/ImageOverlay.js
  getBounds: function () {
    this.initBounds();
    return this._bounds;
  },

  getMap: function () {
    return this._map || this._mapToAdd;
  },

  _isValidTile: function (coords: Coords) {
    const crs = this.getMap().options.crs;

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

    const layerBounds = L.latLngBounds(bounds);

    const boundsOfTile = this._tileCoordsToBounds(coords);

    // check given tile coordinates
    if (layerBounds.overlaps(boundsOfTile)) return true;

    // if not within the original confines of the earth return false
    // we don't want wrapping if using Simple CRS
    if (crs === L.CRS.Simple) return false;

    // width of the globe in tiles at the given zoom level
    const width = Math.pow(2, z);

    // check one world to the left
    const leftCoords = L.point(x - width, y) as Coords;
    leftCoords.z = z;
    if (layerBounds.overlaps(this._tileCoordsToBounds(leftCoords))) return true;

    // check one world to the right
    const rightCoords = L.point(x + width, y) as Coords;
    rightCoords.z = z;

    if (layerBounds.overlaps(this._tileCoordsToBounds(rightCoords))) return true;

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
          const { mins, ranges } = this.georasters[0];
          const value = values[0];
          if (this.palette) {
            const [r, g, b, a] = this.palette[value];
            return `rgba(${r},${g},${b},${a / 255})`;
          } else {
            return this.scale((values[0] - mins[0]) / ranges[0]).hex();
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
   * The callback used to determine the colour based on the values of each pixel
   *
   * @callback pixelValuesToColorFn
   * @param {array | number} values - The pixel value depends on the image being rendered. Multiband images will be a tuple of one value per band. Single band images will be a single number
   * @returns {string} - Any valid CSS color string
   */

  /**
   * Redraws the active map tiles updating the pixel values using the supplie callback
   * @param {pixelValuesToColorFn} pixelValuesToColorFn - Callback that handles getting the pixel color
   * @param {Object} [options] - Configuration options passed to the method
   * @param {boolean} [options.debugLevel=0] - Overrides the global `debugLevel`. Set it to >=1 to allow output here when the global `debugLevel` = 0
   */
  updateColors(pixelValuesToColorFn: PixelValuesToColorFn, { debugLevel=-1 } = { debugLevel: -1 }) {
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
      this.drawTile({ tile, coords, context: el.getContext("2d") });
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

  isSupportedProjection: function (projection: number) {
    if (!projection) projection = this.projection;
    return isUTM(projection) || PROJ4_SUPPORTED_PROJECTIONS.has(projection);
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
      if (this.getMap().options.crs === L.CRS.Simple) {
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
        throw `georaster-layer-for-leaflet does not support rasters with the projection ${projection}`;
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
    if (this.isSupportedProjection(this.projection)) {
      if (!proj4) {
        throw "proj4 must be found in the global scope in order to load a raster that uses a UTM projection";
      }
      if (!this._projector) {
        this._projector = proj4(this.getProjectionString(this.projection), `EPSG:${EPSG4326}`);
        if (this.debugLevel >= 1) console.log("projector set");
      }
      return this._projector;
    }
  },

  same(array: GeoRaster[], key: GeoRasterKeys) {
    return new Set(array.map(item => item[key])).size === 1;
  }
});

if (typeof module === "object" && typeof module.exports === "object") {
  module.exports = GeoRasterLayer;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof window === "object") {
  (window as any)["GeoRasterLayer"] = GeoRasterLayer;
} else if (typeof self !== "undefined") {
  (self as any)["GeoRasterLayer"] = GeoRasterLayer;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
