/** Unix seconds, a Date, or an ISO 8601 string. */
export type Time = number | Date | string;

/** `[time, open, high, low, close]` or an object. */
export type Candle = [Time, number, number, number, number] | { time: Time; open: number; high: number; low: number; close: number };

export interface Signal {
  /** 'buy' or 'sell' ('long' and 'short' are accepted). */
  side: 'buy' | 'sell' | 'long' | 'short';
  entry: number;
  stop: number;
  /** Any number of targets, in any order: they are sorted from the entry outwards. */
  targets?: number[];
  /** When the signal was given: its candle gets the marker and the zones start there. Defaults to the last candle. */
  time?: Time;
  /** e.g. 'EURUSD': shown in the header, and sets the decimals and pip size. */
  pair?: string;
  title?: string;
}

export interface Theme {
  background: string; grid: string; axis: string; text: string; title: string;
  up: string; down: string; entry: string; stop: string; target: string;
  risk: string; reward: string; zoneOpacity: number; tagText: string; font: string;
}

export interface RenderOptions {
  /** Pixels; default 1200. */
  width?: number;
  /** Pixels; default 675. */
  height?: number;
  /** 'dark' (default), 'light', or colours to override. */
  theme?: 'dark' | 'light' | Partial<Theme>;
  /** Decimals of prices; default from the pair (JPY: 3) or the price's size. */
  decimals?: number;
  /** Pip size; default 0.0001 (0.01 for yen pairs) for six-letter pairs, none otherwise. */
  pip?: number;
  /** e.g. 'M15', shown in the header. */
  timeframe?: string;
  title?: string;
  /** Empty candle slots on the right for the levels to run into; default 12% of the candles. */
  rightSpace?: number;
  /** A small line of text at the top right, e.g. your channel's name. */
  watermark?: string;
}

export interface ChartSpec {
  candles: Candle[];
  signal: Signal;
  pair?: string;
}

export const themes: { readonly dark: Readonly<Theme>; readonly light: Readonly<Theme> };

/** The chart as an SVG document. Pure and deterministic. */
export function renderSvg(spec: ChartSpec, options?: RenderOptions): string;

export function normalizeCandles(candles: Candle[]): { time: number; open: number; high: number; low: number; close: number }[];
export function normalizeSignal(signal: Signal): Omit<Signal, 'side' | 'time' | 'targets'> & { side: 'buy' | 'sell'; targets: number[]; time?: number };
export function decimalsFor(price: number, pair?: string): number;
export function pipFor(pair?: string): number | undefined;
export function describe(signal: Signal, pair?: string, fmt?: (p: number) => string): string;

/** The minimum of a lightweight-charts series this helper uses. */
export interface SeriesLike {
  createPriceLine(options: object): unknown;
  removePriceLine(line: unknown): void;
  attachPrimitive?(primitive: unknown): void;
  detachPrimitive?(primitive: unknown): void;
  priceToCoordinate?(price: number): number | null;
}

export interface LevelsOptions {
  theme?: 'dark' | 'light' | Partial<Theme>;
  pip?: number;
  /** Shade the risk and reward (needs lightweight-charts 4.1+). Default true. */
  zones?: boolean;
}

/** Adds the entry, stop and targets (and the zones) to an existing lightweight-charts series. */
export function addSignalLevels(series: SeriesLike, signal: Signal, options?: LevelsOptions): { lines: unknown[]; remove(): void };

/** The series primitive that shades the risk and reward. */
export class SignalZones {
  constructor(signal: Signal, theme?: Partial<Theme>);
  rects(width: number): { x: number; y: number; w: number; h: number; color: string }[];
}
