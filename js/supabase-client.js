// Publishable values only. The service-role key must never be shipped to the browser.
const SUPABASE_URL = window.ESVEN_SUPABASE_URL || "https://wrhgyxavswjcvtkbzmkc.supabase.co";
const SUPABASE_ANON_KEY = window.ESVEN_SUPABASE_KEY || "sb_publishable_FcTbYEdACJ_x-kDYtjWGWA_tiT4nwvO";

window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "esven-auth"
  }
});
