**перекладено за допомогою [google translate](https://translate.google.com/)**
# georaster-layer-for-leaflet

Відображайте GeoTIFF і незабаром інші типи растрів на карті LeafletJS

## встановити

```bash
npm install georaster-layer-for-leaflet
```

## GeoRaster Обов'язкова умова

GeoRasterLayer вимагає, щоб введені дані спочатку було перетворено у формат GeoRaster.
Ви можете встановити GeoRaster за допомогою такої команди:

```bash
npm install georaster
```

## Завантажте пакет через `<script>`

```html
<script src="https://unpkg.com/georaster-layer-for-leaflet/dist/georaster-layer-for-leaflet.min.js">
```

## використання

```javascript
new GeoRasterLayer({ georaster }).addTo(map);
```

## демо

- <https://geotiff.github.io/georaster-layer-for-leaflet-example/>
- <https://geotiff.github.io/georaster-layer-for-leaflet-example/examples/load-file.html>
- Більше тут: <https://github.com/GeoTIFF/georaster-layer-for-leaflet-example>

## Мета

- Підтримка майже всіх проекцій завдяки [proj4-fully-loaded](https://github.com/danieljdufour/proj4-fully-loaded) і [epsg.io](https://epsg.io/)
- Надзвичайно швидший рендеринг завдяки простій інтерполяції найближчого сусіда
- Використання Web Workers означає безперебійну інтеграцію, яка не блокує основний потік
- Завантажує великі файли GeoTIFF понад сто мегабайт
- Підтримує користувацьку візуалізацію, включаючи користувацькі кольори, стрілки напрямків і малювання контексту
- Не залежить від WebGL

## Клас GeoRasterLayer

Спеціальний клас для відтворення GeoTIFF (включаючи COG) на карті LeafletJS. Цей шар розширює L.GridLayer, див. [docs](https://leafletjs.com/reference-1.7.1.html#gridlayer) для отримання успадкованих параметрів і методів.

### Приклад використання

Вихідний код: <https://github.com/GeoTIFF/georaster-layer-for-leaflet-example/blob/master/main.js>

```javascript
var parse_georaster = require("georaster");

var GeoRasterLayer = require("georaster-layer-for-leaflet");

// ініціалізація карти Leaflet JS
var map = L.map('map').setView([0, 0], 5);

// додаємо базову карту OpenStreetMap
L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// url до файлу GeoTIFF
var url_to_geotiff_file = "example_4326.tif";

fetch(url_to_geotiff_file)
  .then(response => response.arrayBuffer())
  .then(arrayBuffer => {
    parse_georaster(arrayBuffer).then(georaster => {
      console.log("georaster:", georaster);

      /*
          GeoRasterLayer є розширенням GridLayer,
          це означає, що можна використовувати параметри GridLayer, як-от opacity.

          Просто не забудьте включити параметр georaster!

          Додатково встановіть параметр функції pixelValuesToColorFn для налаштування
          як значення для пікселя перекладаються в колір.

          http://leafletjs.com/reference-1.2.0.html#gridlayer
      */
      var layer = new GeoRasterLayer({
          georaster,
          opacity: 0.7,
          pixelValuesToColorFn: values => values[0] === 42 ? '#ffffff' : '#000000',
          resolution: 64 // додатковий параметр для налаштування роздільної здатності дисплея
      });
      layer.addTo(map);

      map.fitBounds(layer.getBounds());

  });
});
```

<!-- ## Options -->
<!-- todo: add a table of options for GeoRasterLayer -->

### Методи

| метод                                       | return  | опис                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| updateColors(pixelValuesToColorFn, options) | this    | Спричиняє перемалювання плиток без попереднього очищення. Він використовує оновлену функцію pixelValuesToColorFn. Ви можете встановити специфічний для цієї функції debugLevel, передавши об’єкт параметрів із властивістю debugLevel. Наприклад, ви можете ввімкнути налагодження консолі для цього методу, встановивши `debugLevel = 1` у параметрах (навіть якщо ви створили шар із `debugLevel = 0`). |

## Розширені можливості

Будь ласка, прочитайте про наші розширені можливості, включаючи спеціальні функції малювання контексту та відображення стрілок напрямку в [ADVANCED.md](ADVANCED.md).

## Більше запитань

Перегляньте наші [Frequently Asked Questions](FAQs.md)

## Відео
- [Edge Compute: Cool Stuff You Can Do With COGs in the Browser](https://www.youtube.com/watch?v=XTkNhGpfmB8&t=4190s)
- [2019 - Algorithm Walk-through: How to Visualize a Large GeoTIFF on Your Web Map](https://www.youtube.com/watch?v=K47JvCL99w0)

## Підтримка

Зв’яжіться з автором пакета Daniel J. Dufour за адресою daniel.j.dufour@gmail.com
