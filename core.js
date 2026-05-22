// core.js
// ============================================================================
// CORE APPLICATION LOGIC — State, Lookup Pipelines, Disambiguation, Init
// ============================================================================

import { dbg, setStatus, applyToggleUI, initSettingsUI } from "./scripts/settings.js";
import {
  fetchNpcDropsBucket,
  fetchItemSourcesBucket,
  fetchItemIcon,
  resolveCanonicalTitle,
  loadMonsterList,
  allMonsters,
  TABLE_ORDER,
  WIKI
} from "./scripts/data.js";
import {
  showBrowser,
  showDisambig,
  showDrops,
  showDisambigOptions,
  renderNpcList,
  renderAllSections,
  renderDropSources
} from "./scripts/ui.js";
import {
  initAlt1Integration,
  autoPollAlt1,
  stripLevelSuffix,
  resolveOcrName
} from "./scripts/ocr.js";

// ============================================================================
// GLOBAL STATE
// ============================================================================

export let currentMode = "npc";       // "npc" or "item"
export let inDropsView = false;
export let searchTimer = null;

export const navHistory = { npc: null, item: null };

export function setCurrentMode(mode) {
  currentMode = mode;
}

export function setInDropsView(v) {
  inDropsView = v;
}

export function saveNavState(type, name, title, scrollY) {
  navHistory[currentMode] = {
    mode: currentMode,
    type,
    name,
    title,
    scrollY: scrollY || 0
  };
}

export function getSavedNav() {
  return navHistory[currentMode] || null;
}

// ============================================================================
// DISAMBIGUATION HELPERS
// ============================================================================

export async function checkDisambig(title) {
  const url = `${WIKI}?action=query&titles=${encodeURIComponent(
    title
  )}&prop=pageprops&ppprop=disambiguation&format=json&origin=*`;

  const r = await fetch(url);
  const d = await r.json();
  const pages = d?.query?.pages;
  if (!pages) return false;

  return (
    Object.values(pages)[0]?.pageprops?.hasOwnProperty("disambiguation") ??
    false
  );
}

export async function getDisambigLinks(title) {
  const url = `${WIKI}?action=parse&page=${encodeURIComponent(
    title
  )}&prop=links&format=json&origin=*`;

  const r = await fetch(url);
  const d = await r.json();

  return (d?.parse?.links || [])
    .filter((l) => l.ns === 0)
    .map((l) => l["*"])
    .filter((l) => !l.includes("disambiguation"));
}

// ============================================================================
// FUZZY SEARCH HELPERS
// ============================================================================

export function editDistance(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();

  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i || j)
  );

  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);

  return dp[m][n];
}

export function scoreAlternative(s, q) {
  const sl = s.toLowerCase().trim();
  const ql = q.toLowerCase().trim();

  const meta = /\(storyline\)|\(book\)|\(music\)|\(recipe\)|\(item\)|\(quest\)|\(object\)|\(disambiguation\)/i.test(
    s
  )
    ? 500
    : 0;

  const base = sl.replace(/\s*\([^)]*\)\s*/g, "").trim();

  if (base === ql) return -200 + meta;
  if (sl.startsWith(ql + " ") || sl === ql)
    return -100 + editDistance(sl, ql) + meta;

  const re = new RegExp(
    "\\b" + ql.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
    "i"
  );
  if (re.test(sl)) return editDistance(sl, ql) + meta;

  return editDistance(sl, ql) + sl.length * 0.3 + meta;
}

export async function suggestAlternatives(title) {
  try {
    const url = `${WIKI}?action=opensearch&search=${encodeURIComponent(
      title
    )}&limit=30&namespace=0&format=json&origin=*`;

    const r = await fetch(url);
    const d = await r.json();

    let suggestions = (d[1] || []).filter((s) => s !== title);

    if (!suggestions.length) {
      setStatus("err", `⚠️ No drop table found for "${title}".`);
      return;
    }

    suggestions.sort(
      (a, b) => scoreAlternative(a, title) - scoreAlternative(b, title)
    );
    suggestions = suggestions.slice(0, 12);

    setStatus("busy", `No drops on "${title}" — pick a related page:`);

    showDisambigOptions(
      title,
      suggestions,
      `"${title}" has no drop table. Did you mean one of these?"`
    );
  } catch (e) {
    setStatus("err", `⚠️ No drop table found for "${title}".`);
  }
}

