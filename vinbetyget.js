// ==UserScript==
// @name         Vinbetyget × Systembolaget
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Visar lagerstatus i din Systembolaget-butik direkt på Vinbetygets topplistor
// @match        https://vinbetyget.se/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      cdn.jsdelivr.net
// @connect      api-extern.systembolaget.se
// @connect      vinbetyget.se
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/NicklasAndersson/tampermonkey/main/vinbetyget.js
// @updateURL    https://raw.githubusercontent.com/NicklasAndersson/tampermonkey/main/vinbetyget.js
// ==/UserScript==

(async function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────
  let STORE_ID   = GM_getValue('storeId',   '');
  let STORE_NAME = GM_getValue('storeName', '');
  const API_KEY  = '8d39a7340ee7439f8b4c1e995c8f3e4a';
  const STORES_URL = 'https://cdn.jsdelivr.net/gh/AlexGustafsson/systembolaget-api-data@main/data/stores.json';

  // Cache: artikelnr → internt productId (undvik dubbla search-anrop)
  const idCache = {};

  GM_registerMenuCommand('Välj Systembolaget-butik', openSettings);

  // ── Stilar ────────────────────────────────────────────────
  GM_addStyle(`
    #vbsb-btn {
      position: fixed; bottom: 16px; right: 16px; z-index: 99999;
      background: #006A4E; color: #fff; border: none; border-radius: 24px;
      padding: 10px 18px; font: 700 13px/1 system-ui; cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,.3); white-space: nowrap;
    }
    #vbsb-btn:hover { background: #005540; }
    #vbsb-panel {
      display: none; position: fixed; bottom: 58px; right: 16px; z-index: 99999;
      background: #fff; border: 1px solid #ddd; border-radius: 12px;
      padding: 16px; width: 290px; box-shadow: 0 4px 20px rgba(0,0,0,.15);
      font: 13px/1.4 system-ui;
    }
    #vbsb-panel h3 { margin: 0 0 12px; font-size: 14px; color: #006A4E; }
    #vbsb-store-input {
      width: 100%; box-sizing: border-box; padding: 9px 10px;
      border: 1px solid #ccc; border-radius: 7px; font-size: 13px; margin-bottom: 6px;
    }
    #vbsb-store-input:focus { outline: none; border-color: #006A4E; }
    #vbsb-results {
      max-height: 180px; overflow-y: auto; border: 1px solid #ddd;
      border-radius: 7px; margin-bottom: 10px; display: none;
    }
    .vbsb-result-item {
      padding: 10px 12px; cursor: pointer; font-size: 13px;
      border-bottom: 1px solid #f0f0f0;
    }
    .vbsb-result-item:last-child { border-bottom: none; }
    .vbsb-result-item:hover, .vbsb-result-item.selected { background: #f0faf5; }
    #vbsb-save {
      width: 100%; background: #006A4E; color: #fff; border: none;
      border-radius: 7px; padding: 9px; font: 700 13px system-ui; cursor: pointer;
    }
    #vbsb-save:hover { background: #005540; }
    #vbsb-status { margin-top: 8px; font-size: 11px; color: #666; min-height: 16px; }

    .vbsb-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 20px; margin-left: 6px;
      font: 700 11px/1.6 system-ui; white-space: nowrap; vertical-align: middle;
      cursor: default;
    }
    .vbsb-yes  { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .vbsb-no   { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .vbsb-out  { background: #f3f4f6; color: #6b7280; border: 1px solid #d1d5db; }
    .vbsb-spin { background: #fef9c3; color: #854d0e; border: 1px solid #fde047;
                 animation: vbsb-pulse 1.2s ease-in-out infinite; }
    @keyframes vbsb-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  `);

  // ── UI ────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.id    = 'vbsb-btn';
  updateBtnLabel();

  const panel = document.createElement('div');
  panel.id    = 'vbsb-panel';
  panel.innerHTML = `
    <h3>Din Systembolaget-butik</h3>
    <input id="vbsb-store-input" type="search"
           placeholder="Sok butik, t.ex. Kungsangen..." autocomplete="off">
    <div id="vbsb-results"></div>
    <button id="vbsb-save">Spara</button>
    <div id="vbsb-status">${STORE_ID ? 'Vald butik: ' + STORE_NAME : ''}</div>
  `;
  document.body.append(btn, panel);

  btn.onclick = () => {
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  };

  // Butiker laddas asynkront; sparas här för filtrering
  let allStores = [];
  let selectedStore = null; // { siteId, label }

  // Sätt inledningsvärde om butik redan vald
  if (STORE_ID) {
    selectedStore = { siteId: STORE_ID, label: STORE_NAME };
    document.getElementById('vbsb-store-input').value = STORE_NAME;
  }

  loadStores();

  const input   = document.getElementById('vbsb-store-input');
  const results = document.getElementById('vbsb-results');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    results.innerHTML = '';
    if (q.length < 2) { results.style.display = 'none'; return; }

    const hits = allStores.filter(s =>
      s.label.toLowerCase().includes(q) || s.siteId.includes(q)
    ).slice(0, 20);

    if (hits.length === 0) { results.style.display = 'none'; return; }

    hits.forEach(s => {
      const div = document.createElement('div');
      div.className   = 'vbsb-result-item';
      div.textContent = s.label;
      div.addEventListener('click', () => {
        selectedStore = s;
        input.value   = s.label;
        results.style.display = 'none';
        document.getElementById('vbsb-status').textContent = 'Vald: ' + s.label;
      });
      results.appendChild(div);
    });
    results.style.display = 'block';
  });

  document.getElementById('vbsb-save').onclick = () => {
    if (!selectedStore) {
      document.getElementById('vbsb-status').textContent = 'Valj en butik ur listan.';
      return;
    }
    STORE_ID   = selectedStore.siteId;
    STORE_NAME = selectedStore.label;
    GM_setValue('storeId',   STORE_ID);
    GM_setValue('storeName', STORE_NAME);
    document.getElementById('vbsb-status').textContent = 'Sparad: ' + STORE_NAME;
    updateBtnLabel();
    results.style.display = 'none';
    setTimeout(() => { panel.style.display = 'none'; }, 600);
    run();
  };

  function updateBtnLabel() {
    // Visa stadsnamnet (första ordet) som knapptext
    btn.textContent = STORE_NAME ? STORE_NAME.split(' ')[0] : 'Valj butik';
  }

  async function loadStores() {
    const r = await gmGet(STORES_URL);
    if (!r || r.status !== 200) return;
    allStores = JSON.parse(r.responseText).map(s => ({
      siteId: s.siteId,
      label:  titleCase(s.city || '') + ' - ' + (s.displayName || s.streetAddress || s.siteId),
    }));
  }

  function titleCase(str) {
    return str.toLowerCase().split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function openSettings() {
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  }

  // ── HTTP ──────────────────────────────────────────────────
  function gmGet(url) {
    return new Promise(res => GM_xmlhttpRequest({
      method: 'GET', url, timeout: 10000,
      headers: { Accept: '*/*', 'Accept-Language': 'sv-SE' },
      onload: r => res(r), onerror: () => res(null), ontimeout: () => res(null),
    }));
  }

  function apiGet(path) {
    return new Promise(res => GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://api-extern.systembolaget.se/sb-api-ecommerce/v1' + path,
      timeout: 8000,
      headers: {
        'Accept': '*/*',
        'content-type': 'application/json',
        'ocp-apim-subscription-key': API_KEY,
        'Origin': 'https://www.systembolaget.se',
        'Referer': 'https://www.systembolaget.se/',
      },
      onload: r => { try { res(JSON.parse(r.responseText)); } catch { res(null); } },
      onerror: () => res(null), ontimeout: () => res(null),
    }));
  }

  // ── Kärna: SB-URL → productId → stock ────────────────────
  // Steg 1: extrahera artikelnr ur SB-URL (/copertino-207701/ → "207701")
  function articleNrFromUrl(sbUrl) {
    return sbUrl?.match(/-(\d+)\/?$/)?.[1] ?? null;
  }

  // Steg 2: slå upp internt productId via productsearch
  // (207701 på hemsidan ≠ productId som stockbalance förstår, t.ex. "1401")
  async function resolveProductId(articleNr) {
    if (idCache[articleNr]) return idCache[articleNr];

    const data = await apiGet(`/productsearch/search?q=${articleNr}&size=5`);
    const hit  = data?.products?.find(p =>
      p.productNumber === articleNr || String(p.productId) === articleNr
    ) ?? data?.products?.[0];

    const productId = hit?.productId ?? articleNr;
    idCache[articleNr] = productId;
    return productId;
  }

  // Steg 3: hämta lagersaldo
  async function fetchStock(productId) {
    return apiGet(`/stockbalance/store/${STORE_ID}/${productId}/`);
  }

  // Allt i ett: SB-URL → badge-data
  async function checkSBUrl(sbUrl) {
    const articleNr = articleNrFromUrl(sbUrl);
    if (!articleNr) return null;
    const productId = await resolveProductId(articleNr);
    return fetchStock(productId);
  }

  // ── Badge ─────────────────────────────────────────────────
  function makeBadge() {
    const el = document.createElement('span');
    el.className   = 'vbsb-badge vbsb-spin';
    el.textContent = 'kollar...';
    return el;
  }

  function fillBadge(badge, stock) {
    if (!stock) {
      badge.className   = 'vbsb-badge vbsb-out';
      badge.textContent = '?';
      return;
    }
    if (stock.stock > 0) {
      badge.className = 'vbsb-badge vbsb-yes';
      const shelf = stock.shelf
        ? ' S' + stock.shelf.split('-')[0] + ' H' + stock.shelf.split('-')[1]
        : '';
      badge.textContent = stock.stock + ' st' + shelf;
    } else {
      badge.className   = 'vbsb-badge vbsb-no';
      badge.textContent = 'Slut';
    }
  }

  // Extrahera SB-URL ur HTML
  function extractSBUrl(html) {
    return html.match(/https?:\/\/(?:www\.)?systembolaget\.se\/produkt\/[^"'\s]+/)?.[0] ?? null;
  }

  // ── Kör ───────────────────────────────────────────────────
  async function run() {
    if (!STORE_ID) return;
    document.querySelectorAll('.vbsb-badge').forEach(b => b.remove());

    const segs = location.pathname.split('/').filter(Boolean);

    if (segs.length >= 2) {
      // Produktsida: hitta SB-länk i DOM
      const sbA = document.querySelector('a[href*="systembolaget.se/produkt"]');
      if (!sbA) return;
      const badge = makeBadge();
      sbA.after(badge);
      fillBadge(badge, await checkSBUrl(sbA.href));

    } else {
      // Listsida: deduplicera vinlänkar
      const base = '/' + segs[0];
      const seen = new Set();
      const wineLinks = [...document.querySelectorAll('a[href]')].filter(a => {
        try {
          const u = new URL(a.href);
          if (u.hostname !== location.hostname) return false;
          if (!u.pathname.startsWith(base + '/') || seen.has(u.pathname)) return false;
          seen.add(u.pathname);
          return true;
        } catch { return false; }
      });

      const tasks = wineLinks.map(link => async () => {
        const badge = makeBadge();
        link.after(badge);

        // Hämta vinsidan, extrahera SB-URL
        const r = await gmGet(link.href);
        const sbUrl = r?.status === 200 ? extractSBUrl(r.responseText) : null;
        if (!sbUrl) { badge.className = 'vbsb-badge vbsb-out'; badge.textContent = '-'; return; }

        fillBadge(badge, await checkSBUrl(sbUrl));
      });

      // 3 parallella workers
      let i = 0;
      const worker = async () => { while (i < tasks.length) await tasks[i++](); };
      await Promise.all([worker(), worker(), worker()]);
    }
  }

  // ── Start ─────────────────────────────────────────────────
  if (!STORE_ID) {
    setTimeout(() => { panel.style.display = 'block'; }, 400);
  } else {
    run();
  }

})();