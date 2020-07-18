const path = require('path');

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
          use: 'babel-loader'
      }
    ]      
  }
};
