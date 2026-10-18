/* Catalog user interface. All page text built from data is inserted as text, never as HTML. */
(function () {
  "use strict";
  const cfg = window.CATALOG_CONFIG;
  const API = window.CatalogAPI;
  const Auth = window.CatalogAuth;
  const $ = (id) => document.getElementById(id);

  const TABS = ["browse", "providers", "access", "license", "api", "metadata", "about"];
  const state = { page: 1, search: "", language: "", mediaType: "", provider: "", theme: "" };
  let facets = null;

  // ───────── helpers ─────────
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    children.flat().forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  }
  // The API gives a language code such as "sw". Show the language name when the browser can supply it.
  const langNames = (() => { try { return new Intl.DisplayNames(["en"], { type: "language" }); } catch (e) { return null; } })();
  function langName(v) {
    if (!v) return "";
    if (cfg.languageNames && cfg.languageNames[v]) return cfg.languageNames[v];
    if (langNames && /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/i.test(v)) {
      try { const n = langNames.of(v); if (n && n !== v) return n; } catch (e) { /* not a valid code */ }
    }
    return v;
  }
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
  const fmt = (n) => (n === null || n === undefined ? "" : Number(n).toLocaleString());
  function hours(v) {
    if (!v) return "";
    return (v < 1 ? Math.round(v * 60) + " minutes" : (v < 10 ? v.toFixed(1) : Math.round(v)) + " hours");
  }
  function years(c) {
    if (!c.yearStart && !c.yearEnd) return "";
    return c.yearStart && c.yearEnd && c.yearStart !== c.yearEnd ? c.yearStart + "–" + c.yearEnd : String(c.yearStart || c.yearEnd);
  }
  function seconds(v) {
    if (!v) return "";
    const m = Math.round(v / 60);
    return m < 1 ? Math.round(v) + " sec" : m + " min";
  }

  // ───────── branding ─────────
  function applyBranding() {
    document.title = cfg.siteTitle;
    $("site-title").textContent = cfg.siteTitle;
    $("site-tagline").textContent = cfg.tagline || "";
    $("site-intro").textContent = cfg.intro || "";
    $("org-name").textContent = cfg.orgName;
    $("org-link").setAttribute("href", cfg.orgUrl || "#browse");
    $("footer-text").textContent = "© " + new Date().getFullYear() + " " + cfg.orgName;
    if (API.isSample) $("sample-banner").hidden = false;
  }

  // ───────── content pages ─────────
  async function loadPages() {
    const panels = document.querySelectorAll("[data-page]");
    await Promise.all([...panels].map(async (panel) => {
      try {
        const res = await fetch(panel.dataset.page);
        if (!res.ok) throw new Error(String(res.status));
        panel.innerHTML = await res.text();   // trusted: these files ship with the site
      } catch (e) {
        panel.textContent = "This page could not be loaded.";
      }
    }));
    document.querySelectorAll("[data-api-base]").forEach((el) => { el.textContent = cfg.apiBaseUrl || "https://api.example.org"; });
    document.querySelectorAll("[data-contact-email]").forEach((el) => {
      el.textContent = cfg.contactEmail;
      el.setAttribute("href", "mailto:" + cfg.contactEmail);
    });
    document.querySelectorAll(".legal-docs").forEach((ul) => {
      (cfg.legalDocs || []).forEach((d) => ul.append(h("li", null, h("a", { href: d.url, target: "_blank", rel: "noopener" }, d.label))));
    });
  }

  // ───────── routing ─────────
  function showTab() {
    const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "browse";
    TABS.forEach((t) => { $("panel-" + t).hidden = t !== tab; });
    document.querySelectorAll("[data-tab]").forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  // After choosing a tab, bring the tab bar to the top so the new content is in view.
  function scrollToBar() {
    const bar = $("tabs-bar");
    if (!bar) return;
    const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bar.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }

  // ───────── sign-in ─────────
  function renderAccount() {
    const show = Auth.isConfigured && !API.isSample;
    const signedIn = Auth.isSignedIn();
    $("signin-btn").hidden = !show || signedIn;
    $("user-chip").hidden = !show || !signedIn;
  }
  function signIn() {
    Auth.login().catch((e) => showNotice(e.message));
  }

  // ───────── errors ─────────
  function messageFor(err) {
    if (!(err instanceof API.ApiError)) return "Something went wrong. Please try again.";
    const b = err.body || {};
    switch (err.status) {
      case 0: return "The catalog could not be reached. Check your connection, or ask the site administrator to check the API address and cross-origin settings.";
      case 401: return "Please sign in to continue. If you were signed in, your session may have expired.";
      case 403: return "Your account does not have access yet. Access must be approved after you apply.";
      case 404: return "That item could not be found.";
      case 422: return "That file could not be read, so it is unavailable.";
      case 429: return "You have reached the daily download limit" +
        (b.limit ? " (" + fmt(b.used) + " of " + fmt(b.limit) + " downloads used today)" : "") + ". The limit resets at midnight UTC.";
      default: return "The catalog returned an error (" + err.status + "). Please try again later.";
    }
  }
  function showNotice(text) {
    $("site-notice-text").textContent = text;
    $("site-notice").hidden = !text;
  }

  // ───────── browse ─────────
  function fillSelect(id, list, label) {
    const sel = $(id);
    const keep = sel.value;
    clear(sel);
    sel.append(h("option", { value: "" }, "All"));
    list.forEach((f) => sel.append(h("option", { value: f.value }, (label ? label(f.value) : f.value) + (f.count !== null ? " (" + fmt(f.count) + ")" : ""))));
    sel.value = keep;
  }

  function entryCard(c) {
    const stats = [c.fileCount !== null ? fmt(c.fileCount) + " files" : "", hours(c.hours), years(c)].filter(Boolean).join(" · ");
    return h("article", { class: "entry" },
      h("p", { class: "meta" }, [c.mediaType, langName(c.language), c.provider].filter(Boolean).join(" · ")),
      h("h3", null, h("button", { type: "button", class: "entry-title", onclick: () => openDetail(c) }, c.name)),
      c.description ? h("p", { class: "entry-desc" }, c.description) : null,
      stats ? h("p", { class: "entry-stats" }, stats) : null,
      c.themes.length ? h("ul", { class: "chips", "aria-label": "Themes" }, c.themes.slice(0, 4).map((t) => h("li", null, t))) : null);
  }

  function renderPagination(el, page, pageSize, total, go) {
    clear(el);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (pages <= 1) return;
    el.append(
      h("button", { type: "button", class: "btn btn-small btn-ghost", disabled: page <= 1, onclick: () => go(page - 1) }, "Previous"),
      h("span", { class: "page-info" }, "Page " + page + " of " + pages),
      h("button", { type: "button", class: "btn btn-small btn-ghost", disabled: page >= pages, onclick: () => go(page + 1) }, "Next"));
  }

  let loadToken = 0;
  async function loadCollections() {
    const mine = ++loadToken;
    const list = $("entries");
    $("result-count").textContent = "Loading…";
    try {
      const r = await API.getCollections(state);
      if (mine !== loadToken) return;
      clear(list);
      if (!r.items.length) list.append(h("p", { class: "empty" }, "No collections match these filters."));
      r.items.forEach((c) => list.append(entryCard(c)));
      $("result-count").textContent = fmt(r.total) + (r.total === 1 ? " collection" : " collections");
      renderPagination($("pagination"), r.page, r.pageSize || r.items.length || 1, r.total, (p) => { state.page = p; loadCollections(); window.scrollTo({ top: $("panel-browse").offsetTop - 80 }); });
    } catch (e) {
      if (mine !== loadToken) return;
      clear(list);
      list.append(h("p", { class: "empty" }, messageFor(e)));
      $("result-count").textContent = "";
      clear($("pagination"));
    }
  }

  function wireFilters() {
    let timer;
    $("f-search").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.search = e.target.value.trim(); state.page = 1; loadCollections(); }, 250);
    });
    ["language", "mediaType", "provider", "theme"].forEach((k) => {
      $("f-" + k).addEventListener("change", (e) => { state[k] = e.target.value; state.page = 1; loadCollections(); });
    });
    $("filters").addEventListener("reset", () => {
      Object.assign(state, { page: 1, search: "", language: "", mediaType: "", provider: "", theme: "" });
      setTimeout(loadCollections, 0);
    });
    $("filters").addEventListener("submit", (e) => e.preventDefault());
  }

  async function loadFacets() {
    try {
      facets = await API.getFacets();
      fillSelect("f-language", facets.language, langName);
      fillSelect("f-mediaType", facets.mediaType);
      fillSelect("f-provider", facets.provider);
      fillSelect("f-theme", facets.theme);
    } catch (e) { /* the browse list reports the error */ }
  }

  // ───────── providers ─────────
  const slugify = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const plural = (n, one, many) => fmt(n) + " " + (n === 1 ? one : many);

  function chevron() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "chevron");
    svg.setAttribute("aria-hidden", "true");
    const line = document.createElementNS(ns, "polyline");
    line.setAttribute("points", "6 9 12 15 18 9");
    svg.append(line);
    return svg;
  }

  function collectionTable(items) {
    const rows = items.map((c) => h("tr", null,
      h("td", { class: "col-name" }, c.name),
      h("td", null, c.description),
      h("td", null, langName(c.language)),
      h("td", null, c.mediaType),
      h("td", null, c.hours ? hours(c.hours) : (c.fileCount !== null ? fmt(c.fileCount) + " files" : "")),
      h("td", null, years(c) || "\u2013")));
    return h("div", { class: "table-wrap" }, h("table", { class: "collection-table" },
      h("thead", null, h("tr", null, ["Collection", "Description", "Language", "Type", "Size", "Period"].map((t) => h("th", null, t)))),
      h("tbody", null, rows)));
  }

  async function fillProviderBody(p, holder, countEl) {
    clear(holder);
    holder.append(h("p", { class: "empty" }, "Loading collections\u2026"));
    try {
      const r = await API.getCollections({ provider: p.name, page: 1, pageSize: 100 });
      clear(holder);
      countEl.textContent = plural(r.total, "collection", "collections");
      if (!r.items.length) { holder.append(h("p", { class: "empty" }, "No collections registered yet.")); return; }
      holder.append(collectionTable(r.items));
      holder.append(h("p", { class: "acc-foot" },
        r.total > r.items.length ? "Showing " + fmt(r.items.length) + " of " + fmt(r.total) + ". " : "",
        h("button", { type: "button", class: "link-button", onclick: () => {
          Object.assign(state, { page: 1, search: "", language: "", mediaType: "", theme: "", provider: p.name });
          $("f-search").value = ""; ["language", "mediaType", "theme"].forEach((k) => { $("f-" + k).value = ""; });
          $("f-provider").value = p.name;
          location.hash = "browse"; loadCollections();
        } }, "View in Browse \u2192")));
    } catch (e) {
      clear(holder);
      holder.append(h("p", { class: "empty" }, messageFor(e)));
    }
  }

  function providerAccordion(p, counts, open) {
    const id = "prov-" + slugify(p.name);
    const n = counts.get(p.name);
    const countEl = h("span", { class: "acc-count" }, n !== undefined && n !== null ? plural(n, "collection", "collections") : "");
    const holder = h("div", { class: "acc-holder" });
    const body = h("div", { class: "acc-body", id, hidden: !open },
      p.description ? h("p", { class: "desc" }, p.description) : null, holder);
    let loaded = false;
    const load = () => { if (!loaded) { loaded = true; fillProviderBody(p, holder, countEl); } };
    const btn = h("button", { type: "button", class: "acc-head", "aria-expanded": String(open), "aria-controls": id,
      onclick: () => {
        const isOpen = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!isOpen));
        body.hidden = isOpen;
        if (!isOpen) load();
      } },
      h("span", { class: "acc-name" }, p.name),
      h("span", { class: "acc-right" }, countEl, chevron()));
    if (open) load();
    return h("div", { class: "accordion" }, btn, body);
  }

  async function renderProviders() {
    const box = $("providers-list"), nav = $("providers-sidenav");
    const described = await API.getProviders();
    const counts = new Map(((facets && facets.provider) || []).map((f) => [f.value, f.count]));
    const known = new Set(described.map((p) => p.name));
    const rows = described.map((p) => Object.assign({}, p, { type: p.type || "Other" }))
      .concat([...counts.keys()].filter((n) => !known.has(n)).map((n) => ({ name: n, type: "Other" })));
    clear(box); clear(nav);
    if (!rows.length) { box.append(h("p", { class: "empty" }, "No providers to show yet.")); return; }

    const order = [], groups = {};
    rows.forEach((p) => { if (!groups[p.type]) { groups[p.type] = []; order.push(p.type); } groups[p.type].push(p); });

    order.forEach((type, gi) => {
      const gid = "group-" + slugify(type);
      nav.append(h("button", { type: "button", class: "side-link", "data-group": gid, "aria-current": gi === 0 ? "true" : null,
        onclick: () => {
          const t = $(gid);
          if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - 80, behavior: "smooth" });
        } }, type));
      box.append(h("section", { class: "provider-group", id: gid },
        h("div", { class: "group-head" }, h("h3", null, type), h("span", null, plural(groups[type].length, "provider", "providers"))),
        groups[type].map((p, i) => providerAccordion(p, counts, gi === 0 && i === 0))));
    });
  }

  // Highlight the provider type currently in view.
  function watchProviderScroll() {
    window.addEventListener("scroll", () => {
      if ($("panel-providers").hidden) return;
      const groups = document.querySelectorAll(".provider-group");
      let active = groups.length ? groups[0].id : "";
      groups.forEach((g) => { if (g.getBoundingClientRect().top <= 140) active = g.id; });
      document.querySelectorAll(".side-link").forEach((b) => {
        if (b.dataset.group === active) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
      });
    }, { passive: true });
  }

  // ───────── collection detail ─────────
  const SAMPLE_SIZE = 5;
  const base = () => cfg.apiBaseUrl || "https://api.example.org";

  function apiSnippet(c, firstFileId) {
    const id = encodeURIComponent(c.id);
    const lines = [
      "# List the files in this collection",
      'curl "' + base() + "/api/catalog/collections/" + id + '/files"',
      "",
      "# Download a file (needs an approved account and a token)",
      'curl -H "Authorization: Bearer $TOKEN" \\',
      '  "' + base() + "/api/files/" + (firstFileId ? encodeURIComponent(firstFileId) : "FILE_ID") + '"'
    ];
    if (c.mediaType === "Audio" || c.mediaType === "Video") {
      lines.push("", "# Broadcast media with a paired transcription (needs the additional application step)",
        'curl -H "Authorization: Bearer $TOKEN" -o file.zip \\',
        '  "' + base() + "/api/files/" + (firstFileId ? encodeURIComponent(firstFileId) : "FILE_ID") + '/bundle"');
    }
    return lines.join("\n");
  }

  async function loadSampleFiles(c) {
    const list = $("file-list");
    clear(list);
    list.append(h("li", { class: "empty" }, "Loading sample files\u2026"));
    $("api-snippet").textContent = apiSnippet(c, null);
    try {
      const r = await API.getFiles(c.id, { page: 1, pageSize: SAMPLE_SIZE });
      const shown = r.items.slice(0, SAMPLE_SIZE);
      clear(list);
      if (!shown.length) {
        list.append(h("li", { class: "empty" }, "No sample files are listed for this collection."));
        $("sample-note").textContent = "";
        return;
      }
      shown.forEach((f) => {
        const info = [f.kind, f.format, f.words ? fmt(f.words) + " words" : "", seconds(f.seconds)].filter(Boolean).join(" \u00B7 ");
        list.append(h("li", null, h("div", null, h("span", { class: "file-name" }, f.name), info ? h("span", { class: "meta" }, info) : null)));
      });
      $("sample-note").textContent = "These are " + shown.length + " sample files" +
        (r.total > shown.length ? " out of " + fmt(r.total) : "") + ", shown so you can see what the collection contains.";
      $("api-snippet").textContent = apiSnippet(c, shown[0].id);
    } catch (e) {
      clear(list);
      list.append(h("li", { class: "empty" }, messageFor(e)));
      $("sample-note").textContent = "";
    }
  }

  function openDetail(c) {
    $("detail-title").textContent = c.name;
    $("detail-meta").textContent = [c.mediaType, langName(c.language), c.provider].filter(Boolean).join(" \u00B7 ");
    $("detail-desc").textContent = c.description || "";
    const facts = $("detail-facts");
    clear(facts);
    [["Collection ID", c.id], ["Files", c.fileCount !== null ? fmt(c.fileCount) : ""], ["Duration", hours(c.hours)], ["Years", years(c)],
     ["Themes", c.themes.join(", ")], ["License", c.license],
     ["Creator", c.creator], ["Publisher", c.publisher], ["Source organization", c.sourceOrganization],
     ["Personal information screened", c.piiScreening === null ? "" : (c.piiScreening ? "Yes" : "No")],
     ["Contains sensitive content", c.sensitiveContent === null ? "" : (c.sensitiveContent ? "Yes" : "No")]]
      .filter((r) => r[1]).forEach((r) => facts.append(h("div", null, h("dt", null, r[0]), h("dd", null, r[1]))));
    $("sample-note").textContent = "";
    $("detail").showModal();
    loadSampleFiles(c);
  }

  // ───────── access ─────────
  function wireAccess() {
    const a = cfg.applications || {};
    const rBtn = $("apply-researcher"), sBtn = $("apply-subscriber");
    sBtn.setAttribute("href", a.subscriberFormUrl || "#access");
    if (a.subscriberFormUrl) { sBtn.setAttribute("target", "_blank"); sBtn.setAttribute("rel", "noopener"); }
    if (a.mode === "api") {
      rBtn.addEventListener("click", (e) => { e.preventDefault(); $("apply-form").hidden = false; $("apply-form").scrollIntoView({ behavior: "smooth" }); });
    } else {
      rBtn.setAttribute("href", a.researcherFormUrl || "#access");
      if (a.researcherFormUrl) { rBtn.setAttribute("target", "_blank"); rBtn.setAttribute("rel", "noopener"); }
    }
    $("apply-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, status = $("apply-status");
      const data = {};
      new FormData(f).forEach((v, k) => { data[k] = typeof v === "string" ? v.trim() : v; });
      data.openSourceCommitment = f.elements.openSourceCommitment.checked;
      status.textContent = "Sending…";
      try {
        await API.submitApplication(data);
        status.textContent = "Thank you. Your application has been received and will be reviewed.";
        f.reset();
      } catch (err) {
        status.textContent = err.status === 400
          ? "Please check that every field is filled in and the commitment is ticked."
          : messageFor(err);
      }
    });
  }

  // ───────── start ─────────
  async function start() {
    applyBranding();
    wireFilters();
    await loadPages();
    wireAccess();
    $("detail-close").addEventListener("click", () => $("detail").close());
    $("detail-api-link").addEventListener("click", () => $("detail").close());
    $("detail").addEventListener("click", (e) => { if (e.target === $("detail")) $("detail").close(); });
    $("signin-btn").addEventListener("click", signIn);
    $("signout-btn").addEventListener("click", () => { Auth.logout(); renderAccount(); });
    window.addEventListener("hashchange", () => { showTab(); scrollToBar(); });
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      const tab = a.getAttribute("href").slice(1);
      if (!TABS.includes(tab)) return;
      e.preventDefault();
      if (location.hash === "#" + tab) { showTab(); scrollToBar(); } else { location.hash = tab; }
    });
    try { await Auth.handleCallback(); } catch (e) { showNotice(e.message); }
    renderAccount();
    showTab();
    await loadFacets();
    loadCollections();
    renderProviders();
    watchProviderScroll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
