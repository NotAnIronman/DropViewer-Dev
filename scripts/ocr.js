// scripts/ocr.js
// ============================================================================
// Alt1 + OCR integration: anchors, capture, font loading, name resolution
// ============================================================================

import {
  dbg,
  setStatus,
  getOrCreateOcrCanvas,
  DEBUG_OVERLAY_HEIGHT,
  settings,
} from "./settings.js";
import { allMonsters } from "./data.js";
import { showDrops } from "./ui.js";
import {
  lookupPage,
  lookupItemSources,
  setCurrentMode,
  currentMode,
} from "../core.js";

// ============================================================================
// OCR core helpers
// ============================================================================

let _ocr = null;
let _font = null;
let _fontLoading = false;

function getOCR() {
  if (_ocr) return _ocr;
  if (typeof window.OCR !== "undefined") {
    _ocr = window.OCR;
    return _ocr;
  }
  return null;
}

async function loadFont() {
  if (_font) return _font;
  if (_fontLoading) return null;
  _fontLoading = true;

  const ocr = getOCR();
  if (!ocr) {
    dbg("OCR module not loaded yet");
    _fontLoading = false;
    return null;
  }

  // Try custom right-click font
  try {
    const meta = await fetch("./fonts/rightclick.fontmeta.json").then((r) =>
      r.json()
    );
    const pngUrl = "./fonts/rightclick.data.png";
    const fontDef = await buildFontFromFiles(ocr, meta, pngUrl);
    if (fontDef) {
      _font = fontDef;
      dbg("✅ Font loaded: rightclick (custom)");
      return _font;
    }
  } catch (e) {
    dbg("rightclick font load failed: " + e.message);
  }

  // Built-in fallback fonts
  const builtins = [
    { global: "OCR_aa_8px_mono", label: "aa_8px_mono" },
    { global: "OCR_aa_10px_mono", label: "aa_10px_mono" },
    { global: "OCR_aa_12px_mono", label: "aa_12px_mono" },
  ];

  for (const fb of builtins) {
    if (typeof window[fb.global] !== "undefined") {
      _font = window[fb.global];
      dbg("✅ Font loaded: " + fb.label + " (built-in)");
      return _font;
    }
  }

  dbg("⚠️ No font available for OCR");
  _fontLoading = false;
  return null;
}

async function buildFontFromFiles(ocr, meta, pngUrl) {
  const blob = await fetch(pngUrl).then((r) => r.blob());
  const bitmap = await createImageBitmap(blob, {
    colorSpaceConversion: "none",
  });

  const c = document.createElement("canvas");
  c.width = bitmap.width;
  c.height = bitmap.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const raw = ctx.getImageData(0, 0, c.width, c.height);
  const W = raw.width;
  const H = raw.height;

  const pxheight = H - 1;
  const glyphData = new Uint8ClampedArray(W * pxheight * 4);
  glyphData.set(raw.data.subarray(0, W * pxheight * 4));

  // Font PNG encodes glyph data in RGB (not alpha). Copy R→alpha so unblendTrans works.
  const rgbFixed = new Uint8ClampedArray(W * pxheight * 4);
  for (let i = 0; i < W * pxheight * 4; i += 4) {
    rgbFixed[i + 0] = glyphData[i + 0];
    rgbFixed[i + 1] = glyphData[i + 1];
    rgbFixed[i + 2] = glyphData[i + 2];
    rgbFixed[i + 3] = glyphData[i + 0]; // alpha = R channel (luminance)
  }

  let inimg;
  try {
    inimg = new window.A1lib.ImageData(rgbFixed, W, pxheight);
  } catch (e) {
    inimg = { width: W, height: pxheight, data: rgbFixed };
  }

  const color =
    meta.color && meta.color.length >= 3 ? meta.color : [255, 255, 255];
  const shadow = !!meta.shadow;

  let outimg;
  if (meta.unblendmode === "raw") {
    outimg = ocr.unblendTrans(inimg, shadow, color[0], color[1], color[2]);
  } else {
    outimg = ocr.unblendBlackBackground(
      inimg,
      color[0],
      color[1],
      color[2]
    );
  }

  const unblendedData = new Uint8ClampedArray(W * (pxheight + 1) * 4);
  unblendedData.set(outimg.data.subarray(0, W * pxheight * 4));

  const markerRowSrc = raw.data.subarray(
    W * pxheight * 4,
    W * (pxheight + 1) * 4
  );
  unblendedData.set(markerRowSrc, W * pxheight * 4);

  let unblended;
  try {
    unblended = new window.A1lib.ImageData(
      unblendedData,
      W,
      pxheight + 1
    );
  } catch (e) {
    unblended = { width: W, height: pxheight + 1, data: unblendedData };
  }

  const chars = meta.chars || "";
  const seconds = meta.seconds || "";
  const basey = meta.basey !== undefined ? meta.basey : 10;
  const sw = meta.spacewidth !== undefined ? meta.spacewidth : 4;
  const thresh = meta.treshold !== undefined ? meta.treshold : 0.4;

  const fontDef = ocr.generatefont(
    unblended,
    chars,
    seconds,
    meta.bonus || {},
    basey,
    sw,
    thresh,
    shadow
  );

  dbg(
    `Font generated: ${fontDef.chars.length} chars, width=${fontDef.width}, height=${fontDef.height}, basey=${fontDef.basey}, shadow=${fontDef.shadow}`
  );
  return fontDef;
}

