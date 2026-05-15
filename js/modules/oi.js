// js/modules/oi.js
// ─────────────────────────────────────────────────────────────────────────────
// OI Change Tracker — Binance Futures
// Kullanım:
//   import { startOI, stopOI, getOIData } from './modules/oi.js';
//   startOI('BTCUSDT', (data) => renderOI(data));
// ─────────────────────────────────────────────────────────────────────────────

const POLL_MS = 15_000;           // fetch aralığı (ms)
const MAX_AGE = 2 * 3600 * 1000; // 2 saatlik snapshot saklama süresi

const WINDOWS = [
    { label: '5m', seconds: 300 },
    { label: '15m', seconds: 900 },
    { label: '1h', seconds: 3600 },
];

// ─── İç state ─────────────────────────────────────────────────────────────────
let _snapshots = []; // [{ ts: Number, oi: Number }]
let _intervalId = null;
let _symbol = '';
let _callback = null; // her güncellemede dışarıya data döner

// ─── Binance Futures OI fetch ─────────────────────────────────────────────────
async function _fetchOI(symbol) {
    const url = `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol.toUpperCase()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OI fetch failed: HTTP ${res.status}`);
    const data = await res.json();
    return parseFloat(data.openInterest);
}

// ─── Snapshot yönetimi ────────────────────────────────────────────────────────
function _addSnapshot(ts, oi) {
    _snapshots.push({ ts, oi });
    const cutoff = ts - MAX_AGE;
    while (_snapshots.length > 1 && _snapshots[0].ts < cutoff) {
        _snapshots.shift();
    }
}

// ─── OI değişim hesabı ────────────────────────────────────────────────────────
// Dönen obje:
// {
//   window: '5m',
//   pct: Number,          // yüzde değişim
//   abs: Number,          // mutlak değişim (coin)
//   oiNow: Number,
//   oiPast: Number,
//   pastTs: Number,       // epoch ms
//   signal: String,       // 'long_increase' | 'short_squeeze' | 'capitulation' | 'short_cover' | 'neutral' | 'insufficient'
//   note: String          // okunabilir açıklama
// }
function _calcWindow(windowSeconds, oiNow, nowTs) {
    const targetTs = nowTs - windowSeconds * 1000;

    let best = null;
    for (const s of _snapshots) {
        if (s.ts <= targetTs) best = s;
    }

    if (!best) {
        return {
            window: `${windowSeconds / 60}m`,
            pct: null,
            abs: null,
            oiNow,
            oiPast: null,
            pastTs: null,
            signal: 'insufficient',
            note: 'Yetersiz geçmiş veri',
        };
    }

    const pct = ((oiNow - best.oi) / best.oi) * 100;
    const abs = oiNow - best.oi;

    // Sinyal — kesin ayırım için fiyat yönünü dışarıdan besle (price parametresiyle teyit)
    // Tek başına OI ile:
    //   pct > +2  → OI artışı  (new long VEYA short squeeze — fiyata bak)
    //   pct < -2  → OI düşüşü  (capitulation VEYA short cover — fiyata bak)
    //   arada     → nötr
    let signal, note;
    if (pct > 2) {
        signal = 'oi_rising';
        note = 'OI artıyor → new longs veya short squeeze (fiyat ↑ ise new long, ↓ ise squeeze)';
    } else if (pct < -2) {
        signal = 'oi_falling';
        note = 'OI azalıyor → capitulation veya short cover (fiyat ↓ ise capitulation, ↑ ise cover)';
    } else {
        signal = 'neutral';
        note = 'OI stabil → belirgin yön yok';
    }

    return {
        window: windowSeconds < 3600
            ? `${windowSeconds / 60}m`
            : `${windowSeconds / 3600}h`,
        pct,
        abs,
        oiNow,
        oiPast: best.oi,
        pastTs: best.ts,
        signal,
        note,
    };
}

// ─── Tam sinyal (fiyat yönüyle) ───────────────────────────────────────────────
// Eğer anasayfada fiyat değişimini de biliyorsan bunu kullan.
// pricePct: fiyatın aynı penceredeki % değişimi
export function resolveSignal(oiPct, pricePct) {
    if (oiPct === null || pricePct === null) return 'insufficient';
    const oiUp = oiPct > 1;
    const oiDown = oiPct < -1;
    const priceUp = pricePct > 0.5;
    const priceDown = pricePct < -0.5;

    if (oiUp && priceUp) return 'long_increase';   // 🟢 Yeni long açılıyor
    if (oiUp && priceDown) return 'short_squeeze';   // 🟡 Short squeeze
    if (oiDown && priceDown) return 'capitulation';    // 🔴 Long kapatma/panik
    if (oiDown && priceUp) return 'short_cover';     // ⚪ Short kapanıyor
    return 'neutral';
}

// ─── Ana poll döngüsü ─────────────────────────────────────────────────────────
async function _poll() {
    let oi;
    try {
        oi = await _fetchOI(_symbol);
    } catch (e) {
        if (_callback) _callback({ error: e.message, symbol: _symbol });
        return;
    }

    const nowTs = Date.now();
    _addSnapshot(nowTs, oi);

    const windows = WINDOWS.map(w => _calcWindow(w.seconds, oi, nowTs));

    const result = {
        symbol: _symbol,
        ts: nowTs,
        oiNow: oi,
        snapshotCount: _snapshots.length,
        oldestTs: _snapshots[0].ts,
        windows,    // array of window result objects (5m, 15m, 1h)
        error: null,
    };

    if (_callback) _callback(result);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * OI takibini başlatır.
 * @param {string}   symbol   - Örn: 'BTCUSDT'
 * @param {Function} callback - Her poll sonrası çağrılır, argüman: OIData objesi
 */
export function startOI(symbol, callback) {
    stopOI();
    _symbol = symbol.toUpperCase();
    _callback = callback;
    _snapshots = [];
    _poll();
    _intervalId = setInterval(_poll, POLL_MS);
}

/**
 * OI takibini durdurur.
 */
export function stopOI() {
    if (_intervalId) {
        clearInterval(_intervalId);
        _intervalId = null;
    }
}

/**
 * Mevcut snapshot listesini döner (readonly kopya).
 */
export function getSnapshots() {
    return [..._snapshots];
}

/**
 * Anlık OI değişim verisini döner (son snapshot üzerinden).
 * Poll döngüsü dışında manuel çağırmak istersen.
 */
export function getOIData() {
    if (_snapshots.length === 0) return null;
    const last = _snapshots[_snapshots.length - 1];
    const nowTs = last.ts;
    return {
        symbol: _symbol,
        ts: nowTs,
        oiNow: last.oi,
        snapshotCount: _snapshots.length,
        oldestTs: _snapshots[0].ts,
        windows: WINDOWS.map(w => _calcWindow(w.seconds, last.oi, nowTs)),
        error: null,
    };
}