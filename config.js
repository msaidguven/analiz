// Uygulama yapılandırması
// Supabase anon key istemci tarafında kullanılabilir (public), service_role key KULLANMAYIN.

window.APP_CONFIG = Object.freeze({
    API_BASE_URL: '',
    SUPABASE_URL: 'https://hsdrpjgswsahtnmwobll.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_HMNycDbCD-n3kdoJAk_nxw_00IWbKWb',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzZHJwamdzd3NhaHRubXdvYmxsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ0MTcxOSwiZXhwIjoyMDkyMDE3NzE5fQ.iJ3maGq7UqNB33kzzqC38jSi7b7DrDkXH-XltmHkHLo' // Buraya doğru service role key'i girin
});

window.API_BASE_URL = window.APP_CONFIG.API_BASE_URL;
window.SUPABASE_URL = window.APP_CONFIG.SUPABASE_URL;
window.SUPABASE_ANON_KEY = window.APP_CONFIG.SUPABASE_ANON_KEY;
window.SUPABASE_SERVICE_ROLE_KEY = window.APP_CONFIG.SUPABASE_SERVICE_ROLE_KEY;
