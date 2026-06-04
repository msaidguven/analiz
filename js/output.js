import { state } from './state.js';

// ==================== EKLENECEK YENİ FONKSİYONLAR ====================

/**
 * 5 dakikalık snapshot'ları saatlik dilimlere dönüştürür.
 * Her saatlik dilim için OHLC fiyat, son değerler, ortalamalar, toplam deltalar ve mod sinyal hesaplar.
 */
function aggregateSnapshotsToHourly(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const hourly = new Map();

  rows.forEach((row) => {
    const ts = new Date(row.ts);
    if (Number.isNaN(ts.getTime())) return;
    ts.setMinutes(0, 0, 0); // Saat başına yuvarla
    const key = ts.toISOString();

    if (!hourly.has(key)) {
      hourly.set(key, {
        ts: key,
        prices: [],
        long_pcts: [],
        short_pcts: [],
        funding_rates: [],
        oi_usds: [],
        ba_ratios: [],
        vwap_bids: [],
        vwap_asks: [],
        mark_index_diffs: [],
        rsi_15ms: [],
        rsi_1hs: [],
        rsi_4hs: [],
        rsi_1ds: [],
        rsi_1ws: [],
        cvd_delta_5m_sum: 0,
        cvd_delta_15m_sum: 0,
        cvd_delta_1h_sum: 0,
        cvd_signals: [],
        cvd_divergences: [],
        volume_24hs: [],
      });
    }

    const bucket = hourly.get(key);
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

    const price = num(row.price);
    if (price !== null) bucket.prices.push(price);

    const pushIfNum = (arr, val) => { const n = num(val); if (n !== null) arr.push(n); };
    pushIfNum(bucket.long_pcts, row.long_pct);
    pushIfNum(bucket.short_pcts, row.short_pct);
    pushIfNum(bucket.funding_rates, row.funding_rate);
    pushIfNum(bucket.oi_usds, row.oi_usd);
    pushIfNum(bucket.ba_ratios, row.ba_ratio);
    pushIfNum(bucket.vwap_bids, row.vwap_bid);
    pushIfNum(bucket.vwap_asks, row.vwap_ask);
    pushIfNum(bucket.mark_index_diffs, row.mark_index_diff);
    pushIfNum(bucket.rsi_15ms, row.rsi_15m);
    pushIfNum(bucket.rsi_1hs, row.rsi_1h);
    pushIfNum(bucket.rsi_4hs, row.rsi_4h);
    pushIfNum(bucket.rsi_1ds, row.rsi_1d);
    pushIfNum(bucket.rsi_1ws, row.rsi_1w);
    pushIfNum(bucket.volume_24hs, row.volume_24h);

    const cvd5m = num(row.cvd_delta_5m);
    if (cvd5m !== null) bucket.cvd_delta_5m_sum += cvd5m;
    const cvd15m = num(row.cvd_delta_15m);
    if (cvd15m !== null) bucket.cvd_delta_15m_sum += cvd15m;
    const cvd1h = num(row.cvd_delta_1h);
    if (cvd1h !== null) bucket.cvd_delta_1h_sum += cvd1h;

    if (row.cvd_signal) bucket.cvd_signals.push(row.cvd_signal);
    if (row.cvd_divergence) bucket.cvd_divergences.push(row.cvd_divergence);
  });

  const avg = (arr) => {
    const valid = arr.filter((v) => Number.isFinite(v));
    return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
  };

  const mode = (arr) => {
    if (arr.length === 0) return null;
    const counts = {};
    let max = 0, maxVal = arr[0];
    arr.forEach((v) => {
      counts[v] = (counts[v] || 0) + 1;
      if (counts[v] > max) { max = counts[v]; maxVal = v; }
    });
    return maxVal;
  };

  const last = (arr) => arr.length > 0 ? arr[arr.length - 1] : null;

  return Array.from(hourly.values())
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map((bucket) => {
      const prices = bucket.prices.filter((p) => Number.isFinite(p));
      return {
        ts: bucket.ts,
        price_open: prices.length > 0 ? prices[0] : null,
        price_high: prices.length > 0 ? Math.max(...prices) : null,
        price_low: prices.length > 0 ? Math.min(...prices) : null,
        price_close: prices.length > 0 ? prices[prices.length - 1] : null,
        price_avg: avg(prices),
        long_pct: last(bucket.long_pcts),
        short_pct: last(bucket.short_pcts),
        funding_rate: last(bucket.funding_rates),
        oi_usd: last(bucket.oi_usds),
        ba_ratio: avg(bucket.ba_ratios),
        vwap_bid: avg(bucket.vwap_bids),
        vwap_ask: avg(bucket.vwap_asks),
        mark_index_diff: avg(bucket.mark_index_diffs),
        rsi_15m: avg(bucket.rsi_15ms),
        rsi_1h: avg(bucket.rsi_1hs),
        rsi_4h: avg(bucket.rsi_4hs),
        rsi_1d: avg(bucket.rsi_1ds),
        rsi_1w: avg(bucket.rsi_1ws),
        cvd_delta_5m: bucket.cvd_delta_5m_sum,
        cvd_delta_15m: bucket.cvd_delta_15m_sum,
        cvd_delta_1h: bucket.cvd_delta_1h_sum,
        cvd_signal: mode(bucket.cvd_signals),
        cvd_divergence: mode(bucket.cvd_divergences),
        volume_24h: last(bucket.volume_24hs),
        sample_count: prices.length,
      };
    });
}

