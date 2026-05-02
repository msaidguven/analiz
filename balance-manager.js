// Bakiye Yönetim Sistemi - Tüm sayfalardan erişilebilir
// Binance bakiyesini Supabase üzerinden çeker ve gösterir

class BalanceManager {
    constructor() {
        this.SUPABASE_URL = 'https://hsdrpjgswsahtnmwobll.supabase.co';
        this.SUPABASE_ANON_KEY = 'sb_publishable_HMNycDbCD-n3kdoJAk_nxw_00IWbKWb'; // Config'den alınacak
        this.BALANCE_FUNCTION_URL = `${this.SUPABASE_URL}/functions/v1/binance-balance`;
        this.balance = null;
        this.isLoading = false;
        this.lastUpdate = null;
        this.error = null;
        this.updateInterval = 60000; // 1 dakika
        
        this.init();
    }

    init() {
        console.log('💰 Balance Manager initialized');
        this.loadBalance();
        this.startAutoUpdate();
    }

    async loadBalance() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.updateUI();
        
        try {
            console.log('🔄 Loading balance from Supabase...');
            
            // Config'den Supabase anahtarını al
            const apiKey = this.getSupabaseKey();
            if (!apiKey || apiKey === 'SUPABASE_ANON_KEY') {
                throw new Error('Supabase anahtarı yapılandırılmamış');
            }

            const res = await fetch(this.BALANCE_FUNCTION_URL, {
                headers: { 
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!res.ok) {
                throw new Error(`Balance API error: ${res.status}`);
            }

            const data = await res.json();
            
            if (data.availableBalance !== undefined) {
                this.balance = data.availableBalance;
                this.lastUpdate = new Date();
                this.error = null;
                
                console.log('💰 Balance loaded:', {
                    balance: this.balance,
                    currency: data.currency || 'USDT',
                    timestamp: this.lastUpdate
                });
                
                // localStorage'a kaydet
                this.saveToCache();
                this.updateUI();
                this.notifyBalanceUpdate();
            } else {
                throw new Error('Invalid balance data');
            }
            
        } catch (error) {
            console.error('❌ Balance loading error:', error);
            this.error = error.message;
            
            // Cache'den yükle dene
            this.loadFromCache();
            this.updateUI();
        } finally {
            this.isLoading = false;
        }
    }

    getSupabaseKey() {
        // 1. Önce class içindeki anahtarı kullan
        if (this.SUPABASE_ANON_KEY && this.SUPABASE_ANON_KEY !== 'SUPABASE_ANON_KEY') {
            return this.SUPABASE_ANON_KEY;
        }
        
        // 2. Window config'den al
        if (window.SUPABASE_ANON_KEY && window.SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
            return window.SUPABASE_ANON_KEY;
        }
        
        // 3. Global değişkenden al
        if (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
            return SUPABASE_ANON_KEY;
        }
        
        console.warn('⚠️ Supabase anahtarı bulunamadı, mevcut anahtar:', this.SUPABASE_ANON_KEY);
        return this.SUPABASE_ANON_KEY;
    }

    saveToCache() {
        try {
            const cacheData = {
                balance: this.balance,
                lastUpdate: this.lastUpdate,
                timestamp: Date.now()
            };
            localStorage.setItem('balanceCache', JSON.stringify(cacheData));
        } catch (error) {
            console.warn('⚠️ Failed to cache balance:', error);
        }
    }

    loadFromCache() {
        try {
            const cached = localStorage.getItem('balanceCache');
            if (cached) {
                const data = JSON.parse(cached);
                const age = Date.now() - data.timestamp;
                
                // Cache 5 dakikadan yeniyse kullan
                if (age < 300000 && data.balance !== null) {
                    this.balance = data.balance;
                    this.lastUpdate = new Date(data.lastUpdate);
                    console.log('💰 Balance loaded from cache:', this.balance);
                }
            }
        } catch (error) {
            console.warn('⚠️ Failed to load balance from cache:', error);
        }
    }

    startAutoUpdate() {
        // Her 1 dakikada bir güncelle
        setInterval(() => {
            this.loadBalance();
        }, this.updateInterval);
    }

    updateUI() {
        const balanceElements = document.querySelectorAll('[data-balance-display]');
        balanceElements.forEach(element => {
            this.renderBalance(element);
        });
    }

    renderBalance(element) {
        const isCompact = element.dataset.balanceDisplay === 'compact';
        const isDetailed = element.dataset.balanceDisplay === 'detailed';
        
        let html = '';
        
        if (this.isLoading) {
            html = isCompact ? 
                '<div class="flex items-center gap-2"><div class="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div><span class="text-sm">Yükleniyor...</span></div>' :
                '<div class="flex items-center justify-center p-4"><div class="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div><span class="ml-2">Bakiye yükleniyor...</span></div>';
        } else if (this.error) {
            html = isCompact ?
                '<div class="flex items-center gap-2 text-red-500"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span class="text-sm">Hata</span></div>' :
                `<div class="text-red-500 text-center p-4"><svg class="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><div>Bakiye yüklenemedi</div><div class="text-sm opacity-75">${this.error}</div></div>`;
        } else if (this.balance !== null) {
            const formattedBalance = this.formatBalance(this.balance);
            const lastUpdateText = this.lastUpdate ? this.formatTime(this.lastUpdate) : '';
            
            if (isCompact) {
                html = `
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <span class="text-sm font-semibold text-green-600">${formattedBalance}</span>
                    </div>
                `;
            } else if (isDetailed) {
                html = `
                    <div class="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 shadow-sm">
                        <div class="flex items-center justify-between mb-2">
                            <h3 class="text-sm font-medium text-gray-700">Binance Bakiye</h3>
                            <div class="flex items-center gap-1">
                                <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                <span class="text-xs text-gray-500">Canlı</span>
                            </div>
                        </div>
                        <div class="text-2xl font-bold text-green-600 mb-1">${formattedBalance}</div>
                        <div class="text-xs text-gray-500">Son güncelleme: ${lastUpdateText}</div>
                        <button onclick="window.balanceManager.loadBalance()" class="mt-2 text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 transition-colors">
                            Yenile
                        </button>
                    </div>
                `;
            } else {
                // Default display
                html = `
                    <div class="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                        <div class="flex-shrink-0">
                            <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                        </div>
                        <div class="flex-1">
                            <div class="text-sm text-gray-500">Mevcut Bakiye</div>
                            <div class="text-lg font-semibold text-green-600">${formattedBalance}</div>
                            ${lastUpdateText ? `<div class="text-xs text-gray-400">${lastUpdateText}</div>` : ''}
                        </div>
                        <button onclick="window.balanceManager.loadBalance()" class="text-gray-400 hover:text-gray-600 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                            </svg>
                        </button>
                    </div>
                `;
            }
        } else {
            html = '<div class="text-gray-500 text-center p-4">Bakiye bilgisi yok</div>';
        }
        
        element.innerHTML = html;
    }

    formatBalance(balance) {
        const num = parseFloat(balance);
        if (isNaN(num)) return '0.00 USDT';
        
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num).replace('$', '') + ' USDT';
    }

