"use strict";

require("regenerator-runtime/runtime");

var _chromaJs = _interopRequireDefault(require("chroma-js"));

var _isUTM = _interopRequireDefault(require("utm-utils/src/isUTM"));

var _getProjString = _interopRequireDefault(require("utm-utils/src/getProjString"));

var proj4 = _interopRequireWildcard(require("proj4"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function _getRequireWildcardCache() { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

function _iterableToArrayLimit(arr, i) { if (typeof Symbol === "undefined" || !(Symbol.iterator in Object(arr))) return; var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

var EPSG4326 = 4326;
var PROJ4_SUPPORTED_PROJECTIONS = new Set([3857, 4269]);
var GeoRasterLayer = L.GridLayer.extend({
  initialize: function initialize(options) {
    var _this = this;

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


      var keys = ['height', 'width', 'noDataValue', 'palette', 'pixelHeight', 'pixelWidth', 'projection', 'sourceType', 'xmin', 'xmax', 'ymin', 'ymax'];

      if (this.georasters.length > 1) {
        keys.forEach(function (key) {
          if (_this.same(_this.georasters, key)) {
            _this[key] = _this.georasters[0][key];
          } else {
            throw new Error('all GeoRasters must have the same ' + key);
          }
        });
      } else if (this.georasters.length === 1) {
        keys.forEach(function (key) {
          _this[key] = _this.georasters[0][key];
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

      if (this.georasters.every(function (georaster) {
        return _typeof(georaster.values) === 'object';
      })) {
        this.rasters = this.georasters.reduce(function (result, georaster) {
          result = result.concat(georaster.values);
          return result;
        }, []);
        if (this.debugLevel > 1) console.log('this.rasters:', this.rasters);
      }

      this.chroma = _chromaJs.default;
      this.scale = _chromaJs.default.scale();
      this.initProjector();
      this.initBounds();
      options.bounds = this._bounds;
      L.setOptions(this, options);
      /*
          Caching the constant tile size, so we don't recalculate everytime we
          create a new tile
      */

      var tileSize = this.getTileSize();
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
  getRasters: function getRasters(options) {
    var _this2 = this;

    var tileNwPoint = options.tileNwPoint,
        heightOfSampleInScreenPixels = options.heightOfSampleInScreenPixels,
        widthOfSampleInScreenPixels = options.widthOfSampleInScreenPixels,
        coords = options.coords,
        numberOfSamplesAcross = options.numberOfSamplesAcross,
        numberOfSamplesDown = options.numberOfSamplesDown,
        ymax = options.ymax,
        xmin = options.xmin;
    if (this.debugLevel >= 1) console.log('starting getRasters with options:', options); // called if georaster was constructed from URL and we need to get
    // data separately for each tile
    // aka 'COG mode'

    /*
      This function takes in coordinates in the rendered image tile and
      returns the y and x values in the original raster
    */

    var rasterCoordsForTileCoords = function rasterCoordsForTileCoords(h, w) {
      var xCenterInMapPixels = tileNwPoint.x + (w + 0.5) * widthOfSampleInScreenPixels;
      var yCenterInMapPixels = tileNwPoint.y + (h + 0.5) * heightOfSampleInScreenPixels;
      var mapPoint = L.point(xCenterInMapPixels, yCenterInMapPixels);
      if (_this2.debugLevel >= 1) console.log('mapPoint:', mapPoint);

      var _this2$_map$unproject = _this2._map.unproject(mapPoint, coords.z),
          lat = _this2$_map$unproject.lat,
          lng = _this2$_map$unproject.lng;

      if (_this2.projection === EPSG4326) {
        return {
          y: Math.floor((ymax - lat) / _this2.pixelHeight),
          x: Math.floor((lng - xmin) / _this2.pixelWidth)
        };
      } else if (_this2.projector) {
        /* source raster doesn't use latitude and longitude,
           so need to reproject point from lat/long to projection of raster
        */
        var _this2$projector$inve = _this2.projector.inverse([lng, lat]),
            _this2$projector$inve2 = _slicedToArray(_this2$projector$inve, 2),
            x = _this2$projector$inve2[0],
            y = _this2$projector$inve2[1];

        if (x === Infinity || y === Infinity) {
          if (_this2.debugLevel >= 1) console.error('projector converted', [lng, lat], 'to', [x, y]);
        }

        return {
          y: Math.floor((ymax - y) / _this2.pixelHeight),
          x: Math.floor((x - xmin) / _this2.pixelWidth)
        };
      }
    }; // careful not to flip min_y/max_y here


    var topLeft = rasterCoordsForTileCoords(0, 0);
    var bottomRight = rasterCoordsForTileCoords(numberOfSamplesDown - 1, numberOfSamplesAcross - 1);
    var getValuesOptions = {
      bottom: bottomRight.y,
      height: numberOfSamplesDown,
      left: topLeft.x,
      right: bottomRight.x,
      top: topLeft.y,
      width: numberOfSamplesAcross
    };

    if (!Object.values(getValuesOptions).every(isFinite)) {
      console.error('getRasters failed because not all values are finite:', getValuesOptions);
    } else {
      return Promise.all(this.georasters.map(function (georaster) {
        return georaster.getValues(getValuesOptions);
      })).then(function (valuesByGeoRaster) {
        return valuesByGeoRaster.reduce(function (result, values) {
          result = result.concat(values);
          return result;
        }, []);
      });
    }
  },
  createTile: function createTile(coords, done) {
    var _this3 = this;

    var error; // Unpacking values for increased speed

    var pixelHeight = this.pixelHeight,
        pixelWidth = this.pixelWidth,
        rasters = this.rasters,
        xmin = this.xmin,
        ymax = this.ymax;
    var rasterHeight = this.height;
    var rasterWidth = this.width; // these values are used so we don't try to sample outside of the raster

    var minLng = this.minLng,
        maxLng = this.maxLng,
        maxLat = this.maxLat,
        minLat = this.minLat;
    /* This tile is the square piece of the Leaflet map that we draw on */

    var tile = L.DomUtil.create('canvas', 'leaflet-tile');
    tile.height = this.tileHeight;
    tile.width = this.tileWidth;
    var context = tile.getContext('2d');

    var bounds = this._tileCoordsToBounds(coords);

    var minLngOfTile = bounds.getWest();
    var maxLngOfTile = bounds.getEast();
    var minLatOfTile = bounds.getSouth();
    var maxLatOfTile = bounds.getNorth();
    var rasterPixelsAcross, rasterPixelsDown;

    if (this.projection === EPSG4326) {
      // width of the Leaflet tile in number of pixels from original raster
      rasterPixelsAcross = Math.ceil((maxLngOfTile - minLngOfTile) / pixelWidth);
      rasterPixelsDown = Math.ceil((maxLatOfTile - minLatOfTile) / pixelHeight);
    } else if (this.projector) {
      // convert extent of Leaflet tile to projection of the georaster
      var topLeft = this.projector.inverse({
        x: minLngOfTile,
        y: maxLatOfTile
      });
      var topRight = this.projector.inverse({
        x: maxLngOfTile,
        y: maxLatOfTile
      });
      var bottomLeft = this.projector.inverse({
        x: minLngOfTile,
        y: minLatOfTile
      });
      var bottomRight = this.projector.inverse({
        x: maxLngOfTile,
        y: minLatOfTile
      });
      rasterPixelsAcross = Math.ceil(Math.max(topRight.x - topLeft.x, bottomRight.x - bottomLeft.x) / pixelWidth);
      rasterPixelsDown = Math.ceil(Math.max(topLeft.y - bottomLeft.y, topRight.y - bottomRight.y) / pixelHeight);
    }

    var resolution = this.options.resolution; // prevent sampling more times than number of pixels to display

    var numberOfSamplesAcross = Math.min(resolution, rasterPixelsAcross);
    var numberOfSamplesDown = Math.min(resolution, rasterPixelsDown); // set how large to display each sample in screen pixels

    var heightOfSampleInScreenPixels = this.tileHeight / numberOfSamplesDown;
    var heightOfSampleInScreenPixelsInt = Math.ceil(heightOfSampleInScreenPixels);
    var widthOfSampleInScreenPixels = this.tileWidth / numberOfSamplesAcross;
    var widthOfSampleInScreenPixelsInt = Math.ceil(widthOfSampleInScreenPixels);
    var map = this._map;
    var tileSize = this.getTileSize(); // this converts tile coordinates (how many tiles down and right)
    // to pixels from left and top of tile pane

    var tileNwPoint = coords.scaleBy(tileSize); // render asynchronously so tiles show up as they finish instead of all at once (which blocks the UI)

    setTimeout( /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee() {
      var tileRasters, _loop, h, _ret;

      return regeneratorRuntime.wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              if (rasters) {
                _context.next = 4;
                break;
              }

              _context.next = 3;
              return _this3.getRasters({
                tileNwPoint: tileNwPoint,
                heightOfSampleInScreenPixels: heightOfSampleInScreenPixels,
                widthOfSampleInScreenPixels: widthOfSampleInScreenPixels,
                coords: coords,
                pixelHeight: pixelHeight,
                pixelWidth: pixelWidth,
                numberOfSamplesAcross: numberOfSamplesAcross,
                numberOfSamplesDown: numberOfSamplesDown,
                ymax: ymax,
                xmin: xmin
              });

            case 3:
              tileRasters = _context.sent;

            case 4:
              _loop = function _loop(h) {
                var yCenterInMapPixels = tileNwPoint.y + (h + 0.5) * heightOfSampleInScreenPixels;
                var latWestPoint = L.point(tileNwPoint.x, yCenterInMapPixels);

                var _map$unproject = map.unproject(latWestPoint, coords.z),
                    lat = _map$unproject.lat;

                if (lat > minLat && lat < maxLat) {
                  var _ret2 = function () {
                    var yInTilePixels = Math.round(h * heightOfSampleInScreenPixels);
                    var yInRasterPixels = _this3.projection === EPSG4326 ? Math.floor((maxLat - lat) / pixelHeight) : null;

                    var _loop2 = function _loop2(w) {
                      var latLngPoint = L.point(tileNwPoint.x + (w + 0.5) * widthOfSampleInScreenPixels, yCenterInMapPixels);

                      var _map$unproject2 = map.unproject(latLngPoint, coords.z),
                          lng = _map$unproject2.lng;

                      if (lng > minLng && lng < maxLng) {
                        var xInRasterPixels;

                        if (_this3.projection === EPSG4326) {
                          xInRasterPixels = Math.floor((lng - minLng) / pixelWidth);
                        } else if (_this3.projector) {
                          var inverted = _this3.projector.inverse({
                            x: lng,
                            y: lat
                          });

                          var yInSrc = inverted.y;
                          yInRasterPixels = Math.floor((ymax - yInSrc) / pixelHeight);
                          if (yInRasterPixels < 0 || yInRasterPixels >= rasterHeight) return "continue";
                          var xInSrc = inverted.x;
                          xInRasterPixels = Math.floor((xInSrc - xmin) / pixelWidth);
                          if (xInRasterPixels < 0 || xInRasterPixels >= rasterWidth) return "continue";
                        }

                        var values = null;

                        if (tileRasters) {
                          // get value from array specific to this tile
                          values = tileRasters.map(function (band) {
                            return band[h][w];
                          });
                        } else if (rasters) {
                          // get value from array with data for entire raster
                          values = rasters.map(function (band) {
                            return band[yInRasterPixels][xInRasterPixels];
                          });
                        } else {
                          done('no rasters are available for, so skipping value generation');
                          return {
                            v: {
                              v: {
                                v: void 0
                              }
                            }
                          };
                        } // x-axis coordinate of the starting point of the rectangle representing the raster pixel


                        var x = Math.round(w * widthOfSampleInScreenPixels); // y-axis coordinate of the starting point of the rectangle representing the raster pixel

                        var y = yInTilePixels; // how many real screen pixels does a pixel of the sampled raster take up

                        var width = widthOfSampleInScreenPixelsInt;
                        var height = heightOfSampleInScreenPixelsInt;

                        if (_this3.options.customDrawFunction) {
                          _this3.options.customDrawFunction({
                            values: values,
                            context: context,
                            x: x,
                            y: y,
                            width: width,
                            height: height,
                            rasterX: xInRasterPixels,
                            rasterY: yInRasterPixels,
                            sampleX: w,
                            sampleY: h,
                            sampledRaster: tileRasters
                          });
                        } else {
                          var color = _this3.getColor(values);

                          if (color) {
                            context.fillStyle = color;
                            context.fillRect(x, y, width, height);
                          }
                        }
                      }
                    };

                    for (var w = 0; w < numberOfSamplesAcross; w++) {
                      var _ret3 = _loop2(w);

                      if (_ret3 === "continue") continue;
                      if (_typeof(_ret3) === "object") return _ret3.v;
                    }
                  }();

                  if (_typeof(_ret2) === "object") return _ret2.v;
                }
              };

              h = 0;

            case 6:
              if (!(h < numberOfSamplesDown)) {
                _context.next = 13;
                break;
              }

              _ret = _loop(h);

              if (!(_typeof(_ret) === "object")) {
                _context.next = 10;
                break;
              }

              return _context.abrupt("return", _ret.v);

            case 10:
              h++;
              _context.next = 6;
              break;

            case 13:
              done(error, tile);

            case 14:
            case "end":
              return _context.stop();
          }
        }
      }, _callee);
    })), 0); // return the tile so it can be rendered on screen

    return tile;
  },
  // method from https://github.com/Leaflet/Leaflet/blob/bb1d94ac7f2716852213dd11563d89855f8d6bb1/src/layer/ImageOverlay.js
  getBounds: function getBounds() {
    return this._bounds;
  },
  _isValidTile: function _isValidTile(coords) {
    var crs = this._map.options.crs;

    if (!crs.infinite) {
      // don't load tile if it's out of bounds and not wrapped
      var bounds = this._globalTileRange;

      if (!crs.wrapLng && (coords.x < bounds.min.x || coords.x > bounds.max.x) || !crs.wrapLat && (coords.y < bounds.min.y || coords.y > bounds.max.y)) {
        return false;
      }
    }

    if (!this.options.bounds) {
      return true;
    }

    var x = coords.x,
        y = coords.y,
        z = coords.z;
    var layerBounds = L.latLngBounds(this.options.bounds); // check given tile coordinates

    if (layerBounds.overlaps(this._tileCoordsToBounds(coords))) return true; // width of the globe in tiles at the given zoom level

    var width = Math.pow(2, z); // check one world to the left

    var leftCoords = L.point(x - width, y);
    leftCoords.z = z;
    if (layerBounds.overlaps(this._tileCoordsToBounds(leftCoords))) return true; // check one world to the right

    var rightCoords = L.point(x + width, y);
    rightCoords.z = z;
    if (layerBounds.overlaps(this._tileCoordsToBounds(rightCoords))) return true;
    return false;
  },
  getColor: function getColor(values) {
    var _this4 = this;

    if (this.options.pixelValuesToColorFn) {
      return this.options.pixelValuesToColorFn(values);
    } else {
      var numberOfValues = values.length;
      var haveDataForAllBands = values.every(function (value) {
        return value !== undefined && value !== _this4.noDataValue;
      });

      if (haveDataForAllBands) {
        if (numberOfValues == 1) {
          var _this$georasters$ = this.georasters[0],
              mins = _this$georasters$.mins,
              ranges = _this$georasters$.ranges;
          var value = values[0];

          if (this.palette) {
            var _this$palette$value = _slicedToArray(this.palette[value], 4),
                r = _this$palette$value[0],
                g = _this$palette$value[1],
                b = _this$palette$value[2],
                a = _this$palette$value[3];

            return "rgba(".concat(r, ",").concat(g, ",").concat(b, ",").concat(a / 255, ")");
          } else {
            return this.scale((values[0] - mins[0]) / ranges[0]).hex();
          }
        } else if (numberOfValues === 2) {
          return "rgb(".concat(values[0], ",").concat(values[1], ",0)");
        } else if (numberOfValues === 3) {
          return "rgb(".concat(values[0], ",").concat(values[1], ",").concat(values[2], ")");
        } else if (numberOfValues === 4) {
          return "rgba(".concat(values[0], ",").concat(values[1], ",").concat(values[2], ",").concat(values[3] / 255, ")");
        }
      }
    }
  },
  isSupportedProjection: function isSupportedProjection(projection) {
    return (0, _isUTM.default)(projection) || PROJ4_SUPPORTED_PROJECTIONS.has(projection);
  },
  getProjectionString: function getProjectionString(projection) {
    if ((0, _isUTM.default)(projection)) {
      return (0, _getProjString.default)(projection);
    }

    return "EPSG:".concat(projection);
  },
  initBounds: function initBounds(georaster) {
    var debugLevel = this.debugLevel,
        projection = this.projection,
        xmin = this.xmin,
        xmax = this.xmax,
        ymin = this.ymin,
        ymax = this.ymax;
    if (debugLevel >= 1) console.log('this.projection is', projection);

    if (projection === EPSG4326) {
      if (debugLevel >= 1) console.log("georaster projection is in ".concat(EPSG4326));
      var minLatWest = L.latLng(ymin, xmin);
      var maxLatEast = L.latLng(ymax, xmax);
      this._bounds = L.latLngBounds(minLatWest, maxLatEast);
    } else if (this.isSupportedProjection(projection)) {
      if (debugLevel >= 1) console.log('projection is UTM or supported by proj4');
      var bottomLeft = this.projector.forward({
        x: xmin,
        y: ymin
      });

      var _minLatWest = L.latLng(bottomLeft.y, bottomLeft.x);

      var topRight = this.projector.forward({
        x: xmax,
        y: ymax
      });

      var _maxLatEast = L.latLng(topRight.y, topRight.x);

      this._bounds = L.latLngBounds(_minLatWest, _maxLatEast);
    } else {
      throw "georaster-layer-for-leaflet does not support rasters with the projection ".concat(projection);
    } // these values are used so we don't try to sample outside of the raster


    this.minLng = this._bounds.getWest();
    this.maxLng = this._bounds.getEast();
    this.maxLat = this._bounds.getNorth();
    this.minLat = this._bounds.getSouth();
  },
  initProjector: function initProjector() {
    if (this.isSupportedProjection(this.projection)) {
      if (!proj4) {
        throw 'proj4 must be found in the global scope in order to load a raster that uses a UTM projection';
      }

      this.projector = proj4(this.getProjectionString(this.projection), "EPSG:".concat(EPSG4326));
      if (this.debugLevel >= 1) console.log('projector set');
    }
  },
  same: function same(array, key) {
    return new Set(array.map(function (item) {
      return item[key];
    })).size === 1;
  }
});

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = GeoRasterLayer;
}

if (typeof window !== 'undefined') {
  window['GeoRasterLayer'] = GeoRasterLayer;
} else if (typeof self !== 'undefined') {
  self['GeoRasterLayer'] = GeoRasterLayer; // jshint ignore:line
}
