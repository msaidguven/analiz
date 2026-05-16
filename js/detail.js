import { state } from './state.js';
import { formatPrice, formatVol, fmtNum } from './config.js';
import { fetchAndRenderTA, tfSignal } from './modules/mtf.js';
import { fetchAndRenderSR } from './modules/sr.js';
import { fetchAndRenderVol } from './modules/volume.js';
import { fetchAndRenderBTC } from './modules/btc.js';
import { fetchAndRenderATH } from './modules/ath.js';
import { startOI, stopOI } from './modules/oi.js';
import { fetchCVDAnalysis } from './modules/cvd.js';
import { renderFunding } from './modules/funding.js';
import { renderOrderBook } from './modules/orderbook.js';
import { buildOutput } from './output.js';

export async function openDetail(symbol) {
  state.currentSymbol = symbol;
  state.taData = {};
  state.oiData = {};
  state.cvdData = {};
  state.srData = {};
  state.volData = {};
  state.btcData = {};
  state.athData = {};
  state.fundingData = {};
  state.orderbookData = {};
  document.getElementById('detailSymbol').textContent = symbol.replace('USDT','/USDT');
  document.getElementById('detailPriceVal').textContent = '...';
  document.getElementById('detailStatus').textContent = 'YÜKLENİYOR';
  document.getElementById('detailDot').style.background = 'var(--yellow)';
  document.getElementById('detailError').style.display = 'none';
  document.getElementById('copyBtn').disabled = true;
  document.getElementById('outputPreview').textContent = 'Veri çekiliyor...';
  document.getElementById('taContent') && (document.getElementById('taContent').innerHTML = '');
  document.getElementById('mtfCol1h').innerHTML = `<div class="mtf-tf-label tf-1h">1H</div><div class="ta-loading"><div class="ta-spinner"></div></div>`;
  document.getElementById('mtfCol4h').innerHTML = `<div class="mtf-tf-label tf-4h">4H</div><div class="ta-loading"><div class="ta-spinner"></div></div>`;
  document.getElementById('mtfCol1w').innerHTML = `<div class="mtf-tf-label tf-1w">1W</div><div class="ta-loading"><div class="ta-spinner"></div></div>`;
  ['mtfCol1h','mtfCol4h','mtfCol1w'].forEach(id => document.getElementById(id).classList.add('loading-col'));
  document.getElementById('mtfTitle').textContent = 'VERİ ÇEKİLİYOR...';
  document.getElementById('mtfSub').textContent = '1H · 4H · 1W kline verisi yükleniyor';
  document.getElementById('mtfIcon').textContent = '⏳';
  document.getElementById('mtfScoreBar').innerHTML = '';
  // SR reset
  document.getElementById('srChart').innerHTML = `<div class="ta-loading" style="height:100%;justify-content:center"><div class="ta-spinner"></div></div>`;
  document.getElementById('srList').innerHTML = `<div style="color:var(--dim);font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px">Seviyeler hesaplanıyor...</div>`;
  document.getElementById('srSummary').style.display = 'none';
  // Vol reset
  document.getElementById('obvChart').innerHTML = `<div class="ta-loading" style="align-items:center;width:100%"><div class="ta-spinner"></div></div>`;
  document.getElementById('volMetrics').innerHTML = `<div style="color:var(--dim);font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px">Hesaplanıyor...</div>`;
  document.getElementById('obvTrendText').textContent = 'Yükleniyor...';
  // BTC reset
  document.getElementById('btcAlerts').innerHTML = `<div style="color:var(--dim);font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px">BTC verisi yükleniyor...</div>`;
  document.getElementById('btcCorrRow').style.display = 'none';
  document.getElementById('btcCompareGrid').innerHTML = `
    <div class="btc-compare-col"><div class="btc-compare-label btc-color">BTC</div><div class="ta-loading"><div class="ta-spinner"></div></div></div>
    <div class="btc-compare-col"><div class="btc-compare-label coin-color" id="btcCoinLabel">COIN</div><div class="ta-loading"><div class="ta-spinner"></div></div></div>`;
  // ATH reset
  document.getElementById('athMarker').style.left = '50%';
  document.getElementById('athDataSource').textContent = '—';
  document.getElementById('athAtlLabel').textContent = 'ATL: —';
  document.getElementById('athAthLabel').textContent = 'ATH: —';
  document.getElementById('athCurrentLabel').textContent = '— ŞİMDİ';
  document.getElementById('athPrice').textContent = '—';
  document.getElementById('atlPrice').textContent = '—';
  document.getElementById('athDist').textContent = '—';
  document.getElementById('atlDist').textContent = '—';
  document.getElementById('athSummaryRow').style.display = 'none';
  resetDetail();
  stopOI();

  document.getElementById('listPage').classList.remove('active');
  document.getElementById('detailPage').classList.add('active');
  window.scrollTo(0,0);

  await Promise.all([
    fetchDetail(symbol),
    fetchAndRenderTA(symbol)
  ]);
}

