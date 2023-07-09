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

A custom class for rendering GeoTIFF's (including COG's) on a leaflet map. The layer extends L.GridLayer, see the [docs](https://leafletjs.com/reference.html#gridlayer) for inherited options and methods.

### Usage Example

Source Code: <https://github.com/GeoTIFF/georaster-layer-for-leaflet-example/blob/master/main.js>

```javascript
var parse_georaster = require("georaster");

var GeoRasterLayer = require("georaster-layer-for-leaflet");
// or: import GeoRasterLayer from "georaster-layer-for-leaflet";

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

          https://leafletjs.com/reference.html#gridlayer
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

### Options for GeoRasterLayer

> The layer extends L.GridLayer, see the [docs](https://leafletjs.com/reference.html#gridlayer) for inherited options and methods.

| Option               | Type                                                              | Default | Description                                                      |
|----------------------|-------------------------------------------------------------------|---------|------------------------------------------------------------------|
| georaster            | GeoRaster                                                         |         | Use `georaster` from georaster-library. `georaster` or `georasters` is required.                           |
| georasters           | GeoRaster[]                                                       |         | Use different `georasters` from georaster-library. `georaster` or `georasters` is required.                                                                |
| resolution           | number                                                            | 32      | The resolution parameter is how many samples to take across and down from a dataset for each map tile. Typical tiles are 256 x 256 pixels (higher resolution are 512 x 512) which would be a optimal resolution of 256. It's not recommended to set the resolution higher then 512.                                                                  |
| debugLevel           | number                                                            | 0       | Available debug levels: 0 - 5                                                            |
| pixelValuesToColorFn | (values: number[]) => string                                      | null    | Customize how values for a pixel are translated to a color.                                                                 |
| bounds               | LatLngBounds                                                      | null    |  https://leafletjs.com/reference.html#latlngbounds                                                                |
| proj4                | Function                                                          |         | https://github.com/proj4js/proj4js                                                                 |
| resampleMethod       | string                                                            | nearest        | bilinear \| nearest                                             |
| mask                 | string \| Feature \| FeatureCollection \| Polygon \| MultiPolygon | null        | You can hide all the pixels either inside or outside a given mask geometry. You can provide a JSON object as a mask geometry or a URL to a GeoJSON.                                                                 |
| mask_srs             | string \| number                                                  | "EPSG:4326"        | Default mask srs is the EPSG:4326 projection used by GeoJSON     |
| mask_strategy        | string                                                            | outside | inside \| outside                                            |
| updateWhenIdle       | boolean                                                           | true    | https://leafletjs.com/reference.html#gridlayer-updatewhenidle    |
| updateWhenZooming    | boolean                                                           | false   | https://leafletjs.com/reference.html#gridlayer-updatewhenzooming |
| keepBuffer           | number                                                            | 25      | https://leafletjs.com/reference.html#gridlayer-keepbuffer        |



<!-- ## Options -->
<!-- todo: add a table of options for GeoRasterLayer -->

### Methods

| Method                                                           | Returns             | Description                                                                                                                                                                                                                                                                                                                                                                                    |
|------------------------------------------------------------------|---------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| getBounds()                                                      | LatLngBounds        | Returns the bounds of the layer                                                                                                                                                                                                                                                                                                                                                                |
| getMap()                                                         | Map                 | Returns the map which contains the layer                                                                                                                                                                                                                                                                                                                                                       |
| getMapCRS()                                                      | CRS                 | Returns map CRS if available else EPSG3857                                                                                                                                                                                                                                                                                                                                                     |
| getColor(values: number[])                                       | string \| undefined | Returns the colors of the values                                                                                                                                                                                                                                                                                                                                                               |
| updateColors(pixelValuesToColorFn, options = { debugLevel: -1 }) | this                | Causes the tiles to redraw without clearing them first. It uses the updated `pixelValuesToColorFn` function. You can set a debugLevel specific to this function by passing in an options object with a debugLevel property.  For example, you can turn on the console debugs for this method by setting `debugLevel = 1` in the options (even if you created the layer with `debugLevel = 0`). |
| getTiles()                                                       | Tile[]              | Returns tiles as array                                                                                                                                                                                                                                                                                                                                                                         |
| getActiveTiles()                                                 | Tile[]              | Returns active / visible tiles as array                                                                                                                                                                                                                                                                                                                                                        |
| isSupportedProjection()                                          | boolean             | Returns if the projection is supported                                                                                                                                                                                                                                                                                                                                                         |
| getProjectionString(projection: number)                          | string              | Returns the projection string for example "EPSG:3857"                                                                                                                                                                                                                                                                                                                                          |
| getProjector()                                                   | Projection          | Returns the current projection                                                                                                                                                                                                                                                                                                                                                                 |

## Advanced Capabilities

Please read about our advanced capabilities including custom context drawing functions, displaying directional arrows, and masking in [ADVANCED.md](ADVANCED.md).

## More Questions

Check out our [Frequently Asked Questions](FAQs.md)

## Videos
- [Edge Compute: Cool Stuff You Can Do With COGs in the Browser](https://www.youtube.com/watch?v=XTkNhGpfmB8&t=4190s)
- [2019 - Algorithm Walk-through: How to Visualize a Large GeoTIFF on Your Web Map](https://www.youtube.com/watch?v=K47JvCL99w0)

## Support

Contact the package author, Daniel J. Dufour, at daniel.j.dufour@gmail.com
