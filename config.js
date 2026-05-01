// Uygulama yapılandırması
// Supabase anon key istemci tarafında kullanılabilir (public), service_role key KULLANMAYIN.

window.APP_CONFIG = Object.freeze({
    API_BASE_URL: 'https://analiz-w2g4.onrender.com',
    SUPABASE_URL: 'https://hsdrpjgswsahtnmwobll.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_HMNycDbCD-n3kdoJAk_nxw_00IWbKWb'
});

window.API_BASE_URL = window.APP_CONFIG.API_BASE_URL;
window.SUPABASE_URL = window.APP_CONFIG.SUPABASE_URL;
window.SUPABASE_ANON_KEY = window.APP_CONFIG.SUPABASE_ANON_KEY;
