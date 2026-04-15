// ============================================================
// KARAR MOTORU v6 — Sinyal Uyum Motoru (Düzeltilmiş)
//
// v5'ten yapılan değişiklikler (tüm gerekçeleriyle):
//
// [DÜZ-1] uzlaşım formülü düzeltildi
//   v5: baskınOran * (1 - çatışmaCezası * 0.8)  → 50/50'de 0.30 çıkıyordu
//   v6: baskınOran - çatışmaCezası               → 50/50'de 0.00, tam uyumda 1.00
//   Neden: Çatışmalı TF'lerde güven şişiyordu, gerçek sinyaller gürültüye gömülüyordu.
//
// [DÜZ-2] TF ağırlıkları kripto gerçekliğine göre yeniden ayarlandı
//   v5: 1w=0.30, 1d=0.25, 4h=0.22, 1h=0.14, 15m=0.09
//   v6: 1w=0.20, 1d=0.28, 4h=0.28, 1h=0.15, 15m=0.09
//   Neden: Kripto piyasasında 1w çok yavaş değişir ve yeni coinde zaten disable ediliyor.
//   4h kripto için "ana trend" timeframe'idir. 1d ile birlikte ağırlık merkezi
//   olması, hem swing hem scalp senaryolarında daha stabil karar üretir.
//
// [DÜZ-3] tfÇatışmaVar: veri eksikliğinde çatışma algılanamama hatası düzeltildi
//   v5: tüm TF'ler (notr dahil) sayılıyordu → eksik veri çatışmayı maskeliyordu
//   v6: sadece net yön alan TF'ler sayılır; aktif TF sayısı ≥ 2 ise kontrol yapılır
//
// [DÜZ-4] Bölüm 2 (yüksekTFUzlaşım) artık karar mekanizmasına bağlandı
//   v5: hesaplanıyor ama sadece güven cezasında kullanılıyordu
//   v6: yüksek TF'ler kendi aralarında uzlaşmıyorsa (< 0.45) karar BEKLE olur,
//   çünkü alt TF sinyalleri temelsiz kalır.
//
// [DÜZ-5] Normalize hatası: güvenilirlik düşükken finalLongOran hâlâ 50'ye gidiyordu
//   v5: toplamEfektifAğırlık sıfıra yaklaşınca oran anlamsız kalıyordu
//   v6: toplamEfektifAğırlık < 0.05 ise finalLongOran = 50 (belirsiz) döner
//
// [DÜZ-6] RSI sınır değerleri >= olarak düzeltildi
//   v5: rsi > 70 → rsi tam 70 iken hiçbir kola girmiyordu (notr döndü)
//   v6: rsi >= 70 (aşırı alım sınırı dahil)
//
// [DÜZ-7] longPct + shortPct validasyonu eklendi
//   Toplam 100'den çok sapıyorsa türev sinyalleri sıfırlanır, uyarı eklenir.
//
// [DÜZ-8] Türev ağırlığı %25 → %20'ye düşürüldü
//   Neden: Türev verileri (funding, OI) manipülasyona açık ve gecikmeli sinyal
//   üretir. Tek başına yön veremez — bağlamsal baskı olarak %20 daha doğru.
//   TF analizi %80 ağırlık taşır.
//
// [DÜZ-9] Güven skoru tavanı: manipülasyon koruması
//   Funding aşırı pozitif VE güven yüksekse → long sinyali pump tuzağı olabilir.
//   Bu durumda güven otomatik kırpılır.
//
// [DÜZ-10] Karar eşiği dinamik hale getirildi
//   v5: sabit 25
//   v6: düşük volatilitede 22 (hassas), yüksek volatilitede 28 (konservatif)
//   Neden: Volatil piyasada sinyal gürültüsü artar, eşik yükseltmek false positive azaltır.
//
// [DÜZ-11] CVD hesabı: chg24 yerine tfData.chg kullanıldı (varsa)
//   Her TF kendi fiyat değişimini görmeli; global chg24 ile karşılaştırmak
//   15m TF'de anlamsız diverjans üretiyordu.
//
// [DÜZ-12] Yüksek TF uzlaşımı karar katmanına bağlandı (Bölüm 6 güncellendi)
//   Artık tfÇatışmaVar olmasa bile yüksek TF kendi aralarında uzlaşmıyorsa BEKLE verilir.
// ============================================================

