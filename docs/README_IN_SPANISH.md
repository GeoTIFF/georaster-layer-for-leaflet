# georaster-layer-for-leaflet

Muestre GeoTIFF en su mapa de LeafletJS

## Install

```bash
npm install georaster-layer-for-leaflet
```

## GeoRaster Requisitos

GeoRasterLayer requiere que su datos convertido en la forma de GeoRaster.
Su instala GeoRaster por esta:
```bash
npm install georaster
```

## Instala via `<script/>`

```html
<script src="https://unpkg.com/georaster-layer-for-leaflet/dist/georaster-layer-for-leaflet.min.js">
```

## Uso

```javascript
new GeoRasterLayer({ georaster }).addTo(map);
```

## Demos

- <https://geotiff.github.io/georaster-layer-for-leaflet-example/>
- <https://geotiff.github.io/georaster-layer-for-leaflet-example/examples/load-file.html>
- Más Aquí: <https://github.com/GeoTIFF/georaster-layer-for-leaflet-example>

## El Propósito

- La mayoría de las proyecciones funciona a causo de [proj4-fully-loaded](https://github.com/danieljdufour/proj4-fully-loaded) y [epsg.io](https://epsg.io/)
- Visualización súper rápida a causo de a una interpolación de vecino más cercano
- Use WebWorkers para que el "main thread" no esté bloqueado
- LVisualice 100MB+ GeoTIFF
- Representación personalizada que incluye colores personalizados, flechas direccionales y dibujo de contexto
- No requiere WebGL

## The GeoRasterLayer Class

Una clase personalizada para representar GeoTIFF (incluidos los COG) en un mapa de LeafletJS. La capa extiende L.GridLayer, consulte los [docs](https://leafletjs.com/reference-1.7.1.html#gridlayer) para conocer las opciones y los métodos heredados.

### Uno Ejemplo

Source Code: <https://github.com/GeoTIFF/georaster-layer-for-leaflet-example/blob/master/main.js>

```javascript
var parse_georaster = require("georaster");

var GeoRasterLayer = require("georaster-layer-for-leaflet");

// empieze el mapa de LeafletJS
var map = L.map('map').setView([0, 0], 5);

// incluye datos de OpenStreetMap 
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
          GeoRasterLayer es una extensión de GridLayer,
          lo que significa que se puede usar opciones de GridLayer como la opacidad.

          Necesito incluir la opción georaster!

          Opcionalmente, use la función pixelValuesToColorFn para cambiar
          cómo los valores de un píxel se traducen a un color.

          http://leafletjs.com/reference-1.2.0.html#gridlayer
      */
      var layer = new GeoRasterLayer({
          georaster: georaster,
          opacity: 0.7,
          pixelValuesToColorFn: values => values[0] === 42 ? '#ffffff' : '#000000',
          resolution: 64 // parámetro opcional para ajustar la resolución de la pantalla
      });
      layer.addTo(map);

      map.fitBounds(layer.getBounds());

  });
});
```

<!-- ## Options -->
<!-- todo: add a table of options for GeoRasterLayer -->

### Métodos

| Método                                      | Resulto | Descripción                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| updateColors(pixelValuesToColorFn, options) | this    | Hace que las fichas se vuelvan a dibujar sin borrarlas primero. Utiliza la función `pixelValuesToColorFn`. Se puede usa un debugLevel específico para esta función pasando un objeto de opciones con una propiedad debugLevel. Por ejemplo, puede activar las depuraciones de la consola para este método configurando `debugLevel = 1` en las opciones. | |

## Capacidades Avanzadas

Lea acerca de nuestras capacidades avanzadas, incluidas las funciones de dibujo de contexto personalizadas y la visualización de flechas direccionales en [ADVANCED.md](ADVANCED.md).

## Más Preguntas

Lee esto: [Frequently Asked Questions](FAQs.md)

## Videos
- [Edge Compute: Cool Stuff You Can Do With COGs in the Browser](https://www.youtube.com/watch?v=XTkNhGpfmB8&t=4190s)
- [2019 - Algorithm Walk-through: How to Visualize a Large GeoTIFF on Your Web Map](https://www.youtube.com/watch?v=K47JvCL99w0)

## Ayuda

Envia un correo electrónico al autor, daniel.j.dufour@gmail.com
