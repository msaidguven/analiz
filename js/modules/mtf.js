import { state } from '../state.js';
import { calcRSI, calcMACD, calcBollinger } from '../indicators.js';
import { formatPrice } from '../config.js';
import { buildOutput } from '../output.js';

async function fetchTFData(symbol, interval, limit) {
  const res = await fetch(
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );
  const klines = await res.json();
  const closes  = klines.map(k => parseFloat(k[4]));
  const volumes = klines.map(k => parseFloat(k[5]));
  const currentClose = closes[closes.length - 1];

  const rsi  = calcRSI(closes, 14);
  const macd = calcMACD(closes);
  const bb   = calcBollinger(closes, 20, 2);

  return { rsi, macd, bb, currentClose, closes, volumes, klineCount: klines.length, interval };
}

// Üç zaman dilimini paralel çek
async function fetchTechnicalData(symbol) {
  const [r1h, r4h, r1w] = await Promise.allSettled([
    fetchTFData(symbol, '1h', 200),
    fetchTFData(symbol, '4h', 200),
    fetchTFData(symbol, '1w', 100),
  ]);

  const tf1h = r1h.status === 'fulfilled' ? r1h.value : null;
  const tf4h = r4h.status === 'fulfilled' ? r4h.value : null;
  const tf1w = r1w.status === 'fulfilled' ? r1w.value : null;

  // 4H'ı geriye dönük uyumluluk için ana state.state.taData olarak dön
  const base = tf4h || {};
  return {
    ...base,
    mtf: { tf1h, tf4h, tf1w }
  };
}

// Bir zaman diliminin sinyal yönünü hesapla (bull/bear/neut) ve skor üret
export function tfSignal(tf) {
  if (!tf) return { dir: 'neut', score: 0, rsiSig: 'neut', macdSig: 'neut', bbSig: 'neut' };
  let bullCount = 0, bearCount = 0;

  const rsiSig = tf.rsi > 55 ? 'bull' : tf.rsi < 45 ? 'bear' : 'neut';
  const macdSig = tf.macd ? (tf.macd.histogram > 0 ? 'bull' : 'bear') : 'neut';
  let bbSig = 'neut';
  if (tf.bb && tf.currentClose) {
    const pos = (tf.currentClose - tf.bb.lower) / (tf.bb.upper - tf.bb.lower);
    bbSig = tf.currentClose > tf.bb.upper ? 'bear' : tf.currentClose < tf.bb.lower ? 'bull' : pos > 0.6 ? 'bull' : pos < 0.4 ? 'bear' : 'neut';
  }

  [rsiSig, macdSig, bbSig].forEach(s => {
    if (s === 'bull') bullCount++;
    if (s === 'bear') bearCount++;
  });

  const dir = bullCount > bearCount ? 'bull' : bearCount > bullCount ? 'bear' : 'neut';
  const score = bullCount - bearCount; // -3 → +3
  return { dir, score, rsiSig, macdSig, bbSig };
}

// Tek bir sütun HTML'i oluştur
function buildTFColHTML(tf, tfLabel, tfClass) {
  if (!tf) return `<div style="color:var(--dim);font-family:'Share Tech Mono',monospace;font-size:9px;padding:6px">Veri alınamadı</div>`;

  const sig = tfSignal(tf);
  const rsiColor = sig.rsiSig === 'bull' ? 'var(--green)' : sig.rsiSig === 'bear' ? 'var(--red)' : 'var(--yellow)';
  const macdColor = sig.macdSig === 'bull' ? 'var(--green)' : sig.macdSig === 'bear' ? 'var(--red)' : 'var(--yellow)';
  const bbColor = sig.bbSig === 'bull' ? 'var(--green)' : sig.bbSig === 'bear' ? 'var(--red)' : 'var(--yellow)';

  const rsiLabel = tf.rsi > 70 ? 'AŞIRI ALIM' : tf.rsi < 30 ? 'AŞIRI SATIM' : tf.rsi > 55 ? 'GÜÇLÜ' : tf.rsi < 45 ? 'ZAYIF' : 'NÖTR';
  const macdLabel = !tf.macd ? '—' : tf.macd.histogram > 0 ? 'POZİTİF' : 'NEGATİF';
  const macdTrend = tf.macd && tf.macd.prevHisto !== null
    ? (Math.abs(tf.macd.histogram) > Math.abs(tf.macd.prevHisto) ? '↑' : '↓')
    : '';

  let bbLabel = '—';
  if (tf.bb && tf.currentClose) {
    const pos = (tf.currentClose - tf.bb.lower) / (tf.bb.upper - tf.bb.lower);
    bbLabel = tf.currentClose > tf.bb.upper ? 'ÜST AŞIM' : tf.currentClose < tf.bb.lower ? 'ALT AŞIM' : pos > 0.65 ? 'ÜST BÖLGE' : pos < 0.35 ? 'ALT BÖLGE' : 'ORTA';
  }

  return `
    <div class="mtf-ind">
      <div class="mtf-ind-name">RSI(14)</div>
      <div class="mtf-ind-val" style="color:${rsiColor}">${tf.rsi !== null ? tf.rsi.toFixed(1) : '—'}</div>
      <div class="mtf-ind-sig ${sig.rsiSig}">${rsiLabel}</div>
    </div>
    <div class="mtf-ind">
      <div class="mtf-ind-name">MACD</div>
      <div class="mtf-ind-val" style="color:${macdColor}">${tf.macd ? tf.macd.histogram.toFixed(4) : '—'} <span style="font-size:10px">${macdTrend}</span></div>
      <div class="mtf-ind-sig ${sig.macdSig}">${macdLabel}</div>
    </div>
    <div class="mtf-ind">
      <div class="mtf-ind-name">BOLLİNGER</div>
      <div class="mtf-ind-val" style="color:${bbColor};font-size:10px">${tf.bb ? formatPrice(tf.currentClose) : '—'}</div>
      <div class="mtf-ind-sig ${sig.bbSig}">${bbLabel}</div>
    </div>`;
}

