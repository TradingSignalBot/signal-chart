/**
 * trading-signal-chart/png: the same chart as a PNG, in Node.
 *
 * Needs the optional peer dependency @resvg/resvg-js (`npm install @resvg/resvg-js`),
 * which rasterises the SVG with the system's fonts. Kept out of the main entry so
 * browser bundles never try to load it.
 */
import { renderSvg } from './index.js';

let resvg;
async function load() {
  if (resvg) return resvg;
  try {
    resvg = await import('@resvg/resvg-js');
  } catch {
    throw new Error('signal-chart: PNG output needs @resvg/resvg-js. Install it with `npm install @resvg/resvg-js`, or use renderSvg() for SVG.');
  }
  return resvg;
}

/** An SVG string to PNG bytes (a Buffer). `scale` 2 gives a sharp image for phones. */
export async function svgToPng(svg, { scale = 1, background } = {}) {
  const { Resvg } = await load();
  const opts = { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } };
  if (scale !== 1) opts.fitTo = { mode: 'zoom', value: scale };
  if (background) opts.background = background;
  return new Resvg(svg, opts).render().asPng();
}

/** The chart as PNG bytes. Takes renderSvg's arguments, plus `scale` in the options. */
export async function renderPng(spec, options = {}) {
  const { scale, ...rest } = options;
  return svgToPng(renderSvg(spec, rest), { scale });
}

export { renderSvg };
