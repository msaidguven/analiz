// js/modules/orderbook.js
// Order Book Derinliği — Binance Futures
// 100 bid + 100 ask, tümü göster + AI için kopyalanabilir metin
import { state } from '../state.js';
import { buildOutput } from '../output.js';

const OB_BASE = 'https://fapi.binance.com/fapi/v1';

/* ── API ─────────────────────────────────────────────────────── */

async function getOrderBook(symbol) {
    const res = await fetch(`${OB_BASE}/depth?symbol=${symbol}&limit=100`);
    const data = await res.json();
    return data;
}

/* ── Analiz ──────────────────────────────────────────────────── */

function analyze(bids, asks) {
    const b = bids.map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) }));
    const a = asks.map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) }));

    const totalBid = b.reduce((s, r) => s + r.qty, 0);
    const totalAsk = a.reduce((s, r) => s + r.qty, 0);

    const bestBid = b[0]?.price ?? 0;
    const bestAsk = a[0]?.price ?? 0;
    const spread = bestAsk - bestBid;
    const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;

    const vwapBid = b.reduce((s, r) => s + r.price * r.qty, 0) / totalBid;
    const vwapAsk = a.reduce((s, r) => s + r.price * r.qty, 0) / totalAsk;

    const ratio = totalAsk > 0 ? totalBid / totalAsk : 0;

    const top3Bid = [...b].sort((x, y) => y.qty - x.qty).slice(0, 3);
    const top3Ask = [...a].sort((x, y) => y.qty - x.qty).slice(0, 3);

    let pressure;
    if (ratio > 1.5) pressure = 'güçlü alım baskısı';
    else if (ratio > 1.1) pressure = 'hafif alım baskısı';
    else if (ratio < 0.67) pressure = 'güçlü satış baskısı';
    else if (ratio < 0.9) pressure = 'hafif satış baskısı';
    else pressure = 'dengeli';

    return { b, a, totalBid, totalAsk, bestBid, bestAsk, spread, spreadPct, vwapBid, vwapAsk, ratio, pressure, top3Bid, top3Ask };
}

/* ── Metin çıktısı ───────────────────────────────────────────── */

function buildTextOutput(symbol, stats) {
    const f = n => n.toFixed(4);
    const fp = n => n.toFixed(2);

    const top3BidPrices = new Set(stats.top3Bid.map(r => r.price));
    const top3AskPrices = new Set(stats.top3Ask.map(r => r.price));

    const askRows = stats.a.map((r, i) =>
        `  ${String(i + 1).padStart(3)}. ${fp(r.price).padStart(12)}  ${f(r.qty).padStart(10)}${top3AskPrices.has(r.price) ? '  <-- büyük duvar' : ''}`
    ).join('\n');

    const bidRows = stats.b.map((r, i) =>
        `  ${String(i + 1).padStart(3)}. ${fp(r.price).padStart(12)}  ${f(r.qty).padStart(10)}${top3BidPrices.has(r.price) ? '  <-- büyük duvar' : ''}`
    ).join('\n');

    const top3BidText = stats.top3Bid.map((r, i) => `  ${i + 1}. $${fp(r.price)} — ${f(r.qty)}`).join('\n');
    const top3AskText = stats.top3Ask.map((r, i) => `  ${i + 1}. $${fp(r.price)} — ${f(r.qty)}`).join('\n');

    return `
=== ORDER BOOK DERİNLİĞİ: ${symbol} ===
Zaman: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC
Seviye: 100 bid + 100 ask

--- ASK (Satış Emirleri) — fiyata en yakından uzağa ---
   #      Fiyat ($)       Miktar
${askRows}

--- BID (Alış Emirleri) — fiyata en yakından uzağa ---
   #      Fiyat ($)       Miktar
${bidRows}

--- Özet ---
En iyi bid    : $${fp(stats.bestBid)}
En iyi ask    : $${fp(stats.bestAsk)}
Spread        : $${fp(stats.spread)} (%${stats.spreadPct.toFixed(4)})
Toplam bid    : ${f(stats.totalBid)}
Toplam ask    : ${f(stats.totalAsk)}
Bid/Ask oranı : ${stats.ratio.toFixed(3)} (1.0 = dengeli)
Baskı         : ${stats.pressure}
VWAP bid      : $${fp(stats.vwapBid)}
VWAP ask      : $${fp(stats.vwapAsk)}

--- En Büyük 3 Bid Duvarı ---
${top3BidText}

--- En Büyük 3 Ask Duvarı ---
${top3AskText}

NOT: Anlık snapshot. Iceberg emirleri ve OTC işlemler görünmez.
`.trim();
}

/* ── Render ──────────────────────────────────────────────────── */

