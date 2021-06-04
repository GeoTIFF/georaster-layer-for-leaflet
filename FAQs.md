# Frequently Asked Questions

#### My GeoTIFF file loads too slowly.  What can I do?
You are probably trying to load the whole file.  Dependending on the size of the file, this could take a long time.  You may consider converting your GeoTIFF into a [Cloud Optimized GeoTIFF](https://www.cogeo.org/) and loading the url.  Here's an example of loading a COG: https://geotiff.github.io/georaster-layer-for-leaflet-example/examples/load-cog-via-script-tag.html.  If that's still not fast enough, you may consider creating overviews for every zoom level.

#### Why isn't my GeoTIFF loading? What can I do to fix it?
Sometimes your GeoTIFF doesn't load because the projection is an unusual or custom projection not supported by georaster-layer-for-leaflet.  In order to fix this, you can install [gdal](https://gdal.org/index.html) and run the following command: `gdalwarp -t_srs EPSG:4326 imagery.tif imagery_4326.tif`, which will create a new GeoTIFF file in the 4326 projection, supported by this library.  If that doesn't fix it, feel free to email me at daniel.j.dufour@gmail.com for assistance.

#### I receive a "ReferenceError: Can't find variable: proj4"?
You might see this for one of the following reasons: (1) you are using an older version of GeoRasterLayer that had limited support for projections or (2) you are using the lite version of GeoRasterLayer.  GeoRasterLayer looks for proj4 when you have loaded a raster (e.g. GeoTIFF) that isn't in the 3857 or 4326 projection.  This is because it needs to reproject coordinates on your Leaflet map into coordinates in the projection of your raster.  In order to solve this, you can: (1) upgrade to the latest version of GeoRasterLayer, (2) use the default build of GeoRasterLayer instead of the lite version (which doesn't have the projection support you need), or (3) reproject your GeoTIFF into EPSG:4326 (like the answer above shows), or (4) add proj4 to the globals, which is done with adding the following script to your document head:
```html
<script src="https://unpkg.com/proj4"></script>
```

### How do I convert my GeoTIFF into a Cloud Optimized GeoTIFF?
You will first have to install [gdal](https://gdal.org/) and then run the following commands, assuming you start with a GeoTIFF named example.tif:
```bash
gdal_translate example.tif cog.tif -co TILED=YES -co COMPRESS=DEFLATE
gdaladdo -r average cog.tif  2 4 8 16 32
```

### Why did you increase the build size by adding in built-in support for nearly all projections?
This was a tough decision.  There are certainly good arguments to be made for not doing it, including: it'll slow down page loads,
applications might timeout when trying to load on a slow connection, it's more difficult to maintain, it's uneccessary when users
usually only have data in one projection.  However, there's a few important reasons to the contrary: (1) projection support is the most common issue for users, (2) our users work on awesome projects with really important missions like addressing food insecurity and climate change and we want to have time to help them, (3) we receive a lot of requests for help and it's just physically impossible to respond to every email asking for projection support.

### I don't see my question here.
This is a community project and doesn't work without contributions from people like you.  You're welcome to add this question via a Github Pull Request.
