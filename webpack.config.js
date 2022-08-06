import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import envisage from "envisage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isLite = process.env.LITE === "true";

const config = {
  watch: process.env.WEBPACK_WATCH === "true",
  entry: "./src/georaster-layer-for-leaflet.ts",
  mode: "production",
  target: "web",
  output: {
    filename: "georaster-layer-for-leaflet" + (isLite ? ".lite" : "") + ".min.js",
    path: resolve(__dirname, "./dist/webpack"),
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
          loader: "babel-loader",
          options: {
            presets: [
              [
                "@babel/preset-env",
                {
                  targets: {
                    ie: 11
                  }
                }
              ],
              "@babel/preset-typescript"
            ]
          }
        }
      }
    ]
  },
  resolve: {
    modules: ["node_modules"],
    alias: (() => {
      if (isLite) {
        return {
          proj4: false,
          "proj4-fully-loaded": false
        };
      }
    })()
  },
  externals: {
    leaflet: { root: "L", commonjs: "leaflet", amd: "leaflet", commonjs2: "leaflet" }
  }
};

envisage.assign({ target: config, prefix: "WEBPACK" });

export default config;
