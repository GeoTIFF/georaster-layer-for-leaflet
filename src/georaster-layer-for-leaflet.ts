/* global global */
/* global proj4 */
import "regenerator-runtime/runtime.js";
import * as L from "leaflet";
import { rawToRgb } from "pixel-utils";
import densePolygon from "bbox-fns/dense-polygon.js";
import isUTM from "utm-utils/src/isUTM.js";
import getProjString from "utm-utils/src/getProjString.js";
import type { Coords, DoneCallback, LatLngBounds, LatLngTuple } from "leaflet";

import proj4collect from "proj4-collect";
import reprojectGeoJSON from "reproject-geojson";

import bboxMerge from "bbox-fns/merge.js";
import fastMin from "fast-min";
import fastMax from "fast-max";
import { GeoExtent } from "geo-extent";
import geowarp_core from "geowarp";
import geowarp_canvas from "geowarp-canvas";
import snap from "snap-bbox";
import { GeoRasterStack } from "georaster-stack/web";

import type {
  CustomCRS,
  CustomCSSStyleDeclaration,
  GeoRasterLayerOptions,
  GeoRaster,
  GeoRasterKeys,
  DrawTileOptions,
  Mask,
  MaskStrategy,
  PixelValuesToColorFn,
  Tile
} from "./types";

declare global {}

const EPSG4326 = 4326;
const ORIGIN: LatLngTuple = [0, 0];

const geowarp = geowarp_canvas(geowarp_core);

const isDefaultCRS = (crs: any) => crs === L.CRS.EPSG3857 || crs.code === "EPSG:3857";

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

if (!L)
  console.warn(
    "[georaster-layer-for-leaflet] can't find Leaflet.  If you are loading via <script>, please add the GeoRasterLayer script after the LeafletJS script."
  );

const zip = (a: any[], b: any[]) => a.map((it, i) => [it, b[i]]);

