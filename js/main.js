import { loadCoinList, filterCoins, setFilter } from './list.js';
import { openDetail, goBack, refreshDetail } from './detail.js';
import { copyData } from './output.js';

window.openDetail = openDetail;
window.goBack = goBack;
window.refreshDetail = refreshDetail;
window.copyData = copyData;
window.filterCoins = filterCoins;
window.setFilter = setFilter;

loadCoinList();
