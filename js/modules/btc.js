import { state } from '../state.js';
import { formatPrice } from '../config.js';
import { calcRSI, calcMACD } from '../indicators.js';
import { tfSignal } from './mtf.js';
import { buildOutput } from '../output.js';

function pearsonCorr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ax = a.slice(-n), bx = b.slice(-n);
  const ma = ax.reduce((s,v) => s+v,0)/n;
  const mb = bx.reduce((s,v) => s+v,0)/n;
  let num=0, da=0, db=0;
  for(let i=0;i<n;i++){
    const ca=ax[i]-ma, cb=bx[i]-mb;
    num+=ca*cb; da+=ca*ca; db+=cb*cb;
  }
  return da&&db ? num/Math.sqrt(da*db) : 0;
}

// Yüzde değişim dizisi (fiyat→fiyat)
function pctChanges(closes) {
  const out = [];
  for(let i=1;i<closes.length;i++)
    out.push((closes[i]-closes[i-1])/closes[i-1]*100);
  return out;
}

export async function fetchAndRenderBTC(coinSymbol, coinPrice) {
  try {
    // BTC zaten izleniyor olabilir; eğer coin kendisi BTC ise karşılaştırma yapmaya gerek yok
    const isBTC = coinSymbol === 'BTCUSDT';

    const [btcTickerRes, btcKlineRes, coinKlineRes] = await Promise.allSettled([
      fetch('https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT').then(r=>r.json()),
      fetch('https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=4h&limit=60').then(r=>r.json()),
      isBTC ? Promise.resolve(null) :
        fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coinSymbol}&interval=4h&limit=60`).then(r=>r.json()),
    ]);

    const btcTicker = btcTickerRes.status==='fulfilled' ? btcTickerRes.value : null;
    const btcKlines = btcKlineRes.status==='fulfilled'  ? btcKlineRes.value : null;
    const coinKlines= coinKlineRes.status==='fulfilled' ? coinKlineRes.value : null;

    // BTC metrikleri
    const btcClose  = btcKlines ? btcKlines.map(k=>parseFloat(k[4])) : [];
    const btcRSI    = btcClose.length ? calcRSI(btcClose, 14) : null;
    const btcMACD   = btcClose.length ? calcMACD(btcClose) : null;
    const btcChange = btcTicker ? parseFloat(btcTicker.priceChangePercent) : null;
    const btcPrice  = btcTicker ? parseFloat(btcTicker.lastPrice) : null;

    // Korelasyon
    let corrVal = null;
    if (!isBTC && coinKlines && btcKlines) {
      const coinClose = coinKlines.map(k=>parseFloat(k[4]));
      const btcPct    = pctChanges(btcClose);
      const coinPct   = pctChanges(coinClose);
      corrVal = pearsonCorr(btcPct, coinPct);
    }

    // BTC sinyal yönü
    const btcRSISig  = btcRSI  ? (btcRSI>55?'bull':btcRSI<45?'bear':'neut') : 'neut';
    const btcMACDSig = btcMACD ? (btcMACD.histogram>0?'bull':'bear') : 'neut';
    const btcDir     = [btcRSISig,btcMACDSig].filter(s=>s==='bull').length > 1 ? 'bull'
                     : [btcRSISig,btcMACDSig].filter(s=>s==='bear').length > 1 ? 'bear' : 'neut';

    state.btcData = { btcPrice, btcChange, btcRSI, btcMACD, btcDir, corrVal, isBTC };
    renderBTCPanel(state.btcData, coinSymbol, coinPrice);
    if (state.detailData._text) buildOutput(state.detailData, coinSymbol);

  } catch(e) {
    document.getElementById('btcAlerts').innerHTML =
      `<div style="color:var(--red);font-family:'Share Tech Mono',monospace;font-size:9px">⚠ BTC verisi alınamadı: ${e.message}</div>`;
  }
}

function renderBTCPanel(btc, coinSymbol, coinPrice) {
  const coinName = coinSymbol.replace('USDT','');
  document.getElementById('btcCoinLabel').textContent = coinName;

  // ── Karşılaştırma sütunları ──
  const btcRSIColor  = btc.btcRSI  ? (btc.btcRSI>70?'var(--red)':btc.btcRSI<30?'var(--green)':btc.btcRSI>55?'var(--green)':'var(--yellow)') : 'var(--dim)';
  const btcChgColor  = btc.btcChange!==null ? (btc.btcChange>=0?'var(--green)':'var(--red)') : 'var(--dim)';
  const btcMACDColor = btc.btcMACD  ? (btc.btcMACD.histogram>0?'var(--green)':'var(--red)') : 'var(--dim)';
  const btcDirLabel  = btc.btcDir==='bull'?'▲ YUKARI':btc.btcDir==='bear'?'▼ AŞAĞI':'◆ NÖTR';
  const btcDirColor  = btc.btcDir==='bull'?'var(--green)':btc.btcDir==='bear'?'var(--red)':'var(--yellow)';

  const coinChgColor = state.detailData.change!==undefined ? (state.detailData.change>=0?'var(--green)':'var(--red)') : 'var(--dim)';

  const btcCol = `
    <div class="btc-stat"><div class="btc-stat-name">FİYAT</div>
      <div class="btc-stat-val" style="color:var(--bright)">${btc.btcPrice?formatPrice(btc.btcPrice):'—'}</div></div>
    <div class="btc-stat"><div class="btc-stat-name">24S DEĞİŞİM</div>
      <div class="btc-stat-val" style="color:${btcChgColor}">${btc.btcChange!==null?(btc.btcChange>=0?'+':'')+btc.btcChange.toFixed(2)+'%':'—'}</div></div>
    <div class="btc-stat"><div class="btc-stat-name">RSI(14) · 4H</div>
      <div class="btc-stat-val" style="color:${btcRSIColor}">${btc.btcRSI?btc.btcRSI.toFixed(1):'—'}</div></div>
    <div class="btc-stat"><div class="btc-stat-name">MACD · 4H</div>
      <div class="btc-stat-val" style="color:${btcMACDColor}">${btc.btcMACD?btc.btcMACD.histogram.toFixed(4):'—'}</div></div>
    <div class="btc-stat"><div class="btc-stat-name">GENEL YÖN</div>
      <div class="btc-stat-val" style="color:${btcDirColor}">${btcDirLabel}</div></div>`;

  const tf4h = state.taData.mtf && state.taData.mtf.tf4h;
  const coinRSI  = tf4h ? tf4h.rsi  : null;
  const coinMACD = tf4h ? tf4h.macd : null;
  const coinRSIColor  = coinRSI  ? (coinRSI>70?'var(--red)':coinRSI<30?'var(--green)':coinRSI>55?'var(--green)':'var(--yellow)') : 'var(--dim)';
  const coinMACDColor = coinMACD ? (coinMACD.histogram>0?'var(--green)':'var(--red)') : 'var(--dim)';
  const coinSig = tf4h ? tfSignal(tf4h) : null;
  const coinDirLabel = coinSig ? (coinSig.dir==='bull'?'▲ YUKARI':coinSig.dir==='bear'?'▼ AŞAĞI':'◆ NÖTR') : '—';
  const coinDirColor = coinSig ? (coinSig.dir==='bull'?'var(--green)':coinSig.dir==='bear'?'var(--red)':'var(--yellow)') : 'var(--dim)';

  const coinCol = `
    <div class="btc-stat"><div class="btc-stat-name">FİYAT</div>
      <div class="btc-stat-val" style="color:var(--bright)">${coinPrice?formatPrice(coinPrice):'—'}</div></div>
    <div class="btc-stat"><div class="btc-stat-name">24S DEĞİŞİM</div>
      <div class="btc-stat-val" style="color:${coinChgColor}">${state.detailData.change!==undefined?(state.detailData.change>=0?'+':'')+state.detailData.change.toFixed(2)+'%':'—'}</div></div>
    <div class="btc-stat"><div class="btc-stat-name">RSI(14) · 4H</div>
      <div class="btc-stat-val" style="color:${coinRSIColor}">${coinRSI?coinRSI.toFixed(1):'—'}</div></div>
    <div class="btc-stat"><div class="btc-stat-name">MACD · 4H</div>
      <div class="btc-stat-val" style="color:${coinMACDColor}">${coinMACD?coinMACD.histogram.toFixed(4):'—'}</div></div>
    <div class="btc-stat"><div class="btc-stat-name">GENEL YÖN</div>
      <div class="btc-stat-val" style="color:${coinDirColor}">${coinDirLabel}</div></div>`;

  document.getElementById('btcCompareGrid').innerHTML = `
    <div class="btc-compare-col"><div class="btc-compare-label btc-color">BTC</div>${btcCol}</div>
    <div class="btc-compare-col"><div class="btc-compare-label coin-color">${coinName}</div>${coinCol}</div>`;

  // ── Korelasyon barı ──
  if (!btc.isBTC && btc.corrVal !== null) {
    const corrPct  = Math.abs(btc.corrVal) * 100;
    const corrCls  = corrPct > 70 ? 'high' : corrPct > 40 ? 'med' : 'low';
    document.getElementById('btcCorrFill').className = `btc-corr-fill ${corrCls}`;
    document.getElementById('btcCorrFill').style.width = corrPct.toFixed(1) + '%';
    document.getElementById('btcCorrVal').textContent = (btc.corrVal >= 0 ? '+' : '') + btc.corrVal.toFixed(2);
    document.getElementById('btcCorrRow').style.display = 'flex';
  }

  // ── Uyarı satırları ──
  const alerts = [];
  const tf4hCoinDir = coinSig ? coinSig.dir : 'neut';
  const corrAbs     = btc.corrVal !== null ? Math.abs(btc.corrVal) : null;

  if (!btc.isBTC) {

    // ── SENARYO A: Yüksek korelasyon + BTC nötr/bear ama coin yükseliyor ──
    if (corrAbs !== null && corrAbs > 0.7 && btc.btcDir !== 'bull' && tf4hCoinDir === 'bull') {
      alerts.push({
        icon:'⚠️',
        text:`Yüksek korelasyon (${btc.corrVal.toFixed(2)}) olmasına rağmen BTC durgun/düşerken ${coinName} yükseliş veriyor. Bu ayrışma genellikle sürdürülemez — BTC yön kırarsa ${coinName} sert etkilenebilir.`,
        sig:'RİSKLİ', cls:'warn'
      });

    // ── SENARYO B: Düşük korelasyon + coin güçlü yükseliş ──
    } else if (corrAbs !== null && corrAbs < 0.4 && tf4hCoinDir === 'bull') {
      alerts.push({
        icon:'🚀',
        text:`Düşük korelasyon (${btc.corrVal.toFixed(2)}) — ${coinName} BTC'den bağımsız hareket ediyor. Bu yükseliş coin-spesifik bir katalizöre işaret eder ve daha güvenilir olabilir.`,
        sig:'BAĞIMSIZ', cls:'bull'
      });

    // ── SENARYO C: Orta korelasyon + BTC nötr ──
    } else if (corrAbs !== null && corrAbs >= 0.4 && corrAbs <= 0.7 && btc.btcDir === 'neut') {
      alerts.push({
        icon:'🔗',
        text:`Orta korelasyon (${btc.corrVal.toFixed(2)}) ve BTC nötr. ${coinName} kendi dinamikleriyle hareket ediyor ancak BTC yön kırarsa bu coin de etkilenebilir. Piyasa geneli gelişmeleri takip et.`,
        sig:'NÖTR', cls:'neut'
      });

    // ── SENARYO D: Yüksek korelasyon + BTC bull → coin sürüklenme ──
    } else if (corrAbs !== null && corrAbs > 0.7 && btc.btcDir === 'bull' && tf4hCoinDir === 'bull') {
      alerts.push({
        icon:'🔗',
        text:`Güçlü korelasyon (${btc.corrVal.toFixed(2)}) ve BTC yükselişi ${coinName}'i sürüklüyor. BTC yavaşladığında bu coin de ivme kaybedebilir — coin-spesifik bir katalizör yoksa dikkatli ol.`,
        sig:'BTC BAĞLI', cls:'warn'
      });

    // ── Yön çatışmaları ──
    } else if (btc.btcDir === 'bear' && tf4hCoinDir === 'bull') {
      alerts.push({
        icon:'⚠️',
        text:`BTC düşüş trendinde, ancak ${coinName} yükseliş sinyali veriyor. BTC baskısı altında kırılım güçlü olmayabilir.`,
        sig:'ÇATIŞMA', cls:'warn'
      });
    } else if (btc.btcDir === 'bull' && tf4hCoinDir === 'bear') {
      alerts.push({
        icon:'⚠️',
        text:`BTC yükseliş trendinde, ancak ${coinName} düşüş sinyali veriyor. Coin'e özgü bir zayıflık olabilir.`,
        sig:'ÇATIŞMA', cls:'warn'
      });
    } else if (btc.btcDir === tf4hCoinDir && btc.btcDir !== 'neut') {
      alerts.push({
        icon:'✅',
        text:`BTC ve ${coinName} aynı yönde (${btc.btcDir==='bull'?'yükseliş':'düşüş'}). Konfirmasyon güçlü.`,
        sig:'UYUMLU', cls: btc.btcDir==='bull'?'bull':'bear'
      });
    } else {
      alerts.push({
        icon:'◆',
        text:`BTC ve ${coinName} yönleri nötr veya belirsiz. Net bir sinyal yok, piyasayı izlemeye devam et.`,
        sig:'NÖTR', cls:'neut'
      });
    }

    // ── BTC RSI aşırı bölge uyarısı (her senaryoya ek olarak) ──
    if (btc.btcRSI && btc.btcRSI > 70) {
      alerts.push({
        icon:'🔴',
        text:`BTC RSI aşırı alım bölgesinde (${btc.btcRSI.toFixed(1)}). Piyasa geneli düzeltme riski yüksek — açık pozisyonlarda stop seviyelerine dikkat.`,
        sig:'RİSKLİ', cls:'bear'
      });
    } else if (btc.btcRSI && btc.btcRSI < 30) {
      alerts.push({
        icon:'🟢',
        text:`BTC RSI aşırı satım bölgesinde (${btc.btcRSI.toFixed(1)}). Piyasa geneli toparlanma olabilir — altcoinler için fırsat penceresi açılabilir.`,
        sig:'FIRSAT', cls:'bull'
      });
    }

    // ── BTC MACD + coin uyumsuzluğu ──
    if (btc.btcMACD && tf4hCoinDir !== 'neut') {
      const btcMACDDir = btc.btcMACD.histogram > 0 ? 'bull' : 'bear';
      if (btcMACDDir === 'bear' && tf4hCoinDir === 'bull') {
        alerts.push({
          icon:'📉',
          text:`BTC MACD negatif (momentum düşüyor) iken ${coinName} yükseliş sinyali veriyor. Piyasa geneli momentum zayıf — pozisyon boyutunu küçük tut.`,
          sig:'DİKKAT', cls:'warn'
        });
      } else if (btcMACDDir === 'bull' && tf4hCoinDir === 'bull') {
        alerts.push({
          icon:'📈',
          text:`BTC MACD pozitif ve ${coinName} de yükseliş sinyali veriyor. İki gösterge aynı yönde — momentum uyumlu.`,
          sig:'UYUMLU', cls:'bull'
        });
      }
    }

  } else {
    alerts.push({ icon:'₿', text:'Seçilen coin zaten BTC. Korelasyon analizi uygulanamaz.', sig:'BTC', cls:'warn' });
  }

  document.getElementById('btcAlerts').innerHTML = alerts.map(a => `
    <div class="btc-alert-row">
      <div class="btc-alert-icon">${a.icon}</div>
      <div class="btc-alert-text">${a.text}</div>
      <div class="btc-alert-sig ${a.cls}">${a.sig}</div>
    </div>`).join('');
}
