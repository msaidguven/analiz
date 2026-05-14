import { state } from '../state.js';
import { fmtNum } from '../config.js';
import { buildOutput } from '../output.js';

function calcOBV(closes, volumes) {
  // On Balance Volume: kapanış önceki kapanıştan yüksekse hacim ekle, düşükse çıkar
  const obvArr = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i-1])      obvArr.push(obvArr[i-1] + volumes[i]);
    else if (closes[i] < closes[i-1]) obvArr.push(obvArr[i-1] - volumes[i]);
    else                               obvArr.push(obvArr[i-1]);
  }
  return obvArr;
}

function calcVolDelta(klines) {
  // Taker buy/sell hacmi farkı — kline[9]=takerBuyBase, kline[5]=totalVolume
  // Delta = takerBuy - takerSell = 2*takerBuy - total
  const deltas = klines.map(k => {
    const total    = parseFloat(k[5]);
    const takerBuy = parseFloat(k[9]);
    return (takerBuy * 2) - total; // pozitif = alış baskısı
  });
  return deltas;
}

function calcAvgVolume(volumes, period = 20) {
  if (volumes.length < period) return null;
  const slice = volumes.slice(volumes.length - period);
  return slice.reduce((a,b) => a+b, 0) / period;
}

function analyzeVolume(klines) {
  const closes  = klines.map(k => parseFloat(k[4]));
  const volumes = klines.map(k => parseFloat(k[5]));
  const obvArr  = calcOBV(closes, volumes);
  const deltas  = calcVolDelta(klines);

  // Son 20 mum OBV trendi — lineer regresyon eğimi
  const obvSlice  = obvArr.slice(-20);
  const n = obvSlice.length;
  const xMean = (n - 1) / 2;
  const yMean = obvSlice.reduce((a,b) => a+b, 0) / n;
  let num = 0, den = 0;
  obvSlice.forEach((y, x) => { num += (x - xMean) * (y - yMean); den += (x - xMean)**2; });
  const obvSlope = den !== 0 ? num / den : 0;

  // Son 5 mum delta özeti
  const recentDeltas  = deltas.slice(-5);
  const deltaSum      = recentDeltas.reduce((a,b) => a+b, 0);
  const deltaAvg      = deltaSum / recentDeltas.length;

  // Son mumun hacmi vs 20 mum ortalaması
  const avgVol        = calcAvgVolume(volumes, 20);
  const lastVol       = volumes[volumes.length - 1];
  const volRatio      = avgVol ? lastVol / avgVol : null;

  // Fiyat / OBV uyumsuzluğu (son 10 mum)
  const priceChange10 = (closes[closes.length-1] - closes[closes.length-11]) / closes[closes.length-11] * 100;
  const obvChange10   = obvArr[obvArr.length-1] - obvArr[obvArr.length-11];
  let divergence = 'none';
  if (priceChange10 > 1 && obvChange10 < 0)  divergence = 'bearish'; // fiyat çıkıyor, OBV düşüyor
  if (priceChange10 < -1 && obvChange10 > 0) divergence = 'bullish'; // fiyat düşüyor, OBV çıkıyor

  // Son 20 mum için mini bar chart verisi
  const last20closes  = closes.slice(-20);
  const last20volumes = volumes.slice(-20);
  const maxVol20 = Math.max(...last20volumes);
  const bars = last20closes.map((c, i) => ({
    pct:  last20volumes[i] / maxVol20 * 100,
    dir:  i === 0 ? 'flat' : c > last20closes[i-1] ? 'up' : c < last20closes[i-1] ? 'down' : 'flat'
  }));

  // Son mumun fiyat değişimi (tek mum, 4H)
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const lastPriceChange = prevClose ? (lastClose - prevClose) / prevClose * 100 : 0;

  // Son 3 mumun fiyat değişimi (kısa vadeli momentum)
  const close3ago = closes[closes.length - 4];
  const priceChange3 = close3ago ? (lastClose - close3ago) / close3ago * 100 : 0;

  // ZAYIF KIRILIM tespiti:
  // Fiyat son 3×4H içinde +%2 veya üzeri çıktıysa
  // VE son mumun hacmi 20 mum ortalamasının %50'sinin altındaysa
  const weakBreakout = priceChange3 > 2 && volRatio !== null && volRatio < 0.5;

  // GÜÇLENDİRİLMEMİŞ DÜŞÜŞ tespiti:
  // Fiyat son 3×4H içinde -%2 veya daha fazla düştüyse
  // VE son mumun hacmi düşükse (sahte düşüş olabilir)
  const weakDrop = priceChange3 < -2 && volRatio !== null && volRatio < 0.5;

  // HACİM PATLAMASI tespiti: fiyat hareketiyle birlikte hacim 2x+ üstünde
  const volumeSpike = volRatio !== null && volRatio > 2 && Math.abs(priceChange3) > 1;

  return {
    obvSlope, obvTrend: obvSlope > 0 ? 'bull' : obvSlope < 0 ? 'bear' : 'neut',
    deltaAvg, deltaDir: deltaAvg > 0 ? 'bull' : deltaAvg < 0 ? 'bear' : 'neut',
    volRatio, volHot: volRatio !== null && volRatio > 1.5,
    divergence,
    bars,
    priceChange10,
    priceChange3,
    lastPriceChange,
    obvChange10,
    lastVol, avgVol,
    weakBreakout, weakDrop, volumeSpike,
  };
}

