import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { renderSvg, normalizeSignal, decimalsFor, pipFor, addSignalLevels, SignalZones, themes } from '../index.js';
import { sampleCandles, sampleSignal } from '../examples/sample.js';

const candles = sampleCandles();
const spec = { candles, signal: sampleSignal(candles) };
const snapDir = new URL('./__snapshots__/', import.meta.url);

function snapshot(name, actual) {
  const file = new URL(name, snapDir);
  if (process.env.UPDATE_SNAPSHOTS || !existsSync(file)) {
    mkdirSync(snapDir, { recursive: true });
    writeFileSync(file, actual);
    return;
  }
  assert.equal(actual, readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), `${name} changed: run with UPDATE_SNAPSHOTS=1 if that was meant`);
}

test('the SVG matches its snapshot', () => {
  snapshot('dark.svg', renderSvg(spec, { timeframe: 'M15', title: 'Break and retest' }));
  snapshot('light-small.svg', renderSvg(spec, { theme: 'light', width: 390, height: 260 }));
});

test('the same input gives the same SVG', () => {
  assert.equal(renderSvg(spec), renderSvg(spec));
});

test('one body and one wick per candle, and every level labelled', () => {
  const svg = renderSvg(spec);
  const group = svg.split('<g class="candles">')[1].split('</g>')[0];
  assert.equal((group.match(/<rect /g) ?? []).length, candles.length);
  assert.equal((group.match(/<line /g) ?? []).length, candles.length);
  for (const name of ['Entry', 'Stop (-25 pips)', 'TP1 (+25 pips)', 'TP2 (+50 pips)', 'TP3 (+75 pips)']) assert.ok(svg.includes(`>${name}<`), name);
  for (const p of [spec.signal.entry, spec.signal.stop, ...spec.signal.targets]) assert.ok(svg.includes(`>${p.toFixed(5)}<`), String(p));
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.ok(svg.trimEnd().endsWith('</svg>'));
});

test('a sell has its stop above, its targets below, and red in the header', () => {
  const s = { pair: 'USDJPY', side: 'sell', entry: 150.2, stop: 150.6, targets: [149.8, 149.4] };
  const c = sampleCandles({ price: 150.3 }).map(([t, o, h, l, cl]) => [t, o, h + 0.3, l - 0.3, cl]);
  const svg = renderSvg({ candles: c, signal: s });
  assert.ok(svg.includes('>150.200<'));
  assert.ok(svg.includes('>Stop (-40 pips)<'));
  assert.ok(svg.includes(`rx="4" fill="${themes.dark.down}"/><text`));
  assert.ok(svg.includes('>SELL<'));
});

test('candles as objects, Dates and ISO strings', () => {
  const objs = candles.map(([t, open, high, low, close], i) => ({ time: i % 2 ? new Date(t * 1000) : new Date(t * 1000).toISOString(), open, high, low, close }));
  assert.equal(renderSvg({ candles: objs, signal: spec.signal }), renderSvg(spec));
});

test('bad levels are refused', () => {
  assert.throws(() => normalizeSignal({ side: 'buy', entry: 1, stop: 1.1 }), /below its entry/);
  assert.throws(() => normalizeSignal({ side: 'sell', entry: 1, stop: 1.1, targets: [1.2] }), /below its entry/);
  assert.throws(() => normalizeSignal({ side: 'up', entry: 1, stop: 0.9 }), /'buy' or 'sell'/);
  assert.throws(() => renderSvg({ candles: [], signal: spec.signal }), /non-empty/);
  assert.throws(() => renderSvg({ candles: [[0, 1, 0.9, 0.8, 1]], signal: spec.signal }), /high below/);
  assert.deepEqual(normalizeSignal({ side: 'long', entry: 1, stop: 0.9, targets: [1.3, 1.1] }).targets, [1.1, 1.3]);
});

test('text is escaped', () => {
  const svg = renderSvg({ ...spec, signal: { ...spec.signal, pair: 'A<B>&' } }, { title: '"x"' });
  assert.ok(svg.includes('A&lt;B&gt;&amp;'));
  assert.ok(!svg.includes('A<B>'));
});

test('decimals and pips', () => {
  assert.equal(decimalsFor(1.08), 5);
  assert.equal(decimalsFor(150, 'USDJPY'), 3);
  assert.equal(decimalsFor(2650), 2);
  assert.equal(pipFor('EUR/USD'), 0.0001);
  assert.equal(pipFor('GBPJPY'), 0.01);
  assert.equal(pipFor('XAUUSD'), undefined);
  assert.equal(pipFor('US500'), undefined);
});

test('lightweight charts: price lines, zones and remove()', () => {
  const lines = [];
  const attached = [];
  const series = {
    createPriceLine: (o) => { lines.push(o); return o; },
    removePriceLine: (l) => lines.splice(lines.indexOf(l), 1),
    attachPrimitive: (p) => { attached.push(p); p.attached({ chart, series }); },
    detachPrimitive: (p) => attached.splice(attached.indexOf(p), 1),
    priceToCoordinate: (p) => (1.1 - p) * 10000,
  };
  const chart = { timeScale: () => ({ timeToCoordinate: () => 300 }) };
  const handle = addSignalLevels(series, spec.signal);
  assert.deepEqual(lines.map((l) => l.title), ['Entry', 'Stop (25 pips)', 'TP1 (25 pips)', 'TP2 (50 pips)', 'TP3 (75 pips)']);
  assert.equal(attached.length, 1);
  const rects = attached[0].rects(800);
  assert.equal(rects.length, 2);
  assert.equal(rects[0].x, 300);
  assert.equal(rects[0].w, 500);
  assert.ok(Math.abs(rects[0].h - 25) < 1e-6);
  let drawn = 0;
  const ctx = { save() {}, restore() {}, fillRect() { drawn++; }, set fillStyle(v) {}, set globalAlpha(v) {} };
  attached[0].paneViews()[0].renderer().draw({ useBitmapCoordinateSpace: (fn) => fn({ context: ctx, horizontalPixelRatio: 2, verticalPixelRatio: 2, mediaSize: { width: 800, height: 400 } }) });
  assert.equal(drawn, 2);
  handle.remove();
  assert.equal(lines.length, 0);
  assert.equal(attached.length, 0);
});

test('lightweight charts before 4.1: price lines only', () => {
  const lines = [];
  addSignalLevels({ createPriceLine: (o) => (lines.push(o), o), removePriceLine() {} }, spec.signal, { zones: true });
  assert.equal(lines.length, 5);
  assert.equal(new SignalZones(spec.signal).rects(100).length, 0);
});

test('PNG, when @resvg/resvg-js is installed', async (t) => {
  let png;
  try { png = await import('../png.js').then((m) => m.renderPng(spec, { scale: 0.5 })); } catch (e) {
    if (/needs @resvg/.test(e.message)) return t.skip('@resvg/resvg-js not installed');
    throw e;
  }
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});
