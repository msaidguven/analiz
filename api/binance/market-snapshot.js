let cache = {
  ts: 0,
  data: null,
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now = Date.now();
  const ttlMs = 15000;
  if (cache.data && now - cache.ts < ttlMs) {
    return res.status(200).json({ ...cache.data, cached: true });
  }

  try {
    const base = 'https://fapi.binance.com';
    const [exchangeRes, tickerRes, premiumRes] = await Promise.all([
      fetch(`${base}/fapi/v1/exchangeInfo`),
      fetch(`${base}/fapi/v1/ticker/24hr`),
      fetch(`${base}/fapi/v1/premiumIndex`),
    ]);

    const [exchangeData, tickerData, premiumData] = await Promise.all([
      exchangeRes.json(),
      tickerRes.json(),
      premiumRes.json(),
    ]);

    if (!Array.isArray(exchangeData?.symbols)) {
      return res.status(502).json({
        error: 'Binance exchangeInfo verisi geçersiz',
        detail: exchangeData?.msg || exchangeData?.message || '',
      });
    }

    if (!Array.isArray(tickerData)) {
      return res.status(502).json({
        error: 'Binance ticker verisi geçersiz',
        detail: tickerData?.msg || tickerData?.message || '',
      });
    }

    const payload = { exchangeData, tickerData, premiumData };
    cache = { ts: now, data: payload };
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      error: 'Binance snapshot proxy hatası',
      detail: error?.message || 'Unknown error',
    });
  }
};
