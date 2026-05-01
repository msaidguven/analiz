module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = (process.env.CMC_API_KEY || process.env.COINMARKETCAP_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({
      error: 'CMC_API_KEY (veya COINMARKETCAP_API_KEY) tanımlı olmalı',
    });
  }

  try {
    const symbolsRaw = String(req.query.symbols || '').trim();
    const limitRaw = Number(req.query.limit) || 500;

    let url = '';
    if (symbolsRaw) {
      url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbolsRaw)}&convert=USD`;
    } else {
      const limit = Math.max(1, Math.min(limitRaw, 5000));
      url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?convert=USD&limit=${limit}`;
    }

    const response = await fetch(url, {
      headers: { 'X-CMC_PRO_API_KEY': apiKey },
    });

    const raw = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({
        error: `CoinMarketCap hatası: ${response.status}`,
        detail: raw,
      });
    }

    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({
      error: 'CMC proxy isteği sırasında sunucu hatası',
      detail: error?.message || 'Unknown error',
    });
  }
};