/**
 * Saatlik snapshot'lar için özet kolonları döndürür.
 */
function getHourlySnapshotColumns() {
  return [
    'ts', 'price_open', 'price_high', 'price_low', 'price_close', 'price_avg',
    'long_pct', 'short_pct', 'funding_rate', 'oi_usd', 'volume_24h',
    'ba_ratio', 'vwap_bid', 'vwap_ask', 'mark_index_diff',
    'cvd_signal', 'cvd_divergence',
    'cvd_delta_5m', 'cvd_delta_15m', 'cvd_delta_1h',
    'rsi_15m', 'rsi_1h', 'rsi_4h', 'rsi_1d', 'rsi_1w',
    'sample_count'
  ];
}


/**
 * Saatlik snapshot satırlarını formatlar.
 */
function formatHourlySnapshotRows(rows, columns = getHourlySnapshotColumns()) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((row, idx) => {
    const parts = columns.map((key) => `${key}:${normalizeSnapshotValue(key, row?.[key])}`);
    return `hourly_snapshot_${idx + 1}=${parts.join('|')}`;
  });
}
// ==================== GÜNCELLENECEK FONKSİYONLAR ====================


function appendFlatObjectLines(text, obj, prefix = '') {
  if (!obj || typeof obj !== 'object') return text;
  const entries = Object.entries(obj);
  entries.forEach(([key, value]) => {
    const normalizedKey = prefix ? `${prefix}_${key}` : key;
    if (value === null || value === undefined) {
      text += `${normalizedKey}=\n`;
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        text += `${normalizedKey}=[]\n`;
        return;
      }
      value.forEach((item, idx) => {
        if (item && typeof item === 'object') {
          text = appendFlatObjectLines(text, item, `${normalizedKey}_${idx}`);
        } else {
          text += `${normalizedKey}_${idx}=${item}\n`;
        }
      });
      return;
    }
    if (typeof value === 'object') {
      text = appendFlatObjectLines(text, value, normalizedKey);
      return;
    }
    text += `${normalizedKey}=${value}\n`;
  });
  return text;
}

function formatFundingHistoryRows(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  return history.map((h, idx) => {
    const rate = Number.parseFloat(h?.fundingRate);
    const ratePct = Number.isFinite(rate) ? (rate * 100) : null;
    const iso = h?.fundingTime ? new Date(h.fundingTime).toISOString() : '';
    return `funding_history_${idx + 1}=${iso}|${ratePct !== null ? ratePct : ''}`;
  });
}

function formatOrderbookRows(rows, side) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((row, idx) => {
    const price = row?.price ?? '';
    const qty = row?.qty ?? '';
    return `orderbook_${side}_${idx + 1}=price:${price}|qty:${qty}`;
  });
}

function normalizeSnapshotValue(key, value) {
  if (value === null || value === undefined) return '';
  if (key === 'ts' || key.endsWith('_ts') || key.endsWith('_time')) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getMarketSnapshotColumns(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const preferred = [
    'id', 'ts', 'symbol', 'price', 'price_change_1h_pct', 'price_change_4h_pct',
    'long_pct', 'short_pct', 'ls_ratio', 'top_trader_long_pct', 'top_trader_short_pct', 'top_trader_ls_ratio',
    'funding_rate', 'oi_usd', 'volume_24h', 'volume_24h_change_pct',
    'bid_total', 'ask_total', 'ba_ratio', 'vwap_bid', 'vwap_ask', 'mark_index_diff',
    'cvd_signal', 'cvd_divergence', 'rsi_1h', 'rsi_4h', 'rsi_1d',
    'cvd_5m', 'cvd_15m', 'cvd_1h', 'cvd_delta_5m', 'cvd_delta_15m', 'cvd_delta_1h'
  ];
  const seen = new Set();
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => seen.add(key));
  });
  return [
    ...preferred.filter((key) => seen.has(key)),
    ...[...seen].filter((key) => !preferred.includes(key)).sort()
  ];
}

