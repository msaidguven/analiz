// Karar Kayıt ve Analiz Sistemi
// Backend API üzerinden JSON dosyasına yazar/okur

class KararKayitSistemi {
    constructor() {
        this.API_URL = 'http://localhost:3000/api';
        this.kayitlar = [];
        this.maxKayitSayisi = 100;
        this.kayitlariYukle();
    }

    // API'den kayıtları yükle
    async kayitlariYukle() {
        try {
            const res = await fetch(`${this.API_URL}/kayitlar`);
            const data = await res.json();
            this.kayitlar = data.kayitlar || [];
        } catch (error) {
            console.error('Kayıtlar yüklenemedi:', error);
            this.kayitlar = [];
        }
        return this.kayitlar;
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
            const res = await fetch(`${this.API_URL}/kayitlar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(kayitData)
            });
            const result = await res.json();
            // Kayıtları yeniden yükle
            await this.kayitlariYukle();
            return result.kayit;
        } catch (error) {
            console.error('Kayıt kaydedilemedi:', error);
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
            await fetch(`${this.API_URL}/kayitlar/${kayitId}`, { method: 'DELETE' });
            await this.kayitlariYukle();
        } catch (error) {
            console.error('Kayıt silinemedi:', error);
            throw error;
        }
    }

    // Tüm kayıtları temizle
    async tumKayitlariTemizle() {
        try {
            await fetch(`${this.API_URL}/kayitlar`, { method: 'DELETE' });
            this.kayitlar = [];
        } catch (error) {
            console.error('Kayıtlar temizlenemedi:', error);
            throw error;
        }
    }
}

// Global instance
if (typeof window !== 'undefined') {
    window.kararKayitSistemi = new KararKayitSistemi();
}