export function goBack() {
  stopOI();
  document.getElementById('detailPage').classList.remove('active');
  document.getElementById('listPage').classList.add('active');
}

export async function refreshDetail() {
  if (!state.currentSymbol) return;
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  btn.textContent = '⟳ YENİLENİYOR...';
  document.getElementById('mtfCol1h').innerHTML = `<div class="mtf-tf-label tf-1h">1H</div><div class="ta-loading"><div class="ta-spinner"></div></div>`;
  document.getElementById('mtfCol4h').innerHTML = `<div class="mtf-tf-label tf-4h">4H</div><div class="ta-loading"><div class="ta-spinner"></div></div>`;
  document.getElementById('mtfCol1w').innerHTML = `<div class="mtf-tf-label tf-1w">1W</div><div class="ta-loading"><div class="ta-spinner"></div></div>`;
  ['mtfCol1h','mtfCol4h','mtfCol1w'].forEach(id => document.getElementById(id).classList.add('loading-col'));
  document.getElementById('srChart').innerHTML = `<div class="ta-loading" style="height:100%;justify-content:center"><div class="ta-spinner"></div></div>`;
  document.getElementById('srList').innerHTML = `<div style="color:var(--dim);font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px">Yenileniyor...</div>`;
  document.getElementById('srSummary').style.display = 'none';
  document.getElementById('obvChart').innerHTML = `<div class="ta-loading" style="align-items:center;width:100%"><div class="ta-spinner"></div></div>`;
  document.getElementById('volMetrics').innerHTML = `<div style="color:var(--dim);font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px">Yenileniyor...</div>`;
  document.getElementById('obvTrendText').textContent = 'Yükleniyor...';
  document.getElementById('btcAlerts').innerHTML = `<div style="color:var(--dim);font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px">BTC verisi yükleniyor...</div>`;
  document.getElementById('btcCorrRow').style.display = 'none';
  await Promise.all([
    fetchDetail(state.currentSymbol),
    fetchAndRenderTA(state.currentSymbol)
  ]);
  btn.disabled = false;
  btn.textContent = '↺ YENİLE';
}

