// js/modules/cvd.js
// ─────────────────────────────────────────────────────────────────────────────
// CVD (Cumulative Volume Delta) Analysis Module
// Binance Futures public API — taker buy/sell volume kullanır
//
// Kullanım:
//   import { fetchCVDAnalysis } from './modules/cvd.js';
//   const data = await fetchCVDAnalysis('BTCUSDT');
//   console.log(data);
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://fapi.binance.com';

// ─── Konfigürasyon (magic number yok) ────────────────────────────────────────
const CONFIG = {
    // Kaç bar fetch edilsin (her timeframe için)
    CANDLE_LIMIT: {
        '5m': 50,
        '15m': 50,
        '1h': 50,
    },

    // CVD trend eşiği: CVD'nin kaç birimlik hareketi "strong" sayılır?
    // Coin cinsinden. Küçük altcoin'lerde düşürülmeli.
    CVD_TREND_THRESHOLD: 0,        // sıfırın üstü = bullish, altı = bearish — delta ile karar verilir
    CVD_STRONG_MULTIPLIER: 1.5,    // delta, ortalama deltanın 1.5x'i ise "strongly" kabul edilir

    // Fiyat vs CVD uyuşmazlığı için minimum % fiyat hareketi
    DIVERGENCE_PRICE_THRESHOLD: 0.15,  // %0.15

    // CVD değişimi "anlamlı" sayılması için minimum % eşiği
    DIVERGENCE_CVD_THRESHOLD: 0.10,    // %0.10
};

