// Karar Kayıt ve Analiz Sistemi
// Tüm kararları kaydeder ve geçmişle karşılaştırır

class KararKayitSistemi {
    constructor() {
        this.kayitlar = this.kayitlariYukle();
        this.maxKayitSayisi = 100;
    }

    // Karar kaydet
    kararKayit(symbol, sonuc, mevcutFiyat) {
        const kayit = {
            id: Date.now(),
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

        this.kayitlar.unshift(kayit);
        
        // Maksimum kayıt sayısını koru
        if (this.kayitlar.length > this.maxKayitSayisi) {
            this.kayitlar = this.kayitlar.slice(0, this.maxKayitSayisi);
        }

        this.kayitlariKaydet();
        return kayit;
    }

    // Stop Loss hesapla
    stopLossHesapla(karar, mevcutFiyat) {
        const yuzde = karar === 'LONG' ? -0.05 : 0.05; // %5 SL
        return mevcutFiyat * (1 + yuzde);
    }

    // Take Profit hesapla
    takeProfitHesapla(karar, mevcutFiyat, seviye) {
        const yuzde = seviye === 1 ? 0.08 : 0.15; // TP1: %8, TP2: %15
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
        const gecmis = this.kararGecmisiniGetir(symbol, 30); // Son 30 gün
        
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
            // Başarı kontrolü (TP'ye ulaştı mı?)
            const tp1 = kayit.takeProfit1;
            const tp2 = kayit.takeProfit2;
            const sl = kayit.stopLoss;
            const giris = kayit.girisFiyati;
            
            // Mevcut fiyatla karşılaştır
            let basarili = false;
            if (kayit.karar === 'LONG') {
                basarili = mevcutFiyat >= tp1; // TP1'e ulaştı
            } else if (kayit.karar === 'SHORT') {
                basarili = mevcutFiyat <= tp1; // TP1'e ulaştı
            }
            
            if (basarili) basariliIslem++;
            
            toplamRisk += kayit.riskSkor;
            kararSayilari[kayit.karar] = (kararSayilari[kayit.karar] || 0) + 1;
        });

        const basariOrani = (basariliIslem / toplamIslem) * 100;
        const ortalamaRisk = toplamRisk / toplamIslem;
        
        // En çok verilen karar
        const enCokKarar = Object.keys(kararSayilari).reduce((a, b) => 
            kararSayilari[a] > kararSayilari[b] ? a : b
        );

        let analiz = '';
        if (basariOrani >= 70) {
            analiz = '🟢 Çok başarılı - strateji çalışıyor';
        } else if (basariOrani >= 50) {
            analiz = '🟡 Orta başarılı - strateji kısmen çalışıyor';
        } else if (basariOrani >= 30) {
            analiz = '🟠 Düşük başarılı - strateji gözden geçirilmeli';
        } else {
            analiz = '🔴 Başarısız - strateji değiştirilmeli';
        }

        return {
            basariOrani: basariOrani.toFixed(1),
            toplamIslem,
            basariliIslem,
            ortalamaRisk: ortalamaRisk.toFixed(1),
            enCokKarar,
            kararSayilari,
            analiz,
            sonIslemler: gecmis.slice(0, 5) // Son 5 işlem
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
            const tp1 = kayit.takeProfit1;
            const sl = kayit.stopLoss;
            
            let kar = 0;
            if (kayit.karar === 'LONG') {
                kar = mevcutFiyat - giris;
            } else if (kayit.karar === 'SHORT') {
                kar = giris - mevcutFiyat;
            }
            
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

    // Kayıtları localStorage'a kaydet
    kayitlariKaydet() {
        try {
            localStorage.setItem('kararKayitlari', JSON.stringify(this.kayitlar));
        } catch (error) {
            console.error('Kayıtlar kaydedilemedi:', error);
        }
    }

    // Kayıtları localStorage'dan yükle
    kayitlariYukle() {
        try {
            const kayitlar = localStorage.getItem('kararKayitlari');
            return kayitlar ? JSON.parse(kayitlar) : [];
        } catch (error) {
            console.error('Kayıtlar yüklenemedi:', error);
            return [];
        }
    }

    // Tüm kayıtları getir
    tumKayitlariGetir() {
        return this.kayitlar;
    }

    // Kayıt sil
    kayitSil(kayitId) {
        this.kayitlar = this.kayitlar.filter(kayit => kayit.id !== kayitId);
        this.kayitlariKaydet();
    }

    // Tüm kayıtları temizle
    tumKayitlariTemizle() {
        this.kayitlar = [];
        this.kayitlariKaydet();
    }
}

// Global instance
if (typeof window !== 'undefined') {
    window.kararKayitSistemi = new KararKayitSistemi();
}
