// Karar Kayıt ve Analiz Sistemi
// Supabase üzerinden çalışır
// GitHub Pages uyumlu

class KararKayitSistemi {
    constructor() {
        this.SUPABASE_URL = this.normalizeSupabaseUrl(window.SUPABASE_URL || localStorage.getItem('SUPABASE_URL') || '');
        this.SUPABASE_ANON_KEY = this.normalizeSupabaseKey(window.SUPABASE_ANON_KEY || localStorage.getItem('SUPABASE_ANON_KEY') || '');
        this.supabaseClient = this.createSupabaseClient();
        
        this.kayitlar = [];
        this.cuzdanKayitlari = [];
        this.islemKuyrugu = Promise.resolve();
        
        console.log(`📊 Karar Kayıt Sistemi başlatıldı (Supabase Modu)`);
    }

    createSupabaseClient() {
        if (!this.isSupabaseConfigured()) return null;
        if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
        return window.supabase.createClient(this.SUPABASE_URL, this.SUPABASE_ANON_KEY);
    }

    normalizeSupabaseUrl(url) {
        return String(url || '').trim().replace(/\/+$/, '');
    }

    normalizeSupabaseKey(key) {
        // Kopyalama sırasında giren whitespace/newline karakterlerini temizle.
        return String(key || '').trim().replace(/\s+/g, '');
    }

    getTradeSettings() {
        // Artık merkezi yönetim sistemini kullanıyoruz
        if (window.tradeSettingsManager) {
            return window.tradeSettingsManager.getSettings();
        }
        
        // Fallback - merkezi sistem yüklenmemişse
        console.warn('⚠️ Trade settings manager not found, using fallback');
        return this.DEFAULT_TRADE_SETTINGS;
    }

