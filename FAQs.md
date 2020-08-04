# Frequently Asked Questions

#### My GeoTIFF file loads too slowly.  What can I do?
You are probably trying to load the whole file.  Dependending on the size of the file, this could take a long time.  You may consider converting your GeoTIFF into a [Cloud Optimized GeoTIFF](https://www.cogeo.org/) and loading the url.  Here's an example of loading a COG: https://geotiff.github.io/georaster-layer-for-leaflet-example/examples/load-cog-via-script-tag.html.  If that's still not fast enough, you may consider creating overviews for every zoom level.

#### Why isn't my GeoTIFF loading? What can I do to fix it?
Sometimes your GeoTIFF doesn't load because the projection is not supported by georaster-layer-for-leaflet.  In order to fix this, you can install [gdal](https://gdal.org/index.html) and run the following command: `gdalwarp -t_srs EPSG:4326 imagery.tif imagery_4326.tif`, which will create a new GeoTIFF file in the 4326 projection, supported by this library.  If that doesn't fix it, feel free to email me at daniel.j.dufour@gmail.com for assistance.

### I don't see my question here.
This is a community project and doesn't work without contributions from people like you.  You're welcome to add this question via a Github Pull Request.
