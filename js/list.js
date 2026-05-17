import { state } from './state.js';
import { formatPrice, formatVol } from './config.js';

export async function loadCoinList() {
  try {
    const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
    const data = await res.json();
    state.allCoins = data
      .filter(d => d.symbol.endsWith('USDT'))
      .sort((a,b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
    state.filteredCoins = [...state.allCoins];
    renderList(state.filteredCoins);
    document.getElementById('countBadge').innerHTML = `<span>${state.allCoins.length}</span> coin yüklendi`;
    setTimeout(loadCoinList, 15000);
  } catch(e) {
    document.getElementById('coinList').innerHTML = `
      <div class="loading-wrap">
        <div style="color:var(--red);font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:2px">
          ⚠ BAĞLANTI HATASI<br><br>
          <span style="color:var(--dim)">Binance API erişilemiyor.</span>
        </div>
      </div>`;
  }
}

export function renderList(coins) {
  const el = document.getElementById('coinList');
  if (!coins.length) {
    el.innerHTML = `<div class="loading-wrap"><div class="loading-text">SONUÇ BULUNAMADI</div></div>`;
    return;
  }
  el.innerHTML = coins.map(c => {
    const price = parseFloat(c.lastPrice);
    const change = parseFloat(c.priceChangePercent);
    const vol = parseFloat(c.quoteVolume);
    const sym = c.symbol.replace('USDT','');
    const updown = change >= 0 ? 'up' : 'down';
    const arrow = change >= 0 ? '▲' : '▼';
    return `
    <div class="coin-row" onclick="openCoinAnalysis('${c.symbol}')">
      <div class="coin-name">
        <div class="coin-symbol">${sym}</div>
        <div class="coin-base">USDT PERP</div>
      </div>
      <div class="coin-price">${formatPrice(price)}</div>
      <div class="coin-change ${updown}">${arrow}${Math.abs(change).toFixed(2)}%</div>
      <div class="coin-vol">${formatVol(vol)}</div>
      <button class="analyze-btn" onclick="event.stopPropagation();openCoinAnalysis('${c.symbol}')">ANALİZ</button>
    </div>`;
  }).join('');
}

export function filterCoins() {
  const q = document.getElementById('searchInput').value.toUpperCase().trim();
  let list = state.activeFilter === 'all' ? state.allCoins
    : state.activeFilter === 'up' ? state.allCoins.filter(c => parseFloat(c.priceChangePercent) > 0)
    : state.activeFilter === 'down' ? state.allCoins.filter(c => parseFloat(c.priceChangePercent) < 0)
    : state.allCoins.filter(c => Math.abs(parseFloat(c.priceChangePercent)) >= 10);
  if (q) list = list.filter(c => c.symbol.includes(q));
  state.filteredCoins = list;
  renderList(state.filteredCoins);
  document.getElementById('countBadge').innerHTML = `<span>${state.filteredCoins.length}</span> coin gösteriliyor`;
}

export function setFilter(f, btn) {
  state.activeFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterCoins();
}
