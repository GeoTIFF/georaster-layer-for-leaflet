const path = require("path");
const { readFileSync } = require("fs");

module.exports = {
  watch: process.env.WEBPACK_WATCH === "true",
  entry: "./georaster-layer-for-leaflet.js",
  output: {
    filename: "georaster-layer-for-leaflet.min.js",
    path: path.resolve(__dirname)
  },
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.m?js$/,
        use: {
          loader: "babel-loader",
          options: JSON.parse(readFileSync(".babelrc.json", "utf-8"))
        }
      }
    ]
  }
};
