<template>
  <div id="map"></div>
</template>

<script>
import L from 'leaflet';
import "leaflet/dist/leaflet.css";
import parseGeoRaster from "georaster";
import GeoRasterLayer from 'georaster-layer-for-leaflet';

export default {
  name: "Map",
  methods: {
    init: async function() {
      const map = L.map("map");
      console.log("map:", map);

      // add OpenStreetMap basemap
      L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      const url = "https://s3-us-west-2.amazonaws.com/planet-disaster-data/hurricane-harvey/SkySat_Freeport_s03_20170831T162740Z3.tif";

      const georaster = await parseGeoRaster(url);
      console.log("georaster:", georaster);

      const lyr = new GeoRasterLayer({ georaster, noWrap: false });
      console.log("lyr:", lyr);

      lyr.addTo(map);

      const bounds = lyr.getBounds();
      console.log("bounds:", bounds);
      
      map.fitBounds(bounds);
    }
  },
  mounted() {
    this.init();
  }
}
</script>

<style scoped>
#map {
  bottom: 0;
  left: 0;
  position: absolute;
  right: 0;
  top: 0;
}
</style>