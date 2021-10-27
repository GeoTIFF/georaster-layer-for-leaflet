/* eslint-disable camelcase */
import type { GridLayerOptions, Coords, CRS, DoneCallback, LatLngBounds, Transformation } from "leaflet";

export type PixelValuesToColorFn = (values: number[]) => string;

interface GeoRasterLayerOptions_CommonOptions extends GridLayerOptions {
  resolution?: number;
  debugLevel?: 0 | 1 | 2 | 3 | 4;
  pixelValuesToColorFn?: PixelValuesToColorFn;
  bounds?: LatLngBounds;
  proj4?: Function;
  resampleMethod?: string
}

// Ensures at least one of the georaster[s] options is defined while being ok the other is not
type GeoRasterLayerOptions_GeoRaster =
  | {
      georasters?: GeoRaster[];
      georaster: GeoRaster;
    }
  | { georasters: GeoRaster[]; georaster?: GeoRaster };

export type GeoRasterLayerOptions = GeoRasterLayerOptions_CommonOptions & GeoRasterLayerOptions_GeoRaster;

export type GetRasterOptions = {
  innerTileTopLeftPoint: any;
  heightOfSampleInScreenPixels: any;
  widthOfSampleInScreenPixels: any;
  zoom: number;
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

// note: Tile is taken from leaflets `InternalTiles` type and should not be modified.  - SFR 2021-01-19
export type Tile = {
  active?: boolean;
  coords: Coords;
  current: boolean;
  el: HTMLCanvasElement;
  loaded?: Date;
  retain?: boolean;
};

export type GetValuesOptions = {
  bottom?: number;
  height: number;
  left?: number;
  right?: number;
  top?: number;
  width: number;
  resampleMethod?: string
};

export type GeoRasterValues = number[][][];

export type GeoRasterKeys =
  | "height"
  | "width"
  | "noDataValue"
  | "palette"
  | "pixelHeight"
  | "pixelWidth"
  | "projection"
  | "sourceType"
  | "xmin"
  | "xmax"
  | "ymin"
  | "ymax";

export interface GeoRaster {
  getValues: (options?: GetValuesOptions) => GeoRasterValues;
  height: number;
  noDataValue: null | undefined | number | typeof NaN;
  numberOfRasters: number;
  palette: string[];
  pixelHeight: number;
  pixelWidth: number;
  projection: number;
  rasterType: "geotiff" | "object";
  sourceType: "url" | "Buffer" | undefined;
  toCanvas: (e: any) => HTMLCanvasElement;
  values: GeoRasterValues | undefined;
  width: number;
  xmax: number;
  xmin: number;
  ymax: number;
  ymin: number;
  _blob_is_available: boolean;
  _data: string;
  _geotiff: Record<string, unknown> | undefined;
  cache: boolean;
  firstIFDOffset: number;
  ghostValues: null;
  ifdRequests: Promise<any>[];
  littleEndian: boolean;
  _url: string;
  _url_is_available: boolean;
  _web_worker_is_available: boolean;
}

export interface CustomCSSStyleDeclaration extends CSSStyleDeclaration {
  WebkitBackfaceVisibility?: string
}

export interface CustomTransformation extends Transformation {
  _a?: Number,
  _b?: Number,
  _c?: Number,
  _d?: Number
}

export interface CustomCRS extends CRS {
  transformation?: CustomTransformation
}