async function renderOrderBook(symbol, container) {
    container.innerHTML = '<span style="color:#888;font-size:12px">Order book yükleniyor…</span>';

    try {
        const raw = await getOrderBook(symbol);
        const stats = analyze(raw.bids, raw.asks);
        const output = buildTextOutput(symbol, stats);

        state.orderbookData = {
            symbol,
            lastUpdateId: raw?.lastUpdateId ?? null,
            fetchedAt: Date.now(),
            stats,
            bids: stats.b.map((r) => ({ price: r.price, qty: r.qty })),
            asks: stats.a.map((r) => ({ price: r.price, qty: r.qty })),
            top3Bid: stats.top3Bid,
            top3Ask: stats.top3Ask,
            textOutput: output,
        };
        if (state.detailData && symbol === state.currentSymbol) {
            state.detailData.orderbookData = state.orderbookData;
            buildOutput(state.detailData, symbol);
        }

        const f = n => n.toFixed(4);
        const fp = n => n.toFixed(2);

        const maxQty = Math.max(...stats.b.map(r => r.qty), ...stats.a.map(r => r.qty));
        const top3BidPrices = new Set(stats.top3Bid.map(r => r.price));
        const top3AskPrices = new Set(stats.top3Ask.map(r => r.price));

        const makeRows = (rows, hexColor, rgbColor, topSet) =>
            rows.map(r => {
                const barPct = (r.qty / maxQty * 100).toFixed(1);
                const isTop = topSet.has(r.price);
                return `<tr style="${isTop ? `background:rgba(${rgbColor},0.08)` : ''}">
          <td style="padding:1px 6px 1px 0;color:#${hexColor};text-align:right;white-space:nowrap">${fp(r.price)}</td>
          <td style="padding:1px 6px;color:${isTop ? '#fff' : '#ccc'};text-align:right;white-space:nowrap;font-weight:${isTop ? 700 : 400}">${f(r.qty)}</td>
          <td style="width:100px;padding:1px 0">
            <div style="height:6px;background:#${hexColor};width:${barPct}%;opacity:${isTop ? 1 : 0.4};border-radius:2px"></div>
          </td>
          ${isTop ? `<td style="color:#888;font-size:10px;padding-left:4px;white-space:nowrap">duvar</td>` : '<td></td>'}
        </tr>`;
            }).join('');

        const askRowsHtml = makeRows([...stats.a].reverse(), 'f87171', '248,113,113', top3AskPrices);
        const bidRowsHtml = makeRows(stats.b, '86efac', '134,239,172', top3BidPrices);
        const ratioCol = stats.ratio > 1.1 ? '#86efac' : stats.ratio < 0.9 ? '#f87171' : '#ccc';

        container.innerHTML = `
      <div style="font-family:monospace;font-size:12px;line-height:1.6">

        <div style="margin-bottom:6px;color:#aaa">
          Order Book · 100 seviye · ${new Date().toISOString().slice(11, 16)} UTC
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;color:#ccc;margin-bottom:10px">
          <span>Bid/Ask: <b style="color:${ratioCol}">${stats.ratio.toFixed(3)}</b></span>
          <span>Baskı: <b style="color:${ratioCol}">${stats.pressure}</b></span>
          <span>Spread: <b>$${fp(stats.spread)} (%${stats.spreadPct.toFixed(4)})</b></span>
          <span>Toplam bid/ask: <b>${f(stats.totalBid)} / ${f(stats.totalAsk)}</b></span>
          <span>VWAP bid: <b>$${fp(stats.vwapBid)}</b></span>
          <span>VWAP ask: <b>$${fp(stats.vwapAsk)}</b></span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:11px;color:#888">
          <div>
            <div style="margin-bottom:3px">En büyük 3 ask duvarı:</div>
            ${stats.top3Ask.map(r => `<div style="color:#f87171">$${fp(r.price)} — ${f(r.qty)}</div>`).join('')}
          </div>
          <div>
            <div style="margin-bottom:3px">En büyük 3 bid duvarı:</div>
            ${stats.top3Bid.map(r => `<div style="color:#86efac">$${fp(r.price)} — ${f(r.qty)}</div>`).join('')}
          </div>
        </div>

        <div style="max-height:500px;overflow-y:auto;border:1px solid #222;border-radius:4px">
          <table style="border-collapse:collapse;width:100%">
            <thead style="position:sticky;top:0;background:#111;z-index:1">
              <tr style="color:#888;font-size:11px">
                <th style="text-align:right;padding:4px 6px 4px 0">Fiyat</th>
                <th style="text-align:right;padding:4px 6px">Miktar</th>
                <th style="text-align:left;padding:4px 0">Derinlik</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${askRowsHtml}
              <tr>
                <td colspan="4" style="padding:5px 0;text-align:center;color:#444;font-size:11px;border-top:1px solid #333;border-bottom:1px solid #333">
                  ── spread $${fp(stats.spread)} ──
                </td>
              </tr>
              ${bidRowsHtml}
            </tbody>
          </table>
        </div>

        <div style="margin-top:8px;display:flex;gap:8px">
          <button onclick="
            navigator.clipboard.writeText(${JSON.stringify(output)});
            this.textContent='Kopyalandı ✓';
            setTimeout(()=>this.textContent='AI için kopyala',1500)
          " style="font-family:monospace;font-size:11px;background:none;border:1px solid #444;color:#aaa;padding:4px 10px;cursor:pointer;border-radius:4px">
            AI için kopyala
          </button>
          <button onclick="renderOrderBook('${symbol}', this.closest('div').parentElement)"
          style="font-family:monospace;font-size:11px;background:none;border:1px solid #444;color:#aaa;padding:4px 10px;cursor:pointer;border-radius:4px">
            Yenile
          </button>
        </div>

      </div>`;

    } catch (err) {
        container.innerHTML = `<span style="color:#f87171;font-size:12px">Hata: ${err.message}</span>`;
    }
}

/* ── Export ──────────────────────────────────────────────────── */
export { renderOrderBook, getOrderBook, analyze, buildTextOutput };
