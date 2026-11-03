/**
 * signal-chart: candles with a trade's entry, stop and targets, drawn as SVG.
 *
 * Pure: no dependencies, no DOM, no clock. The same input always gives the
 * same SVG, in Node, Deno, Bun and browsers. For a PNG, see `signal-chart/png`.
 * For a chart you already have on lightweight charts, see `addSignalLevels`.
 */

/** The two looks. Override any colour with `theme: { ...themes.dark, entry: '#fff' }`. */
export const themes = Object.freeze({
  dark: Object.freeze({
    background: '#0B0B0D', grid: '#1A1E23', axis: '#2A3038', text: '#8A949E', title: '#FFFFFF',
    up: '#16A34A', down: '#E5484D', entry: '#E8B84A', stop: '#E5484D', target: '#16A34A',
    risk: '#E5484D', reward: '#16A34A', zoneOpacity: 0.12, tagText: '#0B0B0D',
    font: "Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  }),
  light: Object.freeze({
    background: '#FFFFFF', grid: '#F0F3FA', axis: '#D1D4DC', text: '#5D606B', title: '#131722',
    up: '#089981', down: '#F23645', entry: '#B7791F', stop: '#F23645', target: '#089981',
    risk: '#F23645', reward: '#089981', zoneOpacity: 0.1, tagText: '#FFFFFF',
    font: "Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  }),
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `[time, open, high, low, close]` or `{ time, open, high, low, close }` to the object form. */
export function normalizeCandles(candles) {
  if (!Array.isArray(candles) || candles.length === 0) throw new TypeError('signal-chart: candles must be a non-empty array');
  return candles.map((c, i) => {
    const k = Array.isArray(c)
      ? { time: c[0], open: c[1], high: c[2], low: c[3], close: c[4] }
      : { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
    const t = typeof k.time === 'string' ? Date.parse(k.time) / 1000 : k.time instanceof Date ? k.time.getTime() / 1000 : k.time;
    for (const f of ['open', 'high', 'low', 'close']) {
      if (!Number.isFinite(k[f])) throw new TypeError(`signal-chart: candle ${i} has no finite ${f}`);
    }
    if (!Number.isFinite(t)) throw new TypeError(`signal-chart: candle ${i} has no time (Unix seconds, a Date or an ISO string)`);
    if (k.high < Math.max(k.open, k.close) || k.low > Math.min(k.open, k.close)) {
      throw new RangeError(`signal-chart: candle ${i} has a high below its body or a low above it`);
    }
    return { time: t, open: k.open, high: k.high, low: k.low, close: k.close };
  });
}

/** Checks the signal and returns it with `side` as 'buy' or 'sell' and the targets sorted from the entry outwards. */
export function normalizeSignal(signal) {
  if (!signal || typeof signal !== 'object') throw new TypeError('signal-chart: signal is required');
  const raw = String(signal.side ?? '').toLowerCase();
  const side = raw === 'buy' || raw === 'long' ? 'buy' : raw === 'sell' || raw === 'short' ? 'sell' : null;
  if (!side) throw new TypeError("signal-chart: signal.side must be 'buy' or 'sell'");
  const { entry, stop } = signal;
  if (!Number.isFinite(entry)) throw new TypeError('signal-chart: signal.entry must be a number');
  if (!Number.isFinite(stop)) throw new TypeError('signal-chart: signal.stop must be a number');
  const targets = (signal.targets ?? []).slice();
  if (!targets.every(Number.isFinite)) throw new TypeError('signal-chart: signal.targets must be numbers');
  const dir = side === 'buy' ? 1 : -1;
  if ((entry - stop) * dir <= 0) throw new RangeError(`signal-chart: a ${side}'s stop must be ${side === 'buy' ? 'below' : 'above'} its entry`);
  for (const t of targets) {
    if ((t - entry) * dir <= 0) throw new RangeError(`signal-chart: a ${side}'s targets must be ${side === 'buy' ? 'above' : 'below'} its entry`);
  }
  targets.sort((a, b) => (a - b) * dir);
  let time = signal.time;
  if (typeof time === 'string') time = Date.parse(time) / 1000;
  else if (time instanceof Date) time = time.getTime() / 1000;
  return { ...signal, side, entry, stop, targets, time: Number.isFinite(time) ? time : undefined };
}

/** Decimals for a price: from `decimals`, else from the pair (JPY: 3), else from its size. */
export function decimalsFor(price, pair) {
  if (pair && /JPY/i.test(pair)) return 3;
  const a = Math.abs(price);
  if (a >= 10000) return 1;
  if (a >= 1000) return 2;
  if (a >= 50) return 3;
  return 5;
}

/** The pip size of a pair: 0.01 for yen pairs, 0.0001 for other forex, else undefined (metals, indices: pass `pip`). */
export function pipFor(pair) {
  if (!pair) return undefined;
  const p = pair.replace(/[^A-Z]/gi, '').toUpperCase();
  if (p.length !== 6 || /^X(AU|AG|PT|PD)/.test(p)) return undefined;
  return p.includes('JPY') ? 0.01 : 0.0001;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;

function niceStep(span, count) {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

function timeLabel(sec, withDate) {
  const d = new Date(sec * 1000);
  const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return withDate ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hm}` : hm;
}

/**
 * The chart as an SVG document (a string).
 *
 * @param {object} spec
 * @param {Array} spec.candles  `[time, open, high, low, close]` or objects; time in Unix seconds (or a Date / ISO string)
 * @param {object} spec.signal  `{ side, entry, stop, targets?, time?, pair? }`
 * @param {object} [options]    `{ width, height, theme, decimals, pip, timeframe, title, rightSpace, watermark }`
 */
export function renderSvg(spec, options = {}) {
  const candles = normalizeCandles(spec?.candles);
  const signal = normalizeSignal(spec?.signal);
  const theme = { ...themes.dark, ...(typeof options.theme === 'string' ? themes[options.theme] : options.theme) };
  const W = Math.max(320, Math.round(options.width ?? 1200));
  const H = Math.max(200, Math.round(options.height ?? 675));
  const pair = signal.pair ?? spec.pair;
  const dec = options.decimals ?? decimalsFor(signal.entry, pair);
  const pip = options.pip ?? pipFor(pair);
  const fmt = (p) => p.toFixed(dec);
  const font = esc(theme.font);
  const small = W < 600;
  const fs = small ? 10 : 12;

  // Layout: a header band, the plot, the price axis on the right, the time axis under it.
  const axisW = Math.round(fs * 0.62 * (fmt(signal.entry).length + 5) + 14);
  const P = { l: 12, r: W - axisW, t: small ? 40 : 52, b: H - (small ? 24 : 28) };

  // Time: one slot per candle, plus empty slots on the right for the levels to run into.
  const rightSpace = Math.max(0, Math.round(options.rightSpace ?? Math.max(4, candles.length * 0.12)));
  const slots = candles.length + rightSpace;
  const step = (P.r - P.l) / slots;
  const x = (i) => P.l + step * (i + 0.5);
  let sigIdx = candles.length - 1;
  if (signal.time !== undefined) {
    const found = candles.findIndex((c) => c.time >= signal.time);
    sigIdx = found === -1 ? candles.length - 1 : found;
  }

  // Price: every candle and every level in view, with a margin.
  const prices = [signal.entry, signal.stop, ...signal.targets];
  let lo = Math.min(...candles.map((c) => c.low), ...prices);
  let hi = Math.max(...candles.map((c) => c.high), ...prices);
  if (hi === lo) { hi += Math.abs(hi) * 0.001 || 1; lo -= Math.abs(lo) * 0.001 || 1; }
  const pad = (hi - lo) * 0.06;
  lo -= pad; hi += pad;
  const y = (p) => P.t + ((hi - p) / (hi - lo)) * (P.b - P.t);

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${font}" role="img" aria-label="${esc(describe(signal, pair, fmt))}">`);
  out.push(`<title>${esc(describe(signal, pair, fmt))}</title>`);
  out.push(`<rect width="${W}" height="${H}" fill="${theme.background}"/>`);
  out.push(`<defs><clipPath id="sc-plot"><rect x="${P.l}" y="${P.t}" width="${r1(P.r - P.l)}" height="${r1(P.b - P.t)}"/></clipPath></defs>`);

  // Grid and price labels.
  const gstep = niceStep(hi - lo, small ? 4 : 6);
  const grid = [];
  for (let g = Math.ceil(lo / gstep) * gstep; g <= hi; g += gstep) grid.push(+g.toFixed(10));
  out.push('<g class="grid">');
  for (const g of grid) out.push(`<line x1="${P.l}" x2="${P.r}" y1="${r1(y(g))}" y2="${r1(y(g))}" stroke="${theme.grid}" stroke-width="1"/>`);
  const tcount = Math.max(2, Math.floor((P.r - P.l) / (small ? 110 : 170)));
  const every = Math.max(1, Math.ceil(candles.length / tcount));
  const ticks = [];
  for (let i = 0; i < candles.length; i += every) ticks.push(i);
  for (const i of ticks) out.push(`<line x1="${r1(x(i))}" x2="${r1(x(i))}" y1="${P.t}" y2="${P.b}" stroke="${theme.grid}" stroke-width="1"/>`);
  out.push('</g>');

  // Zones: the risk (entry to stop) and the reward (entry to the last target), from the signal onwards.
  const zx = x(sigIdx) - step / 2;
  const zone = (a, b, color, cls) => `<rect class="${cls}" x="${r1(zx)}" y="${r1(y(Math.max(a, b)))}" width="${r1(P.r - zx)}" height="${r1(Math.abs(y(a) - y(b)))}" fill="${color}" fill-opacity="${theme.zoneOpacity}"/>`;
  out.push('<g clip-path="url(#sc-plot)">');
  out.push(zone(signal.entry, signal.stop, theme.risk, 'risk'));
  if (signal.targets.length) out.push(zone(signal.entry, signal.targets.at(-1), theme.reward, 'reward'));

  // Candles.
  const bw = Math.max(1, step * 0.68);
  out.push('<g class="candles">');
  candles.forEach((c, i) => {
    const col = c.close >= c.open ? theme.up : theme.down;
    const top = y(Math.max(c.open, c.close));
    const h = Math.max(1, y(Math.min(c.open, c.close)) - top);
    out.push(`<line x1="${r1(x(i))}" x2="${r1(x(i))}" y1="${r1(y(c.high))}" y2="${r1(y(c.low))}" stroke="${col}" stroke-width="1"/>` +
      `<rect x="${r1(x(i) - bw / 2)}" y="${r1(top)}" width="${r1(bw)}" height="${r1(h)}" fill="${col}"/>`);
  });
  out.push('</g>');

  // Level lines: entry and stop solid, targets dashed, from the signal to the right edge (faint before it).
  const levels = [
    { name: 'Entry', price: signal.entry, color: theme.entry, dash: '' },
    { name: 'Stop', price: signal.stop, color: theme.stop, dash: '' },
    ...signal.targets.map((p, i) => ({ name: signal.targets.length > 1 ? `TP${i + 1}` : 'TP', price: p, color: theme.target, dash: '6 4' })),
  ];
  out.push('<g class="levels">');
  for (const L of levels) {
    const ly = r1(y(L.price));
    const dash = L.dash ? ` stroke-dasharray="${L.dash}"` : '';
    out.push(`<line x1="${P.l}" x2="${r1(zx)}" y1="${ly}" y2="${ly}" stroke="${L.color}" stroke-width="1" stroke-opacity="0.35"${dash}/>`);
    out.push(`<line x1="${r1(zx)}" x2="${P.r}" y1="${ly}" y2="${ly}" stroke="${L.color}" stroke-width="1.5"${dash}/>`);
  }
  // The signal: a dotted line at its candle and a dot at the entry.
  out.push(`<line x1="${r1(x(sigIdx))}" x2="${r1(x(sigIdx))}" y1="${P.t}" y2="${P.b}" stroke="${theme.text}" stroke-width="1" stroke-dasharray="2 4" stroke-opacity="0.6"/>`);
  out.push(`<circle cx="${r1(x(sigIdx))}" cy="${r1(y(signal.entry))}" r="${small ? 3 : 4}" fill="${theme.entry}" stroke="${theme.background}" stroke-width="1.5"/>`);
  out.push('</g></g>');

  // Level names inside the plot, at the right end, above each line.
  const pipsOf = (p) => (pip ? Math.round(Math.abs(p - signal.entry) / pip) : null);
  out.push(`<g class="names" font-size="${fs}" font-weight="600" text-anchor="end">`);
  for (const L of placeTags(levels.map((L) => ({ ...L, y: y(L.price) - fs * 0.55 })), fs + 3, P.t + fs, P.b - 2)) {
    const p = L.name === 'Entry' ? null : pipsOf(L.price);
    const extra = p === null ? '' : ` (${L.name === 'Stop' ? '-' : '+'}${p} pips)`;
    out.push(`<text x="${r1(P.r - 6)}" y="${r1(L.y)}" fill="${L.color}">${esc(L.name + extra)}</text>`);
  }
  out.push('</g>');

  // The price axis: grid labels, then a coloured tag for each level.
  out.push(`<line x1="${P.r}" x2="${P.r}" y1="${P.t}" y2="${P.b}" stroke="${theme.axis}"/>`);
  const tags = placeTags(levels.map((L) => ({ ...L, y: y(L.price) })), fs + 7, P.t + (fs + 7) / 2, P.b - (fs + 7) / 2);
  out.push(`<g class="axis" font-size="${fs}" fill="${theme.text}">`);
  for (const g of grid) {
    const gy = y(g);
    if (gy < P.t + fs / 2 || gy > P.b - fs / 2 || tags.some((t) => Math.abs(t.y - gy) < fs + 4)) continue;
    out.push(`<text x="${P.r + 8}" y="${r1(gy + fs * 0.35)}">${fmt(g)}</text>`);
  }
  for (const i of ticks) {
    const withDate = i === ticks[0] || new Date(candles[i].time * 1000).getUTCDate() !== new Date(candles[ticks[ticks.indexOf(i) - 1]].time * 1000).getUTCDate();
    const label = timeLabel(candles[i].time, withDate);
    const clip = x(i) - label.length * fs * 0.3 < 2;
    out.push(`<text x="${r1(clip ? P.l : x(i))}" y="${r1(P.b + fs + 6)}" text-anchor="${clip ? 'start' : 'middle'}">${esc(label)}</text>`);
  }
  out.push('</g>');
  out.push(`<g class="tags" font-size="${fs}" font-weight="600">`);
  for (const t of tags) {
    const th = fs + 6;
    out.push(`<rect x="${P.r + 2}" y="${r1(t.y - th / 2)}" width="${axisW - 4}" height="${th}" rx="3" fill="${t.color}"/>` +
      `<text x="${P.r + 8}" y="${r1(t.y + fs * 0.35)}" fill="${theme.tagText}">${fmt(t.price)}</text>`);
  }
  out.push('</g>');

  // Header: pair, side, timeframe, title.
  const hy = small ? 25 : 32;
  const sideCol = signal.side === 'buy' ? theme.up : theme.down;
  const hfs = small ? 15 : 20;
  let hx = P.l + 4;
  out.push(`<g class="header">`);
  if (pair) {
    out.push(`<text x="${hx}" y="${hy}" font-size="${hfs}" font-weight="700" fill="${theme.title}">${esc(pair)}</text>`);
    hx += Math.round(pair.length * hfs * 0.68) + 12;
  }
  const sideTxt = signal.side.toUpperCase();
  const pw = Math.round(sideTxt.length * fs * 0.75 + 16);
  out.push(`<rect x="${hx}" y="${hy - fs - 4}" width="${pw}" height="${fs + 9}" rx="4" fill="${sideCol}"/>` +
    `<text x="${hx + pw / 2}" y="${hy}" font-size="${fs}" font-weight="700" fill="${theme.tagText}" text-anchor="middle">${sideTxt}</text>`);
  hx += pw + 12;
  const sub = [options.timeframe, options.title ?? signal.title].filter(Boolean).join(' · ');
  if (sub) out.push(`<text x="${hx}" y="${hy}" font-size="${fs + 1}" fill="${theme.text}">${esc(sub)}</text>`);
  if (options.watermark) out.push(`<text x="${P.r - 6}" y="${hy}" font-size="${fs}" fill="${theme.text}" text-anchor="end" opacity="0.7">${esc(options.watermark)}</text>`);
  out.push('</g>');
  out.push('</svg>');
  return out.join('\n') + '\n';
}

/** A one-line description of the signal (the SVG's title, for screen readers). */
export function describe(signal, pair, fmt = String) {
  const s = normalizeSignal(signal);
  const name = pair ?? s.pair;
  return `${name ? name + ' ' : ''}${s.side}: entry ${fmt(s.entry)}, stop ${fmt(s.stop)}` +
    (s.targets.length ? `, targets ${s.targets.map(fmt).join(', ')}` : '');
}

/** Moves labels apart so none overlaps, keeping them as near their lines as possible and inside [min, max]. */
function placeTags(items, gap, min, max) {
  const order = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) {
    if (order[k].y - order[k - 1].y < gap) order[k].y = order[k - 1].y + gap;
  }
  if (order.length && order.at(-1).y > max) {
    order.at(-1).y = max;
    for (let k = order.length - 2; k >= 0; k--) {
      if (order[k + 1].y - order[k].y < gap) order[k].y = order[k + 1].y - gap;
    }
  }
  for (const o of order) o.y = Math.max(min, o.y);
  return order.sort((a, b) => a.i - b.i);
}

/* ------------------------------------------------------------------------ *
 * lightweight charts: the same levels on a chart you already have.
 * Works with lightweight-charts 4.1+ and 5 (it never imports the library).
 * ------------------------------------------------------------------------ */

const LINE_SOLID = 0;
const LINE_DASHED = 2;

/**
 * Adds the entry, stop and target price lines (and, where the library supports
 * series primitives, the risk and reward zones) to a candlestick series.
 * Returns `{ remove() }` to take them all off again.
 */
export function addSignalLevels(series, signal, options = {}) {
  if (!series || typeof series.createPriceLine !== 'function') throw new TypeError('signal-chart: pass a lightweight-charts series');
  const s = normalizeSignal(signal);
  const theme = { ...themes.dark, ...(typeof options.theme === 'string' ? themes[options.theme] : options.theme) };
  const pip = options.pip ?? pipFor(s.pair);
  const pips = (p) => (pip ? ` (${Math.round(Math.abs(p - s.entry) / pip)} pips)` : '');
  const lines = [
    series.createPriceLine({ price: s.entry, color: theme.entry, lineWidth: 2, lineStyle: LINE_SOLID, axisLabelVisible: true, title: 'Entry' }),
    series.createPriceLine({ price: s.stop, color: theme.stop, lineWidth: 2, lineStyle: LINE_SOLID, axisLabelVisible: true, title: `Stop${pips(s.stop)}` }),
    ...s.targets.map((p, i) => series.createPriceLine({
      price: p, color: theme.target, lineWidth: 1, lineStyle: LINE_DASHED, axisLabelVisible: true,
      title: `${s.targets.length > 1 ? `TP${i + 1}` : 'TP'}${pips(p)}`,
    })),
  ];
  let primitive = null;
  if (options.zones !== false && typeof series.attachPrimitive === 'function') {
    primitive = new SignalZones(s, theme);
    series.attachPrimitive(primitive);
  }
  return {
    lines,
    remove() {
      for (const l of lines) series.removePriceLine(l);
      if (primitive && typeof series.detachPrimitive === 'function') series.detachPrimitive(primitive);
      lines.length = 0;
      primitive = null;
    },
  };
}

/** A series primitive that shades the risk and reward from the signal's time to the right edge. */
export class SignalZones {
  constructor(signal, theme = themes.dark) {
    this.signal = normalizeSignal(signal);
    this.theme = { ...themes.dark, ...theme };
    this._chart = null;
    this._series = null;
    const self = this;
    this._view = {
      zOrder: () => 'bottom',
      renderer: () => ({ draw: (target) => self._draw(target) }),
    };
  }
  attached({ chart, series }) { this._chart = chart; this._series = series; }
  detached() { this._chart = null; this._series = null; }
  updateAllViews() {}
  paneViews() { return [this._view]; }
  /** The zones in media (CSS pixel) coordinates, or [] when off screen. Exposed for tests. */
  rects(width) {
    if (!this._series || !this._chart) return [];
    const s = this.signal;
    let x0 = 0;
    if (s.time !== undefined) {
      const c = this._chart.timeScale().timeToCoordinate(s.time);
      if (c !== null && c !== undefined) x0 = c;
    }
    const yOf = (p) => this._series.priceToCoordinate(p);
    const out = [];
    const add = (a, b, color) => {
      const ya = yOf(a), yb = yOf(b);
      if (ya === null || yb === null || ya === undefined || yb === undefined) return;
      out.push({ x: x0, y: Math.min(ya, yb), w: Math.max(0, width - x0), h: Math.abs(ya - yb), color });
    };
    add(s.entry, s.stop, this.theme.risk);
    if (s.targets.length) add(s.entry, s.targets.at(-1), this.theme.reward);
    return out;
  }
  _draw(target) {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio, vr = scope.verticalPixelRatio;
      ctx.save();
      ctx.globalAlpha = this.theme.zoneOpacity;
      for (const r of this.rects(scope.mediaSize.width)) {
        ctx.fillStyle = r.color;
        ctx.fillRect(Math.round(r.x * hr), Math.round(r.y * vr), Math.round(r.w * hr), Math.round(r.h * vr));
      }
      ctx.restore();
    });
  }
}
