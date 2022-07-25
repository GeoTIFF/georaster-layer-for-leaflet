🇺🇦 "Leaflet was created 11 years ago by Vladimir Agafonkin, an Ukrainian citizen living in Kyiv." - ([LeafletJS](https://leafletjs.com/))

--------------------------------------------------------------------------------

# georaster-layer-for-leaflet

Display GeoTIFFs and soon other types of rasters on your Leaflet Map

## Install

```bash
npm install georaster-layer-for-leaflet
```

## GeoRaster Prerequisite

GeoRasterLayer requires that input be first converted into GeoRaster format.
You can install GeoRaster with the following command:

```bash
npm install georaster
```

## Load Package via Script Tag

```html
<script src="https://unpkg.com/georaster-layer-for-leaflet/dist/georaster-layer-for-leaflet.min.js">
```

## Usage

```javascript
new GeoRasterLayer({ georaster }).addTo(map);
```

## Demos

- <https://geotiff.github.io/georaster-layer-for-leaflet-example/>
- <https://geotiff.github.io/georaster-layer-for-leaflet-example/examples/load-file.html>
- More Here: <https://github.com/GeoTIFF/georaster-layer-for-leaflet-example>

## Why

- Support for nearly all projections, thanks to [proj4-fully-loaded](https://github.com/danieljdufour/proj4-fully-loaded) and [epsg.io](https://epsg.io/)
- Super faster rendering thanks to a simple nearest neighbor interpolation
- Use of web workers means seamless integration that doesn't block main thread
- Loads large geotiffs greater than a hundred megabytes
- Supports custom rendering including custom colors, directional arrows, and context drawing
- Doesn't depend on WebGL
- Mask data inside or outside a given geometry

## The GeoRasterLayer Class

A custom class for rendering GeoTIFF's (including COG's) on a leaflet map. The layer extends L.GridLayer, see the [docs](https://leafletjs.com/reference-1.7.1.html#gridlayer) for inherited options and methods.

### Usage Example

Source Code: <https://github.com/GeoTIFF/georaster-layer-for-leaflet-example/blob/master/main.js>

```javascript
var parse_georaster = require("georaster");

var GeoRasterLayer = require("georaster-layer-for-leaflet");

// initalize leaflet map
var map = L.map('map').setView([0, 0], 5);

// add OpenStreetMap basemap
L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

var url_to_geotiff_file = "example_4326.tif";

fetch(url_to_geotiff_file)
  .then(response => response.arrayBuffer())
  .then(arrayBuffer => {
    parse_georaster(arrayBuffer).then(georaster => {
      console.log("georaster:", georaster);

      /*
          GeoRasterLayer is an extension of GridLayer,
          which means can use GridLayer options like opacity.

          Just make sure to include the georaster option!

          Optionally set the pixelValuesToColorFn function option to customize
          how values for a pixel are translated to a color.

          http://leafletjs.com/reference-1.2.0.html#gridlayer
      */
      var layer = new GeoRasterLayer({
          georaster: georaster,
          opacity: 0.7,
          pixelValuesToColorFn: values => values[0] === 42 ? '#ffffff' : '#000000',
          resolution: 64 // optional parameter for adjusting display resolution
      });
      layer.addTo(map);

      map.fitBounds(layer.getBounds());

  });
});
```

<!-- ## Options -->
<!-- todo: add a table of options for GeoRasterLayer -->

### Methods

| Method                                      | Returns | Description                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| updateColors(pixelValuesToColorFn, options) | this    | Causes the tiles to redraw without clearing them first. It uses the updated `pixelValuesToColorFn` function. You can set a debugLevel specific to this function by passing in an options object with a debugLevel property.  For example, you can turn on the console debugs for this method by setting `debugLevel = 1` in the options (even if you created the layer with `debugLevel = 0`). |

## Advanced Capabilities

Please read about our advanced capabilities including custom context drawing functions, displaying directional arrows, and masking in [ADVANCED.md](ADVANCED.md).

## More Questions

Check out our [Frequently Asked Questions](FAQs.md)

## Videos
- [Edge Compute: Cool Stuff You Can Do With COGs in the Browser](https://www.youtube.com/watch?v=XTkNhGpfmB8&t=4190s)
- [2019 - Algorithm Walk-through: How to Visualize a Large GeoTIFF on Your Web Map](https://www.youtube.com/watch?v=K47JvCL99w0)

## Support

Contact the package author, Daniel J. Dufour, at daniel.j.dufour@gmail.com
