// data.js — updated with wiki HTML layout parsing and merged, ordered drops

import { dbg } from "./settings.js";

export const WIKI = "https://runescape.wiki/api.php";
export const BUCKET_API = WIKI;

/* ------------------------------------------------------------------------- */
/* BASIC CONSTANTS                                                           */
/* ------------------------------------------------------------------------- */

export async function resolveCanonicalTitle(title) {
  const url = `${WIKI}?action=query&redirects=1&titles=${encodeURIComponent(
    title
  )}&format=json&origin=*`;
  const res = await fetch(url);
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return title;
  const page = Object.values(pages)[0];
  return page?.title || title;
}

export const MODE_ORDER = [
  "Normal Mode",
  "Hard Mode",
  "Story Mode",
  "Challenge Mode",
  "Default",
];

export const TABLE_ORDER = [
  "100%",
  "Unique",
  "Main drop",
  "Godsword shard table",
  "Stone spirits",
  "Other",
  "Gem and Rare drop table",
  "Tertiary",
  "Charms",
  "Always",
  "Unique drops",
  "Rare Drop Table",
];

export const TABLE_ICONS = {
  "100%": "⭐",
  "Unique": "💎",
  "Main drop": "⚔️",
  "Godsword shard table": "⚔️",
  "Stone spirits": "🪨",
  "Other": "📦",
  "Gem and Rare drop table": "🍀",
  "Tertiary": "🎁",
  "Charms": "✨",
  "Always": "⭐",
  "Unique drops": "💎",
  "Rare Drop Table": "🍀",
};

export const TABLE_COLORS = {
  "100%": "#f5c518",
  "Unique": "#ba68c8",
  "Main drop": "#64b5f6",
  "Godsword shard table": "#ff9800",
  "Stone spirits": "#a1887f",
  "Other": "#90a4ae",
  "Gem and Rare drop table": "#4caf50",
  "Tertiary": "#e91e63",
  "Charms": "#81c784",
  "Always": "#f5c518",
  "Unique drops": "#ba68c8",
  "Rare Drop Table": "#4caf50",
};

/* ------------------------------------------------------------------------- */
/* BUCKET FETCHES                                                            */
/* ------------------------------------------------------------------------- */

export async function fetchNpcDropsBucket(pageName) {
  dbg(`BUCKET: NPC fetch for "${pageName}"`);

  const canonical = await resolveCanonicalTitle(pageName);

  const query = `bucket('dropsline').select('page_name','item_name','drop_json').where('page_name','${canonical}').run()`;
  const url = `${BUCKET_API}?action=bucket&format=json&origin=*&query=${encodeURIComponent(
    query
  )}`;

  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (e) {
    dbg("BUCKET ERROR: " + e.message);
    return [];
  }

  const rows = data?.bucket || [];
  dbg(`BUCKET: ${rows.length} rows for "${canonical}"`);

  return rows.map((r) => {
    let drop = {};
    try {
      drop = r.drop_json ? JSON.parse(r.drop_json) : {};
    } catch {
      drop = {};
    }

    return parseDropRow(r.item_name || "", drop);
  });
}

export async function fetchItemSourcesBucket(itemName) {
  dbg(`BUCKET: item fetch for "${itemName}"`);

  const canonical = await resolveCanonicalTitle(itemName);

  const query = `bucket('dropsline').select('page_name','drop_json').where('item_name','${canonical}').run()`;
  const url = `${BUCKET_API}?action=bucket&format=json&origin=*&query=${encodeURIComponent(
    query
  )}`;

  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (e) {
    dbg("BUCKET ERROR: " + e.message);
    return [];
  }

  const rows = data?.bucket || [];
  return rows.map((r) => {
    let drop = {};
    try {
      drop = r.drop_json ? JSON.parse(r.drop_json) : {};
    } catch {
      drop = {};
    }
    const parsed = parseDropRow(r.page_name || "", drop);
    return { ...parsed, name: r.page_name || "" };
  });
}

