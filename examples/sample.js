/**
 * Made-up candles for the examples and the tests: a seeded random walk, so the
 * output is the same on every machine. Not market data.
 */
export function sampleCandles({ count = 96, start = Date.UTC(2026, 9, 14, 0, 0) / 1000, interval = 900, price = 1.08, seed = 7 } = {}) {
  let s = seed >>> 0;
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const out = [];
  let last = price;
  for (let i = 0; i < count; i++) {
    const drift = i > count * 0.6 ? 0.00012 : -0.00003;
    const open = last;
    const close = open + drift + (rand() - 0.5) * 0.0011;
    const high = Math.max(open, close) + rand() * 0.0005;
    const low = Math.min(open, close) - rand() * 0.0005;
    const r = (n) => Math.round(n * 1e5) / 1e5;
    out.push([start + i * interval, r(open), r(high), r(low), r(close)]);
    last = close;
  }
  return out;
}

export const sampleSignal = (candles) => {
  const at = candles[Math.floor(candles.length * 0.8)];
  const entry = at[4];
  return {
    pair: 'EURUSD', side: 'buy', time: at[0],
    entry, stop: +(entry - 0.0025).toFixed(5),
    targets: [0.0025, 0.005, 0.0075].map((d) => +(entry + d).toFixed(5)),
  };
};
