import { loadCoinList, filterCoins, setFilter } from './list.js';
window.filterCoins = filterCoins;
window.setFilter = setFilter;
window.openCoinAnalysis = (symbol) => {
  window.location.href = `./coin_analiz.html?symbol=${encodeURIComponent(symbol)}`;
};

loadCoinList();