// ============================================================================
// Name cleanup helpers
// ============================================================================

export function stripLevelSuffix(raw) {
  if (!raw) return { text: raw, hadLevel: false };
  raw = raw.trim();
  let hadLevel = false;

  const bracketMatch = raw.match(
    /\s*[\(\[{<][^\)\]}>]*\d[^\)\]}>]*[\)\]}>]\s*$/
  );
  if (bracketMatch) {
    raw = raw.slice(0, raw.length - bracketMatch[0].length).trim();
    hadLevel = true;
  }

  const dm = raw.match(/\d+/);
  if (dm) {
    let i = dm.index - 1;
    while (i >= 0 && /[\s\-:.,;(]/.test(raw[i])) i--;
    const we = i + 1;
    while (i >= 0 && /[a-zA-Z]/.test(raw[i])) i--;
    const ws = i + 1;
    const word = raw.slice(ws, we);

    if (
      word.length >= 3 &&
      word.length <= 8 &&
      /[eua]/i.test(word) &&
      /[lsvy]$/i.test(word)
    ) {
      let ca = ws - 1;
      while (ca >= 0 && /[\s\-:.,;(]/.test(raw[ca])) ca--;
      raw = raw.slice(0, ca + 1);
      hadLevel = true;
    } else if (dm) {
      raw = raw.replace(/[\s\-]+\d+\s*$/, "").trim();
      if (raw.length < dm.index + dm[0].length) hadLevel = true;
    }
  }

  raw = raw.replace(/(?<=[a-zA-Z\d])\s+[lLjJiI1]\s*$/, "").trim();
  raw = raw.replace(/[\s\-|_.,;:!?]+$/, "").trim();

  return { text: raw, hadLevel };
}

export function resolveOcrName(raw) {
  if (!raw) return raw;

  let stripped = stripLevelSuffix(raw).text;
  stripped = stripped
    .trim()
    .replace(/(\s+\d+)+\s*$/, "")
    .trim()
    .replace(/\s+[lLjJiI1]\s*$/, "")
    .trim();

  if (!allMonsters.length) return stripped;

  const lower = stripped.toLowerCase();
  for (const m of allMonsters) {
    if (m.name.toLowerCase() === lower) return m.name;
  }

  const parts = stripped.split(/\s+/);
  while (parts.length > 1) {
    parts.pop();
    const sub = parts.join(" ").toLowerCase();
    for (const m of allMonsters) {
      if (m.name.toLowerCase() === sub) {
        dbg('OCR "' + stripped + '"→"' + m.name + '"');
        return m.name;
      }
    }
  }

  return stripped;
}

// ============================================================================
// Alt1 integration + anchors + OCR capture
// ============================================================================

let _alt1Badge = null;
let alt1InitDone = false;

function flashBadge(color) {
  if (!_alt1Badge) return;
  _alt1Badge.style.background = color || "#4caf50";
  setTimeout(() => {
    _alt1Badge.style.background = "#e94560";
  }, 1500);
}

// Anchors
let anchorTL = null;
let anchorBR = null;
let anchorExamine = null;
let anchorsLoading = false;

async function loadAnchors() {
  if (anchorTL && anchorBR && anchorExamine) return true;
  if (anchorsLoading) return false;
  anchorsLoading = true;

  try {
    const ID = window.A1lib.ImageDetect;

    // UPDATED PATHS
    anchorTL = await ID.imageDataFromUrl("./menuTracking/TopLeft.png");
    anchorBR = await ID.imageDataFromUrl("./menuTracking/BottomRight.png");
    anchorExamine = await ID.imageDataFromUrl("./menuTracking/Examine.png");

    dbg("Anchors loaded");
    return true;
  } catch (e) {
    dbg("Anchor load error: " + e.message);
    anchorsLoading = false;
    return false;
  }
}

function imgDataToCanvas(d) {
  const c = document.createElement("canvas");
  c.width = d.width;
  c.height = d.height;
  const ctx = c.getContext("2d");
  const id = ctx.createImageData(d.width, d.height);
  id.data.set(d.data);
  ctx.putImageData(id, 0, 0);
  return c;
}

function scaleCanvas(src, scale) {
  const dst = document.createElement("canvas");
  dst.width = src.width * scale;
  dst.height = src.height * scale;
  const ctx = dst.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, dst.width, dst.height);
  return dst;
}

