import type { ChartSpec, RenderOptions } from './index.js';

export { renderSvg } from './index.js';

/** An SVG string to PNG bytes. Needs @resvg/resvg-js. */
export function svgToPng(svg: string, options?: { scale?: number; background?: string }): Promise<Uint8Array>;

/** The chart as PNG bytes. Needs @resvg/resvg-js. */
export function renderPng(spec: ChartSpec, options?: RenderOptions & { scale?: number }): Promise<Uint8Array>;
