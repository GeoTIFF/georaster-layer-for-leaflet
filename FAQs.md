# Frequently Asked Questions

#### My GeoTIFF file loads too slowly.  What can I do?
You are probably trying to load the whole file.  Dependending on the size of the file, this could take a long time.  You may consider converting your GeoTIFF into a [Cloud Optimized GeoTIFF](https://www.cogeo.org/) and loading the url.  Here's an example of loading a COG: https://geotiff.github.io/georaster-layer-for-leaflet-example/examples/load-cog-via-script-tag.html.  If that's still not fast enough, you may consider creating overviews for every zoom level.

### I don't see my question here.
This is a community project and doesn't work without contributions from people like you.  You're welcome to add this question via a Github Pull Request.
