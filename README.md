# Binance Futures Analiz Sistemi

Binance'de listelenen futures coinleri görüntüleyin, analiz edin ve kararlarınızı kaydedin.

## Kurulum

```bash
npm install
```

## Supabase Ayarı

`config.js` dosyasındaki alanları doldurun:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Not: Sadece `anon` key kullanın, `service_role` key'i frontend tarafına koymayın.

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
