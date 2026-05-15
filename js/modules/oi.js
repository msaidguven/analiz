// js/modules/oi.js
// Binance Futures — OI Change Tracker

const BASE = 'https://fapi.binance.com';

const WINDOWS = [
  { label: '5m', interval: '5m', barsBack: 1 },
  { label: '15m', interval: '5m', barsBack: 3 },
  { label: '1h', interval: '5m', barsBack: 12 }
];

async function _fetchOIHist(symbol, interval = '5m', limit = 20) {
  const url = `${BASE}/futures/data/openInterestHist?symbol=${symbol.toUpperCase()}&period=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OI hist fetch failed: HTTP ${res.status}`);
  return await res.json();
}

async function _fetchPrice(symbol) {
  const url = `${BASE}/fapi/v1/ticker/price?symbol=${symbol.toUpperCase()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Price fetch failed: HTTP ${res.status}`);
  const d = await res.json();
  return parseFloat(d.price);
}

function _signal(oiPct, pricePct) {
  if (oiPct === null || pricePct === null) return 'insufficient';
  const oiUp = oiPct > 1;
  const oiDown = oiPct < -1;
  const prUp = pricePct > 0.3;
  const prDown = pricePct < -0.3;

  if (oiUp && prUp) return 'long_increase';
  if (oiUp && prDown) return 'short_squeeze';
  if (oiDown && prDown) return 'capitulation';
  if (oiDown && prUp) return 'short_cover';
  return 'neutral';
}

export async function fetchOIChange(symbol) {
  const result = {
    symbol: symbol.toUpperCase(),
    ts: Date.now(),
    error: null
  };

  try {
    const maxBars = 14;
    const [hist, priceNow] = await Promise.all([
      _fetchOIHist(symbol, '5m', maxBars),
      _fetchPrice(symbol)
    ]);

    if (!hist || hist.length < 2) {
      throw new Error('Yetersiz OI history verisi');
    }

    const latestBar = hist[hist.length - 1];
    const oiContractsNow = parseFloat(latestBar.sumOpenInterest);
    const oiUsdNow = parseFloat(latestBar.sumOpenInterestValue);

    result.price_now = priceNow;
    result.oi_contracts_now = oiContractsNow;
    result.oi_usd_now = oiUsdNow;

    const windows = [];

    for (const w of WINDOWS) {
      const pastIdx = hist.length - 1 - w.barsBack;

      if (pastIdx < 0) {
        windows.push({
          label: w.label,
          window: w.label,
          signal: 'insufficient',
          note: 'Yetersiz geçmiş veri',
          oi_contracts_pct: null,
          oi_usd_pct: null,
          pct: null
        });
        continue;
      }

      const pastBar = hist[pastIdx];
      const oiCPast = parseFloat(pastBar.sumOpenInterest);
      const oiUPast = parseFloat(pastBar.sumOpenInterestValue);

      const cDelta = oiContractsNow - oiCPast;
      const cPct = (cDelta / oiCPast) * 100;
      const uDelta = oiUsdNow - oiUPast;
      const uPct = (uDelta / oiUPast) * 100;

      const klinesUrl = `${BASE}/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=${w.interval}&limit=${w.barsBack + 1}`;
      let pricePast = null;
      let pricePct = null;

      try {
        const kr = await fetch(klinesUrl);
        if (kr.ok) {
          const kd = await kr.json();
          if (kd && kd.length > 0) {
            pricePast = parseFloat(kd[0][1]);
            pricePct = ((priceNow - pricePast) / pricePast) * 100;
          }
        }
      } catch (_) {
        // price past unavailable
      }

      const signal = _signal(cPct, pricePct);

      windows.push({
        label: w.label,
        window: w.label,
        oi_contracts_now: oiContractsNow,
        oi_contracts_past: oiCPast,
        oi_contracts_delta: cDelta,
        oi_contracts_pct: cPct,
        oi_usd_now: oiUsdNow,
        oi_usd_past: oiUPast,
        oi_usd_delta: uDelta,
        oi_usd_pct: uPct,
        price_now: priceNow,
        price_past: pricePast,
        price_pct: pricePct,
        signal,
        pct: uPct
      });
    }

    result.windows = windows;

    const get = (label, key) => {
      const row = windows.find(x => x.label === label);
      return row ? (row[key] ?? null) : null;
    };

    result.oi_change_5m_pct = get('5m', 'oi_usd_pct');
    result.oi_change_15m_pct = get('15m', 'oi_usd_pct');
    result.oi_change_1h_pct = get('1h', 'oi_usd_pct');

    result.oi_change_5m_usd = get('5m', 'oi_usd_delta');
    result.oi_change_15m_usd = get('15m', 'oi_usd_delta');
    result.oi_change_1h_usd = get('1h', 'oi_usd_delta');
  } catch (e) {
    result.error = e.message;
    result.windows = [];
  }

  return result;
}

let _pollId = null;

export function startOIPoller(symbol, callback, intervalMs = 60_000) {
  stopOIPoller();
  const run = async () => {
    const data = await fetchOIChange(symbol);
    callback(data);
  };
  run();
  _pollId = setInterval(run, intervalMs);
}

export function stopOIPoller() {
  if (_pollId) {
    clearInterval(_pollId);
    _pollId = null;
  }
}

// Backward compatibility for existing detail.js imports
export function startOI(symbol, callback, intervalMs = 60_000) {
  startOIPoller(symbol, callback, intervalMs);
}

export function stopOI() {
  stopOIPoller();
}

export function getOIData() {
  return null;
}

export function resolveSignal(oiPct, pricePct) {
  return _signal(oiPct, pricePct);
}
