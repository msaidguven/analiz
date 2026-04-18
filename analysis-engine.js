/**
 * 🧠 CENTRAL ANALYSIS ENGINE v2.0
 * 
 * Bu dosya projedeki tüm zekayı TEK bir merkezde toplar.
 * 1. Veri Hazırlama (analiz_v3.html ile %100 uyumlu)
 * 2. Karar Motoru (karar-motoru.js'den birebir kopyalandı)
 * 3. Hızlı Değerlendirme (analiz_v3.html'deki buildVerdict'ten port edildi)
 */

window.AnalysisEngine = {
    
    // ─── YARDIMCILAR ─────────────────────────────────────────
    safeNum(v, fallback = 0) {
        const n = parseFloat(v);
        return isNaN(n) ? fallback : n;
    },
    
    fp(p) {
        if (p < 0.0001) return p.toFixed(8);
        if (p < 0.01) return p.toFixed(6);
        if (p < 1) return p.toFixed(4);
        if (p < 100) return p.toFixed(3);
        return p.toFixed(2);
    },

    // ─── VERİ TOPLAYICI (analiz_v3.html Mantığıyla Senkron) ───
    async fetchScoutData(symbol) {
        const BASE = 'https://fapi.binance.com';
        const currentSymbol = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
        
        try {
            // Paralel Veri Çekme (analiz_v3.html L3150-3158 ile birebir limitler)
            const [ticker, k1d, k1h, k15m, k4h, k1w, oiRaw, oiHist, fundingRaw, lsRaw] = await Promise.all([
                fetch(`${BASE}/fapi/v1/ticker/24hr?symbol=${currentSymbol}`).then(r => r.json()),
                fetch(`${BASE}/fapi/v1/klines?symbol=${currentSymbol}&interval=1d&limit=220`).then(r => r.json()),
                fetch(`${BASE}/fapi/v1/klines?symbol=${currentSymbol}&interval=1h&limit=100`).then(r => r.json()),
                fetch(`${BASE}/fapi/v1/klines?symbol=${currentSymbol}&interval=15m&limit=100`).then(r => r.json()),
                fetch(`${BASE}/fapi/v1/klines?symbol=${currentSymbol}&interval=4h&limit=60`).then(r => r.json()),
                fetch(`${BASE}/fapi/v1/klines?symbol=${currentSymbol}&interval=1w&limit=50`).then(r => r.json()),
                fetch(`${BASE}/fapi/v1/openInterest?symbol=${currentSymbol}`).then(r => r.json()).catch(() => ({})),
                fetch(`${BASE}/futures/data/openInterestHist?symbol=${currentSymbol}&period=1h&limit=2`).then(r => r.json()).catch(() => []),
                fetch(`${BASE}/fapi/v1/fundingRate?symbol=${currentSymbol}&limit=8`).then(r => r.json()).catch(() => []),
                fetch(`${BASE}/futures/data/topLongShortAccountRatio?symbol=${currentSymbol}&period=5m&limit=1`).then(r => r.json()).catch(() => [])
            ]);

            const price = parseFloat(ticker.lastPrice);
            const currentOI = oiRaw ? parseFloat(oiRaw.openInterest) : 0;
            let oiChange = 0;
            if (oiRaw && Array.isArray(oiHist) && oiHist.length >= 2) {
                const prevOI = parseFloat(oiHist[1].sumOpenInterest);
                oiChange = ((currentOI - prevOI) / prevOI) * 100;
            }

            const lsRatio = Array.isArray(lsRaw) && lsRaw.length ? parseFloat(lsRaw[0].longShortRatio) : 1;
            const fundingAnalysis = this.analyzeFundingTrend(fundingRaw);
            
            const closesTF = k1h.map(k => parseFloat(k[4]));
            const volumesTF = k1h.map(k => parseFloat(k[5]));
            
            let volatility = null;
            if (k1h.length >= 20) {
                const ranges = k1h.slice(-20).map(k => (parseFloat(k[2]) - parseFloat(k[3])) / parseFloat(k[4]) * 100);
                volatility = ranges.reduce((a, b) => a + b, 0) / 20;
            }

            let volumeSpike = false, spikeRatio = 0;
            if (volumesTF.length >= 21) {
                const lastVol = volumesTF[volumesTF.length - 1];
                const avgVol = volumesTF.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
                spikeRatio = lastVol / avgVol;
                volumeSpike = spikeRatio >= 2.0;
            }

            // multiTF Objesini Oluştur (karar-motoru.js'nin can damarı)
            const multiTF = {
                '15m': this.getDetailedTFData(k15m, k1d),
                '1h': this.getDetailedTFData(k1h, k1d),
                '4h': this.getDetailedTFData(k4h, k1d),
                '1d': this.getDetailedTFData(k1d, k1d),
                '1w': this.getWeeklyData(k1w)
            };

            const sr = this.calcSR(k1d, k1h);
            const lhResult = this.detectLiquidityHunt({
                klines: k1h,
                closes: closesTF,
                rsi: multiTF['1h']?.rsi,
                fundingAvg: fundingAnalysis?.avg || 0,
                volumeSpike,
                spikeRatio,
                supports: sr.supports,
                resistances: sr.resistances,
                price
            });
            const msResult = this.classifyMarketStructure(k1h);

            // KARAR MOTORU d objesi (karar-motoru.js L23-32 ile birebir uyumlu)
            const d = {
                price,
                chg24: parseFloat(ticker.priceChangePercent),
                volatility,
                rsi: multiTF['1h']?.rsi,
                macd: multiTF['1h']?.macd,
                boll: this.calcSingleBollinger(closesTF),
                supports: sr.supports,
                resistances: sr.resistances,
                fundingAvg: fundingAnalysis?.avg || 0,
                oiChange,
                longPct: (lsRatio / (1 + lsRatio)) * 100,
                shortPct: (1 / (1 + lsRatio)) * 100,
                volumeSpike,
                spikeRatio,
                lhResult,
                msResult,
                analysisTime: new Date().toISOString(),
                multiTF,
                symbol: currentSymbol
            };

            return d;
        } catch (e) {
            console.error('Fetch Error:', e);
            return null;
        }
    },

    // ─── ANALİZ FONKSİYONLARI (analiz_v3.html'den Birebir) ───
    calcSingleRSI(closes, period = 14) {
        if (closes.length < period + 1) return null;
        const rsiArr = window.chartEngine.calcRSIWilder(closes, period);
        return rsiArr[rsiArr.length - 1];
    },

    calcSingleBollinger(closes, period = 20, mult = 2) {
        if (closes.length < period) return null;
        const slice = closes.slice(-period);
        const m = slice.reduce((a, b) => a + b, 0) / period;
        const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - m, 2), 0) / period);
        return { upper: m + mult * std, mid: m, lower: m - mult * std, std };
    },

    calcSingleMACD(closes) {
        if (closes.length < 35) return null;
        const macdObj = window.chartEngine.calcMACDSeries(closes);
        return {
            macd: macdObj.macdLine[macdObj.macdLine.length - 1],
            signal: macdObj.signal[macdObj.signal.length - 1],
            histogram: macdObj.histogram[macdObj.histogram.length - 1]
        };
    },

    getDetailedTFData(klines, klines1d) {
        if (!klines || klines.length < 20) return null;
        const cls = klines.map(k => parseFloat(k[4]));
        const rsiVal = this.calcSingleRSI(cls);
        const e20 = window.chartEngine.calcEMA(cls, 20).slice(-1)[0];
        const e50 = window.chartEngine.calcEMA(cls, 50).slice(-1)[0];
        const macdVal = this.calcSingleMACD(cls);
        const ms = this.classifyMarketStructure(klines);
        const srVal = this.calcSR(klines1d, klines);
        const prevClose = cls.length >= 2 ? cls[cls.length - 2] : cls[cls.length - 1];
        const lastClose = cls[cls.length - 1];
        const tfChg = prevClose ? ((lastClose - prevClose) / prevClose) * 100 : 0;

        const vols = klines.map(k => parseFloat(k[5]));
        const takerVols = klines.map(k => parseFloat(k[9]));
        const lastVol = vols[vols.length - 1];
        const lastTakerVol = takerVols[takerVols.length - 1];
        const delta = lastTakerVol - (lastVol - lastTakerVol);

        const avgVol = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;

        return {
            rsi: rsiVal,
            ema20: e20, ema50: e50,
            macd: macdVal || { macd: 0, signal: 0, histogram: 0 },
            smc: { trend: ms.trend, choch: ms.choch, bos: ms.bos },
            sr: { supports: srVal.supports, resistances: srVal.resistances },
            volume: lastVol,        // karar-motoru.js uyumluluğu için
            volumeAvg: avgVol,      // karar-motoru.js uyumluluğu için
            volAmount: lastVol,     // analiz_v3 uyumluluğu için
            avgVol: avgVol,         // analiz_v3 uyumluluğu için
            delta: delta,
            cvd: delta,
            chg: tfChg
        };
    },

    getWeeklyData(klines) {
        if (!klines || klines.length < 1) return null;
        const cls = klines.map(k => parseFloat(k[4]));
        const vols = klines.map(k => parseFloat(k[5]));
        const takerVols = klines.map(k => parseFloat(k[9]));
        const count = klines.length;
        const rsiVal = this.calcSingleRSI(cls);
        const e20 = cls.length >= 20 ? window.chartEngine.calcEMA(cls, 20).slice(-1)[0] : null;
        const e50 = cls.length >= 50 ? window.chartEngine.calcEMA(cls, 50).slice(-1)[0] : null;
        const macdVal = this.calcSingleMACD(cls);
        const trend = e20 ? (cls[cls.length - 1] > e20 ? 'BULLISH' : 'BEARISH') : (count < 20 ? 'INSUFFICIENT DATA' : 'NEUTRAL');
        const srVal = this.calcSR(klines, klines);
        const prevClose = cls.length >= 2 ? cls[cls.length - 2] : cls[cls.length - 1];
        const lastClose = cls[cls.length - 1];
        const tfChg = prevClose ? ((lastClose - prevClose) / prevClose) * 100 : 0;
        const lastVol = vols.length ? vols[vols.length - 1] : 0;
        const lastTakerVol = takerVols.length ? takerVols[takerVols.length - 1] : 0;
        const delta = lastTakerVol - (lastVol - lastTakerVol);
        const avgVol = vols.length > 1 ? vols.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.min(20, vols.length - 1) : lastVol;
        return {
            count,
            trend,
            closes: cls.slice(-3),
            rsi: rsiVal,
            ema20: e20,
            ema50: e50,
            macd: macdVal || { macd: 0, signal: 0, histogram: 0 },
            smc: { trend, choch: false, bos: false },
            sr: { supports: srVal.supports, resistances: srVal.resistances },
            volume: lastVol,
            volumeAvg: avgVol,
            volAmount: lastVol,
            avgVol: avgVol,
            delta: delta,
            cvd: delta,
            chg: tfChg
        };
    },

    calcSR(klines1d, klinesTF) {
        const price = (() => {
            const src = (klines1d && klines1d.length) ? klines1d : klinesTF;
            return parseFloat(src[src.length - 1][4]);
        })();
        const allPivots = [];
        function extractPivots(klines, lookback) {
            if (!klines || klines.length < lookback * 2 + 1) return;
            const highs = klines.map(k => parseFloat(k[2]));
            const lows = klines.map(k => parseFloat(k[3]));
            const volumes = klines.map(k => parseFloat(k[5]));
            for (let i = lookback; i < klines.length - lookback; i++) {
                let isHigh = true, isLow = true;
                for (let d = 1; d <= lookback; d++) {
                    if (highs[i] <= highs[i - d] || highs[i] <= highs[i + d]) isHigh = false;
                    if (lows[i] >= lows[i - d] || lows[i] >= lows[i + d]) isLow = false;
                }
                if (isHigh) allPivots.push({ price: highs[i], volume: volumes[i], type: 'resistance' });
                if (isLow) allPivots.push({ price: lows[i], volume: volumes[i], type: 'support' });
            }
        }
        extractPivots(klines1d || [], 2);
        extractPivots((klinesTF || []).slice(-60), 2);
        const filtered = allPivots.filter(p => Math.abs(p.price - price) / price <= 0.20);
        const supports = filtered.filter(p => p.type === 'support' && p.price < price).sort((a, b) => b.price - a.price);
        const resistances = filtered.filter(p => p.type === 'resistance' && p.price > price).sort((a, b) => a.price - b.price);
        function cluster(arr) {
            const res = [];
            for (const p of arr) {
                const last = res[res.length - 1];
                if (last && Math.abs(p.price - last.price) / last.price < 0.02) {
                    if (p.volume > last.volume) res[res.length - 1] = p;
                } else res.push(p);
            }
            return res;
        }
        return {
            supports: cluster(supports).slice(0, 4).map(s => s.price),
            resistances: cluster(resistances).slice(0, 4).map(r => r.price)
        };
    },

    classifyMarketStructure(klines) {
        if (!klines || klines.length < 10) return { trend: 'UNKNOWN' };
        const highs = klines.map(k => parseFloat(k[2]));
        const lows = klines.map(k => parseFloat(k[3]));
        const closes = klines.map(k => parseFloat(k[4]));
        const N = klines.length;
        const swingHighs = [], swingLows = [];
        for (let i = 3; i < N - 2; i++) {
            if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] && highs[i] > highs[i - 3] && highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) swingHighs.push({ idx: i, price: highs[i] });
            if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] && lows[i] < lows[i - 3] && lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) swingLows.push({ idx: i, price: lows[i] });
        }
        const lastHighs = swingHighs.slice(-4);
        const lastLows = swingLows.slice(-4);
        let hh = 0, hl = 0, lh = 0, ll = 0;
        for (let i = 1; i < lastHighs.length; i++) { if (lastHighs[i].price > lastHighs[i - 1].price) hh++; else lh++; }
        for (let i = 1; i < lastLows.length; i++) { if (lastLows[i].price > lastLows[i - 1].price) hl++; else ll++; }
        let trend = (hh + hl > lh + ll + 1) ? 'BULLISH' : (lh + ll > hh + hl + 1 ? 'BEARISH' : 'RANGING');
        let choch = null, bos = null;
        const price = closes[N - 1];
        if (trend === 'BEARISH' && lastHighs.length >= 1 && price > lastHighs[lastHighs.length - 1].price) choch = { type: 'CHoCH YUKARISI' };
        if (trend === 'BULLISH' && lastLows.length >= 1 && price < lastLows[lastLows.length - 1].price) choch = { type: 'CHoCH AŞAĞISI' };
        if (trend === 'BULLISH' && lastHighs.length >= 2 && price > lastHighs[lastHighs.length - 2].price * 1.001) bos = { type: 'BOS YUKARISI' };
        if (trend === 'BEARISH' && lastLows.length >= 2 && price < lastLows[lastLows.length - 2].price * 0.999) bos = { type: 'BOS AŞAĞISI' };
        return { trend, choch, bos };
    },

    detectLiquidityHunt(p) {
        let score = 0;
        if (p.klines && p.klines.length >= 3) {
            const recent = p.klines.slice(-5);
            for (const k of recent) {
                const o = parseFloat(k[1]), h = parseFloat(k[2]), l = parseFloat(k[3]), c = parseFloat(k[4]);
                const range = h - l;
                const upperWick = h - Math.max(o, c);
                const lowerWick = Math.min(o, c) - l;
                if (range > 0 && lowerWick / range > 0.55 && lowerWick / p.price > 0.004) score += 25;
                if (range > 0 && upperWick / range > 0.55 && upperWick / p.price > 0.004) score += 25;
            }
        }
        return { score, reversalLikely: score >= 25 };
    },

    analyzeFundingTrend(rates) {
        if (!rates || rates.length < 2) return null;
        const values = rates.map(r => parseFloat(r.fundingRate));
        const n = values.length;
        const avg = values.reduce((a, b) => a + b, 0) / n;
        const indices = [...Array(n).keys()];
        const avgX = indices.reduce((a, b) => a + b, 0) / n;
        const avgY = avg;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) {
            num += (indices[i] - avgX) * (values[i] - avgY);
            den += Math.pow(indices[i] - avgX, 2);
        }
        const slope = den !== 0 ? num / den : 0;
        return { avg, slope };
    },

    // ─── KARAR MODELİ 1: V5 TAM KAPASİTE (karar-motoru.js Gömüldü) ───
    runV5Full(d) {
        // Bu kısım karar-motoru.js dosyasından %100 verbatim port edilmiştir.
        function safeNum(v, fallback = 0) { const n = parseFloat(v); return isNaN(n) ? fallback : n; }
        function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

        const {
            price, chg24, volatility, rsi: rsiGlobal, macd: macdGlobal, boll,
            supports, resistances, fundingAvg, oiChange, longPct, shortPct,
            volumeSpike, spikeRatio, lhResult, msResult, analysisTime, multiTF, symbol: coinSymbol
        } = d;

        let yeniCoin = false;
        if (!multiTF || !multiTF['1w']) yeniCoin = true;
        if (multiTF && multiTF['1w']) {
            if ((multiTF['1w'].count !== undefined && multiTF['1w'].count < 10) || (multiTF['1w'].closes && multiTF['1w'].closes.length < 10)) yeniCoin = true;
        }

        const TF_AGIRLIK = { '1w': 0.30, '1d': 0.25, '4h': 0.22, '1h': 0.14, '15m': 0.09 };
        const tfListesi = ['15m', '1h', '4h', '1d', '1w'];
        const tfSonuclar = {};

        tfListesi.forEach(tf => {
            const tfData = multiTF ? multiTF[tf] : null;
            if (!tfData) { tfSonuclar[tf] = { yön: 'notr', güç: 0, güvenilirlik: 0, uzlaşım: 0 }; return; }

            const rsi = safeNum(tfData.rsi);
            const macd = tfData.macd;
            const smc = tfData.smc;
            const cvd = tfData.cvd !== undefined ? tfData.cvd : tfData.delta;
            const vol = safeNum(tfData.volume);
            const volAvg = safeNum(tfData.volumeAvg);
            const volOran = volAvg > 0 ? vol / volAvg : 1;

            const sinyaller = [];
            if (rsi > 0) {
                if (rsi > 90) sinyaller.push({ yön: 'bear', güç: 3 });
                else if (rsi > 80) sinyaller.push({ yön: 'bear', güç: 2 });
                else if (rsi > 70) sinyaller.push({ yön: 'bear', güç: 1 });
                else if (rsi < 10) sinyaller.push({ yön: 'bull', güç: 3 });
                else if (rsi < 20) sinyaller.push({ yön: 'bull', güç: 2 });
                else if (rsi < 30) sinyaller.push({ yön: 'bull', güç: 1 });
            }
            if (macd && macd.histogram !== undefined) {
                const hP = safeNum(macd.histogram) > 0, mP = safeNum(macd.macd) > 0;
                if (hP && mP) sinyaller.push({ yön: 'bull', güç: 2 });
                else if (hP && !mP) sinyaller.push({ yön: 'bull', güç: 1 });
                else if (!hP && !mP) sinyaller.push({ yön: 'bear', güç: 2 });
                else sinyaller.push({ yön: 'bear', güç: 1 });
            }
            if (smc && smc.trend) {
                const sGüç = volOran > 1.2 ? 2 : 1;
                if (smc.trend === 'BULLISH') sinyaller.push({ yön: 'bull', güç: sGüç });
                else if (smc.trend === 'BEARISH') sinyaller.push({ yön: 'bear', güç: sGüç });
            }
            if (cvd !== null && cvd !== undefined) {
                if (cvd > 0 && chg24 > 0) sinyaller.push({ yön: 'bull', güç: 1 });
                else if (cvd < 0 && chg24 < 0) sinyaller.push({ yön: 'bear', güç: 1 });
                else if (cvd > 0 && chg24 < 0) sinyaller.push({ yön: 'bull', güç: 2 });
                else if (cvd < 0 && chg24 > 0) sinyaller.push({ yön: 'bear', güç: 2 });
            }
            if (vol > 0 && volAvg > 0) {
                if (volOran < 0.35) sinyaller.push({ yön: 'notr', güç: 1 });
                else if (volOran > 2.0) sinyaller.push({ yön: chg24 > 0 ? 'bull' : 'bear', güç: 1 });
            }

            const bG = sinyaller.filter(s => s.yön === 'bull').reduce((t, s) => t + s.güç, 0);
            const rG = sinyaller.filter(s => s.yön === 'bear').reduce((t, s) => t + s.güç, 0);
            const tG = bG + rG;
            let uzlaşım = 0.5, tfYön = 'notr';
            if (tG > 0) {
                const baskın = Math.max(bG, rG) / tG;
                const çatışma = Math.min(bG, rG) / tG;
                uzlaşım = baskın * (1 - çatışma * 0.8);
                tfYön = bG > rG ? 'bull' : (rG > bG ? 'bear' : 'notr');
            }
            let güven = 1.0;
            if (volOran < 0.35) güven *= 0.5;
            if (yeniCoin && (tf === '1w' || tf === '1d')) güven *= 0.7;

            tfSonuclar[tf] = { yön: tfYön, bullGüç: bG, bearGüç: rG, toplamGüç: tG, uzlaşım, güvenilirlik: güven };
        });

        const yTF = ['1w', '1d', '4h'], dTF = ['1h', '15m'];
        const yB = yTF.filter(tf => tfSonuclar[tf]?.yön === 'bull').length;
        const yR = yTF.filter(tf => tfSonuclar[tf]?.yön === 'bear').length;
        const dB = dTF.filter(tf => tfSonuclar[tf]?.yön === 'bull').length;
        const dR = dTF.filter(tf => tfSonuclar[tf]?.yön === 'bear').length;
        const tfÇatışmaVar = (yR >= 2 && dB >= 2) || (yB >= 2 && dR >= 2);

        let efAg = { ...TF_AGIRLIK }; if (yeniCoin) { efAg['1d'] += efAg['1w']; efAg['1w'] = 0; }
        let aB = 0, aR = 0, tEA = 0;
        tfListesi.forEach(tf => {
            const s = tfSonuclar[tf]; const a = efAg[tf];
            if (!s || a === 0 || s.toplamGüç === 0) return;
            const katkı = a * s.güvenilirlik * s.uzlaşım;
            aB += (s.bullGüç / s.toplamGüç) * katkı; aR += (s.bearGüç / s.toplamGüç) * katkı; tEA += katkı;
        });

        const tfLongOran = tEA > 0 ? (aB / (aB + aR)) * 100 : 50;
        let tB = 0, tR = 0;
        const fPct = (fundingAvg || 0) * 100;
        if (fPct < -0.30) tB += 3; else if (fPct < -0.10) tB += 2; else if (fPct < -0.03) tB += 1;
        else if (fPct > 0.30) tR += 3; else if (fPct > 0.10) tR += 2; else if (fPct > 0.05) tR += 1;
        if (shortPct > 75) tB += 2; else if (shortPct > 60) tB += 1;
        else if (longPct > 75) tR += 2; else if (longPct > 65) tR += 1;
        if (oiChange && chg24) { if (chg24 > 2 && oiChange > 0.5) tB += 2; else if (chg24 < -2 && oiChange > 0.5) tR += 2; }
        if (boll && price) {
            const bP = (price - boll.lower) / (boll.upper - boll.lower);
            if (bP > 1.3) tR += 3; else if (bP > 1.0) tR += 2; else if (bP < -0.3) tB += 3; else if (bP < 0) tB += 2;
        }
        const tLongOran = (tB + tR) > 0 ? (tB / (tB + tR) * 100) : 50;
        const finalLongOran = (tfLongOran * 0.75) + (tLongOran * 0.25);
        const fark = finalLongOran - (100 - finalLongOran);
        const karar = tfÇatışmaVar ? 'BEKLE' : (fark >= 25 ? 'LONG' : (fark <= -25 ? 'SHORT' : 'BEKLE'));

        let uO = 0, uTA = 0;
        tfListesi.forEach(tf => {
            const s = tfSonuclar[tf], a = efAg[tf]; if (!s || a === 0 || s.toplamGüç === 0) return;
            uO += s.uzlaşım * s.güvenilirlik * a; uTA += a;
        });
        const tfUz = uTA > 0 ? uO / uTA : 0.5;
        const farkNorm = Math.min(Math.abs(fark) / 50, 1.0);
        let güven = Math.round((tfUz * 0.65 + farkNorm * 0.35) * 100);
        güven = clamp(güven, 20, 85);
        if (yeniCoin) güven = Math.min(güven, 52); if (tfÇatışmaVar) güven = Math.min(güven, 45);
        return { karar, guven: Math.round(güven), finalLongOran, finalShortOran: 100 - finalLongOran };
    },

    // ─── KARAR MODELİ 2: V3 HIZLI DEĞERLENDİRME (analiz_v3.html Port) ──
    runV3Local(intel) {
        // Bu kısım analiz_v3.html buildVerdict fonksiyonundan verbatim port edilmiştir.
        const { rsi, macd, boll, price, fundingAvg, longPct, shortPct } = intel;
        const lsRatio = longPct / shortPct;
        
        let score = 0;
        if (rsi > 85) score -= 2.5; else if (rsi > 70) score -= 1.2; else if (rsi < 30) score += 2.5; else if (rsi < 45) score += 0.8;

        if (macd) {
            if (macd.histogram < 0 && macd.macd < 0) score -= 1.5; else if (macd.histogram > 0 && macd.macd > 0) score += 1.5; else if (macd.histogram < 0) score -= 0.5;
        }

        if (boll) {
            const pos = (price - boll.lower) / (boll.upper - boll.lower);
            if (pos > 1.02) score -= 2.2; else if (pos > 0.85) score -= 1; else if (pos < -0.02) score += 2.2; else if (pos < 0.15) score += 1;
        }

        const fP = (fundingAvg || 0) * 100;
        if (fP > 0.05) score -= 1.0; else if (fP < -0.03) score += 1.0;

        const sPct = (1 / (1 + lsRatio)) * 100;
        if (sPct > 75) score -= 0.5; else if (sPct > 60) score -= 0.3;

        let karar = 'BEKLE';
        if (score <= -2.5) karar = 'SHORT'; else if (score >= 2.5) karar = 'LONG'; else if (score <= -1) karar = 'SHORT (zayıf)'; else if (score >= 1) karar = 'LONG (zayıf)';

        return { karar, guven: Math.min(99, Math.round(Math.abs(score) * 20)), score };
    },

    // ─── ANA ÇAĞIRICI ────────────────────────────────────────
    calculateIntelligence(rawData) {
        // fetchScoutData zaten tüm veri hazırlığını analiz_v3 formatında yapıyor.
        return rawData;
    },

    decide(intel, modelType) {
        if (!intel) return { karar: 'N/A', guven: 0 };
        if (modelType === 'v3Local') return this.runV3Local(intel);
        if (modelType === 'v5Full') {
            // MODEL 3: Doğrudan karar-motoru.js v6 kullan (tüm DÜZ-1..DÜZ-12 düzeltmeleriyle)
            if (typeof window.kararMotoru === 'function') {
                const res = window.kararMotoru(intel);
                return { karar: res.karar, guven: res.guven, ...res };
            }
            // Fallback: window.kararMotoru yüklenmediyse eski motoru çalıştır
            return this.runV5Full(intel);
        }
        if (modelType === 'v5Simple') {
            // MODEL 1: Anasayfa (index.html) ile aynı mantık
            // Anasayfa: volatility=0 (hardcoded), karar-motoru.js v6 kullanır
            if (typeof window.kararMotoru === 'function') {
                const simple = JSON.parse(JSON.stringify(intel));
                simple.volatility = 0; // Anasayfa volatility hesaplamaz → dinamik eşik devreye girmez
                const res = window.kararMotoru(simple);
                return { karar: res.karar, guven: res.guven, ...res };
            }
            // Fallback
            const simple = JSON.parse(JSON.stringify(intel));
            simple.msResult = null; simple.lhResult = null;
            return this.runV5Full(simple);
        }
        return { karar: 'BEKLE', guven: 0 };
    }
};