async function readExamineWindow() {
  if (!window.alt1 || !window.alt1.permissionPixel) {
    setStatus("err", "Pixel permission not granted");
    return;
  }

  setStatus("busy", "Scanning for Examine window...");

  if (!(await loadAnchors())) {
    setStatus("err", "Anchor images missing");
    return;
  }

  try {
    const a1lib = window.A1lib;
    const screen = a1lib.captureHoldFullRs();
    if (!screen) {
      setStatus("err", "Screen capture failed");
      return;
    }

    const tlHits = screen.findSubimage(anchorTL);
    const brHits = screen.findSubimage(anchorBR);
    const exHits = screen.findSubimage(anchorExamine);

    dbg("Hits TL:" + tlHits.length + " BR:" + brHits.length + " Ex:" + exHits.length);

    if (!tlHits.length) {
      setStatus("err", "Examine window not found");
      return;
    }

    let bestMatch = null;

    if (brHits.length) {
      for (const t of tlHits) {
        for (const b of brHits) {
          if (b.x < t.x || b.y < t.y + anchorTL.height) continue;
          const w = b.x + anchorBR.width - t.x;
          const h = b.y + anchorBR.height - t.y;
          if (w > 800 || h > 500) continue;

          let ex = null;
          for (const e of exHits) {
            if (
              e.x >= t.x &&
              e.x + anchorExamine.width <= b.x + anchorBR.width &&
              e.y >= t.y + anchorTL.height &&
              e.y + anchorExamine.height <= b.y
            ) {
              ex = e;
              break;
            }
          }

          const score = (ex ? 0 : 1e9) + w * h;
          if (!bestMatch || score < bestMatch.score) {
            bestMatch = { tl: t, br: b, ex, score };
          }
        }
      }
    }

    if (!bestMatch && tlHits.length) {
      const t = tlHits[0];
      const ex =
        exHits.find((e) => e.y > t.y && e.x >= t.x) || exHits[0] || null;
      dbg("No BR — TL-only fallback");
      bestMatch = { tl: t, br: null, ex, score: 0 };
    }

    if (!bestMatch) {
      setStatus("err", "Examine window not found");
      return;
    }

    const { tl, br, ex } = bestMatch;
    const PAD = 3;
    let nameAbsX, nameAbsY, nameW, nameH;

    if (ex) {
      nameAbsX = ex.x + anchorExamine.width + 3;
      nameAbsY = ex.y - PAD;
      nameH = anchorExamine.height + PAD * 2;
      nameW = br
        ? br.x + anchorBR.width - nameAbsX
        : Math.min(screen.width - nameAbsX, 400);
    } else if (br) {
      nameAbsX = tl.x;
      nameAbsY = tl.y + anchorTL.height - PAD;
      nameW = br.x + anchorBR.width - tl.x;
      nameH = br.y - (tl.y + anchorTL.height) + PAD * 2;
    } else {
      nameAbsX = tl.x;
      nameAbsY = tl.y + anchorTL.height - PAD;
      nameW = Math.min(screen.width - tl.x, 400);
      nameH = 30 + PAD * 2;
    }

    if (nameAbsY < 0) {
      nameH += nameAbsY;
      nameAbsY = 0;
    }
    if (nameAbsX < 0) {
      nameW += nameAbsX;
      nameAbsX = 0;
    }
    if (nameAbsX + nameW > screen.width) {
      nameW = screen.width - nameAbsX;
    }
    if (nameAbsY + nameH > screen.height) {
      nameH = screen.height - nameAbsY;
    }
    if (nameW <= 0) {
      setStatus("err", "Name crop zero-width");
      return;
    }

    const stripRaw = screen.toData(nameAbsX, nameAbsY, nameW, nameH);
    const SW = stripRaw.width || nameW;
    const SH = stripRaw.height || nameH;
    const SD = stripRaw.data;

    const colBright = new Uint8Array(SW);
    for (let cx = 0; cx < SW; cx++) {
      for (let cy = 0; cy < SH; cy++) {
        const si = (cy * SW + cx) * 4;
        if ((SD[si] + SD[si + 1] + SD[si + 2]) / 3 > 55) {
          colBright[cx] = 1;
          break;
        }
      }
    }

    const gaps = [];
    let inGap = false;
    let gapStart = 0;

    for (let gx = 0; gx < SW; gx++) {
      if (!colBright[gx] && !inGap) {
        inGap = true;
        gapStart = gx;
      } else if (colBright[gx] && inGap) {
        gaps.push({ start: gapStart, end: gx - 1 });
        inGap = false;
      }
    }
    if (inGap) gaps.push({ start: gapStart, end: SW - 1 });

    let clipCol = SW;
    for (let gi = gaps.length - 1; gi >= 0; gi--) {
      const g = gaps[gi];
      if (g.end - g.start + 1 < 10) continue; // skip word-space gaps, only clip large gaps (border/noise)

      let hL = false;
      let hR = false;

      for (let lx = g.start - 1; lx >= 0; lx--) {
        if (colBright[lx]) {
          hL = true;
          break;
        }
      }
      for (let rx = g.end + 1; rx < SW; rx++) {
        if (colBright[rx]) {
          hR = true;
          break;
        }
      }

      if (hL && hR) {
        clipCol = g.start;
        break;
      }
    }

    const cW = Math.max(1, clipCol);
    const cD = {
      width: cW,
      height: SH,
      data: new Uint8ClampedArray(cW * SH * 4),
    };

    for (let r = 0; r < SH; r++) {
      for (let c = 0; c < cW; c++) {
        const s = (r * SW + c) * 4;
        const d = (r * cW + c) * 4;
        cD.data[d] = SD[s];
        cD.data[d + 1] = SD[s + 1];
        cD.data[d + 2] = SD[s + 2];
        cD.data[d + 3] = 255;
      }
    }

    // --- Remap examine strip: dark text (~85) on light bg (~194) → white text on black ---
    const remapped = new Uint8ClampedArray(cW * SH * 4);
    for (let i = 0; i < cW * SH; i++) {
      const r = cD.data[i * 4 + 0];
      const g = cD.data[i * 4 + 1];
      const b = cD.data[i * 4 + 2];
      const br = (r + g + b) / 3;
      const col = br < 128 ? 255 : 0; // dark text → white, light bg → black
      remapped[i * 4 + 0] = col;
      remapped[i * 4 + 1] = col;
      remapped[i * 4 + 2] = col;
      remapped[i * 4 + 3] = 255;
    }

    const remappedData = { width: cW, height: SH, data: remapped };
    const unscaledCanvas = imgDataToCanvas(remappedData);

    // Scaled canvas for debug preview only
    const scaled = scaleCanvas(unscaledCanvas, 4);

    const oc = getOrCreateOcrCanvas();
    oc.width = scaled.width;
    oc.height = scaled.height;
    oc.getContext("2d").drawImage(scaled, 0, 0);
    oc.style.bottom = settings.debugLog
      ? DEBUG_OVERLAY_HEIGHT + "px"
      : "0px";
    if (settings.ocrCanvas) oc.style.display = "block";

    setStatus("busy", "Running OCR...");

    const ocr = getOCR();
    if (!ocr) {
      setStatus("err", "OCR module not loaded");
      return;
    }

    // Build font candidate list
    const fontCandidates = [];

    if (window.A1lib) {
      try {
        const meta = await fetch("./fonts/rightclick.fontmeta.json").then(r => r.json());
        const fontDef = await buildFontFromFiles(ocr, meta, "./fonts/rightclick.data.png");
        if (fontDef) fontCandidates.push({ def: fontDef, label: "rightclick" });
      } catch (e) {
        dbg("rightclick font skipped: " + e.message);
      }
    }

    for (const name of ["OCR_aa_8px_mono", "OCR_aa_10px_mono", "OCR_aa_12px_mono"]) {
      if (typeof window[name] !== "undefined") {
        fontCandidates.push({ def: window[name], label: name });
      }
    }

    if (!fontCandidates.length) {
      setStatus("err", "OCR font not available");
      return;
    }

    const a1Img = new window.A1lib.ImageData(remapped, cW, SH);

    let tesseractRaw = "";

    for (const candidate of fontCandidates) {
      try {
        const font = candidate.def;
        dbg(`OCR attempt [${candidate.label}]: img ${a1Img.width}x${a1Img.height}`);
        const result = ocr.readLine(a1Img, font, [255, 255, 255], 0, 13, true);
        const text = (result?.text || "").trim();
        dbg(`OCR [${candidate.label}] raw: "${text}"`);
        if (text.length >= 2) {
          tesseractRaw = text;
          dbg(`✅ Font [${candidate.label}] produced text`);
          break;
        }
      } catch (e) {
        dbg(`OCR [${candidate.label}] error: ` + e.message);
      }
    }
    dbg('OCR raw: "' + tesseractRaw + '"');

    const stripped = stripLevelSuffix(tesseractRaw);
    dbg(
      'rawAfter="' +
        stripped.text +
        '" levelWasStripped=' +
        stripped.hadLevel
    );

    if (!stripped.text || stripped.text.length < 2) {
      setStatus("err", "OCR returned no text");
      return;
    }

    const resolved = resolveOcrName(stripped.text);
    dbg('resolved="' + resolved + '"');
    flashBadge("#4caf50");

    if (stripped.hadLevel) {
      setCurrentMode("npc");
      document
        .querySelectorAll(".mode-tab")
        .forEach((t) =>
          t.classList.toggle("active", t.dataset.mode === "npc")
        );
      const inp = document.getElementById("search-input");
      inp.placeholder = "Search NPCs...";
      inp.value = resolved;

      setStatus("busy", "NPC: " + resolved);
      showDrops();
      document.getElementById("subtitle").textContent = resolved;
      document.getElementById("drops").innerHTML = "";
      lookupPage(resolved);
    } else {
      setCurrentMode("item");
      document
        .querySelectorAll(".mode-tab")
        .forEach((t) =>
          t.classList.toggle("active", t.dataset.mode === "item")
        );
      const inp = document.getElementById("search-input");
      inp.placeholder = "Search items...";
      inp.value = resolved;

      setStatus("busy", "Item: " + resolved);
      lookupItemSources(resolved);
    }
  } catch (e) {
    dbg("readExamineWindow error: " + e.message);
    setStatus("err", "Error: " + e.message.slice(0, 80));
  }
}

