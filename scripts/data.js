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
// MODE + CATEGORY SORTING
// ============================================================================

export const MODE_ORDER = [
  "Normal Mode",
  "Hard Mode",
  "Story Mode",
  "Challenge Mode",
  "Default",
];

export const TABLE_ORDER = [
  "Always",
  "Unique drops",
  "Weapons & Armour",
  "Runes & Ammunition",
  "Herbs",
  "Seeds",
  "Stone Spirits",
  "Ores & Bars",
  "Gems",
  "Bones",
  "Salvage",
  "Other",
  "Rare Drop Table",
];

export const TABLE_ICONS = {
  Always: "⭐",
  "Unique drops": "💎",
  "Weapons & Armour": "🛡️",
  "Runes & Ammunition": "🔮",
  Herbs: "🌿",
  Seeds: "🌱",
  "Stone Spirits": "🪨",
  "Ores & Bars": "⛏️",
  Gems: "💍",
  Bones: "🦴",
  Salvage: "🔩",
  Other: "⚔️",
  "Rare Drop Table": "🍀",
};

export const TABLE_COLORS = {
  Always: "#f5c518",
  "Unique drops": "#ba68c8",
  "Weapons & Armour": "#ff9800",
  "Runes & Ammunition": "#5c9bd6",
  Herbs: "#4caf50",
  Seeds: "#81c784",
  "Stone Spirits": "#a1887f",
  "Ores & Bars": "#90a4ae",
  Gems: "#e91e63",
  Bones: "#c8a96e",
  Salvage: "#78909c",
  Other: "#64b5f6",
  "Rare Drop Table": "#4caf50",
};

// ============================================================================
// KNOWN RDT ITEMS
// ============================================================================

export const RDT_ITEMS = new Set([
  "Uncut onyx",
  "Uncut dragonstone",
  "Uncut diamond",
  "Uncut ruby",
  "Uncut emerald",
  "Uncut sapphire",
  "Chaos talisman",
  "Nature talisman",
  "Water talisman",
  "Earth talisman",
  "Fire talisman",
  "Loop half of key",
  "Tooth half of key",
  "Dragonstone",
  "Dragon spear",
  "Rune spear",
  "Shield left half",
  "Dragon 2h sword",
  "Rune javelin",
  "Teak plank",
  "Mahogany plank",
  "Noted coal",
  "Noted mithril ore",
  "Noted gold ore",
  "Noted runite ore",
  "Phasmatite stone spirit",
  "Necrite stone spirit",
  "Drakolith stone spirit",
  "Orichalcite stone spirit",
]);

// ============================================================================
// BUCKET API — NPC DROPS
// ============================================================================

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

  const parsed = rows.map((r) => {
    let drop = {};

    try {
      drop = r.drop_json ? JSON.parse(r.drop_json) : {};
    } catch {
      drop = {};
    }

    const mode = deriveModeFromDrop(drop);
    const category = deriveSectionFromDrop(r.item_name || "", drop);

    return {
      name: r.item_name || "",
      qty: extractQtyFromDrop(drop),
      rarity: extractRarityFromDrop(drop),
      img: "",

      // NEW WIKI-STYLE GROUPING
      mode,
      category,

      // BACKWARDS COMPATIBILITY
      section: category,

      // RAW DROP ACCESS
      raw: drop,
    };
  });

  return applyWikiCategoryOverrides(canonical, parsed);
}

// ============================================================================
// BUCKET API — ITEM SOURCES
// ============================================================================

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

    return {
      name: r.page_name || "",
      img: "",
      level: "",
      qty: extractQtyFromDrop(drop),
      rarity: extractRarityFromDrop(drop),
      mode: deriveModeFromDrop(drop),
      category: deriveSectionFromDrop(r.item_name || "", drop),
      raw: drop,
    };
  });
}

// ============================================================================
// DROP PARSING HELPERS
// ============================================================================

export function extractQtyFromDrop(drop) {
  if (!drop) return "";

  if (drop["Drop Quantity"]) {
    return String(drop["Drop Quantity"]);
  }

  for (const k of Object.keys(drop)) {
    if (/quantity|qty/i.test(k)) {
      return String(drop[k]);
    }
  }

  return "";
}

export function extractRarityFromDrop(drop) {
  if (!drop) return "";

  if (drop.Rarity) {
    return String(drop.Rarity);
  }

  if (drop["Alt Rarities"] && drop["Alt Rarities"].length) {
    return String(drop["Alt Rarities"][0]);
  }

  for (const k of Object.keys(drop)) {
    if (/rarity|chance|rate/i.test(k)) {
      return String(drop[k]);
    }
  }

  return "";
}

// ============================================================================
// MODE DETECTION
// ============================================================================

export function deriveModeFromDrop(drop) {
  if (!drop) {
    return "Normal Mode";
  }

  const raw = JSON.stringify(drop).toLowerCase();

  // Bucket data is inconsistent.
  // We therefore scan the ENTIRE payload.

  if (/hard mode|hard_mode|hm/.test(raw)) {
    return "Hard Mode";
  }

  if (/normal mode|normal_mode|nm/.test(raw)) {
    return "Normal Mode";
  }

  return "Normal Mode";
}

