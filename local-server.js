const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = path.join(__dirname, 'coin_islem.json');
const CUZDAN_FILE = path.join(__dirname, 'coin_cuzdan.json');
const ENV_FILE = path.join(__dirname, '.env');

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIndex = line.indexOf('=');
        if (eqIndex <= 0) continue;
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && !process.env[key]) {
            process.env[key] = value;
        }
    }
}

loadEnvFile(ENV_FILE);

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const marketSnapshotCache = {
    ts: 0,
    data: null
};

function getSupabaseConfig() {
    const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
    const apiKey = serviceRoleKey || anonKey;
    return { supabaseUrl, serviceRoleKey, anonKey, apiKey };
}

function getCoinMarketCapConfig() {
    const apiKey = (process.env.CMC_API_KEY || process.env.COINMARKETCAP_API_KEY || '').trim();
    return { apiKey };
}

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

// Anasayfa "Kaydet" için Supabase insert proxy
app.post('/api/supabase/islemler', async (req, res) => {
    const { supabaseUrl, apiKey, serviceRoleKey } = getSupabaseConfig();
    if (!supabaseUrl || !apiKey) {
        return res.status(500).json({
            error: 'SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (veya SUPABASE_ANON_KEY) .env içinde tanımlı olmalı'
        });
    }

    const payload = {
        symbol: req.body.symbol,
        karar: req.body.karar,
        long_oran: req.body.long_oran,
        short_oran: req.body.short_oran,
        risk_skor: req.body.risk_skor,
        guven: req.body.guven,
        giris_fiyati: req.body.giris_fiyati,
        pozisyon_usdt: req.body.pozisyon_usdt,
        kaldirac: req.body.kaldirac,
        stop_loss: req.body.stop_loss,
        take_profit_1: req.body.take_profit_1,
        take_profit_2: req.body.take_profit_2,
        acilis_zamani: req.body.acilis_zamani
    };

    try {
        const headers = {
            'Content-Type': 'application/json',
            'apikey': apiKey,
            'Prefer': 'return=representation'
        };

        // service_role / anon JWT formatındaysa Authorization header eklenir.
        if (apiKey.split('.').length === 3) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${supabaseUrl}/rest/v1/islemler`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const raw = await response.text();
        if (!response.ok) {
            return res.status(response.status).json({
                error: `Supabase insert hatası: ${response.status}`,
                detail: raw
            });
        }

        let data = [];
        try {
            data = JSON.parse(raw);
        } catch {
            data = [];
        }

        return res.json({
            success: true,
            kayit: Array.isArray(data) && data[0] ? data[0] : null,
            authMode: serviceRoleKey ? 'service_role' : 'anon'
        });
    } catch (error) {
        return res.status(500).json({
            error: 'Supabase proxy isteği sırasında sunucu hatası',
            detail: error.message
        });
    }
});

// Binance market snapshot proxy + kısa cache
app.get('/api/binance/market-snapshot', async (req, res) => {
    const now = Date.now();
    const ttlMs = 15 * 1000;
    if (marketSnapshotCache.data && (now - marketSnapshotCache.ts) < ttlMs) {
        return res.json({ ...marketSnapshotCache.data, cached: true });
    }

    try {
        const BASE_F = 'https://fapi.binance.com';
        const [exchangeRes, tickerRes, premiumRes] = await Promise.all([
            fetch(`${BASE_F}/fapi/v1/exchangeInfo`),
            fetch(`${BASE_F}/fapi/v1/ticker/24hr`),
            fetch(`${BASE_F}/fapi/v1/premiumIndex`)
        ]);

        const [exchangeData, tickerData, premiumData] = await Promise.all([
            exchangeRes.json(),
            tickerRes.json(),
            premiumRes.json()
        ]);

        if (!Array.isArray(exchangeData?.symbols)) {
            return res.status(502).json({
                error: 'Binance exchangeInfo verisi geçersiz',
                detail: exchangeData?.msg || exchangeData?.message || ''
            });
        }
        if (!Array.isArray(tickerData)) {
            return res.status(502).json({
                error: 'Binance ticker verisi geçersiz',
                detail: tickerData?.msg || tickerData?.message || ''
            });
        }

        const payload = { exchangeData, tickerData, premiumData };
        marketSnapshotCache.ts = now;
        marketSnapshotCache.data = payload;

        return res.json(payload);
    } catch (error) {
        return res.status(500).json({
            error: 'Binance snapshot proxy hatası',
            detail: error.message
        });
    }
});

// CoinMarketCap market cap proxy (API key server tarafında kalır)
app.get('/api/marketcap/cmc', async (req, res) => {
    const { apiKey } = getCoinMarketCapConfig();
    if (!apiKey) {
        return res.status(500).json({
            error: 'CMC_API_KEY (veya COINMARKETCAP_API_KEY) .env içinde tanımlı olmalı'
        });
    }

    try {
        const symbolsRaw = String(req.query.symbols || '').trim();
        const limitRaw = Number(req.query.limit) || 500;

        // symbols verilirse Quotes Latest endpoint, verilmezse Listings Latest endpoint
        let url = '';
        if (symbolsRaw) {
            url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbolsRaw)}&convert=USD`;
        } else {
            const limit = Math.max(1, Math.min(limitRaw, 5000));
            url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?convert=USD&limit=${limit}`;
        }

        const response = await fetch(url, {
            headers: { 'X-CMC_PRO_API_KEY': apiKey }
        });
        const raw = await response.text();
        if (!response.ok) {
            return res.status(response.status).json({
                error: `CoinMarketCap hatası: ${response.status}`,
                detail: raw
            });
        }

        let parsed = {};
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = {};
        }

        return res.json(parsed);
    } catch (error) {
        return res.status(500).json({
            error: 'CMC proxy isteği sırasında sunucu hatası',
            detail: error.message
        });
    }
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
