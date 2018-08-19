let chroma = require("chroma-js");

let L = window.L;

var GeoRasterLayer = L.GridLayer.extend({

    initialize: function(options) {
        try {
            console.log("starting GeoRasterLayer.initialize with", options);

            if (!options.keepBuffer) options.keepBuffer = 25;

            if (!options.resolution) options.resolution = Math.pow(2, 5);

            if (options.updateWhenZooming === undefined) options.updateWhenZooming = false;

            let georaster = options.georaster;
            this.georaster = georaster;

            this.scale = chroma.scale();

            /*
                Unpacking values for use later.
                We do this in order to increase speed.
            */
            this._maxs = georaster.maxs;
            this._mins = georaster.mins;
            this._ranges = georaster.ranges;
            this._no_data_value = georaster.no_data_value;
            this._pixelWidth = georaster.pixelWidth;
            this._pixelHeight = georaster.pixelHeight;
            this._rasters = georaster.values;
            this._tiff_width = georaster.width;
            this._xmin = georaster.xmin;
            this._ymin = georaster.ymin;
            this._xmax = georaster.xmax;
            this._ymax = georaster.ymax;

            console.log("georaster.ymin:", georaster.ymin);
            let southWest = L.latLng(georaster.ymin, georaster.xmin);
            let northEast = L.latLng(georaster.ymax, georaster.xmax);
            this._bounds = L.latLngBounds(southWest, northEast);
            console.log("this._bounds:", this._bounds);
            options.bounds = this._bounds;
            L.setOptions(this, options);

            /*
                Caching the constant tile size, so we don't recalculate everytime we
                create a new tile
            */
            let tileSize = this.getTileSize();
            this._tile_height = tileSize.y;
            this._tile_width = tileSize.x;

        } catch (error) {
            console.error("ERROR initializing GeoTIFFLayer", error);
        }
    },

    createTile: function(coords) {

        let debug_level = 0;

        if (debug_level >= 1) {
            var start_time = performance.now();
            var duration_reading_rasters = 0;
            var time_started_reading_rasters;
            var time_started_filling_rect;
            var duration_filling_rects = 0;
        }


        /*
            Unpacking values for use later.
            We do this in order to increase speed.
        */
        let maxs = this._maxs;
        let mins = this._mins;
        let ranges = this._ranges;
        let no_data_value = this._no_data_value;
        let pixelWidth = this._pixelWidth;
        let pixelHeight = this._pixelHeight;
        let rasters = this._rasters;
        let scale = this.scale;
        let tiff_width = this._tiff_width;
        let xmin = this._xmin;
        let ymin = this._ymin;
        let xmax = this._xmax;
        let ymax = this._ymax;

        //if (debug_level >= 1) console.group();

        //if (debug_level >= 1) console.log("starting createTile with coords:", coords);


        // create a <canvas> element for drawing
        let tile = L.DomUtil.create('canvas', 'leaflet-tile');
        tile.height = this._tile_height;
        tile.width = this._tile_width;


        // get a canvas context and draw something on it using coords.x, coords.y and coords.z
        let context = tile.getContext('2d');

        let bounds = this._tileCoordsToBounds(coords);
        //if (debug_level >= 1) console.log("bounds:", bounds);

        let xmin_of_tile = bounds.getWest();
        let xmax_of_tile = bounds.getEast();
        let ymin_of_tile = bounds.getSouth();
        let ymax_of_tile = bounds.getNorth();
        //if (debug_level >= 1) console.log("ymax_of_tile:", ymax_of_tile);

        let resolution = this.options.resolution;

        let number_of_rectangles_across = resolution;
        let number_of_rectangles_down = resolution;

        let height_of_rectangle_in_pixels = this._tile_height / number_of_rectangles_down;
        //if (debug_level >= 1) console.log("height_of_rectangle_in_pixels:", height_of_rectangle_in_pixels);
        let width_of_rectangle_in_pixels = this._tile_width / number_of_rectangles_across;
        //if (debug_level >= 1) console.log("width_of_rectangle:", width_of_rectangle_in_pixels);

        let height_of_rectangle_in_degrees = ( ymax_of_tile - ymin_of_tile ) / number_of_rectangles_down;
        //if (debug_level >= 1) console.log("height_of_rectangle_in_degrees:", height_of_rectangle_in_degrees);
        let width_of_rectangle_in_degrees = ( xmax_of_tile - xmin_of_tile ) / number_of_rectangles_across;
        //if (debug_level >= 1) console.log("width_of_rectangle_in_degrees:", width_of_rectangle_in_degrees);

        //if (debug_level >= 1) console.log("ymax of raster:", ymax);

        let number_of_pixels_per_rectangle = this._tile_width / 8;


        for (let h = 0; h < number_of_rectangles_down; h++) {
            let lat = ymax_of_tile - (h + 0.5) * height_of_rectangle_in_degrees;
            //if (debug_level >= 2) console.log("lat:", lat);
            for (let w = 0; w < number_of_rectangles_across; w++) {
                let lng = xmin_of_tile + (w + 0.5) * width_of_rectangle_in_degrees;
                //if (debug_level >= 2) console.log("lng:", lng);
                if (lat > ymin && lat < ymax && lng > xmin && lng < xmax) {
                    //if (debug_level >= 2) L.circleMarker([lat, lng], {color: "#00FF00"}).bindTooltip(h+","+w).addTo(this._map).openTooltip();
                    let x_in_raster_pixels = Math.floor( (lng - xmin) / pixelWidth );
                    let y_in_raster_pixels = Math.floor( (ymax - lat) / pixelHeight );

                    if (debug_level >= 1) time_started_reading_rasters = performance.now();
                    let values = rasters.map(raster => raster[y_in_raster_pixels][x_in_raster_pixels]);
                    if (debug_level >= 1) duration_reading_rasters += performance.now() - time_started_reading_rasters;
                    let color = null;
                    if(this.options.pixelValueToColorFn) {
                      color = this.options.pixelValueToColorFn(values[0]);
                    } else {
                      let number_of_values = values.length;
                      if (number_of_values == 1) {
                          let value = values[0];
                          if (value != no_data_value) {
                              color = scale( (values[0] - mins[0]) / ranges[0] ).hex();
                          }
                      } else if (number_of_values == 2) {
                      } else if (number_of_values == 3) {
                          if (values[0] != no_data_value) {
                              color = "rgb(" + values[0] + "," + values[1] + "," + values[2] + ")";
                          }
                      }
                    }
                    //let colors = ["red", "green", "blue", "pink", "purple", "orange"];
                    //let color = colors[Math.round(colors.length * Math.random())];
                    //context.fillStyle = this.getColor(color);
                    if (color) {
                        context.fillStyle = color;
                        if (debug_level >= 1) time_started_filling_rect = performance.now();
                        context.fillRect(w * width_of_rectangle_in_pixels, h * height_of_rectangle_in_pixels, width_of_rectangle_in_pixels, height_of_rectangle_in_pixels);
                        if (debug_level >= 1) duration_filling_rects += performance.now() - time_started_filling_rect;
                    }
                    //if (debug_level >= 2) console.log("filling:", [w * width_of_rectangle_in_pixels, h * height_of_rectangle_in_pixels, width_of_rectangle_in_pixels, height_of_rectangle_in_pixels]);
                    //if (debug_level >= 2) console.log("with color:", color);
                    //if (debug_level >= 2) console.log("with context:", context);
                } else {
                    //if (debug_level >= 2) L.circleMarker([lat, lng], {color: "#FF0000"}).bindTooltip(h+","+w).addTo(this._map).openTooltip();
                }
            }
        }


        if (debug_level >= 1) {
            let duration = performance.now() - start_time;
            console.log("creating tile took ", duration, "milliseconds");
            console.log("took", duration_reading_rasters, "milliseconds to read rasters, which is ", Math.round(duration_reading_rasters / duration * 100), "percentage of the total time");
            console.log("took", duration_filling_rects, "milliseconds to fill rects, which is ", Math.round(duration_filling_rects / duration * 100), "percentage of the total time");
        }
        //if (debug_level >= 1) console.groupEnd();

        // return the tile so it can be rendered on screen
        return tile;
    },

    // method from https://github.com/Leaflet/Leaflet/blob/bb1d94ac7f2716852213dd11563d89855f8d6bb1/src/layer/ImageOverlay.js
    getBounds: function () {
        return this._bounds;
    },

    getColor(name) {
        let d = document.createElement("div");
        d.style.color = name;
        document.body.appendChild(d)
        return window.getComputedStyle(d).color
    }

});

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
  module.exports = GeoRasterLayer;
}
if (typeof window !== "undefined") {
  window["GeoRasterLayer"] = GeoRasterLayer;
} else if (typeof self !== "undefined") {
  self["GeoRasterLayer"] = GeoRasterLayer; // jshint ignore:line
}
