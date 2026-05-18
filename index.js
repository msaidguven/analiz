// State
let allCoinsData = [];
let filteredCoins = [];
let currentPage = 1;
let currentSort = 'volume';
const itemsPerPage = 18;
let maxVolume = 0;
const coinMissingDataState = {};

// DOM Elements
const coinGrid = document.getElementById('coinGrid');
const loadingBox = document.getElementById('loadingBox');
const errorBox = document.getElementById('errorBox');
const emptyState = document.getElementById('emptyState');
const pagination = document.getElementById('pagination');
const totalCoinsEl = document.getElementById('totalCoins');
const pageInfoEl = document.getElementById('pageInfo');
const searchInput = document.getElementById('searchInput');
const errorMessage = document.getElementById('errorMessage');
const lastUpdateEl = document.getElementById('lastUpdate');

// Format helpers
function formatPrice(price, symbol) {
    if (!price || price === 'undefined') return '-';
    const p = parseFloat(price);
    if (isNaN(p)) return '-';
    if (p >= 1000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return '$' + p.toFixed(4);
    if (p >= 0.01) return '$' + p.toFixed(6);
    return '$' + p.toFixed(8);
}

function formatVolume(vol) {
    if (!vol) return '-';
    const v = parseFloat(vol);
    if (isNaN(v)) return '-';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(2) + 'K';
    return '$' + v.toFixed(2);
}

function formatMarketCap(mcap) {
    if (!mcap || mcap === 0) return '-';
    const v = parseFloat(mcap);
    if (isNaN(v)) return '-';
    if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    return '$' + v.toLocaleString('en-US');
}

function formatPercent(val) {
    if (!val) return '-';
    const v = parseFloat(val);
    if (isNaN(v)) return '-';
    const sign = v >= 0 ? '+' : '';
    return sign + v.toFixed(2) + '%';
}

function formatFunding(rate) {
    if (!rate) return '-';
    const r = parseFloat(rate);
    if (isNaN(r)) return '-';
    return (r * 100).toFixed(4) + '%';
}

// Toast System
function showToast(message, type = 'success', title = 'Bildirim', opts = {}) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;
    if (typeof opts.onClick === 'function') {
        toast.style.cursor = 'pointer';
        toast.title = opts.clickTitle || 'Detay için tıkla';
        toast.addEventListener('click', () => opts.onClick());
    }
    container.appendChild(toast);
    const duration = Number.isFinite(Number(opts.durationMs)) ? Number(opts.durationMs) : 3000;
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

const kararDebugToastZaman = {};
function showKararDebugModal(symbol, list) {
    const old = document.getElementById('kararDebugModal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'kararDebugModal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,0.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px';
    const card = document.createElement('div');
    card.style.cssText = 'width:min(760px,96vw);max-height:86vh;overflow:auto;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,0.45);padding:16px';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:800;font-size:14px;margin-bottom:10px';
    title.textContent = `Karar Debug · ${String(symbol || 'GENEL').toUpperCase()}`;
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:12px;color:var(--text-secondary);margin-bottom:12px';
    sub.textContent = `Eksik/geçersiz alan sayısı: ${list.length}`;
    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.45;margin:0;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px';
    pre.textContent = list.map((x, i) => `${i + 1}. ${x}`).join('\n');
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:12px';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Kopyala';
    copyBtn.style.cssText = 'border:1px solid var(--border);background:transparent;color:var(--text-primary);padding:8px 12px;border-radius:8px;cursor:pointer';
    copyBtn.onclick = async () => {
        const payload = [`Karar Debug · ${String(symbol || 'GENEL').toUpperCase()}`, `Eksik/geçersiz alan sayısı: ${list.length}`, '', ...list.map((x, i) => `${i + 1}. ${x}`)].join('\n');
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(payload); }
            else { const ta = document.createElement('textarea'); ta.value = payload; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); ta.remove(); }
            showToast('Debug listesi panoya kopyalandı.', 'success', 'Karar Debug');
        } catch (_) { showToast('Kopyalama başarısız oldu.', 'error', 'Karar Debug'); }
    };
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Kapat';
    closeBtn.style.cssText = 'border:1px solid var(--border);background:transparent;color:var(--text-primary);padding:8px 12px;border-radius:8px;cursor:pointer';
    closeBtn.onclick = () => wrap.remove();
    actions.appendChild(copyBtn);
    actions.appendChild(closeBtn);
    card.appendChild(title); card.appendChild(sub); card.appendChild(pre); card.appendChild(actions);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
    document.addEventListener('keydown', function escOnce(ev) { if (ev.key === 'Escape') { wrap.remove(); document.removeEventListener('keydown', escOnce); } });
}

function maybeShowKararDebugToast(symbol, sonuc) {
    const q = new URLSearchParams(window.location.search).get('debug');
    const ls = localStorage.getItem('kararDebug');
    const debugEnabled = q !== '0' && ls !== '0';
    if (!debugEnabled) return;
    const list = Array.isArray(sonuc?.debugEksikAlanlar) ? sonuc.debugEksikAlanlar : [];
    if (list.length === 0) return;
    const key = String(symbol || 'GENEL').toUpperCase();
    const now = Date.now();
    const last = kararDebugToastZaman[key] || 0;
    if (now - last < 60000) return;
    kararDebugToastZaman[key] = now;
    const preview = list.slice(0, 3).join(', ');
    const extra = list.length > 3 ? ` +${list.length - 3}` : '';
    showToast(`${key}: ${preview}${extra}`, 'warning', 'Karar Debug', { clickTitle: 'Tıkla: tüm eksik alanları göster', onClick: () => showKararDebugModal(key, list), durationMs: 10000 });
}

// ============================================================
// BSC + ETH KONTRAT OTOMATİK ÇEKME
// ============================================================
const bscContractCache = {};
const ethContractCache = {};
let bscContractsFetched = false;

