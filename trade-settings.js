// Trade Settings - Tek Merkezden Yönetim
// Tüm trade ayarları bu dosyadan yönetilir

class TradeSettingsManager {
    constructor() {
        this.DEFAULT_SETTINGS = Object.freeze({
            kaldirac: 10,
            pozisyon_usdt: 1
        });
        this.STORAGE_KEY = 'tradeSettings';
        
        // Başlangıçta ayarları kontrol et ve varsayılanları ayarla
        this.initializeSettings();
    }

    initializeSettings() {
        const current = this.getSettings();
        console.log('🔧 Trade Settings Manager initialized:', current);
    }

    getSettings() {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        let parsed = {};
        try {
            parsed = raw ? JSON.parse(raw) : {};
        } catch (e) {
            console.error('❌ Trade Settings parse error:', e);
            parsed = {};
        }

        const kaldirac = Number(parsed?.kaldirac);
        const pozisyonUsdt = Number(parsed?.pozisyon_usdt);

        const settings = {
            kaldirac: Number.isFinite(kaldirac) && kaldirac > 0 ? kaldirac : this.DEFAULT_SETTINGS.kaldirac,
            pozisyon_usdt: Number.isFinite(pozisyonUsdt) && pozisyonUsdt > 0 ? pozisyonUsdt : this.DEFAULT_SETTINGS.pozisyon_usdt
        };

        // Debug logging
        console.log('🔧 Trade Settings Debug:', {
            rawLocalStorage: raw,
            parsed: parsed,
            finalSettings: settings,
            defaults: this.DEFAULT_SETTINGS
        });

        return settings;
    }

    saveSettings(kaldirac, pozisyon_usdt) {
        if (!Number.isFinite(kaldirac) || kaldirac <= 0 || !Number.isFinite(pozisyon_usdt) || pozisyon_usdt <= 0) {
            throw new Error('Geçersiz değerler: pozitif sayılar girilmeli');
        }

        const newSettings = { kaldirac, pozisyon_usdt };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(newSettings));
        
        console.log('💾 Trade Settings saved:', newSettings);
        return newSettings;
    }

    resetToDefaults() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.DEFAULT_SETTINGS));
        console.log('🔄 Trade Settings reset to defaults:', this.DEFAULT_SETTINGS);
        return this.DEFAULT_SETTINGS;
    }

    // Debug ve test fonksiyonu
    testSettings() {
        console.log('🧪 Testing Trade Settings...');
        
        // Mevcut durumu kontrol et
        const current = this.getSettings();
        console.log('📋 Current settings:', current);
        
        // Test değerleri ayarla (1 USD, 10x kaldıraç)
        const testSettings = this.saveSettings(10, 1);
        console.log('🔧 Test settings saved:', testSettings);
        
        // Okuma testi
        const readBack = this.getSettings();
        console.log('✅ Settings read back:', readBack);
        
        // Doğrulama
        if (readBack.kaldirac === 10 && readBack.pozisyon_usdt === 1) {
            console.log('🎉 SUCCESS: Settings are correct!');
            return true;
        } else {
            console.log('❌ FAILURE: Settings are incorrect!');
            return false;
        }
    }
}

// Global instance oluştur
if (typeof window !== 'undefined') {
    window.tradeSettingsManager = new TradeSettingsManager();
    
    // Global fonksiyonlar (backward compatibility)
    window.getTradeSettings = () => window.tradeSettingsManager.getSettings();
    window.testTradeSettings = () => window.tradeSettingsManager.testSettings();
    
    // Auto-test in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        setTimeout(() => window.tradeSettingsManager.testSettings(), 1000);
    }
}

// Node.js için export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TradeSettingsManager;
}
