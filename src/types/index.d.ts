/** A temp type while converting to silence the compiler */
export type Georaster = any;

export type GeoRasterLayerOptions = {
  georasters: Georaster[];
  georaster: Georaster;
  updateWhenIdle?: boolean;
  updateWhenZooming?: boolean;
  keepBuffer?: number;
  resolution?: number;
  debugLevel?: 0 | 1;
  pixelValuesToColorFn?: (values: number[]) => string;
};

export type GetRasterOptions = {
  tileNwPoint: any;
  heightOfSampleInScreenPixels: any;
  widthOfSampleInScreenPixels: any;
  coords: any;
  numberOfSamplesAcross: any;
  numberOfSamplesDown: any;
  ymax: any;
  xmin: any;
};