async function fetchBscContracts(symbols) {
    if (bscContractsFetched) return;
    bscContractsFetched = true;
    try {
        showToast('Explorer linkleri yükleniyor...', 'warning', 'Explorer', { durationMs: 5000 });
        const listRes = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=true');
        if (!listRes.ok) throw new Error('CoinGecko platform listesi alınamadı');
        const list = await listRes.json();
        const symbolSet = new Set(symbols.map(s => s.toUpperCase()));
        list.forEach(coin => {
            const sym = String(coin.symbol || '').toUpperCase();
            if (!symbolSet.has(sym)) return;
            const bscAddr = coin.platforms?.['binance-smart-chain'] || coin.platforms?.['binance-smart-chain-mainnet'] || null;
            const ethAddr = coin.platforms?.['ethereum'] || null;
            if (bscAddr && !bscContractCache[sym]) bscContractCache[sym] = bscAddr.toLowerCase();
            if (ethAddr && !ethContractCache[sym]) ethContractCache[sym] = ethAddr.toLowerCase();
        });
        const bscFound = Object.keys(bscContractCache).length;
        const ethFound = Object.keys(ethContractCache).length;
        showToast(`BSC: ${bscFound} · ETH: ${ethFound} coin için explorer linkleri hazır`, 'success', 'Explorer');
        renderCoins();
    } catch (e) {
        console.warn('Kontrat adresleri alınamadı:', e);
        bscContractsFetched = false;
    }
}
// ============================================================

