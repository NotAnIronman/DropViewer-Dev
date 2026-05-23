// scripts/settings.js

// Debug + settings state
export const settings = { debugLog: false, ocrCanvas: false, opacity: 100, emojis: true, hiRes: false };

export function saveSetting(k, v) {
  settings[k] = v;
  try {
    localStorage.setItem("dvSettings", JSON.stringify(settings));
  } catch (e) {}
}

// Load settings from localStorage
(function () {
  try {
    const s = JSON.parse(localStorage.getItem("dvSettings") || "{}");
    if (s.debugLog !== undefined) settings.debugLog = s.debugLog;
    if (s.ocrCanvas !== undefined) settings.ocrCanvas = s.ocrCanvas;
    if (s.emojis !== undefined) settings.emojis = s.emojis;
    if (s.hiRes !== undefined) settings.hiRes = s.hiRes;
    if (typeof s.opacity === "number")
      settings.opacity = Math.max(30, Math.min(100, s.opacity));
  } catch (e) {}
})();

export const DEBUG_OVERLAY_HEIGHT = 180;

// Debug overlay + OCR canvas creation
export function getOrCreateDebugOverlay() {
  let el = document.getElementById("section-debug");
  if (!el) {
    el = document.createElement("div");
    el.id = "section-debug";
    el.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,.88);" +
      "color:#00ff00;font-family:monospace;font-size:11px;line-height:1.5;" +
      "padding:6px 8px;height:" +
      DEBUG_OVERLAY_HEIGHT +
      "px;overflow-y:auto;z-index:9999;white-space:pre-wrap;box-sizing:border-box;";
    el.style.display = "none";
    document.body.appendChild(el);
  }
  return el;
}

export function getOrCreateOcrCanvas() {
  let el = document.getElementById("dbg-ocr-canvas");
  if (!el) {
    el = document.createElement("canvas");
    el.id = "dbg-ocr-canvas";
    el.style.cssText =
      "position:fixed;bottom:0;right:4px;border:2px solid #f5c518;" +
      "image-rendering:pixelated;z-index:9999;background:#222;" +
      "max-width:98vw;min-width:40px;min-height:20px;";
    el.style.display = "none";
    document.body.appendChild(el);
  }
  return el;
}

// Apply settings to UI
export function applyToggleUI() {
  const debugBtn = document.getElementById("toggle-debug");
  const ocrBtn = document.getElementById("toggle-ocr-canvas");
  const opacitySlider = document.getElementById("opacity-slider");
  const opacityValue = document.getElementById("opacity-value");

  if (debugBtn) debugBtn.classList.toggle("on", settings.debugLog);
  if (ocrBtn) ocrBtn.classList.toggle("on", settings.ocrCanvas);

  const emojiBtn = document.getElementById("toggle-emojis");
  if (emojiBtn) emojiBtn.classList.toggle("on", settings.emojis);

  const hiResBtn = document.getElementById("toggle-hires");
  if (hiResBtn) hiResBtn.classList.toggle("on", settings.hiRes);

  if (opacitySlider) opacitySlider.value = settings.opacity;
  if (opacityValue) opacityValue.textContent = settings.opacity + "%";

  document.body.style.opacity = (settings.opacity / 100).toString();

  const debugOverlay = getOrCreateDebugOverlay();
  debugOverlay.style.display = settings.debugLog ? "block" : "none";

  const oc = getOrCreateOcrCanvas();
  oc.style.display = settings.ocrCanvas ? "block" : "none";
  oc.style.bottom = settings.debugLog ? DEBUG_OVERLAY_HEIGHT + "px" : "0px";
}

// Debug logging
const DEBUG_MAX_LINES = 200;

export function dbg(s) {
  console.log("[DropViewer]", s);
  const o = getOrCreateDebugOverlay();
  const esc = String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  o.innerHTML += esc + "<br>";
  const lines = o.innerHTML.split("<br>");
  if (lines.length > DEBUG_MAX_LINES) {
    o.innerHTML = lines.slice(-DEBUG_MAX_LINES).join("<br>");
  }
  o.scrollTop = o.scrollHeight;
}

// Status helper
export function setStatus(type, msg) {
  const el = document.getElementById("status");
  if (!el) return;
  el.className = type;
  el.textContent = msg;
}

// Settings UI wiring (stays here so core/ui can stay lean)
export function initSettingsUI() {
  const settingsBtn = document.getElementById("settings-btn");
  const settingsPanel = document.getElementById("settings-panel");
  const toggleDebug = document.getElementById("toggle-debug");
  const toggleOcrCanvas = document.getElementById("toggle-ocr-canvas");
  const opacitySlider = document.getElementById("opacity-slider");

  if (!settingsBtn || !settingsPanel) return;

  settingsBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    settingsPanel.classList.toggle("open");
    settingsBtn.classList.toggle(
      "active",
      settingsPanel.classList.contains("open")
    );
    applyToggleUI();
  });

  document.addEventListener("click", function () {
    settingsPanel.classList.remove("open");
    settingsBtn.classList.remove("active");
  });

  settingsPanel.addEventListener("click", (e) => e.stopPropagation());

  if (toggleDebug) {
    toggleDebug.addEventListener("click", function () {
      saveSetting("debugLog", !settings.debugLog);
      applyToggleUI();
    });
  }

  if (toggleOcrCanvas) {
    toggleOcrCanvas.addEventListener("click", function () {
      saveSetting("ocrCanvas", !settings.ocrCanvas);
      applyToggleUI();
    });
  }

  const toggleEmojis = document.getElementById("toggle-emojis");
  if (toggleEmojis) {
    toggleEmojis.addEventListener("click", function () {
      saveSetting("emojis", !settings.emojis);
      applyToggleUI();
    });
  }

  const toggleHiRes = document.getElementById("toggle-hires");
  if (toggleHiRes) {
    toggleHiRes.addEventListener("click", function () {
      saveSetting("hiRes", !settings.hiRes);
      applyToggleUI();
    });
  }

  if (opacitySlider) {
    opacitySlider.addEventListener("input", function (e) {
      const v = parseInt(e.target.value, 10) || 100;
      saveSetting("opacity", v);
      applyToggleUI();
    });
  }
}
