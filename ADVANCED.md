# Advanced Features

You can directly edit the canvas that is being rendered by passing in a customDrawFunction.  The custom draw function takes in an object with the following keys:
  - values: an array of pixel values with each element representing one band
  - context: the browser's context object
  - x: how far from the left side of the canvas does drawing start
  - y: how far from the top of the canvas does drawing start
  - width: how wide in screen pixels is the rectangular representation of a raster pixel sampled from the original raster
  - height: how tall in screen pixels is the rectangular representation of a raster pixel sampled from the original raster

Here's a rough example implementing drawing of wind direction arrows: https://geotiff.github.io/georaster-layer-for-leaflet-example/examples/wind-direction-arrows.html and the [source code](https://github.com/GeoTIFF/georaster-layer-for-leaflet-example/blob/master/examples/wind-direction-arrows.html#L38) for it.