/* ------------------------------------------------------------------------- */
/* DROP PARSING                                                              */
/* ------------------------------------------------------------------------- */

export function parseDropRow(itemName, drop) {
  const mode = parseModeFromDrop(drop);
  const category = parseCategoryFromDrop(drop);

  return {
    name: itemName,
    qty: extractQtyFromDrop(drop),
    rarity: extractRarityFromDrop(drop),
    img: "",
    mode,
    category,
    section: category,
    raw: drop,
  };
}

export function parseModeFromDrop(drop) {
  if (!drop) return "Normal Mode";

  const variant = (
    drop["Drop variant"] ||
    drop["Variant"] ||
    drop["Mode"] ||
    ""
  ).toLowerCase();

  if (/hard/i.test(variant)) return "Hard Mode";
  if (/story/i.test(variant)) return "Story Mode";
  if (/challenge/i.test(variant)) return "Challenge Mode";

  const cat = (drop["Drop category"] || drop["Category"] || "").toLowerCase();
  if (/hard mode/i.test(cat)) return "Hard Mode";
  if (/story mode/i.test(cat)) return "Story Mode";

  return "Normal Mode";
}

export function parseCategoryFromDrop(drop) {
  if (!drop) return "Other";

  const rawCat =
    drop["Drop category"] ||
    drop["Category"] ||
    drop["Drop table"] ||
    drop["Table"] ||
    "";

  const trimmed = rawCat.trim();

  if (trimmed) {
    const norm = normaliseCategoryName(trimmed);
    if (norm) return norm;
  }

  const rarity = (drop["Rarity"] || "").toLowerCase();
  if (rarity === "always") return "100%";

  return "Other";
}

