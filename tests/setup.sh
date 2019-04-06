wget https://download.osgeo.org/geotiff/samples/usgs/o41078a6.tif
gdal_translate -outsize 100 100 o41078a6.tif utm.tif
