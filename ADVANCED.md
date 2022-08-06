# Advanced Features

## Custom Draw Function
You can directly edit the canvas that is being rendered by passing in a customDrawFunction.  The custom draw function takes in an object with the following keys:
  - values: an array of pixel values with each element representing one band
  - context: the browser's context object
  - x: how far from the left side of the canvas does drawing start
  - y: how far from the top of the canvas does drawing start
  - width: how wide in screen pixels is the rectangular representation of a raster pixel sampled from the original raster
  - height: how tall in screen pixels is the rectangular representation of a raster pixel sampled from the original raster
  - rasterX: how far from the left edge of the original raster in original raster pixels
  - rasterY: how far from the top edge of the original raster in original raster pixels
  - sampleX: how many samples in from the left of the available pixels.  When reading from a Cloud Optimized GeoTIFF, this is equivalent to number of pixels in from the left edge of the fetched pixels.
  - sampleY: how many samples in from the top of the available pixels.  When reading from a Cloud Optimized GeoTIFF, this is equivalent to number of pixels in from the top edge of the fetched pixels.
  - sampledRaster: only applicable when reading from a Cloud Optimized GeoTIFF. This refers to the pixels fetched from the remote GeoTIFF.


Here's a rough example implementing drawing of wind direction arrows: https://geotiff.github.io/georaster-layer-for-leaflet-example/examples/wind-direction-arrows.html and the [source code](https://github.com/GeoTIFF/georaster-layer-for-leaflet-example/blob/master/examples/wind-direction-arrows.html#L38) for it.

## Setting the Log Level
You can turn on extra console logging for debugging purposes by setting the debugLevel to 1 or greater.
```javascript
new GeoRasterLayer({
  georaster,
  debugLevel: 1
})
```

# Reducing your Build Size
The default builds of GeoRasterLayer include support for nearly all projections.  Of course, this increases the total build size of the library by a lot, specifically from about 54kb to 311kb.  If you don't want this built-in support, you can use the lite version of the library, which is found at `./dist/georaster-layer-for-leaflet.lite.min.js`.  This means you'll want to do `const GeoRasterLayer = require('georaster-layer-for-leaflet/dist/georaster-layer-for-leaflet.lite.min.js')` or `import GeoRasterLayer from 'georaster-layer-for-leaflet/dist/georaster-layer-for-leaflet.lite.min.js` when loading the library.

# Masking
You can hide all the pixels either inside or outside a given mask geometry.  You can provide a JSON object as a mask geometry
or a URL to a GeoJSON.
```js
// only display what is inside the borders of the USA
new GeoRasterLayer({
  georaster,
  mask: "./usa.geojson",
  mask_strategy: "inside"
});

// hide all the land masses
new GeoRasterLayer({
  georaster,
  mask: { type: "FeatureCollection", features: [ /* .. */] }, // a GeoJSON for the world's oceans
  mask_strategy: "outside"
});
```