/**
 * Futures Analiz Pro - Grafik Motoru
 */
window.chartEngine = {
    instances: {
        candle: null,
        rsi: null,
        macd: null
    },

    // ── TEKNİK HESAPLAMALAR ─────────────────────────────────────────
    calcEMA: function (values, period) {
        if (values.length < period) return Array(values.length).fill(null);
        const k = 2 / (period + 1);
        const result = Array(period - 1).fill(null);
        let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
        result.push(ema);
        for (let i = period; i < values.length; i++) {
            ema = values[i] * k + ema * (1 - k);
            result.push(ema);
        }
        return result;
    },

    calcRSIWilder: function (closes, period = 14) {
        if (closes.length < period + 1) return Array(closes.length).fill(null);
        const result = Array(period).fill(null);
        let avgGain = 0, avgLoss = 0;
        for (let i = 1; i <= period; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff > 0) avgGain += diff;
            else avgLoss += Math.abs(diff);
        }
        avgGain /= period;
        avgLoss /= period;
        result.push(100 - (100 / (1 + avgGain / (avgLoss || 1e-10))));
        for (let i = period + 1; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? Math.abs(diff) : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
            result.push(100 - (100 / (1 + avgGain / (avgLoss || 1e-10))));
        }
        return result;
    },

    calcBollingerSeries: function (closes, period = 20, mult = 2) {
        const upper = [], mid = [], lower = [];
        for (let i = 0; i < closes.length; i++) {
            if (i < period - 1) { upper.push(null); mid.push(null); lower.push(null); continue; }
            const slice = closes.slice(i - period + 1, i + 1);
            const m = slice.reduce((a, b) => a + b, 0) / period;
            const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - m, 2), 0) / period);
            upper.push(m + mult * std);
            mid.push(m);
            lower.push(m - mult * std);
        }
        return { upper, mid, lower };
    },

    calcMACDSeries: function (closes) {
        const ema12 = this.calcEMA(closes, 12);
        const ema26 = this.calcEMA(closes, 26);
        const macdLine = closes.map((_, i) => (ema12[i] !== null && ema26[i] !== null) ? ema12[i] - ema26[i] : null);
        const valid = macdLine.filter(v => v !== null);
        const signalRaw = this.calcEMA(valid, 9);
        const signal = Array(macdLine.length - valid.length).fill(null).concat(
            Array(valid.length - signalRaw.length).fill(null).concat(signalRaw)
        );
        const histogram = macdLine.map((v, i) => (v !== null && signal[i] !== null) ? v - signal[i] : null);
        return { macdLine, signal, histogram };
    },

    // ── ÖZEL CANDLESTICK ÇİZİM MOTORU (FALLBACK) ──────────────────
    getCandlestickPlugin: function () {
        return {
            id: 'candlestickFallback',
            beforeDatasetsDraw: (chart) => {
                if (chart.config.type !== 'line' || !chart.data.datasets[0].isCandle) return;
                const { ctx, scales: { x, y } } = chart;
                const meta = chart.getDatasetMeta(0);
                const data = chart.data.datasets[0].data;

                meta.data.forEach((point, i) => {
                    const item = data[i];
                    if (!item) return;
                    const xPos = x.getPixelForValue(item.x);
                    const yO = y.getPixelForValue(item.o);
                    const yC = y.getPixelForValue(item.c);
                    const yH = y.getPixelForValue(item.h);
                    const yL = y.getPixelForValue(item.l);
                    const bull = item.c >= item.o;
                    const color = bull ? 'rgba(0, 230, 118, 0.9)' : 'rgba(255, 23, 68, 0.9)';
                    const barWidth = Math.max(3, (x.getPixelForValue(data[1]?.x) - x.getPixelForValue(data[0]?.x)) * 0.6);

                    ctx.save();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(xPos, yH); ctx.lineTo(xPos, yL); ctx.stroke();
                    ctx.fillStyle = color;
                    ctx.fillRect(xPos - barWidth / 2, Math.min(yO, yC), barWidth, Math.max(1, Math.abs(yO - yC)));
                    ctx.restore();
                });
            }
        };
    },

    // ── GRAFİK OLUŞTURMA ────────────────────────────────────────────
    destroyCharts: function () {
        try {
            Object.keys(this.instances).forEach(key => {
                if (this.instances[key] && typeof this.instances[key].destroy === 'function') {
                    this.instances[key].destroy();
                    this.instances[key] = null;
                }
            });
        } catch (error) {
            console.error('Chart silme hatası:', error);
            // Hata durumunda bile instanceları temizle
            Object.keys(this.instances).forEach(key => {
                this.instances[key] = null;
            });
        }
    },

    buildCharts: function (klines, currentTF, formatPriceFn) {
        this.destroyCharts();
        
        // Canvas elementlerinin varlığını kontrol et
        const candleCanvas = document.getElementById('candleChart');
        const rsiCanvas = document.getElementById('rsiChart');
        const macdCanvas = document.getElementById('macdChart');
        
        if (!candleCanvas || !rsiCanvas || !macdCanvas) {
            console.error('Canvas elementleri bulunamadı:', { candleCanvas, rsiCanvas, macdCanvas });
            throw new Error('Grafik canvas elementleri bulunamadı');
        }
        
        const labels = klines.map(k => new Date(k[0]));
        const opens = klines.map(k => parseFloat(k[1]));
        const highs = klines.map(k => parseFloat(k[2]));
        const lows = klines.map(k => parseFloat(k[3]));
        const closes = klines.map(k => parseFloat(k[4]));

        const boll = this.calcBollingerSeries(closes);
        const rsiSeries = this.calcRSIWilder(closes);
        const { macdLine, signal, histogram } = this.calcMACDSeries(closes);

        const N = klines.length;
        const show = Math.min(N, 70);
        const sl = N - show;

        const ohlcData = [];
        for (let i = sl; i < N; i++) {
            ohlcData.push({ x: labels[i].getTime(), o: opens[i], h: highs[i], l: lows[i], c: closes[i] });
        }

        const ctxC = document.getElementById('candleChart').getContext('2d');
        const useFinancial = (typeof ChartFinancial !== 'undefined');
        const tUnit = currentTF === '1M' ? 'month' : currentTF === '1w' ? 'week' : currentTF === '1d' ? 'day' : (currentTF === '4h' || currentTF === '1h') ? 'hour' : 'minute';
        const cPlugin = this.getCandlestickPlugin();

        // Candlestick Chart
        this.instances.candle = new Chart(ctxC, {
            type: useFinancial ? 'candlestick' : 'line',
            plugins: useFinancial ? [] : [cPlugin],
            data: {
                datasets: [
                    { label: 'Fiyat', data: ohlcData, isCandle: true, color: { up: 'rgba(0,230,118,0.9)', down: 'rgba(255,23,68,0.9)' }, borderColor: { up: 'rgba(0,230,118,0.7)', down: 'rgba(255,23,68,0.7)' }, borderWidth: 1, pointRadius: 0 },
                    { label: 'Üst Bant', data: boll.upper.slice(sl).map((v, i) => ({ x: labels[i + sl].getTime(), y: v })), borderColor: 'rgba(64,196,255,0.6)', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.2, type: 'line', order: 2 },
                    { label: 'Orta Bant', data: boll.mid.slice(sl).map((v, i) => ({ x: labels[i + sl].getTime(), y: v })), borderColor: 'rgba(255,234,0,0.5)', borderWidth: 1.2, borderDash: [5, 3], pointRadius: 0, fill: false, tension: 0.2, type: 'line', order: 2 },
                    { label: 'Alt Bant', data: boll.lower.slice(sl).map((v, i) => ({ x: labels[i + sl].getTime(), y: v })), borderColor: 'rgba(64,196,255,0.6)', borderWidth: 1.5, pointRadius: 0, fill: '+1', backgroundColor: 'rgba(64,196,255,0.04)', tension: 0.2, type: 'line', order: 2 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { 
                    legend: { display: false },
                    zoom: {
                        zoom: {
                            wheel: {
                                enabled: true,
                                speed: 0.1
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                        },
                        pan: {
                            enabled: true,
                            mode: 'x',
                        }
                    }
                },
                scales: {
                    x: { 
                        type: 'time', 
                        time: { unit: tUnit }, 
                        ticks: { color: '#90a4ae', font: { size: 9 }, maxTicksLimit: 8 },
                        adapters: { date: luxon.DateTime }
                    },
                    y: { position: 'right', ticks: { color: '#90a4ae', font: { size: 9 }, callback: v => formatPriceFn(v) } }
                }
            }
        });

        // RSI Chart
        const ctxR = document.getElementById('rsiChart').getContext('2d');
        this.instances.rsi = new Chart(ctxR, {
            type: 'line',
            data: { 
                labels: labels.slice(sl), 
                datasets: [{ 
                    label: 'RSI', 
                    data: rsiSeries.slice(sl), 
                    borderColor: '#e040fb', 
                    borderWidth: 2, 
                    pointRadius: 0, 
                    fill: false, 
                    tension: 0.2 
                }] 
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    zoom: {
                        zoom: {
                            wheel: {
                                enabled: true,
                                speed: 0.1
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                        },
                        pan: {
                            enabled: true,
                            mode: 'x',
                        }
                    },
                    rsiLines: { // Özel plugin referansı (analiz_v3.html'de register edilmeli veya buraya taşınmalı)
                        afterDraw: (chart) => {
                            try {
                                // Tüm güvenlik kontrolleri
                                if (!chart || !chart.ctx || !chart.scales) return;
                                
                                const { ctx, scales } = chart;
                                const x = scales.x;
                                const y = scales.y;
                                
                                // Scale kontrolü
                                if (!x || !y || typeof x.getPixelForValue !== 'function' || typeof y.getPixelForValue !== 'function') return;
                                
                                // Chart alanının kontrolü
                                if (typeof x.left === 'undefined' || typeof x.right === 'undefined') return;
                                
                                [70, 30].forEach(v => {
                                    const py = y.getPixelForValue(v);
                                    if (typeof py !== 'number' || isNaN(py)) return;
                                    
                                    ctx.save();
                                    ctx.strokeStyle = v === 70 ? 'rgba(255,23,68,0.4)' : 'rgba(0,230,118,0.4)';
                                    ctx.setLineDash([4, 4]); 
                                    ctx.beginPath(); 
                                    ctx.moveTo(x.left, py); 
                                    ctx.lineTo(x.right, py); 
                                    ctx.stroke();
                                    
                                    ctx.fillStyle = v === 70 ? 'rgba(255,23,68,0.7)' : 'rgba(0,230,118,0.7)';
                                    ctx.font = '8px JetBrains Mono'; 
                                    ctx.fillText(v, x.right + 2, py + 3); 
                                    ctx.restore();
                                });
                            } catch (error) {
                                console.warn('RSI lines çizim hatası:', error);
                                // Hata olsa bile chart'ın çalışmasına devam et
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        type: 'time', 
                        time: { unit: tUnit }, 
                        ticks: { display: false },
                        adapters: { date: luxon.DateTime }
                    },
                    y: { min: 0, max: 100, ticks: { color: '#90a4ae', stepSize: 30 } }
                }
            }
        });

        // MACD Chart
        const ctxM = document.getElementById('macdChart').getContext('2d');
        const histColors = histogram.slice(sl).map(v => v === null ? 'transparent' : (v >= 0 ? 'rgba(0,230,118,0.7)' : 'rgba(255,23,68,0.7)'));
        this.instances.macd = new Chart(ctxM, {
            type: 'bar',
            data: {
                labels: labels.slice(sl),
                datasets: [
                    { label: 'Histogram', data: histogram.slice(sl), backgroundColor: histColors, borderWidth: 0, order: 3 },
                    { label: 'MACD', data: macdLine.slice(sl), type: 'line', borderColor: '#40c4ff', borderWidth: 2, pointRadius: 0, tension: 0.2, order: 1 },
                    { label: 'Sinyal', data: signal.slice(sl), type: 'line', borderColor: '#ffea00', borderWidth: 2, pointRadius: 0, tension: 0.2, order: 2 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    zoom: {
                        zoom: {
                            wheel: {
                                enabled: true,
                                speed: 0.1
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                        },
                        pan: {
                            enabled: true,
                            mode: 'x',
                        }
                    }
                },
                scales: {
                    x: { 
                        type: 'time', 
                        time: { unit: tUnit }, 
                        ticks: { color: '#90a4ae', font: { size: 9 }, maxTicksLimit: 6 },
                        adapters: { date: luxon.DateTime }
                    },
                    y: { ticks: { color: '#90a4ae' } }
                }
            }
        });
    }
};

// RSI Çizgileri için global plugin (Chart.js'e bir kez kaydedilir)
if (typeof Chart !== 'undefined') {
    Chart.register({
        id: 'rsiLines',
        afterDraw(chart) {
            if (chart.options.plugins.rsiLines && chart.options.plugins.rsiLines.afterDraw) {
                chart.options.plugins.rsiLines.afterDraw(chart);
            }
        }
    });
}