// ============================================================================
// RARITY HELPERS
// ============================================================================

export function rarityClass(r) {
  if (!r) return { label: "?", cls: "b-unknown" };

  const s = r.toLowerCase().trim();

  if (s === "always") return { label: "Always", cls: "b-always" };

  const m = s.match(/(\d[\d,.]*)\/(\d[\d,.]*)/);
  if (m) {
    const chance =
      parseFloat(m[1].replace(/,/g, "")) /
      parseFloat(m[2].replace(/,/g, ""));

    const label = r.split(/[;(]/)[0].trim();

    if (chance >= 0.25) return { label, cls: "b-common" };
    if (chance >= 0.03) return { label, cls: "b-uncommon" };
    if (chance >= 0.003) return { label, cls: "b-rare" };
    if (chance >= 0.0003) return { label, cls: "b-vr" };
    return { label, cls: "b-ultra" };
  }

  if (s.includes("very rare") || s.includes("ultra"))
    return { label: r, cls: "b-vr" };
  if (s.includes("rare")) return { label: r, cls: "b-rare" };
  if (s.includes("uncommon")) return { label: r, cls: "b-uncommon" };
  if (s.includes("common")) return { label: r, cls: "b-common" };

  return { label: r, cls: "b-unknown" };
}

export function rarityToChance(r) {
  if (!r) return -1;

  const s = r.toLowerCase().trim();

  if (s === "always") return 2;

  const m = s.match(/(\d[\d,.]*)\/(\d[\d,.]*)/);
  if (m) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    const d = parseFloat(m[2].replace(/,/g, ""));
    if (d > 0) return n / d;
  }

  if (s.includes("always")) return 2;
  if (s.includes("very rare")) return 0.001;
  if (s.includes("rare")) return 0.01;
  if (s.includes("uncommon")) return 0.1;
  if (s.includes("common")) return 0.5;

  return -1;
}

// Make rarity helpers globally accessible for ui.js
window.rarityClass = rarityClass;
window.rarityToChance = rarityToChance;

// ============================================================================
// LOOKUP PIPELINES
// ============================================================================

export async function lookup(name) {
  if (!name) return;

  setStatus("busy", `🔍 Searching for "${name}"...`);
  showDrops();

  document.getElementById("subtitle").textContent = name;
  document.getElementById("search-input").value = name;
  document.getElementById("drops").innerHTML = "";

  let title = null;

  try {
    const r = await fetch(
      `${WIKI}?action=opensearch&search=${encodeURIComponent(
        name
      )}&limit=5&format=json&origin=*`
    );
    const d = await r.json();
    if (d[1]?.length) title = d[1][0];
  } catch (e) {
    setStatus("err", "❌ Network error: " + e.message);
    return;
  }

  if (!title) {
    setStatus("err", `⚠️ "${name}" not found.`);
    return;
  }

  await lookupPage(title);
}