// ============================================================================
// DROP SECTION CLASSIFICATION (Wiki-style categories)
// ============================================================================

export function deriveSectionFromDrop(itemName, drop) {
  const name = (itemName || "").toLowerCase().trim();

  const rarity = String(drop?.Rarity || "").toLowerCase();

  const dropType = String(
    drop?.["Drop type"] ||
      drop?.["Drop category"] ||
      drop?.Category ||
      ""
  ).toLowerCase();

  // ALWAYS
  if (rarity === "always") {
    return "Always";
  }

  // RDT
  if (RDT_ITEMS.has(itemName)) {
    return "Rare Drop Table";
  }

  if (/rare.?drop.?table|rdt/i.test(dropType)) {
    return "Rare Drop Table";
  }

  // BONES
  if (/\bbones?\b|\bash(es)?\b|\bremains\b/i.test(name)) {
    return "Bones";
  }

  // HERBS
  if (/^grimy |^clean |\bherb\b/.test(name) && !/seed/i.test(name)) {
    return "Herbs";
  }

  if (/\bherbs?\b/.test(name) && !/seed/i.test(name)) {
    return "Herbs";
  }

  // SEEDS
  if (/\bseed(s)?\b/.test(name)) {
    return "Seeds";
  }

  // STONE SPIRITS
  if (/stone.?spirit|spirit.?stone/i.test(name)) {
    return "Stone Spirits";
  }

  // RUNES / AMMO
  if (/\brune(s)?\b/.test(name) && !/runite/.test(name)) {
    return "Runes & Ammunition";
  }

  if (
    /\barrow(s|head)?\b|\bbolt(s|tip)?\b|\bdart(s)?\b|\bjavelin\b|\bthrowingaxe\b|\bthrown.?axe\b/i.test(
      name
    )
  ) {
    return "Runes & Ammunition";
  }

  // GEMS
  if (/\bgemstone\b|\bflawed gemstone\b|\bcrystal\b/i.test(name)) {
    return "Gems";
  }

  if (
    /^uncut |\bsapphire\b|\bemerald\b|\bruby\b|\bdiamond\b|\bdragonstone\b|\bonyx\b|\bzenyte\b|\bhydrix\b/i.test(
      name
    )
  ) {
    return "Gems";
  }

  // ORES / BARS
  if (
    /\bore\b|\bcoal\b|\b(runite|adamantite|mithril|steel|iron|gold|silver|orichalcite|drakolith|necrite|phasmatite|bane)\b.*\b(ore|bar|stone)\b/i.test(
      name
    )
  ) {
    return "Ores & Bars";
  }

  if (
    /\bbar\b/i.test(name) &&
    /(bronze|iron|steel|mithril|adamant|rune|dragon|necrit|orichalcite|drakolith|phasmatit|bane)/i.test(
      name
    )
  ) {
    return "Ores & Bars";
  }

  // SALVAGE
  if (/\bsalvage\b/i.test(name)) {
    return "Salvage";
  }

  // WEAPONS
  if (
    /\b(sword|scimitar|longsword|dagger|mace|halberd|spear|bow|staff|wand|crossbow|whip|flail|maul|axe|battleaxe|pickaxe|hatchet|claws?|fang)\b/i.test(
      name
    )
  ) {
    return "Weapons & Armour";
  }

  // ARMOUR
  if (
    /\b(helm|helmet|platebody|chainbody|platelegs|plateskirt|full helm|kiteshield|sq shield|shield|coif|chaps|body|legs|gloves?|boots?|cape|amulet|ring|necklace|bracelet)\b/i.test(
      name
    )
  ) {
    return "Weapons & Armour";
  }

  // WIKI UNIQUE CATEGORIES
  if (
    !dropType ||
    dropType === "unique" ||
    dropType === "reward"
  ) {
    return "Unique drops";
  }

  return "Other";
}

// ============================================================================
// WIKI CATEGORY OVERRIDES
// ============================================================================

// IMPORTANT:
//
// The Bucket API does NOT always expose the same grouping structure the wiki
// visually renders.
//
// Some bosses therefore need explicit grouping overrides.
//
// This is NORMAL and matches how the wiki itself structures certain tables.

