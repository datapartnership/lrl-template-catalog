/*
 * Sign-in with OpenID Connect, authorization code flow with PKCE.
 * Works with Microsoft Entra ID, Keycloak and other standard providers.
 * The access token is kept in sessionStorage, so it disappears when the tab closes.
 * No client secret is used or needed.
 */
(function () {
  "use strict";
  const cfg = window.CATALOG_CONFIG.auth || {};
  const KEY = "catalog.auth";
  const PENDING = "catalog.auth.pending";
  let metadata = null;

  const configured = Boolean(cfg.authority && cfg.clientId);
  const redirectUri = () => window.location.origin + window.location.pathname;

  function store(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ } }
  function load(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch (e) { return null; } }
  function clear(key) { try { sessionStorage.removeItem(key); } catch (e) { /* ignore */ } }

  function b64url(bytes) {
    let s = "";
    bytes.forEach((b) => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function randomString(n) { return b64url(crypto.getRandomValues(new Uint8Array(n))); }
  async function challengeFor(verifier) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return b64url(new Uint8Array(digest));
  }

  async function discover() {
    if (metadata) return metadata;
    const res = await fetch(cfg.authority.replace(/\/$/, "") + "/.well-known/openid-configuration");
    if (!res.ok) throw new Error("Could not reach the sign-in service.");
    metadata = await res.json();
    return metadata;
  }

  function session() {
    const s = load(KEY);
    if (!s || !s.accessToken || Date.now() > s.expiresAt - 15000) { if (s) clear(KEY); return null; }
    return s;
  }

  const Auth = {
    isConfigured: configured,
    isSignedIn: () => Boolean(session()),
    getToken: () => (session() || {}).accessToken || null,

    async login() {
      const meta = await discover();
      const verifier = randomString(48);
      const state = randomString(16);
      store(PENDING, { verifier, state, returnTo: window.location.hash || "#browse" });
      const url = new URL(meta.authorization_endpoint);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: cfg.clientId,
        redirect_uri: redirectUri(),
        scope: cfg.scope || "openid profile",
        state,
        code_challenge: await challengeFor(verifier),
        code_challenge_method: "S256"
      }).toString();
      window.location.assign(url.toString());
    },

    // Call once on page load. Returns true if it completed a sign-in.
    async handleCallback() {
      const params = new URLSearchParams(window.location.search);
      if (!configured || !params.has("code") || !params.has("state")) return false;
      const pending = load(PENDING);
      clear(PENDING);
      const cleanUrl = redirectUri() + (pending && pending.returnTo ? pending.returnTo : "");
      window.history.replaceState({}, "", cleanUrl);
      if (!pending || pending.state !== params.get("state")) throw new Error("Sign-in could not be verified. Please try again.");
      const meta = await discover();
      const res = await fetch(meta.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: params.get("code"),
          redirect_uri: redirectUri(),
          client_id: cfg.clientId,
          code_verifier: pending.verifier
        })
      });
      if (!res.ok) throw new Error("Sign-in failed. Please try again.");
      const t = await res.json();
      store(KEY, { accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in || 300) * 1000 });
      return true;
    },

    logout() { clear(KEY); }
  };

  window.CatalogAuth = Auth;
})();