// ─── Binance Futures klines (OHLCV + taker buy volume) ───────────────────────
// Her bar:
//   [0]  open time
//   [1]  open
//   [4]  close
//   [5]  volume (total quote volume)
//   [9]  taker buy base asset volume  ← bunu kullanıyoruz
//   [10] taker buy quote asset volume
async function _fetchKlines(symbol, interval, limit) {
    const url = `${BASE}/fapi/v1/klines` +
        `?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Klines fetch failed [${interval}]: HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error(`Klines empty response [${interval}]`);
    }
    return data;
}

// ─── Tek bir kline bar'ından delta hesapla ────────────────────────────────────
// delta = buy_volume - sell_volume
// sell_volume = total_volume - taker_buy_volume  (Binance sell'i direkt vermez)
function _barDelta(bar) {
    const totalVol = parseFloat(bar[5]);  // toplam hacim (base asset)
    const takerBuy = parseFloat(bar[9]);  // taker buy volume (base asset)

    if (isNaN(totalVol) || isNaN(takerBuy)) return 0;

    const takerSell = totalVol - takerBuy;
    return takerBuy - takerSell; // pozitif = alıcı baskın, negatif = satıcı baskın
}

// ─── CVD hesabı ───────────────────────────────────────────────────────────────
// CVD[0] = delta[0]
// CVD[n] = CVD[n-1] + delta[n]
// Döner: { cvdSeries, deltaSeries, finalCVD, lastDelta, avgAbsDelta }
function _calcCVD(bars) {
    if (!bars || bars.length === 0) {
        return { cvdSeries: [], deltaSeries: [], finalCVD: 0, lastDelta: 0, avgAbsDelta: 0 };
    }

    const deltaSeries = bars.map(_barDelta);
    const cvdSeries = [];
    let cumulative = 0;

    for (const delta of deltaSeries) {
        cumulative += delta;
        cvdSeries.push(Math.round(cumulative * 100) / 100);
    }

    const finalCVD = cvdSeries[cvdSeries.length - 1];
    const lastDelta = deltaSeries[deltaSeries.length - 1];

    // Ortalama mutlak delta → "strong" eşiği belirlemek için
    const avgAbsDelta = deltaSeries.reduce((s, d) => s + Math.abs(d), 0) / deltaSeries.length;

    return {
        cvdSeries,
        deltaSeries,
        finalCVD: Math.round(finalCVD * 100) / 100,
        lastDelta: Math.round(lastDelta * 100) / 100,
        avgAbsDelta: Math.round(avgAbsDelta * 100) / 100,
    };
}

// ─── CVD trend yorumu ─────────────────────────────────────────────────────────
// Son N bar'ın CVD eğimini kullanır.
// "strongly" = son delta, ortalama mutlak delta'nın STRONG_MULTIPLIER katından büyükse
function _cvdTrend(lastDelta, avgAbsDelta) {
    if (avgAbsDelta === 0) return 'neutral';

    const ratio = Math.abs(lastDelta) / avgAbsDelta;
    const strong = ratio >= CONFIG.CVD_STRONG_MULTIPLIER;

    if (lastDelta > 0) return strong ? 'bullish_strong' : 'bullish';
    if (lastDelta < 0) return strong ? 'bearish_strong' : 'bearish';
    return 'neutral';
}

// ─── Fiyat hareketi hesabı ────────────────────────────────────────────────────
// İlk bar open → son bar close arasındaki % değişim
function _priceChange(bars) {
    if (!bars || bars.length < 2) return 0;
    const open = parseFloat(bars[0][1]);
    const close = parseFloat(bars[bars.length - 1][4]);
    if (open === 0 || isNaN(open) || isNaN(close)) return 0;
    return Math.round(((close - open) / open) * 10000) / 100; // 2 decimal %
}

// ─── Divergence tespiti ───────────────────────────────────────────────────────
// Birden fazla timeframe'den gelen en anlamlı divergence'ı döner.
// Öncelik: 1h > 15m > 5m
//
// Kural:
//   Fiyat ↑  + CVD ↓  → bearish divergence  (fiyat yükseliyor ama alıcı baskısı yok)
//   Fiyat ↓  + CVD ↑  → bullish divergence  (fiyat düşüyor ama satıcı baskısı yok)
//   Diğer             → none
function _detectDivergence(windows) {
    // Öncelik sırasıyla kontrol et
    const priority = ['1h', '15m', '5m'];

    for (const label of priority) {
        const w = windows.find(x => x.label === label);
        if (!w) continue;

        const priceUp = w.priceChangePct > CONFIG.DIVERGENCE_PRICE_THRESHOLD;
        const priceDown = w.priceChangePct < -CONFIG.DIVERGENCE_PRICE_THRESHOLD;

        // CVD'nin anlamlı hareket edip etmediğini kontrol et
        // finalCVD'nin başlangıca göre yönüne bakıyoruz (deltaSeries[0] ile karşılaştır)
        const cvdDelta = w.lastDelta;
        const cvdRising = cvdDelta > w.avgAbsDelta * CONFIG.DIVERGENCE_CVD_THRESHOLD;
        const cvdFalling = cvdDelta < -w.avgAbsDelta * CONFIG.DIVERGENCE_CVD_THRESHOLD;

        if (priceUp && cvdFalling) return 'bearish'; // fiyat ↑, CVD ↓
        if (priceDown && cvdRising) return 'bullish';  // fiyat ↓, CVD ↑
    }

    return 'none';
}

// ─── Sinyal motoru ────────────────────────────────────────────────────────────
// Birincil referans: 15m (kısa-orta vade dengesi)
// Destekçi: 5m (momentum konfirmasyonu), 1h (ana yön)
//
// Allowed values:
//   aggressive_buying | aggressive_selling | possible_absorption |
//   possible_distribution | neutral
function _generateSignal(windows, divergence) {
    const w15 = windows.find(x => x.label === '15m');
    const w5 = windows.find(x => x.label === '5m');
    const w1h = windows.find(x => x.label === '1h');

    if (!w15) return 'neutral';

    const priceUp15 = w15.priceChangePct > CONFIG.DIVERGENCE_PRICE_THRESHOLD;
    const priceDown15 = w15.priceChangePct < -CONFIG.DIVERGENCE_PRICE_THRESHOLD;

    const cvdUp15 = w15.trend === 'bullish_strong' || w15.trend === 'bullish';
    const cvdDown15 = w15.trend === 'bearish_strong' || w15.trend === 'bearish';
    const cvdStrong15 = w15.trend === 'bullish_strong' || w15.trend === 'bearish_strong';

    // ── Aggressive buying: fiyat ↑ + CVD güçlü ↑ ──────────────────────────────
    if (priceUp15 && cvdUp15 && cvdStrong15) return 'aggressive_buying';

    // ── Aggressive selling: fiyat ↓ + CVD güçlü ↓ ────────────────────────────
    if (priceDown15 && cvdDown15 && cvdStrong15) return 'aggressive_selling';

    // ── Possible distribution: fiyat ↑ ama CVD flat/düşük ────────────────────
    // (fiyat itiliyor ama gerçek alıcı baskısı yok → dağıtım olabilir)
    if (priceUp15 && !cvdUp15) return 'possible_distribution';

    // ── Possible absorption: fiyat ↓ ama CVD flat/yüksek ─────────────────────
    // (satış var ama alıcılar absorbe ediyor → dip olabilir)
    if (priceDown15 && !cvdDown15) return 'possible_absorption';

    // ── Divergence override ───────────────────────────────────────────────────
    if (divergence === 'bearish') return 'possible_distribution';
    if (divergence === 'bullish') return 'possible_absorption';

    return 'neutral';
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────
/**
 * CVD analizini çalıştırır ve tam çıktıyı döner.
 *
 * @param {string} symbol  Örn: 'BTCUSDT'
 * @param {Object} [existingCandles]  Opsiyonel: { '5m': bars, '15m': bars, '1h': bars }
 *                                   Zaten fetch edilmiş kline verisi varsa tekrar çekme.
 * @returns {Promise<CVDResult>}
 */
export async function fetchCVDAnalysis(symbol, existingCandles = {}) {
    const sym = symbol.toUpperCase();
    const result = {
        symbol: sym,
        ts: Date.now(),
        error: null,
    };

    try {
        const timeframes = ['5m', '15m', '1h'];
        const windows = [];

        // Kline verilerini paralel fetch et (zaten varsa yeniden kullan)
        const fetches = timeframes.map(async (tf) => {
            const limit = CONFIG.CANDLE_LIMIT[tf];
            const bars = existingCandles[tf] ?? await _fetchKlines(sym, tf, limit);
            return { tf, bars };
        });

        const fetched = await Promise.all(fetches);

        for (const { tf, bars } of fetched) {
            const { finalCVD, lastDelta, avgAbsDelta, cvdSeries, deltaSeries } = _calcCVD(bars);
            const priceChangePct = _priceChange(bars);
            const trend = _cvdTrend(lastDelta, avgAbsDelta);

            // cvd_delta = son bar'ın delta'sı (son penceredeki net alım/satım farkı)
            windows.push({
                label: tf,
                cvd: finalCVD,
                lastDelta,
                avgAbsDelta,
                priceChangePct,
                trend,
            });
        }

        const divergence = _detectDivergence(windows);
        const signal = _generateSignal(windows, divergence);

        // ── Düz alanlar (output.js / buildOutput formatı) ────────────────────────
        const get = (label, key) => {
            const w = windows.find(x => x.label === label);
            return w ? (w[key] ?? null) : null;
        };

        // Trend etiketini sadeleştir (output'ta _strong suffix'i göstermeyebilirsin)
        const simpleTrend = (t) => {
            if (!t) return 'neutral';
            return t.replace('_strong', '');
        };

        result.windows = windows;

        // [CVD_ANALYSIS] blok alanları
        result.cvd_5m = get('5m', 'cvd');
        result.cvd_15m = get('15m', 'cvd');
        result.cvd_1h = get('1h', 'cvd');

        result.cvd_delta_5m = get('5m', 'lastDelta');
        result.cvd_delta_15m = get('15m', 'lastDelta');
        result.cvd_delta_1h = get('1h', 'lastDelta');

        result.cvd_trend_5m = simpleTrend(get('5m', 'trend'));
        result.cvd_trend_15m = simpleTrend(get('15m', 'trend'));
        result.cvd_trend_1h = simpleTrend(get('1h', 'trend'));

        result.cvd_price_divergence = divergence;
        result.cvd_signal = signal;

    } catch (e) {
        result.error = e.message;

        // Hata durumunda güvenli varsayılan değerler
        result.cvd_5m = result.cvd_15m = result.cvd_1h = null;
        result.cvd_delta_5m = result.cvd_delta_15m = result.cvd_delta_1h = null;
        result.cvd_trend_5m = result.cvd_trend_15m = result.cvd_trend_1h = 'neutral';
        result.cvd_price_divergence = 'none';
        result.cvd_signal = 'neutral';
    }

    return result;
}

// ─── buildOutput entegrasyonu için format yardımcısı ─────────────────────────
// output.js'teki buildOutput() içinde şöyle kullan:
//   import { formatCVDBlock } from './modules/cvd.js';
//   output += formatCVDBlock(cvdData);
export function formatCVDBlock(data) {
    if (!data || data.error) {
        return `[CVD_ANALYSIS]\nerror=${data?.error ?? 'unknown'}\n`;
    }

    const f = (v) => v !== null && v !== undefined ? String(v) : 'n/a';
    const sign = (v) => v > 0 ? `+${v}` : String(v);

    return [
        `[CVD_ANALYSIS]`,
        `cvd_5m=${f(data.cvd_5m)}`,
        `cvd_15m=${f(data.cvd_15m)}`,
        `cvd_1h=${f(data.cvd_1h)}`,
        ``,
        `cvd_delta_5m=${data.cvd_delta_5m !== null ? sign(data.cvd_delta_5m) : 'n/a'}`,
        `cvd_delta_15m=${data.cvd_delta_15m !== null ? sign(data.cvd_delta_15m) : 'n/a'}`,
        `cvd_delta_1h=${data.cvd_delta_1h !== null ? sign(data.cvd_delta_1h) : 'n/a'}`,
        ``,
        `cvd_trend_5m=${f(data.cvd_trend_5m)}`,
        `cvd_trend_15m=${f(data.cvd_trend_15m)}`,
        `cvd_trend_1h=${f(data.cvd_trend_1h)}`,
        ``,
        `cvd_price_divergence=${f(data.cvd_price_divergence)}`,
        `cvd_signal=${f(data.cvd_signal)}`,
    ].join('\n');
}