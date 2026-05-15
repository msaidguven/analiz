import { state } from './state.js';

export function buildOutput(d, symbol) {
  const now = new Date().toLocaleString('tr-TR');
  let t = `RAW_DATA\n`;
  t += `SYMBOL: ${symbol}\n`;
  t += `TIME: ${now}\n`;
  t += '\n[MARKET]\n';

  if (d.price !== undefined) t += `price=${d.price}\n`;
  if (d.change !== undefined) t += `change_24h_pct=${d.change}\n`;
  if (d.high !== undefined) t += `high_24h=${d.high}\n`;
  if (d.low !== undefined) t += `low_24h=${d.low}\n`;
  if (d.volume !== undefined) t += `volume_24h=${d.volume}\n`;

  t += '\n[DERIVATIVES]\n';
  if (d.oiUSD !== undefined) t += `open_interest_usd=${d.oiUSD}\n`;
  if (d.oiContracts !== undefined) t += `open_interest_contracts=${d.oiContracts}\n`;
  if (d.funding !== undefined) t += `funding_rate_pct=${d.funding}\n`;

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
