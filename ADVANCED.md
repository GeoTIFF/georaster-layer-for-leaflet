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
You can turn off console logging by setting the debugLevel to 0.
```javascript
new GeoRasterLayer({
  georaster,
  debugLevel: 0
})
```