const GeoRasterLayer: (new (options: GeoRasterLayerOptions) => any) & typeof L.Class = L.GridLayer.extend({
  options: {
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 25,
    resolution: 2 ** 5,
    debugLevel: 0,
    caching: true,
    turbo: false
  },

  cache: {},

  initialize: function (options: GeoRasterLayerOptions) {
    this.proj4 = proj4collect();

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
        if ((options.resampleMethod as any) === "nearest") {
          this.resampleMethod = "near";
        } else {
          this.resampleMethod = options.resampleMethod;
        }
      }

      this._cache = {
        innerTile: {},
        tile: {}
      };

      this.debugLevel = options.debugLevel;

      this.subextents = this.georasters.map(
        (g: any) => new GeoExtent([g.xmin, g.ymin, g.xmax, g.ymax], { srs: g.projection })
      );

      // normalize all extents to EPSG:4326 and combine them
      this.extent = new GeoExtent(bboxMerge(this.subextents.map((extent: any) => extent.reproj(4326).bbox)), {
        srs: 4326
      });

      const max_height = Math.max.apply(
        null,
        this.georasters.map((it: any) => it.height)
      );
      const max_width = Math.max.apply(
        null,
        this.georasters.map((it: any) => it.width)
      );
      this.simpleExtent = new GeoExtent([0, 0, max_width, max_height]);

      if (this.debugLevel >= 1) {
        console.log("[georaster-layer-for-leaflet] ", { options });
      }

      this.initialize_mask(options);

      this.turbo = options.turbo || false;

      this.stack = GeoRasterStack.init({
        // flatten results, so it appears as if all the bands
        // are from the same raster
        flat: true,
        sources: this.georasters,

        debugLevel: this.debugLevel,
        method: this.resampleMethod,
        turbo: this.turbo
      });

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

      if (this.georasters.length >= 4 && !options.pixelValuesToColorFn) {
        throw "you must pass in a pixelValuesToColorFn if you are combining rasters";
      }

      this._all_values_in_memory = this.georasters.every(
        (georaster: GeoRaster) => typeof georaster.values === "object"
      );

      // total number of bands across all georasters
      this.numBands = this.georasters.reduce((total: number, g: GeoRaster) => total + g.numberOfRasters, 0);
      if (this.debugLevel > 1) console.log("this.numBands:", this.numBands);

      // if we have pre-computed stats, save them, so we can use them for linear stretching later
      if (
        this.georasters.every(
          (g: any) =>
            Array.isArray(g.mins) &&
            g.mins.length === g.numberOfRasters &&
            g.mins.every((it: number | null) => typeof it === "number") &&
            Array.isArray(g.maxs) &&
            g.maxs.length === g.numberOfRasters &&
            g.maxs.every((it: number | null) => typeof it === "number")
        )
      ) {
        this.stats = {
          mins: [],
          maxs: []
        };

        this.georasters.map((georaster: any) => {
          const numBands = georaster.numberOfRasters;
          if (georaster.mins.length === numBands) {
            this.stats.mins = this.stats.mins.concat(georaster.mins);
          } else {
            this.stats.mins = this.stats.mins.concat(new Array(numBands).fill(null));
          }
          if (georaster.maxs.length === numBands) {
            this.stats.maxs = this.stats.maxs.concat(georaster.maxs);
          } else {
            this.stats.maxs = this.stats.maxs.concat(new Array(numBands).fill(null));
          }
          this.stats.ranges = zip(this.stats.mins, this.stats.maxs).map(([min, max]) => max - min);
        });
        console.log("this.stats:", this.stats);
      }

      // in-case we want to track dynamic/running stats of all pixels fetched
      this.currentStats = {
        mins: new Array(this.numBands),
        maxs: new Array(this.numBands),
        ranges: new Array(this.numBands)
      };

      // if don't have custom band arithmetic, set one based on the palette
      if (
        !this.options.pixelValuesToColorFn &&
        !this.options.customDrawFunction &&
        this.georasters.length === 1 &&
        Array.isArray(this.georasters[0].palette)
      ) {
        const palette = this.georasters[0].palette;
        this.options.pixelValuesToColorFn = (values: Number[]) => palette[values[0] as number];
      }

      // using single-band raster as grayscale
      // or mapping 2 or 3 rasters to rgb bands
      if (
        [1, 2, 3].includes(this.georasters.length) &&
        this.georasters.every((g: GeoRaster) => g.sourceType === "url") &&
        this.georasters.every((g: GeoRaster) => g.numberOfRasters === 1) &&
        !options.pixelValuesToColorFn
      ) {
        try {
          this.calcStats = true;
          this._dynamic = true;
          this.options.pixelValuesToColorFn = (values: number[]) => {
            const haveDataForAllBands = values.every(value => value !== undefined && value !== this.noDataValue);
            if (haveDataForAllBands) {
              return this.rawToRgb(values);
            }
          };
        } catch (error) {
          console.error("[georaster-layer-for-leaflet]", error);
        }
      }

      // if you haven't specified a pixelValuesToColorFn
      // and the image is YCbCr, add a function to convert YCbCr
      this.checkIfYCbCr = new Promise(async resolve => {
        if (this.options.pixelValuesToColorFn) return resolve(true);
        if (this.georasters.length === 1 && this.georasters[0].numberOfRasters === 3) {
          const image = await this.georasters[0]._geotiff?.getImage();
          if (image?.fileDirectory?.PhotometricInterpretation === 6) {
            this.options.pixelValuesToColorFn = (values: number[]) => {
              const r = Math.round(values[0] + 1.402 * (values[2] - 0x80));
              const g = Math.round(values[0] - 0.34414 * (values[1] - 0x80) - 0.71414 * (values[2] - 0x80));
              const b = Math.round(values[0] + 1.772 * (values[1] - 0x80));
              return `rgb(${r},${g},${b})`;
            };
          }
        }
        return resolve(true);
      });
    } catch (error) {
      console.error("ERROR initializing GeoRasterLayer", error);
    }
  },

  onAdd: function (map: any) {
    if (!this.options.maxZoom) {
      // maxZoom is needed to display the tiles in the correct order over the zIndex between the zoom levels
      // https://github.com/Leaflet/Leaflet/blob/2592967aa6bd392db0db9e58dab840054e2aa291/src/layer/tile/GridLayer.js#L375C21-L375C21
      this.options.maxZoom = map.getMaxZoom();
    }

    L.GridLayer.prototype.onAdd.call(this, map);
  },

  initialize_mask: function (options: any) {
    if (options.mask && options.mask !== "auto") {
      if (typeof options.mask === "string") {
        this.mask = fetch(options.mask).then(r => r.json()) as Promise<Mask>;
      } else if (typeof options.mask === "object") {
        this.mask = Promise.resolve(options.mask);
      }
      this.mask_srs = options.mask_srs || "EPSG:4326";
    } else if (options.mask === "auto") {
      const projections = new Set(this.georasters.map((it: any) => it.projection));
      if (projections.size === 1) {
        this.mask = Promise.resolve({
          type: "Feature",
          geometry: {
            type: "MultiPolygon",
            coordinates: this.subextents
              .map((ext: any) => ext.unwrap())
              .flat()
              .map((ext: any) => densePolygon(ext.bbox, { density: 100 }))
          }
        });
        this.mask_srs = Array.from(projections)[0];
      } else {
        this.mask = Promise.resolve({
          type: "Feature",
          geometry: {
            type: "MultiPolygon",
            coordinates: this.subextents
              .map((ext: any) => ext.unwrap())
              .flat()
              .map((ext: any) => ext.reproj(4326, { density: "high" }))
              .map((ext: any) => densePolygon(ext.bbox, { density: 100 }))
          }
        });
        this.mask_srs = "EPSG:4326";
      }
    }
  },

  getProjDef: function (proj: number | string) {
    if (isUTM(proj)) return getProjString(proj);
    if (typeof proj === "number") proj = "EPSG:" + proj;
    if (proj in this.proj4.defs) return proj;
    if ("EPSG:" + proj in this.proj4.defs) return "EPSG:" + proj;
    throw new Error("[georaster-layer-for-leaflet] unsupported projection:" + proj);
  },

  getProjector: function (_from: number | string, _to: number | string) {
    if (!this.isSupportedProjection(_from)) {
      throw Error("[georaster-layer-for-leaflet] unsupported projection: " + _from);
    }
    if (!this.isSupportedProjection(_to)) throw Error("[georaster-layer-for-leaflet] unsupported projection: " + _to);
    return this.proj4(this.getProjDef(_from), this.getProjDef(_to));
  },

  createTile: function (coords: Coords, done: DoneCallback) {
    console.log("starting createTile with coords:", coords);
    /* This tile is the square piece of the Leaflet map that we draw on */
    const tile = L.DomUtil.create("canvas", "leaflet-tile") as HTMLCanvasElement;

    // we do this because sometimes css normalizers will set * to box-sizing: border-box
    tile.style.boxSizing = "content-box";

    // start tile hidden
    tile.style.visibility = "hidden";

    const context = tile.getContext("2d");

    const { x, y, z } = coords;
    tile.setAttribute("data-x", x.toString());
    tile.setAttribute("data-y", y.toString());
    tile.setAttribute("data-z", z.toString());

    // note that we aren't setting the tile height or width here
    // drawTile dynamically sets the width and padding based on
    // how much the georaster takes up the tile area
    const coordsKey = this._tileCoordsToKey(coords);

    const resolution = this._getResolution(coords.z);
    const key = `${coordsKey}:${resolution}`;
    const doneCb = (error?: Error, tile?: HTMLElement): void => {
      done(error, tile);

      // caching the rendered tile, to skip the calculation for the next time
      if (!error && this.options.caching) {
        this.cache[key] = tile;
      }
    };

    if (this.options.caching && this.cache[key]) {
      done(undefined, this.cache[key]);
      return this.cache[key];
    } else {
      this.drawTile({ tile, coords, context, done: doneCb, resolution });
    }

    return tile;
  },

  drawTile: function ({ tile, coords, context, done, resolution }: DrawTileOptions) {
    try {
      const start_draw_tile = performance.now();
      const { debugLevel = 0 } = this;

      const timed = debugLevel >= 1;

      if (debugLevel >= 2) console.log("starting drawTile with", { tile, coords, context, done });

      let error: Error;

      // stringified hash of tile coordinates for caching purposes
      const { x, y, z } = coords;

      const cacheKey = [z, x, y].join("/");

      if (this.options._valid_tiles && !this.options._valid_tiles.includes(cacheKey)) return;

      // over-ride default log with tile coordinate info
      const log = (...rest: any[]) => {
        if (rest.length === 1 && typeof rest[0] === "object" && Object.keys(rest[0]).length === 1) {
          const obj = rest[0];
          const key = Object.keys(obj)[0];
          console.log(`[georaster-layer-for-leaflet] [${cacheKey}] ${key}: `, obj[key]);
        } else {
          console.log(`[georaster-layer-for-leaflet] [${cacheKey}]`, ...rest);
        }
      };

      if (debugLevel >= 2) log({ cacheKey });

      if (this.debugLevel >= 4) {
        try {
          // L.geoJSON(this.extent.asGeoJSON({ density: 1000 }), { style: { color: "#0F0", fillOpacity: 0 } }).addTo(
          //   this.getMap()
          // );
        } catch (error) {
          console.error(error);
        }
      }

      const mapCRS = this.getMapCRS();
      if (debugLevel >= 2) log({ mapCRS });

      const inSimpleCRS = isSimpleCRS(mapCRS);
      if (debugLevel >= 2) log({ inSimpleCRS });

      // Unpacking values for increased speed
      const { xmin, xmax, ymin, ymax } = this;
      const rasterHeight = this.height;
      const rasterWidth = this.width;

      const extentOfLayer = new GeoExtent(this.getBounds(), { srs: inSimpleCRS ? "simple" : 4326 });
      if (debugLevel >= 2) log(`extentOfLayer: ${extentOfLayer.js}`);

      const pixelHeight = inSimpleCRS ? extentOfLayer.height / rasterHeight : this.pixelHeight;
      const pixelWidth = inSimpleCRS ? extentOfLayer.width / rasterWidth : this.pixelWidth;
      if (debugLevel >= 2) log({ pixelHeight, pixelWidth });

      const boundsOfTile = this._tileCoordsToBounds(coords);
      if (debugLevel >= 2) log({ boundsOfTile });

      const map_crs_code = mapCRS.code;
      if (debugLevel >= 2) log("map_crs_code:", map_crs_code);
      const extentOfTile = new GeoExtent(boundsOfTile, { srs: inSimpleCRS ? "simple" : 4326 });
      if (debugLevel >= 2) log(`extentOfTile: ${extentOfTile.js}`);

      // create blue outline around tiles
      if (debugLevel >= 4) {
        if (!this._cache.tile[cacheKey]) {
          this._cache.tile[cacheKey] = L.rectangle(extentOfTile.leafletBounds, { fillOpacity: 0 })
            .addTo(this.getMap())
            .bindTooltip(`z:${z}</br>x:${x}</br>y:${y}`, { direction: "center", permanent: true });
        }
      }

      const extentOfTileInMapCRS = inSimpleCRS ? extentOfTile : extentOfTile.reproj(map_crs_code);
      if (debugLevel >= 2)
        console.log(`[georaster-layer-for-leaflet] [${cacheKey}] extentOfTileInMapCRS = ${extentOfTileInMapCRS.js}`);

      if (
        !inSimpleCRS &&
        !this.subextents.some((extent: any) => extentOfTileInMapCRS.overlaps(extent, { strict: false }))
      ) {
        if (debugLevel >= 2) {
          console.log(
            `[georaster-layer-for-leaflet] [${cacheKey}] subextents = ${this.subextents
              .map((e: any) => e.js)
              .join(", ")}`
          );
          console.log(`[georaster-layer-for-leaflet] [${cacheKey}] tile and georaster don't overlap`);
        }
        return;
      }

      if (debugLevel >= 2)
        console.log(
          `[georaster-layer-for-leaflet] [${cacheKey}] this.subextents:`,
          this.subextents.map(({ js }: any) => js)
        );

      const cropline = inSimpleCRS ? extentOfLayer : this.extent;
      let extentOfInnerTileInMapCRS = extentOfTileInMapCRS.crop(cropline);
      if (debugLevel >= 2) log(`extentOfInnerTileInMapCRS: ${extentOfInnerTileInMapCRS.js}`);

      if (extentOfInnerTileInMapCRS === null) {
        if (debugLevel >= 2)
          console.log(`[georaster-layer-for-leaflet] failed to crop ${extentOfTileInMapCRS.js} by ${cropline.js}`);
        return;
      }

      // create red outline around inner tiles
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
      // const defaultCanvasHeight = Math.max(256, this.resolution || 256);
      // const defaultCanvasWidth = Math.max(256, this.resolution || 256);
      // const widthOfCanvasPixelInMapCRS = extentOfTileInMapCRS.width / defaultCanvasHeight;
      // const heightOfCanvasPixelInMapCRS = extentOfTileInMapCRS.height / defaultCanvasWidth;
      if (debugLevel >= 3) log({ heightOfScreenPixelInMapCRS, widthOfScreenPixelInMapCRS });

      let numberOfSamplesAcross = 256;
      let numberOfSamplesDown = 256;

      if (this.options.alignSamples) {
        // align tile sampling area to raster pixels (by expanding extent to tile boundaries)
        // while also cropping the tile the layer extent
        const oldExtentOfInnerTileInRasterCRS = inSimpleCRS
          ? extentOfInnerTileInMapCRS
          : extentOfInnerTileInMapCRS.reproj(this.projection);
        const snapped = snap({
          bbox: oldExtentOfInnerTileInRasterCRS.bbox,
          // pad xmax and ymin of container to tolerate ceil() and floor() in snap()
          container: inSimpleCRS
            ? [
                extentOfLayer.xmin,
                extentOfLayer.ymin - 0.25 * pixelHeight,
                extentOfLayer.xmax + 0.25 * pixelWidth,
                extentOfLayer.ymax
              ]
            : [xmin, ymin - 0.25 * pixelHeight, xmax + 0.25 * pixelWidth, ymax],
          debug: debugLevel >= 2,
          origin: inSimpleCRS ? [extentOfLayer.xmin, extentOfLayer.ymax] : [xmin, ymax],
          precise: false, // use numbers, not numerical strings
          scale: [pixelWidth, -pixelHeight] // negative because origin is at ymax
        });
        const extentOfInnerTileInRasterCRS = new GeoExtent(snapped.bbox_in_coordinate_system, {
          srs: inSimpleCRS ? "simple" : this.projection
        });

        const gridbox = snapped.bbox_in_grid_cells;
        const snappedSamplesAcross = Math.abs(gridbox[2] - gridbox[0]);
        const snappedSamplesDown = Math.abs(gridbox[3] - gridbox[1]);
        const rasterPixelsAcross = Math.ceil(oldExtentOfInnerTileInRasterCRS.width / pixelWidth);
        const rasterPixelsDown = Math.ceil(oldExtentOfInnerTileInRasterCRS.height / pixelHeight);
        const layerCropExtent = inSimpleCRS ? extentOfLayer : this.extent;
        const recropTileOrig = oldExtentOfInnerTileInRasterCRS.crop(layerCropExtent); // may be null

        let maxSamplesAcross = 1;
        let maxSamplesDown = 1;
        if (recropTileOrig !== null) {
          const recropTileProj = inSimpleCRS ? recropTileOrig : recropTileOrig.reproj(map_crs_code);
          const recropTile = recropTileProj.crop(extentOfTileInMapCRS);
          if (recropTile !== null) {
            maxSamplesAcross = Math.ceil(resolution * (recropTile.width / extentOfTileInMapCRS.width));
            maxSamplesDown = Math.ceil(resolution * (recropTile.height / extentOfTileInMapCRS.height));
          }
        }

        const overdrawTileAcross = rasterPixelsAcross < maxSamplesAcross;
        const overdrawTileDown = rasterPixelsDown < maxSamplesDown;
        numberOfSamplesAcross = overdrawTileAcross ? snappedSamplesAcross : maxSamplesAcross;
        numberOfSamplesDown = overdrawTileDown ? snappedSamplesDown : maxSamplesDown;

        // Reprojecting the bounding box back to the map CRS would expand it
        // (unless the projection is purely scaling and translation),
        // so instead just extend the old map bounding box proportionately.
        const oldrb = new GeoExtent(oldExtentOfInnerTileInRasterCRS.bbox);
        const newrb = new GeoExtent(extentOfInnerTileInRasterCRS.bbox);
        const oldmb = new GeoExtent(extentOfInnerTileInMapCRS.bbox);
        if (oldrb.width !== 0 && oldrb.height !== 0) {
          let n0 = ((newrb.xmin - oldrb.xmin) / oldrb.width) * oldmb.width;
          let n1 = ((newrb.ymin - oldrb.ymin) / oldrb.height) * oldmb.height;
          let n2 = ((newrb.xmax - oldrb.xmax) / oldrb.width) * oldmb.width;
          let n3 = ((newrb.ymax - oldrb.ymax) / oldrb.height) * oldmb.height;
          if (!overdrawTileAcross) {
            n0 = Math.max(n0, 0);
            n2 = Math.min(n2, 0);
          }
          if (!overdrawTileDown) {
            n1 = Math.max(n1, 0);
            n3 = Math.min(n3, 0);
          }
          const newbox = [oldmb.xmin + n0, oldmb.ymin + n1, oldmb.xmax + n2, oldmb.ymax + n3];
          extentOfInnerTileInMapCRS = new GeoExtent(newbox, { srs: extentOfInnerTileInMapCRS.srs });
        }
      } else {
        // even if we aren't doing the more advacned sample alignment above
        // we should still factor in the resolution when determing the resolution of the sampled rasters
        // for example, if the inner tile only takes up 10% of the total tile container space,
        // we shouldn't sample 256 times across
        numberOfSamplesAcross = Math.ceil(resolution * (extentOfInnerTileInMapCRS.width / extentOfTileInMapCRS.width));
        numberOfSamplesDown = Math.ceil(resolution * (extentOfInnerTileInMapCRS.height / extentOfTileInMapCRS.height));

        log(`Math.ceil(${resolution} * (${extentOfInnerTileInMapCRS.width} / ${extentOfTileInMapCRS.width}))`);
        if (debugLevel >= 2)
          console.log(`[georaster-layer-for-leaflet] [${cacheKey}] numberOfSamplesAcross: ${numberOfSamplesAcross}`);
        if (debugLevel >= 2)
          console.log(`[georaster-layer-for-leaflet] [${cacheKey}] numberOfSamplesDown: ${numberOfSamplesDown}`);
      }

      if (debugLevel >= 3) {
        console.log(
          "[georaster-layer-for-leaflet] extent of inner tile before snapping " +
            extentOfInnerTileInMapCRS.reproj(inSimpleCRS ? "simple" : 4326).bbox.toString()
        );
      }

      // create outline around raster pixels
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

      if (debugLevel >= 3) {
        log(
          "extent of inner tile after snapping",
          extentOfInnerTileInMapCRS.reproj(inSimpleCRS ? "simple" : 4326).bbox
        );
      }

      // Note that the snapped "inner" tile may extend beyond the original tile,
      // in which case the padding values will be negative.

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

      if (innerTileHeight === 0 || innerTileWidth === 0) {
        if (debugLevel >= 2) log("returning early because the tile will be invisible");
        return;
      }

      if (debugLevel >= 4) {
        const xMinOfInnerTileInMapCRS = extentOfTileInMapCRS.xmin + padding.left * widthOfScreenPixelInMapCRS;
        const yMinOfInnerTileInMapCRS = extentOfTileInMapCRS.ymin + padding.bottom * heightOfScreenPixelInMapCRS;
        const xMaxOfInnerTileInMapCRS = extentOfTileInMapCRS.xmax - padding.right * widthOfScreenPixelInMapCRS;
        const yMaxOfInnerTileInMapCRS = extentOfTileInMapCRS.ymax - padding.top * heightOfScreenPixelInMapCRS;
        log({ xMinOfInnerTileInMapCRS, yMinOfInnerTileInMapCRS, xMaxOfInnerTileInMapCRS, yMaxOfInnerTileInMapCRS });
      }

      const canvasPadding = {
        left: Math.max(padding.left, 0),
        right: Math.max(padding.right, 0),
        top: Math.max(padding.top, 0),
        bottom: Math.max(padding.bottom, 0)
      };
      const canvasHeight = this.tileHeight - canvasPadding.top - canvasPadding.bottom;
      const canvasWidth = this.tileWidth - canvasPadding.left - canvasPadding.right;

      tile.setAttribute("data-extent", extentOfTile.bbox);
      tile.setAttribute("data-zxy", cacheKey);

      // set padding and size of canvas tile
      tile.style.paddingTop = canvasPadding.top + "px";
      tile.style.paddingRight = canvasPadding.right + "px";
      tile.style.paddingBottom = canvasPadding.bottom + "px";
      tile.style.paddingLeft = canvasPadding.left + "px";

      tile.height = canvasHeight;
      tile.style.height = canvasHeight + "px";

      tile.width = canvasWidth;
      tile.style.width = canvasWidth + "px";
      if (debugLevel >= 3) console.log("setting tile height to " + canvasHeight + "px");
      if (debugLevel >= 3) console.log("setting tile width to " + canvasWidth + "px");

      // set how large to display each sample in screen pixels
      const heightOfSampleInScreenPixels = innerTileHeight / numberOfSamplesDown;
      const widthOfSampleInScreenPixels = innerTileWidth / numberOfSamplesAcross;
      if (debugLevel >= 3) console.log("heightOfSampleInScreenPixels:" + heightOfSampleInScreenPixels + "px");
      if (debugLevel >= 3) console.log("widthOfSampleInScreenPixels:" + widthOfSampleInScreenPixels + "px");

      const tileSize = this.getTileSize();

      // this converts tile coordinates (how many tiles down and right)
      // to pixels from left and top of tile pane
      const tileNwPoint = coords.scaleBy(tileSize);
      if (debugLevel >= 4) log({ tileNwPoint });
      const xLeftOfInnerTile = tileNwPoint.x + padding.left;
      const yTopOfInnerTile = tileNwPoint.y + padding.top;
      const innerTileTopLeftPoint = { x: xLeftOfInnerTile, y: yTopOfInnerTile };
      if (debugLevel >= 4) log({ innerTileTopLeftPoint });

      if (timed) log(`pre-processing took ${performance.now() - start_draw_tile}ms`);

      // render asynchronously so tiles show up as they finish instead of all at once (which blocks the UI)
      setTimeout(async () => {
        try {
          const startReadRasters = timed ? performance.now() : 0;
          const stack = await this.stack;
          const { data: tileRasters }: { data: number[][][] } = await stack.read({
            extent: extentOfInnerTileInMapCRS,
            size: [numberOfSamplesAcross, numberOfSamplesDown]
          });
          if (timed)
            console.log(
              `[georaster-layer-for-leaflet] [${cacheKey}] reading rasters took: ${
                performance.now() - startReadRasters
              }ms`
            );
          if (this.options.onReadRasters) {
            this.options.onReadRasters({
              data: tileRasters,
              height: numberOfSamplesDown,
              width: numberOfSamplesAcross
            });
          }

          if (debugLevel >= 3) log("tileRasters:", tileRasters);

          if (this.calcStats) {
            const start_calc_stats = debugLevel >= 1 ? performance.now() : 0;
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
                    if (min === undefined || value < min) {
                      min = value;
                      // invalidate cache because previous tiles used less accurate stats
                      this._cache = { innerTile: {}, tile: {} };
                    }
                    if (max === undefined || value > max) {
                      max = value;
                      // invalidate cache because previous tiles used less accurate stats
                      this._cache = { innerTile: {}, tile: {} };
                      const tiles = this.getActiveTiles();

                      // redraw old tiles
                      tiles.forEach((tile: Tile) => {
                        const { coords, el } = tile;
                        // this.drawTile({ tile: el, coords, context: el.getContext("2d") });
                      });
                      if (debugLevel >= 1) console.log("redrew tiles");
                    }
                  }
                }
              }
              this.currentStats.mins[bandIndex] = min;
              this.currentStats.maxs[bandIndex] = max;
              this.currentStats.ranges[bandIndex] = max - min;
            }
            if (this._dynamic) {
              const rawToRgbFn = (rawToRgb as any).default || rawToRgb;
              try {
                this.rawToRgb = rawToRgbFn({
                  format: "string",
                  flip: this.currentStats.mins.length === 1 ? true : false,
                  ranges: zip(this.currentStats.mins, this.currentStats.maxs),
                  round: true
                });
              } catch (error) {
                console.error("[georaster-layer-for-leaflet] error creating rawToRgb");
              }
            }
            if (timed) log(`updating statistics took ${performance.now() - start_calc_stats}ms`);
          }

          const start_ycbcr = timed ? performance.now() : 0;
          await this.checkIfYCbCr;
          if (timed) log(`checking if YCbCr took ${performance.now() - start_ycbcr}ms`);

          const mask = await Promise.resolve(this.mask);
          const { pixelValuesToColorFn } = this.options;

          // paint the sampled data onto the canvas with and band math expressions applicable
          // note: don't need forward or inverse because tileRasters is already warped to map projection
          // note: we don't need to provide in_bbox and out_bbox because same
          // - the following aren't applicable when drawing on a canvas: out_array_types, out_no_data, out_layout
          // - we don't currently use out_bands and read_bands, but could probably allow users to use that
          // don't need to provide out_pixel_depth because geowarp-canvas takes care of that
          // - taken care of by geowapr-canvas: out_pixel_depth, out_height, out_width, method
          // don't need to do round: true because our pixel-utils expr function takes care of that
          // have to provide in_srs and out_srs in order to support clipping
          const cutline_forward = mask ? this.getProjector(this.mask_srs, map_crs_code).forward : undefined;

          if (this.debugLevel >= 4 && inSimpleCRS === false && mask) {
            try {
              const geojson = await reprojectGeoJSON(mask, { from: this.mask_srs, to: 4326 });
              L.geoJSON(geojson, { style: { color: "#AAA", fillOpacity: 0 } }).addTo(this.getMap());
            } catch (error) {
              console.error(error);
            }
          }

          const theoretical_min = this.calcStats ? fastMin(this.currentStats.mins) : undefined;
          const theoretical_max = this.calcStats ? fastMax(this.currentStats.maxs) : undefined;
          const in_stats = (() => {
            if (this.stats) {
              return zip(this.stats.mins, this.stats.maxs).map(([min, max]) => ({ min, max }));
            } else if (this.calcStats && this.currentStats) {
              return zip(this.currentStats.mins, this.currentStats.maxs).map(([min, max]) => ({ min, max }));
            } else {
              return undefined;
            }
          })();
          const draw = !this.options.customDrawFunction
            ? undefined
            : ({
                // deprecating rasterX and rasterY
                context,
                pixel,
                rect: [x, y, width, height],
                sample: [sampleX, sampleY] = [undefined, undefined]
              }: {
                context: any;
                pixel: number[];
                rect: [number, number, number, number];
                sample: [number, number] | [undefined, undefined] | undefined;
              }): void => {
                this.options.customDrawFunction({
                  values: pixel,
                  context,
                  x,
                  y,
                  width,
                  height,
                  sampleX,
                  sampleY,
                  sampledRaster: tileRasters
                });
              };
          const expr = pixelValuesToColorFn
            ? ({ pixel }: { pixel: number[] }) => pixelValuesToColorFn(pixel)
            : undefined;
          geowarp({
            plugins: ["canvas"], // activate geowarp-canvas plugin
            cutline: mask,
            cutline_forward,
            cutline_strategy: this.mask_strategy,
            cutline_srs: this.mask_srs,
            debug_level: debugLevel - 1,
            in_bbox: extentOfInnerTileInMapCRS.bbox,
            in_data: tileRasters,
            in_height: numberOfSamplesDown,
            in_layout: "[band][row][column]",
            in_srs: map_crs_code,
            in_stats,
            in_width: numberOfSamplesAcross,
            out_bbox: extentOfInnerTileInMapCRS.bbox,
            out_canvas: tile,
            out_resolution: [1, 1],
            out_srs: map_crs_code,
            draw,
            draw_strategy: "canvas",
            method: "near", // this is separate from the resampleMethod that does the actual reprojection
            theoretical_min,
            theoretical_max,
            expr,
            turbo: this.options.turbo ?? false,
            skip_no_data_strategy: true // don't bother trying to render pixels with no data values
          });
          tile.style.visibility = "visible";
        } catch (e: any) {
          console.error(e);
          error = e;
        }

        if (timed)
          console.log(
            `[georaster-layer-for-leaflet] [${cacheKey}] creating tile took ${performance.now() - start_draw_tile}ms`
          );

        done && done(error, tile);
      }, 0);

      // return the tile so it can be rendered on screen
      return tile;
    } catch (error: any) {
      console.error(error);
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
    // console.log("_isValidTile from ", coords)
    const crs = this.getMapCRS();
    const bounds = this.getBounds();

    if (!bounds) {
      return true;
    }

    const { x, y, z } = coords;

    const boundsOfTile = new GeoExtent(this._tileCoordsToBounds(coords));

    if (isSimpleCRS(crs)) {
      // if not within the original confines of the earth return false
      // we don't want wrapping if using Simple CRS
      return this.simpleExtent.overlaps(boundsOfTile);
    }

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

    // check if any raster's extent overlaps the given tile coordinates
    // we check in both the srs of the georaster extents and the tile extent
    // because sometimes reprojection acts weird around world boundaries
    // it's better to try to render empty tiles than miss rendering tiles we should
    if (this.subextents.some((extent: any) => extent.overlaps(boundsOfTile))) {
      return true;
    }

    // width of the globe in tiles at the given zoom level
    const width = Math.pow(2, z);

    // check one world to the left
    const leftCoords = L.point(x - width, y) as Coords;
    leftCoords.z = z;
    const leftBounds = this._tileCoordsToBounds(leftCoords);
    if (this.subextents.some((extent: any) => extent.overlaps(leftBounds))) return true;

    // check one world to the right
    const rightCoords = L.point(x + width, y) as Coords;
    rightCoords.z = z;
    const rightBounds = this._tileCoordsToBounds(rightCoords);
    if (this.subextents.some((extent: any) => extent.overlaps(rightBounds))) return true;

    return false;
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

  isSupportedProjection: function (proj: number | string) {
    return isUTM(proj) || proj in this.proj4.defs || `EPSG:${proj}` in this.proj4.defs;
  },

  initBounds: function (options: GeoRasterLayerOptions) {
    if (!options) options = this.options;

    const maxEasting = Math.max(...this.georasters.map((georaster: any) => georaster.width));
    const maxNorthing = Math.max(...this.georasters.map((georaster: any) => georaster.height));
    const maxValue = Math.max(maxEasting, maxNorthing);
    const aspect_ratio = this.width / this.height;

    // want a little padding, so all tiles appear when fit bounds
    // const maxBounds = Math.round(maxValue * 0.5);
    const maxBounds = maxValue;

    if (!this._bounds) {
      const map_crs = this.getMapCRS();
      if (isSimpleCRS(map_crs)) {
        if (maxEasting === maxNorthing) {
          this._bounds = L.latLngBounds([ORIGIN, [maxBounds, maxBounds]]);
        } else if (maxNorthing > maxEasting) {
          this._bounds = L.latLngBounds([ORIGIN, [maxBounds, maxBounds * aspect_ratio]]);
        } else if (maxEasting > maxNorthing) {
          this._bounds = L.latLngBounds([ORIGIN, [maxBounds / aspect_ratio, maxBounds]]);
        }
      } else if (isDefaultCRS(map_crs)) {
        const bboxes_in_map_crs = this.subextents.map((extent: any) => {
          try {
            return extent.reproj(4326, { quiet: false }).bbox;
          } catch (error) {
            throw "GeoRasterLayer ran into an issue reprojecting.  Try adding the projection definition to your global proj4.";
          }
        });
        const [xmin, ymin, xmax, ymax] = bboxMerge(bboxes_in_map_crs);
        this._bounds = L.latLngBounds([
          [ymin, xmin],
          [ymax, xmax]
        ]);
      } else {
        // set bounds in crs of map
        // maybe need to not rely on GeoExtent.reproj and instead use bbox-fns reproj with getProjector result
        const { code } = map_crs;
        const bboxes_in_map_crs = this.subextents.map((extent: any) => {
          try {
            return extent.reproj(code, { quiet: false }).bbox;
          } catch (error) {
            throw "GeoRasterLayer ran into an issue reprojecting.  Try adding the projection definition to your global proj4.";
          }
        });
        const [xmin, ymin, xmax, ymax] = bboxMerge(bboxes_in_map_crs);
        this._bounds = L.bounds([
          [xmin, ymin],
          [xmax, ymax]
        ]);
      }

      // not sure if/why this is necessary
      options.bounds = this._bounds;

      if (this.debugLevel >= 1) console.log("bounds were intialized to:", this._bounds);
    }
  },

  same(array: GeoRaster[], key: GeoRasterKeys) {
    return new Set(array.map(item => item[key])).size === 1;
  },

  clearCache() {
    this.cache = {};
  },

  _getResolution(zoom: number) {
    const { resolution } = this.options;

    let resolutionValue;
    if (typeof resolution === "object") {
      const zoomLevels = Object.keys(resolution);

      for (const key in zoomLevels) {
        if (Object.prototype.hasOwnProperty.call(zoomLevels, key)) {
          const zoomLvl = parseInt(zoomLevels[key]);
          if (zoomLvl <= zoom) {
            resolutionValue = resolution[zoomLvl];
          } else {
            break;
          }
        }
      }
    } else {
      resolutionValue = resolution;
    }

    return resolutionValue;
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
