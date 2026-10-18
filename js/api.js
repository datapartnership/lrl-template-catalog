/*
 * Catalog API client.
 *
 * Two modes, chosen in js/config.js:
 *   - live:   calls the catalog API at apiBaseUrl
 *   - sample: reads /sample-data and imitates the API, so the template runs with no server
 *
 * The "contract" section below is the only place that knows the API's field names.
 * If your API names things differently, change the normalise functions there.
 */
(function () {
  "use strict";
  const cfg = window.CATALOG_CONFIG;
  const isSample = Boolean(cfg.useSampleData || !cfg.apiBaseUrl);

  class ApiError extends Error {
    constructor(status, body) {
      super("API error " + status);
      this.status = status;   // 0 means the request never reached the API (network or CORS)
      this.body = body;
    }
  }

  // ───────── Contract: how this template reads API responses ─────────
  const pick = (o, keys, fallback) => {
    for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
    return fallback;
  };
  const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
  const textList = (v) => (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === "string" ? x : pick(x, ["value", "name", "label"], "")))
    .filter(Boolean);

  const orgName = (v) => (v && typeof v === "object" ? String(pick(v, ["name", "sc:name"], "")) : (v ? String(v) : ""));
  const nameFromPrefix = (p) => String(p || "").replace(/\/+$/, "").split("/").pop().replace(/[_-]+/g, " ").trim();
  // The API documents temporal coverage as an interval such as "2022-01-01/2025-12-31".
  function yearsFrom(c) {
    const cov = String(pick(c, ["temporalCoverage"], "")).split("/");
    const y = (t) => (/^\d{4}/.test(t || "") ? Number(t.slice(0, 4)) : null);
    const start = y(cov[0]), end = y(cov[1]);
    return { start: start || num(pick(c, ["yearStart", "startYear"], null)), end: end || start || num(pick(c, ["yearEnd", "endYear"], null)) };
  }

  function normaliseCollection(c) {
    const seconds = num(pick(c, ["totalDurationSeconds", "durationSeconds"], null));
    const yrs = yearsFrom(c);
    return {
      id: String(pick(c, ["id", "identifier"], "")),
      // The documented model has no title field, so fall back to the collection's storage folder name.
      name: pick(c, ["name", "title"], "") || nameFromPrefix(pick(c, ["storagePrefix"], "")) || "Untitled collection",
      provider: pick(c, ["provider"], ""),
      language: pick(c, ["languageCode", "language", "inLanguage"], ""),
      mediaType: pick(c, ["mediaType", "kind"], ""),
      description: pick(c, ["description"], ""),
      fileCount: num(pick(c, ["fileCount"], null)),
      hours: seconds ? seconds / 3600 : null,
      yearStart: yrs.start,
      yearEnd: yrs.end,
      themes: textList(pick(c, ["themes", "keywords"], [])),
      license: pick(c, ["license"], ""),
      creator: orgName(pick(c, ["creator"], "")),
      publisher: orgName(pick(c, ["publisher"], "")),
      sourceOrganization: orgName(pick(c, ["sourceOrganization"], "")),
      piiScreening: pick(c, ["piiScreening"], null),
      sensitiveContent: pick(c, ["sensitiveContent"], null)
    };
  }

  function normaliseFile(f) {
    const rawName = pick(f, ["name", "title", "fileName", "contentUrl"], "File");
    return {
      id: String(pick(f, ["id", "identifier"], "")),
      name: String(rawName).split("/").pop(),
      kind: pick(f, ["kind", "fileKind"], ""),
      format: pick(f, ["encodingFormat", "format"], ""),
      words: num(pick(f, ["wordCount"], null)),
      seconds: num(pick(f, ["duration", "durationSeconds"], null)),
      author: pick(f, ["author"], "")
    };
  }

  // Accepts a plain array or an envelope such as { items, total, page, pageSize }.
  function normalisePage(r, normaliseItem) {
    const list = Array.isArray(r) ? r : pick(r, ["items", "results", "data", "collections", "files"], []);
    return {
      items: list.map(normaliseItem),
      total: Array.isArray(r) ? list.length : num(pick(r, ["total", "totalCount", "totalItems"], list.length)),
      page: Array.isArray(r) ? 1 : num(pick(r, ["page", "pageNumber"], 1)),
      pageSize: Array.isArray(r) ? list.length : num(pick(r, ["pageSize", "limit"], list.length))
    };
  }

  function facetList(v) {
    return (Array.isArray(v) ? v : []).map((x) => (
      typeof x === "string"
        ? { value: x, count: null }
        : { value: String(pick(x, ["value", "name", "key", "label"], "")), count: num(pick(x, ["count", "fileCount", "total"], null)) }
    )).filter((x) => x.value);
  }
  function normaliseFacets(r) {
    const get = (keys) => facetList(pick(r, keys, []));
    return {
      language: get(["language", "languages"]),
      mediaType: get(["mediaType", "mediaTypes", "media"]),
      provider: get(["provider", "providers", "publishers"]),
      theme: get(["theme", "themes", "keywords"])
    };
  }

  // ───────── Live mode ─────────
  async function request(path, opts) {
    const o = opts || {};
    const url = new URL(cfg.apiBaseUrl.replace(/\/$/, "") + path);
    Object.entries(o.params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    });
    const headers = { Accept: "application/json" };
    if (o.body) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await fetch(url.toString(), { method: o.method || "GET", headers, body: o.body ? JSON.stringify(o.body) : undefined });
    } catch (e) {
      throw new ApiError(0, null);
    }
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch (e) { /* not JSON */ }
      throw new ApiError(res.status, body);
    }
    return res.json();
  }

  function listParams(q, extra) {
    const f = cfg.filters, p = cfg.paging;
    return Object.assign({
      [p.page]: q.page || 1,
      [p.pageSize]: q.pageSize || p.defaultPageSize,
      [f.search]: q.search,
      [f.language]: q.language,
      [f.mediaType]: q.mediaType,
      [f.provider]: q.provider,
      [f.theme]: q.theme
    }, extra || {});
  }


  const live = {
    async getCollections(q) {
      return normalisePage(await request("/api/catalog/collections", { params: listParams(q) }), normaliseCollection);
    },
    async getFacets() { return normaliseFacets(await request("/api/catalog/collections/facets")); },
    async getCollection(id) { return normaliseCollection(await request("/api/catalog/collections/" + encodeURIComponent(id))); },
    async getFiles(id, q) {
      const p = cfg.paging;
      const params = { [p.page]: q.page || 1, [p.pageSize]: q.pageSize || p.defaultPageSize };
      return normalisePage(await request("/api/catalog/collections/" + encodeURIComponent(id) + "/files", { params }), normaliseFile);
    },
    submitApplication: (data) => request("/api/applications", { method: "POST", body: data })
  };

  // ───────── Sample mode ─────────
  let sampleCollections = null;
  async function loadSample() {
    if (!sampleCollections) {
      const res = await fetch("sample-data/collections.json");
      if (!res.ok) throw new ApiError(res.status, null);
      sampleCollections = (await res.json()).map(normaliseCollection);
    }
    return sampleCollections;
  }
  function countBy(list, get) {
    const m = new Map();
    list.forEach((c) => get(c).forEach((v) => m.set(v, (m.get(v) || 0) + 1)));
    return [...m].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value));
  }
  function paged(items, q, size) {
    const pageSize = q.pageSize || size, page = q.page || 1;
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
  }
  function sampleFiles(c) {
    const n = Math.min(c.fileCount || 0, 60);
    const kind = c.mediaType === "Text" ? "Text" : c.mediaType;
    return Array.from({ length: n }, (_, i) => normaliseFile({
      id: c.id + "-f" + (i + 1),
      name: c.name + " " + String(i + 1).padStart(3, "0") + (kind === "Text" ? ".txt" : ".mp3"),
      kind,
      encodingFormat: kind === "Text" ? "text/plain" : "audio/mpeg",
      wordCount: kind === "Text" ? 400 + ((i * 137) % 900) : null,
      duration: kind === "Text" ? null : 300 + ((i * 53) % 1500)
    }));
  }

  const sample = {
    async getCollections(q) {
      const all = await loadSample();
      const s = (q.search || "").toLowerCase();
      const items = all.filter((c) =>
        (!q.language || c.language === q.language) &&
        (!q.mediaType || c.mediaType === q.mediaType) &&
        (!q.provider || c.provider === q.provider) &&
        (!q.theme || c.themes.includes(q.theme)) &&
        (!s || (c.name + " " + c.description).toLowerCase().includes(s)));
      return paged(items, q, cfg.paging.defaultPageSize);
    },
    async getFacets() {
      const all = await loadSample();
      return {
        language: countBy(all, (c) => [c.language]),
        mediaType: countBy(all, (c) => [c.mediaType]),
        provider: countBy(all, (c) => [c.provider]),
        theme: countBy(all, (c) => c.themes)
      };
    },
    async getCollection(id) {
      const c = (await loadSample()).find((x) => x.id === id);
      if (!c) throw new ApiError(404, null);
      return c;
    },
    async getFiles(id, q) {
      const c = await sample.getCollection(id);
      const r = paged(sampleFiles(c), q, cfg.paging.defaultPageSize);
      if (c.fileCount) r.total = c.fileCount;   // report the real size of the collection
      return r;
    },
    async submitApplication() {
      await new Promise((r) => setTimeout(r, 400));
      return { id: "sample-1", submittedAtUtc: new Date().toISOString() };
    }
  };

  async function getProviders() {
    try {
      const res = await fetch(cfg.providersUrl);
      return res.ok ? await res.json() : [];
    } catch (e) { return []; }
  }

  window.CatalogAPI = Object.assign({ isSample, ApiError, getProviders }, isSample ? sample : live);
})();
