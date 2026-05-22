// scripts/data.js
// ============================================================================
// DATA LAYER — Wiki parse API for structure + Bucket API for drop data
// ============================================================================

import { dbg } from "./settings.js";

export const WIKI       = "https://runescape.wiki/api.php";
export const BUCKET_API = WIKI;

// ============================================================================
// CANONICAL TITLE RESOLUTION
// ============================================================================

export async function resolveCanonicalTitle(title) {
  const url  = `${WIKI}?action=query&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const res  = await fetch(url);
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return title;
  return Object.values(pages)[0]?.title || title;
}

// ============================================================================
// SORT ORDERS
// ============================================================================

export const MODE_ORDER = [
  "Normal Mode", "Hard Mode", "Story Mode", "Challenge Mode", "Default",
];

export const TABLE_ORDER = [
  "100%", "Unique", "Main drop", "Weapons and armour", "Herbs", "Seeds",
  "Consumables", "Other", "Godsword shard table", "Stone spirits",
  "Gem and Rare drop table", "Gem drop table", "Rare drop table",
  "Tertiary", "Charms", "Universal drops",
];

export const TABLE_ICONS = {
  "100%":                    "⭐",
  "Unique":                  "💎",
  "Main drop":               "⚔️",
  "Weapons and armour":      "🛡️",
  "Herbs":                   "🌿",
  "Seeds":                   "🌱",
  "Consumables":             "🧪",
  "Other":                   "📦",
  "Godsword shard table":    "⚔️",
  "Stone spirits":           "🪨",
  "Gem and Rare drop table": "🍀",
  "Gem drop table":          "💎",
  "Rare drop table":         "🍀",
  "Tertiary":                "🎁",
  "Charms":                  "✨",
  "Universal drops":         "🌐",
};

export const TABLE_COLORS = {
  "100%":                    "#f5c518",
  "Unique":                  "#ba68c8",
  "Main drop":               "#64b5f6",
  "Weapons and armour":      "#ff9800",
  "Herbs":                   "#4caf50",
  "Seeds":                   "#81c784",
  "Consumables":             "#80cbc4",
  "Other":                   "#90a4ae",
  "Godsword shard table":    "#ff9800",
  "Stone spirits":           "#a1887f",
  "Gem and Rare drop table": "#4caf50",
  "Gem drop table":          "#ba68c8",
  "Rare drop table":         "#4caf50",
  "Tertiary":                "#e91e63",
  "Charms":                  "#fdd835",
  "Universal drops":         "#78909c",
};

// ============================================================================
// WIKI STRUCTURE SCRAPER
// Uses action=parse to get rendered HTML, then reads h3/h4 drop section
// headers and the number of <tr> rows under each one.
// Returns: [{ mode, category, count }, ...]  in wiki display order
// ============================================================================

const structureCache = new Map();

export async function fetchDropStructure(pageName) {
  if (structureCache.has(pageName)) return structureCache.get(pageName);

  dbg(`STRUCTURE: fetching wiki HTML for "${pageName}"`);

  const url  = `${WIKI}?action=parse&page=${encodeURIComponent(pageName)}&prop=text&format=json&origin=*`;
  const res  = await fetch(url);
  const data = await res.json();
  const html = data?.parse?.text?.["*"];

  if (!html) {
    dbg("STRUCTURE: no HTML returned");
    return null;
  }

  const parser = new DOMParser();
  const doc    = parser.parseFromString(html, "text/html");

  // Find the #Drops anchor
  const dropsAnchor = doc.querySelector("#Drops, [id='Drops']");
  if (!dropsAnchor) {
    dbg("STRUCTURE: no #Drops anchor found");
    return null;
  }

  // Walk from the #Drops heading element forward through siblings
  // collecting h3/h4 section names and the <tr> counts beneath each
  const sections = [];
  let currentMode     = "Normal Mode";
  let currentCategory = null;

  // The anchor is inside a heading — start from its parent heading element
  let el = dropsAnchor.closest("h2, h3, h4") || dropsAnchor;
  el = el.nextElementSibling;

  while (el) {
    const tag = el.tagName.toUpperCase();

    // Stop when we hit a new h2 that isn't the drops section
    if (tag === "H2") break;

    if (tag === "H3" || tag === "H4") {
      const text = el.textContent.replace(/\[edit.*?\]/g, "").trim();

      // Detect difficulty mode headers like "Drops (hard mode)"
      if (/hard.?mode/i.test(text)) {
        currentMode = "Hard Mode";
        el = el.nextElementSibling;
        continue;
      }
      if (/normal.?mode/i.test(text)) {
        currentMode = "Normal Mode";
        el = el.nextElementSibling;
        continue;
      }
      if (/story.?mode/i.test(text)) {
        currentMode = "Story Mode";
        el = el.nextElementSibling;
        continue;
      }

      // Map heading text to canonical category name
      currentCategory = normaliseSectionName(text);

      el = el.nextElementSibling;
      continue;
    }

    // Count data rows in drop tables under this heading
    if (tag === "TABLE" && currentCategory) {
      // Count <tr> rows that are actual item rows (not header rows)
      // Header rows contain <th> cells; item rows contain <td> cells
      const rows = el.querySelectorAll("tr");
      let count = 0;
      rows.forEach(row => {
        // Item rows have td cells — skip pure header rows (only th)
        if (row.querySelector("td")) count++;
      });

      if (count > 0) {
        sections.push({ mode: currentMode, category: currentCategory, count });
        dbg(`STRUCTURE: [${currentMode}] "${currentCategory}" = ${count} items`);
      }
    }

    el = el.nextElementSibling;
  }

  if (!sections.length) {
    dbg("STRUCTURE: no sections found");
    return null;
  }

  structureCache.set(pageName, sections);
  return sections;
}

function normaliseSectionName(raw) {
  const s = raw.toLowerCase().trim();
  if (/^100%$|^always$/i.test(s))            return "100%";
  if (/^unique/i.test(s))                    return "Unique";
  if (/^main drop/i.test(s))                 return "Main drop";
  if (/weapons?.*(armou?r)?|armou?r/i.test(s)) return "Weapons and armour";
  if (/^herbs?$/i.test(s))                   return "Herbs";
  if (/^seeds?$/i.test(s))                   return "Seeds";
  if (/^consumables?/i.test(s))              return "Consumables";
  if (/godsword|shard/i.test(s))             return "Godsword shard table";
  if (/stone.?spirit/i.test(s))              return "Stone spirits";
  if (/gem.*rare|rare.*gem/i.test(s))        return "Gem and Rare drop table";
  if (/gem drop/i.test(s))                   return "Gem drop table";
  if (/rare drop|rare.?drop.?table/i.test(s)) return "Rare drop table";
  if (/^tertiary/i.test(s))                  return "Tertiary";
  if (/^charms?$/i.test(s))                  return "Charms";
  if (/universal/i.test(s))                  return "Universal drops";
  if (/^other$/i.test(s))                    return "Other";
  // Return the original capitalised for unknown sections
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// ============================================================================
// BUCKET API — NPC DROPS  (raw, unclassified)
// ============================================================================

async function fetchBucketRows(pageName) {
  const query = `bucket('dropsline').select('page_name','item_name','drop_json').where('page_name','${pageName}').run()`;
  const url   = `${BUCKET_API}?action=bucket&format=json&origin=*&query=${encodeURIComponent(query)}`;
  const res   = await fetch(url);
  const data  = await res.json();
  return data?.bucket || [];
}

// ============================================================================
// MAIN FETCH — combines wiki structure + bucket data
// ============================================================================

export async function fetchNpcDropsBucket(pageName) {
  dbg(`BUCKET: NPC fetch for "${pageName}"`);
  const canonical = await resolveCanonicalTitle(pageName);

  // Fetch both in parallel
  const [structure, rows] = await Promise.all([
    fetchDropStructure(canonical),
    fetchBucketRows(canonical).catch(e => { dbg("BUCKET ERROR: " + e.message); return []; }),
  ]);

  dbg(`BUCKET: ${rows.length} rows for "${canonical}"`);

  // Parse each bucket row into a drop object (without category yet)
  const drops = rows.map(r => {
    let drop = {};
    try { drop = JSON.parse(r.drop_json || "{}"); } catch {}
    return {
      name:   r.item_name || "",
      qty:    extractQtyFromDrop(drop),
      rarity: extractRarityFromDrop(drop),
      img:    "",
      mode:   "Normal Mode",
      category: "Main drop",
      section:  "Main drop",
      raw:    drop,
    };
  });

  // If we got wiki structure, use it to assign categories positionally
  if (structure && structure.length) {
    let idx = 0;
    for (const section of structure) {
      const end = idx + section.count;
      for (let i = idx; i < end && i < drops.length; i++) {
        drops[i].mode     = section.mode;
        drops[i].category = section.category;
        drops[i].section  = section.category;
      }
      idx = end;
    }
    dbg(`STRUCTURE: assigned categories to ${Math.min(idx, drops.length)} drops`);
  } else {
    // Fallback: classify by item name / rarity heuristics
    dbg("STRUCTURE: falling back to heuristic classification");
    drops.forEach(d => {
      d.category = classifyDropFallback(d.name, d.raw);
      d.section  = d.category;
    });
  }

  return drops;
}

// ============================================================================
// HEURISTIC FALLBACK CLASSIFIER
// Only used when wiki parse fails — mirrors wiki conventions
// ============================================================================

const CHARM_NAMES = new Set(["Gold charm","Green charm","Crimson charm","Blue charm"]);
const TERTIARY_NAMES = new Set([
  "Starved ancient effigy","Mimic kill token",
  "Spirit sapphire","Spirit emerald","Spirit ruby",
  "Spirit diamond","Spirit dragonstone","Spirit onyx","Spirit hydrix",
  "Curved bone","Long bone",
  "Clue scroll (easy)","Clue scroll (medium)","Clue scroll (hard)",
  "Clue scroll (elite)","Clue scroll (master)",
]);

function classifyDropFallback(itemName, drop) {
  const rarity = (drop?.["Rarity"] || "").trim();
  if (/^always$/i.test(rarity))     return "100%";
  if (CHARM_NAMES.has(itemName))    return "Charms";
  if (TERTIARY_NAMES.has(itemName)) return "Tertiary";
  if (/champion'?s? scroll/i.test(itemName)) return "Tertiary";
  const notes = drop?.["Rarity Notes"] || [];
  if (notes.some(n => /rag.and.bone|wish.?list/i.test(n?.content || ""))) return "Tertiary";
  if (/stone.?spirit/i.test(itemName)) return "Stone spirits";
  return "Main drop";
}

// ============================================================================
// ITEM SOURCES
// ============================================================================

export async function fetchItemSourcesBucket(itemName) {
  dbg(`BUCKET: item fetch for "${itemName}"`);
  const canonical = await resolveCanonicalTitle(itemName);
  const query = `bucket('dropsline').select('page_name','drop_json').where('item_name','${canonical}').run()`;
  const url   = `${BUCKET_API}?action=bucket&format=json&origin=*&query=${encodeURIComponent(query)}`;

  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (e) {
    dbg("BUCKET ERROR: " + e.message);
    return [];
  }

  return (data?.bucket || []).map(r => {
    let drop = {};
    try { drop = JSON.parse(r.drop_json || "{}"); } catch {}
    return {
      name:     r.page_name || "",
      qty:      extractQtyFromDrop(drop),
      rarity:   extractRarityFromDrop(drop),
      img:      "",
      mode:     "Normal Mode",
      category: "Main drop",
      raw:      drop,
    };
  });
}

// ============================================================================
// DROP FIELD HELPERS
// ============================================================================

export function extractQtyFromDrop(drop) {
  if (!drop) return "";
  if (drop["Drop Quantity"]) return String(drop["Drop Quantity"]);
  for (const k of Object.keys(drop))
    if (/quantity|qty/i.test(k)) return String(drop[k]);
  return "";
}

export function extractRarityFromDrop(drop) {
  if (!drop) return "";
  if (drop.Rarity) return String(drop.Rarity);
  if (drop["Alt Rarities"]?.length) return String(drop["Alt Rarities"][0]);
  for (const k of Object.keys(drop))
    if (/rarity|chance|rate/i.test(k)) return String(drop[k]);
  return "";
}

// ============================================================================
// GROUPING + SORTING
// ============================================================================

export function groupDrops(dropRows = []) {
  const grouped = {};
  for (const drop of dropRows) {
    const mode     = drop.mode     || "Normal Mode";
    const category = drop.category || "Main drop";
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
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
  });
}

export function sortCategories(cats = []) {
  return [...cats].sort((a, b) => {
    const ai = TABLE_ORDER.indexOf(a);
    const bi = TABLE_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
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
    const url  = `${WIKI}?action=query&prop=pageimages&titles=${encodeURIComponent(name)}&pithumbsize=40&piprop=thumbnail&format=json&origin=*`;
    const res  = await fetch(url);
    const data = await res.json();
    const src  = Object.values(data?.query?.pages || {})[0]?.thumbnail?.source || "";
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
        if (name && !name.includes("/"))
          monsters.push({ name, fulltext: page.fulltext });
      }
      dbg(`Loaded ${monsters.length} monsters (offset ${offset})`);
      status.textContent = `⏳ Loading... ${monsters.length} found`;
      if (keys.length < limit) break;
      offset += limit;
    }

    const seen = new Set();
    allMonsters = monsters
      .filter(m => { if (seen.has(m.name)) return false; seen.add(m.name); return true; })
      .sort((a, b) => a.name.localeCompare(b.name));

    status.textContent = "";
    label.textContent  = "All RS3 monsters";
    count.textContent  = allMonsters.length + " total";
  } catch (e) {
    dbg("Monster list load error: " + e.message);
    status.textContent = "⚠️ Could not load full list — use search box above";
    allMonsters = POPULAR_NPCS.map(n => ({ name: n.name, fulltext: n.name, cat: n.cat, icon: n.icon }));
  }
}
