import { state } from './state.js';
import { formatPrice, formatVol, fmtNum } from './config.js';
import { tfSignal } from './modules/mtf.js';

export function buildOutput(d, symbol) {
  const now = new Date().toLocaleString('tr-TR');
  let t = `📊 ${symbol} — BİNANCE FUTURES VERİSİ\n`;
  t += `🕐 ${now}\n`;
  t += '─'.repeat(42) + '\n\n';

  if (d.price) t += `💰 Fiyat: ${formatPrice(d.price)}  (${d.change >= 0 ? '+' : ''}${d.change?.toFixed(2)}% 24s)\n`;
  if (d.high) t += `   24s Yüksek: ${formatPrice(d.high)} | Düşük: ${formatPrice(d.low)}\n`;
  if (d.volume) t += `📦 Hacim (24s): ${formatVol(d.volume)}\n`;
  t += '\n';

  if (d.oiUSD) t += `📈 Open Interest: ${formatVol(d.oiUSD)}\n`;
  if (d.oiContracts) t += `   Kontrat: ${fmtNum(d.oiContracts)}\n`;
  t += '\n';

  if (d.funding !== undefined) {
    t += `💸 Funding Rate: ${d.funding.toFixed(4)}%`;
    t += d.funding > 0.08 ? ' ⚠ AŞIRI YÜKSEK\n' : d.funding < 0 ? ' (Negatif)\n' : '\n';
  }

  t += '\n';

  if (d.longPct) {
    t += `⚖️ Long/Short (Hesap):\n`;
    t += `   Long: %${d.longPct.toFixed(1)} | Short: %${d.shortPct.toFixed(1)}\n`;
    t += `   Oran: ${d.lsRatio?.toFixed(4)} → ${d.shortPct > 55 ? 'Short ağırlıklı' : 'Long ağırlıklı'}\n`;
  }

  t += '\n';

  if (d.ttAcc) t += `🔝 Top Trader Hesap L/S: ${d.ttAcc.toFixed(4)}  →  ${d.ttAcc > 1 ? 'Long ağırlıklı' : 'Short ağırlıklı'}\n`;
  if (d.ttPos) t += `🔝 Top Trader Pozisyon L/S: ${d.ttPos.toFixed(4)}  →  ${d.ttPos > 1 ? 'Long ağırlıklı' : 'Short ağırlıklı'}\n`;

  // ── MTF TEKNİK ANALİZ BÖLÜMÜ ──
  if (state.taData && state.taData.mtf) {
    const { tf1h, tf4h, tf1w } = state.taData.mtf;
    t += '\n' + '─'.repeat(42) + '\n';
    t += `📐 ÇOK ZAMANLI TEKNİK ANALİZ (MTF)\n`;
    t += '─'.repeat(42) + '\n\n';

    // Konfirmasyon özeti
    const s1h = tfSignal(tf1h), s4h = tfSignal(tf4h), s1w = tfSignal(tf1w);
    const bullTFs = [s1h, s4h, s1w].filter(s => s.dir === 'bull').length;
    const bearTFs = [s1h, s4h, s1w].filter(s => s.dir === 'bear').length;
    const konfirm = bullTFs === 3 ? '🟢 GÜÇLÜ YUKARI — 3/3 zaman dilimi yükseliş'
      : bearTFs === 3 ? '🔴 GÜÇLÜ AŞAĞI — 3/3 zaman dilimi düşüş'
      : bullTFs === 2 ? '🟡 ZAYIF YUKARI — 2/3 zaman dilimi yükseliş'
      : bearTFs === 2 ? '🟡 ZAYIF AŞAĞI — 2/3 zaman dilimi düşüş'
      : '⚪ KARIŞIK — Zaman dilimleri çelişiyor';
    t += `📡 MTF Konfirmasyon: ${konfirm}\n\n`;

    const tfs = [{ label:'1H', tf: tf1h }, { label:'4H', tf: tf4h }, { label:'1W', tf: tf1w }];
    tfs.forEach(({ label, tf }) => {
      if (!tf) { t += `[${label}] Veri alınamadı\n\n`; return; }
      const s = tfSignal(tf);
      t += `[${label}] Genel Yön: ${s.dir === 'bull' ? '▲ YUKARI' : s.dir === 'bear' ? '▼ AŞAĞI' : '◆ NÖTR'}\n`;
      if (tf.rsi !== null) {
        const rl = tf.rsi > 70 ? 'AŞIRI ALIM ⚠' : tf.rsi < 30 ? 'AŞIRI SATIM ⚠' : tf.rsi > 55 ? 'Güçlü' : tf.rsi < 45 ? 'Zayıf' : 'Nötr';
        t += `   RSI(14): ${tf.rsi.toFixed(2)} → ${rl}\n`;
      }
      if (tf.macd) {
        const md = tf.macd.histogram > 0 ? 'Pozitif' : 'Negatif';
        const mt = tf.macd.prevHisto !== null ? (Math.abs(tf.macd.histogram) > Math.abs(tf.macd.prevHisto) ? '↑ güçleniyor' : '↓ zayıflıyor') : '';
        t += `   MACD histo: ${tf.macd.histogram.toFixed(6)} → ${md} ${mt}\n`;
      }
      if (tf.bb && tf.currentClose) {
        const pos = (tf.currentClose - tf.bb.lower) / (tf.bb.upper - tf.bb.lower);
        const bl = tf.currentClose > tf.bb.upper ? 'Üst Bant ÜZERİ ⚠' : tf.currentClose < tf.bb.lower ? 'Alt Bant ALTI ⚠' : pos > 0.65 ? 'Üst bölge' : pos < 0.35 ? 'Alt bölge' : 'Orta bölge';
        t += `   Bollinger: ${bl} (pos: %${(pos*100).toFixed(1)})\n`;
      }
      t += '\n';
    });
  }

  // ── DESTEK / DİRENÇ BÖLÜMÜ ──
  if (state.srData.resistances && state.srData.supports && d.price) {
    t += '\n' + '─'.repeat(42) + '\n';
    t += `📏 DESTEK / DİRENÇ SEVİYELERİ (4H Swing)\n`;
    t += '─'.repeat(42) + '\n\n';
    t += `💰 Mevcut Fiyat: ${formatPrice(d.price)}\n`;
    if (state.srData.nearATH) {
      t += `⚠ NOT: Fiyat son 200 mumun zirve bölgesinde.\n`;
      t += `   Swing pivot bulunamadı — dirençler tahmini/psikolojik seviyelerdir.\n`;
    }
    t += '\n';
    state.srData.resistances.forEach((r, i) => {
      const dist  = ((r.price - d.price) / d.price * 100).toFixed(2);
      const stars = '★'.repeat(Math.min(r.touches, 4)) + '☆'.repeat(Math.max(0, 4 - Math.min(r.touches, 4)));
      const tip   = r.isPsychological ? ' (Psikolojik)' : r.isFallback ? ' (Tahmini)' : '';
      t += `🔴 DİRENÇ ${i+1}: ${formatPrice(r.price)}  (+%${dist})  Güç: ${stars}${tip}\n`;
    });
    t += '\n';
    state.srData.supports.forEach((s, i) => {
      const dist  = ((d.price - s.price) / d.price * 100).toFixed(2);
      const stars = '★'.repeat(Math.min(s.touches, 4)) + '☆'.repeat(Math.max(0, 4 - Math.min(s.touches, 4)));
      t += `🟢 DESTEK ${i+1}:  ${formatPrice(s.price)}  (-%${dist})  Güç: ${stars}\n`;
    });
    if (state.srData.resistances[0] && state.srData.supports[0]) {
      const rD = ((state.srData.resistances[0].price - d.price) / d.price * 100).toFixed(2);
      const sD = ((d.price - state.srData.supports[0].price) / d.price * 100).toFixed(2);
      t += `\n📍 Konum: En yakın direnç %${rD} yukarda · En yakın destek %${sD} aşağıda\n`;
      if (parseFloat(rD) < 1.5) t += `   ⚠ DİRENÇ ÇOK YAKIN — kırılım veya geri dönüş kritik\n`;
      if (parseFloat(sD) < 1.5) t += `   ⚠ DESTEK ÇOK YAKIN — bu seviyenin tutulması önemli\n`;
    }
  }

  // ── HACİM ANALİZİ BÖLÜMÜ ──
  if (state.volData.obvTrend) {
    t += '\n' + '─'.repeat(42) + '\n';
    t += `📊 HACİM ANALİZİ — 4H (OBV & DELTA)\n`;
    t += '─'.repeat(42) + '\n\n';

    const obvDir = state.volData.obvTrend === 'bull' ? '▲ Yükseliyor' : state.volData.obvTrend === 'bear' ? '▼ Düşüyor' : '◆ Yatay';
    t += `📈 OBV Trend (son 20×4H): ${obvDir}\n`;

    if (state.volData.volRatio !== null) {
      const vLabel = state.volData.volRatio > 2 ? 'PATLAMA ⚠' : state.volData.volRatio > 1.5 ? 'Yüksek' : state.volData.volRatio > 0.7 ? 'Normal' : 'Düşük';
      t += `📦 Son Mum Hacmi / Ort: ${state.volData.volRatio.toFixed(2)}x  →  ${vLabel}\n`;
    }

    const dSign  = state.volData.deltaAvg >= 0 ? '+' : '';
    const dLabel = state.volData.deltaDir === 'bull' ? 'Alış Baskısı' : state.volData.deltaDir === 'bear' ? 'Satış Baskısı' : 'Nötr';
    t += `⚡ Taker Delta (son 5×4H): ${dSign}${fmtNum(state.volData.deltaAvg)}  →  ${dLabel}\n`;

    if (state.volData.priceChange3 !== undefined) {
      t += `📉 Son 3×4H Fiyat Değişimi: ${state.volData.priceChange3 >= 0 ? '+' : ''}${state.volData.priceChange3.toFixed(2)}%\n`;
    }

    // Uyarı satırları
    if (state.volData.weakBreakout) {
      t += `\n⚠ ZAYIF KIRILIM TESPİT EDİLDİ:\n`;
      t += `   Fiyat +%${state.volData.priceChange3.toFixed(1)} yükseldi ama hacim ortalamanın yalnızca ${(state.volData.volRatio * 100).toFixed(0)}%'i.\n`;
      t += `   Bu hareketi destekleyen güçlü alıcı yok.\n`;
      t += `   → Kırılım sahte veya kısa ömürlü olabilir. Long pozisyona dikkat.\n`;
    }

    if (state.volData.weakDrop) {
      t += `\n ℹ ZAYIF DÜŞÜŞ TESPİT EDİLDİ:\n`;
      t += `   Fiyat -%${Math.abs(state.volData.priceChange3).toFixed(1)} geriledi ama hacim ortalamanın yalnızca ${(state.volData.volRatio * 100).toFixed(0)}%'i.\n`;
      t += `   Satış baskısı zayıf — düşüş sürdürülemeyebilir.\n`;
      t += `   → Short pozisyona dikkat, dip olabilir.\n`;
    }

    if (state.volData.volumeSpike) {
      t += `\n🔥 HACİM PATLAMASI:\n`;
      t += `   Son mum hacmi ortalamanın ${state.volData.volRatio.toFixed(1)}x'i.\n`;
      t += `   Fiyat hareketi (${state.volData.priceChange3 >= 0 ? '+' : ''}%${state.volData.priceChange3.toFixed(1)}) güçlü hacimle destekleniyor.\n`;
    }

    if (state.volData.divergence !== 'none') {
      t += `\n⚠ OBV UYUŞMAZLIĞI TESPİT EDİLDİ:\n`;
      if (state.volData.divergence === 'bearish') {
        t += `   Fiyat +${state.volData.priceChange10.toFixed(1)}% yükselirken OBV düşüyor.\n`;
        t += `   → Kırılım sahte olabilir, long pozisyonlara dikkat.\n`;
      } else {
        t += `   Fiyat ${state.volData.priceChange10.toFixed(1)}% düşerken OBV yükseliyor.\n`;
        t += `   → Dip güçlenebilir, short pozisyonlara dikkat.\n`;
      }
    } else {
      t += `✓ Fiyat/OBV uyumu: Fiyat ${state.volData.priceChange10 >= 0 ? '+' : ''}${state.volData.priceChange10.toFixed(1)}% — hacimle destekleniyor.\n`;
    }
  }

  // ── BTC KORELASYON BÖLÜMÜ ──
  if (state.btcData.btcDir !== undefined && !state.btcData.isBTC) {
    t += '\n' + '─'.repeat(42) + '\n';
    t += `₿  BTC KORELASYON ANALİZİ\n`;
    t += '─'.repeat(42) + '\n\n';

    // Ham veriler
    if (state.btcData.btcPrice)        t += `BTC Fiyatı:    ${formatPrice(state.btcData.btcPrice)}\n`;
    if (state.btcData.btcChange !== null) t += `BTC 24s Değ.: ${state.btcData.btcChange >= 0 ? '+' : ''}${state.btcData.btcChange.toFixed(2)}%\n`;
    if (state.btcData.btcRSI)          t += `BTC RSI(14):   ${state.btcData.btcRSI.toFixed(2)}${state.btcData.btcRSI > 70 ? ' ⚠ AŞIRI ALIM' : state.btcData.btcRSI < 30 ? ' ⚠ AŞIRI SATIM' : ''}\n`;
    if (state.btcData.btcMACD)         t += `BTC MACD hist: ${state.btcData.btcMACD.histogram.toFixed(6)} → ${state.btcData.btcMACD.histogram > 0 ? 'Pozitif' : 'Negatif'}\n`;
    const btcDirTxt = state.btcData.btcDir === 'bull' ? '▲ YUKARI' : state.btcData.btcDir === 'bear' ? '▼ AŞAĞI' : '◆ NÖTR';
    t += `BTC Genel Yön: ${btcDirTxt}\n`;

    if (state.btcData.corrVal !== null) {
      const c = state.btcData.corrVal, ca = Math.abs(c);
      const corrLabel = ca > 0.7 ? 'Yüksek' : ca > 0.4 ? 'Orta' : 'Düşük';
      t += `Korelasyon (Pearson, 4H, 60 mum): ${c >= 0 ? '+' : ''}${c.toFixed(3)}  →  ${corrLabel}\n`;
    }

    // Senaryo yorumları
    const coinSig  = (state.taData.mtf && state.taData.mtf.tf4h) ? tfSignal(state.taData.mtf.tf4h) : null;
    const coinDir  = coinSig ? coinSig.dir : 'neut';
    const corrAbs  = state.btcData.corrVal !== null ? Math.abs(state.btcData.corrVal) : null;
    const coinName = state.currentSymbol.replace('USDT', '');

    t += '\n';

    if (corrAbs !== null && corrAbs > 0.7 && state.btcData.btcDir !== 'bull' && coinDir === 'bull') {
      t += `⚠ SENARYO A — YÜKSEK KORELASYON + AYRIŞMA:\n`;
      t += `   ${coinName} güçlü korelasyona (${state.btcData.corrVal.toFixed(2)}) rağmen BTC'den ayrışıyor.\n`;
      t += `   BTC durgun/düşerken bu yükseliş genellikle sürdürülemez.\n`;
      t += `   → BTC yön kırarsa ${coinName} sert etkilenebilir. Stop'a dikkat.\n`;
    } else if (corrAbs !== null && corrAbs < 0.4 && coinDir === 'bull') {
      t += `✓ SENARYO B — DÜŞÜK KORELASYON + BAĞIMSIZ YÜKSELİŞ:\n`;
      t += `   ${coinName} BTC'den bağımsız hareket ediyor (korelasyon: ${state.btcData.corrVal.toFixed(2)}).\n`;
      t += `   Bu yükseliş coin-spesifik bir katalizöre işaret eder.\n`;
      t += `   → Daha güvenilir hareket — ancak coin haberleri takip edilmeli.\n`;
    } else if (corrAbs !== null && corrAbs >= 0.4 && corrAbs <= 0.7 && state.btcData.btcDir === 'neut') {
      t += `◆ SENARYO C — ORTA KORELASYON + BTC NÖTR:\n`;
      t += `   BTC belirsiz, ${coinName} kendi dinamikleriyle hareket ediyor.\n`;
      t += `   Korelasyon: ${state.btcData.corrVal.toFixed(2)} — BTC yön kırarsa bu coin de etkilenebilir.\n`;
      t += `   → Piyasa geneli gelişmeleri yakından takip et.\n`;
    } else if (corrAbs !== null && corrAbs > 0.7 && state.btcData.btcDir === 'bull' && coinDir === 'bull') {
      t += `🔗 SENARYO D — YÜKSEK KORELASYON + BTC SÜRÜKLÜYOR:\n`;
      t += `   BTC yükselişi ${coinName}'i sürüklüyor (korelasyon: ${state.btcData.corrVal.toFixed(2)}).\n`;
      t += `   Coin-spesifik katalizör yoksa BTC durduğunda momentum kaybolabilir.\n`;
      t += `   → BTC hareketini birincil referans al.\n`;
    } else if (state.btcData.btcDir === 'bear' && coinDir === 'bull') {
      t += `⚠ ÇATIŞMA: BTC düşüş trendinde, ${coinName} yükseliş sinyali veriyor.\n`;
      t += `   BTC baskısı altında kırılım güçlü olmayabilir.\n`;
    } else if (state.btcData.btcDir === 'bull' && coinDir === 'bear') {
      t += `⚠ ÇATIŞMA: BTC yükseliş trendinde, ${coinName} düşüş sinyali veriyor.\n`;
      t += `   Coin'e özgü bir zayıflık olabilir.\n`;
    } else if (state.btcData.btcDir === coinDir && state.btcData.btcDir !== 'neut') {
      t += `✓ UYUM: BTC ve ${coinName} aynı yönde (${state.btcData.btcDir === 'bull' ? 'yükseliş' : 'düşüş'}). Sinyal daha güvenilir.\n`;
    } else {
      t += `◆ Yön belirsiz. BTC ve ${coinName} için net sinyal yok.\n`;
    }

    // BTC RSI ek uyarı
    if (state.btcData.btcRSI && state.btcData.btcRSI > 70) {
      t += `\n⚠ BTC RSI ${state.btcData.btcRSI.toFixed(1)} — Aşırı alım bölgesi. Piyasa geneli düzeltme riski.\n`;
    } else if (state.btcData.btcRSI && state.btcData.btcRSI < 30) {
      t += `\n✓ BTC RSI ${state.btcData.btcRSI.toFixed(1)} — Aşırı satım bölgesi. Piyasa geneli toparlanma olabilir.\n`;
    }

    // BTC MACD ek yorum
    if (state.btcData.btcMACD && coinDir !== 'neut') {
      const btcMACDDir = state.btcData.btcMACD.histogram > 0 ? 'bull' : 'bear';
      if (btcMACDDir === 'bear' && coinDir === 'bull') {
        t += `\n📉 BTC MACD negatif iken ${coinName} yükseliş sinyali veriyor. Piyasa momentumu zayıf.\n`;
      } else if (btcMACDDir === 'bull' && coinDir === 'bull') {
        t += `\n📈 BTC MACD pozitif ve ${coinName} de yükseliş — momentum uyumlu.\n`;
      }
    }
  }

  t += '\n' + '─'.repeat(42);

  document.getElementById('outputPreview').textContent = t;
  state.detailData._text = t;
}

export async function copyData() {
  const btn = document.getElementById('copyBtn');
  const text = state.detailData._text || document.getElementById('outputPreview').textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch(e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  btn.textContent = '✅ KOPYALANDI — CLAUDE\'A YAPIŞTIR!';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = '📋 KOPYALA → CLAUDE\'A YAPIŞTIR';
    btn.classList.remove('copied');
  }, 2500);
}

