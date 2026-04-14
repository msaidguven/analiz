// Karar Kayıt ve Analiz Sistemi
// GitHub Pages için JSON dosyalarından okur, localStorage'a yazar
// Local development için API kullanır

class KararKayitSistemi {
    constructor() {
        // GitHub Pages'ta localhost olmaz, otomatik algıla
        const isLocalhost = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1' ||
                           window.location.port === '3000' ||
                           window.location.port === '5500';
        
        this.API_URL = isLocalhost ? 'http://localhost:3000/api' : null;
        this.kayitlar = [];
        this.maxKayitSayisi = 100;
        this.isGitHubPages = !isLocalhost;
        
        console.log(`📊 Karar Kayıt Sistemi başlatıldı`);
        console.log(`🌐 Mod: ${this.isGitHubPages ? 'GitHub Pages (JSON + localStorage)' : 'Local API'}`);
        
        this.kayitlariYukle();
    }

    // API'den veya JSON dosyasından kayıtları yükle
    async kayitlariYukle() {
        try {
            if (this.isGitHubPages) {
                // GitHub Pages: JSON dosyasından oku
                console.log('📂 coin_islem.json dosyası yükleniyor...');
                const response = await fetch('./coin_islem.json');
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                console.log(`✅ JSON yüklendi: ${data.kayitSayisi || 0} kayıt`);
                
                // localStorage'dan ek kayıtları al
                const localData = this.getLocalStorageData();
                
                // JSON ve localStorage verilerini birleştir
                const jsonKayitlar = data.kayitlar || [];
                const localKayitlar = localData.kayitlar || [];
                
                // localStorage'daki kayıtları JSON'a ekle (ID çakışması kontrolü ile)
                const jsonIds = new Set(jsonKayitlar.map(k => k.id));
                const uniqueLocal = localKayitlar.filter(k => !jsonIds.has(k.id));
                
                this.kayitlar = [...jsonKayitlar, ...uniqueLocal];
                console.log(`📊 Toplam: ${this.kayitlar.length} kayıt (${jsonKayitlar.length} JSON + ${uniqueLocal.length} localStorage)`);
            } else {
                // Local development: API'den oku
                console.log(`📡 API'den yükleniyor: ${this.API_URL}`);
                const res = await fetch(`${this.API_URL}/kayitlar`);
                const data = await res.json();
                this.kayitlar = data.kayitlar || [];
                console.log(`✅ API'den yüklendi: ${this.kayitlar.length} kayıt`);
            }
        } catch (error) {
            console.error('❌ Kayıtlar yüklenemedi:', error);
            console.error('Hata detayı:', error.message);
            
            // Fallback: localStorage'dan oku
            try {
                const localData = this.getLocalStorageData();
                this.kayitlar = localData.kayitlar || [];
                console.log(`💾 localStorage'dan kurtarıldı: ${this.kayitlar.length} kayıt`);
            } catch (localError) {
                console.error('💾 localStorage da okunamadı:', localError);
                this.kayitlar = [];
            }
        }
        return this.kayitlar;
    }

    // localStorage'dan veri oku
    getLocalStorageData() {
        try {
            const data = localStorage.getItem('karar_kayitlari');
            return data ? JSON.parse(data) : { kayitlar: [] };
        } catch (error) {
            console.error('localStorage okunamadı:', error);
            return { kayitlar: [] };
        }
    }

