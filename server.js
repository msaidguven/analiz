const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'coin_islem.json');
const CUZDAN_FILE = path.join(__dirname, 'coin_cuzdan.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Veritabanını oku
function readDB(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return { versiyon: '1.0', tarih: new Date().toISOString(), kayitSayisi: 0, kayitlar: [] };
    }
}

// Veritabanına yaz
function writeDB(filePath, data) {
    data.tarih = new Date().toISOString();
    data.kayitSayisi = data.kayitlar.length;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// TÜM kayıtları getir
app.get('/api/kayitlar', (req, res) => {
    res.json(readDB(DB_FILE));
});

// Cüzdan geçmişini getir
app.get('/api/cuzdan', (req, res) => {
    res.json(readDB(CUZDAN_FILE));
});

// Yeni kayıt ekle
app.post('/api/kayitlar', (req, res) => {
    const db = readDB(DB_FILE);
    const yeniKayit = {
        id: Date.now(),
        tarih: new Date().toISOString(),
        ...req.body
    };
    db.kayitlar.unshift(yeniKayit);
    writeDB(DB_FILE, db);
    res.json({ success: true, kayit: yeniKayit });
});

// Kayıt sil
app.delete('/api/kayitlar/:id', (req, res) => {
    const db = readDB(DB_FILE);
    const id = Number(req.params.id);
    db.kayitlar = db.kayitlar.filter(k => k.id !== id);
    writeDB(DB_FILE, db);
    res.json({ success: true });
});

// İşlem kapat -> coin_islem.json'dan sil, coin_cuzdan.json'a ekle
app.post('/api/kayitlar/:id/kapat', (req, res) => {
    const aktifDB = readDB(DB_FILE);
    const cuzdanDB = readDB(CUZDAN_FILE);
    const id = Number(req.params.id);
    const { mevcutFiyat } = req.body;

    const kayit = aktifDB.kayitlar.find(k => k.id === id);
    if (!kayit) {
        return res.status(404).json({ error: 'Kayıt bulunamadı' });
    }

    // Kar/Zarar hesapla
    const giris = kayit.girisFiyati;
    const yon = kayit.karar === 'LONG' ? 1 : -1;
    const pnlYuzde = yon * ((mevcutFiyat - giris) / giris) * 100;
    const pnlDolar = (pnlYuzde / 100) * 100; // $100 pozisyon

    // Cüzdana ekle
    const kapaliKayit = {
        id: kayit.id,
        symbol: kayit.symbol,
        karar: kayit.karar, // LONG veya SHORT
        girisFiyati: kayit.girisFiyati,
        kapanisFiyati: mevcutFiyat,
        karZararDolar: parseFloat(pnlDolar.toFixed(2)),
        karZararYuzde: parseFloat(pnlYuzde.toFixed(2)),
        karZararYon: pnlDolar >= 0 ? 'KAR' : 'ZARAR',
        acilisTarihi: kayit.tarih,
        kapanisTarihi: new Date().toISOString()
    };

    cuzdanDB.kayitlar.unshift(kapaliKayit);
    writeDB(CUZDAN_FILE, cuzdanDB);

    // Aktif işlemlerden sil
    aktifDB.kayitlar = aktifDB.kayitlar.filter(k => k.id !== id);
    writeDB(DB_FILE, aktifDB);

    res.json({ success: true, kapaliKayit });
});

// Tüm kayıtları temizle
app.delete('/api/kayitlar', (req, res) => {
    const db = { versiyon: '1.0', tarih: new Date().toISOString(), kayitSayisi: 0, kayitlar: [] };
    writeDB(DB_FILE, db);
    res.json({ success: true });
});

// Cüzdanı temizle
app.delete('/api/cuzdan', (req, res) => {
    const db = { versiyon: '1.0', tarih: new Date().toISOString(), kayitSayisi: 0, kayitlar: [] };
    writeDB(CUZDAN_FILE, db);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`✅ API çalışıyor: http://localhost:${PORT}`);
});
