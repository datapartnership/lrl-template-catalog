/*
 * Catalog template configuration.
 * Edit this file to point the template at your catalog API and to brand it.
 * Nothing else needs to change for a standard deployment.
 */
window.CATALOG_CONFIG = {
  // ── Branding ─────────────────────────────────────────────
  siteTitle: "Language Data Catalog",
  tagline: "Licensed text and audio collections for building language technology",
  intro:
    "A catalog of licensed datasets for researchers and commercial subscribers. " +
    "Browse what is available, read how access works, and apply for the data you need.",
  orgName: "Your Organization",
  orgUrl: "https://example.org",
  contactEmail: "data@example.org",

  // ── API ──────────────────────────────────────────────────
  // Base URL of the catalog API, with no trailing slash. Leave empty to run
  // in sample mode, which uses the files in /sample-data and needs no server.
  apiBaseUrl: "",
  // Set to true to force sample mode even when apiBaseUrl is set.
  useSampleData: false,

  // The names below are the single place where the template's assumptions
  // about the API are written down. Check them against your API's Swagger UI.
  paging: { page: "page", pageSize: "pageSize", defaultPageSize: 12 },
  filters: {
    search: "search",
    language: "language",
    mediaType: "mediaType",
    provider: "provider",
    theme: "theme"
  },

  // ── Sign-in (OpenID Connect, authorization code flow with PKCE) ──
  // Leave authority empty to hide the sign-in button.
  auth: {
    authority: "",          // e.g. https://login.example.org/realms/catalog
    clientId: "",           // a public (no secret) client registered for this site
    scope: "openid profile"
  },

  // ── Applications for access ──────────────────────────────
  // "link": send people to the forms below.
  // "api":  researchers fill in the form on this site, which posts to
  //         POST /api/applications. Commercial subscribers always use their own form.
  applications: {
    mode: "link",
    researcherFormUrl: "https://example.org/apply/researcher",
    subscriberFormUrl: "https://example.org/apply/subscriber"
  },

  // ── Legal documents (shown on the Access tab) ────────────
  legalDocs: [
    { label: "Researcher access terms", url: "https://example.org/legal/researcher-terms" },
    { label: "Commercial subscriber terms", url: "https://example.org/legal/subscriber-terms" }
  ],

  // Static file with provider descriptions (the API only returns provider names).
  providersUrl: "sample-data/providers.json"
};
