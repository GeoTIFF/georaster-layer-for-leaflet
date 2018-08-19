# georaster-layer-for-leaflet
Display GeoTIFFs and soon other types of rasters on your Leaflet Map

# Usage
```
new GeoRasterLayer({georaster: georaster}).addTo(map);
```

# Demo
https://geotiff.github.io/georaster-layer-for-leaflet-example/

# Why
- Super faster rendering thanks to a simple nearest neighbor interpolation
- Use of web workers means seamless integration that doesn't block main thread
- Loads large geotiffs greater than a hundred megabytes


# Longer Usage Example
Source Code: https://github.com/GeoTIFF/georaster-layer-for-leaflet-example/blob/master/main.js
```
var parse_georaster = require("georaster");

var GeoRasterLayer = require("georaster-layer-for-leaflet");

// initalize leaflet map
var map = L.map('map').setView([0, 0], 5);

// add OpenStreetMap basemap
L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
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

          Optionally set the pixelValueToColorFn function option to customize
          how a pixel value is translated to a color.

          http://leafletjs.com/reference-1.2.0.html#gridlayer
      */
      var layer = new GeoRasterLayer({
          georaster: georaster,
          opacity: 0.7,
          pixelValueToColorFn: value => value === 42 ? '#ffffff' : '#000000'
      });
      layer.addTo(map);

      map.fitBounds(layer.getBounds());

  });
});
```

# Support
Contact the package author, Daniel J. Dufour, at daniel.j.dufour@gmail.com
