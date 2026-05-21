// scripts/ui.js
// ============================================================================
// UI LAYER — Rendering, DOM Events, View Switching
// ============================================================================

import { dbg, setStatus } from "./settings.js";
import {
  TABLE_ICONS,
  TABLE_COLORS,
  allMonsters,
  POPULAR_NPCS,
} from "./data.js";
import {
  lookup,
  lookupItemSources,
  saveNavState,
  getSavedNav,
  currentMode,
  setCurrentMode,
  inDropsView,
  setInDropsView
} from "../core.js";

// ============================================================================
// VIEW SWITCHING
// ============================================================================

export function showBrowser() {
  document.getElementById("npc-browser").style.display = "flex";
  document.getElementById("disambig").style.display = "none";
  document.getElementById("drops").style.display = "none";
  document.getElementById("back-btn").style.display = "none";
  document.getElementById("subtitle").textContent =
    currentMode === "item" ? "Search any item" : "Search any NPC";
  document.getElementById("npc-img").style.display = "none";
  document.getElementById("titlebar-logo").style.display = "inline";
  setInDropsView(false);
}

export function showDisambig() {
  document.getElementById("npc-browser").style.display = "none";
  document.getElementById("disambig").style.display = "block";
  document.getElementById("drops").style.display = "none";
  document.getElementById("back-btn").style.display = "block";
  setInDropsView(false);
}

export function showDrops() {
  document.getElementById("npc-browser").style.display = "none";
  document.getElementById("disambig").style.display = "none";
  document.getElementById("drops").style.display = "block";
  document.getElementById("back-btn").style.display = "block";
  setInDropsView(true);
}

// ============================================================================
// NPC LIST RENDERING
// ============================================================================

export function renderNpcList(filter) {
  const list = document.getElementById("npc-list");
  const q = filter.toLowerCase().trim();
  const source = allMonsters.length > 0 ? allMonsters : POPULAR_NPCS;

  const filtered = q
    ? source.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 100)
    : source.slice(0, 200);

  if (!filtered.length) {
    list.innerHTML = `<div id="npc-empty">No matches for "<strong>${filter}</strong>"<br><small>Press Search to look it up on the wiki</small></div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  for (const npc of filtered) {
    const el = document.createElement("div");
    el.className = "npc-item";
    el.innerHTML = `
      <span class="npc-icon">${npc.icon || "👾"}</span>
      <span class="npc-name">${npc.name}</span>
      ${npc.cat ? `<span class="npc-cat">${npc.cat}</span>` : ""}
    `;
    el.addEventListener("click", () =>
      lookup(npc.fulltext || npc.name)
    );
    frag.appendChild(el);
  }

  list.innerHTML = "";
  list.appendChild(frag);
}

// ============================================================================
// DISAMBIGUATION UI
// ============================================================================

export function showDisambigOptions(title, links, msg) {
  document.getElementById("disambig-msg").textContent =
    msg || `"${title}" refers to multiple pages. Which one?"`;

  const c = document.getElementById("disambig-options");
  c.innerHTML = "";

  for (const link of links) {
    const el = document.createElement("div");
    el.className = "disambig-option";
    el.textContent = link;
    el.addEventListener("click", () => {
      if (currentMode === "item") lookupItemSources(link);
      else lookup(link);
    });
    c.appendChild(el);
  }

  showDisambig();
  document.getElementById("subtitle").textContent = "Choose a page";
  setStatus("", "");
}

// ============================================================================
// DROP TABLE RENDERING
// ============================================================================

export function renderAllSections(variants) {
  const container = document.getElementById("drops");
  container.innerHTML = "";

  const showLabels = variants.length > 1;

  for (const variant of variants) {
    if (!variant.sections.length) continue;

    if (showLabels) {
      const color = variant.isHard ? "#5c1a1a" : "#1a3a5c";
      const hdr = document.createElement("div");
      hdr.style.cssText = `
        background:${color};
        padding:5px 12px;
        font-size:11px;
        font-weight:700;
        letter-spacing:1px;
        color:#fff;
        border-bottom:2px solid rgba(0,0,0,.3);
        text-transform:uppercase;
        position:sticky;
        top:0;
        z-index:2;
      `;
      hdr.textContent = (variant.isHard ? "💀 " : "⚔ ") + variant.label;
      container.appendChild(hdr);
    }

    for (const sec of variant.sections) {
      if (!sec.rows.length) continue;
      container.appendChild(makeSectionBlock(sec));
    }
  }
}