export const PAGE_CATEGORY_OVERRIDES = {
  "General Graardor": {
    normal: {
      always: ["Ourg bones (General Graardor)"],

      unique: [
        "Bandos chestplate",
        "Bandos tassets",
        "Bandos boots",
        "Bandos gloves",
        "Bandos helmet",
        "Bandos hilt",
        "Warpriest of Bandos helmet",
        "Warpriest of Bandos boots",
        "Warpriest of Bandos cape",
      ],

      godsword: [
        "Godsword shard 1",
        "Godsword shard 2",
        "Godsword shard 3",
      ],

      spirits: [
        "Phasmatite stone spirit",
        "Necrite stone spirit",
        "Orichalcite stone spirit",
        "Drakolith stone spirit",
      ],
    },

    hard: {
      always: ["Ourg bones (General Graardor)"],

      unique: [
        "Bandos chestplate",
        "Bandos tassets",
        "Bandos boots",
        "Bandos gloves",
        "Bandos helmet",
        "Bandos hilt",
        "Warpriest of Bandos helmet",
        "Warpriest of Bandos boots",
        "Warpriest of Bandos cape",
      ],

      godsword: [
        "Godsword shard 1",
        "Godsword shard 2",
        "Godsword shard 3",
      ],

      spirits: [
        "Phasmatite stone spirit",
        "Necrite stone spirit",
        "Orichalcite stone spirit",
        "Drakolith stone spirit",
      ],
    },
  },
};

export function applyWikiCategoryOverrides(pageName, drops = []) {
  const override = PAGE_CATEGORY_OVERRIDES[pageName];

  if (!override) {
    return drops;
  }

  return drops.map((drop) => {
    const name = drop.name;
    const modeKey = /hard/i.test(drop.mode) ? "hard" : "normal";

    const mode = override[modeKey];

    if (!mode) {
      return drop;
    }

    if (mode.always?.includes(name)) {
      drop.category = "100%";
      drop.section = "100%";
    }

    else if (mode.unique?.includes(name)) {
      drop.category = "Unique";
      drop.section = "Unique";
    }

    else if (mode.godsword?.includes(name)) {
      drop.category = "Godsword shard table";
      drop.section = "Godsword shard table";
    }

    else if (mode.spirits?.includes(name)) {
      drop.category = "Stone spirits";
      drop.section = "Stone spirits";
    }

    else if (RDT_ITEMS.has(name)) {
      drop.category = "Gem and Rare drop table";
      drop.section = "Gem and Rare drop table";
    }

    return drop;
  });
}

// ============================================================================
// GROUPING HELPERS
// ============================================================================

export function groupDrops(dropRows = []) {
  const grouped = {};

  for (const drop of dropRows) {
    const mode = drop.mode || "Normal Mode";
    const category = drop.category || "Other";

    if (!grouped[mode]) {
      grouped[mode] = {};
    }

    if (!grouped[mode][category]) {
      grouped[mode][category] = [];
    }

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

    if (av !== bv) {
      return av - bv;
    }

    return a.localeCompare(b);
  });
}

export function sortCategories(categories = []) {
  return [...categories].sort((a, b) => {
    const ai = TABLE_ORDER.indexOf(a);
    const bi = TABLE_ORDER.indexOf(b);

    const av = ai === -1 ? 999 : ai;
    const bv = bi === -1 ? 999 : bi;

    if (av !== bv) {
      return av - bv;
    }

    return a.localeCompare(b);
  });
}

// ============================================================================
// ICON FETCHING + CACHE
// ============================================================================

const itemIconCache = new Map();

export async function fetchItemIcon(name) {
  if (!name) {
    return "";
  }

  if (itemIconCache.has(name)) {
    return itemIconCache.get(name);
  }

  try {
    const url = `${WIKI}?action=query&prop=pageimages&titles=${encodeURIComponent(
      name
    )}&pithumbsize=40&piprop=thumbnail&format=json&origin=*`;

    const res = await fetch(url);
    const data = await res.json();
    const pages = data?.query?.pages;

    if (!pages) {
      itemIconCache.set(name, "");
      return "";
    }

    const src = Object.values(pages)[0]?.thumbnail?.source || "";

    itemIconCache.set(name, src);

    return src;
  } catch (e) {
    itemIconCache.set(name, "");
    return "";
  }
}

// ============================================================================
// MONSTER LIST LOADING
// ============================================================================

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

      if (!results) {
        break;
      }

      const keys = Object.keys(results);

      if (!keys.length) {
        break;
      }

      for (const key of keys) {
        const page = results[key];

        const name = page?.printouts?.["Has name"]?.[0] || page.fulltext;

        if (name && !name.includes("/")) {
          monsters.push({
            name,
            fulltext: page.fulltext,
          });
        }
      }

      dbg(`Loaded ${monsters.length} monsters (offset ${offset})`);

      status.textContent = `⏳ Loading... ${monsters.length} found`;

      if (keys.length < limit) {
        break;
      }

      offset += limit;
    }

    const seen = new Set();

    allMonsters = monsters
      .filter((m) => {
        if (seen.has(m.name)) {
          return false;
        }

        seen.add(m.name);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    status.textContent = "";
    label.textContent = "All RS3 monsters";
    count.textContent = allMonsters.length + " total";
  } catch (e) {
    dbg("Monster list load error: " + e.message);

    status.textContent =
      "⚠️ Could not load full list — use search box above";

    allMonsters = POPULAR_NPCS.map((n) => ({
      name: n.name,
      fulltext: n.name,
      cat: n.cat,
      icon: n.icon,
    }));
  }
}
