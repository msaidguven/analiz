export function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff >= 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function calcEMA(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

export function calcEMAArray(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function calcMACD(closes) {
  if (closes.length < 35) return null;
  const ema12arr = calcEMAArray(closes, 12);
  const ema26arr = calcEMAArray(closes, 26);
  // align: ema12arr has (n-11) items, ema26arr has (n-25) items
  const offset = 26 - 12;
  const macdLine = ema26arr.map((v, i) => ema12arr[i + offset] - v);
  const signal = calcEMAArray(macdLine, 9);
  const macdVal = macdLine[macdLine.length - 1];
  const signalVal = signal[signal.length - 1];
  const histogram = macdVal - signalVal;
  // previous histogram for divergence check
  const prevMacd = macdLine[macdLine.length - 2];
  const prevSignal = signal[signal.length - 2];
  const prevHisto = prevMacd !== undefined && prevSignal !== undefined ? prevMacd - prevSignal : null;
  return { macd: macdVal, signal: signalVal, histogram, prevHisto };
}

export function calcBollinger(closes, period = 20, multiplier = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const stddev = Math.sqrt(variance);
  return {
    upper: mean + multiplier * stddev,
    middle: mean,
    lower: mean - multiplier * stddev,
    width: ((mean + multiplier * stddev) - (mean - multiplier * stddev)) / mean * 100,
    stddev
  };
}