async function fetchAllData() {
    loadingBox.style.display = 'flex';
    errorBox.style.display = 'none';
    emptyState.style.display = 'none';
    coinGrid.innerHTML = '';

    try {
        const apiBase = String(window.API_BASE_URL || '').trim().replace(/\/+$/, '');
        let exchangeData = null;
        let tickerData = null;
        let premiumData = null;

        try {
            const snapshotRes = await fetch(`${apiBase}/api/binance/market-snapshot`);
            const snapshotRaw = await snapshotRes.text();
            let snapshotData = {};
            try { snapshotData = snapshotRaw ? JSON.parse(snapshotRaw) : {}; }
            catch { throw new Error(`Snapshot API JSON dönmedi: ${String(snapshotRaw || '').slice(0, 160)}`); }
            if (!snapshotRes.ok) throw new Error(snapshotData?.detail || snapshotData?.error || 'Snapshot API hatası');
            exchangeData = snapshotData.exchangeData;
            tickerData = snapshotData.tickerData;
            premiumData = snapshotData.premiumData;
        } catch (proxyErr) {
            console.error('Binance proxy kullanılamadı:', proxyErr?.message || proxyErr);
            throw new Error(proxyErr?.message || 'Piyasa verisi backend üzerinden alınamadı. API servisini kontrol edin.');
        }

        let geckoMap = {};
        try {
            const geckoPages = await Promise.all([
                fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1').then(r => r.json()),
                fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=2').then(r => r.json()),
                fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=3').then(r => r.json()),
                fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=4').then(r => r.json())
            ]);
            geckoPages.flat().forEach(g => {
                const sym = String(g.symbol || '').toUpperCase();
                if (!sym) return;
                const existing = geckoMap[sym];
                if (!existing || (Number(g.market_cap) || 0) > (Number(existing.market_cap) || 0)) geckoMap[sym] = g;
            });
        } catch (e) { console.warn('Piyasa değeri verisi alınamadı.'); }

        let cmcMap = {};
        try {
            const cmcRes = await fetch(`${apiBase}/api/marketcap/cmc?limit=2000`);
            if (cmcRes.ok) {
                const cmcRaw = await cmcRes.text();
                let cmcData = {};
                try { cmcData = cmcRaw ? JSON.parse(cmcRaw) : {}; } catch { cmcData = {}; }
                const rows = Array.isArray(cmcData?.data) ? cmcData.data : [];
                rows.forEach(c => {
                    const sym = String(c.symbol || '').toUpperCase();
                    if (!sym) return;
                    const quote = c.quote?.USD || {};
                    const item = { market_cap: Number(quote.market_cap) || 0, market_cap_rank: Number(c.cmc_rank) || '-', circulating_supply: Number(c.circulating_supply) || 0, total_supply: Number(c.total_supply) || 0, max_supply: Number(c.max_supply) || 0 };
                    const existing = cmcMap[sym];
                    if (!existing || item.market_cap > (Number(existing.market_cap) || 0)) cmcMap[sym] = item;
                });
            }
        } catch (e) { console.warn('CMC fallback verisi alınamadı.'); }

        const normalizeBaseSymbol = (raw) => String(raw || '').toUpperCase().replace(/^\d+/, '').replace(/USDT$/, '');

        const inferMarketCap = (coinRow, geckoCoin) => {
            const directCap = Number(geckoCoin?.market_cap) || 0;
            if (directCap > 0) return directCap;
            const price = Number(coinRow.price) || 0;
            const supply = Number(geckoCoin?.circulating_supply) || Number(geckoCoin?.total_supply) || Number(geckoCoin?.max_supply) || 0;
            if (price > 0 && supply > 0) return price * supply;
            return 0;
        };

        const tickerMap = {};
        if (!Array.isArray(tickerData)) throw new Error(`Binance ticker verisi geçersiz: ${tickerData?.msg || tickerData?.message || 'Bilinmeyen cevap'}`);
        tickerData.forEach(t => tickerMap[t.symbol] = t);

        const fundingMap = {};
        if (Array.isArray(premiumData)) premiumData.forEach(p => fundingMap[p.symbol] = p);
        else if (premiumData && premiumData.symbol) fundingMap[premiumData.symbol] = premiumData;
        else console.warn('Funding verisi beklenen formatta değil.');

        allCoinsData = exchangeData.symbols
            .filter(s => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
            .map(s => {
                const ticker = tickerMap[s.symbol] || {};
                const normalizedBase = normalizeBaseSymbol(s.baseAsset);
                const gData = geckoMap[s.baseAsset] || geckoMap[normalizedBase] || {};
                const cData = cmcMap[s.baseAsset] || cmcMap[normalizedBase] || {};
                const coinRow = {
                    symbol: s.symbol, baseAsset: s.baseAsset, status: s.status,
                    price: ticker.lastPrice || '0', priceChange: ticker.priceChangePercent || '0',
                    highPrice: ticker.highPrice || '0', lowPrice: ticker.lowPrice || '0',
                    volume: ticker.quoteVolume || '0',
                    fundingRate: fundingMap[s.symbol]?.lastFundingRate || '0',
                    nextFundingTime: fundingMap[s.symbol]?.nextFundingTime || null,
                    marketCap: 0, rank: gData.market_cap_rank || cData.market_cap_rank || '-'
                };
                coinRow.marketCap = inferMarketCap(coinRow, gData) || inferMarketCap(coinRow, cData);
                return coinRow;
            });

        maxVolume = Math.max(...allCoinsData.map(c => parseFloat(c.volume) || 0));
        filteredCoins = [...allCoinsData];

        const now = new Date();
        lastUpdateEl.textContent = `Son güncelleme: ${now.toLocaleTimeString('tr-TR')}`;

        loadingBox.style.display = 'none';
        sortCoins();
        updateStats();
        handleSearch(false);

        setTimeout(() => {
            const start = (currentPage - 1) * itemsPerPage;
            const pageCoins = filteredCoins.slice(start, start + itemsPerPage);
            pageCoins.forEach(coin => loadKararPreview(coin.baseAsset));
        }, 500);

        // BSC + ETH kontratları arka planda çek
        fetchBscContracts(allCoinsData.map(c => c.baseAsset));

    } catch (error) {
        console.error('Fetch error:', error);
        loadingBox.style.display = 'none';
        errorBox.style.display = 'block';
        errorMessage.textContent = error.message || 'Bağlantı hatası oluştu.';
    }
}

// Instant price refresh
let priceRefreshInterval = null;
let isRefreshingPrices = false;

async function refreshInstantPrices(showNotification = true) {
    if (isRefreshingPrices) return;
    isRefreshingPrices = true;
    try {
        if (showNotification) showToast('Fiyatlar yenileniyor...', 'warning', 'Fiyat Yenileme');
        const apiBase = String(window.API_BASE_URL || '').trim().replace(/\/+$/, '');
        let tickerData = null;
        try {
            const snapshotRes = await fetch(`${apiBase}/api/binance/market-snapshot`);
            const snapshotRaw = await snapshotRes.text();
            let snapshotData = {};
            try { snapshotData = snapshotRaw ? JSON.parse(snapshotRaw) : {}; }
            catch { throw new Error(`Snapshot API JSON dönmedi: ${String(snapshotRaw || '').slice(0, 160)}`); }
            if (!snapshotRes.ok) throw new Error(snapshotData?.detail || snapshotData?.error || 'Snapshot API hatası');
            tickerData = snapshotData.tickerData;
        } catch (error) {
            console.error('Ticker verisi alınamadı:', error);
            if (showNotification) showToast('Fiyatlar yenilenemedi', 'error', 'Fiyat Yenileme');
            return;
        }
        if (!Array.isArray(tickerData)) throw new Error('Ticker verisi geçersiz formatta');
        const tickerMap = {};
        tickerData.forEach(t => tickerMap[t.symbol] = t);
        let updatedCount = 0;
        allCoinsData.forEach(coin => {
            const ticker = tickerMap[coin.symbol];
            if (ticker) {
                const oldPrice = parseFloat(coin.price) || 0;
                const newPrice = parseFloat(ticker.lastPrice) || 0;
                const oldChange = parseFloat(coin.priceChange) || 0;
                const newChange = parseFloat(ticker.priceChangePercent) || 0;
                coin.price = ticker.lastPrice || '0';
                coin.priceChange = ticker.priceChangePercent || '0';
                coin.highPrice = ticker.highPrice || '0';
                coin.lowPrice = ticker.lowPrice || '0';
                coin.volume = ticker.quoteVolume || '0';
                if (oldPrice !== newPrice || oldChange !== newChange) { updateCoinCardDisplay(coin); updatedCount++; }
            }
        });
        const now = new Date();
        lastUpdateEl.textContent = `Son güncelleme: ${now.toLocaleTimeString('tr-TR')} (Fiyatlar)`;
        updateStats();
        if (currentSort === 'change' || currentSort === 'volume') { sortCoins(); handleSearch(false); }
        if (showNotification) showToast(`${updatedCount} coin fiyatı güncellendi`, 'success', 'Fiyat Yenileme');
    } catch (error) {
        console.error('Price refresh error:', error);
        if (showNotification) showToast('Fiyat yenileme hatası: ' + error.message, 'error', 'Fiyat Yenileme');
    } finally {
        isRefreshingPrices = false;
    }
}

function updateCoinCardDisplay(coin) {
    const priceChange = parseFloat(coin.priceChange) || 0;
    const changeClass = priceChange >= 0 ? 'text-premium-green' : 'text-premium-red';
    const changeBg = priceChange >= 0 ? 'bg-premium-green/10' : 'bg-premium-red/10';
    const cards = document.querySelectorAll(`[data-symbol="${coin.symbol}"]`);
    cards.forEach(card => {
        const priceEl = card.querySelector('.coin-price-display');
        const changeEl = card.querySelector('.coin-change-display');
        const volumeEl = card.querySelector('.coin-volume-display');
        const highLowEl = card.querySelector('.coin-highlow-display');
        if (priceEl) priceEl.textContent = formatPrice(coin.price);
        if (changeEl) { changeEl.textContent = formatPercent(coin.priceChange); changeEl.className = `px-3 py-1.5 rounded-lg text-sm font-black ${changeBg} ${changeClass} coin-change-display`; }
        if (volumeEl) volumeEl.textContent = formatVolume(coin.volume);
        if (highLowEl) highLowEl.textContent = `${formatPrice(coin.highPrice)} / ${formatPrice(coin.lowPrice)}`;
    });
}

function toggleAutoPriceRefresh() {
    if (priceRefreshInterval) {
        clearInterval(priceRefreshInterval);
        priceRefreshInterval = null;
        showToast('Otomatik fiyat yenileme durduruldu', 'info', 'Otomatik Yenileme');
        document.getElementById('autoRefreshBtn')?.classList.remove('active');
        document.getElementById('autoRefreshBtn')?.querySelector('svg')?.style.setProperty('animation', 'none');
        document.getElementById('autoRefreshText').textContent = 'Otomatik Yenile';
    } else {
        priceRefreshInterval = setInterval(() => refreshInstantPrices(false), 5000);
        showToast('Otomatik fiyat yenileme başladı (5sn)', 'success', 'Otomatik Yenileme');
        document.getElementById('autoRefreshBtn')?.classList.add('active');
        const btnSvg = document.getElementById('autoRefreshBtn')?.querySelector('svg');
        if (btnSvg) btnSvg.style.setProperty('animation', 'spin 2s linear infinite');
        document.getElementById('autoRefreshText').textContent = 'Durdur';
    }
}

document.addEventListener('keydown', function(event) {
    if (event.ctrlKey && event.key === 'r') { event.preventDefault(); refreshInstantPrices(); }
});

document.addEventListener('DOMContentLoaded', function() {
    fetchAllData();
    setTimeout(() => toggleAutoPriceRefresh(), 2000);
});

function setSort(sortType) {
    currentSort = sortType;
    document.querySelectorAll('.sort-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.sort === sortType));
    sortCoins();
    handleSearch();
}

function sortCoins() {
    const missingLastCompare = (a, b) => {
        const aMissing = coinMissingDataState[a.baseAsset] === true;
        const bMissing = coinMissingDataState[b.baseAsset] === true;
        if (aMissing === bMissing) return 0;
        return aMissing ? 1 : -1;
    };
    switch (currentSort) {
        case 'volume':   filteredCoins.sort((a, b) => { const m = missingLastCompare(a,b); return m !== 0 ? m : parseFloat(b.volume) - parseFloat(a.volume); }); break;
        case 'marketcap':filteredCoins.sort((a, b) => { const m = missingLastCompare(a,b); return m !== 0 ? m : (b.marketCap||0) - (a.marketCap||0); }); break;
        case 'price':    filteredCoins.sort((a, b) => { const m = missingLastCompare(a,b); return m !== 0 ? m : parseFloat(b.price) - parseFloat(a.price); }); break;
        case 'change':   filteredCoins.sort((a, b) => { const m = missingLastCompare(a,b); return m !== 0 ? m : parseFloat(b.priceChange) - parseFloat(a.priceChange); }); break;
        case 'funding':  filteredCoins.sort((a, b) => { const m = missingLastCompare(a,b); return m !== 0 ? m : parseFloat(b.fundingRate) - parseFloat(a.fundingRate); }); break;
        case 'symbol':   filteredCoins.sort((a, b) => { const m = missingLastCompare(a,b); return m !== 0 ? m : a.symbol.localeCompare(b.symbol); }); break;
    }
}

function renderCoins() {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageCoins = filteredCoins.slice(start, end);

    const savedPreviews = {};
    pageCoins.forEach(coin => {
        const previewEl = document.getElementById(`karar-preview-${coin.baseAsset}`);
        if (previewEl && previewEl.innerHTML.trim() && !previewEl.innerHTML.includes('Yükleniyor...')) {
            savedPreviews[coin.baseAsset] = previewEl.innerHTML;
        }
    });

    if (pageCoins.length === 0 && filteredCoins.length === 0) {
        emptyState.style.display = 'block';
        coinGrid.innerHTML = '';
        pagination.innerHTML = '';
        return;
    }

    coinGrid.innerHTML = pageCoins.map(coin => {
        const isMissingData = coinMissingDataState[coin.baseAsset] === true;
        const statusClass = coin.status === 'TRADING' ? 'bg-premium-green/10 text-premium-green border-premium-green/20' :
            coin.status === 'HALT' ? 'bg-premium-red/10 text-premium-red border-premium-red/20' : 'bg-binance-muted/10 text-binance-muted border-binance-muted/20';
        const priceChange = parseFloat(coin.priceChange) || 0;
        const changeClass = priceChange >= 0 ? 'text-premium-green' : 'text-premium-red';
        const changeBg = priceChange >= 0 ? 'bg-premium-green/10' : 'bg-premium-red/10';
        const funding = parseFloat(coin.fundingRate) || 0;
        const fundingClass = funding >= 0 ? 'text-premium-red' : 'text-premium-green';
        const volumePercent = maxVolume > 0 ? (parseFloat(coin.volume) / maxVolume * 100) : 0;
        const cardVisualClass = isMissingData ? 'opacity-65 border-premium-red/25 saturate-75' : '';

        // ── Explorer linkleri ──────────────────────────────────────
        const bscContract = bscContractCache[coin.baseAsset];
        const ethContract = ethContractCache[coin.baseAsset];
        const coinId = coin.baseAsset.toLowerCase();

        const bscHoldersUrl = bscContract
            ? `https://bscscan.com/token/${bscContract}#balances`
            : `https://bscscan.com/search?q=${coin.baseAsset}`;
        const bscTransfersUrl = bscContract
            ? `https://bscscan.com/token/${bscContract}#tokenTrade`
            : `https://bscscan.com/search?q=${coin.baseAsset}`;
        const ethUrl = ethContract
            ? `https://etherscan.io/token/${ethContract}#balances`
            : `https://etherscan.io/search?q=${coin.baseAsset}`;
        const geckoUrl  = `https://www.coingecko.com/en/coins/${coinId}`;
        const unlockUrl = `https://token.unlocks.app/search?q=${coinId}`;

        // Renk & etiket: adres bulunduysa vurgulu, bulunmadıysa soluk
        const holdersBorder = bscContract
            ? 'border-binance-yellow/50 text-binance-yellow hover:bg-binance-yellow/10'
            : 'border-binance-border text-binance-muted hover:border-binance-yellow hover:text-binance-yellow';
        const holdersLabel  = bscContract ? '🐋 BSC' : 'BSC';

        const ethBorder = ethContract
            ? 'border-blue-400/50 text-blue-400 hover:bg-blue-400/10'
            : 'border-binance-border text-binance-muted hover:border-blue-400 hover:text-blue-400';
        const ethLabel  = ethContract ? '🔷 ETH' : 'ETH';
        // ──────────────────────────────────────────────────────────

        return `
            <div class="group bg-binance-card border border-binance-border rounded-2xl p-5 transition-all duration-300 hover:border-binance-yellow/50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.5)] hover:-translate-y-1 relative overflow-hidden ${cardVisualClass}" data-symbol="${coin.symbol}">
                <div class="absolute top-0 right-0 w-32 h-32 bg-binance-yellow/5 blur-[60px] rounded-full pointer-events-none transition-all duration-500 group-hover:bg-binance-yellow/10"></div>

                <div class="flex justify-between items-start mb-5">
                    <div class="flex flex-col">
                        <span class="text-binance-muted text-[10px] font-bold uppercase tracking-widest mb-1">RANK #${coin.rank}</span>
                        <div class="flex items-center gap-2">
                            <h3 class="text-xl font-bold font-outfit text-binance-text tracking-wide">${coin.symbol}</h3>
                            <button onclick="openChartModal('${coin.symbol}')" class="flex items-center justify-center p-1.5 rounded-lg bg-binance-card border border-binance-border text-binance-muted hover:text-binance-yellow hover:border-binance-yellow transition-all" title="Grafiği Göster">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/></svg>
                            </button>
                            <div class="p-1 px-2 rounded text-[10px] font-bold border ${statusClass}">${coin.status}</div>
                        </div>
                    </div>
                    <div class="p-2 cursor-pointer hover:bg-binance-yellow/10 rounded-lg transition-colors text-binance-muted hover:text-binance-yellow" onclick="goToDetailedAnalysis('${coin.baseAsset}')" title="Detaylı Analiz">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 9l-5 5-2-2-4 4"/></svg>
                    </div>
                </div>

                <div class="flex items-baseline justify-between mb-6">
                    <span class="text-3xl font-bold font-outfit text-binance-text coin-price-display">${formatPrice(coin.price)}</span>
                    <span class="px-3 py-1.5 rounded-lg text-sm font-black ${changeBg} ${changeClass} coin-change-display">${formatPercent(coin.priceChange)}</span>
                </div>

                <div class="grid grid-cols-2 gap-4 mb-6">
                    <div class="space-y-1">
                        <p class="text-[10px] text-binance-muted uppercase font-bold tracking-wider">24s Hacim</p>
                        <p class="text-xs font-semibold text-binance-text coin-volume-display">${formatVolume(coin.volume)}</p>
                    </div>
                    <div class="space-y-1 text-right">
                        <p class="text-[10px] text-binance-muted uppercase font-bold tracking-wider">Piyasa Değeri</p>
                        <p class="text-xs font-semibold text-binance-text">${formatMarketCap(coin.marketCap)}</p>
                    </div>
                    <div class="space-y-1">
                        <p class="text-[10px] text-binance-muted uppercase font-bold tracking-wider">Funding Rate</p>
                        <p class="text-sm font-black ${fundingClass}">${formatFunding(coin.fundingRate)}</p>
                    </div>
                    <div class="space-y-1 text-right">
                        <p class="text-[10px] text-binance-muted uppercase font-bold tracking-wider">24s Y/D</p>
                        <p class="text-xs font-bold text-binance-text coin-highlow-display">${formatPrice(coin.highPrice)} / ${formatPrice(coin.lowPrice)}</p>
                    </div>
                </div>

                <div class="mb-6">
                    <div class="flex justify-between text-[10px] font-bold text-binance-muted mb-2 uppercase tracking-tighter">
                        <span>Relatif Hacim</span>
                        <span>${volumePercent.toFixed(1)}%</span>
                    </div>
                    <div class="h-1.5 w-full bg-binance-dark rounded-full overflow-hidden">
                        <div class="h-full bg-binance-yellow rounded-full transition-all duration-1000 ease-out" style="width: ${volumePercent}%"></div>
                    </div>
                </div>

                <div id="karar-preview-${coin.baseAsset}" class="bg-binance-dark/50 rounded-xl p-3 mb-4 min-h-[60px] border border-binance-border/50"></div>

                <!-- Explorer Linkleri -->
                <div class="grid grid-cols-5 gap-1 mb-3">
                    <a href="${bscHoldersUrl}" target="_blank"
                       class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg text-[9px] font-bold bg-binance-dark border ${holdersBorder} transition-all uppercase tracking-wider"
                       title="${bscContract ? 'BSCScan Holders: ' + bscContract : 'BSCScan Arama'}">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        ${holdersLabel}
                    </a>
                    <a href="${bscTransfersUrl}" target="_blank"
                       class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg text-[9px] font-bold bg-binance-dark border border-binance-border text-binance-muted hover:border-[#e040fb] hover:text-[#e040fb] transition-all uppercase tracking-wider"
                       title="BSCScan Transferler">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                        Txns
                    </a>
                    <a href="${ethUrl}" target="_blank"
                       class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg text-[9px] font-bold bg-binance-dark border ${ethBorder} transition-all uppercase tracking-wider"
                       title="${ethContract ? 'Etherscan Holders: ' + ethContract : 'Etherscan Arama'}">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                        ${ethLabel}
                    </a>
                    <a href="${geckoUrl}" target="_blank"
                       class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg text-[9px] font-bold bg-binance-dark border border-binance-border text-binance-muted hover:border-green-400 hover:text-green-400 transition-all uppercase tracking-wider"
                       title="CoinGecko — Tokenomics & Unlock">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                        GKO
                    </a>
                    <a href="${unlockUrl}" target="_blank"
                       class="flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg text-[9px] font-bold bg-binance-dark border border-binance-border text-binance-muted hover:border-orange-400 hover:text-orange-400 transition-all uppercase tracking-wider"
                       title="Token Unlock Takvimi">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        Unlock
                    </a>
                </div>

                <!-- Ana Butonlar -->
                <div class="flex gap-2">
                    <button class="flex-1 py-3 rounded-xl text-sm font-black bg-binance-yellow text-black hover:bg-[#e0ab0a] transition-colors shadow-lg shadow-binance-yellow/10 uppercase tracking-widest" onclick="refreshKararMotoru('${coin.baseAsset}')">${coin.baseAsset} Analizi</button>
                    <div class="flex-1 flex gap-2">
                        <button class="karar-kaydet-long-btn flex-1 py-3 rounded-xl text-sm font-black bg-premium-green/10 border border-premium-green/30 text-premium-green hover:bg-premium-green hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-widest" data-symbol="${coin.baseAsset}" onclick="saveCoin('${coin.baseAsset}', 'LONG')">Long</button>
                        <button class="karar-kaydet-short-btn flex-1 py-3 rounded-xl text-sm font-black bg-premium-red/10 border border-premium-red/30 text-premium-red hover:bg-premium-red hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-widest" data-symbol="${coin.baseAsset}" onclick="saveCoin('${coin.baseAsset}', 'SHORT')">Short</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    renderPagination();

    setTimeout(() => {
        Object.entries(savedPreviews).forEach(([symbol, content]) => {
            const previewEl = document.getElementById(`karar-preview-${symbol}`);
            if (previewEl && content) previewEl.innerHTML = content;
        });
    }, 50);
}

function updateStats() {
    totalCoinsEl.textContent = filteredCoins.length;
    const totalPages = Math.ceil(filteredCoins.length / itemsPerPage);
    pageInfoEl.textContent = totalPages > 0 ? `${currentPage} / ${totalPages}` : '-';
}

function goToDetailedAnalysis(symbol) {
    window.location.href = `analiz_v3.html?symbol=${symbol}`;
}

async function saveCoin(symbol, side) {
    const analysisData = await fetchAnalysisData(symbol);
    if (!analysisData) { showToast('Veri yüklenemedi!', 'error', 'Hata'); return; }
    validateKararPayload(symbol, analysisData);
    const sonuc = window.kararMotoru(analysisData);
    const eksikAlanlar = Array.isArray(sonuc?.debugEksikAlanlar) ? sonuc.debugEksikAlanlar : [];
    if (hasBlockingMissingData(eksikAlanlar)) {
        const previewElement = document.getElementById(`karar-preview-${symbol}`);
        if (previewElement) {
            previewElement.innerHTML = `<div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-premium-red"></span><span class="text-[11px] font-black uppercase tracking-widest text-premium-red">Eksik veri var</span></div><span class="text-[10px] font-bold text-binance-muted">Sinyal üretilmedi</span></div>`;
        }
        const longBtn = document.querySelector(`.karar-kaydet-long-btn[data-symbol="${symbol}"]`);
        const shortBtn = document.querySelector(`.karar-kaydet-short-btn[data-symbol="${symbol}"]`);
        if (longBtn && shortBtn) { longBtn.disabled = true; shortBtn.disabled = true; longBtn.title = 'Eksik veri var: sinyal kapalı'; shortBtn.title = 'Eksik veri var: sinyal kapalı'; }
        return;
    }
    const mevcutFiyat = analysisData.price;
    if (!side || (side !== 'LONG' && side !== 'SHORT')) { showToast('Geçersiz yön seçimi!', 'error', 'Hata'); return; }
    const kayitSonucu = { ...sonuc, karar: side };
    try {
        await window.kararKayitSistemi.kararKayit(symbol, kayitSonucu, mevcutFiyat);
        if (side === 'LONG') signalLong(symbol);
        else if (side === 'SHORT') signalShort(symbol);
        showToast(`${symbol.toUpperCase()} başarıyla kaydedildi! (Karar: ${side})`, 'success', 'Başarılı');
    } catch (err) {
        console.error('Kaydetme hatası:', err);
        showToast(err?.message || 'Kayıt sırasında hata oluştu!', 'error', 'Hata');
    }
}

function normalizeOrderSymbol(symbol) {
    let s = String(symbol || '').toUpperCase().trim();
    if (!s.endsWith('USDT')) s += 'USDT';
    return s;
}

function signalLong(symbol) {
    const orderSymbol = normalizeOrderSymbol(symbol);
    const ayarlar = getTradeSettings();
    const payload = { symbol: orderSymbol, direction: "LONG", kaldirac: ayarlar.kaldirac, pozisyon_usdt: ayarlar.pozisyon_usdt };
    if (window.FlutterChannel) FlutterChannel.postMessage(JSON.stringify(payload));
    if (window.pywebview) {
        if (typeof pywebview.api.sendOrderAdvanced === 'function') pywebview.api.sendOrderAdvanced(payload);
        else pywebview.api.sendOrder(orderSymbol, "LONG");
    }
}

function signalShort(symbol) {
    const orderSymbol = normalizeOrderSymbol(symbol);
    const ayarlar = getTradeSettings();
    const payload = { symbol: orderSymbol, direction: "SHORT", kaldirac: ayarlar.kaldirac, pozisyon_usdt: ayarlar.pozisyon_usdt };
    if (window.FlutterChannel) FlutterChannel.postMessage(JSON.stringify(payload));
    if (window.pywebview) {
        if (typeof pywebview.api.sendOrderAdvanced === 'function') pywebview.api.sendOrderAdvanced(payload);
        else pywebview.api.sendOrder(orderSymbol, "SHORT");
    }
}

async function fetchAnalysisData(symbol) {
    const apiBase = String(window.API_BASE_URL || '').trim().replace(/\/+$/, '');
    let currentSymbol = String(symbol || '').toUpperCase().trim();
    if (!currentSymbol.endsWith('USDT')) currentSymbol += 'USDT';
    try {
        const res = await fetch(`${apiBase}/api/binance/analysis?symbol=${encodeURIComponent(currentSymbol)}`);
        const raw = await res.text();
        let payload = {};
        try { payload = raw ? JSON.parse(raw) : {}; }
        catch { throw new Error(`Analiz API JSON dönmedi: ${String(raw).slice(0, 160)}`); }
        if (!res.ok) throw new Error(payload?.detail || payload?.error || 'Analiz API hatası');

        const ticker = payload.ticker || null;
        const oiCurrent = payload.oiCurrent || null;
        const oiHist = payload.oiHist || null;
        const lsRaw = payload.lsRaw || null;
        const fundingRaw = Array.isArray(payload.fundingRaw) ? payload.fundingRaw : [];
        const klines1d = Array.isArray(payload.klines1d) ? payload.klines1d : [];
        const klines4h = Array.isArray(payload.klines4h) ? payload.klines4h : [];
        const klines15m = Array.isArray(payload.klines15m) ? payload.klines15m : [];
        const klines1h = Array.isArray(payload.klines1h) ? payload.klines1h : [];
        const klines1w = Array.isArray(payload.klines1w) ? payload.klines1w : [];

        const processTF = (klines) => {
            if (!klines || klines.length < 20 || !window.chartEngine) return null;
            const cls = klines.map(k => parseFloat(k[4]));
            const vols = klines.map(k => parseFloat(k[5]));
            const rsiArr = window.chartEngine.calcRSIWilder(cls, 14);
            const ema20 = window.chartEngine.calcEMA(cls, 20).pop();
            const macdObj = window.chartEngine.calcMACDSeries(cls);
            return {
                rsi: rsiArr.pop(),
                macd: { macd: macdObj.macdLine.pop(), signal: macdObj.signal.pop(), histogram: macdObj.histogram.pop() },
                ema20: ema20,
                volume: vols[vols.length - 1],
                volumeAvg: vols.slice(-20).reduce((a, b) => a + b, 0) / 20,
                smc: { trend: cls[cls.length - 1] > ema20 ? 'BULLISH' : 'BEARISH' },
                delta: parseFloat(klines[klines.length - 1][9]) - (parseFloat(klines[klines.length - 1][5]) - parseFloat(klines[klines.length - 1][9]))
            };
        };

        const currentOI = parseFloat(oiCurrent?.openInterest || 0);
        const prevOI = oiHist && oiHist.length > 1 ? parseFloat(oiHist[0].sumOpenInterest) : currentOI;

        const analysisData = {
            symbol: symbol,
            price: parseFloat(ticker.lastPrice),
            chg24: parseFloat(ticker.priceChangePercent),
            highDay: parseFloat(ticker.highPrice),
            lowDay: parseFloat(ticker.lowPrice),
            volatility: 0,
            fundingAvg: fundingRaw.length > 0 ? fundingRaw.reduce((sum, f) => sum + parseFloat(f.fundingRate), 0) / fundingRaw.length : 0,
            oiChange: prevOI > 0 ? ((currentOI - prevOI) / prevOI * 100) : 0,
            longPct: lsRaw.length > 0 ? parseFloat(lsRaw[0].longShortRatio) * 100 / (1 + parseFloat(lsRaw[0].longShortRatio)) : 50,
            shortPct: 0,
            multiTF: { '15m': processTF(klines15m), '1h': processTF(klines1h), '4h': processTF(klines4h), '1d': processTF(klines1d), '1w': processTF(klines1w) },
            supports: [], resistances: [],
        };
        analysisData.shortPct = 100 - analysisData.longPct;
        analysisData.rsi = analysisData.multiTF['1h']?.rsi || 50;
        return analysisData;
    } catch (error) {
        console.error('Analiz verisi çekilemedi:', error);
        return null;
    }
}

function validateKararPayload(symbol, data) {
    const missing = [], invalid = [];
    const isNum = (v) => Number.isFinite(Number(v));
    if (!data || typeof data !== 'object') { console.error(`[KararPayload] ${symbol}: payload yok.`); return false; }
    ['price','chg24','volatility','fundingAvg','oiChange','longPct','shortPct','multiTF'].forEach(k => { if (data[k] === undefined || data[k] === null) missing.push(k); });
    ['price','chg24','volatility','fundingAvg','oiChange','longPct','shortPct'].forEach(k => { if (data[k] !== undefined && data[k] !== null && !isNum(data[k])) invalid.push(`${k}=${data[k]}`); });
    if (!data.multiTF || typeof data.multiTF !== 'object') {
        missing.push('multiTF');
    } else {
        ['15m','1h','4h','1d','1w'].forEach(tf => {
            const tfData = data.multiTF[tf];
            if (!tfData) { missing.push(`multiTF.${tf}`); return; }
            if (!isNum(tfData.rsi)) invalid.push(`multiTF.${tf}.rsi=${tfData.rsi}`);
            if (!tfData.macd || !isNum(tfData.macd.macd) || !isNum(tfData.macd.histogram)) invalid.push(`multiTF.${tf}.macd=${JSON.stringify(tfData.macd||null)}`);
            if (!isNum(tfData.volume) || !isNum(tfData.volumeAvg)) invalid.push(`multiTF.${tf}.volume/volumeAvg=${tfData.volume}/${tfData.volumeAvg}`);
            if (!tfData.smc || !tfData.smc.trend) missing.push(`multiTF.${tf}.smc.trend`);
        });
    }
    const lsTotal = Number(data.longPct) + Number(data.shortPct);
    if (isNum(data.longPct) && isNum(data.shortPct) && Math.abs(lsTotal - 100) > 5) invalid.push(`longPct+shortPct=${lsTotal.toFixed(2)}`);
    if (missing.length || invalid.length) { console.warn(`[KararPayload] ${symbol}: eksik/geçersiz.`, { missing, invalid }); return false; }
    console.info(`[KararPayload] ${symbol}: OK`);
    return true;
}

function updateKararPreview(symbol, analysisData) {
    const previewElement = document.getElementById(`karar-preview-${symbol}`);
    if (!previewElement) return;
    if (window.kararMotoru) {
        validateKararPayload(symbol, analysisData);
        const sonuc = window.kararMotoru(analysisData);
        const eksikAlanlar = Array.isArray(sonuc?.debugEksikAlanlar) ? sonuc.debugEksikAlanlar : [];
        const hasEksikVeri = hasBlockingMissingData(eksikAlanlar);
        coinMissingDataState[symbol] = hasEksikVeri;
        const longBtn = document.querySelector(`.karar-kaydet-long-btn[data-symbol="${symbol}"]`);
        const shortBtn = document.querySelector(`.karar-kaydet-short-btn[data-symbol="${symbol}"]`);
        if (hasEksikVeri) {
            previewElement.innerHTML = `<div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-premium-red"></span><span class="text-[11px] font-black uppercase tracking-widest text-premium-red">Eksik veri var</span></div><span class="text-[10px] font-bold text-binance-muted">Sinyal üretilmedi</span></div>`;
            if (longBtn && shortBtn) { longBtn.disabled = true; shortBtn.disabled = true; longBtn.title = 'Eksik veri var'; shortBtn.title = 'Eksik veri var'; }
            return;
        }
        const isLong = sonuc.karar === 'LONG', isShort = sonuc.karar === 'SHORT';
        const colorClass = isLong ? 'text-premium-green' : isShort ? 'text-premium-red' : 'text-binance-yellow';
        const riskColor = sonuc.riskSkor >= 7 ? 'text-premium-red' : sonuc.riskSkor >= 4 ? 'text-binance-yellow' : 'text-premium-green';
        previewElement.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <div class="flex flex-col">
                    <div class="flex items-center gap-1.5 mb-1">
                        <span class="w-1.5 h-1.5 rounded-full ${isLong ? 'bg-premium-green animate-pulse' : isShort ? 'bg-premium-red animate-pulse' : 'bg-binance-yellow'}"></span>
                        <span class="text-[11px] font-black uppercase tracking-widest ${colorClass}">${sonuc.karar}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-bold text-premium-green/80">L: %${sonuc.finalLongOran.toFixed(0)}</span>
                        <span class="text-[10px] font-bold text-premium-red/80">S: %${sonuc.finalShortOran.toFixed(0)}</span>
                    </div>
                </div>
                <div class="flex flex-col items-end">
                    <span class="text-[9px] text-binance-muted uppercase font-bold mb-0.5">RİSK</span>
                    <span class="text-xs font-black ${riskColor}">${sonuc.riskSkor}/10</span>
                </div>
            </div>
        `;
        if (longBtn && shortBtn) { longBtn.disabled = false; shortBtn.disabled = false; longBtn.title = 'LONG kaydet'; shortBtn.title = 'SHORT kaydet'; }
    } else {
        previewElement.innerHTML = `<div class="flex items-center justify-center py-2"><span class="text-[10px] text-premium-red font-bold uppercase">Motor Yüklenmedi</span></div>`;
    }
}

function hasBlockingMissingData(list) {
    if (!Array.isArray(list) || list.length === 0) return false;
    const ignorablePrefixes = ['multiTF.1w', 'multiTF.1d'];
    return list.some(item => !ignorablePrefixes.some(p => String(item || '').startsWith(p)));
}

let kararMotoruReloadPromise = null;
function reloadKararMotoruScript() {
    if (kararMotoruReloadPromise) return kararMotoruReloadPromise;
    kararMotoruReloadPromise = new Promise((resolve, reject) => {
        try {
            const oldScript = Array.from(document.querySelectorAll('script')).find(s => (s.getAttribute('src') || '').includes('karar-motoru.js'));
            const script = document.createElement('script');
            script.src = `karar-motoru.js?v=${Date.now()}`;
            script.async = false;
            script.onload = () => resolve(true);
            script.onerror = () => reject(new Error('karar-motoru.js yeniden yüklenemedi'));
            if (oldScript && oldScript.parentNode) { oldScript.parentNode.insertBefore(script, oldScript.nextSibling); oldScript.remove(); }
            else document.head.appendChild(script);
        } catch (err) { reject(err); }
    }).finally(() => { kararMotoruReloadPromise = null; });
    return kararMotoruReloadPromise;
}

async function refreshKararMotoru(symbol) {
    const target = symbol ? String(symbol).toUpperCase() : 'TUM';
    showToast(`${target}: karar motoru yenileniyor...`, 'warning', 'Karar Motoru');
    try {
        await reloadKararMotoruScript();
        if (symbol) { await loadKararPreview(symbol); showToast(`${String(symbol).toUpperCase()}: karar verisi güncellendi`, 'success', 'Karar Motoru'); return; }
        const previewIds = Array.from(document.querySelectorAll('[id^="karar-preview-"]')).map(el => String(el.id || '').replace('karar-preview-', '')).filter(Boolean);
        await Promise.all(previewIds.map(s => loadKararPreview(s)));
        showToast(`Karar motoru ve ${previewIds.length} coin verisi güncellendi`, 'success', 'Karar Motoru');
    } catch (err) {
        console.error('refreshKararMotoru hatası:', err);
        showToast(err?.message || 'Karar motoru yenileme başarısız', 'error', 'Karar Motoru');
    }
}

async function loadKararPreview(symbol) {
    const previewElement = document.getElementById(`karar-preview-${symbol}`);
    if (!previewElement) return;
    previewElement.innerHTML = `<div class="karar-preview-loading"><div class="karar-preview-spinner"></div><span>Yükleniyor...</span></div>`;
    const analysisData = await fetchAnalysisData(symbol);
    if (analysisData) {
        updateKararPreview(symbol, analysisData);
    } else {
        previewElement.innerHTML = `<div class="flex items-center justify-center py-2 h-full"><span class="text-[10px] text-premium-red font-bold uppercase tracking-widest">Hata</span></div>`;
    }
}

function renderPagination() {
    const totalPages = Math.ceil(filteredCoins.length / itemsPerPage);
    if (totalPages <= 1) { pagination.innerHTML = ''; return; }
    const btnClass = "flex items-center justify-center w-10 h-10 rounded-xl text-sm font-bold transition-all duration-200 border border-binance-border bg-binance-card text-binance-muted hover:border-binance-yellow hover:text-binance-text";
    const activeClass = "border-binance-yellow text-binance-yellow bg-binance-hover shadow-[0_0_15px_rgba(240,185,11,0.1)]";
    const disabledClass = "opacity-30 cursor-not-allowed grayscale pointer-events-none";
    let html = `
        <button class="${btnClass} ${currentPage===1?disabledClass:''}" onclick="goToPage(1)" title="İlk Sayfa"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg></button>
        <button class="${btnClass} ${currentPage===1?disabledClass:''}" onclick="goToPage(${currentPage-1})" title="Önceki"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
    `;
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible/2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
    if (startPage > 1) { html += `<button class="${btnClass}" onclick="goToPage(1)">1</button>`; if (startPage > 2) html += `<span class="px-2 text-binance-muted font-black">...</span>`; }
    for (let i = startPage; i <= endPage; i++) html += `<button class="${btnClass} ${i===currentPage?activeClass:''}" onclick="goToPage(${i})">${i}</button>`;
    if (endPage < totalPages) { if (endPage < totalPages - 1) html += `<span class="px-2 text-binance-muted font-black">...</span>`; html += `<button class="${btnClass}" onclick="goToPage(${totalPages})">${totalPages}</button>`; }
    html += `
        <button class="${btnClass} ${currentPage===totalPages?disabledClass:''}" onclick="goToPage(${currentPage+1})" title="Sonraki"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>
        <button class="${btnClass} ${currentPage===totalPages?disabledClass:''}" onclick="goToPage(${totalPages})" title="Son Sayfa"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg></button>
    `;
    pagination.innerHTML = html;
}

function goToPage(page) {
    const totalPages = Math.ceil(filteredCoins.length / itemsPerPage);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderCoins();
    updateStats();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleSearch(resetPage = true) {
    const query = searchInput.value.toLowerCase().trim();
    if (query === '') filteredCoins = [...allCoinsData];
    else filteredCoins = allCoinsData.filter(coin => coin.symbol.toLowerCase().includes(query) || coin.baseAsset.toLowerCase().includes(query));
    sortCoins();
    if (resetPage) currentPage = 1;
    updateStats();
    renderCoins();
}

searchInput.addEventListener('input', debounce(handleSearch, 300));

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function openChartModal(symbol) {
    const modal = document.getElementById('chartModal');
    const content = document.getElementById('chartModalContent');
    const title = document.getElementById('chartModalTitle');
    const icon = document.getElementById('chartModalIcon');
    const body = document.getElementById('chartModalBody');
    title.textContent = symbol + ' Futures · 4S';
    icon.textContent = symbol.replace('USDT', '').substring(0, 4);
    modal.classList.remove('hidden');
    modal.style.pointerEvents = 'auto';
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => { content.classList.remove('scale-95'); content.classList.add('scale-100'); });
    const containerId = 'tv_' + symbol.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now();
    body.innerHTML = `<div id="${containerId}" style="position:absolute;inset:0;width:100%;height:100%;"></div>`;
    function buildWidget() {
        new TradingView.widget({ autosize: true, symbol: 'BINANCE:' + symbol + '.P', interval: '240', timezone: 'Europe/Istanbul', theme: 'light', style: '1', locale: 'tr', enable_publishing: false, allow_symbol_change: true, hide_top_toolbar: false, hide_legend: false, save_image: false, container_id: containerId });
    }
    if (window.TradingView) { buildWidget(); }
    else {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://s3.tradingview.com/tv.js';
        script.onload = buildWidget;
        script.onerror = () => { body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#f6465d;font-weight:700;font-size:14px;padding:24px;text-align:center;">TradingView bağlantı hatası.<br>Lütfen sayfayı yenileyin.</div>'; };
        document.head.appendChild(script);
    }
}

function closeChartModal() {
    const modal = document.getElementById('chartModal');
    const content = document.getElementById('chartModalContent');
    const body = document.getElementById('chartModalBody');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); modal.style.pointerEvents = 'none'; document.body.style.overflow = ''; body.innerHTML = ''; }, 300);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChartModal(); });

fetchAllData();