function kararMotoru(d) {

    // ─── Yardımcılar ────────────────────────────────────────
    function safeNum(v, fallback = 0) {
        const n = parseFloat(v);
        return isNaN(n) ? fallback : n;
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function pctDist(a, b) { return b !== 0 ? Math.abs(((a - b) / b) * 100) : 0; }

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
    // [DÜZ-2] Ağırlıklar: 4h ve 1d kripto için ana trend TF'leridir.
    // 1w yavaş değişir ve yeni coinde zaten devre dışı bırakılır.
    const TF_AGIRLIK = { '1w': 0.20, '1d': 0.28, '4h': 0.28, '1h': 0.15, '15m': 0.09 };
    const tfListesi = ['15m', '1h', '4h', '1d', '1w'];
    const tfSonuclar = {};

    tfListesi.forEach(tf => {
        const tfData = multiTF ? multiTF[tf] : null;

        if (!tfData) {
            tfSonuclar[tf] = { yön: 'notr', güç: 0, güvenilirlik: 0, notlar: [], uzlaşım: 0, bullGüç: 0, bearGüç: 0, toplamGüç: 0 };
            return;
        }

        const rsi = safeNum(tfData.rsi);
        const macd = tfData.macd;
        const smc = tfData.smc;
        const cvd = tfData.cvd !== undefined ? tfData.cvd : tfData.delta;
        const vol = safeNum(tfData.volume);
        const volAvg = safeNum(tfData.volumeAvg);
        const volOran = volAvg > 0 ? vol / volAvg : 1;

        // [DÜZ-11] CVD karşılaştırması için bu TF'nin kendi değişimi öncelikli
        const tfChg = tfData.chg !== undefined ? safeNum(tfData.chg) : safeNum(chg24);

        const sinyaller = [];

        // RSI — [DÜZ-6] >= sınırları ile düzeltildi
        if (rsi > 0) {
            if (rsi > 90)      sinyaller.push({ yön: 'bear', güç: 3, not: `RSI ${rsi.toFixed(0)} tarihsel aşırı alım` });
            else if (rsi >= 80) sinyaller.push({ yön: 'bear', güç: 2, not: `RSI ${rsi.toFixed(0)} aşırı alım` });
            else if (rsi >= 70) sinyaller.push({ yön: 'bear', güç: 1, not: `RSI ${rsi.toFixed(0)} yüksek` });
            else if (rsi < 10)  sinyaller.push({ yön: 'bull', güç: 3, not: `RSI ${rsi.toFixed(0)} tarihsel aşırı satım` });
            else if (rsi < 20)  sinyaller.push({ yön: 'bull', güç: 2, not: `RSI ${rsi.toFixed(0)} aşırı satım` });
            else if (rsi < 30)  sinyaller.push({ yön: 'bull', güç: 1, not: `RSI ${rsi.toFixed(0)} düşük` });
            else sinyaller.push({ yön: 'notr', güç: 0, not: `RSI ${rsi.toFixed(0)} nötr bölge` });
        }

        // MACD
        if (macd && macd.histogram !== undefined) {
            const histPos = safeNum(macd.histogram) > 0;
            const macdPos = safeNum(macd.macd) > 0;
            if (histPos && macdPos)   sinyaller.push({ yön: 'bull', güç: 2, not: 'MACD güçlü yükseliş' });
            else if (histPos)         sinyaller.push({ yön: 'bull', güç: 1, not: 'MACD toparlanıyor' });
            else if (!histPos && !macdPos) sinyaller.push({ yön: 'bear', güç: 2, not: 'MACD güçlü düşüş' });
            else                      sinyaller.push({ yön: 'bear', güç: 1, not: 'MACD zayıflıyor' });
        }

        // SMC — hacim onayı olmadan zayıf
        if (smc && smc.trend) {
            const smcHacimOnay = volOran > 1.2;
            const smcGüç = smcHacimOnay ? 2 : 1;
            if (smc.trend === 'BULLISH')      sinyaller.push({ yön: 'bull', güç: smcGüç, not: `SMC yükseliş yapısı${smcHacimOnay ? ' (hacim onaylı)' : ''}` });
            else if (smc.trend === 'BEARISH') sinyaller.push({ yön: 'bear', güç: smcGüç, not: `SMC düşüş yapısı${smcHacimOnay ? ' (hacim onaylı)' : ''}` });
            else sinyaller.push({ yön: 'notr', güç: 0, not: 'SMC yatay sıkışma' });
        }

        // CVD — [DÜZ-11] tfChg kullanılıyor (bu TF'nin kendi değişimi)
        if (cvd !== null && cvd !== undefined) {
            if (cvd > 0 && tfChg > 0)       sinyaller.push({ yön: 'bull', güç: 1, not: 'CVD alış uyumlu' });
            else if (cvd < 0 && tfChg < 0)  sinyaller.push({ yön: 'bear', güç: 1, not: 'CVD satış uyumlu' });
            else if (cvd > 0 && tfChg < 0)  sinyaller.push({ yön: 'bull', güç: 2, not: 'CVD pozitif diverjans (güçlü)' });
            else if (cvd < 0 && tfChg > 0)  sinyaller.push({ yön: 'bear', güç: 2, not: 'CVD negatif diverjans (güçlü)' });
        }

        // Hacim — tek başına yön vermez, bağlam güçlendirir
        if (vol > 0 && volAvg > 0) {
            if (volOran < 0.35)              sinyaller.push({ yön: 'notr', güç: 1, not: `Çok düşük hacim (%${(volOran * 100).toFixed(0)}) — sinyaller güvenilmez` });
            else if (volOran > 2.0 && tfChg > 0) sinyaller.push({ yön: 'bull', güç: 1, not: `Hacim patlaması (${volOran.toFixed(1)}x) yükselişte` });
            else if (volOran > 2.0 && tfChg < 0) sinyaller.push({ yön: 'bear', güç: 1, not: `Hacim patlaması (${volOran.toFixed(1)}x) düşüşte` });
        }

        // ── Sinyal uzlaşımı — [DÜZ-1] Formül düzeltildi ──────
        const bullGüç = sinyaller.filter(s => s.yön === 'bull').reduce((t, s) => t + s.güç, 0);
        const bearGüç = sinyaller.filter(s => s.yön === 'bear').reduce((t, s) => t + s.güç, 0);
        const toplamGüç = bullGüç + bearGüç;

        let uzlaşım = 0;
        let tfYön = 'notr';
        if (toplamGüç > 0) {
            const baskınOran = Math.max(bullGüç, bearGüç) / toplamGüç;
            const çatışmaCezası = Math.min(bullGüç, bearGüç) / toplamGüç;
            // [DÜZ-1]: 50/50 → 0.0, tam uyum → 1.0 (doğrusal, simetrik)
            uzlaşım = baskınOran - çatışmaCezası;
            tfYön = bullGüç > bearGüç ? 'bull' : (bearGüç > bullGüç ? 'bear' : 'notr');
        }

        // Güvenilirlik
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
            longOran: toplamGüç > 0 ? (bullGüç / toplamGüç * 100) : 50,
            trend: tfYön === 'bull' ? 'BULL' : (tfYön === 'bear' ? 'BEAR' : 'NOTR'),
        };
    });

    // ─── BÖLÜM 2: Timeframe hizalaması ──────────────────────
    // [DÜZ-3] Sadece net yön alan (notr olmayan) TF'ler sayılır
    const yüksekTF = ['1w', '1d', '4h'];
    const düşükTF  = ['1h', '15m'];

    const yüksekAktif = yüksekTF.filter(tf => tfSonuclar[tf]?.yön !== 'notr');
    const düşükAktif  = düşükTF.filter(tf => tfSonuclar[tf]?.yön !== 'notr');

    const yüksekBull = yüksekTF.filter(tf => tfSonuclar[tf]?.yön === 'bull').length;
    const yüksekBear = yüksekTF.filter(tf => tfSonuclar[tf]?.yön === 'bear').length;
    const düşükBull  = düşükTF.filter(tf => tfSonuclar[tf]?.yön === 'bull').length;
    const düşükBear  = düşükTF.filter(tf => tfSonuclar[tf]?.yön === 'bear').length;

    // [DÜZ-3] Aktif TF sayısı ≥ 2 olduğunda çatışma kontrolü yapılır
    const tfÇatışmaVar = yüksekAktif.length >= 2 && (
        (yüksekBear >= 2 && düşükBull >= 2) ||
        (yüksekBull >= 2 && düşükBear >= 2)
    );

    // [DÜZ-4] Yüksek TF'lerin kendi aralarındaki uzlaşımı (karar mekanizmasına bağlandı)
    const yüksekTFUzlaşımToplam = yüksekTF.reduce((t, tf) => {
        const s = tfSonuclar[tf];
        return s ? t + s.uzlaşım * TF_AGIRLIK[tf] : t;
    }, 0);
    const yüksekTFAğırlıkToplam = yüksekTF.reduce((t, tf) => t + TF_AGIRLIK[tf], 0);
    const yüksekTFUzlaşım = yüksekTFAğırlıkToplam > 0
        ? yüksekTFUzlaşımToplam / yüksekTFAğırlıkToplam
        : 0;

    // ─── BÖLÜM 3: Ağırlıklı yön skoru ──────────────────────
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

    // [DÜZ-5] Güvenilir veri yoksa belirsiz oran döner
    const tfLongOran = toplamEfektifAğırlık > 0.05
        ? (ağırlıklıBull / (ağırlıklıBull + ağırlıklıBear)) * 100
        : 50;

    // ─── BÖLÜM 4: Türev/yapısal bağlam ─────────────────────
    // [DÜZ-7] long/short toplamı validasyonu
    const türevNotlar = [];
    const uyarılar = [];
    let türevGeçerli = true;

    if (longPct !== undefined && shortPct !== undefined) {
        const toplam = safeNum(longPct) + safeNum(shortPct);
        if (Math.abs(toplam - 100) > 5) {
            türevGeçerli = false;
            uyarılar.push(`Long/short toplamı ${toplam.toFixed(0)} — türev oran verileri geçersiz`);
        }
    }

    let türevBull = 0;
    let türevBear = 0;

    const fPct = (fundingAvg || 0) * 100;

    // Funding — aşırı değerler kontrarian sinyal
    if (fPct < -0.30) { türevBull += 3; türevNotlar.push('Funding ciddi negatif — short squeeze riski'); }
    else if (fPct < -0.10) { türevBull += 2; türevNotlar.push('Funding negatif — kısa pozisyon kalabalığı'); }
    else if (fPct < -0.03) { türevBull += 1; türevNotlar.push('Funding hafif negatif'); }
    else if (fPct > 0.30) { türevBear += 3; türevNotlar.push('Funding ciddi pozitif — long tasfiyesi riski'); uyarılar.push(`Funding %${fPct.toFixed(2)} — kalabalık long pozisyon`); }
    else if (fPct > 0.10) { türevBear += 2; türevNotlar.push('Funding pozitif — long ağırlıklı'); }
    else if (fPct > 0.05) { türevBear += 1; türevNotlar.push('Funding hafif pozitif'); }

    // Long/Short oranı — [DÜZ-7] sadece veri geçerliyse
    if (türevGeçerli) {
        if (safeNum(shortPct) > 75)     { türevBull += 2; türevNotlar.push(`%${safeNum(shortPct).toFixed(0)} short — sıkışma olası`); }
        else if (safeNum(shortPct) > 60) { türevBull += 1; }
        else if (safeNum(longPct) > 75)  { türevBear += 2; uyarılar.push(`%${safeNum(longPct).toFixed(0)} long kalabalığı — tasfiye riski`); türevNotlar.push('Kalabalık long pozisyon'); }
        else if (safeNum(longPct) > 65)  { türevBear += 1; }
    }

    // OI değişimi
    if (oiChange !== null && oiChange !== undefined) {
        if (chg24 > 2 && oiChange > 0.5)        { türevBull += 2; türevNotlar.push('OI + fiyat birlikte artıyor (güçlü trend)'); }
        else if (chg24 > 2 && oiChange < -0.5)   { türevBear += 1; uyarılar.push('Fiyat yükseliyor ama OI azalıyor — kırılgan ralli'); }
        else if (chg24 < -2 && oiChange > 0.5)   { türevBear += 2; türevNotlar.push('OI artarken fiyat düşüyor (kısa yükleniyor)'); }
        else if (chg24 < -2 && oiChange < -0.5)  { türevBull += 1; türevNotlar.push('OI + fiyat birlikte düşüyor (short kapanıyor)'); }
    }

    // Bollinger
    if (boll && price) {
        const lo = safeNum(boll.lower);
        const up = safeNum(boll.upper);
        const range = up - lo;
        if (range > 0) {
            const bp = (safeNum(price) - lo) / range;
            if (bp > 1.30)       { türevBear += 3; uyarılar.push('Fiyat üst Bollinger bandının çok üstünde'); }
            else if (bp > 1.00)  { türevBear += 2; }
            else if (bp > 0.90)  { türevBear += 1; }
            else if (bp < -0.30) { türevBull += 3; türevNotlar.push('Fiyat alt Bollinger bandının altında'); }
            else if (bp < 0.00)  { türevBull += 2; }
            else if (bp < 0.10)  { türevBull += 1; }
        }
    }

    const türevToplam = türevBull + türevBear;
    const türevLongOran = türevToplam > 0 ? (türevBull / türevToplam * 100) : 50;

    // ─── BÖLÜM 5: Nihai birleştirme ─────────────────────────
    // [DÜZ-8] TF %80, türev %20 (manipülasyona açık türev verilerine daha az ağırlık)
    const finalLongOran  = (tfLongOran * 0.80) + (türevLongOran * 0.20);
    const finalShortOran = 100 - finalLongOran;
    const fark = finalLongOran - finalShortOran;

    // ─── BÖLÜM 6: Karar ─────────────────────────────────────
    // [DÜZ-10] Volatiliteye göre dinamik eşik
    const vol_ = safeNum(volatility);
    const kararEşiği = vol_ > 7 ? 28 : (vol_ < 3 ? 22 : 25);

    let karar, kararSinif;

    if (tfÇatışmaVar) {
        // [DÜZ-3] Çatışma varsa her zaman BEKLE
        karar = 'BEKLE';
        kararSinif = 'bekle';
        uyarılar.push('Yüksek ve düşük TF trend çatışması — işlem açmak için erken');
    } else if (yüksekAktif.length >= 2 && yüksekTFUzlaşım < 0.45) {
        // [DÜZ-4+DÜZ-12] Yüksek TF'ler kendi aralarında uzlaşmıyorsa BEKLE
        // Alt TF sinyalleri temelsiz kalır
        karar = 'BEKLE';
        kararSinif = 'bekle';
        uyarılar.push('Yüksek TF sinyalleri birbiriyle çatışıyor — altta kalan trend belirsiz');
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
        : 0;

    const farkNorm = Math.min(Math.abs(fark) / 50, 1.0);
    let güven = Math.round((tfUzlaşım * 0.65 + farkNorm * 0.35) * 100);
    güven = clamp(güven, 20, 85);

    // Güven cezaları
    if (yeniCoin) güven = Math.min(güven, 52);
    if (tfÇatışmaVar) güven = Math.min(güven, 45);
    if (uyarılar.length >= 2) güven = Math.min(güven, 55);
    if (yüksekTFUzlaşım < 0.45) güven = Math.min(güven, 48); // [DÜZ-4] eşik 0.5→0.45
    if (toplamEfektifAğırlık < 0.05) güven = Math.min(güven, 30); // [DÜZ-5] veri yoksa

    const rsiG = safeNum(rsiGlobal);
    if (yeniCoin && rsiG > 85) güven = Math.min(güven, 32);

    // [DÜZ-9] Pump tuzağı koruması: funding aşırı pozitif + long sinyal
    if (fPct > 0.20 && karar === 'LONG') {
        güven = Math.min(güven, 45);
        uyarılar.push('Funding yüksekken LONG — pump/tasfiye riski, dikkatli ol');
    }

    güven = Math.round(güven);

    // ─── BÖLÜM 8: Risk skoru ────────────────────────────────
    let riskSkor = 3;

    if (rsiG > 90 || rsiG < 10)       riskSkor += 3;
    else if (rsiG > 80 || rsiG < 20)  riskSkor += 2;
    else if (rsiG >= 70 || rsiG < 30) riskSkor += 1; // [DÜZ-6]

    if (Math.abs(fPct) > 0.30)        riskSkor += 2;
    else if (Math.abs(fPct) > 0.10)   riskSkor += 1;

    if (vol_ > 10) riskSkor += 2;
    else if (vol_ > 5) riskSkor += 1;

    if (tfÇatışmaVar)           riskSkor += 2;
    if (uyarılar.length >= 2)   riskSkor += 1;
    if (yeniCoin)               riskSkor += 2;
    if (!türevGeçerli)          riskSkor += 1; // [DÜZ-7] geçersiz türev verisi

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
        yüksekTFUzlaşım,   // [YENİ] dışarıdan izlenebilir
        uyarılar,
        türevNotlar,

        // Meta
        symbol: coinSymbol,
        analysisTime,
        version: 'v6',

        // v4/v5 uyumluluğu
        longOran: finalLongOran,
        shortOran: finalShortOran,
    };
}

// Export
if (typeof window !== 'undefined') {
    window.kararMotoru = kararMotoru;
}