// ─────────────────────────────────────────────────────────────────────────────
//  City Metro Alerts - site configuration (shared by every page)
//  Edit the three values marked  <-- CHANGE  and re-upload to Cloudflare Pages.
// ─────────────────────────────────────────────────────────────────────────────

const METRO_CONFIG = {
  // Public URL of the Cloudflare Worker (no trailing slash needed)
  API_BASE: 'https://ride-metro.felixfeger46.workers.dev',            // <-- CHANGE if needed

  OIDC: {
    // Authentik issuer URL: Applications -> your app -> Provider -> "OpenID Configuration Issuer".
    // Must end with a slash and must match the Worker's OIDC_ISSUER exactly.
    issuer:   'https://auth.citymetro.xyz/application/o/live-alerts/', // <-- CHANGE slug

    // Authentik provider "Client ID" (public client - there is no secret in the browser)
    clientId: '2bprQHtlY0kNeHBoQ5KT85gXTdCU5h1fmv4TR5qx',                      // <-- CHANGE

    scopes: 'openid profile email offline_access',

    // true  = "Sign out" also ends the Authentik session (recommended on shared devices;
    //         needs https://<your-site>/ registered as a Post Logout Redirect URI)
    // false = "Sign out" only clears this site
    signOutOfSso: true,
  },
};

const API_BASE = METRO_CONFIG.API_BASE.replace(/\/+$/, '');
