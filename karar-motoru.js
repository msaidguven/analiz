// ============================================================
// KARAR MOTORU v5 — Sinyal Uyum Motoru
// Puanları toplamak yerine sinyallerin birbirine ne kadar
// uyduğunu değerlendirir. Çatışan sinyaller kararı bloke eder.
// Değişkenler v4 ile aynıdır.
// ============================================================

function kararMotoru(d) {

    // ─── Yardımcılar ────────────────────────────────────────
    function safeNum(v, fallback = 0) {
        const n = parseFloat(v);
        return isNaN(n) ? fallback : n;
    }
    function fp(v) { return v.toFixed(4); }
    function pctDist(a, b) { return Math.abs(((a - b) / b) * 100); }
    function calcRR(entry, sl, tp) {
        const r = Math.abs(entry - sl) / Math.abs(tp - entry);
        return { ratio: r, valid: r >= 1.5 };
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    const {
        price, chg24, volatility,
        rsi: rsiGlobal, macd: macdGlobal, boll,
        supports, resistances,
        fundingAvg,
        oiChange, longPct, shortPct,
        volumeSpike, spikeRatio,
        lhResult, msResult,
        analysisTime, multiTF, symbol: coinSymbol,
    } = d;

    // ─── Yeni coin tespiti ───────────────────────────────────
    let yeniCoin = false;
    if (!multiTF || !multiTF['1w']) yeniCoin = true;
    if (multiTF && multiTF['1w']) {
        if ((multiTF['1w'].count !== undefined && multiTF['1w'].count < 10) ||
            (multiTF['1w'].closes && multiTF['1w'].closes.length < 10)) {
            yeniCoin = true;
        }
    }

    // ─── BÖLÜM 1: Her TF için sinyal objesi üret ────────────
    // Her TF bir "oy" değil, bir "kanıt" döndürür.
    // Kanıt: { yön: 'bull'|'bear'|'notr', güç: 0-3, güvenilirlik: 0-1, notlar: [] }
    // güç: 1=zayıf, 2=orta, 3=güçlü
    // güvenilirlik: bu TF'deki verinin ne kadar güvenilir olduğu

    const TF_AGIRLIK = { '1w': 0.30, '1d': 0.25, '4h': 0.22, '1h': 0.14, '15m': 0.09 };
    const tfListesi = ['15m', '1h', '4h', '1d', '1w'];
    const tfSonuclar = {};

    tfListesi.forEach(tf => {
        const tfData = multiTF ? multiTF[tf] : null;

        if (!tfData) {
            tfSonuclar[tf] = { yön: 'notr', güç: 0, güvenilirlik: 0, notlar: [], uzlaşım: 0 };
            return;
        }

        const rsi = safeNum(tfData.rsi);
        const macd = tfData.macd;
        const smc = tfData.smc;
        const cvd = tfData.cvd !== undefined ? tfData.cvd : tfData.delta;
        const vol = safeNum(tfData.volume);
        const volAvg = safeNum(tfData.volumeAvg);
        const volOran = volAvg > 0 ? vol / volAvg : 1;

        // Her indikatör kendi yönünü ve gücünü belirtiyor
        const sinyaller = [];

        // RSI — Aşırı bölgeler güçlü, orta bölge bağlam gerektirir
        if (rsi > 0) {
            if (rsi > 90) sinyaller.push({ yön: 'bear', güç: 3, not: `RSI ${rsi.toFixed(0)} tarihsel aşırı alım` });
            else if (rsi > 80) sinyaller.push({ yön: 'bear', güç: 2, not: `RSI ${rsi.toFixed(0)} aşırı alım` });
            else if (rsi > 70) sinyaller.push({ yön: 'bear', güç: 1, not: `RSI ${rsi.toFixed(0)} yüksek` });
            else if (rsi < 10) sinyaller.push({ yön: 'bull', güç: 3, not: `RSI ${rsi.toFixed(0)} tarihsel aşırı satım` });
            else if (rsi < 20) sinyaller.push({ yön: 'bull', güç: 2, not: `RSI ${rsi.toFixed(0)} aşırı satım` });
            else if (rsi < 30) sinyaller.push({ yön: 'bull', güç: 1, not: `RSI ${rsi.toFixed(0)} düşük` });
            else sinyaller.push({ yön: 'notr', güç: 0, not: `RSI ${rsi.toFixed(0)} nötr bölge` });
        }

        // MACD — histogram yönü momentum, MACD değeri trend onayı
        if (macd && macd.histogram !== undefined) {
            const histPos = safeNum(macd.histogram) > 0;
            const macdPos = safeNum(macd.macd) > 0;
            if (histPos && macdPos) sinyaller.push({ yön: 'bull', güç: 2, not: 'MACD güçlü yükseliş' });
            else if (histPos && !macdPos) sinyaller.push({ yön: 'bull', güç: 1, not: 'MACD toparlanıyor' });
            else if (!histPos && !macdPos) sinyaller.push({ yön: 'bear', güç: 2, not: 'MACD güçlü düşüş' });
            else sinyaller.push({ yön: 'bear', güç: 1, not: 'MACD zayıflıyor' });
        }

        // SMC — bağlam önemli: zayıf SMC sinyali hacim onayı olmadan sayılmaz
        if (smc && smc.trend) {
            // SMC sinyali tek başına zayıf kabul edilir; hacim onayı ekliyorsa güçlenir
            const smcHacimOnay = volOran > 1.2;
            const smcGüç = smcHacimOnay ? 2 : 1;

            if (smc.trend === 'BULLISH') sinyaller.push({ yön: 'bull', güç: smcGüç, not: `SMC yükseliş yapısı${smcHacimOnay ? ' (hacim onaylı)' : ''}` });
            else if (smc.trend === 'BEARISH') sinyaller.push({ yön: 'bear', güç: smcGüç, not: `SMC düşüş yapısı${smcHacimOnay ? ' (hacim onaylı)' : ''}` });
            else sinyaller.push({ yön: 'notr', güç: 0, not: 'SMC yatay sıkışma' });
        }

        // CVD — fiyatla uyum/ayrışma analizi
        if (cvd !== null && cvd !== undefined && chg24 !== undefined) {
            if (cvd > 0 && chg24 > 0) sinyaller.push({ yön: 'bull', güç: 1, not: 'CVD alış uyumlu' });
            else if (cvd < 0 && chg24 < 0) sinyaller.push({ yön: 'bear', güç: 1, not: 'CVD satış uyumlu' });
            // Diverjanslar daha güçlü sinyal: fiyat bir yöne giderken CVD karşı yönde
            else if (cvd > 0 && chg24 < 0) sinyaller.push({ yön: 'bull', güç: 2, not: 'CVD pozitif diverjans (güçlü)' });
            else if (cvd < 0 && chg24 > 0) sinyaller.push({ yön: 'bear', güç: 2, not: 'CVD negatif diverjans (güçlü)' });
        }

        // Hacim — bağlamsal: hacim tek başına yön vermez, mevcut yönü güçlendirir
        if (vol > 0 && volAvg > 0) {
            if (volOran < 0.35) sinyaller.push({ yön: 'notr', güç: 1, not: `Çok düşük hacim (%${(volOran * 100).toFixed(0)}) — sinyaller güvenilmez` });
            else if (volOran > 2.0 && chg24 > 0) sinyaller.push({ yön: 'bull', güç: 1, not: `Hacim patlaması (${volOran.toFixed(1)}x) yükselişte` });
            else if (volOran > 2.0 && chg24 < 0) sinyaller.push({ yön: 'bear', güç: 1, not: `Hacim patlaması (${volOran.toFixed(1)}x) düşüşte` });
        }

        // ── Sinyal uzlaşımını hesapla ──────────────────────
        // Sinyaller aynı yönde mi, yoksa çatışıyor mu?
        const bullGüç = sinyaller.filter(s => s.yön === 'bull').reduce((t, s) => t + s.güç, 0);
        const bearGüç = sinyaller.filter(s => s.yön === 'bear').reduce((t, s) => t + s.güç, 0);
        const toplamGüç = bullGüç + bearGüç;

        // Uzlaşım: 1.0 = tam uyum, 0.0 = tam çatışma
        // Formül: dominant tarafın oranı, ama çatışma varsa ceza
        let uzlaşım = 0.5;
        let tfYön = 'notr';
        if (toplamGüç > 0) {
            const baskınOran = Math.max(bullGüç, bearGüç) / toplamGüç;
            // Çatışma cezası: azınlık taraf güçlüyse uzlaşım düşer
            const çatışmaCezası = Math.min(bullGüç, bearGüç) / toplamGüç;
            uzlaşım = baskınOran * (1 - çatışmaCezası * 0.8);
            tfYön = bullGüç > bearGüç ? 'bull' : (bearGüç > bullGüç ? 'bear' : 'notr');
        }

        // Güvenilirlik: düşük hacimde ve yeni coinde düşer
        let güvenilirlik = 1.0;
        if (volOran < 0.35) güvenilirlik *= 0.5;
        if (yeniCoin && (tf === '1w' || tf === '1d')) güvenilirlik *= 0.7;

        const notlar = sinyaller.filter(s => s.not).map(s => s.not);

        tfSonuclar[tf] = {
            yön: tfYön,
            bullGüç, bearGüç, toplamGüç,
            uzlaşım,
            güvenilirlik,
            rsi,
            notlar,
            tfAdi: tf,
            // v4 uyumluluğu için
            longOran: toplamGüç > 0 ? (bullGüç / toplamGüç * 100) : 50,
            trend: tfYön === 'bull' ? 'BULL' : (tfYön === 'bear' ? 'BEAR' : 'NOTR'),
        };
    });

    // ─── BÖLÜM 2: Timeframe hizalaması ──────────────────────
    // Yüksek TF ile düşük TF çatışması → karar bloke sinyali üretir

    const yüksekTF = ['1w', '1d', '4h'];
    const düşükTF = ['1h', '15m'];

    const yüksekBull = yüksekTF.filter(tf => tfSonuclar[tf]?.yön === 'bull').length;
    const yüksekBear = yüksekTF.filter(tf => tfSonuclar[tf]?.yön === 'bear').length;
    const düşükBull = düşükTF.filter(tf => tfSonuclar[tf]?.yön === 'bull').length;
    const düşükBear = düşükTF.filter(tf => tfSonuclar[tf]?.yön === 'bear').length;

    // Çatışma tipleri
    const tfÇatışmaVar = (yüksekBear >= 2 && düşükBull >= 2) ||
        (yüksekBull >= 2 && düşükBear >= 2);

    // Zayıf uyum: yüksek TF'lerin kendi aralarında bile uzlaşım yok
    const yüksekTFUzlaşım = yüksekTF.reduce((t, tf) => {
        const s = tfSonuclar[tf];
        return s ? t + s.uzlaşım * TF_AGIRLIK[tf] : t;
    }, 0) / yüksekTF.reduce((t, tf) => t + TF_AGIRLIK[tf], 0);

    // ─── BÖLÜM 3: Ağırlıklı yön skoru ──────────────────────
    // Her TF'nin katkısı: güç × ağırlık × güvenilirlik × uzlaşım

    let efektifAgirlik = { ...TF_AGIRLIK };
    if (yeniCoin) {
        efektifAgirlik['1d'] += efektifAgirlik['1w'];
        efektifAgirlik['1w'] = 0;
    }

    let ağırlıklıBull = 0;
    let ağırlıklıBear = 0;
    let toplamEfektifAğırlık = 0;

    tfListesi.forEach(tf => {
        const s = tfSonuclar[tf];
        const a = efektifAgirlik[tf];
        if (!s || a === 0 || s.toplamGüç === 0) return;

        const katkı = a * s.güvenilirlik * s.uzlaşım;
        ağırlıklıBull += (s.bullGüç / s.toplamGüç) * katkı;
        ağırlıklıBear += (s.bearGüç / s.toplamGüç) * katkı;
        toplamEfektifAğırlık += katkı;
    });

    const tfLongOran = toplamEfektifAğırlık > 0
        ? (ağırlıklıBull / (ağırlıklıBull + ağırlıklıBear)) * 100
        : 50;

    // ─── BÖLÜM 4: Türev/yapısal bağlam ─────────────────────
    // Türev verileri artık %25 ağırlık taşıyor ve bağlamsal kullanılıyor.
    // Kural: Türev verileri kararı TEK BAŞINA veremez; sadece mevcut yönü
    // destekleyebilir ya da zayıflatabilir.

    let türevBull = 0;
    let türevBear = 0;
    const türevNotlar = [];
    const uyarılar = [];

    const fPct = (fundingAvg || 0) * 100;

    // Funding — aşırı değerler kontrarian sinyal
    if (fPct < -0.30) { türevBull += 3; türevNotlar.push('Funding ciddi negatif — short squeeze riski'); }
    else if (fPct < -0.10) { türevBull += 2; türevNotlar.push('Funding negatif — kısa pozisyon kalabalığı'); }
    else if (fPct < -0.03) { türevBull += 1; türevNotlar.push('Funding hafif negatif'); }
    else if (fPct > 0.30) { türevBear += 3; türevNotlar.push('Funding ciddi pozitif — long tasfiyesi riski'); uyarılar.push(`Funding %${fPct.toFixed(2)} — kalabalık long pozisyon`); }
    else if (fPct > 0.10) { türevBear += 2; türevNotlar.push('Funding pozitif — long ağırlıklı'); }
    else if (fPct > 0.05) { türevBear += 1; türevNotlar.push('Funding hafif pozitif'); }

    // Long/Short oranı — kalabalık pozisyon tehlikesi
    if (shortPct > 75) {
        türevBull += 2;
        türevNotlar.push(`%${shortPct.toFixed(0)} short — sıkışma olası`);
    } else if (shortPct > 60) {
        türevBull += 1;
    } else if (longPct > 75) {
        türevBear += 2;
        uyarılar.push(`%${longPct.toFixed(0)} long kalabalığı — tasfiye riski`);
        türevNotlar.push('Kalabalık long pozisyon');
    } else if (longPct > 65) {
        türevBear += 1;
    }

    // OI değişimi — fiyat + OI birlikte değerlendirilir
    if (oiChange !== null && oiChange !== undefined) {
        if (chg24 > 2 && oiChange > 0.5) { türevBull += 2; türevNotlar.push('OI + fiyat birlikte artıyor (güçlü trend)'); }
        else if (chg24 > 2 && oiChange < -0.5) { türevBear += 1; uyarılar.push('Fiyat yükseliyor ama OI azalıyor — kırılgan ralli'); }
        else if (chg24 < -2 && oiChange > 0.5) { türevBear += 2; türevNotlar.push('OI artarken fiyat düşüyor (kısa yükleniyor)'); }
        else if (chg24 < -2 && oiChange < -0.5) { türevBull += 1; türevNotlar.push('OI + fiyat birlikte düşüyor (short kapanıyor)'); }
    }

    // Bollinger — fiyatın band dışına çıkması aşırılık göstergesi
    if (boll && price) {
        const lo = safeNum(boll.lower);
        const up = safeNum(boll.upper);
        const range = up - lo;
        if (range > 0) {
            const bp = (safeNum(price) - lo) / range;
            if (bp > 1.30) { türevBear += 3; uyarılar.push('Fiyat üst Bollinger bandının çok üstünde'); }
            else if (bp > 1.00) { türevBear += 2; }
            else if (bp > 0.90) { türevBear += 1; }
            else if (bp < -0.30) { türevBull += 3; türevNotlar.push('Fiyat alt Bollinger bandının altında'); }
            else if (bp < 0.00) { türevBull += 2; }
            else if (bp < 0.10) { türevBull += 1; }
        }
    }

    // Türev skoru normalize (0–100 arası long oranı)
    const türevToplam = türevBull + türevBear;
    const türevLongOran = türevToplam > 0 ? (türevBull / türevToplam * 100) : 50;

    // ─── BÖLÜM 5: Nihai birleştirme ─────────────────────────
    // TF analizi %75, türev bağlam %25
    const finalLongOran = (tfLongOran * 0.75) + (türevLongOran * 0.25);
    const finalShortOran = 100 - finalLongOran;
    const fark = finalLongOran - finalShortOran; // pozitif = bull, negatif = bear

    // ─── BÖLÜM 6: Karar ─────────────────────────────────────
    // Eşik değerleri v4'ten daha geniş BEKLE bölgesi için artırıldı
    // Ek kural: TF çatışması varsa her zaman BEKLE

    const kararEşiği = 25; // v4'te 20'ydi

    let karar, kararSinif;

    if (tfÇatışmaVar) {
        // Ana TF'ler çatışıyor — ne kadar güçlü görünürse görünsün, bekle
        karar = 'BEKLE';
        kararSinif = 'bekle';
        uyarılar.push('Yüksek ve düşük TF trend çatışması — işlem açmak için erken');
    } else if (fark >= kararEşiği) {
        karar = 'LONG';
        kararSinif = 'long';
    } else if (fark <= -kararEşiği) {
        karar = 'SHORT';
        kararSinif = 'short';
    } else {
        karar = 'BEKLE';
        kararSinif = 'bekle';
    }

    // ─── BÖLÜM 7: Güven skoru ───────────────────────────────
    // Güven = sinyallerin birbirleriyle ne kadar uyumlu olduğunu ölçer.
    // "Fark büyük ama sinyaller dağınık" → güven düşük
    // "Fark orta ama sinyaller çok uyumlu" → güven makul

    // Temel: TF uzlaşım ortalaması (ağırlıklı)
    let uzlaşımOrtalaması = 0;
    let uzlaşımToplamAğırlık = 0;
    tfListesi.forEach(tf => {
        const s = tfSonuclar[tf];
        const a = efektifAgirlik[tf];
        if (!s || a === 0 || s.toplamGüç === 0) return;
        uzlaşımOrtalaması += s.uzlaşım * s.güvenilirlik * a;
        uzlaşımToplamAğırlık += a;
    });
    const tfUzlaşım = uzlaşımToplamAğırlık > 0
        ? uzlaşımOrtalaması / uzlaşımToplamAğırlık
        : 0.5;

    // Güven: uzlaşım × fark büyüklüğü birleşimi
    const farkNorm = Math.min(Math.abs(fark) / 50, 1.0); // 50'de maksimum
    let güven = Math.round((tfUzlaşım * 0.65 + farkNorm * 0.35) * 100);
    güven = clamp(güven, 20, 85); // hiçbir zaman %85 üstü veremeyiz

    // Güven cezaları
    if (yeniCoin) güven = Math.min(güven, 52);
    if (tfÇatışmaVar) güven = Math.min(güven, 45);
    if (uyarılar.length >= 2) güven = Math.min(güven, 55);
    if (yüksekTFUzlaşım < 0.5) güven = Math.min(güven, 50); // yüksek TF'ler bile uzlaşmıyor
    const rsiG = safeNum(rsiGlobal);
    if (yeniCoin && rsiG > 85) güven = Math.min(güven, 32);

    güven = Math.round(güven);

    // ─── BÖLÜM 8: Risk skoru ────────────────────────────────
    let riskSkor = 3; // başlangıç tabanı (v4: 4)

    if (rsiG > 90 || rsiG < 10) riskSkor += 3;
    else if (rsiG > 80 || rsiG < 20) riskSkor += 2;
    else if (rsiG > 70 || rsiG < 30) riskSkor += 1;

    if (Math.abs(fPct) > 0.30) riskSkor += 2;
    else if (Math.abs(fPct) > 0.10) riskSkor += 1;

    const vol_ = safeNum(volatility);
    if (vol_ > 10) riskSkor += 2;
    else if (vol_ > 5) riskSkor += 1;

    if (tfÇatışmaVar) riskSkor += 2;
    if (uyarılar.length >= 2) riskSkor += 1;
    if (yeniCoin) riskSkor += 2;

    if (boll && price) {
        const lo = safeNum(boll.lower);
        const up = safeNum(boll.upper);
        const rng = up - lo;
        if (rng > 0) {
            const bp = (safeNum(price) - lo) / rng;
            if (bp > 1.2 || bp < -0.2) riskSkor += 2;
        }
    }

    riskSkor = clamp(riskSkor, 1, 10);

    // ─── Sonuç ──────────────────────────────────────────────
    return {
        // Karar
        karar,
        kararSinif,
        guven: güven,
        riskSkor,

        // Yön oranları
        finalLongOran,
        finalShortOran,
        fark,

        // Detay
        tfSonuclar,
        tfÇatışmaVar,
        uyarılar,
        türevNotlar,

        // Meta
        symbol: coinSymbol,
        analysisTime,

        // v4 uyumluluğu (tüketen arayüzler bozulmasın diye)
        longOran: finalLongOran,
        shortOran: finalShortOran,
    };
}

// Export
if (typeof window !== 'undefined') {
    window.kararMotoru = kararMotoru;
}