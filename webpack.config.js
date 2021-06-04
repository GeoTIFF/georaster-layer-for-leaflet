const path = require("path");

const isLite = process.env.LITE === "true";

module.exports = {
  watch: process.env.WEBPACK_WATCH === "true",
  entry: "./src/georaster-layer-for-leaflet.ts",
  mode: "production",
  target: "web",
  output: {
    filename: "georaster-layer-for-leaflet" + (isLite ? ".lite" : "") + ".min.js",
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
      },
      isLite && {
        test: /.*proj4.*/,
        use: {
          loader: "null-loader"
        }
      }
    ].filter(Boolean)
  },
  resolve: {
    modules: ["node_modules"]
  },
  externals: {
    leaflet: { root: "L", commonjs: "leaflet", amd: "leaflet", commonjs2: "leaflet" }
  }
};