function parseExamineText(text) {
  if (!text) return null;
  const m = text.match(/Examine[^a-z]+(.+)/i);
  return m ? m[1].trim() : null;
}

function processOpenInfo(info) {
  if (!info) return false;

  let text = info;
  if (typeof info === "string") {
    try {
      const p = JSON.parse(info);
      text = p.text || p.match || p.string || JSON.stringify(p);
    } catch (e) {}
  }

  const parsed = parseExamineText(text);
  if (!parsed) return false;

  const stripped = stripLevelSuffix(parsed);
  const name = resolveOcrName(stripped.text);
  dbg('openInfo: "' + parsed + '" -> "' + name + '" hadLevel=' + stripped.hadLevel);
  flashBadge("#4caf50");

  if (stripped.hadLevel) {
    setCurrentMode("npc");
    document
      .querySelectorAll(".mode-tab")
      .forEach((t) =>
        t.classList.toggle("active", t.dataset.mode === "npc")
      );
    const inp = document.getElementById("search-input");
    inp.placeholder = "Search NPCs...";
    inp.value = name;

    setStatus("busy", "NPC: " + name);
    setTimeout(() => {
      showDrops();
      document.getElementById("subtitle").textContent = name;
      document.getElementById("drops").innerHTML = "";
      lookupPage(name);
    }, 200);
  } else {
    setCurrentMode("item");
    document
      .querySelectorAll(".mode-tab")
      .forEach((t) =>
        t.classList.toggle("active", t.dataset.mode === "item")
      );
    const inp = document.getElementById("search-input");
    inp.placeholder = "Search items...";
    inp.value = name;

    setStatus("busy", "Item: " + name);
    setTimeout(() => lookupItemSources(name), 200);
  }

  return true;
}