function formatMarketSnapshotRows(rows, columns = getMarketSnapshotColumns(rows)) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((row, idx) => {
    const parts = columns.map((key) => `${key}:${normalizeSnapshotValue(key, row?.[key])}`);
    return `market_snapshot_${idx + 1}=${parts.join('|')}`;
  });
}

function getMarketSnapshotSummaryColumns(rows) {
  const preferred = [
    'ts', 'price', 'price_change_1h_pct', 'price_change_4h_pct',
    'long_pct', 'short_pct', 'funding_rate', 'oi_usd', 'volume_24h',
    'ba_ratio', 'cvd_signal', 'cvd_divergence',
    'cvd_delta_5m', 'cvd_delta_15m', 'cvd_delta_1h',
    'rsi_1h', 'rsi_4h', 'rsi_1d'
  ];
  const seen = new Set();
  rows.forEach((row) => Object.keys(row || {}).forEach((key) => seen.add(key)));
  return preferred.filter((key) => seen.has(key));
}

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fixed(value, digits = 4) {
  const n = safeNum(value);
  return n === null ? '' : n.toFixed(digits);
}

function orderbookPressure(ratio) {
  const n = safeNum(ratio);
  if (n === null) return '';
  if (n > 1.5) return 'guclu_alim';
  if (n > 1.1) return 'hafif_alim';
  if (n < 0.67) return 'guclu_satis';
  if (n < 0.9) return 'hafif_satis';
  return 'dengeli';
}

function normalizeOrderbookLevels(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      price: safeNum(row?.price ?? row?.[0]),
      qty: safeNum(row?.qty ?? row?.[1])
    }))
    .filter((row) => row.price !== null && row.qty !== null);
}

function sumQty(rows) {
  return rows.reduce((sum, row) => sum + row.qty, 0);
}

function calcVwap(rows, totalQty = sumQty(rows)) {
  if (!totalQty) return null;
  return rows.reduce((sum, row) => sum + row.price * row.qty, 0) / totalQty;
}

function formatWallList(rows) {
  return rows.map((row) => `price:${row.price}|qty:${row.qty}`).join(',');
}

function buildOrderbookSummaryLines(orderbookPageData, marketPrice) {
  const stats = orderbookPageData?.stats || {};
  const bids = normalizeOrderbookLevels(orderbookPageData?.bids || stats.b);
  const asks = normalizeOrderbookLevels(orderbookPageData?.asks || stats.a);
  if (!bids.length && !asks.length) return [];

  const totalBid = safeNum(stats.totalBid) ?? sumQty(bids);
  const totalAsk = safeNum(stats.totalAsk) ?? sumQty(asks);
  const bestBid = safeNum(stats.bestBid) ?? bids[0]?.price ?? null;
  const bestAsk = safeNum(stats.bestAsk) ?? asks[0]?.price ?? null;
  const spread = safeNum(stats.spread) ?? ((bestBid !== null && bestAsk !== null) ? bestAsk - bestBid : null);
  const spreadPct = safeNum(stats.spreadPct) ?? ((bestBid && spread !== null) ? (spread / bestBid) * 100 : null);
  const ratio = safeNum(stats.ratio) ?? (totalAsk > 0 ? totalBid / totalAsk : null);
  const vwapBid = safeNum(stats.vwapBid) ?? calcVwap(bids, totalBid);
  const vwapAsk = safeNum(stats.vwapAsk) ?? calcVwap(asks, totalAsk);
  const statsTop3Bid = normalizeOrderbookLevels(stats.top3Bid);
  const statsTop3Ask = normalizeOrderbookLevels(stats.top3Ask);
  const top3Bid = statsTop3Bid.length ? statsTop3Bid : [...bids].sort((a, b) => b.qty - a.qty).slice(0, 3);
  const top3Ask = statsTop3Ask.length ? statsTop3Ask : [...asks].sort((a, b) => b.qty - a.qty).slice(0, 3);
  const closestBidWall = top3Bid
    .filter((row) => marketPrice ? row.price <= marketPrice : true)
    .sort((a, b) => b.price - a.price)[0] || top3Bid[0] || null;
  const closestAskWall = top3Ask
    .filter((row) => marketPrice ? row.price >= marketPrice : true)
    .sort((a, b) => a.price - b.price)[0] || top3Ask[0] || null;

  return [
    `orderbook_summary_note=summary_only_raw_100x100_levels_omitted`,
    `orderbook_bid_levels_loaded=${bids.length}`,
    `orderbook_ask_levels_loaded=${asks.length}`,
    `orderbook_best_bid=${bestBid ?? ''}`,
    `orderbook_best_ask=${bestAsk ?? ''}`,
    `orderbook_spread=${fixed(spread, 8)}`,
    `orderbook_spread_pct=${fixed(spreadPct, 4)}`,
    `orderbook_bid_total_qty=${fixed(totalBid, 4)}`,
    `orderbook_ask_total_qty=${fixed(totalAsk, 4)}`,
    `orderbook_bid_ask_ratio=${fixed(ratio, 3)}`,
    `orderbook_pressure=${stats.pressure || orderbookPressure(ratio)}`,
    `orderbook_bid_vwap=${fixed(vwapBid, 8)}`,
    `orderbook_ask_vwap=${fixed(vwapAsk, 8)}`,
    `orderbook_qty_imbalance=${fixed(totalBid - totalAsk, 4)}`,
    `orderbook_closest_strong_bid_wall=${closestBidWall ? `price:${closestBidWall.price}|qty:${closestBidWall.qty}` : ''}`,
    `orderbook_closest_strong_ask_wall=${closestAskWall ? `price:${closestAskWall.price}|qty:${closestAskWall.qty}` : ''}`,
    `orderbook_top_bid_walls=${formatWallList(top3Bid)}`,
    `orderbook_top_ask_walls=${formatWallList(top3Ask)}`
  ];
}