async function fetchDetail(symbol) {
  try {
    const [tickerRes, fundingRes, oiRes, lsRes, ttAccRes, ttPosRes] = await Promise.allSettled([
      fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`).then(r=>r.json()),
      fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`).then(r=>r.json()),
      fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`).then(r=>r.json()),
      fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`).then(r=>r.json()),
      fetch(`https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`).then(r=>r.json()),
      fetch(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=5m&limit=1`).then(r=>r.json()),
    ]);

    const d = {};
    if (tickerRes.status === 'fulfilled') {
      const t = tickerRes.value;
      d.price = parseFloat(t.lastPrice);
      d.change = parseFloat(t.priceChangePercent);
      d.volume = parseFloat(t.quoteVolume);
      d.high = parseFloat(t.highPrice);
      d.low = parseFloat(t.lowPrice);
    }
    if (fundingRes.status === 'fulfilled') d.funding = parseFloat(fundingRes.value.lastFundingRate) * 100;
    if (oiRes.status === 'fulfilled') {
      d.oiContracts = parseFloat(oiRes.value.openInterest);
      d.oiUSD = d.oiContracts * (d.price || 1);
    }
    if (lsRes.status === 'fulfilled' && Array.isArray(lsRes.value) && lsRes.value[0]) {
      d.longPct = parseFloat(lsRes.value[0].longAccount) * 100;
      d.shortPct = parseFloat(lsRes.value[0].shortAccount) * 100;
      d.lsRatio = parseFloat(lsRes.value[0].longShortRatio);
    }
    if (ttAccRes.status === 'fulfilled' && Array.isArray(ttAccRes.value) && ttAccRes.value[0]) d.ttAcc = parseFloat(ttAccRes.value[0].longShortRatio);
    if (ttPosRes.status === 'fulfilled' && Array.isArray(ttPosRes.value) && ttPosRes.value[0]) d.ttPos = parseFloat(ttPosRes.value[0].longShortRatio);

    state.detailData = d;
    renderDetail(d, symbol);
  } catch(e) {
    document.getElementById('detailError').style.display = 'block';
    document.getElementById('detailError').textContent = '⚠ Veri alınamadı: ' + e.message;
    document.getElementById('detailStatus').textContent = 'HATA';
    document.getElementById('detailDot').style.background = 'var(--red)';
  }
}

function renderDetail(d, symbol) {
  if (d.price) {
    document.getElementById('detailPriceVal').textContent = formatPrice(d.price);
    const chEl = document.getElementById('detailChangeVal');
    chEl.textContent = (d.change >= 0 ? '+' : '') + d.change.toFixed(2) + '%';
    chEl.style.color = d.change >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if (d.oiUSD) {
    document.getElementById('d-oi').textContent = formatVol(d.oiUSD);
    document.getElementById('d-oi-sub').textContent = 'USD değeri';
  }
  if (d.oiContracts) {
    document.getElementById('d-oi-cont').textContent = fmtNum(d.oiContracts);
    document.getElementById('d-oi-cont').className = 'd-val';
  }
  if (d.volume) document.getElementById('d-vol').textContent = formatVol(d.volume);
  if (d.funding !== undefined) {
    const fEl = document.getElementById('d-funding');
    fEl.textContent = d.funding.toFixed(4) + '%';
    fEl.className = 'd-val ' + (d.funding > 0.08 ? 'down' : d.funding > 0.01 ? 'warn' : d.funding < 0 ? 'up' : '');
    document.getElementById('d-funding-sub').textContent =
      d.funding > 0.08 ? '⚠ Aşırı yüksek — Long pahalı' :
      d.funding > 0.03 ? 'Yüksek — Long ağırlıklı' :
      d.funding < 0 ? 'Negatif — Short ağırlıklı' : 'Normal seviye';
  }
  if (d.longPct) {
    document.getElementById('lsLongBar').style.width = d.longPct + '%';
    document.getElementById('lsShortBar').style.width = d.shortPct + '%';
    document.getElementById('longPct').textContent = '%' + d.longPct.toFixed(1);
    document.getElementById('shortPct').textContent = '%' + d.shortPct.toFixed(1);
  }
  if (d.ttAcc) {
    const el = document.getElementById('d-tt-acc');
    el.textContent = d.ttAcc.toFixed(4);
    el.style.color = d.ttAcc > 1 ? 'var(--green)' : 'var(--red)';
  }
  if (d.ttPos) {
    const el = document.getElementById('d-tt-pos');
    el.textContent = d.ttPos.toFixed(4);
    el.style.color = d.ttPos > 1 ? 'var(--green)' : 'var(--red)';
  }

  renderVerdicts(d);
  buildOutput(d, symbol);
  // Funding geçmişini arka planda çekip output metnine entegre et.
  renderFunding(symbol, document.createElement('div')).catch(() => {});
  // Orderbook snapshot verisini arka planda çekip output metnine entegre et.
  renderOrderBook(symbol, document.createElement('div')).catch(() => {});
  startOI(symbol, onOIUpdate);
  fetchAndApplyCVD(symbol);

  // SR, Vol ve BTC — fiyat hazır olunca paralel tetikle
  if (d.price) {
    fetchAndRenderSR(symbol, d.price);
    fetchAndRenderVol(symbol);
    fetchAndRenderBTC(symbol, d.price);
  }

  document.getElementById('detailStatus').textContent = 'CANLI';
  document.getElementById('detailDot').style.background = 'var(--green)';
  document.getElementById('copyBtn').disabled = false;
}

async function fetchAndApplyCVD(symbol) {
  try {
    const cvd = await fetchCVDAnalysis(symbol);
    if (!state.currentSymbol || state.currentSymbol !== symbol) return;
    if (cvd && !cvd.error) {
      state.cvdData = cvd;
      if (state.detailData && state.currentSymbol) {
        buildOutput(state.detailData, state.currentSymbol);
      }
    }
  } catch (_) {
    // CVD verisi opsiyonel, akışı bozma
  }
}

function onOIUpdate(oiPayload) {
  if (!oiPayload || oiPayload.error) return;
  if (!state.currentSymbol || oiPayload.symbol !== state.currentSymbol) return;

  state.oiData = oiPayload;
  updateOIDeltaUI(oiPayload);
  if (state.detailData && state.currentSymbol) {
    buildOutput(state.detailData, state.currentSymbol);
  }
}

function updateOIDeltaUI(oiPayload) {
  if (!oiPayload || !Array.isArray(oiPayload.windows)) return;
  const subEl = document.getElementById('d-oi-sub');
  if (!subEl) return;

  const byWindow = Object.fromEntries(
    oiPayload.windows.map(w => [w.window, w])
  );
  const labels = ['5m', '15m', '1h'].map(label => {
    const w = byWindow[label];
    if (!w || w.pct === null || Number.isNaN(w.pct)) return `${label}: n/a`;
    const sign = w.pct >= 0 ? '+' : '';
    return `${label}: ${sign}${w.pct.toFixed(2)}%`;
  });

  subEl.textContent = `USD değeri | OI Δ ${labels.join(' | ')}`;
}

function renderVerdicts(d) {
  const items = [];
  if (d.funding !== undefined) {
    const hot = d.funding > 0.08, neg = d.funding < 0;
    items.push({ icon:'💸', text:'Funding Rate', status: hot?'AŞIRI YÜK':neg?'NEGATİF':'NORMAL', cls: hot?'bear':neg?'bull':'neut' });
  }
  if (d.longPct) {
    const shortHeavy = d.shortPct > 55, longHeavy = d.longPct > 55;
    items.push({ icon:'⚖️', text:'Long/Short Dağılımı', status: shortHeavy?'SHORT AĞIRLIKLI':longHeavy?'LONG AĞIRLIKLI':'NÖTR', cls: shortHeavy?'bear':longHeavy?'bull':'neut' });
  }
  if (d.ttPos) {
    items.push({ icon:'🐋', text:'Top Trader Pozisyon', status: d.ttPos>1.5?'GÜÇLÜ LONG':d.ttPos>1?'LONG':d.ttPos<0.7?'GÜÇLÜ SHORT':'SHORT', cls: d.ttPos>1?'bull':'bear' });
  }
  if (d.change) {
    items.push({ icon:'📈', text:'24s Fiyat Değişimi', status: d.change>10?'GÜÇLÜ YÜKSELİŞ':d.change>0?'YÜKSELİŞ':d.change<-10?'SERT DÜŞÜŞ':'DÜŞÜŞ', cls: d.change>0?'bull':'bear' });
  }
  if (d.oiUSD && d.volume) {
    const ratio = d.volume / d.oiUSD;
    items.push({ icon:'🔥', text:'Hacim/OI Oranı', status: ratio>3?'AŞIRI AKTİF':ratio>1?'AKTİF':'DÜŞÜK', cls: ratio>1?'bull':'neut' });
  }
  // MTF sinyalleri — 4H baz alınır, konfirmasyon gösterilir
  const tf4h = state.taData.mtf && state.taData.mtf.tf4h;
  if (tf4h && tf4h.rsi !== null && tf4h.rsi !== undefined) {
    const r = tf4h.rsi;
    items.push({ icon:'📊', text:'RSI(14) — 4H', status: r>70?'AŞIRI ALIM':r<30?'AŞIRI SATIM':r>55?'GÜÇLÜ':'NÖTR', cls: r>70?'bear':r<30?'bull':'neut' });
  }
  if (tf4h && tf4h.macd) {
    items.push({ icon:'⚡', text:'MACD — 4H', status: tf4h.macd.histogram>0?'POZİTİF':'NEGATİF', cls: tf4h.macd.histogram>0?'bull':'bear' });
  }
  if (tf4h && tf4h.bb && d.price) {
    const pos = (d.price - tf4h.bb.lower) / (tf4h.bb.upper - tf4h.bb.lower);
    items.push({ icon:'🎯', text:'Bollinger — 4H', status: d.price>tf4h.bb.upper?'ÜST AŞIMI':d.price<tf4h.bb.lower?'ALT AŞIMI':pos>0.65?'ÜST BÖLGE':pos<0.35?'ALT BÖLGE':'ORTA', cls: d.price>tf4h.bb.upper?'bear':d.price<tf4h.bb.lower?'bull':'neut' });
  }
  // MTF konfirmasyon
  if (state.taData.mtf) {
    const s1h = tfSignal(state.taData.mtf.tf1h), s4h = tfSignal(state.taData.mtf.tf4h), s1w = tfSignal(state.taData.mtf.tf1w);
    const bullTFs = [s1h, s4h, s1w].filter(s => s.dir === 'bull').length;
    const bearTFs = [s1h, s4h, s1w].filter(s => s.dir === 'bear').length;
    const konfSts = bullTFs === 3 ? '3/3 YUKARI' : bearTFs === 3 ? '3/3 AŞAĞI' : bullTFs === 2 ? '2/3 YUKARI' : bearTFs === 2 ? '2/3 AŞAĞI' : 'KARIŞIK';
    const konfCls = bullTFs >= 2 ? 'bull' : bearTFs >= 2 ? 'bear' : 'neut';
    items.push({ icon:'🕐', text:'MTF Konfirmasyon', status: konfSts, cls: konfCls });
  }
  // Destek / Direnç sinyali
  if (state.srData.resistances && state.srData.supports && d.price) {
    const nearRes = state.srData.resistances[0];
    const nearSup = state.srData.supports[0];
    if (nearRes && nearSup) {
      const rDist = (nearRes.price - d.price) / d.price * 100;
      const sDist = (d.price - nearSup.price) / d.price * 100;
      const srSts = rDist < 1.5 ? `DİRENÇ YAKIN %${rDist.toFixed(1)}` : sDist < 1.5 ? `DESTEK YAKIN %${sDist.toFixed(1)}` : `D:%${rDist.toFixed(1)} S:%${sDist.toFixed(1)}`;
      const srCls = rDist < 1.5 ? 'bear' : sDist < 1.5 ? 'bull' : 'neut';
      items.push({ icon:'📏', text:'Destek/Direnç', status: srSts, cls: srCls });
    }
  }
  // Hacim sinyalleri
  if (state.volData.obvTrend) {
    items.push({ icon:'📊', text:'OBV Trend', status: state.volData.obvTrend === 'bull' ? 'YÜKSELİYOR' : state.volData.obvTrend === 'bear' ? 'DÜŞÜYOR' : 'YATAY', cls: state.volData.obvTrend });
  }
  if (state.volData.deltaDir) {
    items.push({ icon:'⚡', text:'Taker Delta (5×4H)', status: state.volData.deltaDir === 'bull' ? 'ALIŞ BASKISI' : state.volData.deltaDir === 'bear' ? 'SATIŞ BASKISI' : 'NÖTR', cls: state.volData.deltaDir });
  }
  if (state.volData.divergence && state.volData.divergence !== 'none') {
    items.push({ icon:'⚠️', text:'OBV Uyuşmazlığı', status: state.volData.divergence === 'bearish' ? 'AYI UYUŞMAZLIĞI' : 'BOĞA UYUŞMAZLIĞI', cls: state.volData.divergence === 'bearish' ? 'bear' : 'bull' });
  }
  // BTC Korelasyon sinyali
  if (state.btcData.btcDir && !state.btcData.isBTC) {
    const tf4hCoinDir = (state.taData.mtf && state.taData.mtf.tf4h) ? tfSignal(state.taData.mtf.tf4h).dir : 'neut';
    const uyum = state.btcData.btcDir === tf4hCoinDir && state.btcData.btcDir !== 'neut';
    const catisma = state.btcData.btcDir !== 'neut' && tf4hCoinDir !== 'neut' && state.btcData.btcDir !== tf4hCoinDir;
    items.push({
      icon: '₿',
      text: 'BTC Yön Uyumu',
      status: catisma ? 'ÇATIŞMA' : uyum ? (state.btcData.btcDir==='bull'?'UYUMLU ▲':'UYUMLU ▼') : 'NÖTR',
      cls:   catisma ? 'bear' : uyum ? (state.btcData.btcDir==='bull'?'bull':'bear') : 'neut'
    });
    if (state.btcData.corrVal !== null) {
      const c = Math.abs(state.btcData.corrVal);
      items.push({
        icon: '🔗',
        text: 'BTC Korelasyonu (4H)',
        status: c > 0.7 ? `YÜKSEK ${state.btcData.corrVal.toFixed(2)}` : c > 0.4 ? `ORTA ${state.btcData.corrVal.toFixed(2)}` : `DÜŞÜK ${state.btcData.corrVal.toFixed(2)}`,
        cls:   c > 0.7 ? 'warn' : c > 0.4 ? 'neut' : 'bull'
      });
    }
  }

  document.getElementById('verdictItems').innerHTML = items.map(i => `
    <div class="verdict-item">
      <span class="vi-icon">${i.icon}</span>
      <span class="vi-text">${i.text}</span>
      <span class="vi-status ${i.cls}">${i.status}</span>
    </div>`).join('');
}


export function resetDetail() {
  ['d-oi','d-oi-sub','d-vol','d-funding','d-funding-sub','d-oi-cont'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
  ['longPct','shortPct','d-tt-acc','d-tt-pos'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
  document.getElementById('lsLongBar').style.width = '50%';
  document.getElementById('lsShortBar').style.width = '50%';
  document.getElementById('verdictItems').innerHTML = '<div style="color:var(--dim);font-family:\'Share Tech Mono\',monospace;font-size:10px">Yükleniyor...</div>';
}
