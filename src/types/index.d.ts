/* eslint-disable camelcase */
import type { GridLayerOptions, Coords, DoneCallback } from "leaflet";

export type PixelValueToColorFn = (values: number[]) => string;

export interface GeorasterLayerOptions extends GridLayerOptions {
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

// note: Tile is taken from leaflets `InternalTiles` type and should not be modified.  - SFR 2021-01-19
export type Tile = {
  active?: boolean;
  coords: Coords;
  current: boolean;
  el: HTMLCanvasElement;
  loaded?: Date;
  retain?: boolean;
};

type GeorasterSource = {
  blockSize: number;
  // not sure how to type Map yet but thats easily solved once I know what the map is of. i.e number, string etc
  blockRequests: Map;
  blocks: Map;
  blockIdsAwaitingRequest: any | null;
  retrievalFunction: () => void;
};

type GetValuesOptions = {
  bottom?: number;
  height: number;
  left?: number;
  right?: number;
  top?: number;
  width: number;
};

type GeorasterValues = number[][][];

export type GeorasterKeys =
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

interface Georaster {
  getValues: (options?: GetValuesOptions) => GeorasterValues;
  height: number;
  noDataValue: null | undefined | number | NaN;
  numberOfRasters: number;
  // todo: Verify the type of palette - SFR 2021-01-25
  palette: string[];
  pixelHeight: number;
  pixelWidth: number;
  projection: number;
  rasterType: "geotiff" | "object";
  sourceType: "url" | "Buffer" | undefined;
  toCanvas: (e: any) => HTMLCanvasElement;
  values: GeorasterValues | undefined;
  width: number;
  xmax: number;
  xmin: number;
  ymax: number;
  ymin: number;
  _blob_is_available: boolean;
  _data: string;
  _geotiff: Record<string, unknown> | undefined;
  bigTiff: boolean;
  cache: boolean;
  firstIFDOffset: number;
  ghostValues: null;
  ifdRequests: Promise[];
  littleEndian: boolean;
  source: GeorasterSource;
  _url: string;
  _url_is_available: boolean;
  _web_worker_is_available: boolean;
}