// ============================================================================
// Public init: Alt1 + OCR bootstrap
// ============================================================================

export function initAlt1Integration() {
  if (alt1InitDone || typeof window.alt1 === "undefined") return;
  alt1InitDone = true;

  const closeBtn = document.getElementById("close");
  if (closeBtn) closeBtn.style.display = "none";

  const badge = document.createElement("div");
  badge.id = "alt1badge";
  badge.style.cssText =
    "position:fixed;top:4px;right:30px;background:#e94560;color:#fff;" +
    "font-size:9px;padding:1px 5px;border-radius:2px;font-weight:700;" +
    "z-index:100;cursor:pointer;";
  badge.textContent = "ALT1";
  badge.title = "Click to manually read screen";
  document.body.appendChild(badge);
  _alt1Badge = badge;

  dbg("alt1 v" + window.alt1.version);
  try {
    window.alt1.identifyAppUrl("./appconfig.json");
  } catch (e) {
    dbg("identifyApp err: " + e.message);
  }

  // UPDATED PATH
  const a1script = document.createElement("script");
  a1script.src = "./menuTracking/alt1base.bundle.js";

  a1script.onload = function () {
    // Load OCR bundle AFTER alt1base so A1lib classes (Rect etc) exist first
    const ocrScript = document.createElement("script");
    ocrScript.src = "./menuTracking/alt1ocr.bundle.js";
    ocrScript.onload = () => dbg("alt1ocr bundle loaded — window.OCR: " + (typeof window.OCR));
    document.head.appendChild(ocrScript);
    let attempts = 0;
    function tryA1lib() {
      const a1lib = window.A1lib;
      if (a1lib && typeof a1lib.captureHoldFullRs === "function") {
        dbg("A1lib loaded");
        loadAnchors();

        a1lib.on("alt1pressed", function () {
          dbg("alt1pressed");
          readExamineWindow();
        });

        dbg("Alt+1 hook registered");

        const ocr = getOCR();
        dbg(
          ocr
            ? "✅ window.OCR loaded"
            : "⏳ window.OCR not ready yet — will retry on first Alt+1"
        );
      } else if (attempts < 30) {
        attempts++;
        setTimeout(tryA1lib, 100);
      } else {
        dbg("A1lib unavailable");
      }
    }
    tryA1lib();
  };

  a1script.onerror = function () {
    dbg("Failed to load alt1base.bundle.js");
    setStatus("ok", "Alt1 — right-click NPC, hover Examine, press Alt+1");
  };

  document.head.appendChild(a1script);

  if (!processOpenInfo(window.alt1.openInfo)) {
    setStatus("ok", "Alt1 — right-click NPC, hover Examine, press Alt+1");
  }

  let lastOpenInfo = JSON.stringify(window.alt1.openInfo);
  setInterval(() => {
    const cur = JSON.stringify(window.alt1.openInfo);
    if (cur !== lastOpenInfo) {
      lastOpenInfo = cur;
      processOpenInfo(window.alt1.openInfo);
    }
  }, 200);

  badge.addEventListener("click", () => {
    flashBadge("#f5c518");
    readExamineWindow();
  });
}

export function autoPollAlt1() {
  let elapsed = 0;
  const poll = setInterval(() => {
    elapsed += 500;
    if (alt1InitDone || elapsed >= 30000) {
      clearInterval(poll);
    } else if (typeof window.alt1 !== "undefined") {
      initAlt1Integration();
    }
  }, 500);
}
