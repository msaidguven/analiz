/**
 * AI Prompt Oluşturucu Motoru
 * analiz_v3.html için harici dosya
 */

window.generateAIPrompt = function (d, currentSymbol, currentTF, calcEMA, fp) {
    if (!d.price) return 'Lütfen önce bir analiz yapın.';

    const na = (v, fmt) => (v !== null && v !== undefined && !isNaN(v)) ? fmt(v) : 'N/A';
    const formatPrice = (p) => na(p, fp);
    const formatPct = (p) => na(p, v => (v * 100).toFixed(4) + '%');

    // ── EMA Hesapla (20 / 50 / 200) ─────────────────────
    const closes = d.closesTF || [];
    const closes1d = d.closes1d || [];
    const longCloses = closes1d.length >= 200 ? closes1d : closes;

    const ema20arr = closes.length >= 20 ? calcEMA(closes, 20) : [];
    const ema50arr = longCloses.length >= 50 ? calcEMA(longCloses, 50) : [];
    const ema200arr = longCloses.length >= 200 ? calcEMA(longCloses, 200) : [];

    const ema20 = ema20arr.filter(v => v !== null).slice(-1)[0] || null;
    const ema50 = ema50arr.filter(v => v !== null).slice(-1)[0] || null;
    const ema200 = ema200arr.filter(v => v !== null).slice(-1)[0] || null;

    const trendDesc = ema20
        ? (d.price > ema20
            ? (ema50 && d.price > ema50 ? 'Güçlü Yükseliş (EMA20 & EMA50 üstünde)' : 'Kısa vadeli Yükseliş (EMA20 üstünde)')
            : (ema50 && d.price < ema50 ? 'Güçlü Düşüş (EMA20 & EMA50 altında)' : 'Kısa vadeli Düşüş (EMA20 altında)'))
        : 'N/A';

    // ── Bollinger Bantları Analizi ───────────────────────
    let bollDesc = 'N/A';
    if (d.boll) {
        const pos = (d.price - d.boll.lower) / (d.boll.upper - d.boll.lower);
        const bw = ((d.boll.upper - d.boll.lower) / d.boll.mid * 100).toFixed(2);
        bollDesc = `%${(pos * 100).toFixed(1)} seviyesinde (Genişlik: %${bw})`;
        if (pos > 1) bollDesc += ' [!] ÜST BANDIN DIŞINDA';
        else if (pos < 0) bollDesc += ' [!] ALT BANDIN DIŞINDA';
    }

    // ── Market Structure ─────────────────────────────────
    let structure = 'N/A';
    if (d.supports && d.resistances && d.supports.length && d.resistances.length) {
        const nearestR = d.resistances[0];
        const nearestS = d.supports[0];
        if (d.price > nearestR) structure = 'Breakout Yukarı (Boğa)';
        else if (d.price < nearestS) structure = 'Breakout Aşağı (Ayı)';
        else if (ema20 && ema50 && ema20 > ema50) structure = 'Higher High / Higher Low (Yükseliş Yapısı)';
        else if (ema20 && ema50 && ema20 < ema50) structure = 'Lower High / Lower Low (Düşüş Yapısı)';
        else structure = 'Konsolidasyon / Yatay';
    }
    // ── MACD Detayı ──────────────────────────────────────
    let macdDesc = 'N/A';
    if (d.macd) {
        const m = d.macd;
        const dir = m.histogram > 0 ? 'Yükseliş' : 'Düşüş';
        const mom = Math.abs(m.histogram) > Math.abs(m.signal * 0.1) ? 'Güçlü' : 'Zayıf';
        macdDesc = `${dir} momentumu (${mom}) | MACD: ${m.macd.toFixed(5)} | Sinyal: ${m.signal.toFixed(5)} | Histogram: ${m.histogram.toFixed(5)}`;
    }

    // ── Volatilite ───────────────────────────────────────
    const volatility = d.volatility ? d.volatility.toFixed(2) + '%' : 'N/A';

    // ── Funding + OI Diverjansı ──────────────────────────
    let fOIDiv = 'Nötr — Uyumlu hareket';
    const fa = d.fundingAvg || 0;
    const oi = d.oiChange || 0;
    if (oi > 0 && fa > 0.0003) fOIDiv = 'OI ↑ + Funding Pozitif → Long birikimi, dikkat';
    else if (oi > 0 && fa < -0.0003) fOIDiv = 'OI ↑ + Funding Negatif → Short birikimi, squeeze riski';
    else if (oi < 0 && fa > 0.0003) fOIDiv = 'OI ↓ + Funding Pozitif → Longlar kaçıyor, düşüş yavaşlayabilir';
    else if (oi < 0 && fa < -0.0003) fOIDiv = 'OI ↓ + Funding Negatif → Shortlar kapanıyor, dip olabilir';

    // ── Hacim & Breakout ─────────────────────────────────
    let volumeTrend = 'Hacim ortalamaya yakın, belirgin sinyal yok.';
    if (d.volumeSpike) {
        volumeTrend = d.chg24 > 0
            ? `Hacim sıçraması (${d.spikeRatio.toFixed(1)}x) + Fiyat yukarı → Güçlü alım baskısı`
            : `Hacim sıçraması (${d.spikeRatio.toFixed(1)}x) + Fiyat aşağı → Güçlü satış baskısı`;
    }

    let breakout = 'Günlük aralık içinde (belirsiz).';
    const hRange = d.highDay - d.lowDay;
    const pricePos = hRange > 0 ? ((d.price - d.lowDay) / hRange) * 100 : 50;
    if (pricePos >= 95) breakout = `Günlük zirveye yakın (%${pricePos.toFixed(0)} aralıkta) — Direnç bölgesi.`;
    else if (pricePos <= 5) breakout = `Günlük dibe yakın (%${pricePos.toFixed(0)} aralıkta) — Destek bölgesi.`;
    else breakout = `Günlük aralığın %${pricePos.toFixed(0)}'inde. `;

    let impulse = 'Yok — Normal mum aktivitesi.';
    if (d.volumeSpike && d.chg24 > 1) impulse = `Büyük alım mumu + hacim sıçraması (${d.spikeRatio.toFixed(1)}x).`;
    else if (d.volumeSpike && d.chg24 < -1) impulse = `Büyük satış mumu + hacim sıçraması (${d.spikeRatio.toFixed(1)}x).`;
    else if (d.volumeSpike) impulse = `Hacim sıçraması tespit edildi (${d.spikeRatio.toFixed(1)}x), yön belirsiz.`;

    // ── RSI Değerlendirmesi ──────────────────────────────
    const rsiVal = d.rsi ? d.rsi.toFixed(1) : 'N/A';
    const rsiDesc = d.rsi
        ? (d.rsi > 85 ? '⚠ Aşırı alım (kritik)' : d.rsi > 70 ? 'Aşırı alım bölgesi' : d.rsi < 20 ? '⚠ Aşırı satım (kritik)' : d.rsi < 30 ? 'Aşırı satım bölgesi' : 'Normal bölge')
        : 'N/A';

    // ── Long/Short Bias ───────────────────────────────────
    let lsDesc = 'N/A';
    if (d.longPct && d.shortPct) {
        const bias = d.longPct > d.shortPct ? 'Long ağırlıklı' : 'Short ağırlıklı';
        lsDesc = `Long %${d.longPct.toFixed(1)} / Short %${d.shortPct.toFixed(1)} → ${bias}`;
        if (d.shortPct > 75) lsDesc += ' ⚠ Short squeeze riski yüksek!';
    }

    // ── OI Detayı ─────────────────────────────────────────
    const oiDesc = na(d.oiChange, v => {
        const dir = v > 0 ? '↑ Artıyor' : '↓ Azalıyor';
        const conf = (d.chg24 > 0 && v > 0) ? 'Trendle uyumlu (güçlü)' : (d.chg24 < 0 && v < 0) ? 'Trendle uyumlu (zayıflama)' : 'Trendle uyumsuz (dikkat)';
        return `${v > 0 ? '+' : ''}${v.toFixed(2)}% ${dir} — ${conf}`;
    });

    // ── Algoritmik Faktörler ──────────────────────────────
    const factors = d.csResult ? d.csResult.factors.map(f => `- ${f.k}: ${f.v}`).join('\n') : 'N/A';

    // ── Derivative Ekstralar & Multi-TF RSI ────────────────
    const vol24hStr = d.vol24h ? (d.vol24h >= 1e9 ? (d.vol24h / 1e9).toFixed(2) + 'B' : (d.vol24h / 1e6).toFixed(2) + 'M') + ' USDT' : 'N/A';
    const oiAbsStr = d.oiAbsolute ? (d.oiAbsolute / 1e6).toFixed(2) + 'M USDT' : 'N/A';
    const longPosStr = d.longPos ? (d.longPos / 1e6).toFixed(2) + 'M USDT' : 'N/A';
    const shortPosStr = d.shortPos ? (d.shortPos / 1e6).toFixed(2) + 'M USDT' : 'N/A';
    const vOiRatioVal = (d.vol24h && d.oiAbsolute) ? (d.vol24h / d.oiAbsolute) : 0;
    const vOiRatioStr = `~${vOiRatioVal.toFixed(1)}x${vOiRatioVal > 25 ? ' (anormal yüksek)' : ''}`;

    let rsiMultiStr = `Current=${rsiVal}`;
    if (d.multiTF && d.multiTF['4h']) {
        const rsi4h = d.multiTF['4h'].rsi;
        rsiMultiStr += ` | 4H=${rsi4h}`;
        if (d.rsi && rsi4h && Math.abs(d.rsi - rsi4h) > 20) rsiMultiStr += ' (zaman dilimi uyumsuzluğu)';
    }

    const oiNote = (d.oiChange < 0 && d.chg24 > 0) ? ' (Fiyat yükselirken OI düşüyor → zayıf yükseliş sinyali)' :
        (d.oiChange > 0 && d.chg24 < 0) ? ' (Fiyat düşerken OI yükseliyor → güçlü düşüş baskısı)' : '';

    // ── Multi-TF Detailed Analysis ────────────────────────
    let multiTFData = "";
    let weeklyWarning = "";
    if (d.multiTF) {
        ['15m', '1h', '4h', '1d'].forEach(tf => {
            const data = d.multiTF[tf];
            if (!data) return;

            const macdStr = data.macd ? `${data.macd.histogram > 0 ? 'Bullish' : 'Bearish'} (Hist: ${data.macd.histogram.toFixed(6)})` : 'N/A';
            const chochStr = data.smc.choch ? data.smc.choch.type : 'None';
            const bosStr = data.smc.bos ? data.smc.bos.type : 'None';
            const srStr = data.sr.supports.length || data.sr.resistances.length
                ? `S: ${data.sr.supports.map(fp).join(', ')} | R: ${data.sr.resistances.map(fp).join(', ')}`
                : 'No clear pivots detected';

            const deltaStr = `${data.delta > 0 ? '+' : ''}${data.delta.toFixed(2)} (${data.delta > 0 ? 'BUY' : 'SELL'} Pressure)`;

            multiTFData += `
[${tf.toUpperCase()} ANALYSIS]
- EMA20: ${formatPrice(data.ema20)} | EMA50: ${formatPrice(data.ema50)}
- RSI: ${data.rsi}
- MACD: ${macdStr}
- Structure: ${data.smc.trend} | CHoCH: ${chochStr} | BOS: ${bosStr}
- S/R Levels: ${srStr}
- Volume: ${data.volAmount.toFixed(2)} (Avg: ${data.avgVol.toFixed(2)}) | Trend: ${data.volTrend}
- Delta (CVD Proxy): ${deltaStr}`;
        });

        const w = d.multiTF['1w'];
        if (w) {
            const isWeeklyInsufficient = w.count < 10;
            const weeklyEMA = isWeeklyInsufficient ? 'N/A' : formatPrice(w.ema20);

            if (isWeeklyInsufficient) {
                weeklyWarning = "- [CRITICAL RULE] Weekly candles < 10. DO NOT rely on weekly trend. Base your entire bias on 1D and lower timeframes. Set CONFIDENCE_LEVEL to 'Low'.";
            }

            multiTFData += `

[WEEKLY OVERVIEW]
- General Trend: ${w.trend}
            - Weekly EMA20: ${weeklyEMA}
- Weekly RSI: ${w.rsi}
- Weekly Closing Levels: ${w.closes.map(fp).join(' -> ')}
- Major S/R: S: ${w.sr.supports.map(fp).join(', ')} | R: ${w.sr.resistances.map(fp).join(', ')}`;
        } else {
            weeklyWarning = "- [CRITICAL RULE] Weekly data is missing. Base analysis ONLY on 1D and lower timeframes. Set CONFIDENCE_LEVEL to 'Low'.";
        }
    }

    // ── Final Prompt (Türkçe) ──────────────────────────────
    return `[TEKNİK ANALİZ RAPORU: ${currentSymbol} / ${currentTF}]

📊 FİYAT HAREKETİ VE VOLATİLİTE
Güncel Fiyat: ${formatPrice(d.price)}
24s Değişim: ${na(d.chg24, v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%')}
Volatilite (ATR Bazlı): ${volatility}
Bollinger Bandı Konumu: ${bollDesc}
Destek Seviyeleri: ${d.supports ? d.supports.map(fp).join(', ') : 'Yok'}
Direnç Seviyeleri: ${d.resistances ? d.resistances.map(fp).join(', ') : 'Yok'}

📈 MOMENTUM GÖSTERGELERİ
Trend Durumu: ${trendDesc}
RSI: ${rsiVal} — ${rsiDesc}
MACD: ${macdDesc}
Piyasa Yapısı: ${structure}
${multiTFData}

🧨 TÜREV VERİLER (DERIVATIVES)
24s Hacim: ${vol24hStr}
Açık Pozisyon (OI): ${oiAbsStr} | OI Değişimi: ${oiDesc}${oiNote}
Long Pozisyonlar: ${longPosStr} | Short Pozisyonlar: ${shortPosStr}
Hacim/OI Oranı: ${vOiRatioStr}
Çoklu-TF RSI: ${rsiMultiStr}
Funding Rate: ${formatPct(fa)}
Long/Short Dengesi: ${lsDesc}
Diverjans Durumu: ${fOIDiv}

---
💣 LİKİDİTE AVI (LIQUIDITY HUNT)
Algoritma Skoru: ${d.lhResult ? d.lhResult.score + '/100' : 'N/A'}
Durum: ${d.lhResult ? d.lhResult.status : 'N/A'}
Likidite Edilen Taraf: ${d.lhResult ? d.lhResult.liqSideDesc : 'N/A'}
Potansiyel Dönüş: ${d.lhResult ? d.lhResult.reversalDesc : 'N/A'}
Likidite Bölgeleri: ${d.lhResult && d.lhResult.huntLevels.length ? d.lhResult.huntLevels.map(fp).join(' | ') : 'Tespit Edilmedi'}

---
📐 SMC YAPISI (SMART MONEY CONCEPTS)
Trend: ${d.msResult ? d.msResult.trend : 'N/A'}
İçsel CHoCH: ${d.msResult && d.msResult.choch ? d.msResult.choch.type + ' (' + d.msResult.choch.detail + ')' : 'Yok'}
İçsel BOS: ${d.msResult && d.msResult.bos ? d.msResult.bos.type + ' (' + d.msResult.bos.detail + ')' : 'Yok'}

---
🏆 ALGORİTMİK KARAR MOTORU
Nihai Karar: ${d.csResult ? d.csResult.decision : 'N/A'}
Model Güveni: ${d.csResult ? d.csResult.confidence + '%' : 'N/A'}
Temel Faktörler:
${factors}

## 🎯 GÖREV & TALİMATLAR
Sen profesyonel bir Kuant Trader ve Teknik Analiz uzmanısın. Yukarıdaki verileri kullanarak piyasayı derinlemesine değerlendir.

**ÖNEMLİ KURALLAR:**
1. **DETAYLI AÇIKLAMA YAPMA**: Teknik analizini arka planda, sessizce gerçekleştir. Bana uzun paragraf ve açıklamalar yazma.
2. **NET OL**: Sadece kararı ve en temel nedenini belirt.
3. **FORMAT**: Sadece aşağıdaki şablona uygun yanıt ver:

---
🎯 **KARAR**: [LONG / SHORT / BEKLE]
💡 **ÖZET NEDEN**: [Kararın en temel teknik nedenini 1-2 kısa cümleyle açıkla]
📏 **STRATEJİ**:
- Giriş: [Fiyat Aralığı]
- Stop: [Fiyat seviyesi ve % mesafe]
- Hedefler: [TP1 -> TP2 -> Final]
📊 **GÜVEN SEVİYESİ**: [Düşük / Orta / Yüksek]
⚠️ **KRİTİK UYARI**: [İşlemi riskli kılan veya geçersiz kılacak en önemli faktör - Maks 1 cümle]
---

**NOT**: Analizini yaparken tüm zaman dilimlerini (15D, 1S, 4S, 1G) ve likidite verilerini dikkate aldığından emin ol.`;
}