export function makeSectionBlock(sec, onRowClick) {
  const wrapper = document.createElement("div");
  wrapper.className = "section-wrapper";

  const startCollapsed = sec.rows.length > 25;
  const icon = TABLE_ICONS[sec.name] || "📦";
  const accentColor = TABLE_COLORS[sec.name] || "var(--bg3)";

  const hdr = document.createElement("div");
  hdr.className = "section-hdr" + (startCollapsed ? " collapsed" : "");
  hdr.style.borderLeft = `3px solid ${accentColor}`;
  hdr.innerHTML = `
    <span class="hdr-left">
      <span class="chevron">▼</span>
      <span>${icon} ${sec.name}</span>
    </span>
    <span class="row-count">${sec.rows.length} items</span>
  `;

  const body = document.createElement("div");
  body.className = "section-body" + (startCollapsed ? " collapsed" : "");

  for (const row of sec.rows) {
    body.appendChild(makeDropRow(row, onRowClick));
  }

  if (!startCollapsed) {
    requestAnimationFrame(() => {
      body.style.maxHeight = body.scrollHeight + "px";
    });
  }

  hdr.addEventListener("click", () => {
    const collapsed = hdr.classList.toggle("collapsed");
    if (collapsed) {
      body.style.maxHeight = body.scrollHeight + "px";
      requestAnimationFrame(() => body.classList.add("collapsed"));
    } else {
      body.classList.remove("collapsed");
      body.style.maxHeight = body.scrollHeight + "px";
      body.addEventListener(
        "transitionend",
        () => {
          if (!hdr.classList.contains("collapsed"))
            body.style.maxHeight = "none";
        },
        { once: true }
      );
    }
  });

  wrapper.appendChild(hdr);
  wrapper.appendChild(body);
  return wrapper;
}

export function makeDropRow(row, onRowClick) {
  const el = document.createElement("div");
  el.className = "drop-row clickable";
  el.title = `Find all sources for "${row.name}"`;

  el.addEventListener("click", () => {
    if (onRowClick) return onRowClick(row);

    setCurrentMode("item");
    document
      .querySelectorAll(".mode-tab")
      .forEach((t) =>
        t.classList.toggle("active", t.dataset.mode === "item")
      );

    document.getElementById("search-input").placeholder = "Search items...";
    lookupItemSources(row.name);
  });

  if (row.img) {
    const img = document.createElement("img");
    img.className = "item-img";
    img.src = row.img;
    img.alt = row.name;
    img.onerror = function () {
      this.replaceWith(placeholder(row.name));
    };
    el.appendChild(img);
  } else {
    el.appendChild(placeholder(row.name));
  }

  const info = document.createElement("div");
  info.className = "item-info";

  const nm = document.createElement("div");
  nm.className = "item-name";
  nm.textContent = row.name;
  info.appendChild(nm);

  if (row.qty) {
    const q = document.createElement("div");
    q.className = "item-qty";
    q.textContent = "x" + row.qty;
    info.appendChild(q);
  }

  el.appendChild(info);

  if (row.rarity) {
    const { label, cls } = window.rarityClass(row.rarity);
    const wrap = document.createElement("div");
    wrap.className = "rarity";

    const badge = document.createElement("span");
    badge.className = "badge " + cls;
    badge.textContent = label;

    wrap.appendChild(badge);
    el.appendChild(wrap);
  }

  const arrow = document.createElement("span");
  arrow.style.cssText =
    "color:var(--dim);font-size:10px;flex-shrink:0;margin-left:1px;";
  arrow.textContent = "›";
  el.appendChild(arrow);

  return el;
}

export function placeholder(name) {
  const d = document.createElement("div");
  d.className = "item-placeholder";
  d.textContent = (name || "?").charAt(0).toUpperCase();
  return d;
}

// ============================================================================
// ITEM SOURCE TABLE RENDERING
// ============================================================================

