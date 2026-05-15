// js/modules/oi.js
// Binance Futures — OI Change Analysis

const BASE = 'https://fapi.binance.com';
const STORAGE_PREFIX = 'oi_snapshots_v1:';

const WINDOWS = [
  { label: '5m', ms: 5 * 60 * 1000 },
  { label: '15m', ms: 15 * 60 * 1000 },
  { label: '1h', ms: 60 * 60 * 1000 }
];

export const OI_SIGNALS = Object.freeze({
  NEW_LONGS: 'new_longs',
  SHORT_SQUEEZE: 'short_squeeze',
  NEW_SHORTS: 'new_shorts',
  LONG_CAPITULATION: 'long_capitulation',
  NEUTRAL: 'neutral'
});

const DEFAULT_THRESHOLDS = Object.freeze({
  oiPctNoise: 0.5,
  pricePctNoise: 0.3,
  spikePct: 3.0
});

let _pollId = null;
let _symbol = '';
let _cacheSymbol = '';
let _thresholds = { ...DEFAULT_THRESHOLDS };
let _cache = [];

function _storageKey(symbol) {
  return `${STORAGE_PREFIX}${symbol.toUpperCase()}`;
}

function _round2(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

function _safePct(cur, past) {
  if (cur === null || past === null || past === 0) return null;
  return ((cur - past) / past) * 100;
}

function _loadSnapshots(symbol) {
  try {
    const raw = localStorage.getItem(_storageKey(symbol));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(s =>
      s &&
      s.symbol === symbol.toUpperCase() &&
      Number.isFinite(s.timestamp) &&
      Number.isFinite(s.open_interest_usd)
    );
  } catch (_) {
    return [];
  }
}

function _saveSnapshots(symbol, snapshots) {
  try {
    localStorage.setItem(_storageKey(symbol), JSON.stringify(snapshots));
  } catch (_) {
    // ignore quota/storage errors
  }
}

function _pruneSnapshots(snapshots, nowTs) {
  const maxAgeMs = 2 * 60 * 60 * 1000;
  const cutoff = nowTs - maxAgeMs;
  return snapshots.filter(s => s.timestamp >= cutoff);
}

function _upsertSnapshot(symbol, snapshot) {
  _cache.push(snapshot);
  _cache.sort((a, b) => a.timestamp - b.timestamp);

  const deduped = [];
  for (const s of _cache) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(last.timestamp - s.timestamp) > 1000) deduped.push(s);
    else deduped[deduped.length - 1] = s;
  }

  _cache = _pruneSnapshots(deduped, snapshot.timestamp);
  _saveSnapshots(symbol, _cache);
}

function _findSnapshotAtOrBefore(snapshots, targetTs) {
  let best = null;
  for (const s of snapshots) {
    if (s.timestamp <= targetTs) best = s;
    else break;
  }
  return best;
}

function _resolveSignal(oiPct, pricePct, thresholds = _thresholds) {
  if (oiPct === null || pricePct === null) return OI_SIGNALS.NEUTRAL;

  const oiNoise = Math.abs(oiPct) < thresholds.oiPctNoise;
  const pxNoise = Math.abs(pricePct) < thresholds.pricePctNoise;
  if (oiNoise || pxNoise) return OI_SIGNALS.NEUTRAL;

  if (pricePct > 0 && oiPct > 0) return OI_SIGNALS.NEW_LONGS;
  if (pricePct > 0 && oiPct < 0) return OI_SIGNALS.SHORT_SQUEEZE;
  if (pricePct < 0 && oiPct > 0) return OI_SIGNALS.NEW_SHORTS;
  if (pricePct < 0 && oiPct < 0) return OI_SIGNALS.LONG_CAPITULATION;
  return OI_SIGNALS.NEUTRAL;
}

async function _fetchOINowContracts(symbol) {
  const url = `${BASE}/fapi/v1/openInterest?symbol=${symbol.toUpperCase()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OI now fetch failed: HTTP ${res.status}`);
  const d = await res.json();
  return parseFloat(d.openInterest);
}

async function _fetchPrice(symbol) {
  const url = `${BASE}/fapi/v1/ticker/price?symbol=${symbol.toUpperCase()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Price fetch failed: HTTP ${res.status}`);
  const d = await res.json();
  return parseFloat(d.price);
}

async function _seedSnapshotsFromHistory(symbol, nowTs) {
  if (_cache.length >= 3) return;
  try {
    const url = `${BASE}/futures/data/openInterestHist?symbol=${symbol.toUpperCase()}&period=5m&limit=14`;
    const res = await fetch(url);
    if (!res.ok) return;
    const hist = await res.json();
    if (!Array.isArray(hist)) return;

    for (const row of hist) {
      const ts = Number(row.timestamp);
      const oiUsd = parseFloat(row.sumOpenInterestValue);
      if (!Number.isFinite(ts) || !Number.isFinite(oiUsd)) continue;
      // history endpoint price sağlamadığından seed için current price'ı kullanmıyoruz
      // seed snapshotları sadece OI lookback doldurmak için kullanılır; price kıyası current snapshot ile yapılır.
      _cache.push({
        symbol: symbol.toUpperCase(),
        timestamp: ts,
        open_interest_usd: oiUsd,
        price: null
      });
    }

    _cache.sort((a, b) => a.timestamp - b.timestamp);
    _cache = _pruneSnapshots(_cache, nowTs);
    _saveSnapshots(symbol, _cache);
  } catch (_) {
    // no-op
  }
}