function normaliseCategoryName(raw) {
  const s = raw.toLowerCase().trim();

  if (s === "always" || s === "100%" || s === "100") return "100%";
  if (/unique/i.test(s)) return "Unique";
  if (s === "main drop" || s === "main") return "Main drop";
  if (/godsword|shard/i.test(s)) return "Godsword shard table";
  if (/stone.?spirit|spirit.?stone/i.test(s)) return "Stone spirits";
  if (/gem.*rare|rare.*drop.*table|rdt/i.test(s))
    return "Gem and Rare drop table";
  if (/tertiary/i.test(s)) return "Tertiary";
  if (/charm/i.test(s)) return "Charms";
  if (s === "other") return "Other";

  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function extractQtyFromDrop(drop) {
  if (!drop) return "";
  if (drop["Drop Quantity"]) return String(drop["Drop Quantity"]);
  for (const k of Object.keys(drop)) {
    if (/quantity|qty/i.test(k)) return String(drop[k]);
  }
  return "";
}

export function extractRarityFromDrop(drop) {
  if (!drop) return "";
  if (drop.Rarity) return String(drop.Rarity);
  if (drop["Alt Rarities"]?.length) return String(drop["Alt Rarities"][0]);
  for (const k of Object.keys(drop)) {
    if (/rarity|chance|rate/i.test(k)) return String(drop[k]);
  }
  return "";
}

/* ------------------------------------------------------------------------- */
/* LEGACY GROUPING + SORTING HELPERS                                         */
/* ------------------------------------------------------------------------- */

export function groupDrops(dropRows = []) {
  const grouped = {};
  for (const drop of dropRows) {
    const mode = drop.mode || "Normal Mode";
    const category = drop.category || "Other";
    if (!grouped[mode]) grouped[mode] = {};
    if (!grouped[mode][category]) grouped[mode][category] = [];
    grouped[mode][category].push(drop);
  }
  return grouped;
}

export function sortModes(modes = []) {
  return [...modes].sort((a, b) => {
    const ai = MODE_ORDER.indexOf(a);
    const bi = MODE_ORDER.indexOf(b);
    const av = ai === -1 ? 999 : ai;
    const bv = bi === -1 ? 999 : bi;
    return av !== bv ? av - bv : a.localeCompare(b);
  });
}

export function sortCategories(categories = []) {
  return [...categories].sort((a, b) => {
    const ai = TABLE_ORDER.indexOf(a);
    const bi = TABLE_ORDER.indexOf(b);
    const av = ai === -1 ? 999 : ai;
    const bv = bi === -1 ? 999 : bi;
    return av !== bv ? av - bv : a.localeCompare(b);
  });
}

/* ------------------------------------------------------------------------- */
/* ITEM ICONS                                                                */
/* ------------------------------------------------------------------------- */

const itemIconCache = new Map();

export async function fetchItemIcon(name) {
  if (!name) return "";
  if (itemIconCache.has(name)) return itemIconCache.get(name);
  try {
    const url = `${WIKI}?action=query&prop=pageimages&titles=${encodeURIComponent(
      name
    )}&pithumbsize=40&piprop=thumbnail&format=json&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const pages = data?.query?.pages;
    const src = pages
      ? Object.values(pages)[0]?.thumbnail?.source || ""
      : "";
    itemIconCache.set(name, src);
    return src;
  } catch {
    itemIconCache.set(name, "");
    return "";
  }
}

/* ------------------------------------------------------------------------- */
/* MONSTER LIST                                                              */
/* ------------------------------------------------------------------------- */

export let allMonsters = [];

export const POPULAR_NPCS = [
  { name: "Abomination", icon: "⚔️", cat: "Boss" },
  { name: "Hydrix dragon", icon: "🐲", cat: "Slayer" },
];

export async function loadMonsterList() {
  const label = document.getElementById("list-label");
  const count = document.getElementById("list-count");
  const status = document.getElementById("list-status");

  status.textContent = "⏳ Loading monster list...";

  let monsters = [];
  let offset = 0;
  const limit = 500;

  try {
    while (true) {
      const query = `[[Monster JSON::+]]|?Has name|limit=${limit}|offset=${offset}`;
      const url = `${WIKI}?action=ask&query=${encodeURIComponent(
        query
      )}&format=json&origin=*`;
      const r = await fetch(url);
      const d = await r.json();
      const results = d?.query?.results;

      if (!results) break;

      const keys = Object.keys(results);
      if (!keys.length) break;

      for (const key of keys) {
        const page = results[key];
        const name = page?.printouts?.["Has name"]?.[0] || page.fulltext;
        if (name && !name.includes("/")) {
          monsters.push({ name, fulltext: page.fulltext });
        }
      }

      dbg(`Loaded ${monsters.length} monsters (offset ${offset})`);
      status.textContent = `⏳ Loading... ${monsters.length} found`;

      if (keys.length < limit) break;
      offset += limit;
    }

    const seen = new Set();
    allMonsters = monsters
      .filter((m) => {
        if (seen.has(m.name)) return false;
        seen.add(m.name);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    status.textContent = "";
    label.textContent = "All RS3 monsters";
    count.textContent = allMonsters.length + " total";
  } catch (e) {
    dbg("Monster list load error: " + e.message);
    status.textContent = "⚠️ Could not load full list — use search box above";
    allMonsters = POPULAR_NPCS.map((n) => ({
      name: n.name,
      fulltext: n.name,
      cat: n.cat,
      icon: n.icon,
    }));
  }
}

/* ------------------------------------------------------------------------- */
/* WIKI HTML LAYOUT PARSING                                                  */
/* ------------------------------------------------------------------------- */

async function fetchWikiHtml(pageName) {
  const url = `${WIKI}?action=parse&page=${encodeURIComponent(
    pageName
  )}&prop=text&format=json&origin=*`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const html = data?.parse?.text?.["*"] || "";
    return html;
  } catch (e) {
    dbg("WIKI HTML ERROR: " + e.message);
    return "";
  }
}

function modeFromHeadingText(text) {
  const s = text.toLowerCase();
  if (/drops\s*\(normal mode\)/i.test(s) || /normal mode/.test(s))
    return "Normal Mode";
  if (/drops\s*\(hard mode\)/i.test(s) || /hard mode/.test(s))
    return "Hard Mode";
  if (/drops\s*\(story mode\)/i.test(s) || /story mode/.test(s))
    return "Story Mode";
  if (/drops\s*\(challenge mode\)/i.test(s) || /challenge mode/.test(s))
    return "Challenge Mode";
  return null;
}

function isDropTable(table) {
  const cls = table.className || "";
  if (!/wikitable/.test(cls)) return false;
  if (!table.querySelector("td.item-col")) return false;
  return true;
}

function extractItemNamesFromTable(table) {
  const rows = Array.from(table.querySelectorAll("tr"));
  const items = [];

  for (const tr of rows) {
    const link = tr.querySelector("td.item-col a");
    if (!link) continue;
    let name = link.textContent || "";
    name = name.replace(/\[[^\]]*\]/g, "").trim();
    if (!name) continue;
    if (/^total$/i.test(name)) continue;
    items.push(name);
  }

  return items;
}

/**
 * Parse wiki HTML into a layout:
 * [
 *   {
 *     mode: "Normal Mode",
 *     groups: [
 *       { name: "100%", items: ["Bandos helmet", ...] },
 *       { name: "Unique", items: [...] },
 *       ...
 *     ]
 *   },
 *   ...
 * ]
 */
export async function fetchWikiDropLayout(pageName) {
  const html = await fetchWikiHtml(pageName);
  if (!html) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const root =
    doc.querySelector(".mw-parser-output") || doc.body || doc.documentElement;

  const children = Array.from(root.children);

  const modesOrder = [];
  const modeGroups = new Map();
  let currentMode = "Normal Mode";
  let currentGroupName = null;

  function ensureMode(mode) {
    if (!modeGroups.has(mode)) {
      modeGroups.set(mode, {
        order: [],
        groups: new Map(),
      });
      modesOrder.push(mode);
    }
  }

  function ensureGroup(mode, groupName) {
    ensureMode(mode);
    const mg = modeGroups.get(mode);
    if (!mg.groups.has(groupName)) {
      mg.groups.set(groupName, { name: groupName, items: [] });
      mg.order.push(groupName);
    }
    return mg.groups.get(groupName);
  }

  ensureMode(currentMode);

  for (const el of children) {
    let heading = null;

    if (el.classList && el.classList.contains("mw-heading")) {
      heading = el.querySelector("h1,h2,h3,h4,h5,h6");
    } else if (/^H[1-6]$/.test(el.tagName || "")) {
      heading = el;
    }

    if (heading) {
      const text = (heading.textContent || "").trim();
      if (!text) continue;

      const mode = modeFromHeadingText(text);
      if (mode) {
        currentMode = mode;
        ensureMode(currentMode);
        currentGroupName = null;
        continue;
      }

      // Non-mode heading: treat as potential group header.
      currentGroupName = text;
      continue;
    }

    if ((el.tagName || "").toLowerCase() === "table") {
      const table = el;
      if (!isDropTable(table)) continue;

      const rawGroup = currentGroupName || "Other";
      const groupName = normaliseCategoryName(rawGroup);
      const group = ensureGroup(currentMode, groupName);

      const items = extractItemNamesFromTable(table);
      group.items.push(...items);
    }
  }

  const layout = [];

  for (const mode of modesOrder) {
    const mg = modeGroups.get(mode);
    const groups = mg.order.map((gName) => {
      const g = mg.groups.get(gName);
      return {
        name: g.name,
        items: g.items.slice(), // keep raw item names
      };
    });
    layout.push({ mode, groups });
  }

  dbg(
    `WIKI LAYOUT: ${layout.reduce(
      (acc, m) => acc + m.groups.length,
      0
    )} groups across ${layout.length} modes for "${pageName}"`
  );

  return layout;
}

/* ------------------------------------------------------------------------- */
/* MERGING BUCKET DROPS WITH WIKI LAYOUT                                     */
/* ------------------------------------------------------------------------- */

/**
 * Merge bucket drops with wiki layout.
 *
 * layout: [
 *   {
 *     mode: "Normal Mode",
 *     groups: [
 *       { name: "100%", items: ["Bandos helmet", ...] },
 *       ...
 *     ]
 *   },
 *   ...
 * ]
 *
 * Returns:
 * [
 *   {
 *     mode: "Normal Mode",
 *     groups: [
 *       { name: "100%", drops: [drop, drop, ...] },
 *       { name: "Unique", drops: [...] },
 *       ...
 *     ]
 *   },
 *   ...
 * ]
 *
 * Empty groups are included.
 */
export function mergeDropsWithWikiLayout(drops = [], layout = []) {
  if (!layout.length) {
    // Fallback: use legacy grouping/sorting, but return in Option 1 shape.
    const grouped = groupDrops(drops);
    const modes = sortModes(Object.keys(grouped));
    const result = [];

    for (const mode of modes) {
      const cats = sortCategories(Object.keys(grouped[mode]));
      const groups = cats.map((cat) => ({
        name: cat,
        drops: grouped[mode][cat],
      }));
      result.push({ mode, groups });
    }

    return result;
  }

  const remaining = new Set(drops);
  const nameMap = new Map();
  for (const drop of drops) {
    const key = (drop.name || "").toLowerCase();
    if (!key) continue;
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key).push(drop);
  }

  const result = [];

  for (const modeLayout of layout) {
    const modeName = modeLayout.mode || "Normal Mode";
    const groupsOut = [];

    for (const groupLayout of modeLayout.groups) {
      const groupName = groupLayout.name;
      const dropsOut = [];

      for (const itemName of groupLayout.items) {
        const key = (itemName || "").toLowerCase();
        if (!key) continue;
        const list = nameMap.get(key);
        if (!list || !list.length) continue;

        for (const d of list) {
          if (!remaining.has(d)) continue;
          remaining.delete(d);

          dropsOut.push({
            ...d,
            mode: modeName,
            category: groupName,
            section: groupName,
          });
        }
      }

      // Include empty groups as requested.
      groupsOut.push({
        name: groupName,
        drops: dropsOut,
      });
    }

    result.push({
      mode: modeName,
      groups: groupsOut,
    });
  }

  if (remaining.size) {
    const leftoversByMode = new Map();
    for (const d of remaining) {
      const mode = d.mode || "Normal Mode";
      if (!leftoversByMode.has(mode)) leftoversByMode.set(mode, []);
      leftoversByMode.get(mode).push(d);
    }

    for (const [mode, list] of leftoversByMode.entries()) {
      let modeEntry = result.find((m) => m.mode === mode);
      if (!modeEntry) {
        modeEntry = { mode, groups: [] };
        result.push(modeEntry);
      }

      modeEntry.groups.push({
        name: "Other",
        drops: list.map((d) => ({
          ...d,
          category: d.category || "Other",
          section: d.category || "Other",
        })),
      });
    }
  }

  return result;
}

/**
 * High-level helper:
 * - Resolves canonical title
 * - Fetches bucket drops
 * - Fetches wiki layout
 * - Returns merged, wiki-ordered structure
 *
 * Result shape (Option 1):
 * [
 *   {
 *     mode: "Normal Mode",
 *     groups: [
 *       { name: "100%", drops: [...] },
 *       { name: "Unique", drops: [...] },
 *       ...
 *     ]
 *   },
 *   {
 *     mode: "Hard Mode",
 *     groups: [...]
 *   }
 * ]
 */
export async function fetchNpcDropsSorted(pageName) {
  const canonical = await resolveCanonicalTitle(pageName);

  const [drops, layout] = await Promise.all([
    fetchNpcDropsBucket(canonical),
    fetchWikiDropLayout(canonical),
  ]);

  return mergeDropsWithWikiLayout(drops, layout);
}