    isSupabaseConfigured() {
        const hasUrl = Boolean(this.SUPABASE_URL && !this.SUPABASE_URL.includes('YOUR_PROJECT_ID'));
        const hasKey = Boolean(this.SUPABASE_ANON_KEY && !this.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY'));
        return hasUrl && hasKey;
    }

    isGitHubPages() {
        return typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
    }

    async supabaseInsertIslemDirect(payload) {
        if (!this.supabaseClient) {
            throw new Error('Supabase client başlatılamadı. config.js veya supabase-js scriptini kontrol edin.');
        }

        console.log('🔥 DIRECT Supabase Insert Attempt:', {
            payload: payload,
            payloadString: JSON.stringify(payload),
            clientConfig: {
                url: this.SUPABASE_URL,
                hasKey: !!this.SUPABASE_ANON_KEY
            }
        });

        const { data, error } = await this.supabaseClient
            .from('islemler')
            .insert(payload)
            .select()
            .single();

        console.log('🔥 DIRECT Supabase Response:', {
            data: data,
            error: error,
            success: !error,
            returnedData: data || null
        });

        if (error) {
            throw new Error(`Supabase insert hatası: ${error.message}`);
        }

        return data || null;
    }

    async supabaseInsertIslemViaApi(payload) {
        const apiBase = String(window.API_BASE_URL || '').trim().replace(/\/+$/, '');
        const url = `${apiBase}/api/supabase/islemler`;
        
        console.log('🌐 Backend API Request:', {
            url: url,
            method: 'POST',
            payload: payload,
            payloadString: JSON.stringify(payload)
        });

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const raw = await res.text().catch(() => '');
        
        console.log('🌐 Backend API Response:', {
            status: res.status,
            statusText: res.statusText,
            headers: Object.fromEntries(res.headers.entries()),
            rawResponse: raw
        });

        if (!res.ok) {
            throw new Error(`Supabase proxy insert başarısız: ${res.status} ${raw}`);
        }

        let body = {};
        try {
            body = JSON.parse(raw);
        } catch {
            body = {};
        }
        
        console.log('🌐 Backend API Parsed Response:', {
            body: body,
            kayit: body?.kayit
        });

        return body?.kayit || null;
    }

    async supabaseInsertIslem(yeniKayit) {
        // ⏰ TIMING FIX: Ayarları güvenli şekilde al
        let ayarlar;
        try {
            if (window.tradeSettingsManager) {
                ayarlar = window.tradeSettingsManager.getSettings();
            } else {
                console.warn('⚠️ Trade settings manager not found in supabaseInsertIslem, using fallback');
                ayarlar = this.getTradeSettings();
            }
        } catch (error) {
            console.error('❌ Error getting trade settings in supabaseInsertIslem:', error);
            ayarlar = this.DEFAULT_TRADE_SETTINGS;
        }

        console.log('⏰ Timing Fix - Supabase Ayarlar alındı:', ayarlar);

        const payload = {
            symbol: yeniKayit.symbol,
            karar: yeniKayit.karar,
            long_oran: yeniKayit.longOran,
            short_oran: yeniKayit.shortOran,
            risk_skor: yeniKayit.riskSkor,
            guven: yeniKayit.guven,
            giris_fiyati: yeniKayit.girisFiyati,
            pozisyon_usdt: yeniKayit.pozisyonUsdt ?? ayarlar.pozisyon_usdt,
            kaldirac: yeniKayit.kaldirac ?? ayarlar.kaldirac,
            stop_loss: yeniKayit.stopLoss,
            take_profit_1: yeniKayit.takeProfit1,
            take_profit_2: yeniKayit.takeProfit2,
            acilis_zamani: yeniKayit.analizZamani || new Date().toISOString()
        };

        // Debug logging to track the payload being sent to database
        console.log('🚀 Supabase Payload Debug:', {
            payload: payload,
            yeniKayitPozisyonUsdt: yeniKayit.pozisyonUsdt,
            yeniKayitKaldirac: yeniKayit.kaldirac,
            ayarlarPozisyonUsdt: ayarlar.pozisyon_usdt,
            ayarlarKaldirac: ayarlar.kaldirac,
            finalPozisyonUsdt: payload.pozisyon_usdt,
            finalKaldirac: payload.kaldirac
        });

        // 🔥 PRODUCTION FIX: Her zaman direkt Supabase'e yaz (backend'i atla)
        console.log('🔥 PRODUCTION MODE: Direct Supabase connection forced');
        return this.supabaseInsertIslemDirect(payload);

        // Eski kod (backup olarak tutuluyor)
        // if (this.isGitHubPages()) {
        //     return this.supabaseInsertIslemDirect(payload);
        // }

        // // Local/Node ortamında önce backend proxy dene; yoksa direct fallback.
        // try {
        //     return await this.supabaseInsertIslemViaApi(payload);
        // } catch (proxyError) {
        //     if (this.isSupabaseConfigured()) {
        //         return this.supabaseInsertIslemDirect(payload);
        //     }
        //     throw proxyError;
        // }
    }

    // Supabase'den aktif işlemleri yükle
    async kayitlariYukle() {
        try {
            console.log('📡 Supabase\'den işlemler yükleniyor...');
            
            if (!this.supabaseClient) {
                console.warn('⚠️ Supabase client yok, boş liste dönülüyor');
                this.kayitlar = [];
                return this.kayitlar;
            }

            const { data, error } = await this.supabaseClient
                .from('islemler')
                .select('*')
                .eq('durum', 'aktif')
                .order('tarih', { ascending: false });

            if (error) {
                console.error('❌ Supabase hatası:', error);
                this.kayitlar = [];
                return this.kayitlar;
            }

            this.kayitlar = data || [];
            console.log(`✅ Aktif işlemler yüklendi: ${this.kayitlar.length} kayıt`);
            return this.kayitlar;
        } catch (error) {
            console.error('❌ İşlemler yüklenemedi:', error);
            this.kayitlar = [];
            return this.kayitlar;
        }
    }

    // İşlem Kuyruğu (Race condition önleyici)
    async enqueue(task) {
        return new Promise((resolve, reject) => {
            this.islemKuyrugu = this.islemKuyrugu.finally(async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    // Karar kaydet
    async kararKayit(symbol, sonuc, mevcutFiyat) {
        // ⏰ TIMING FIX: Ayarları güvenli şekilde al
        let ayarlar;
        try {
            if (window.tradeSettingsManager) {
                ayarlar = window.tradeSettingsManager.getSettings();
            } else {
                console.warn('⚠️ Trade settings manager not found, using fallback');
                ayarlar = this.getTradeSettings();
            }
        } catch (error) {
            console.error('❌ Error getting trade settings:', error);
            ayarlar = this.DEFAULT_TRADE_SETTINGS;
        }

        console.log('⏰ Timing Fix - Ayarlar alındı:', ayarlar);

        const yeniKayit = {
            id: Date.now() + Math.floor(Math.random() * 1000), // Çakışma önleyici
            tarih: new Date().toISOString(),
            symbol: symbol,
            karar: sonuc.karar,
            kararSinif: sonuc.kararSinif,
            longOran: sonuc.finalLongOran,
            shortOran: sonuc.finalShortOran,
            riskSkor: sonuc.riskSkor,
            guven: sonuc.guven,
            girisFiyati: mevcutFiyat,
            stopLoss: this.stopLossHesapla(sonuc.karar, mevcutFiyat),
            takeProfit1: this.takeProfitHesapla(sonuc.karar, mevcutFiyat, 1),
            takeProfit2: this.takeProfitHesapla(sonuc.karar, mevcutFiyat, 2),
            kaldirac: ayarlar.kaldirac,
            pozisyonUsdt: ayarlar.pozisyon_usdt,
            fark: sonuc.fark,
            analizZamani: sonuc.analysisTime || new Date().toISOString()
        };

        // Debug logging to track what values are being saved
        console.log('💾 Karar Kayıt Debug:', {
            symbol: symbol,
            karar: sonuc.karar,
            ayarlar: ayarlar,
            yeniKayitPozisyonUsdt: yeniKayit.pozisyonUsdt,
            yeniKayitKaldirac: yeniKayit.kaldirac,
            mevcutFiyat: mevcutFiyat
        });

        return this.enqueue(async () => {
            console.log('📡 Supabase islemler tablosuna ekleniyor...');
            const supabaseKayit = await this.supabaseInsertIslem(yeniKayit);

            // UI tarafındaki mevcut veri modelini bozmamak için lokal diziye de ekliyoruz.
            this.kayitlar.unshift(yeniKayit);

            console.log('✅ Supabase kaydı başarılı:', symbol);
            return {
                ...yeniKayit,
                supabaseId: supabaseKayit?.id,
                supabaseUuid: supabaseKayit?.uuid
            };
        });
    }

    async islemKapat(kayitId, mevcutFiyat) {
        return this.enqueue(async () => {
            console.log('📡 İşlem kapatılıyor ve JSONBin.io güncelleniyor...', kayitId);
            
            await Promise.all([this.kayitlariYukle(), this.cuzdanYukle()]);
            
            const kayit = this.kayitlar.find(k => k.id === kayitId);
            if (!kayit) throw new Error('Kayıt bulunamadı');

            const giris = kayit.girisFiyati;
            const yon = kayit.karar === 'LONG' ? 1 : -1;
            const pnlYuzde = yon * ((mevcutFiyat - giris) / giris) * 100;
            const pnlDolar = (pnlYuzde / 100) * 100;

            const kapaliKayit = {
                id: kayit.id,
                symbol: kayit.symbol,
                karar: kayit.karar,
                girisFiyati: kayit.girisFiyati,
                kapanisFiyati: mevcutFiyat,
                karZararDolar: parseFloat(pnlDolar.toFixed(2)),
                karZararYuzde: parseFloat(pnlYuzde.toFixed(2)),
                karZararYon: pnlDolar >= 0 ? 'KAR' : 'ZARAR',
                acilisTarihi: kayit.tarih,
                kapanisTarihi: new Date().toISOString()
            };

            this.kayitlar = this.kayitlar.filter(k => k.id !== kayitId);
            this.cuzdanKayitlari.unshift(kapaliKayit);

            await Promise.all([
                this.putToBin(this.BIN_ISLEM, {
                    versiyon: '1.0',
                    tarih: new Date().toISOString(),
                    kayitSayisi: this.kayitlar.length,
                    kayitlar: this.kayitlar
                }),
                this.putToBin(this.BIN_CUZDAN, {
                    versiyon: '1.0',
                    tarih: new Date().toISOString(),
                    kayitSayisi: this.cuzdanKayitlari.length,
                    kayitlar: this.cuzdanKayitlari
                })
            ]);
            
            console.log('✅ İşlem kapatıldı ve JSONBin güncellendi.');
            return kapaliKayit;
        });
    }

    // Stop Loss hesapla
    stopLossHesapla(karar, mevcutFiyat) {
        const yuzde = karar === 'LONG' ? -0.05 : 0.05;
        return mevcutFiyat * (1 + yuzde);
    }

    // Take Profit hesapla
    takeProfitHesapla(karar, mevcutFiyat, seviye) {
        const yuzde = seviye === 1 ? 0.08 : 0.15;
        const carpim = karar === 'LONG' ? (1 + yuzde) : (1 - yuzde);
        return mevcutFiyat * carpim;
    }

    // Karar geçmişini getir (aktif kayıtlar için, grafikte veya analizde kullanılıyordu)
    kararGecmisiniGetir(symbol, gunSayisi = 7) {
        const sonTarih = new Date();
        sonTarih.setDate(sonTarih.getDate() - gunSayisi);

        return this.kayitlar.filter(kayit =>
            kayit.symbol === symbol &&
            new Date(kayit.tarih) >= sonTarih
        );
    }

    // Karar analizi yap
    kararAnaliziYap(symbolOrKayitlar, mevcutFiyat = null) {
        let gecmis = [];
        if (Array.isArray(symbolOrKayitlar)) {
            // Eğer doğrudan kayıt listesi verildiyse (karar-analizi.html vs)
            gecmis = symbolOrKayitlar;
        } else if (typeof symbolOrKayitlar === 'string') {
            gecmis = this.kararGecmisiniGetir(symbolOrKayitlar, 30);
        }

        if (gecmis.length === 0) {
            return {
                basariliOran: 0,
                basariOrani: 0,
                toplamIslem: 0,
                basariliIslem: 0,
                ortalamaRisk: 0,
                enCokKarar: 'YOK',
                analiz: 'Yeterli veri yok'
            };
        }

        const toplamIslem = gecmis.length;
        let basariliIslem = 0;
        let toplamRisk = 0;
        const kararSayilari = {};

        gecmis.forEach(kayit => {
            const tp1 = kayit.takeProfit1;
            // Eger bu aktif bir işlem analiziyse (mevcutFiyat gerekli):
            if (mevcutFiyat) {
                let basarili = false;
                if (kayit.karar === 'LONG') {
                    basarili = mevcutFiyat >= tp1;
                } else if (kayit.karar === 'SHORT') {
                    basarili = mevcutFiyat <= tp1;
                }
                if (basarili) basariliIslem++;
            }
            // Kayıt zaten kapanmış bir kayıt ise kar/zarar belli (cüzdan verisiyse):
            else if (kayit.karZararDolar !== undefined) {
                if (kayit.karZararDolar > 0) basariliIslem++;
            } 
            
            toplamRisk += (kayit.riskSkor || 0);
            if (kayit.karar) {
                kararSayilari[kayit.karar] = (kararSayilari[kayit.karar] || 0) + 1;
            }
        });

        const basariOrani = (basariliIslem / toplamIslem) * 100;
        const ortalamaRisk = toplamRisk / toplamIslem;

        let enCokKarar = 'Yok';
        if (Object.keys(kararSayilari).length > 0) {
            enCokKarar = Object.keys(kararSayilari).reduce((a, b) =>
                kararSayilari[a] > kararSayilari[b] ? a : b
            );
        }

        let analiz = '';
        if (basariOrani >= 70) analiz = '🟢 Çok başarılı - strateji çalışıyor';
        else if (basariOrani >= 50) analiz = '🟡 Orta başarılı - strateji kısmen çalışıyor';
        else if (basariOrani >= 30) analiz = '🟠 Düşük başarılı - strateji gözden geçirilmeli';
        else analiz = '🔴 Başarısız - strateji değiştirilmeli';

        return {
            basariOrani: basariOrani.toFixed(1),
            basariliOran: basariOrani,
            toplamIslem,
            basariliIslem,
            ortalamaRisk,
            enCokKarar,
            kararSayilari,
            analiz,
            sonIslemler: gecmis.slice(0, 5)
        };
    }

    // Fiyat performans analizi
    fiyatPerformansAnalizi(symbol, mevcutFiyat) {
        const gecmis = this.kararGecmisiniGetir(symbol, 30);
        if (gecmis.length === 0) return null;

        let toplamKar = 0;
        let kârlıIslem = 0;
        let zararliIslem = 0;

        gecmis.forEach(kayit => {
            const giris = kayit.girisFiyati;
            let kar = 0;
            if (kayit.karar === 'LONG') kar = mevcutFiyat - giris;
            else if (kayit.karar === 'SHORT') kar = giris - mevcutFiyat;

            toplamKar += kar;
            if (kar > 0) kârlıIslem++;
            else zararliIslem++;
        });

        const karYuzdesi = (toplamKar / gecmis.length) * 100;

        return {
            toplamKar: toplamKar.toFixed(4),
            karYuzdesi: karYuzdesi.toFixed(2),
            kârlıIslem,
            zararliIslem,
            ortalamaKar: (toplamKar / gecmis.length).toFixed(4)
        };
    }

    // Tüm kayıtları getir
    tumKayitlariGetir() {
        return this.kayitlar;
    }

    // Kayıt sil
    async kayitSil(kayitId) {
        return this.enqueue(async () => {
            console.log('📡 JSONBin.io\'dan siliniyor:', kayitId);
            await this.kayitlariYukle();
            this.kayitlar = this.kayitlar.filter(k => k.id !== kayitId);
            
            const dataToSave = {
                versiyon: '1.0',
                tarih: new Date().toISOString(),
                kayitSayisi: this.kayitlar.length,
                kayitlar: this.kayitlar
            };
            
            await this.putToBin(this.BIN_ISLEM, dataToSave);
            console.log('✅ JSONBin\'den silindi');
        });
    }

    // Tüm kayıtları temizle (aktif + geçmiş)
    async tumKayitlariTemizle() {
        return this.enqueue(async () => {
            console.log('📡 JSONBin.io temizleniyor...');
            this.kayitlar = [];
            this.cuzdanKayitlari = [];

            await this.putToBin(this.BIN_ISLEM, {
                versiyon: '1.0',
                tarih: new Date().toISOString(),
                kayitSayisi: 0,
                kayitlar: []
            });

            await this.putToBin(this.BIN_CUZDAN, {
                versiyon: '1.0',
                tarih: new Date().toISOString(),
                kayitSayisi: 0,
                kayitlar: []
            });

            console.log('✅ Tüm kayıtlar temizlendi (aktif + geçmiş)');
        });
    }
}

// KESİN ÇÖZÜM TEST FONKSİYONU
async function debugFullPipeline() {
    console.log('🔍 === TAM DEBUG TEST BAŞLATILIYOR ===');
    
    // 1. Trade Settings kontrol
    console.log('1️⃣ Trade Settings Test:');
    const settings = window.tradeSettingsManager.getSettings();
    console.log('Settings:', settings);
    
    // 2. Test payload oluştur
    const testPayload = {
        symbol: 'TEST',
        karar: 'LONG',
        longOran: 50,
        shortOran: 50,
        riskSkor: 3,
        guven: 70,
        girisFiyati: 1.0,
        stopLoss: 0.95,
        takeProfit1: 1.08,
        takeProfit2: 1.15,
        kaldirac: settings.kaldirac,
        pozisyonUsdt: settings.pozisyon_usdt,
        analizZamani: new Date().toISOString()
    };
    
    console.log('2️⃣ Test Payload:', testPayload);
    
    // 3. Karar Kayıt Sistemi test
    const kararKayitSistemi = window.kararKayitSistemi;
    if (!kararKayitSistemi) {
        console.error('❌ Karar Kayıt Sistemi bulunamadı!');
        return;
    }
    
    try {
        // 4. Backend API test
        console.log('3️⃣ Backend API Test:');
        const apiResult = await kararKayitSistemi.supabaseInsertIslemViaApi(testPayload);
        console.log('Backend API Result:', apiResult);
        
        // 5. Direkt Supabase test
        console.log('4️⃣ Direct Supabase Test:');
        const directResult = await kararKayitSistemi.supabaseInsertIslemDirect(testPayload);
        console.log('Direct Supabase Result:', directResult);
        
        console.log('✅ === DEBUG TEST TAMAMLANDI ===');
        
    } catch (error) {
        console.error('❌ DEBUG TEST HATASI:', error);
    }
}

// Global instance
if (typeof window !== 'undefined') {
    window.kararKayitSistemi = new KararKayitSistemi();
    window.debugFullPipeline = debugFullPipeline;
    
    // Otomatik test
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        setTimeout(debugFullPipeline, 2000);
    }
}
