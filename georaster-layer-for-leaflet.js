/* global L, proj4 */
const {
  isUTM,
  getProj4String,
} = require('./utils/utm.js');

const chroma = require('chroma-js');

const GeoRasterLayer = L.GridLayer.extend({

  initialize: function (options) {
    try {

      if (!options.debugLevel) options.debugLevel = 1;
      if (!options.keepBuffer) options.keepBuffer = 25;
      if (!options.resolution) options.resolution = Math.pow(2, 5);
      if (options.updateWhenZooming === undefined) options.updateWhenZooming = false;

      this.debugLevel = options.debugLevel;
      if (this.debugLevel >= 1) console.log('georaster:', options);

      const georaster = options.georaster;
      this.georaster = georaster;
      this.scale = chroma.scale();

      /*
          Unpacking values for use later.
          We do this in order to increase speed.
      */
      this.rasters = georaster.values;
      this.projection = georaster.projection;

      this.initProjector(georaster);
      this.initBounds(georaster);
      options.bounds = this._bounds;
      L.setOptions(this, options);

      /*
          Caching the constant tile size, so we don't recalculate everytime we
          create a new tile
      */
      const tileSize = this.getTileSize();
      this._tileHeight = tileSize.y;
      this._tileWidth = tileSize.x;

      if (georaster.sourceType === 'url' && georaster.numberOfRasters === 1 && !options.pixelValuesToColorFn) {
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
    console.log('starting getRasters with options:', options);
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
      console.log('mapPoint:', mapPoint);

      const { lat, lng } = this._map.unproject(mapPoint, coords.z);

      if (this.projection === 4326) {
        return {
          y: Math.floor( (ymax - lat) / this._pixelHeight),
          x: Math.floor( (lng - xmin) / this._pixelWidth ),
        };
      } else if (this.projector) {
        /* source raster doesn't use latitude and longitude,
           so need to reproject point from lat/long to projection of raster
        */
        const [x, y] = this.projector.inverse([lng, lat]);
        return {
          y: Math.floor( (ymax - y) / this._pixelHeight),
          x: Math.floor( (x - xmin) / this._pixelWidth),
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
    console.log('getValuesOptions:', getValuesOptions);
    return this.georaster.getValues(getValuesOptions);
  },

  createTile: function (coords, done) {
    let error;

    // Unpacking values for increased speed
    const georaster = this.georaster;
    const { pixelHeight,  pixelWidth } = georaster;
    const { xmin, ymax } = georaster;
    const { rasters } = this;

    // these values are used so we don't try to sample outside of the raster
    const minLng = this._bounds.getWest();
    const maxLng = this._bounds.getEast();
    const maxLat = this._bounds.getNorth();
    const minLat = this._bounds.getSouth();

    /* This tile is the square piece of the Leaflet map that we draw on */
    const tile = L.DomUtil.create('canvas', 'leaflet-tile');
    tile.height = this._tileHeight;
    tile.width = this._tileWidth;
    const context = tile.getContext('2d');

    const bounds = this._tileCoordsToBounds(coords);

    const minLngOfTile = bounds.getWest();
    const maxLngOfTile = bounds.getEast();
    const minLatOfTile = bounds.getSouth();
    const maxLatOfTile = bounds.getNorth();

    let rasterPixelsAcross, rasterPixelsDown;
    if (this.projection === 4326) {
      // width of the Leaflet tile in number of pixels from original raster
      rasterPixelsAcross = Math.ceil((maxLngOfTile - minLngOfTile) / pixelWidth);
      rasterPixelsDown = Math.ceil((maxLatOfTile - minLatOfTile) / pixelHeight);
    } else if (this.projector) {

      // convert extent of Leaflet tile to projection of the georaster
      const topLeft = this.projector.inverse({ x: minLngOfTile,y: maxLatOfTile });
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
    const heightOfSampleInScreenPixels = this._tileHeight / numberOfSamplesDown;
    const heightOfSampleInScreenPixelsInt = Math.ceil(heightOfSampleInScreenPixels);
    const widthOfSampleInScreenPixels = this._tileWidth / numberOfSamplesAcross;
    const widthOfSampleInScreenPixelsInt = Math.ceil(widthOfSampleInScreenPixels);

    const map = this._map;
    const tileSize = this.getTileSize();

    // this converts tile coordinates (how many tiles down and right)
    // to pixels from left and top of tile pane
    const tileNwPoint = coords.scaleBy(tileSize);

    // render asynchronously so tiles show up as they finish instead of all at once (which blocks the UI)
    setTimeout(async () => {
      const tileRasters = null;
      if (!rasters) {
        throw 'Sorry. Cloud Optimized GeoTIFFs are not yet supported';
        /*
        tileRasters = await this.getRasters({
          tileNwPoint, heightOfSampleInScreenPixels,
          widthOfSampleInScreenPixels, coords, pixelHeight, pixelWidth,
          numberOfSamplesAcross, numberOfSamplesDown, ymax, xmin});
        */
      }

      for (let h = 0; h < numberOfSamplesDown; h++) {
        const yCenterInMapPixels = tileNwPoint.y + (h + 0.5) * heightOfSampleInScreenPixels;
        const latWestPoint = L.point(tileNwPoint.x, yCenterInMapPixels);
        const { lat } = map.unproject(latWestPoint, coords.z);
        if (lat > minLat && lat < maxLat) {
          const yInTilePixels = Math.round(h * heightOfSampleInScreenPixels);
          let yInRasterPixels = this.projection === 4326 ? Math.floor( (maxLat - lat) / pixelHeight ) : null;
          for (let w = 0; w < numberOfSamplesAcross; w++) {
            const latLngPoint = L.point(tileNwPoint.x + (w + 0.5) * widthOfSampleInScreenPixels, yCenterInMapPixels);
            const { lng } = map.unproject(latLngPoint, coords.z);
            if (lng > minLng && lng < maxLng) {
              let xInRasterPixels;
              if (this.projection === 4326) {
                xInRasterPixels = Math.floor( (lng - minLng) / pixelWidth );
              } else if (this.projector) {
                const inverted = this.projector.inverse({ x: lng, y: lat });
                const xInSrc = inverted.x;
                const yInSrc = inverted.y;
                yInRasterPixels = Math.floor( (ymax - yInSrc) / pixelHeight );
                xInRasterPixels = Math.floor( (xInSrc - xmin) / pixelWidth);
              }

              let values = null;
              if (tileRasters) {
                // get value from array specific to this tile
                values = tileRasters.map(raster => raster[h][w]);
              } else {
                // get value from array with data for entire raster
                values = rasters.map(raster => raster[yInRasterPixels][xInRasterPixels]);
              }
              const color = this.getColor(values);
              if (color) {
                context.fillStyle = color;
                context.fillRect(Math.round(w * widthOfSampleInScreenPixels), yInTilePixels, widthOfSampleInScreenPixelsInt, heightOfSampleInScreenPixelsInt);
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

  getColor: function (values) {
    if(this.options.pixelValuesToColorFn) {
      return this.options.pixelValuesToColorFn(values);
    } else {
      const { mins, noDataValue, ranges } = this.georaster;
      const numberOfValues = values.length;
      const haveDataForAllBands = values.every(value => value !== undefined && value !== noDataValue);
      if (haveDataForAllBands) {
        if (numberOfValues == 1) {
          return this.scale( (values[0] - mins[0]) / ranges[0] ).hex();
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

  initBounds: function (georaster) {
    const { projection, xmin, xmax, ymin, ymax } = georaster;
    if (this.debugLevel >= 1) console.log('georaster projection is', projection);
    if (projection === 4326) {
      if (this.debugLevel >= 1) console.log('georaster projection is in 4326');
      const minLatWest = L.latLng(ymin, xmin);
      const maxLatEast = L.latLng(ymax, xmax);
      this._bounds = L.latLngBounds(minLatWest, maxLatEast);
    } else if (isUTM(projection)){
      if (this.debugLevel >= 1) console.log('georaster projection is UTM');
      const bottomLeft = this.projector.forward({ x: xmin, y: ymin });
      const minLatWest = L.latLng(bottomLeft.y, bottomLeft.x);
      const topRight = this.projector.forward({ x: xmax, y: ymax });
      const maxLatEast = L.latLng(topRight.y, topRight.x);
      this._bounds = L.latLngBounds(minLatWest, maxLatEast);
    } else {
      throw 'georaster-layer-for-leaflet does not support rasters with the current georaster\'s projection';
    }
  },

  initProjector: function (georaster) {
    const { projection } = georaster;
    if (isUTM(projection)) {
      if (!proj4) {
        throw 'proj4 must be found in the global scope in order to load a raster that uses a UTM projection';
      }
      this.projector = proj4(getProj4String(georaster.projection), 'EPSG:4326');
      if (this.debugLevel >= 1) console.log('projector set');
    }
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