export function renderDropSources(sources, itemTitle) {
  const container = document.getElementById("drops");
  container.innerHTML = "";

  const banner = document.createElement("div");
  banner.style.cssText =
    "background:#1a3a5c;padding:5px 12px;font-size:11px;font-weight:700;" +
    "letter-spacing:1px;color:#fff;border-bottom:2px solid rgba(0,0,0,.3);" +
    "text-transform:uppercase;position:sticky;top:0;z-index:2;";
  banner.textContent = "🎒 Drop Sources — " + itemTitle;
  container.appendChild(banner);

  const hint = document.createElement("div");
  hint.style.cssText =
    "padding:4px 12px;font-size:10px;color:var(--dim);" +
    "border-bottom:1px solid var(--border);background:var(--bg2);";
  hint.textContent = "Tap a monster to view its full drop table →";
  container.appendChild(hint);

  const BUCKETS = [
    { key: "always", label: "Always", icon: "⭐", min: 2, max: Infinity },
    { key: "high", label: "High", icon: "🟢", min: 0.8, max: 2 },
    { key: "medium", label: "Medium", icon: "🟡", min: 0.5, max: 0.8 },
    { key: "low", label: "Low", icon: "🔴", min: -1, max: 0.5 },
  ];

  const withChance = sources.map((s) => ({
    ...s,
    _chance: window.rarityToChance(s.rarity),
  }));

  withChance.sort((a, b) => {
    const ac = a._chance < 0 ? -2 : a._chance;
    const bc = b._chance < 0 ? -2 : b._chance;
    return bc - ac;
  });

  const bucketMap = {};
  for (const b of BUCKETS) bucketMap[b.key] = [];

  for (const src of withChance) {
    const c = src._chance;
    if (c >= 2) bucketMap.always.push(src);
    else if (c >= 0.8) bucketMap.high.push(src);
    else if (c >= 0.5) bucketMap.medium.push(src);
    else bucketMap.low.push(src);
  }

  const onRowClick = (src) => {
    setCurrentMode("npc");
    document
      .querySelectorAll(".mode-tab")
      .forEach((t) =>
        t.classList.toggle("active", t.dataset.mode === "npc")
      );
    document.getElementById("search-input").placeholder = "Search NPCs...";
    lookup(src.name);
  };

  function makeSourceRow(src) {
    const el = document.createElement("div");
    el.className = "drop-row clickable";
    el.title = "View full drops for " + src.name;

    el.addEventListener("click", () => onRowClick(src));

    if (src.img) {
      const img = document.createElement("img");
      img.className = "item-img";
      img.src = src.img;
      img.alt = src.name;
      img.onerror = function () {
        this.replaceWith(placeholder(src.name));
      };
      el.appendChild(img);
    } else {
      el.appendChild(placeholder(src.name));
    }

    const info = document.createElement("div");
    info.className = "item-info";

    const nm = document.createElement("div");
    nm.className = "item-name";
    nm.textContent = src.name;
    info.appendChild(nm);

    const sub = [];
    if (src.level) sub.push("Lvl " + src.level);
    if (src.qty) sub.push("Qty: " + src.qty);

    if (sub.length) {
      const q = document.createElement("div");
      q.className = "item-qty";
      q.textContent = sub.join(" · ");
      info.appendChild(q);
    }

    el.appendChild(info);

    if (src.rarity) {
      const { label, cls } = window.rarityClass(src.rarity);
      const wrap = document.createElement("div");
      wrap.className = "rarity";

      const badge = document.createElement("span");
      badge.className = "badge " + cls;
      badge.textContent = label;

      wrap.appendChild(badge);
      el.appendChild(wrap);
    }

    const arrow = document.createElement("span");
    arrow.style.cssText =
      "color:var(--dim);font-size:11px;flex-shrink:0;margin-left:2px;";
    arrow.textContent = "›";
    el.appendChild(arrow);

    return el;
  }

  const borderColors = {
    always: "#4caf50",
    high: "#81c784",
    medium: "#ffb74d",
    low: "#e57373",
  };

  let anyRendered = false;

  for (const b of BUCKETS) {
    const rows = bucketMap[b.key];
    if (!rows.length) continue;
    anyRendered = true;

    const wrapper = document.createElement("div");
    wrapper.className = "section-wrapper";

    const hdr = document.createElement("div");
    hdr.className = "section-hdr";
    hdr.style.borderLeft = `3px solid ${borderColors[b.key]}`;
    hdr.innerHTML = `
      <span class="hdr-left">
        <span class="chevron">▼</span>
        <span>${b.icon} ${b.label}</span>
      </span>
      <span class="row-count">${rows.length}</span>
    `;

    const body = document.createElement("div");
    body.className = "section-body";

    for (const src of rows) {
      body.appendChild(makeSourceRow(src));
    }

    requestAnimationFrame(() => {
      body.style.maxHeight = body.scrollHeight + "px";
    });

    hdr.addEventListener("click", () => {
      const c = hdr.classList.toggle("collapsed");
      if (c) {
        body.style.maxHeight = body.scrollHeight + "px";
        requestAnimationFrame(() => body.classList.add("collapsed"));
      } else {
        body.classList.remove("collapsed");
        body.style.maxHeight = body.scrollHeight + "px";
        body.addEventListener(
          "transitionend",
          () => {
            if (!hdr.classList.contains("collapsed"))
              body.style.maxHeight = "none";
          },
          { once: true }
        );
      }
    });

    wrapper.appendChild(hdr);
    wrapper.appendChild(body);
    container.appendChild(wrapper);
  }

  if (!anyRendered) {
    container.innerHTML +=
      '<div style="padding:16px;text-align:center;color:var(--dim);font-size:11px;">No sources to display.</div>';
  }
}