    formatTime(date) {
        const now = new Date();
        const diff = Math.floor((now - date) / 1000); // saniye
        
        if (diff < 60) return 'Az önce';
        if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
        return date.toLocaleDateString('tr-TR');
    }

    notifyBalanceUpdate() {
        // Event dispatch et - diğer sistemler bu eventi dinleyebilir
        const event = new CustomEvent('balanceUpdated', {
            detail: {
                balance: this.balance,
                lastUpdate: this.lastUpdate
            }
        });
        document.dispatchEvent(event);
    }

    // Public API
    getBalance() {
        return this.balance;
    }

    isLoadingBalance() {
        return this.isLoading;
    }

    getBalanceError() {
        return this.error;
    }

    getLastUpdate() {
        return this.lastUpdate;
    }

    // Manuel yenileme
    async refreshBalance() {
        await this.loadBalance();
    }
}

// Global instance oluştur
if (typeof window !== 'undefined') {
    window.balanceManager = new BalanceManager();
    
    // Global event listener
    window.addEventListener('balanceUpdated', (event) => {
        console.log('💰 Balance updated event:', event.detail);
    });
    
    // Global fonksiyonlar
    window.refreshBalance = () => window.balanceManager.refreshBalance();
    window.getBalance = () => window.balanceManager.getBalance();
}

// Node.js için export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BalanceManager;
}