function calcSnapshotChangePct(first, last, key) {
  const a = Number(first?.[key]);
  const b = Number(last?.[key]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return '';
  return ((b - a) / a) * 100;
}

function calcSnapshotDelta(first, last, key) {
  const a = Number(first?.[key]);
  const b = Number(last?.[key]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  return b - a;
}

function fmtMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 4 : 2 })}`;
}

function fmtCompact(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function clsBySign(v) {
  if (!Number.isFinite(Number(v))) return 'neutral';
  return Number(v) >= 0 ? 'up' : 'down';
}

function renderCoinAnalysisPage(d, symbol) {
  const root = document.getElementById('coinAnalysisRender');
  if (!root) return;

  const change = Number(d.change);
  const changeCls = clsBySign(change);
  const funding = Number(d.funding);
  const fundingCls = clsBySign(-funding);
  const oi5m = state.oiData?.windows?.find((w) => w.window === '5m');
  const oiDelta = Number(oi5m?.oi_usd_delta);
  const oiDeltaCls = clsBySign(oiDelta);
  const longPct = Number(d.longPct);
  const shortPct = Number(d.shortPct);
  const ratio = Number(d.lsRatio);

  const supports = state.srData?.supports || [];
  const resistances = state.srData?.resistances || [];
  const bids = state.orderbookData?.bids || [];
  const asks = state.orderbookData?.asks || [];

  root.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#888;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:0.5rem;">
      ${symbol} · ${new Date().toLocaleString('tr-TR')}
    </div>
    <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:0.3rem;">
      <span style="font-size:36px;font-weight:700;color:#1a1a1a;">${fmtMoney(d.price)}</span>
      <span class="badge ${change >= 0 ? 'badge-up' : 'badge-down'}">${Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}% (24s)` : '—'}</span>
      <span class="badge ${funding > 0.03 ? 'badge-down' : 'badge-up'}">Funding ${Number.isFinite(funding) ? funding.toFixed(4) : '—'}%</span>
    </div>
    <div style="font-size:13px;color:#555;margin-bottom:0.5rem;">
      24s: Alt <b>${fmtMoney(d.low)}</b> — Üst <b>${fmtMoney(d.high)}</b> · Hacim: <b>${fmtCompact(d.volume)}</b>
    </div>

    <div class="section-label">Ana Metrikler</div>
    <div class="grid4">
      <div class="mcard"><div class="lbl">Hacim (24s)</div><div class="val">${fmtCompact(d.volume)}</div><div class="sub">Binance Futures</div></div>
      <div class="mcard"><div class="lbl">Açık Pozisyon</div><div class="val">${fmtCompact(d.oiUSD)}</div><div class="sub">USD değer</div></div>
      <div class="mcard"><div class="lbl">Fonlama Oranı</div><div class="val ${fundingCls}">${Number.isFinite(funding) ? `${funding.toFixed(4)}%` : '—'}</div><div class="sub">8 saatlik</div></div>
      <div class="mcard"><div class="lbl">OI Değişimi (5d)</div><div class="val ${oiDeltaCls}">${Number.isFinite(oiDelta) ? fmtCompact(oiDelta) : '—'}</div><div class="sub">Canlı delta</div></div>
    </div>

    <div class="section-label">Order Book Derinliği — Anlık</div>
    <div class="signal-card">
      <div class="grid2">
        <div><div class="lbl up">BID</div>${bids.slice(0, 3).map((b) => `<div class="sr-row"><span class="up">${fmtMoney(b.price)}</span><span>${Number(b.qty || 0).toLocaleString('tr-TR')}</span></div>`).join('') || '<div class="sub">Veri yok</div>'}</div>
        <div><div class="lbl down">ASK</div>${asks.slice(0, 3).map((a) => `<div class="sr-row"><span class="down">${fmtMoney(a.price)}</span><span>${Number(a.qty || 0).toLocaleString('tr-TR')}</span></div>`).join('') || '<div class="sub">Veri yok</div>'}</div>
      </div>
    </div>

    <div class="section-label">Long / Short Dağılımı</div>
    <div class="signal-card">
      <div class="bar-row"><span style="width:46px" class="up">Long</span><div class="bar-bg"><div class="bar-fill" style="width:${Number.isFinite(longPct) ? longPct : 50}%;background:#1D9E75;"></div></div><span class="up">${Number.isFinite(longPct) ? longPct.toFixed(1) : '—'}%</span></div>
      <div class="bar-row"><span style="width:46px" class="down">Short</span><div class="bar-bg"><div class="bar-fill" style="width:${Number.isFinite(shortPct) ? shortPct : 50}%;background:#D85A30;"></div></div><span class="down">${Number.isFinite(shortPct) ? shortPct.toFixed(1) : '—'}%</span></div>
      <div class="sub">L/S oranı: <b>${Number.isFinite(ratio) ? ratio.toFixed(4) : '—'}</b></div>
    </div>

    <div class="section-label">Destek ve Direnç</div>
    <div class="signal-card">
      ${(resistances.slice(0, 2).map((r, i) => `<div class="sr-row"><span class="down">D${i + 1} ${fmtMoney(r.price)}</span><span>${r.touches || 0} temas</span></div>`).join('')) || '<div class="sub">Direnç verisi yok</div>'}
      ${(supports.slice(0, 2).map((s, i) => `<div class="sr-row"><span class="up">S${i + 1} ${fmtMoney(s.price)}</span><span>${s.touches || 0} temas</span></div>`).join('')) || '<div class="sub">Destek verisi yok</div>'}
    </div>
  `;
}

export function buildOutput(d, symbol) {
  const now = new Date().toLocaleString('tr-TR');
  let t = `NOT: Lutfen bu ham veriyi Turkce olarak acikla. Yorumlarini Turkce yaz.\n`;
  t += `RAW_DATA\n`;
  t += `SYMBOL: ${symbol}\n`;
  t += `TIME: ${now}\n`;
  t += '\n[MARKET]\n';

  if (d.price !== undefined) t += `price=${d.price}\n`;
  if (d.change !== undefined) t += `change_24h_pct=${d.change}\n`;
  if (d.high !== undefined) t += `high_24h=${d.high}\n`;
  if (d.low !== undefined) t += `low_24h=${d.low}\n`;
  if (d.volume !== undefined) t += `volume_24h=${d.volume}\n`;

  // ==================== YENİ: MARKET_SNAPSHOTS_72H (SAATLİK) ====================
  const snapshotRows = d.marketSnapshots || state.detailData?.marketSnapshots || [];
  if (Array.isArray(snapshotRows) && snapshotRows.length > 0) {
    const hourlyRows = aggregateSnapshotsToHourly(snapshotRows);

    // Son 72 saatlik pencereyi al
    const last72Hours = hourlyRows.slice(-72);

    const firstHourly = last72Hours.length > 0 ? last72Hours[0] : null;
    const lastHourly = last72Hours.length > 0 ? last72Hours[last72Hours.length - 1] : null;

    t += '\n[MARKET_SNAPSHOTS_72H]\n';
    t += `snapshot_source=5m_raw_aggregated_to_1h\n`;
    t += `snapshot_total_raw_count=${snapshotRows.length}\n`;
    t += `snapshot_total_hourly_count=${hourlyRows.length}\n`;
    t += `snapshot_display_count=${last72Hours.length}\n`;
    t += `snapshot_first_ts=${firstHourly?.ts || ''}\n`;
    t += `snapshot_last_ts=${lastHourly?.ts || ''}\n`;
    t += `snapshot_price_change_period_pct=${calcSnapshotChangePct(firstHourly, lastHourly, 'price_close')}\n`;
    t += `snapshot_oi_change_period_pct=${calcSnapshotChangePct(firstHourly, lastHourly, 'oi_usd')}\n`;
    t += `snapshot_long_pct_delta=${calcSnapshotDelta(firstHourly, lastHourly, 'long_pct')}\n`;
    t += `snapshot_short_pct_delta=${calcSnapshotDelta(firstHourly, lastHourly, 'short_pct')}\n`;
    t += `snapshot_latest_ba_ratio=${lastHourly?.ba_ratio ?? ''}\n`;
    t += `snapshot_latest_funding_rate_pct=${lastHourly?.funding_rate ?? ''}\n`;
    t += `snapshot_latest_cvd_signal=${lastHourly?.cvd_signal ?? ''}\n`;
    t += `snapshot_latest_cvd_divergence=${lastHourly?.cvd_divergence ?? ''}\n`;
    t += `snapshot_latest_rsi_1h=${lastHourly?.rsi_1h ?? ''}\n`;
    t += `snapshot_latest_rsi_4h=${lastHourly?.rsi_4h ?? ''}\n`;
    t += `snapshot_latest_rsi_1d=${lastHourly?.rsi_1d ?? ''}\n`;

    const hourlyColumns = getHourlySnapshotColumns();
    // Son 8 saati detaylı, önceki 64 saati kompakt ver
    const recent8 = last72Hours.slice(-8);
    const older64 = last72Hours.slice(0, -8);

    t += `snapshot_columns=${hourlyColumns.join(',')}\n`;
    t += `snapshot_rows_note=hourly_aggregated_last_8_rows_detailed_older_64_compact\n`;

    // Son 8 saat detaylı
    formatHourlySnapshotRows(recent8, hourlyColumns).forEach((row) => {
      t += `${row}\n`;
    });

    // Önceki 64 saat kompakt (sadece kritik kolonlar)
    if (older64.length > 0) {
      const compactColumns = ['ts', 'price_close', 'long_pct', 'short_pct', 'funding_rate', 'oi_usd', 'cvd_delta_1h', 'cvd_signal', 'rsi_1h'];
      t += `snapshot_compact_columns=${compactColumns.join(',')}\n`;
      t += `snapshot_compact_rows_note=older_64_hours_compact_format\n`;
      older64.forEach((row, idx) => {
        const parts = compactColumns.map((key) => `${key}:${normalizeSnapshotValue(key, row?.[key])}`);
        t += `hourly_compact_${idx + 1}=${parts.join('|')}\n`;
      });
    }
  }

  t += '\n[DERIVATIVES]\n';
  if (d.oiUSD !== undefined) t += `open_interest_usd=${d.oiUSD}\n`;
  if (d.oiContracts !== undefined) t += `open_interest_contracts=${d.oiContracts}\n`;
  if (d.funding !== undefined) t += `funding_rate_pct=${d.funding}\n`;

  const fundingPageData =
    d.fundingData ||
    state.fundingData ||
    state.detailData?.fundingData ||
    null;
  if (fundingPageData && typeof fundingPageData === 'object' && Object.keys(fundingPageData).length > 0) {
    t += '\n[FUNDING_PAGE]\n';
    t = appendFlatObjectLines(t, fundingPageData, 'funding_page');

    if (Array.isArray(fundingPageData.history) && fundingPageData.history.length > 0) {
      t += '\n[FUNDING_HISTORY]\n';
      if (fundingPageData.intervalHours !== undefined) t += `funding_history_interval_hours=${fundingPageData.intervalHours}\n`;
      if (fundingPageData.periodsLoaded !== undefined) t += `funding_history_periods_loaded=${fundingPageData.periodsLoaded}\n`;
      const historyRows = formatFundingHistoryRows(fundingPageData.history);
      historyRows.forEach((row) => {
        t += `${row}\n`;
      });
    }
  }

  const orderbookPageData =
    d.orderbookData ||
    state.orderbookData ||
    state.detailData?.orderbookData ||
    null;
  if (orderbookPageData && typeof orderbookPageData === 'object' && Object.keys(orderbookPageData).length > 0) {
    t += '\n[ORDERBOOK_SUMMARY]\n';
    const orderbookSummaryLines = buildOrderbookSummaryLines(orderbookPageData, d.price);
    if (orderbookSummaryLines.length > 0) {
      orderbookSummaryLines.forEach((row) => { t += `${row}\n`; });
    } else {
      t += 'orderbook_summary_note=no_orderbook_levels_available\n';
    }
  }

  t += '\n[OI_ANALYSIS]\n';
  if (state.oiData && Array.isArray(state.oiData.windows)) {
    const byWindow = Object.fromEntries(state.oiData.windows.map(w => [w.window, w]));
    const w5m = byWindow['5m'];
    const w15m = byWindow['15m'];
    const w1h = byWindow['1h'];

    t += `oi_change_5m_pct=${w5m && w5m.pct !== null && w5m.pct !== undefined ? w5m.pct : ''}\n`;
    t += `oi_change_15m_pct=${w15m && w15m.pct !== null && w15m.pct !== undefined ? w15m.pct : ''}\n`;
    t += `oi_change_1h_pct=${w1h && w1h.pct !== null && w1h.pct !== undefined ? w1h.pct : ''}\n`;
    t += `oi_change_5m_usd=${w5m && w5m.oi_usd_delta !== null && w5m.oi_usd_delta !== undefined ? w5m.oi_usd_delta : ''}\n`;
    t += `oi_change_15m_usd=${w15m && w15m.oi_usd_delta !== null && w15m.oi_usd_delta !== undefined ? w15m.oi_usd_delta : ''}\n`;
    t += `oi_change_1h_usd=${w1h && w1h.oi_usd_delta !== null && w1h.oi_usd_delta !== undefined ? w1h.oi_usd_delta : ''}\n`;
  } else {
    t += 'oi_change_5m_pct=\n';
    t += 'oi_change_15m_pct=\n';
    t += 'oi_change_1h_pct=\n';
    t += 'oi_change_5m_usd=\n';
    t += 'oi_change_15m_usd=\n';
    t += 'oi_change_1h_usd=\n';
  }

  t += '\n[LONG_SHORT]\n';
  if (d.longPct !== undefined) t += `long_pct=${d.longPct}\n`;
  if (d.shortPct !== undefined) t += `short_pct=${d.shortPct}\n`;
  if (d.lsRatio !== undefined) t += `long_short_ratio=${d.lsRatio}\n`;
  if (d.ttAcc !== undefined) t += `top_trader_accounts_ls=${d.ttAcc}\n`;
  if (d.ttPos !== undefined) t += `top_trader_positions_ls=${d.ttPos}\n`;

  if (state.taData && state.taData.mtf) {
    const { tf1h, tf4h, tf1w } = state.taData.mtf;
    t += '\n[TA_MTF]\n';

    const rows = [
      ['1h', tf1h],
      ['4h', tf4h],
      ['1w', tf1w]
    ];

    rows.forEach(([label, tf]) => {
      if (!tf) return;
      if (tf.rsi !== null && tf.rsi !== undefined) t += `${label}_rsi14=${tf.rsi}\n`;
      if (tf.macd) {
        if (tf.macd.macd !== null && tf.macd.macd !== undefined) t += `${label}_macd=${tf.macd.macd}\n`;
        if (tf.macd.signal !== null && tf.macd.signal !== undefined) t += `${label}_macd_signal=${tf.macd.signal}\n`;
        if (tf.macd.histogram !== null && tf.macd.histogram !== undefined) t += `${label}_macd_histogram=${tf.macd.histogram}\n`;
        if (tf.macd.prevHisto !== null && tf.macd.prevHisto !== undefined) t += `${label}_macd_prev_histogram=${tf.macd.prevHisto}\n`;
      }
      if (tf.bb) {
        if (tf.bb.upper !== null && tf.bb.upper !== undefined) t += `${label}_bb_upper=${tf.bb.upper}\n`;
        if (tf.bb.middle !== null && tf.bb.middle !== undefined) t += `${label}_bb_middle=${tf.bb.middle}\n`;
        if (tf.bb.lower !== null && tf.bb.lower !== undefined) t += `${label}_bb_lower=${tf.bb.lower}\n`;
      }
      if (tf.currentClose !== null && tf.currentClose !== undefined) t += `${label}_close=${tf.currentClose}\n`;
    });
  }

  if (state.srData.resistances && state.srData.supports) {
    t += '\n[SUPPORT_RESISTANCE_4H]\n';
    state.srData.resistances.forEach((r, i) => {
      t += `resistance_${i + 1}_price=${r.price}\n`;
      t += `resistance_${i + 1}_touches=${r.touches}\n`;
      t += `resistance_${i + 1}_is_psychological=${Boolean(r.isPsychological)}\n`;
      t += `resistance_${i + 1}_is_fallback=${Boolean(r.isFallback)}\n`;
    });
    state.srData.supports.forEach((s, i) => {
      t += `support_${i + 1}_price=${s.price}\n`;
      t += `support_${i + 1}_touches=${s.touches}\n`;
    });
    if (state.srData.nearATH !== undefined) t += `near_ath=${Boolean(state.srData.nearATH)}\n`;
  }

  if (state.volData) {
    t += '\n[VOLUME_4H]\n';
    if (state.volData.obvTrend !== undefined) t += `obv_trend=${state.volData.obvTrend}\n`;
    if (state.volData.volRatio !== undefined && state.volData.volRatio !== null) t += `volume_ratio=${state.volData.volRatio}\n`;
    if (state.volData.deltaAvg !== undefined) t += `taker_delta_avg=${state.volData.deltaAvg}\n`;
    if (state.volData.deltaDir !== undefined) t += `taker_delta_dir=${state.volData.deltaDir}\n`;
    if (state.volData.priceChange3 !== undefined) t += `price_change_3x4h_pct=${state.volData.priceChange3}\n`;
    if (state.volData.priceChange10 !== undefined) t += `price_change_10x4h_pct=${state.volData.priceChange10}\n`;
    if (state.volData.weakBreakout !== undefined) t += `weak_breakout=${Boolean(state.volData.weakBreakout)}\n`;
    if (state.volData.weakDrop !== undefined) t += `weak_drop=${Boolean(state.volData.weakDrop)}\n`;
    if (state.volData.volumeSpike !== undefined) t += `volume_spike=${Boolean(state.volData.volumeSpike)}\n`;
    if (state.volData.divergence !== undefined) t += `obv_divergence=${state.volData.divergence}\n`;
  }

  t += '\n[CVD_ANALYSIS]\n';
  if (state.cvdData && !state.cvdData.error) {
    const c = state.cvdData;
    t += `cvd_5m=${c.cvd_5m ?? ''}\n`;
    t += `cvd_15m=${c.cvd_15m ?? ''}\n`;
    t += `cvd_1h=${c.cvd_1h ?? ''}\n`;
    t += `cvd_delta_5m=${c.cvd_delta_5m ?? ''}\n`;
    t += `cvd_delta_15m=${c.cvd_delta_15m ?? ''}\n`;
    t += `cvd_delta_1h=${c.cvd_delta_1h ?? ''}\n`;
  } else {
    t += 'cvd_5m=\n';
    t += 'cvd_15m=\n';
    t += 'cvd_1h=\n';
    t += 'cvd_delta_5m=\n';
    t += 'cvd_delta_15m=\n';
    t += 'cvd_delta_1h=\n';
  }

  if (state.btcData && !state.btcData.isBTC) {
    t += '\n[BTC_CONTEXT]\n';
    if (state.btcData.btcPrice !== undefined) t += `btc_price=${state.btcData.btcPrice}\n`;
    if (state.btcData.btcChange !== undefined && state.btcData.btcChange !== null) t += `btc_change_24h_pct=${state.btcData.btcChange}\n`;
    if (state.btcData.btcRSI !== undefined) t += `btc_rsi14=${state.btcData.btcRSI}\n`;
    if (state.btcData.btcMACD) {
      if (state.btcData.btcMACD.macd !== undefined) t += `btc_macd=${state.btcData.btcMACD.macd}\n`;
      if (state.btcData.btcMACD.signal !== undefined) t += `btc_macd_signal=${state.btcData.btcMACD.signal}\n`;
      if (state.btcData.btcMACD.histogram !== undefined) t += `btc_macd_histogram=${state.btcData.btcMACD.histogram}\n`;
    }
    if (state.btcData.btcDir !== undefined) t += `btc_direction=${state.btcData.btcDir}\n`;
    if (state.btcData.corrVal !== undefined && state.btcData.corrVal !== null) t += `btc_correlation_4h_60=${state.btcData.corrVal}\n`;
  }

  renderCoinAnalysisPage(d, symbol);
  document.getElementById('outputPreview').textContent = t;
  state.detailData._text = t;
}

export async function copyData() {
  const btn = document.getElementById('copyBtn');
  const text = state.detailData._text || document.getElementById('outputPreview').textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  btn.textContent = '✅ KOPYALANDI';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = '📋 KOPYALA';
    btn.classList.remove('copied');
  }, 2500);
}