function _windowResult(label, current, past, thresholds = _thresholds) {
  if (!past) {
    return {
      label,
      window: label,
      oi_usd_pct: null,
      oi_usd_delta: null,
      price_pct: null,
      signal: OI_SIGNALS.NEUTRAL,
      abnormal_oi_spike: false,
      pct: null
    };
  }

  const oiPctRaw = _safePct(current.open_interest_usd, past.open_interest_usd);
  const oiDeltaRaw = current.open_interest_usd - past.open_interest_usd;
  const pricePctRaw = _safePct(current.price, past.price);

  const oiPct = _round2(oiPctRaw);
  const oiDelta = _round2(oiDeltaRaw);
  const pricePct = _round2(pricePctRaw);
  const signal = _resolveSignal(oiPct, pricePct, thresholds);
  const abnormal = oiPct !== null ? Math.abs(oiPct) >= thresholds.spikePct : false;

  return {
    label,
    window: label,
    oi_usd_pct: oiPct,
    oi_usd_delta: oiDelta,
    price_pct: pricePct,
    signal,
    abnormal_oi_spike: abnormal,
    pct: oiPct
  };
}

export async function fetchOIChange(symbol, options = {}) {
  const upper = symbol.toUpperCase();
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };

  const result = {
    symbol: upper,
    ts: Date.now(),
    error: null,
    windows: [],
    oi_change_5m_pct: null,
    oi_change_15m_pct: null,
    oi_change_1h_pct: null,
    oi_change_5m_usd: null,
    oi_change_15m_usd: null,
    oi_change_1h_usd: null,
    oi_signal_5m: OI_SIGNALS.NEUTRAL,
    oi_signal_15m: OI_SIGNALS.NEUTRAL,
    oi_signal_1h: OI_SIGNALS.NEUTRAL,
    oi_abnormal_spike_5m: false,
    oi_abnormal_spike_15m: false,
    oi_abnormal_spike_1h: false,
    thresholds
  };

  try {
    _symbol = upper;
    _thresholds = thresholds;

    const [contractsNow, priceNow] = await Promise.all([
      _fetchOINowContracts(upper),
      _fetchPrice(upper)
    ]);

    const nowTs = Date.now();
    const oiUsdNow = contractsNow * priceNow;

    if (_cacheSymbol !== upper) {
      _cache = _loadSnapshots(upper);
      _cacheSymbol = upper;
    }
    await _seedSnapshotsFromHistory(upper, nowTs);

    const currentSnapshot = {
      symbol: upper,
      timestamp: nowTs,
      open_interest_usd: oiUsdNow,
      price: priceNow
    };

    _upsertSnapshot(upper, currentSnapshot);

    result.price_now = _round2(priceNow);
    result.oi_contracts_now = _round2(contractsNow);
    result.oi_usd_now = _round2(oiUsdNow);

    const windows = WINDOWS.map(w => {
      const target = nowTs - w.ms;
      const past = _findSnapshotAtOrBefore(_cache, target);
      return _windowResult(w.label, currentSnapshot, past, thresholds);
    });

    result.windows = windows;

    const read = (label, key, fallback = null) => {
      const row = windows.find(x => x.label === label);
      return row ? (row[key] ?? fallback) : fallback;
    };

    result.oi_change_5m_pct = read('5m', 'oi_usd_pct');
    result.oi_change_15m_pct = read('15m', 'oi_usd_pct');
    result.oi_change_1h_pct = read('1h', 'oi_usd_pct');

    result.oi_change_5m_usd = read('5m', 'oi_usd_delta');
    result.oi_change_15m_usd = read('15m', 'oi_usd_delta');
    result.oi_change_1h_usd = read('1h', 'oi_usd_delta');

    result.oi_signal_5m = read('5m', 'signal', OI_SIGNALS.NEUTRAL);
    result.oi_signal_15m = read('15m', 'signal', OI_SIGNALS.NEUTRAL);
    result.oi_signal_1h = read('1h', 'signal', OI_SIGNALS.NEUTRAL);

    result.oi_abnormal_spike_5m = Boolean(read('5m', 'abnormal_oi_spike', false));
    result.oi_abnormal_spike_15m = Boolean(read('15m', 'abnormal_oi_spike', false));
    result.oi_abnormal_spike_1h = Boolean(read('1h', 'abnormal_oi_spike', false));
  } catch (e) {
    result.error = e.message;
  }

  return result;
}

export function startOIPoller(symbol, callback, intervalMs = 60_000, options = {}) {
  stopOIPoller();
  const run = async () => callback(await fetchOIChange(symbol, options));
  run();
  _pollId = setInterval(run, intervalMs);
}

export function stopOIPoller() {
  if (_pollId) {
    clearInterval(_pollId);
    _pollId = null;
  }
}

// Backward compatibility
export function startOI(symbol, callback, intervalMs = 60_000) {
  startOIPoller(symbol, callback, intervalMs);
}

export function stopOI() {
  stopOIPoller();
}

export function getOIData() {
  if (!_symbol) return null;
  return {
    symbol: _symbol,
    snapshots: [..._cache]
  };
}

export function resolveSignal(oiPct, pricePct) {
  return _resolveSignal(oiPct, pricePct, _thresholds);
}
