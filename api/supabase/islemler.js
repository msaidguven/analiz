module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  const apiKey = serviceRoleKey || anonKey;

  if (!supabaseUrl || !apiKey) {
    return res.status(500).json({
      error: 'SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (veya SUPABASE_ANON_KEY) tanımlı olmalı',
    });
  }

  const payload = {
    symbol: req.body?.symbol,
    karar: req.body?.karar,
    long_oran: req.body?.long_oran,
    short_oran: req.body?.short_oran,
    risk_skor: req.body?.risk_skor,
    guven: req.body?.guven,
    giris_fiyati: req.body?.giris_fiyati,
    stop_loss: req.body?.stop_loss,
    take_profit_1: req.body?.take_profit_1,
    take_profit_2: req.body?.take_profit_2,
    acilis_zamani: req.body?.acilis_zamani,
  };

  try {
    const headers = {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Prefer: 'return=representation',
    };

    if (apiKey.split('.').length === 3) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/islemler`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({
        error: `Supabase insert hatası: ${response.status}`,
        detail: raw,
      });
    }

    let data = [];
    try {
      data = JSON.parse(raw);
    } catch {
      data = [];
    }

    return res.status(200).json({
      success: true,
      kayit: Array.isArray(data) && data[0] ? data[0] : null,
      authMode: serviceRoleKey ? 'service_role' : 'anon',
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Supabase proxy isteği sırasında sunucu hatası',
      detail: error?.message || 'Unknown error',
    });
  }
};
