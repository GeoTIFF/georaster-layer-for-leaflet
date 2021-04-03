#!/bin/sh -e

# clear old downloads
rm georaster-layer-for-leaflet.*

# download old versions from unpkg
wget https://unpkg.com/georaster-layer-for-leaflet@0.7.1/georaster-layer-for-leaflet.browserify.min.js
wget https://unpkg.com/georaster-layer-for-leaflet@0.7.1/georaster-layer-for-leaflet.bundle.js
wget https://unpkg.com/georaster-layer-for-leaflet@0.7.1/georaster-layer-for-leaflet.js
wget https://unpkg.com/georaster-layer-for-leaflet@0.7.1/georaster-layer-for-leaflet.min.js
wget https://unpkg.com/georaster-layer-for-leaflet@0.7.1/georaster-layer-for-leaflet.min.js.map

# inject warning / deprecation message
GEORASTER_LAYER_DEPRECATION_MESSAGE="\nconsole.warn('DEPRECATION WARNING: Hello.  You are probably using an old link to an old version of georaster-layer-for-leaflet that will be removed at the end of 2021.  You can probably remove this warning by upgrading to using https://unpkg.com/georaster-layer-for-leaflet/dist/georaster-layer-for-leaflet.min.js.  If that does not work, please consult https://github.com/GeoTIFF/georaster-layer-for-leaflet for more instructions or email me directly at daniel.j.dufour@gmail.com.  Happy to help! :-)');"
echo $GEORASTER_LAYER_DEPRECATION_MESSAGE >> georaster-layer-for-leaflet.browserify.min.js
echo $GEORASTER_LAYER_DEPRECATION_MESSAGE >> georaster-layer-for-leaflet.bundle.js
echo $GEORASTER_LAYER_DEPRECATION_MESSAGE >> georaster-layer-for-leaflet.js
echo $GEORASTER_LAYER_DEPRECATION_MESSAGE >> georaster-layer-for-leaflet.min.js


