/**
 * City Metro Alerts - Authentik sign-in (OpenID Connect, Authorization Code + PKCE).
 *
 * Public client: no secret lives in the browser. Tokens are kept in sessionStorage
 * (cleared when the tab closes; signing back in is instant while the Authentik
 * session is alive). The Worker re-verifies every token on every request, so
 * nothing here is trusted for security - it only drives the UI.
 *
 * Needs config.js loaded first.
 */
const MetroAuth = (() => {
  const cfg         = METRO_CONFIG.OIDC;
  const issuer      = cfg.issuer.replace(/\/?$/, '/');
  const redirectUri = location.origin + '/callback';
  const K_TOKENS    = 'metro.tokens';
  const K_TX        = 'metro.tx';

  // ── helpers ────────────────────────────────────────────────────────────────
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const rand = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

  async function sha256(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  }

  function decode(jwt) {
    const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(p + '='.repeat((4 - p.length % 4) % 4)))));
  }

  const readTokens  = () => { try { return JSON.parse(sessionStorage.getItem(K_TOKENS)); } catch { return null; } };
  const writeTokens = t  => sessionStorage.setItem(K_TOKENS, JSON.stringify(t));
  const clearTokens = () => sessionStorage.removeItem(K_TOKENS);

  function authError(msg = 'Please sign in') {
    const e = new Error(msg); e.code = 'AUTH'; return e;
  }

  let discoveryP;
  function discovery() {
    discoveryP ||= fetch(issuer + '.well-known/openid-configuration').then(r => {
      if (!r.ok) throw new Error('Could not reach the City Metro sign-in service');
      return r.json();
    });
    return discoveryP;
  }

  // ── sign in ────────────────────────────────────────────────────────────────
  async function login(returnTo = location.pathname + location.search) {
    const d        = await discovery();
    const verifier = rand(48);
    const state    = rand(16);
    const nonce    = rand(16);

    sessionStorage.setItem(K_TX, JSON.stringify({ verifier, state, nonce, returnTo }));

    const q = new URLSearchParams({
      response_type:         'code',
      client_id:             cfg.clientId,
      redirect_uri:          redirectUri,
      scope:                 cfg.scopes,
      state, nonce,
      code_challenge:        b64url(await sha256(verifier)),
      code_challenge_method: 'S256',
    });
    location.assign(d.authorization_endpoint + '?' + q);
  }

  // Called from callback.html. Resolves to the path to send the user back to.
  async function handleCallback() {
    const p  = new URLSearchParams(location.search);
    const tx = JSON.parse(sessionStorage.getItem(K_TX) || 'null');
    sessionStorage.removeItem(K_TX);

    if (p.get('error')) throw new Error(p.get('error_description') || p.get('error'));
    if (!tx || !p.get('code') || p.get('state') !== tx.state)
      throw new Error('Sign-in session expired. Please try again.');

    const d   = await discovery();
    const res = await fetch(d.token_endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code:          p.get('code'),
        redirect_uri:  redirectUri,
        client_id:     cfg.clientId,
        code_verifier: tx.verifier,
      }),
    });
    const t = await res.json();
    if (!res.ok || !t.id_token) throw new Error(t.error_description || 'Sign-in failed');
    if (decode(t.id_token).nonce !== tx.nonce) throw new Error('Sign-in could not be verified. Please try again.');

    writeTokens({ id_token: t.id_token, refresh_token: t.refresh_token || null });
    return tx.returnTo || '/portal';
  }

  // ── tokens ─────────────────────────────────────────────────────────────────
  let refreshP;
  async function refresh(t) {
    refreshP ||= (async () => {
      try {
        const d   = await discovery();
        const res = await fetch(d.token_endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token', client_id: cfg.clientId, refresh_token: t.refresh_token,
          }),
        });
        const n = await res.json();
        if (!res.ok || !n.id_token) throw new Error('refresh failed');
        const next = { id_token: n.id_token, refresh_token: n.refresh_token || t.refresh_token };
        writeTokens(next);
        return next;
      } catch { clearTokens(); return null; }
      finally { refreshP = null; }
    })();
    return refreshP;
  }

  // A valid ID token, refreshing it if it is about to expire; null if signed out.
  async function getToken() {
    let t = readTokens();
    if (!t) return null;
    if (decode(t.id_token).exp - Date.now() / 1000 > 60) return t.id_token;
    if (t.refresh_token) t = await refresh(t); else { clearTokens(); t = null; }
    return t ? t.id_token : null;
  }

  function user() {
    const t = readTokens();
    if (!t) return null;
    const c = decode(t.id_token);
    return { sub: c.sub, email: c.email || '', name: c.name || c.preferred_username || '' };
  }

  async function logout() {
    const t = readTokens();
    clearTokens();
    if (cfg.signOutOfSso && t) {
      try {
        const d = await discovery();
        if (d.end_session_endpoint) {
          const q = new URLSearchParams({ id_token_hint: t.id_token, post_logout_redirect_uri: location.origin + '/' });
          return location.assign(d.end_session_endpoint + '?' + q);
        }
      } catch { /* fall through */ }
    }
    location.assign('/');
  }

  // ── API calls with the signed-in user's token ──────────────────────────────
  async function api(path, method = 'GET', body = null) {
    const token = await getToken();
    if (!token) throw authError();
    const r = await fetch(API_BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await r.json(); } catch { /* empty body */ }
    if (r.status === 401) { clearTokens(); throw authError('Your session has expired. Please sign in again.'); }
    if (!r.ok) { const e = new Error((data && data.error) || 'Request failed'); e.status = r.status; throw e; }
    return data;
  }

  return { login, handleCallback, getToken, user, logout, api, isSignedIn: () => !!readTokens() };
})();