    // localStorage'a veri yaz
    saveLocalStorageData(kayitlar) {
        try {
            const data = {
                versiyon: '1.0',
                tarih: new Date().toISOString(),
                kayitSayisi: kayitlar.length,
                kayitlar: kayitlar
            };
            localStorage.setItem('karar_kayitlari', JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('localStorage yazılamadı:', error);
            return false;
        }
    }

    // Karar kaydet
    async kararKayit(symbol, sonuc, mevcutFiyat) {
        const kayitData = {
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

        try {
            if (this.isGitHubPages) {
                // GitHub Pages: localStorage'a kaydet
                console.log('💾 localStorage\'a kaydediliyor...');
                const yeniKayit = {
                    id: Date.now(),
                    tarih: new Date().toISOString(),
                    ...kayitData
                };
                
                this.kayitlar.unshift(yeniKayit);
                const saved = this.saveLocalStorageData(this.kayitlar);
                
                if (saved) {
                    console.log('✅ localStorage\'a kaydedildi:', yeniKayit.symbol);
                    return yeniKayit;
                } else {
                    throw new Error('localStorage kaydedilemedi');
                }
            } else {
                // Local development: API'ye kaydet
                console.log('📡 API\'ye kaydediliyor...');
                const res = await fetch(`${this.API_URL}/kayitlar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(kayitData)
                });
                const result = await res.json();
                // Kayıtları yeniden yükle
                await this.kayitlariYukle();
                return result.kayit;
            }
        } catch (error) {
            console.error('❌ Kayıt kaydedilemedi:', error);
            throw error;
        }
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

    // Karar geçmişini getir
    kararGecmisiniGetir(symbol, gunSayisi = 7) {
        const sonTarih = new Date();
        sonTarih.setDate(sonTarih.getDate() - gunSayisi);

        return this.kayitlar.filter(kayit =>
            kayit.symbol === symbol &&
            new Date(kayit.tarih) >= sonTarih
        );
    }

    // Karar analizi yap
    kararAnaliziYap(symbol, mevcutFiyat) {
        const gecmis = this.kararGecmisiniGetir(symbol, 30);

        if (gecmis.length === 0) {
            return {
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
            const sl = kayit.stopLoss;

            let basarili = false;
            if (kayit.karar === 'LONG') {
                basarili = mevcutFiyat >= tp1;
            } else if (kayit.karar === 'SHORT') {
                basarili = mevcutFiyat <= tp1;
            }

            if (basarili) basariliIslem++;
            toplamRisk += kayit.riskSkor;
            kararSayilari[kayit.karar] = (kararSayilari[kayit.karar] || 0) + 1;
        });

        const basariOrani = (basariliIslem / toplamIslem) * 100;
        const ortalamaRisk = toplamRisk / toplamIslem;

        const enCokKarar = Object.keys(kararSayilari).reduce((a, b) =>
            kararSayilari[a] > kararSayilari[b] ? a : b
        );

        let analiz = '';
        if (basariOrani >= 70) analiz = '🟢 Çok başarılı - strateji çalışıyor';
        else if (basariOrani >= 50) analiz = '🟡 Orta başarılı - strateji kısmen çalışıyor';
        else if (basariOrani >= 30) analiz = '🟠 Düşük başarılı - strateji gözden geçirilmeli';
        else analiz = '🔴 Başarısız - strateji değiştirilmeli';

        return {
            basariOrani: basariOrani.toFixed(1),
            toplamIslem,
            basariliIslem,
            ortalamaRisk: ortalamaRisk.toFixed(1),
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
        try {
            if (this.isGitHubPages) {
                // GitHub Pages: localStorage'dan sil
                console.log('💾 localStorage\'dan siliniyor:', kayitId);
                this.kayitlar = this.kayitlar.filter(k => k.id !== kayitId);
                this.saveLocalStorageData(this.kayitlar);
                console.log('✅ localStorage\'dan silindi');
            } else {
                // Local development: API'den sil
                console.log('📡 API\'den siliniyor:', kayitId);
                await fetch(`${this.API_URL}/kayitlar/${kayitId}`, { method: 'DELETE' });
                await this.kayitlariYukle();
            }
        } catch (error) {
            console.error('❌ Kayıt silinemedi:', error);
            throw error;
        }
    }

    // Tüm kayıtları temizle
    async tumKayitlariTemizle() {
        try {
            if (this.isGitHubPages) {
                // GitHub Pages: localStorage'ı temizle
                console.log('💾 localStorage temizleniyor...');
                this.kayitlar = [];
                localStorage.removeItem('karar_kayitlari');
                console.log('✅ localStorage temizlendi');
            } else {
                // Local development: API'den temizle
                console.log('📡 API\'den temizleniyor...');
                await fetch(`${this.API_URL}/kayitlar`, { method: 'DELETE' });
                this.kayitlar = [];
            }
        } catch (error) {
            console.error('❌ Kayıtlar temizlenemedi:', error);
            throw error;
        }
    }
}

// Global instance
if (typeof window !== 'undefined') {
    window.kararKayitSistemi = new KararKayitSistemi();
}
