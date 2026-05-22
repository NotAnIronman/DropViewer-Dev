import { dbg } from "./settings.js";

export const WIKI = "https://runescape.wiki/api.php";
export const BUCKET_API = WIKI;

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
/* GROUPING + SORTING (LEGACY HELPERS)                                       */
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
/* NEW: WIKI HTML LAYOUT + MERGED SORTING                                    */
/* ------------------------------------------------------------------------- */

/**
 * Fetch rendered HTML for a page via action=parse.
 */
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

/**
 * Detect mode from a heading text.
 */
function detectModeFromHeading(text) {
  const s = text.toLowerCase();
  if (/hard mode/.test(s) || /\bhm\b/.test(s)) return "Hard Mode";
  if (/story mode/.test(s)) return "Story Mode";
  if (/challenge mode/.test(s) || /\bcm\b/.test(s)) return "Challenge Mode";
  return null;
}

/**
 * Heuristic: is this table a drop table?
 */
function isDropTable(table) {
  const headers = Array.from(table.querySelectorAll("th")).map((th) =>
    th.textContent.trim().toLowerCase()
  );
  if (!headers.length) return false;

  const hasItem = headers.some((h) => /item|name/.test(h));
  const hasRarity = headers.some((h) =>
    /rarity|chance|rate|drop/.test(h)
  );

  return hasItem && hasRarity;
}

/**
 * Extract item names from a drop table, in order.
 */
function extractItemNamesFromTable(table) {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (!rows.length) return [];

  // Skip header row(s)
  const bodyRows = rows.slice(1);
  const items = [];

  for (const tr of bodyRows) {
    const cells = tr.querySelectorAll("td");
    if (!cells.length) continue;

    const firstCell = cells[0];
    let name = firstCell.textContent || "";
    name = name.replace(/\[[^\]]*\]/g, "").trim(); // strip footnote markers

    if (!name) continue;
    if (/^total$/i.test(name)) continue;

    items.push(name);
  }

  return items;
}

/**
 * Parse the wiki HTML into a layout:
 * [
 *   { mode: "Normal Mode", group: "Always", items: ["Item A", "Item B", ...] },
 *   ...
 * ]
 */
export async function fetchWikiDropLayout(pageName) {
  const html = await fetchWikiHtml(pageName);
  if (!html) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const layout = [];
  let currentMode = "Normal Mode";

  // We walk the content in order, tracking headings and tables.
  const contentRoot =
    doc.querySelector(".mw-parser-output") || doc.body || doc;

  const children = Array.from(contentRoot.children);

  for (const el of children) {
    const tag = el.tagName?.toLowerCase();

    if (tag === "h2" || tag === "h3" || tag === "h4") {
      const headingText = el.textContent.trim();
      const detectedMode = detectModeFromHeading(headingText);
      if (detectedMode) {
        currentMode = detectedMode;
      }
      continue;
    }

    if (tag === "table") {
      const table = el;
      if (!isDropTable(table)) continue;

      // Group name: caption > previous heading > fallback
      let groupName = "";

      const caption = table.querySelector("caption");
      if (caption) {
        groupName = caption.textContent.trim();
      }

      if (!groupName) {
        // Look backwards for nearest heading
        let prev = table.previousElementSibling;
        while (prev) {
          const pt = prev.tagName?.toLowerCase();
          if (pt === "h3" || pt === "h4") {
            groupName = prev.textContent.trim();
            break;
          }
          prev = prev.previousElementSibling;
        }
      }

      if (!groupName) {
        groupName = "Other";
      }

      const normalisedGroup = normaliseCategoryName(groupName);
      const items = extractItemNamesFromTable(table);

      layout.push({
        mode: currentMode || "Normal Mode",
        group: normalisedGroup,
        rawGroup: groupName,
        items,
      });
    }
  }

  dbg(
    `WIKI LAYOUT: ${layout.length} drop tables found for "${pageName}"`
  );

  return layout;
}

/**
 * Merge bucket drops with wiki layout.
 *
 * Returns:
 * [
 *   {
 *     mode: "Normal Mode",
 *     group: "Always",
 *     drops: [drop, drop, ...] // in wiki order
 *   },
 *   ...
 * ]
 */
export function mergeDropsWithWikiLayout(drops = [], layout = []) {
  if (!layout.length) {
    // No layout → fall back to grouping/sorting by our own rules.
    const grouped = groupDrops(drops);
    const modes = sortModes(Object.keys(grouped));
    const result = [];

    for (const mode of modes) {
      const cats = sortCategories(Object.keys(grouped[mode]));
      for (const cat of cats) {
        result.push({
          mode,
          group: cat,
          drops: grouped[mode][cat],
        });
      }
    }

    return result;
  }

  // Map drops by name (case-insensitive) for matching.
  const remaining = new Set(drops);
  const nameMap = new Map();
  for (const drop of drops) {
    const key = drop.name.toLowerCase();
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key).push(drop);
  }

  const result = [];

  for (const section of layout) {
    const sectionDrops = [];
    for (const itemName of section.items) {
      const key = itemName.toLowerCase();
      const list = nameMap.get(key);
      if (!list || !list.length) continue;

      // Take all drops with this name (could be multiple modes/variants).
      for (const d of list) {
        if (!remaining.has(d)) continue;
        remaining.delete(d);

        // Override category to match wiki group; keep mode from bucket.
        sectionDrops.push({
          ...d,
          category: section.group,
          section: section.group,
        });
      }
    }

    if (sectionDrops.length) {
      result.push({
        mode: section.mode || "Normal Mode",
        group: section.group,
        drops: sectionDrops,
      });
    }
  }

  // Any remaining drops that weren't matched to a table → append at the end.
  if (remaining.size) {
    const leftoversByMode = {};
    for (const d of remaining) {
      const mode = d.mode || "Normal Mode";
      if (!leftoversByMode[mode]) leftoversByMode[mode] = [];
      leftoversByMode[mode].push(d);
    }

    for (const [mode, list] of Object.entries(leftoversByMode)) {
      result.push({
        mode,
        group: "Other",
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
 * Result shape:
 * [
 *   { mode: "Normal Mode", group: "Always", drops: [...] },
 *   { mode: "Normal Mode", group: "Main drop", drops: [...] },
 *   ...
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
