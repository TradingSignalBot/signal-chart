// Writes examples/example.svg (and example.png when @resvg/resvg-js is installed).
// Run: npm run example
import { writeFileSync } from 'node:fs';
import { renderSvg } from '../index.js';
import { sampleCandles, sampleSignal } from './sample.js';

const candles = sampleCandles();
const spec = { candles, signal: sampleSignal(candles) };
const options = { timeframe: 'M15', title: 'Break and retest' };
const here = new URL('./', import.meta.url);

writeFileSync(new URL('example.svg', here), renderSvg(spec, options));
writeFileSync(new URL('example-light.svg', here), renderSvg(spec, { ...options, theme: 'light' }));
console.log('wrote examples/example.svg, examples/example-light.svg');

try {
  const { renderPng } = await import('../png.js');
  writeFileSync(new URL('example.png', here), await renderPng(spec, { ...options, scale: 1 }));
  console.log('wrote examples/example.png');
} catch (e) {
  console.log(`no PNG: ${e.message}`);
}
