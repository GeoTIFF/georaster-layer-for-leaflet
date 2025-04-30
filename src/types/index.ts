/* eslint-disable camelcase */
import type { GridLayerOptions, Coords, CRS, DoneCallback, LatLngBounds, Transformation } from "leaflet";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";

export type MaskStrategy = "inside" | "outside";

export type PixelValuesToColorFn = (values: number[]) => string | undefined;

export type DebugLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type ResampleMethod = "bilinear" | "nearest";

export type SimplePoint = {
  x: number;
  y: number;
};

export type Mask = string | Feature | FeatureCollection | Polygon | MultiPolygon;

interface GeoRasterLayerOptions_CommonOptions extends GridLayerOptions {
  resolution?: number | { [key: number]: number };
  debugLevel?: DebugLevel;
  pixelValuesToColorFn?: PixelValuesToColorFn;
  bounds?: LatLngBounds;
  proj4?: Function;
  resampleMethod?: ResampleMethod;
  mask?: Mask;
  mask_srs?: string | number;
  mask_strategy?: MaskStrategy;
  updateWhenIdle?: boolean; // inherited from LeafletJS
  updateWhenZooming?: boolean; // inherited from LeafletJS
  keepBuffer?: number; // inherited from LeafletJS
  caching?: boolean;
  customDrawFunction?: (options: CustomDrawFunctionOptions) => void;
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
  innerTileTopLeftPoint: SimplePoint;
  heightOfSampleInScreenPixels: number;
  widthOfSampleInScreenPixels: number;
  zoom: number;
  numberOfSamplesAcross: number;
  numberOfSamplesDown: number;
  ymax: number;
  xmin: number;
};

export interface DrawTileOptions {
  tile: HTMLCanvasElement;
  coords: Coords;
  context: CanvasRenderingContext2D;
  done: DoneCallback;
  resolution: number;
}

export interface CustomDrawFunctionOptions {
  values: number[] | null;
  context: CanvasRenderingContext2D;
  x: number;
  y: number;
  width: number;
  height: number;
  rasterX: number;
  rasterY: number;
  sampleX: number;
  sampleY: number;
  sampledRaster?: GeoRasterValues
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
  resampleMethod?: ResampleMethod
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
  // This was typed as `string[]` but what seems to work is `Uint8Array[]`
  palette: Uint8Array[];
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
  mins?: number[];
  ranges?: number[];
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
