import { state } from '../state.js';
import { formatPrice } from '../config.js';
import { buildOutput } from '../output.js';

export async function fetchAndRenderATH(symbol, price) {
  try {
    // Haftalık kline ile geniş tarihsel veri — Binance max 1000 mum
    // 1W × 1000 = ~19 yıl, yeterli
    const [weeklyRes, monthlyRes] = await Promise.allSettled([
      fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1w&limit=1000`).then(r=>r.json()),
      fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1M&limit=200`).then(r=>r.json()),
    ]);

    // En geniş veriyi kullan
    let klines = null;
    let source  = '';
    if (weeklyRes.status === 'fulfilled' && weeklyRes.value.length > 0) {
      klines = weeklyRes.value; source = `1H × ${weeklyRes.value.length} hafta`;
    }
    if (monthlyRes.status === 'fulfilled' && monthlyRes.value.length > 0) {
      // Aylıktan daha fazla veri varsa tercih et
      if (!klines || monthlyRes.value.length * 4 > klines.length) {
        klines = monthlyRes.value; source = `1M × ${monthlyRes.value.length} ay`;
      }
    }

    if (!klines || klines.length === 0) throw new Error('Kline verisi boş');

    const highs  = klines.map(k => parseFloat(k[2]));
    const lows   = klines.map(k => parseFloat(k[3]));

    const ath    = Math.max(...highs);
    const atl    = Math.min(...lows);

    // ATH ve ATL'nin hangi mumda olduğu
    const athIdx = highs.indexOf(ath);
    const atlIdx = lows.indexOf(atl);

    // Tarih bilgisi (mum açılış zamanı)
    const athDate = new Date(klines[athIdx][0]).toLocaleDateString('tr-TR', { year:'numeric', month:'short' });
    const atlDate = new Date(klines[atlIdx][0]).toLocaleDateString('tr-TR', { year:'numeric', month:'short' });

    // Uzaklık yüzdeleri
    const athDist = ((ath - price) / price * 100);   // ATH yukarıda → pozitif
    const atlDist = ((price - atl) / price * 100);   // ATL aşağıda → pozitif

    // Fiyatın ATL-ATH aralığındaki konumu (0-1)
    const range   = ath - atl;
    const pos     = range > 0 ? (price - atl) / range : 0.5; // 0=ATL, 1=ATH

    state.athData = { ath, atl, athDist, atlDist, pos, athDate, atlDate, source, klineCount: klines.length };
    renderATHPanel(state.athData, price);
    if (state.detailData._text) buildOutput(state.detailData, symbol);

  } catch(e) {
    document.getElementById('athMetrics').innerHTML =
      `<div style="grid-column:1/-1;padding:10px 14px;color:var(--red);font-family:'Share Tech Mono',monospace;font-size:9px">⚠ ATH/ATL verisi alınamadı: ${e.message}</div>`;
  }
}

function renderATHPanel(d, price) {
  const { ath, atl, athDist, atlDist, pos, athDate, atlDate, source } = d;

  // Veri kaynağı etiketi
  document.getElementById('athDataSource').textContent = source;

  // Band işaretçisi
  const markerLeft = Math.min(Math.max(pos * 100, 1), 99).toFixed(1);
  document.getElementById('athMarker').style.left = markerLeft + '%';

  // Etiketler
  document.getElementById('athAtlLabel').textContent   = `ATL: ${formatPrice(atl)} (${atlDate})`;
  document.getElementById('athAthLabel').textContent   = `ATH: ${formatPrice(ath)} (${athDate})`;
  document.getElementById('athCurrentLabel').textContent = `${formatPrice(price)} ŞİMDİ`;

  // ATH metriği
  document.getElementById('athPrice').textContent = formatPrice(ath);
  const athDistEl = document.getElementById('athDist');
  athDistEl.textContent = `+%${athDist.toFixed(2)} uzakta`;
  athDistEl.className = 'ath-metric-dist ' +
    (athDist < 5 ? 'near-ath' : athDist < 20 ? 'mid-ath' : 'far-ath');

  // ATL metriği
  document.getElementById('atlPrice').textContent = formatPrice(atl);
  const atlDistEl = document.getElementById('atlDist');
  atlDistEl.textContent = `+%${atlDist.toFixed(2)} uzakta`;
  atlDistEl.className = 'ath-metric-dist ' +
    (atlDist < 10 ? 'near-atl' : atlDist < 40 ? 'mid-atl' : 'far-atl');

  // Özet
  let icon, text, sigCls, sigText;
  if (athDist < 3) {
    icon = '🏔️'; sigCls = 'ath-zone'; sigText = 'ATH BÖLGE';
    text = `Fiyat tüm zamanlar en yüksek seviyesine yalnızca %${athDist.toFixed(2)} uzakta. Tarihsel direnç bölgesi — kırılım çok kritik.`;
  } else if (athDist < 15) {
    icon = '🚀'; sigCls = 'high-zone'; sigText = 'YUKARI BÖLGE';
    text = `ATH'nın %${athDist.toFixed(2)} altında. Güçlü bir bölgede. ATH kırılımı gerçekleşirse yeni fiyat keşfi başlayabilir.`;
  } else if (pos > 0.5) {
    icon = '📍'; sigCls = 'mid-zone'; sigText = 'ORTA-ÜST';
    text = `ATL-ATH aralığının üst yarısında (%${(pos*100).toFixed(0)}). ATH %${athDist.toFixed(2)}, ATL %${atlDist.toFixed(2)} uzakta.`;
  } else if (pos > 0.25) {
    icon = '📍'; sigCls = 'mid-zone'; sigText = 'ORTA-ALT';
    text = `ATL-ATH aralığının alt yarısında (%${(pos*100).toFixed(0)}). ATL %${atlDist.toFixed(2)}, ATH %${athDist.toFixed(2)} uzakta.`;
  } else if (atlDist < 10) {
    icon = '⚠️'; sigCls = 'low-zone'; sigText = 'ATL YAKIN';
    text = `Fiyat tarihsel dip bölgesine yakın — ATL'den yalnızca %${atlDist.toFixed(2)} uzakta. Kritik destek seviyesi.`;
  } else {
    icon = '🔻'; sigCls = 'atl-zone'; sigText = 'DİP BÖLGE';
    text = `ATL-ATH aralığının en alt çeyreğinde (%${(pos*100).toFixed(0)}). Uzun vadeli alıcılar için dikkat edilmesi gereken bölge.`;
  }

  document.getElementById('athSummaryIcon').textContent = icon;
  document.getElementById('athSummaryText').textContent = text;
  const sigEl = document.getElementById('athSummarySig');
  sigEl.textContent = sigText;
  sigEl.className = `ath-summary-sig ${sigCls}`;
  document.getElementById('athSummaryRow').style.display = 'flex';
}
