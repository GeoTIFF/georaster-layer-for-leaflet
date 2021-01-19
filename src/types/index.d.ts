import type { GridLayerOptions, Coords, DoneCallback, GridLayer, InternalTiles } from "leaflet";

// todo: Update with type signature - SFR 2021-01-19
export type Georaster = any;

export type PixelValueToColorFn = (values: number[]) => string;

export interface GeoRasterLayerOptions extends GridLayerOptions {
  georasters: Georaster[];
  georaster: Georaster;
  resolution?: number;
  debugLevel?: 0 | 1;
  pixelValuesToColorFn?: PixelValueToColorFn;
}

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

export interface DrawTileOptions {
  tile: HTMLCanvasElement;
  coords: Coords;
  context: CanvasRenderingContext2D;
  done: DoneCallback;
}

// note: Tile is taken from leafets `InternalTiles` type and should not be modified.  - SFR 2021-01-19
export type Tile = {
  active?: boolean;
  coords: Coords;
  current: boolean;
  el: HTMLCanvasElement;
  loaded?: Date;
  retain?: boolean;
};
