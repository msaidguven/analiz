import { state } from '../state.js';
import { formatPrice } from '../config.js';
import { buildOutput } from '../output.js';

function findPivots(highs, lows, wing = 5) {
  const pivotHighs = [], pivotLows = [];
  for (let i = wing; i < highs.length - wing; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isHigh = false;
      if (lows[j]  <= lows[i])  isLow  = false;
    }
    if (isHigh) pivotHighs.push({ idx: i, price: highs[i] });
    if (isLow)  pivotLows.push({ idx: i, price: lows[i] });
  }
  return { pivotHighs, pivotLows };
}

// Yakın seviyeleri birleştir (fiyatın %0.5'i içinde olanlar aynı seviye)
function clusterLevels(pivots, currentPrice, threshold = 0.005) {
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters = [];
  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(p.price - last.price) / last.price < threshold) {
      last.touches++;
      last.price = (last.price * last.touches + p.price) / (last.touches + 1); // ağırlıklı ortalama
    } else {
      clusters.push({ price: p.price, touches: 1 });
    }
  }
  return clusters;
}

function calcSupportResistance(klines, currentPrice) {
  const highs  = klines.map(k => parseFloat(k[2]));
  const lows   = klines.map(k => parseFloat(k[3]));
  const closes = klines.map(k => parseFloat(k[4]));

  // ── 1. Adım: Dinamik wing ile pivot tespiti ──
  // wing=5 → wing=3 → wing=2 sırasıyla dene, yeterli direnç bulunana kadar
  let pivotHighs = [], pivotLows = [];
  for (const wing of [5, 3, 2]) {
    const result = findPivots(highs, lows, wing);
    pivotHighs = result.pivotHighs;
    pivotLows  = result.pivotLows;
    const resCount = clusterLevels(pivotHighs, currentPrice)
      .filter(c => c.price > currentPrice).length;
    if (resCount >= 2) break; // yeterli direnç bulundu
  }

  let resClusters = clusterLevels(pivotHighs, currentPrice)
    .filter(c => c.price > currentPrice)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);

  let supClusters = clusterLevels(pivotLows, currentPrice)
    .filter(c => c.price < currentPrice)
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);

  // ── 2. Adım: Yedek — hâlâ direnç bulunamazsa ──
  // Fiyat son zirvedeyse swing high pivot bulunamaz.
  // Yedek olarak: son 200 mumun en yüksek %10'luk kısmındaki
  // bar kapanışlarından küme oluştur.
  if (resClusters.length === 0) {
    const sortedHighs = [...highs].sort((a, b) => b - a);
    const top10pct    = sortedHighs.slice(0, Math.ceil(highs.length * 0.1));
    // Bu yükseklerin ortalamasını bir "bölge" olarak işaretle
    const topAvg      = top10pct.reduce((a, b) => a + b, 0) / top10pct.length;
    const topMax      = sortedHighs[0];
    // Fiyatın üstündeyse ekle
    if (topAvg > currentPrice)
      resClusters.push({ price: topAvg, touches: 2, isFallback: true });
    if (topMax > currentPrice && Math.abs(topMax - topAvg) / topAvg > 0.005)
      resClusters.push({ price: topMax, touches: 1, isFallback: true });
    resClusters = resClusters.sort((a, b) => a.price - b.price).slice(0, 3);
  }

  // ── 3. Adım: Psikolojik yuvarlak sayılar yedek olarak ekle ──
  // Hâlâ yeterli direnç yoksa fiyatın hemen üstündeki
  // yuvarlak seviyeleri (×0.5, ×1.0 artışlar) ekle
  if (resClusters.length < 2) {
    const magnitude = Math.pow(10, Math.floor(Math.log10(currentPrice)) - 1);
    const step      = magnitude * 5; // örn. $1 coin için 0.05, $100 coin için 5
    let candidate   = Math.ceil(currentPrice / step) * step;
    let added       = 0;
    while (added < 3 - resClusters.length && candidate < currentPrice * 1.3) {
      const alreadyExists = resClusters.some(r => Math.abs(r.price - candidate) / candidate < 0.005);
      if (!alreadyExists && candidate > currentPrice * 1.001) {
        resClusters.push({ price: candidate, touches: 1, isPsychological: true });
        added++;
      }
      candidate = Math.round((candidate + step) * 1e8) / 1e8;
    }
    resClusters = resClusters.sort((a, b) => a.price - b.price).slice(0, 3);
  }

  // Fiyatın zirve bölgesinde olup olmadığını işaretle
  const allTimeHigh  = Math.max(...highs);
  const nearATH      = (allTimeHigh - currentPrice) / currentPrice < 0.03; // %3 içinde

  return { resistances: resClusters, supports: supClusters, nearATH, allTimeHigh };
}

