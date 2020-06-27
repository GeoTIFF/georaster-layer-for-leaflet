/* global L, proj4 */
const {
  isUTM,
  getProj4String,
} = require('./utils/utm.js');

const chroma = require('chroma-js');

const EPSG4326 = 4326;
const PROJ4_SUPPORTED_PROJECTIONS = new Set([3857, 4269]);
const GeoRasterLayer = L.GridLayer.extend({

  initialize: function (options) {
    try {

      if (options.georasters) {
        this.georasters = options.georasters;
      } else if (options.georaster) {
        this.georasters = [options.georaster];
      } else {
        throw new Error('You must initialize a GeoRasterLayer with a georaster or georasters value');
      }

      /*
          Unpacking values for use later.
          We do this in order to increase speed.
      */
      const keys = ['height', 'width',
        'noDataValue', 'palette',
        'pixelHeight', 'pixelWidth', 'projection', 'sourceType',
        'xmin', 'xmax', 'ymin', 'ymax'];
      if (this.georasters.length > 1) {
        keys.forEach(key => {
          if (this.same(this.georasters, key)) {
            this[key] = this.georasters[0][key];
          } else {
            throw new Error('all GeoRasters must have the same ' + key);
          }
        });
      } else if (this.georasters.length === 1) {
        keys.forEach(key => {
          this[key] = this.georasters[0][key];
        });
      }

      if (this.sourceType === 'url') {
        if (!options.updateWhenIdle) options.updateWhenIdle = false;
        if (!options.updateWhenZooming) options.updateWhenZooming = true;
        if (!options.keepBuffer) options.keepBuffer = 16;
      }

      if (!options.debugLevel) options.debugLevel = 1;
      if (!options.keepBuffer) options.keepBuffer = 25;
      if (!options.resolution) options.resolution = Math.pow(2, 5);
      if (options.updateWhenZooming === undefined) options.updateWhenZooming = false;

      this.debugLevel = options.debugLevel;
      if (this.debugLevel >= 1) console.log('georaster:', options);

      if (this.georasters.every(georaster => typeof georaster.values === 'object')) {
        this.rasters= this.georasters.reduce((result, georaster) => {
          result = result.concat(georaster.values);
          return result;
        }, []);
        if (this.debugLevel > 1) console.log('this.rasters:', this.rasters);
      }

      this.chroma = chroma;
      this.scale = chroma.scale();


      this.initProjector();
      this.initBounds();
      options.bounds = this._bounds;
      L.setOptions(this, options);

      /*
          Caching the constant tile size, so we don't recalculate everytime we
          create a new tile
      */
      const tileSize = this.getTileSize();
      this.tileHeight = tileSize.y;
      this.tileWidth = tileSize.x;

      if (this.georasters.length > 1 && !options.pixelValuesToColorFn) {
        throw 'you must pass in a pixelValuesToColorFn if you are combining rasters';
      }

      if (this.georasters.length === 1 && this.georasters[0].sourceType === 'url' && this.georasters[0].numberOfRasters === 1 && !options.pixelValuesToColorFn) {
        // For COG, we can't determine a data min max for color scaling,
        // so pixelValuesToColorFn is required.
        throw 'pixelValuesToColorFn is a required option for single-band rasters initialized via URL';
      }

    } catch (error) {
      console.error('ERROR initializing GeoTIFFLayer', error);
    }
  },

  getRasters: function (options) {
    const {
      tileNwPoint,
      heightOfSampleInScreenPixels,
      widthOfSampleInScreenPixels,
      coords,
      numberOfSamplesAcross,
      numberOfSamplesDown,
      ymax,
      xmin,
    } = options;
    if (this.debugLevel >= 1) console.log('starting getRasters with options:', options);
    // called if georaster was constructed from URL and we need to get
    // data separately for each tile
    // aka 'COG mode'

    /*
      This function takes in coordinates in the rendered image tile and
      returns the y and x values in the original raster
    */
    const rasterCoordsForTileCoords = (h, w) => {

      const xCenterInMapPixels = tileNwPoint.x + (w + 0.5) * widthOfSampleInScreenPixels;
      const yCenterInMapPixels = tileNwPoint.y + (h + 0.5) * heightOfSampleInScreenPixels;

      const mapPoint = L.point(xCenterInMapPixels, yCenterInMapPixels);
      if (this.debugLevel >= 1) console.log('mapPoint:', mapPoint);

      const { lat, lng } = this._map.unproject(mapPoint, coords.z);

      if (this.projection === EPSG4326) {
        return {
          y: Math.floor( (ymax - lat) / this.pixelHeight),
          x: Math.floor( (lng - xmin) / this.pixelWidth),
        };
      } else if (this.projector) {
        /* source raster doesn't use latitude and longitude,
           so need to reproject point from lat/long to projection of raster
        */
        const [x, y] = this.projector.inverse([lng, lat]);
        if (x === Infinity || y === Infinity) {
          if (this.debugLevel >= 1) console.error('projector converted', [lng, lat], 'to', [x, y]);
        }
        return {
          y: Math.floor( (ymax - y) / this.pixelHeight),
          x: Math.floor( (x - xmin) / this.pixelWidth),
        };
      }
    };

    // careful not to flip min_y/max_y here
    const topLeft = rasterCoordsForTileCoords(0, 0);
    const bottomRight = rasterCoordsForTileCoords(numberOfSamplesDown - 1, numberOfSamplesAcross - 1);

    const getValuesOptions = {
      bottom: bottomRight.y,
      height: numberOfSamplesDown,
      left: topLeft.x,
      right: bottomRight.x,
      top: topLeft.y,
      width: numberOfSamplesAcross,
    };
    if (!Object.values(getValuesOptions).every(isFinite)) {
      console.error('getRasters failed because not all values are finite:', getValuesOptions);
    } else {
      return Promise.all(this.georasters.map(georaster => georaster.getValues(getValuesOptions)))
        .then(valuesByGeoRaster => valuesByGeoRaster.reduce((result, values) => {
          result = result.concat(values);
          return result;
        }, []));
    }
  },

  createTile: function (coords, done) {
    let error;

    // Unpacking values for increased speed
    const { pixelHeight, pixelWidth, rasters, xmin, ymax } = this;
    const rasterHeight = this.height;
    const rasterWidth = this.width;

    // these values are used so we don't try to sample outside of the raster
    const { minLng, maxLng, maxLat, minLat } = this;

    /* This tile is the square piece of the Leaflet map that we draw on */
    const tile = L.DomUtil.create('canvas', 'leaflet-tile');
    tile.height = this.tileHeight;
    tile.width = this.tileWidth;
    const context = tile.getContext('2d');

    const bounds = this._tileCoordsToBounds(coords);

    const minLngOfTile = bounds.getWest();
    const maxLngOfTile = bounds.getEast();
    const minLatOfTile = bounds.getSouth();
    const maxLatOfTile = bounds.getNorth();

    let rasterPixelsAcross, rasterPixelsDown;
    if (this.projection === EPSG4326) {
      // width of the Leaflet tile in number of pixels from original raster
      rasterPixelsAcross = Math.ceil((maxLngOfTile - minLngOfTile) / pixelWidth);
      rasterPixelsDown = Math.ceil((maxLatOfTile - minLatOfTile) / pixelHeight);
    } else if (this.projector) {

      // convert extent of Leaflet tile to projection of the georaster
      const topLeft = this.projector.inverse({ x: minLngOfTile,  y: maxLatOfTile });
      const topRight = this.projector.inverse({ x: maxLngOfTile,y: maxLatOfTile });
      const bottomLeft = this.projector.inverse({ x: minLngOfTile, y: minLatOfTile });
      const bottomRight = this.projector.inverse({ x: maxLngOfTile, y: minLatOfTile });

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

    const map = this._map;
    const tileSize = this.getTileSize();

    // this converts tile coordinates (how many tiles down and right)
    // to pixels from left and top of tile pane
    const tileNwPoint = coords.scaleBy(tileSize);

    // render asynchronously so tiles show up as they finish instead of all at once (which blocks the UI)
    setTimeout(async () => {
      let tileRasters;
      if (!rasters) {
        tileRasters = await this.getRasters({
          tileNwPoint, heightOfSampleInScreenPixels,
          widthOfSampleInScreenPixels, coords, pixelHeight, pixelWidth,
          numberOfSamplesAcross, numberOfSamplesDown, ymax, xmin });
      }

      for (let h = 0; h < numberOfSamplesDown; h++) {
        const yCenterInMapPixels = tileNwPoint.y + (h + 0.5) * heightOfSampleInScreenPixels;
        const latWestPoint = L.point(tileNwPoint.x, yCenterInMapPixels);
        const { lat } = map.unproject(latWestPoint, coords.z);
        if (lat > minLat && lat < maxLat) {
          const yInTilePixels = Math.round(h * heightOfSampleInScreenPixels);
          let yInRasterPixels = this.projection === EPSG4326 ? Math.floor( (maxLat - lat) / pixelHeight ) : null;
          for (let w = 0; w < numberOfSamplesAcross; w++) {
            const latLngPoint = L.point(tileNwPoint.x + (w + 0.5) * widthOfSampleInScreenPixels, yCenterInMapPixels);
            const { lng } = map.unproject(latLngPoint, coords.z);
            if (lng > minLng && lng < maxLng) {
              let xInRasterPixels;
              if (this.projection === EPSG4326) {
                xInRasterPixels = Math.floor( (lng - minLng) / pixelWidth );
              } else if (this.projector) {
                const inverted = this.projector.inverse({ x: lng, y: lat });
                const yInSrc = inverted.y;
                yInRasterPixels = Math.floor( (ymax - yInSrc) / pixelHeight );
                if (yInRasterPixels < 0 || yInRasterPixels >= rasterHeight) continue;

                const xInSrc = inverted.x;
                xInRasterPixels = Math.floor( (xInSrc - xmin) / pixelWidth);
                if (xInRasterPixels < 0 || xInRasterPixels >= rasterWidth) continue;
              }

              let values = null;
              if (tileRasters) {
                // get value from array specific to this tile
                values = tileRasters.map(band => band[h][w]);
              } else if (rasters) {
                // get value from array with data for entire raster
                values = rasters.map(band => {
                  return band[yInRasterPixels][xInRasterPixels];
                });
              } else {
                done('no rasters are available for, so skipping value generation');
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
                this.options.customDrawFunction({ values, context, x, y, width, height });
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

      done(error, tile);
    }, 0);

    // return the tile so it can be rendered on screen
    return tile;
  },

  // method from https://github.com/Leaflet/Leaflet/blob/bb1d94ac7f2716852213dd11563d89855f8d6bb1/src/layer/ImageOverlay.js
  getBounds: function () {
    return this._bounds;
  },

  _isValidTile: function (coords) {
    const crs = this._map.options.crs;

    if (!crs.infinite) {
      // don't load tile if it's out of bounds and not wrapped
      const bounds = this._globalTileRange;
      if ((!crs.wrapLng && (coords.x < bounds.min.x || coords.x > bounds.max.x)) ||
      (!crs.wrapLat && (coords.y < bounds.min.y || coords.y > bounds.max.y))) { return false; }
    }

    if (!this.options.bounds) { return true; }

    const { x, y, z } = coords;

    const layerBounds = L.latLngBounds(this.options.bounds);

    // check given tile coordinates
    if (layerBounds.overlaps(this._tileCoordsToBounds(coords))) return true;

    // width of the globe in tiles at the given zoom level
    const width = Math.pow(2, z);

    // check one world to the left
    const leftCoords = L.point(x - width, y);
    leftCoords.z = z;
    if (layerBounds.overlaps(this._tileCoordsToBounds(leftCoords))) return true;

    // check one world to the right
    const rightCoords = L.point(x + width, y);
    rightCoords.z = z;
    if (layerBounds.overlaps(this._tileCoordsToBounds(rightCoords))) return true;

    return false;
  },

  getColor: function (values) {
    if(this.options.pixelValuesToColorFn) {
      return this.options.pixelValuesToColorFn(values);
    } else {
      const numberOfValues = values.length;
      const haveDataForAllBands = values.every(value => value !== undefined && value !== this.noDataValue);
      if (haveDataForAllBands) {
        if (numberOfValues == 1) {
          const { mins, ranges } = this.georasters[0];
          const value = values[0];
          if (this.palette) {
            const [ r, g, b, a] = this.palette[value];
            return `rgba(${r},${g},${b},${a/255})`;
          } else {
            return this.scale( (values[0] - mins[0]) / ranges[0] ).hex();
          }
        } else if (numberOfValues === 2) {
          return `rgb(${values[0]},${values[1]},0)`;
        } else if (numberOfValues === 3) {
          return `rgb(${values[0]},${values[1]},${values[2]})`;
        } else if (numberOfValues === 4) {
          return `rgba(${values[0]},${values[1]},${values[2]},${values[3]/255})`;
        }
      }
    }
  },

  isSupportedProjection: function (projection) {
    return isUTM(projection) || PROJ4_SUPPORTED_PROJECTIONS.has(projection);
  },

  getProjectionString: function (projection) {
    if (isUTM(projection)) {
      return getProj4String(projection);
    }
    return `EPSG:${projection}`;
  },

  initBounds: function (georaster) {
    const { debugLevel, projection, xmin, xmax, ymin, ymax } = this;
    if (debugLevel >= 1) console.log('this.projection is', projection);
    if (projection === EPSG4326) {
      if (debugLevel >= 1) console.log(`georaster projection is in ${EPSG4326}`);
      const minLatWest = L.latLng(ymin, xmin);
      const maxLatEast = L.latLng(ymax, xmax);
      this._bounds = L.latLngBounds(minLatWest, maxLatEast);
    } else if (this.isSupportedProjection(projection)) {
      if (debugLevel >= 1) console.log('projection is UTM or supported by proj4');
      const bottomLeft = this.projector.forward({ x: xmin, y: ymin });
      const minLatWest = L.latLng(bottomLeft.y, bottomLeft.x);
      const topRight = this.projector.forward({ x: xmax, y: ymax });
      const maxLatEast = L.latLng(topRight.y, topRight.x);
      this._bounds = L.latLngBounds(minLatWest, maxLatEast);
    } else {
      throw `georaster-layer-for-leaflet does not support rasters with the projection ${projection}`;
    }

    // these values are used so we don't try to sample outside of the raster
    this.minLng = this._bounds.getWest();
    this.maxLng = this._bounds.getEast();
    this.maxLat = this._bounds.getNorth();
    this.minLat = this._bounds.getSouth();
  },

  initProjector: function () {
    if (this.isSupportedProjection(this.projection)) {
      if (!proj4) {
        throw 'proj4 must be found in the global scope in order to load a raster that uses a UTM projection';
      }
      this.projector = proj4(this.getProjectionString(this.projection), `EPSG:${EPSG4326}`);
      if (this.debugLevel >= 1) console.log('projector set');
    }
  },

  same (array, key) {
    return new Set(array.map(item => item[key])).size === 1;
  },

});

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = GeoRasterLayer;
}
if (typeof window !== 'undefined') {
  window['GeoRasterLayer'] = GeoRasterLayer;
} else if (typeof self !== 'undefined') {
  self['GeoRasterLayer'] = GeoRasterLayer; // jshint ignore:line
}