export async function lookupPage(title) {
  setStatus("busy", `📄 Loading: ${title}...`);
  document.getElementById("subtitle").textContent = title;

  const npcImg = document.getElementById("npc-img");
  const logo = document.getElementById("titlebar-logo");

  npcImg.style.display = "none";
  logo.style.display = "inline";

  try {
    const isD = await checkDisambig(title);
    if (isD) {
      const links = await getDisambigLinks(title);
      showDisambigOptions(title, links);
      return;
    }
  } catch (e) {}

  const imgUrl = await fetchItemIcon(title);
  if (imgUrl) {
    npcImg.src = imgUrl;
    npcImg.style.display = "block";
    logo.style.display = "none";

    npcImg.onerror = () => {
      npcImg.style.display = "none";
      logo.style.display = "inline";
    };
  }

  const rows = await fetchNpcDropsBucket(title);

  const uniqueNames = Array.from(
    new Set(rows.map((r) => r.name).filter(Boolean))
  );

  const iconMap = new Map();
  await Promise.all(
    uniqueNames.map(async (n) => {
      iconMap.set(n, await fetchItemIcon(n));
    })
  );

  rows.forEach((r) => {
    r.img = iconMap.get(r.name) || "";
  });

  dbg(`LOOKUP: ${rows.length} rows for "${title}"`);

  if (!rows.length) {
    await suggestAlternatives(title);
    return;
  }

  // Build wiki-style ordered sections
  const sectionsMap = new Map();

  for (const row of rows) {
    const key = row.section;
    if (!sectionsMap.has(key)) sectionsMap.set(key, []);
    sectionsMap.get(key).push({
      name: row.name,
      qty: row.qty,
      rarity: row.rarity,
      img: row.img
    });
  }

  const sections = Array.from(sectionsMap.entries())
    .sort(([a], [b]) => {
      const ai = TABLE_ORDER.indexOf(a);
      const bi = TABLE_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    .map(([name, secRows]) => ({ name, rows: secRows }));

  setStatus("ok", `✅ ${rows.length} drops for ${title}`);
  showDrops();

  renderAllSections([{ label: "Drops", isHard: false, sections }]);

  saveNavState("drops", title, title, 0);
}

export async function lookupItemSources(name) {
  if (!name) return;

  setStatus("busy", `🔍 Finding drop sources for "${name}"...`);
  showDrops();

  document.getElementById("subtitle").textContent = name;
  document.getElementById("search-input").value = name;
  document.getElementById("drops").innerHTML = "";
  document.getElementById("npc-img").style.display = "none";
  document.getElementById("titlebar-logo").style.display = "inline";

  let title = null;

  try {
    const r = await fetch(
      `${WIKI}?action=opensearch&search=${encodeURIComponent(
        name
      )}&limit=5&format=json&origin=*`
    );
    const d = await r.json();
    if (d[1]?.length) title = d[1][0];
  } catch (e) {
    setStatus("err", "❌ Network error: " + e.message);
    return;
  }

  if (!title) {
    setStatus("err", `⚠️ "${name}" not found.`);
    return;
  }

  try {
    const isD = await checkDisambig(title);
    if (isD) {
      const links = await getDisambigLinks(title);
      showDisambigOptions(
        title,
        links,
        `"${title}" could be multiple items. Which one?"`
      );
      return;
    }
  } catch (e) {}

  const imgUrl = await fetchItemIcon(title);
  if (imgUrl) {
    const ni = document.getElementById("npc-img");
    ni.src = imgUrl;
    ni.style.display = "block";
    document.getElementById("titlebar-logo").style.display = "none";

    ni.onerror = () => {
      ni.style.display = "none";
      document.getElementById("titlebar-logo").style.display = "inline";
    };
  }

  let sources;
  try {
    sources = await fetchItemSourcesBucket(title);
  } catch (e) {
    dbg("Bucket item sources error: " + e.message);
    setStatus("err", "❌ Error loading drop sources.");
    return;
  }

  if (!sources || !sources.length) {
    setStatus("err", `⚠️ No drop sources found for "${title}".`);
    document.getElementById("drops").innerHTML = `
      <div style="padding:16px;text-align:center;color:var(--dim);font-size:11px;">
        <div style="font-size:24px;margin-bottom:8px;">🔍</div>
        <div style="color:var(--text);margin-bottom:4px;">${title}</div>
        <div>No drop sources found on the wiki for this item.</div>
        <div style="margin-top:8px;">Try the <strong>NPC Drops</strong> tab to look up a monster directly.</div>
      </div>`;
    return;
  }

  setStatus(
    "ok",
    `✅ ${sources.length} source${sources.length === 1 ? "" : "s"} drop "${title}"`
  );

  renderDropSources(sources, title);
  saveNavState("drops", title, title, 0);
}

// ============================================================================
// APPLICATION INITIALIZATION
// ============================================================================

export function initApp() {
  dbg("Initializing DropViewer...");

  applyToggleUI();
  initSettingsUI();
  showBrowser();

  // Load monster list
  loadMonsterList();

  // Initialize UI events
  import("./scripts/ui.js").then(({ initUI }) => initUI());

  // Initialize Alt1 integration
  autoPollAlt1();
  initAlt1Integration();

  // Focus search bar
  document.getElementById("search-input").focus();
}

// Auto-start
initApp();
