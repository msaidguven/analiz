module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const base = 'https://fapi.binance.com';
  let symbol = String(req.query.symbol || '').toUpperCase().trim();
  if (!symbol) {
    return res.status(400).json({ error: 'symbol zorunlu' });
  }
  if (!symbol.endsWith('USDT')) symbol += 'USDT';

  try {
    const ticker = await fetch(`${base}/fapi/v1/ticker/24hr?symbol=${symbol}`).then(r => r.json()).catch(() => null);

    let oiCurrent = null;
    let oiHist = null;
    try {
      oiCurrent = await fetch(`${base}/fapi/v1/openInterest?symbol=${symbol}`).then(r => r.json());
      oiHist = await fetch(`${base}/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=2`).then(r => r.json());
    } catch (_) {
      oiCurrent = null;
      oiHist = null;
    }

    const lsRaw = await fetch(`${base}/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`).then(r => r.json()).catch(() => null);
    const fundingRaw = await fetch(`${base}/fapi/v1/fundingRate?symbol=${symbol}&limit=8`).then(r => r.json()).catch(() => []);
    const liqRaw = await fetch(`${base}/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=5m&limit=1`).then(r => r.json()).catch(() => null);

    const [klines1d, klines4h, klines15m, klines1h, klines1w, klines15m_long] = await Promise.all([
      fetch(`${base}/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=100`).then(r => r.json()).catch(() => []),
      fetch(`${base}/fapi/v1/klines?symbol=${symbol}&interval=4h&limit=100`).then(r => r.json()).catch(() => []),
      fetch(`${base}/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=100`).then(r => r.json()).catch(() => []),
      fetch(`${base}/fapi/v1/klines?symbol=${symbol}&interval=1h&limit=100`).then(r => r.json()).catch(() => []),
      fetch(`${base}/fapi/v1/klines?symbol=${symbol}&interval=1w&limit=50`).then(r => r.json()).catch(() => []),
      fetch(`${base}/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=2`).then(r => r.json()).catch(() => []),
    ]);

    if (!ticker || ticker.code) {
      return res.status(502).json({
        error: 'Coin verisi alınamadı',
        detail: ticker?.msg || ticker?.message || `Coin bulunamadı: ${symbol}`
      });
    }

    return res.status(200).json({
      symbol,
      ticker,
      oiCurrent,
      oiHist,
      lsRaw,
      fundingRaw,
      liqRaw,
      klines1d,
      klines4h,
      klines15m,
      klines1h,
      klines1w,
      klines15m_long
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Analiz verisi backendden alınamadı',
      detail: error?.message || 'Unknown error'
    });
  }
};