// ============================================================================
// SEARCH BAR + NAVIGATION EVENTS
// ============================================================================

export function initUIEvents() {
  const searchInput = document.getElementById("search-input");
  const searchBtn = document.getElementById("search-btn");
  const backBtn = document.getElementById("back-btn");

  // Live NPC filtering
  searchInput.addEventListener("input", () => {
    if (inDropsView || currentMode === "item") return;
    clearTimeout(window.searchTimer);
    window.searchTimer = setTimeout(
      () => renderNpcList(searchInput.value),
      150
    );
  });

  // Search button
  searchBtn.addEventListener("click", () => {
    const v = searchInput.value.trim();
    if (!v) return;
    if (currentMode === "item") lookupItemSources(v);
    else lookup(v);
  });

  // Enter key
  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const v = searchInput.value.trim();
    if (!v) return;
    if (currentMode === "item") lookupItemSources(v);
    else lookup(v);
  });

  // Back button
  backBtn.addEventListener("click", () => {
    saveNavState(null);
    showBrowser();
    searchInput.value = "";

    if (currentMode === "npc") renderNpcList("");
    else {
      document.getElementById("npc-list").innerHTML =
        '<div id="npc-empty">Type an item name and press Search
        document.getElementById("npc-list").innerHTML =
        '<div id="npc-empty">Type an item name and press Search.<br><small>e.g. "Dragon bones", "Abyssal whip"</small></div>';
    }

    setStatus("", "");
  });

  // Close button (Bolt-only)
  const closeBtn = document.getElementById("close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      fetch("https://bolt-api/close", { method: "POST" }).catch(() => {});
    });
  }

  // External message handler (Alt1, plugins, etc.)
  function handleMsg(text) {
    if (text.startsWith("LOOKUP:")) {
      lookup(text.slice(7));
    } else if (text === "FOCUS_SEARCH") {
      searchInput.value = "";
      searchInput.focus();

      if (inDropsView) {
        showBrowser();
        renderNpcList("");
      }
    }
  }

  window.addEventListener("message", (evt) => {
    if (!evt.data) return;

    if (evt.data.type === "pluginMessage" && evt.data.content) {
      const decoded = new TextDecoder().decode(
        new Uint8Array(evt.data.content)
      );
      handleMsg(decoded.trim());
    } else if (typeof evt.data === "string") {
      handleMsg(evt.data.trim());
    }
  });
}

// ============================================================================
// MODE TAB SWITCHING
// ============================================================================

export function initModeTabs() {
  const tabs = document.querySelectorAll(".mode-tab");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode;
      if (mode === currentMode) return;

      setCurrentMode(mode);

      tabs.forEach((t) =>
        t.classList.toggle("active", t === tab)
      );

      const inp = document.getElementById("search-input");
      inp.placeholder = mode === "item" ? "Search items..." : "Search NPCs...";

      setStatus("", "");

      const saved = getSavedNav();
      if (saved && saved.type === "drops" && saved.name) {
        inp.value = saved.name;
        if (mode === "item") lookupItemSources(saved.name);
        else lookup(saved.name);
      } else {
        inp.value = "";
        showBrowser();

        if (mode === "npc") {
          renderNpcList("");
          document.getElementById("list-label").textContent =
            allMonsters.length ? "All RS3 monsters" : "Loading...";
          document.getElementById("list-count").textContent =
            allMonsters.length ? allMonsters.length + " total" : "";
        } else {
          document.getElementById("npc-list").innerHTML =
            '<div id="npc-empty">Type an item name and press Search.<br><small>e.g. "Dragon bones", "Abyssal whip"</small></div>';
          document.getElementById("list-label").textContent =
            "Item drop source lookup";
          document.getElementById("list-count").textContent = "";
        }
      }
    });
  });
}

// ============================================================================
// UI INITIALIZATION ENTRY POINT
// ============================================================================

export function initUI() {
  initModeTabs();
  initUIEvents();
}
