const path = require('path');
const { readFileSync } = require('fs');

module.exports = {
  entry: './georaster-layer-for-leaflet.js',
  output: {
    filename: 'georaster-layer-for-leaflet.min.js',
    path: path.resolve(__dirname),
  },
  module: {
    rules: [
        {
            test: /\.m?js$/,
            use: {
                loader: 'babel-loader',
                options: JSON.parse(readFileSync(".babelrc.json", 'utf-8'))
            }
      }
    ]      
  }
};
