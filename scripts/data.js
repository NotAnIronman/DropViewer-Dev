// scripts/data.js
// ============================================================================
// DATA LAYER — Wiki API, Bucket API, Drop Parsing, Monster List, Icons
// ============================================================================

import { dbg } from "./settings.js";

// Base wiki endpoints
export const WIKI = "https://runescape.wiki/api.php";
export const BUCKET_API = WIKI;

// ============================================================================
// CANONICAL TITLE RESOLUTION
// ============================================================================

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

// ============================================================================
// SORTING ORDERS — mirror the wiki's visual table order
// ============================================================================

export const MODE_ORDER = [
  "Normal Mode",
  "Hard Mode",
  "Story Mode",
  "Challenge Mode",
  "Default",
];

// Category order mirrors the wiki drop table section order
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
  // Legacy / fallback names kept for compatibility
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
  // Legacy
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
  // Legacy
  "Always": "#f5c518",
  "Unique drops": "#ba68c8",
  "Rare Drop Table": "#4caf50",
};

// ============================================================================
// BUCKET API — NPC DROPS
// ============================================================================

export async function fetchNpcDropsBucket(pageName) {
  dbg(`BUCKET: NPC fetch for "${pageName}"`);

  const canonical = await resolveCanonicalTitle(pageName);

  const query = `bucket('dropsline').select('page_name','item_name','drop_json').where('page_name','${canonical}').run()`;
  const url = `${BUCKET_API}?action=bucket&format=json&origin=*&query=${encodeURIComponent(query)}`;

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

// ============================================================================
// BUCKET API — ITEM SOURCES
// ============================================================================

export async function fetchItemSourcesBucket(itemName) {
  dbg(`BUCKET: item fetch for "${itemName}"`);

  const canonical = await resolveCanonicalTitle(itemName);

  const query = `bucket('dropsline').select('page_name','drop_json').where('item_name','${canonical}').run()`;
  const url = `${BUCKET_API}?action=bucket&format=json&origin=*&query=${encodeURIComponent(query)}`;

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

// ============================================================================
// CORE DROP ROW PARSER
// Reads directly from drop_json fields — no guessing from item names
// ============================================================================

export function parseDropRow(itemName, drop) {
  const mode  = parseModeFromDrop(drop);
  const category = parseCategoryFromDrop(drop);

  return {
    name:     itemName,
    qty:      extractQtyFromDrop(drop),
    rarity:   extractRarityFromDrop(drop),
    img:      "",
    mode,
    category,
    section:  category,   // backwards compat
    raw:      drop,
  };
}

// ============================================================================
// MODE DETECTION
// Reads the actual mode field from drop_json
// ============================================================================

export function parseModeFromDrop(drop) {
  if (!drop) return "Normal Mode";

  // The bucket stores mode in "Drop variant", "Variant", "Mode", or as part
  // of "Drop category" for monsters with multiple difficulty modes.
  const variant = (
    drop["Drop variant"] ||
    drop["Variant"]      ||
    drop["Mode"]         ||
    ""
  ).toLowerCase();

  if (/hard/i.test(variant))    return "Hard Mode";
  if (/story/i.test(variant))   return "Story Mode";
  if (/challenge/i.test(variant)) return "Challenge Mode";

  // Some monsters encode mode directly in "Drop category"
  const cat = (drop["Drop category"] || drop["Category"] || "").toLowerCase();
  if (/hard mode/i.test(cat))   return "Hard Mode";
  if (/story mode/i.test(cat))  return "Story Mode";

  return "Normal Mode";
}

// ============================================================================
// CATEGORY DETECTION
// Reads the wiki table/section name directly from drop_json
// ============================================================================

export function parseCategoryFromDrop(drop) {
  if (!drop) return "Other";

  // The bucket exposes the wiki drop table name in these fields:
  const rawCat = (
    drop["Drop category"] ||
    drop["Category"]      ||
    drop["Drop table"]    ||
    drop["Table"]         ||
    ""
  ).trim();

  // Normalise to wiki-standard section names
  if (rawCat) {
    const norm = normaliseCategoryName(rawCat);
    if (norm) return norm;
  }

  // Fallback: use Rarity field
  const rarity = (drop["Rarity"] || "").toLowerCase();
  if (rarity === "always") return "100%";

  return "Other";
}

// Map whatever the bucket returns to the wiki's display names
function normaliseCategoryName(raw) {
  const s = raw.toLowerCase().trim();

  if (s === "always" || s === "100%" || s === "100")             return "100%";
  if (/unique/i.test(s))                                         return "Unique";
  if (s === "main drop" || s === "main")                         return "Main drop";
  if (/godsword|shard/i.test(s))                                 return "Godsword shard table";
  if (/stone.?spirit|spirit.?stone/i.test(s))                    return "Stone spirits";
  if (/gem.*rare|rare.*drop.*table|rdt/i.test(s))                return "Gem and Rare drop table";
  if (/tertiary/i.test(s))                                        return "Tertiary";
  if (/charm/i.test(s))                                           return "Charms";
  if (s === "other")                                              return "Other";

  // Return the raw value capitalised so unknown tables still show usefully
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ============================================================================
// DROP PARSING HELPERS
// ============================================================================

export function extractQtyFromDrop(drop) {
  if (!drop) return "";
  if (drop["Drop Quantity"])  return String(drop["Drop Quantity"]);
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

// ============================================================================
// GROUPING + SORTING
// ============================================================================

export function groupDrops(dropRows = []) {
  const grouped = {};
  for (const drop of dropRows) {
    const mode     = drop.mode     || "Normal Mode";
    const category = drop.category || "Other";
    if (!grouped[mode])           grouped[mode] = {};
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

// ============================================================================
// ICON FETCHING + CACHE
// ============================================================================

const itemIconCache = new Map();

export async function fetchItemIcon(name) {
  if (!name) return "";
  if (itemIconCache.has(name)) return itemIconCache.get(name);
  try {
    const url = `${WIKI}?action=query&prop=pageimages&titles=${encodeURIComponent(
      name
    )}&pithumbsize=40&piprop=thumbnail&format=json&origin=*`;
    const res  = await fetch(url);
    const data = await res.json();
    const pages = data?.query?.pages;
    const src = pages ? (Object.values(pages)[0]?.thumbnail?.source || "") : "";
    itemIconCache.set(name, src);
    return src;
  } catch {
    itemIconCache.set(name, "");
    return "";
  }
}

// ============================================================================
// MONSTER LIST
// ============================================================================

export let allMonsters = [];

export const POPULAR_NPCS = [
  { name: "Abomination",   icon: "⚔️", cat: "Boss"   },
  { name: "Hydrix dragon", icon: "🐲", cat: "Slayer" },
];

export async function loadMonsterList() {
  const label  = document.getElementById("list-label");
  const count  = document.getElementById("list-count");
  const status = document.getElementById("list-status");

  status.textContent = "⏳ Loading monster list...";

  let monsters = [];
  let offset   = 0;
  const limit  = 500;

  try {
    while (true) {
      const query = `[[Monster JSON::+]]|?Has name|limit=${limit}|offset=${offset}`;
      const url   = `${WIKI}?action=ask&query=${encodeURIComponent(query)}&format=json&origin=*`;
      const r     = await fetch(url);
      const d     = await r.json();
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
      .filter((m) => { if (seen.has(m.name)) return false; seen.add(m.name); return true; })
      .sort((a, b) => a.name.localeCompare(b.name));

    status.textContent = "";
    label.textContent  = "All RS3 monsters";
    count.textContent  = allMonsters.length + " total";
  } catch (e) {
    dbg("Monster list load error: " + e.message);
    status.textContent = "⚠️ Could not load full list — use search box above";
    allMonsters = POPULAR_NPCS.map((n) => ({
      name: n.name, fulltext: n.name, cat: n.cat, icon: n.icon,
    }));
  }
}
