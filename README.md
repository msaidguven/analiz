# Binance Futures Analiz Sistemi

Binance'de listelenen futures coinleri görüntüleyin, analiz edin ve kararlarınızı kaydedin.

## Kurulum

```bash
npm install
```

## Supabase Ayarı

`Kaydet` işlemi artık backend proxy ile Supabase'e gider.

1) `.env` dosyasına ekleyin:

```env
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

2) İsterseniz `config.js` dosyasındaki alanları da doldurabilirsiniz (zorunlu değil):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Not: `service_role` key sadece backend `.env` içinde olmalı, frontend dosyalarına koymayın.

## Çalıştırma

```bash
npm start
```

Sunucu `http://localhost:3000` adresinde çalışacaktır.

## Özellikler

- **Coin Listesi**: Binance futures coinleri (sadece TRADING durumu)
- **Coin Kaydet**: Analiz sonuçlarını `coin_islem.json` dosyasına kaydeder
- **Karar Analizi**: Kayıtlı coinleri görüntüleyin, silin, performanslarını takip edin
- **Dışa/İçe Aktarma**: JSON dosyası olarak yedekleme

## API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/kayitlar` | Tüm kayıtları getir |
| POST | `/api/kayitlar` | Yeni kayıt ekle |
| DELETE | `/api/kayitlar/:id` | Kayıt sil |
| DELETE | `/api/kayitlar` | Tüm kayıtları sil |

## Dosya Yapısı

- `index.html` - Ana sayfa
- `karar-analizi.html` - Kayıtlı coin analizi
- `coin_islem.json` - Veri dosyası (otomatik güncellenir)
- `server.js` - Backend API