export async function fetchAndRenderVol(symbol) {
  try {
    // 4H kline — volumes dahil, zaten MTF'den var ama burada bağımsız çekiyoruz
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=4h&limit=100`
    );
    const klines = await res.json();
    const vol = analyzeVolume(klines);
    state.volData = vol;
    renderVolPanel(vol);
    if (state.detailData._text) buildOutput(state.detailData, symbol);
  } catch(e) {
    document.getElementById('obvChart').innerHTML =
      `<div style="color:var(--red);font-family:'Share Tech Mono',monospace;font-size:9px;padding:8px;width:100%">⚠ ${e.message}</div>`;
  }
}

function renderVolPanel(vol) {
  // ── Mini bar chart ──
  const barsHTML = vol.bars.map(b =>
    `<div class="obv-bar ${b.dir}" style="height:${Math.max(b.pct, 8)}%"></div>`
  ).join('');
  document.getElementById('obvChart').innerHTML = barsHTML;

  // OBV trend etiketi
  const trendColor = vol.obvTrend === 'bull' ? 'var(--green)' : vol.obvTrend === 'bear' ? 'var(--red)' : 'var(--yellow)';
  const trendText  = vol.obvTrend === 'bull' ? '▲ OBV YÜKSELİYOR' : vol.obvTrend === 'bear' ? '▼ OBV DÜŞÜYOR' : '◆ OBV YATAY';
  document.getElementById('obvTrendText').innerHTML =
    `<span style="color:${trendColor};font-weight:700">${trendText}</span>`;

  // ── Metrikler ──
  const volRatioLabel = vol.volRatio === null ? '—' : vol.volRatio.toFixed(2) + 'x';
  const volRatioCls   = vol.volRatio === null ? 'neut' : vol.volRatio > 2 ? 'bull' : vol.volRatio > 1.5 ? 'neut' : 'bear';
  const volRatioSig   = vol.volRatio === null ? '—' : vol.volRatio > 2 ? 'PATLAMA' : vol.volRatio > 1.5 ? 'YÜKSEK' : vol.volRatio > 0.7 ? 'NORMAL' : 'DÜŞÜK';

  const deltaCls      = vol.deltaDir === 'bull' ? 'bull' : vol.deltaDir === 'bear' ? 'bear' : 'neut';
  const deltaSig      = vol.deltaDir === 'bull' ? 'ALIŞ BASKISI' : vol.deltaDir === 'bear' ? 'SATIŞ BASKISI' : 'NÖTR';
  const deltaVal      = (vol.deltaAvg >= 0 ? '+' : '') + fmtNum(vol.deltaAvg);

  const divCls        = vol.divergence === 'bullish' ? 'bull' : vol.divergence === 'bearish' ? 'bear' : 'neut';
  const divSig        = vol.divergence === 'bullish' ? 'BOĞA UYUŞMAZLIĞI' : vol.divergence === 'bearish' ? 'AYI UYUŞMAZLIĞI' : 'UYUMLU';
  const divVal        = vol.divergence === 'none'
    ? `Fiyat ${vol.priceChange10 >= 0 ? '+' : ''}${vol.priceChange10.toFixed(1)}%`
    : `Fiyat ${vol.priceChange10 >= 0 ? '+' : ''}${vol.priceChange10.toFixed(1)}% / OBV ters`;

  document.getElementById('volMetrics').innerHTML = `
    <div class="vol-metric-row">
      <div class="vol-metric-label">OBV TREND (20 mum)</div>
      <div class="vol-metric-val" style="color:${trendColor}">${vol.obvTrend === 'bull' ? '▲' : vol.obvTrend === 'bear' ? '▼' : '◆'}</div>
      <div class="vol-metric-sig ${vol.obvTrend}">${trendText.replace('▲ ','').replace('▼ ','').replace('◆ ','')}</div>
    </div>
    <div class="vol-metric-row">
      <div class="vol-metric-label">SON MUM / ORT. HACİM</div>
      <div class="vol-metric-val" style="color:${vol.volRatio > 1.5 ? 'var(--green)' : 'var(--dim)'}">${volRatioLabel}</div>
      <div class="vol-metric-sig ${volRatioCls}">${volRatioSig}</div>
    </div>
    <div class="vol-metric-row">
      <div class="vol-metric-label">TAKER DELTA (son 5×4H)</div>
      <div class="vol-metric-val" style="color:${deltaCls === 'bull' ? 'var(--green)' : deltaCls === 'bear' ? 'var(--red)' : 'var(--yellow)'}">${deltaVal}</div>
      <div class="vol-metric-sig ${deltaCls}">${deltaSig}</div>
    </div>
    <div class="vol-metric-row">
      <div class="vol-metric-label">FİYAT / OBV UYUMU (10 mum)</div>
      <div class="vol-metric-val" style="font-size:10px;color:${divCls === 'bull' ? 'var(--green)' : divCls === 'bear' ? 'var(--red)' : 'var(--dim)'}">${divVal}</div>
      <div class="vol-metric-sig ${divCls}">${divSig}</div>
    </div>
    ${vol.divergence !== 'none' ? `
    <div class="vol-alert ${divCls}">
      ${vol.divergence === 'bearish'
        ? '⚠ AYI UYUŞMAZLIĞI: Fiyat yükselirken OBV düşüyor. Kırılım sahte olabilir.'
        : '✓ BOĞA UYUŞMAZLIĞI: Fiyat düşerken OBV çıkıyor. Dip güçlenebilir.'}
    </div>` : ''}
    ${vol.weakBreakout ? `
    <div class="vol-alert neut">
      ⚠ ZAYIF KIRILIM: Fiyat son 3×4H'de +%${vol.priceChange3.toFixed(1)} yükseldi,
      ancak hacim ortalamanın yalnızca ${(vol.volRatio * 100).toFixed(0)}%'i.
      Bu hareketi destekleyen güçlü alıcı yok — kırılım sahte veya kısa ömürlü olabilir.
    </div>` : ''}
    ${vol.weakDrop ? `
    <div class="vol-alert bull">
      ℹ ZAYIF DÜŞÜŞ: Fiyat son 3×4H'de -%${Math.abs(vol.priceChange3).toFixed(1)} geriledi,
      ancak hacim ortalamanın yalnızca ${(vol.volRatio * 100).toFixed(0)}%'i.
      Satış baskısı zayıf — düşüş sürdürülemeyebilir.
    </div>` : ''}
    ${vol.volumeSpike ? `
    <div class="vol-alert bull">
      🔥 HACİM PATLAMASI: Son mum hacmi ortalamanın ${vol.volRatio.toFixed(1)}x'i.
      Fiyat hareketi (${vol.priceChange3 >= 0 ? '+' : ''}%${vol.priceChange3.toFixed(1)}) güçlü hacimle destekleniyor.
    </div>` : ''}`;
}