// Genel MTF konfirmasyon özetini güncelle
function updateMTFSummary(mtf) {
  const s1h = tfSignal(mtf.tf1h);
  const s4h = tfSignal(mtf.tf4h);
  const s1w = tfSignal(mtf.tf1w);

  const totalScore = s1h.score + s4h.score + s1w.score; // -9 → +9
  const bullTFs = [s1h, s4h, s1w].filter(s => s.dir === 'bull').length;
  const bearTFs = [s1h, s4h, s1w].filter(s => s.dir === 'bear').length;

  let icon, titleText, titleCls, subText;

  if (bullTFs === 3) {
    icon = '🟢'; titleText = 'GÜÇLÜ YUKARI TREND'; titleCls = 'all-bull';
    subText = '3 zaman dilimi de yükseliş sinyali veriyor — yüksek konfirmasyon';
  } else if (bearTFs === 3) {
    icon = '🔴'; titleText = 'GÜÇLÜ AŞAĞI TREND'; titleCls = 'all-bear';
    subText = '3 zaman dilimi de düşüş sinyali veriyor — yüksek konfirmasyon';
  } else if (bullTFs === 2) {
    icon = '🟡'; titleText = 'ZAYIF YUKARI EĞİLİM'; titleCls = 'mixed';
    subText = '2/3 zaman dilimi yükseliş — dikkatli pozisyon';
  } else if (bearTFs === 2) {
    icon = '🟡'; titleText = 'ZAYIF AŞAĞI EĞİLİM'; titleCls = 'mixed';
    subText = '2/3 zaman dilimi düşüş — dikkatli pozisyon';
  } else {
    icon = '⚪'; titleText = 'KARIŞIK SİNYAL'; titleCls = 'mixed';
    subText = 'Zaman dilimleri çelişiyor — net yön yok, bekle';
  }

  document.getElementById('mtfIcon').textContent = icon;
  const titleEl = document.getElementById('mtfTitle');
  titleEl.textContent = titleText;
  titleEl.className = `mtf-confirm-title ${titleCls}`;
  document.getElementById('mtfSub').textContent = subText;

  // Skor noktaları — her TF için 3 nokta (RSI, MACD, BB)
  const dots = [s1h, s4h, s1w].flatMap(s => [
    { cls: s.rsiSig },
    { cls: s.macdSig },
    { cls: s.bbSig },
  ]);
  document.getElementById('mtfScoreBar').innerHTML = dots.map(d =>
    `<div class="mtf-score-dot ${d.cls}"></div>`
  ).join('');
}

function renderTAPanel(ta, price) {
  if (!ta || !ta.mtf) return;
  const { tf1h, tf4h, tf1w } = ta.mtf;

  // Sütunları doldur
  const col1h = document.getElementById('mtfCol1h');
  const col4h = document.getElementById('mtfCol4h');
  const col1w = document.getElementById('mtfCol1w');

  col1h.classList.remove('loading-col');
  col4h.classList.remove('loading-col');
  col1w.classList.remove('loading-col');

  col1h.innerHTML = `<div class="mtf-tf-label tf-1h">1H</div>${buildTFColHTML(tf1h, '1H', 'tf-1h')}`;
  col4h.innerHTML = `<div class="mtf-tf-label tf-4h">4H</div>${buildTFColHTML(tf4h, '4H', 'tf-4h')}`;
  col1w.innerHTML = `<div class="mtf-tf-label tf-1w">1W</div>${buildTFColHTML(tf1w, '1W', 'tf-1w')}`;

  updateMTFSummary(ta.mtf);
}
export async function fetchAndRenderTA(symbol) {
  try {
    const ta = await fetchTechnicalData(symbol);
    state.taData = ta;
    const price = state.detailData.price || ta.currentClose;
    renderTAPanel(ta, price);
    // rebuild output with TA included
    if (state.detailData.price) buildOutput(state.detailData, symbol);
  } catch(e) {
    ['mtfCol1h','mtfCol4h','mtfCol1w'].forEach(id => {
      const el = document.getElementById(id);
      el.classList.remove('loading-col');
      el.innerHTML = `<div style="color:var(--red);font-family:'Share Tech Mono',monospace;font-size:9px;padding:4px">⚠ ${e.message}</div>`;
    });
  }
}
