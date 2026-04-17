// Karar Kayıt ve Analiz Sistemi
// Tamamen JSONBin.io API (Frontend) üzerinden çalışır
// GitHub Pages uyumlu

class KararKayitSistemi {
    constructor() {
        this.SUPABASE_URL = (window.SUPABASE_URL || localStorage.getItem('SUPABASE_URL') || '').replace(/\/+$/, '');
        this.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || localStorage.getItem('SUPABASE_ANON_KEY') || '';

        this.JSONBIN_API_KEY = '$2a$10$QktBwuRvzkwJz80digmRQeloC2dYzzK7gpR2GgV3t1nFXY/AUIgaW';
        this.BIN_ISLEM = '69deaf66aaba882197fc8e6f';
        this.BIN_CUZDAN = '69deb11c856a6821893456df';
        this.JSONBIN_BASE_URL = 'https://api.jsonbin.io/v3/b';
        
        this.kayitlar = [];
        this.cuzdanKayitlari = [];
        this.islemKuyrugu = Promise.resolve();
        
        console.log(`📊 Karar Kayıt Sistemi başlatıldı (JSONBin.io Modu)`);
        
        this.kayitlariYukle();
    }

    isSupabaseConfigured() {
        const hasUrl = Boolean(this.SUPABASE_URL && !this.SUPABASE_URL.includes('YOUR_PROJECT_ID'));
        const hasKey = Boolean(this.SUPABASE_ANON_KEY && !this.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY'));
        return hasUrl && hasKey;
    }

    async supabaseInsertIslem(yeniKayit) {
        if (!this.isSupabaseConfigured()) {
            throw new Error('Supabase URL/ANON KEY eksik');
        }

        const payload = {
            symbol: yeniKayit.symbol,
            karar: yeniKayit.karar,
            long_oran: yeniKayit.longOran,
            short_oran: yeniKayit.shortOran,
            risk_skor: yeniKayit.riskSkor,
            guven: yeniKayit.guven,
            giris_fiyati: yeniKayit.girisFiyati,
            stop_loss: yeniKayit.stopLoss,
            take_profit_1: yeniKayit.takeProfit1,
            take_profit_2: yeniKayit.takeProfit2,
            acilis_zamani: yeniKayit.analizZamani || new Date().toISOString()
        };

        const res = await fetch(`${this.SUPABASE_URL}/rest/v1/islemler`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': this.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${this.SUPABASE_ANON_KEY}`,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text().catch(() => 'Bilinmeyen Supabase hatası');
            throw new Error(`Supabase insert başarısız: ${res.status} ${errorText}`);
        }

        const rows = await res.json();
        return Array.isArray(rows) && rows[0] ? rows[0] : null;
    }

    // JSONBin İşlem Kuyruğu (Race condition önleyici)
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

    // JSONBin'den Fetch Data Yardımcı Fonksiyonu
    async fetchFromBin(binId) {
        try {
            const res = await fetch(`${this.JSONBIN_BASE_URL}/${binId}/latest`, {
                method: 'GET',
                headers: {
                    'X-Access-Key': this.JSONBIN_API_KEY
                }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const data = await res.json();
            // JSONBin V3 format: { record: { ... } }
            return data.record || { kayitlar: [] };
        } catch (error) {
            console.error(`❌ JSONBin'den veri çekilemedi (Bin: ${binId}):`, error);
            // Fallback to local storage on read error so UI doesn't crash completely
            const localData = localStorage.getItem(`bin_${binId}`);
            return localData ? JSON.parse(localData) : { kayitlar: [] };
        }
    }

    // JSONBin'e Data Güncelleme Yardımcı Fonksiyonu
    async putToBin(binId, data) {
        try {
            // Optimistic update of local cache
            localStorage.setItem(`bin_${binId}`, JSON.stringify(data));
            
            const res = await fetch(`${this.JSONBIN_BASE_URL}/${binId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Access-Key': this.JSONBIN_API_KEY
                },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            return true;
        } catch (error) {
            console.error(`❌ JSONBin'e veri yazılamadı (Bin: ${binId}):`, error);
            // Can be queued for retry here, but basic error management for now
            return false;
        }
    }

    // JSONBin'den aktif işlemleri yükle
    async kayitlariYukle() {
        console.log('📡 JSONBin.io coin_islem okunuyor...');
        const data = await this.fetchFromBin(this.BIN_ISLEM);
        this.kayitlar = data.kayitlar || [];
        console.log(`✅ Aktif işlemler yüklendi: ${this.kayitlar.length} kayıt`);
        return this.kayitlar;
    }

    // JSONBin'den cüzdan geçmişini yükle
    async cuzdanYukle() {
        console.log('📡 JSONBin.io coin_cuzdan okunuyor...');
        const data = await this.fetchFromBin(this.BIN_CUZDAN);
        this.cuzdanKayitlari = data.kayitlar || [];
        console.log(`✅ Cüzdan geçmişi yüklendi: ${this.cuzdanKayitlari.length} kayıt`);
        return this.cuzdanKayitlari;
    }

    // Karar kaydet
    async kararKayit(symbol, sonuc, mevcutFiyat) {
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
            fark: sonuc.fark,
            analizZamani: sonuc.analysisTime || new Date().toISOString()
        };

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

// Global instance
if (typeof window !== 'undefined') {
    window.kararKayitSistemi = new KararKayitSistemi();
}
