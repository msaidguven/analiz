const crypto = require('crypto');

const BINANCE_BASE = 'https://api.binance.com';
const TESTNET_BASE = 'https://testnet.binancefuture.com';

function sign(secret, queryString) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.BINANCE_API_KEY;
  const secret = process.env.BINANCE_SECRET_KEY;
  const useTestnet = process.env.BINANCE_TESTNET === 'true';
  const base = useTestnet ? TESTNET_BASE : BINANCE_BASE;

  if (!apiKey || !secret) {
    return res.status(500).json({ error: 'API key veya secret tanımlı değil. Vercel environment variables kontrol edin.' });
  }

  try {
    let { path, method = 'GET', ...bodyParams } = req.method === 'POST'
      ? req.body
      : req.query;

    if (!path) return res.status(400).json({ error: 'path parametresi gerekli.' });

    const params = { ...bodyParams, timestamp: Date.now(), recvWindow: 5000 };
    const qs = new URLSearchParams(params).toString();
    const signature = sign(secret, qs);
    const fullQs = qs + '&signature=' + signature;

    const fetchMethod = (method || 'GET').toUpperCase();
    const url = base + path + (fetchMethod === 'POST' ? '' : '?' + fullQs);

    const fetchOptions = {
      method: fetchMethod,
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    if (fetchMethod === 'POST') fetchOptions.body = fullQs;
    if (fetchMethod === 'DELETE') fetchOptions.url = base + path + '?' + fullQs;

    const response = await fetch(fetchMethod === 'DELETE' ? base + path + '?' + fullQs : url, fetchOptions);
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};