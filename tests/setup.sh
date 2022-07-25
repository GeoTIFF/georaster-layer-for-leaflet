# original script before we uploaded utm.tif to AWS S3
# wget https://download.osgeo.org/geotiff/samples/usgs/o41078a6.tif
# gdal_translate -outsize 100 100 o41078a6.tif utm.tif

wget https://s3.amazonaws.com/georaster-layer-for-leaflet/utm.tif
wget https://georaster-layer-for-leaflet.s3.amazonaws.com/wind_direction.tif
wget https://georaster-layer-for-leaflet.s3.amazonaws.com/spam2010V1r1_global_H_WHEA_A.tif
wget https://georaster-layer-for-leaflet.s3.amazonaws.com/check.tif

gdal_translate -b 1 -of COG gadas.tiff gadas_b1.tif
gdal_translate -b 2 -of COG gadas.tiff gadas_b2.tif
gdal_translate -b 3 -of COG gadas.tiff gadas_b3.tif