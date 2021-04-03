const path = require("path");

module.exports = {
  watch: process.env.WEBPACK_WATCH === "true",
  entry: "./src/georaster-layer-for-leaflet.ts",
  mode: "production",
  output: {
    filename: "georaster-layer-for-leaflet.min.js",
    path: path.resolve(__dirname, "dist"),
    library: {
      export: "default",
      name: "GeoRasterLayer",
      type: "umd"
    }
  },
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.(ts|js)x?$/,
        use: {
          loader: "babel-loader"
        }
      }
    ]
  },
  resolve: {
    modules: ["node_modules"]
  },
  externals: {
    leaflet: { root: "L", commonjs: "leaflet", amd: "leaflet", commonjs2: "leaflet" }
  }
};
