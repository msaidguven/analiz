// js/modules/funding.js
// Funding Rate History — Binance Futures
// 1h → 72 periyot (3 gün) | 4h → 42 periyot (7 gün) | 8h → 21 periyot (7 gün)
import { state } from '../state.js';
import { buildOutput } from '../output.js';

const FUNDING_BASE = 'https://fapi.binance.com/fapi/v1';
const PERIODS = { 1: 72, 4: 42, 8: 21 };

/* ── API ─────────────────────────────────────────────────────── */

async function getFundingInterval(symbol) {
    const res = await fetch(`${FUNDING_BASE}/fundingInfo`);
    const data = await res.json();
    const item = data.find(d => d.symbol === symbol);
    return item?.fundingIntervalHours ?? 8;
}

async function getFundingHistory(symbol, limit) {
    const res = await fetch(`${FUNDING_BASE}/fundingRate?symbol=${symbol}&limit=${limit}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

async function getPremiumIndex(symbol) {
    const res = await fetch(`${FUNDING_BASE}/premiumIndex?symbol=${symbol}`);
    return res.json();
}

/* ── Analiz ──────────────────────────────────────────────────── */

function analyze(history, interval) {
    const rates = history.map(h => parseFloat(h.fundingRate));
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    const last = rates.at(-1);
    const prev = rates.at(-2) ?? last;

    // Kümülatif maliyet — 1000$ pozisyon üzerinden
    // Her ödeme: pozisyon_değeri × funding_rate
    const cumulative = rates.reduce((a, b) => a + b, 0);       // toplam oran
    const cumulativePct = cumulative * 100;                         // %
    const costPer1000 = Math.abs(cumulative) * 1000;              // 1000$ için dolar maliyet
    const costPer10k = Math.abs(cumulative) * 10000;

    // Günlük ortalama maliyet
    const totalDays = (history.length * interval) / 24;
    const dailyCostPer1000 = costPer1000 / totalDays;

    // Kaç periyottur aynı yön?
    const dir = last >= 0 ? 1 : -1;
    let streak = 0;
    for (let i = rates.length - 1; i >= 0; i--) {
        if ((rates[i] >= 0 ? 1 : -1) === dir) streak++;
        else break;
    }

    // Streak kümülatif maliyet (sadece streak periyotları)
    const streakRates = rates.slice(-streak);
    const streakCumulative = streakRates.reduce((a, b) => a + b, 0);
    const streakCostPer1000 = Math.abs(streakCumulative) * 1000;

    // Son 3 trend
    const t = rates.slice(-3);
    const trend =
        t.length === 3 && t[0] < t[1] && t[1] < t[2] ? 'artıyor' :
            t.length === 3 && t[0] > t[1] && t[1] > t[2] ? 'azalıyor' : 'kararsız';

    // 1 günlük ve 3 günlük alt pencere ortalamaları
    const periodsPerDay = 24 / interval;
    const last1d = rates.slice(-periodsPerDay);
    const last3d = rates.slice(-(periodsPerDay * 3));
    const avg1d = last1d.reduce((a, b) => a + b, 0) / last1d.length;
    const avg3d = last3d.reduce((a, b) => a + b, 0) / last3d.length;

    return {
        rates, avg, avg1d, avg3d, last, prev,
        change: last - prev,
        max: Math.max(...rates),
        min: Math.min(...rates),
        posCount: rates.filter(r => r > 0).length,
        negCount: rates.filter(r => r < 0).length,
        streak,
        streakHours: streak * interval,
        streakCostPer1000,
        direction: dir > 0 ? 'long' : 'short',
        trend,
        cumulative,
        cumulativePct,
        costPer1000,
        costPer10k,
        dailyCostPer1000,
        totalDays,
    };
}

/* ── Metin çıktısı (AI'ye kopyalanacak) ─────────────────────── */

function buildTextOutput(symbol, interval, history, stats, premium) {
    const pct = r => `${r >= 0 ? '+' : ''}${(r * 100).toFixed(4)}%`;
    const ts = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    const usd = n => `$${n.toFixed(4)}`;

    const rows = history.map(h =>
        `  ${ts(h.fundingTime)}  ${pct(parseFloat(h.fundingRate))}`
    ).join('\n');

    const nextTime = premium.nextFundingTime
        ? new Date(premium.nextFundingTime).toISOString().slice(0, 16).replace('T', ' ')
        : '—';

    const baskiYon = stats.direction === 'long'
        ? 'Long baskısı (oran pozitif → longlar short\'lara ödüyor)'
        : 'Short baskısı (oran negatif → short\'lar long\'lara ödüyor)';

    return `
=== FUNDING RATE GEÇMİŞİ: ${symbol} ===
Interval      : ${interval} saatte bir
Pencere       : son ${history.length} periyot (${stats.totalDays.toFixed(1)} gün)

--- Geçmiş Ödemeler ---
${rows}

--- Özet ---
Son oran      : ${pct(stats.last)}
Önceki oran   : ${pct(stats.prev)}
Değişim       : ${pct(stats.change)}
Trend         : ${stats.trend} (son 3 periyot)

Ortalama (tüm pencere) : ${pct(stats.avg)}
Ortalama (son 1 gün)   : ${pct(stats.avg1d)}
Ortalama (son 3 gün)   : ${pct(stats.avg3d)}

Min           : ${pct(stats.min)}
Max           : ${pct(stats.max)}
Pozitif periyot: ${stats.posCount} / ${history.length}
Negatif periyot: ${stats.negCount} / ${history.length}

--- Baskı ---
Yön           : ${baskiYon}
Streak        : ${stats.streak} periyot üst üste (~${stats.streakHours} saat)
Streak maliyet: ${usd(stats.streakCostPer1000)} / $1000 pozisyon (streak boyunca)

--- Kümülatif Maliyet (${stats.totalDays.toFixed(1)} günlük pencere) ---
Toplam oran   : ${pct(stats.cumulative)}
$1.000 pozisyon tutulsaydı : ${usd(stats.costPer1000)} ödenirdi
$10.000 pozisyon tutulsaydı: ${usd(stats.costPer10k)} ödenirdi
Günlük ortalama ($1000)    : ${usd(stats.dailyCostPer1000)} / gün

--- Anlık ---
Tahmini oran  : ${pct(parseFloat(premium.lastFundingRate ?? 0))}
Sonraki ödeme : ${nextTime} UTC
Mark price    : ${premium.markPrice}
Index price   : ${premium.indexPrice}
`.trim();
}

/* ── Render ──────────────────────────────────────────────────── */

async function renderFunding(symbol, container) {
    container.innerHTML = '<span style="color:#888;font-size:12px">Funding yükleniyor…</span>';

    try {
        const interval = await getFundingInterval(symbol);
        const limit = PERIODS[interval] ?? 21;

        const [history, premium] = await Promise.all([
            getFundingHistory(symbol, limit),
            getPremiumIndex(symbol),
        ]);

        if (!history.length) {
            container.innerHTML = '<span style="color:#888;font-size:12px">Veri bulunamadı.</span>';
            return;
        }

        const stats = analyze(history, interval);
        const output = buildTextOutput(symbol, interval, history, stats, premium);
        const pct = r => `${r >= 0 ? '+' : ''}${(r * 100).toFixed(4)}%`;
        const usd = n => `$${n.toFixed(4)}`;

        // Output entegrasyonu: funding sayfası verisini merkezi state'e yaz.
        state.fundingData = {
            symbol,
            intervalHours: interval,
            periodsLoaded: history.length,
            stats,
            premium: {
                lastFundingRate: premium?.lastFundingRate ?? null,
                nextFundingTime: premium?.nextFundingTime ?? null,
                markPrice: premium?.markPrice ?? null,
                indexPrice: premium?.indexPrice ?? null,
            },
            history: history.map((h) => ({
                fundingTime: h.fundingTime,
                fundingRate: h.fundingRate,
            })),
            textOutput: output,
            generatedAt: Date.now(),
        };

        if (state.detailData && symbol === state.currentSymbol) {
            state.detailData.fundingData = state.fundingData;
            buildOutput(state.detailData, symbol);
        }

        container.innerHTML = `
      <div style="font-family:monospace;font-size:12px;line-height:1.7">

        <div style="margin-bottom:6px;color:#aaa">
          Funding · ${interval}h interval · son ${history.length} periyot · ${stats.totalDays.toFixed(1)} gün
        </div>

        <table style="border-collapse:collapse;width:100%;margin-bottom:10px">
          <thead>
            <tr style="color:#888;font-size:11px">
              <th style="text-align:left;padding:2px 8px 2px 0">Zaman (UTC)</th>
              <th style="text-align:right;padding:2px 0">Oran</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(h => {
            const r = parseFloat(h.fundingRate);
            const col = r > 0.0005 ? '#f87171' : r > 0 ? '#fca5a5' : r < -0.0005 ? '#4ade80' : r < 0 ? '#86efac' : '#888';
            const ts = new Date(h.fundingTime).toISOString().slice(0, 16).replace('T', ' ');
            return `<tr>
                <td style="padding:1px 8px 1px 0;color:#ccc">${ts}</td>
                <td style="text-align:right;color:${col};font-weight:600">${pct(r)}</td>
              </tr>`;
        }).join('')}
          </tbody>
        </table>

        <div style="border-top:1px solid #333;padding-top:8px;margin-bottom:8px;
                    display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;color:#ccc">
          <span>Son: <b>${pct(stats.last)}</b></span>
          <span>Ort (7g): <b>${pct(stats.avg)}</b></span>
          <span>Ort (1g): <b>${pct(stats.avg1d)}</b></span>
          <span>Ort (3g): <b>${pct(stats.avg3d)}</b></span>
          <span>Trend: <b>${stats.trend}</b></span>
          <span>Baskı: <b>${stats.direction}</b></span>
          <span>Streak: <b>${stats.streak} periyot (~${stats.streakHours}h)</b></span>
          <span>Streak maliyet: <b>${usd(stats.streakCostPer1000)}/$1k</b></span>
        </div>

        <div style="border-top:1px solid #333;padding-top:8px;margin-bottom:10px;color:#ccc">
          <div style="color:#888;font-size:11px;margin-bottom:4px">
            Kümülatif maliyet (${stats.totalDays.toFixed(1)} gün)
          </div>
          <span>$1k pozisyon: <b>${usd(stats.costPer1000)}</b></span>
          &nbsp;·&nbsp;
          <span>$10k pozisyon: <b>${usd(stats.costPer10k)}</b></span>
          &nbsp;·&nbsp;
          <span>Günlük: <b>${usd(stats.dailyCostPer1000)}/$1k</b></span>
        </div>

        <button onclick="
          navigator.clipboard.writeText(${JSON.stringify(output)});
          this.textContent='Kopyalandı ✓';
          setTimeout(()=>this.textContent='AI için kopyala',1500)
        " style="
          font-family:monospace;font-size:11px;
          background:none;border:1px solid #444;
          color:#aaa;padding:4px 10px;cursor:pointer;border-radius:4px
        ">AI için kopyala</button>

      </div>`;

    } catch (err) {
        container.innerHTML = `<span style="color:#f87171;font-size:12px">Hata: ${err.message}</span>`;
    }
}

/* ── Export ──────────────────────────────────────────────────── */
export { renderFunding, getFundingInterval, getFundingHistory, analyze, buildTextOutput };
