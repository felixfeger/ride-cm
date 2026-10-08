// ─────────────────────────────────────────────────────────────────────────────
//  City Metro Alerts - site configuration (shared by every page)
//  Authentik sign-in settings. Edit the two values marked  <-- CHANGE.
//  (The Worker URL, API_BASE, is set at the top of each HTML page.)
// ─────────────────────────────────────────────────────────────────────────────

const METRO_CONFIG = {
  OIDC: {
    // Authentik issuer URL: Applications -> your app -> Provider -> "OpenID Configuration Issuer".
    // Must end with a slash and must match the Worker's OIDC_ISSUER exactly.
    issuer:   'https://auth.citymetro.xyz/application/o/city-metro-alerts/', // <-- CHANGE slug

    // Authentik provider "Client ID" (public client - there is no secret in the browser)
    clientId: 'REPLACE_WITH_AUTHENTIK_CLIENT_ID',                      // <-- CHANGE

    scopes: 'openid profile email offline_access',

    // true  = "Sign out" also ends the Authentik session (recommended on shared devices;
    //         needs https://<your-site>/ registered as a Post Logout Redirect URI)
    // false = "Sign out" only clears this site
    signOutOfSso: true,
  },
};