export async function fetchAndRenderSR(symbol, price) {
  try {
    document.getElementById('srChart').innerHTML =
      `<div class="ta-loading" style="height:100%;justify-content:center"><div class="ta-spinner"></div></div>`;
    document.getElementById('srList').innerHTML =
      `<div style="color:var(--dim);font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px">Hesaplanıyor...</div>`;

    // 4H kline — zaten MTF'den çekiliyor ama kanalın ham kline'ına ihtiyacımız var
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=4h&limit=200`
    );
    const klines = await res.json();
    const sr = calcSupportResistance(klines, price);
    state.srData = sr;

    renderSRPanel(sr, price);
    // Çıktıyı güncelle
    if (state.detailData._text) buildOutput(state.detailData, symbol);
  } catch(e) {
    document.getElementById('srChart').innerHTML =
      `<div style="color:var(--red);font-family:'Share Tech Mono',monospace;font-size:9px;padding:8px">⚠ ${e.message}</div>`;
  }
}

function renderSRPanel(sr, price) {
  const { resistances, supports, nearATH, allTimeHigh } = sr;

  // Tüm seviyeleri bir araya getir, chart için aralık hesapla
  const allPrices = [price, ...resistances.map(r => r.price), ...supports.map(s => s.price)];
  const minP = Math.min(...allPrices) * 0.998;
  const maxP = Math.max(...allPrices) * 1.002;
  const range = maxP - minP || price * 0.01; // sıfır bölme koruması

  function toY(p) {
    return ((maxP - p) / range * 100).toFixed(1) + '%';
  }

  // ── CHART ──
  let chartHTML = '';
  const priceY = ((maxP - price) / range * 100);
  chartHTML += `<div class="sr-zone-res" style="height:${priceY.toFixed(1)}%"></div>`;
  chartHTML += `<div class="sr-zone-sup" style="height:${(100 - priceY).toFixed(1)}%"></div>`;

  resistances.forEach(r => {
    const lineStyle = r.isPsychological ? 'border-top:1px dashed rgba(255,23,68,0.4)' : '';
    chartHTML += `<div class="sr-level-line res" style="top:${toY(r.price)};${r.isPsychological?'opacity:0.5':''}"></div>`;
    chartHTML += `<div class="sr-price-label res" style="top:${toY(r.price)}">${formatPrice(r.price)}${r.isPsychological?' ~':''}</div>`;
  });
  supports.forEach(s => {
    chartHTML += `<div class="sr-level-line sup" style="top:${toY(s.price)}"></div>`;
    chartHTML += `<div class="sr-price-label sup" style="top:${toY(s.price)}">${formatPrice(s.price)}</div>`;
  });
  chartHTML += `<div class="sr-level-line price-now" style="top:${toY(price)}"></div>`;
  chartHTML += `<div class="sr-price-label now" style="top:${toY(price)}">▶ ${formatPrice(price)}</div>`;

  document.getElementById('srChart').innerHTML = chartHTML;

  // ── LİSTE ──
  let listHTML = '';

  // Zirve bölgesi uyarısı
  if (nearATH) {
    listHTML += `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:4px;
      background:rgba(255,171,0,0.06);border:1px solid rgba(255,171,0,0.2)">
      <span style="font-size:13px">⚠️</span>
      <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--yellow);letter-spacing:1px;line-height:1.5">
        FİYAT ZİRVE BÖLGESİNDE — Swing pivot bulunamıyor.<br>
        Dirençler tahmini seviyeler olabilir.
      </span>
    </div>`;
  }

  resistances.forEach(r => {
    const distPct  = ((r.price - price) / price * 100).toFixed(2);
    const strength = Math.min(r.touches, 4);
    const tag      = r.isPsychological ? ' <span style="font-size:8px;color:var(--dim)">(PSİKOLOJİK)</span>'
                   : r.isFallback      ? ' <span style="font-size:8px;color:var(--dim)">(TAHMİNİ)</span>'
                   : '';
    listHTML += `
    <div class="sr-item">
      <div class="sr-badge res">DİRENÇ</div>
      <div class="sr-item-price">${formatPrice(r.price)}${tag}</div>
      <div class="sr-item-dist res">+%${distPct}</div>
      <div class="sr-item-strength">
        ${[1,2,3,4].map(i => `<div class="sr-dot res ${i<=strength?'on':''}"></div>`).join('')}
      </div>
    </div>`;
  });

  // Direnç bulunamadıysa açıklama
  if (resistances.length === 0) {
    listHTML += `
    <div style="padding:8px 0;font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);letter-spacing:1px">
      Üst direnç seviyesi tespit edilemedi.
    </div>`;
  }

  // Mevcut fiyat ayırıcı
  listHTML += `
  <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
    <div style="flex:1;height:1px;background:var(--bright);opacity:0.2"></div>
    <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--bright);letter-spacing:1px">
      ▶ ${formatPrice(price)}
    </div>
    <div style="flex:1;height:1px;background:var(--bright);opacity:0.2"></div>
  </div>`;

  supports.forEach(s => {
    const distPct = ((price - s.price) / price * 100).toFixed(2);
    const strength = Math.min(s.touches, 4);
    listHTML += `
    <div class="sr-item">
      <div class="sr-badge sup">DESTEK</div>
      <div class="sr-item-price">${formatPrice(s.price)}</div>
      <div class="sr-item-dist sup">-%${distPct}</div>
      <div class="sr-item-strength">
        ${[1,2,3,4].map(i => `<div class="sr-dot sup ${i<=strength?'on':''}"></div>`).join('')}
      </div>
    </div>`;
  });

  document.getElementById('srList').innerHTML = listHTML;

  // ── ÖZET ──
  const nearestRes = resistances[0];
  const nearestSup = supports[0];
  let icon, title, sub;

  if (nearestRes && nearestSup) {
    const rDist = (nearestRes.price - price) / price * 100;
    const sDist = (price - nearestSup.price) / price * 100;
    if (nearATH) {
      icon = '🏔️'; title = 'FİYAT ZİRVE BÖLGESİNDE';
      sub  = `200 mumluk en yüksek: ${formatPrice(allTimeHigh)} · Tahmini dirençler gösteriliyor`;
    } else if (rDist < 1.5) {
      icon = '⚠️'; title = 'GÜÇLÜ DİRENÇ YAKIN';
      sub  = `Üst direnç yalnızca %${rDist.toFixed(2)} uzakta — kırılım önemli`;
    } else if (sDist < 1.5) {
      icon = '🛡️'; title = 'DESTEK YAKIN';
      sub  = `Alt destek %${sDist.toFixed(2)} uzakta — bu seviye kritik`;
    } else if (rDist < sDist) {
      icon = '📍'; title = 'DİRENÇ BÖLGESİNE YAKIN';
      sub  = `Direnç %${rDist.toFixed(2)} · Destek %${sDist.toFixed(2)} uzakta`;
    } else {
      icon = '📍'; title = 'DESTEK / DİRENÇ ARASI';
      sub  = `Destek %${sDist.toFixed(2)} · Direnç %${rDist.toFixed(2)} uzakta`;
    }
  } else if (nearestRes) {
    const rDist = (nearestRes.price - price) / price * 100;
    icon = '🔴'; title = 'YALNIZCA DİRENÇ TESPİT EDİLDİ';
    sub  = `En yakın direnç %${rDist.toFixed(2)} uzakta`;
  } else if (nearestSup) {
    const sDist = (price - nearestSup.price) / price * 100;
    icon = '🟢'; title = 'YALNIZCA DESTEK TESPİT EDİLDİ';
    sub  = `En yakın destek %${sDist.toFixed(2)} uzakta`;
  } else {
    icon = '📍'; title = 'SEVİYE TESPİT EDİLEMEDİ';
    sub  = 'Yetersiz fiyat verisi';
  }

  document.getElementById('srIcon').textContent = icon;
  document.getElementById('srTitle').textContent = title;
  document.getElementById('srSub').textContent = sub;
  document.getElementById('srSummary').style.display = 'flex';
}
