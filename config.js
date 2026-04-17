// Uygulama yapılandırması
// Supabase anon key istemci tarafında kullanılabilir (public), service_role key KULLANMAYIN.

window.APP_CONFIG = Object.freeze({
    SUPABASE_URL: 'https://hsdrpjgswsahtnmwobll.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_HMNycDbCD-n3kdoJAk_nxw_00IWbKWb'
});

window.SUPABASE_URL = window.APP_CONFIG.SUPABASE_URL;
window.SUPABASE_ANON_KEY = window.APP_CONFIG.SUPABASE_ANON_KEY;
