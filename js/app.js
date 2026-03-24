/**
 * MCBE.lang – Minecraft Bedrock Edition Translation Tool
 *
 * Workflow:
 *   1. User uploads a .mcpack or .mcaddon (both are ZIP archives)
 *   2. App finds all .lang files inside the ZIP
 *   3. User picks source language → target language
 *   4. Translation table is shown; existing translations are pre-filled
 *   5. User downloads either a plain .lang file or a full .mcpack
 */

/* ── All Minecraft Bedrock supported languages ─────────────────── */
const MC_LANGUAGES = [
  { code: "en_US", name: "English (US)" },
  { code: "en_GB", name: "English (UK)" },
  { code: "de_DE", name: "Deutsch (Deutschland)" },
  { code: "es_ES", name: "Español (España)" },
  { code: "es_MX", name: "Español (México)" },
  { code: "fr_FR", name: "Français (France)" },
  { code: "fr_CA", name: "Français (Canada)" },
  { code: "it_IT", name: "Italiano (Italia)" },
  { code: "ja_JP", name: "日本語 (日本)" },
  { code: "ko_KR", name: "한국어 (대한민국)" },
  { code: "nl_NL", name: "Nederlands (Nederland)" },
  { code: "pt_BR", name: "Português (Brasil)" },
  { code: "pt_PT", name: "Português (Portugal)" },
  { code: "ru_RU", name: "Русский (Россия)" },
  { code: "zh_CN", name: "中文（简体）" },
  { code: "zh_TW", name: "繁體中文（台灣）" },
  { code: "pl_PL", name: "Polski (Polska)" },
  { code: "sv_SE", name: "Svenska (Sverige)" },
  { code: "nb_NO", name: "Norsk (Norge)" },
  { code: "da_DA", name: "Dansk (Danmark)" },
  { code: "fi_FI", name: "Suomi (Suomi)" },
  { code: "tr_TR", name: "Türkçe (Türkiye)" },
  { code: "cs_CZ", name: "Čeština (Česká republika)" },
  { code: "sk_SK", name: "Slovenčina (Slovensko)" },
  { code: "hu_HU", name: "Magyar (Magyarország)" },
  { code: "el_GR", name: "Ελληνικά (Ελλάδα)" },
  { code: "ro_RO", name: "Română (România)" },
  { code: "uk_UA", name: "Українська (Україна)" },
  { code: "bg_BG", name: "Български (България)" },
  { code: "hr_HR", name: "Hrvatski (Hrvatska)" },
  { code: "lt_LT", name: "Lietuvių (Lietuva)" },
  { code: "lv_LV", name: "Latviešu (Latvija)" },
  { code: "et_EE", name: "Eesti (Eesti)" },
  { code: "vi_VN", name: "Tiếng Việt (Việt Nam)" },
  { code: "id_ID", name: "Bahasa Indonesia (Indonesia)" },
  { code: "ms_MY", name: "Bahasa Melayu (Malaysia)" },
  { code: "th_TH", name: "ภาษาไทย (ไทย)" },
  { code: "fa_IR", name: "فارسی (ایران)" },
  { code: "ar_SA", name: "العربية (المملكة العربية السعودية)" },
  { code: "he_IL", name: "עברית (ישראל)" },
];
const PACK_ICON_REGEX = /(?:^|[\\/])pack_icon\.(png|jpe?g)$/i;
const MAX_ICON_DATA_URL_LENGTH = 200000; // ~150 KB of base64 data
const DRAFT_STATE_KEY = "mcbe-language-draft-v1";
const DRAFT_DB_NAME = "mcbe-language-drafts";
const DRAFT_DB_VERSION = 1;
const DRAFT_STORE_NAME = "drafts";
const DRAFT_FILE_KEY = "current-pack";

/* ── State ──────────────────────────────────────────────────────── */
let uploadedFileName = "";
let parsedZip        = null;         // JSZip instance
let langFiles        = {};           // { "path/en_US.lang": "file content", … }
let parsedLangs      = {};           // { "en_US": { key: value }, … }
let availableLangCodes = [];         // codes found in the ZIP
let textsBasePath    = "texts/";     // path prefix up to and including "texts/" inside the ZIP
let sourceEntries    = {};           // { key: sourceText } for selected source lang
let targetEntries    = {};           // { key: existingTranslation } pre-filled from ZIP
let allKeys          = [];           // ordered list of keys from the source
let visibleKeys      = [];           // keys currently shown (after filter)
let targetLangCode   = "";
let packMeta         = null;
let isProcessing     = false;        // guard against concurrent file processing
let isRestoringDraft = false;
let persistDraftTimer = null;

/* ── DOM refs ────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const dropZone         = $("drop-zone");
const browseBtn        = $("browse-btn");
const fileInput        = $("file-input");
const fileInfo         = $("file-info");
const uploadError      = $("upload-error");
const packSummary      = $("pack-summary");
const packIcon         = $("pack-icon");
const packTitle        = $("pack-title");
const packDesc         = $("pack-desc");
const langSection      = $("language-section");
const sourceLangSel    = $("source-lang");
const targetLangSel    = $("target-lang");
const loadBtn          = $("load-btn");
const translationSection = $("translation-section");
const searchInput      = $("search-input");
const progressLabel    = $("progress-label");
const tbody            = $("translation-tbody");
const clearBtn         = $("clear-btn");
const toDownloadBtn    = $("to-download-btn");
const downloadSection  = $("download-section");
const downloadPreview  = $("download-preview");
const downloadLangBtn  = $("download-lang-btn");
const downloadPackBtn  = $("download-pack-btn");

/* ── Utility helpers ────────────────────────────────────────────── */

/** Generate a random RFC-4122 UUID v4 */
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Show or hide a section card */
function showSection(el) { el.classList.remove("hidden"); }
function hideSection(el) { el.classList.add("hidden"); }

/** Show/clear messages */
function showError(msg) {
  uploadError.textContent = msg;
  showSection(uploadError);
}
function clearError() { hideSection(uploadError); uploadError.textContent = ""; }

function resetFileInput() { fileInput.value = ""; }

function resetFlowState() {
  hideSection(langSection);
  hideSection(translationSection);
  hideSection(downloadSection);
  hideSection(fileInfo);
  hideSection(packSummary);
  clearPackSummary();
  tbody.innerHTML = "";
  searchInput.value = "";
  progressLabel.textContent = "";
  textsBasePath = "texts/";
}

function clearPackSummary() {
  packMeta = null;
  packTitle.textContent = "";
  packDesc.textContent = "";
  setPackIcon("");
}

function isSafeDataImageUrl(url) {
  return typeof url === "string"
    && url.length <= MAX_ICON_DATA_URL_LENGTH
    && /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]*$/.test(url);
}

function setPackIcon(iconUrl) {
  const safeIconUrl = isSafeDataImageUrl(iconUrl) ? iconUrl : "";
  if (safeIconUrl) {
    const escapedUrl = safeIconUrl.replace(/["\\]/g, "");
    packIcon.style.setProperty("background-image", `url("${escapedUrl}")`);
    packIcon.textContent = "";
  } else {
    packIcon.style.setProperty("background-image", "");
    packIcon.textContent = "📦";
  }
}

function renderPackSummary(meta) {
  packMeta = meta;
  packTitle.textContent = meta.name;
  packDesc.textContent = meta.description;
  setPackIcon(meta.iconDataUrl);
  showSection(packSummary);
}

/**
 * Parse a Minecraft .lang file into a plain key→value object.
 * Lines starting with ## are comments and are skipped.
 * Inline tab-separated trailing comments (##) are stripped.
 */
function parseLangContent(text) {
  const entries = {};
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || line.startsWith("##")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.substring(0, eqIdx).trim();
    if (!key) continue;
    let value = line.substring(eqIdx + 1);
    // strip trailing ## comment (must be separated by a tab per MC spec)
    const commentIdx = value.indexOf("\t##");
    if (commentIdx !== -1) value = value.substring(0, commentIdx);
    entries[key] = value;
  }
  return entries;
}

/**
 * Serialize an entries object back to .lang file text.
 * Preserves insertion order (source key order).
 */
function serializeLangEntries(entries, langCode, packName) {
  const header = [
    `## ${packName || "Pack"} – ${langCode}`,
    `## Generated by MCBE.lang Translator (https://github.com/Minecraft-Julian/MCBE.lang)`,
    ``,
  ].join("\n");
  const body = Object.entries(entries)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  return header + body + "\n";
}

/**
 * Build a languages.json that merges existing codes with the new target.
 */
function buildLanguagesJson(existingCodes, targetCode) {
  const set = new Set(existingCodes);
  set.add(targetCode);
  return JSON.stringify(Array.from(set), null, 2) + "\n";
}

/**
 * Generate a minimal Minecraft Bedrock manifest.json for a resource pack.
 */
function buildManifest(packName) {
  return JSON.stringify(
    {
      format_version: 2,
      header: {
        name: packName || "Translation Pack",
        description: "Generated by MCBE.lang Translator",
        uuid: uuidv4(),
        version: [1, 0, 0],
        min_engine_version: [1, 16, 0],
      },
      modules: [
        {
          type: "resources",
          uuid: uuidv4(),
          version: [1, 0, 0],
        },
      ],
    },
    null,
    2
  ) + "\n";
}

function supportsDraftPersistence() {
  return typeof localStorage !== "undefined" && typeof indexedDB !== "undefined";
}

function hasOption(select, value) {
  return Array.from(select.options).some(option => option.value === value);
}

function sanitizeDraftEntries(entries) {
  const sanitized = {};
  if (!entries || typeof entries !== "object") return sanitized;
  for (const [key, value] of Object.entries(entries)) {
    if (typeof key !== "string" || typeof value !== "string" || !value.trim()) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

function getDraftState() {
  const currentTargetLangCode = targetLangSel.value !== "" ? targetLangSel.value : targetLangCode;
  return {
    uploadedFileName,
    sourceLangCode: sourceLangSel.value || "",
    targetLangCode: currentTargetLangCode || "",
    targetEntries: sanitizeDraftEntries(targetEntries),
    searchQuery: searchInput.value || "",
    tableVisible: !translationSection.classList.contains("hidden"),
    downloadVisible: !downloadSection.classList.contains("hidden"),
  };
}

function ensurePackFilename(name) {
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) return "restored-pack.mcpack";
  if (/\.(mcpack|mcaddon)$/i.test(trimmedName)) return trimmedName;
  return `${trimmedName}.mcpack`;
}

function openDraftDb() {
  return new Promise((resolve, reject) => {
    if (!supportsDraftPersistence()) {
      reject(new Error("Draft persistence is not supported in this browser."));
      return;
    }
    const request = indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        request.result.createObjectStore(DRAFT_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the draft database."));
  });
}

async function runDraftStore(mode, action) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE_NAME, mode);
    const store = tx.objectStore(DRAFT_STORE_NAME);
    let request;
    try {
      request = action(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    tx.oncomplete = () => {
      const result = request ? request.result : undefined;
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      const err = tx.error || (request && request.error) || new Error("Draft storage request failed.");
      db.close();
      reject(err);
    };
    tx.onabort = () => {
      const err = tx.error || (request && request.error) || new Error("Draft storage request was aborted.");
      db.close();
      reject(err);
    };
  });
}

async function saveDraftFile(file) {
  if (!supportsDraftPersistence()) return;
  await runDraftStore("readwrite", store => store.put(file, DRAFT_FILE_KEY));
}

async function loadDraftFile() {
  if (!supportsDraftPersistence()) return null;
  return runDraftStore("readonly", store => store.get(DRAFT_FILE_KEY));
}

async function clearDraftStorage() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(DRAFT_STATE_KEY);
  }
  if (!supportsDraftPersistence()) return;
  try {
    await runDraftStore("readwrite", store => store.delete(DRAFT_FILE_KEY));
  } catch {
    // ignore cleanup errors
  }
}

async function persistDraft({ file } = {}) {
  if (isRestoringDraft || !uploadedFileName || !supportsDraftPersistence()) return;
  try {
    if (file) {
      await saveDraftFile(file);
    }
    localStorage.setItem(DRAFT_STATE_KEY, JSON.stringify(getDraftState()));
  } catch {
    // ignore draft persistence errors
  }
}

function queueDraftPersist(options = {}) {
  if (options.file) {
    if (persistDraftTimer) {
      clearTimeout(persistDraftTimer);
      persistDraftTimer = null;
    }
    return persistDraft(options);
  }

  if (persistDraftTimer) clearTimeout(persistDraftTimer);
  persistDraftTimer = setTimeout(() => {
    persistDraftTimer = null;
    persistDraft();
  }, 250);
}

async function restoreDraft() {
  if (!supportsDraftPersistence()) return;

  const rawState = localStorage.getItem(DRAFT_STATE_KEY);
  if (!rawState) return;

  let savedState;
  try {
    savedState = JSON.parse(rawState);
  } catch {
    await clearDraftStorage();
    return;
  }

  const storedFile = await loadDraftFile();
  if (!storedFile) {
    await clearDraftStorage();
    return;
  }

  const restoredFile = storedFile instanceof File
    ? storedFile
    : new File([storedFile], ensurePackFilename(savedState.uploadedFileName || storedFile.name), {
        type: storedFile.type || "application/octet-stream",
        lastModified: Date.now(),
      });

  isRestoringDraft = true;
  try {
    await processFile(restoredFile);

    if (savedState.sourceLangCode && hasOption(sourceLangSel, savedState.sourceLangCode)) {
      sourceLangSel.value = savedState.sourceLangCode;
    }
    if (savedState.targetLangCode && hasOption(targetLangSel, savedState.targetLangCode)) {
      targetLangSel.value = savedState.targetLangCode;
    }

    if (savedState.tableVisible) {
      await buildTranslationTable();
      targetEntries = { ...targetEntries, ...sanitizeDraftEntries(savedState.targetEntries) };
      searchInput.value = typeof savedState.searchQuery === "string" ? savedState.searchQuery : "";
      applySearchFilter();
      if (savedState.downloadVisible) {
        buildDownloadPreview();
        showSection(downloadSection);
      }
    }
  } catch {
    await clearDraftStorage();
  } finally {
    isRestoringDraft = false;
  }
}

/* ── File upload handling ────────────────────────────────────────── */

// Only open the file dialog when clicking the drop zone background, not when
// clicking the browse button itself.
dropZone.addEventListener("click", e => {
  if (e.target.closest("button") || e.target === fileInput) return;
  fileInput.click();
});
dropZone.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") fileInput.click(); });
browseBtn.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", e => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) processFile(fileInput.files[0]);
});

async function processFile(file) {
  if (isProcessing) return;
  isProcessing = true;
  clearError();
  resetFlowState();

  const ext = file.name.split(".").pop().toLowerCase();
  if (!["mcpack", "mcaddon"].includes(ext)) {
    showError("Please upload a .mcpack or .mcaddon file.");
    resetFileInput();
    isProcessing = false;
    return;
  }

  // Show loading indicator while the ZIP is being parsed
  fileInfo.textContent = "⏳ Analyzing pack…";
  showSection(fileInfo);

  try {
    parsedZip = await JSZip.loadAsync(file);
  } catch {
    showError("Could not open the file. Make sure it is a valid .mcpack or .mcaddon.");
    resetFileInput();
    hideSection(fileInfo);
    isProcessing = false;
    return;
  }

  uploadedFileName = file.name;
  langFiles = {};
  parsedLangs = {};
  availableLangCodes = [];
  textsBasePath = "texts/";

  // Validate manifest.json to ensure it is a real Minecraft pack
  const fileNames = Object.keys(parsedZip.files);
  const manifestPath = fileNames.find(p => p.toLowerCase().endsWith("manifest.json"));
  if (!manifestPath) {
    showError("This file is missing a manifest.json and doesn't look like a Minecraft Bedrock pack.");
    resetFileInput();
    hideSection(fileInfo);
    isProcessing = false;
    return;
  }

  let manifest;
  try {
    const manifestRaw = await parsedZip.files[manifestPath].async("text");
    manifest = JSON.parse(manifestRaw);
  } catch {
    showError("manifest.json could not be read. Is this a valid Minecraft pack?");
    resetFileInput();
    hideSection(fileInfo);
    isProcessing = false;
    return;
  }

  const header = manifest?.header || {};
  const packName = typeof header.name === "string" ? header.name.trim() : ""; // trim rejects whitespace-only names
  if (!packName) {
    showError("The pack manifest is missing a name (header.name).");
    resetFileInput();
    hideSection(fileInfo);
    isProcessing = false;
    return;
  }

  const descriptionRaw = typeof header.description === "string" ? header.description.trim() : "";
  const packDescription = descriptionRaw || "No description provided.";

  const iconPath = fileNames.find(p => PACK_ICON_REGEX.test(p));
  let iconDataUrl = "";
  if (iconPath) {
    try {
      const base64Icon = await parsedZip.files[iconPath].async("base64");
      const extMatch = iconPath.match(PACK_ICON_REGEX);
      const extRaw = (extMatch && extMatch[1]) ? extMatch[1].toLowerCase() : "png";
      const ext = extRaw === "jpg" ? "jpeg" : extRaw;
      iconDataUrl = `data:image/${ext};base64,${base64Icon}`;
    } catch { /* ignore icon errors */ }
  }

  // Use the file list to locate .lang files inside a texts/ folder
  const langFileRegex = /(?:^|[\\/])texts[\\/]([a-zA-Z]{2}_[a-zA-Z]{2})\.lang$/i;

  for (const path of fileNames) {
    const m = path.match(langFileRegex);
    if (!m) continue;
    const code = m[1];
    // Capture the path prefix up to and including "texts/" from the first lang file found
    if (availableLangCodes.length === 0) {
      const textsMatch = path.match(/^(.*?texts[\\/])/i);
      textsBasePath = textsMatch ? textsMatch[1].replace(/\\/g, "/") : "texts/";
    }
    try {
      const content = await parsedZip.files[path].async("text");
      langFiles[path] = content;
      parsedLangs[code] = parseLangContent(content);
      if (!availableLangCodes.includes(code)) availableLangCodes.push(code);
    } catch {
      // skip unreadable entries
    }
  }

  if (availableLangCodes.length === 0) {
    showError("No .lang files found in this pack. Make sure it contains a texts/ folder with language files.");
    resetFileInput();
    hideSection(fileInfo);
    isProcessing = false;
    return;
  }

  // Show file info
  fileInfo.textContent = `✓ Loaded "${file.name}" — found language files: ${availableLangCodes.join(", ")}`;
  showSection(fileInfo);
  renderPackSummary({ name: packName, description: packDescription, iconDataUrl });

  populateLanguageDropdowns();
  showSection(langSection);
  resetFileInput();
  await queueDraftPersist({ file });
  isProcessing = false;
}

/* ── Language dropdown population ───────────────────────────────── */

function populateLanguageDropdowns() {
  const allCodes = MC_LANGUAGES.map(l => l.code);

  // Source: only languages that are actually in the pack
  sourceLangSel.innerHTML = "";
  const sortedAvail = [...availableLangCodes].sort();
  for (const code of sortedAvail) {
    const meta = MC_LANGUAGES.find(l => l.code === code);
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = meta ? `${meta.name} (${code})` : code;
    sourceLangSel.appendChild(opt);
  }
  // Prefer en_US as default source
  if (availableLangCodes.includes("en_US")) sourceLangSel.value = "en_US";

  // Target: all MC languages
  targetLangSel.innerHTML = "";
  for (const lang of MC_LANGUAGES) {
    const opt = document.createElement("option");
    opt.value = lang.code;
    opt.textContent = `${lang.name} (${lang.code})`;
    targetLangSel.appendChild(opt);
  }
  // Default target: first language not already in the pack, fallback de_DE
  const defaultTarget = MC_LANGUAGES.find(l => !availableLangCodes.includes(l.code));
  targetLangSel.value = defaultTarget ? defaultTarget.code : "de_DE";
}

sourceLangSel.addEventListener("change", () => { queueDraftPersist(); });
targetLangSel.addEventListener("change", () => { queueDraftPersist(); });

/* ── Load Translation Table ──────────────────────────────────────── */

loadBtn.addEventListener("click", () => {
  buildTranslationTable().catch(err => showError("Error loading translations: " + err.message));
});

async function buildTranslationTable() {
  const srcCode = sourceLangSel.value;
  targetLangCode = targetLangSel.value;

  sourceEntries = parsedLangs[srcCode] || {};

  // Try to load default pre-translations for the target language from the
  // default-langs/ folder.  The file is optional – if it is missing the
  // translator starts empty (or uses whatever is already in the pack).
  let defaults = {};
  try {
    const response = await fetch(`default-langs/${targetLangCode}.lang`);
    if (response.ok) {
      const text = await response.text();
      defaults = parseLangContent(text);
    }
  } catch { /* ignore – default translations are optional */ }

  // Pack-specific translations override the defaults
  const packLang = parsedLangs[targetLangCode] || {};
  targetEntries = { ...defaults, ...packLang };

  allKeys = Object.keys(sourceEntries);
  if (allKeys.length === 0) {
    showError("The selected source language file is empty.");
    return;
  }

  searchInput.value = "";
  renderTable(allKeys);
  updateProgress();
  showSection(translationSection);
  translationSection.scrollIntoView({ behavior: "smooth", block: "start" });

  // pre-fill download section each time table is (re)loaded
  hideSection(downloadSection);
  queueDraftPersist();
}

/* ── Table rendering ─────────────────────────────────────────────── */

function renderTable(keys) {
  visibleKeys = keys;
  tbody.innerHTML = "";

  for (const key of keys) {
    const srcText = sourceEntries[key] ?? "";
    const trnText = targetEntries[key] ?? "";

    const tr = document.createElement("tr");
    tr.dataset.key = key;

    const tdKey = document.createElement("td");
    tdKey.className = "key-cell";
    tdKey.textContent = key;

    const tdSrc = document.createElement("td");
    tdSrc.className = "src-cell";
    tdSrc.textContent = srcText;

    const tdTrn = document.createElement("td");
    const ta = document.createElement("textarea");
    ta.className = "trn-input" + (trnText ? " filled" : "");
    ta.rows = 1;
    ta.value = trnText;
    ta.placeholder = "Enter translation…";
    ta.dataset.key = key;
    ta.addEventListener("input", onTranslationInput);
    tdTrn.appendChild(ta);

    tr.appendChild(tdKey);
    tr.appendChild(tdSrc);
    tr.appendChild(tdTrn);
    tbody.appendChild(tr);
  }
}

function onTranslationInput(e) {
  const ta = e.target;
  const key = ta.dataset.key;
  const val = ta.value;
  if (val.trim()) {
    targetEntries[key] = val;
    ta.classList.add("filled");
  } else {
    delete targetEntries[key];
    ta.classList.remove("filled");
  }
  updateProgress();
  queueDraftPersist();
}

/* ── Search / filter ─────────────────────────────────────────────── */

function applySearchFilter() {
  const q = searchInput.value.toLowerCase().trim();
  if (!q) {
    renderTable(allKeys);
  } else {
    const filtered = allKeys.filter(k =>
      k.toLowerCase().includes(q) ||
      (sourceEntries[k] ?? "").toLowerCase().includes(q) ||
      (targetEntries[k] ?? "").toLowerCase().includes(q)
    );
    renderTable(filtered);
  }
  // restore textarea values from targetEntries after re-render
  for (const ta of tbody.querySelectorAll(".trn-input")) {
    const k = ta.dataset.key;
    ta.value = targetEntries[k] ?? "";
    ta.classList.toggle("filled", !!ta.value.trim());
  }
  updateProgress();
}

searchInput.addEventListener("input", () => {
  applySearchFilter();
  queueDraftPersist();
});

/* ── Progress display ────────────────────────────────────────────── */

function updateProgress() {
  const total      = allKeys.length;
  const translated = allKeys.filter(k => (targetEntries[k] ?? "").trim() !== "").length;
  progressLabel.textContent = `${translated} / ${total} translated`;
}

/* ── Clear button ────────────────────────────────────────────────── */

clearBtn.addEventListener("click", () => {
  if (!confirm("Clear all translations? This cannot be undone.")) return;
  targetEntries = {};
  for (const ta of tbody.querySelectorAll(".trn-input")) {
    ta.value = "";
    ta.classList.remove("filled");
  }
  updateProgress();
  queueDraftPersist();
});

/* ── Continue to Download ────────────────────────────────────────── */

toDownloadBtn.addEventListener("click", () => {
  buildDownloadPreview();
  showSection(downloadSection);
  downloadSection.scrollIntoView({ behavior: "smooth", block: "start" });
  queueDraftPersist();
});

/* ── Download preview ────────────────────────────────────────────── */

function buildDownloadPreview() {
  const total = allKeys.length;
  const translated = allKeys.filter(k => (targetEntries[k] ?? "").trim() !== "").length;
  const targetMeta = MC_LANGUAGES.find(l => l.code === targetLangCode);
  const targetDisplay = targetMeta ? `${targetMeta.name} (${targetLangCode})` : targetLangCode;
  const textsFolder = textsBasePath.replace(/\/$/, ""); // e.g. "texts" or "MyPack/texts"

  downloadPreview.innerHTML = `
    <h3>Files that will be generated</h3>
    <p style="color:var(--text-muted);font-size:.85rem;margin-top:0">All original pack files are preserved. Only the translation files listed below are added or updated.</p>
    <ul class="file-tree">
      <li><span class="item-icon" aria-hidden="true">📁</span>${textsFolder}/</li>
      <li style="padding-left:1.5rem"><span class="item-icon" aria-hidden="true">📄</span>${targetLangCode}.lang <em style="color:var(--text-muted);font-size:.78rem">(added / updated)</em></li>
      <li style="padding-left:1.5rem"><span class="item-icon" aria-hidden="true">📄</span>languages.json <em style="color:var(--text-muted);font-size:.78rem">(added / updated)</em></li>
    </ul>
    <p class="stat-line">
      Target language: <strong>${targetDisplay}</strong> &nbsp;|&nbsp;
      Translated: <strong>${translated}</strong> of <strong>${total}</strong> strings
    </p>
    <p class="stat-line">
      Download file: <strong>${uploadedFileName}</strong>
    </p>
  `;
}

/* ── Download helpers ────────────────────────────────────────────── */

function getCurrentTranslatedEntries() {
  // Collect current textarea values (handles unsaved changes)
  for (const ta of tbody.querySelectorAll(".trn-input")) {
    const k = ta.dataset.key;
    const v = ta.value;
    if (v.trim()) targetEntries[k] = v;
    else delete targetEntries[k];
  }
  return targetEntries;
}

function getExistingLangCodes() {
  // Try to read languages.json from the ZIP, fall back to availableLangCodes
  const langJsonPaths = Object.keys(parsedZip.files).filter(p =>
    /(?:^|[\\/])texts[\\/]languages\.json$/i.test(p)
  );
  if (langJsonPaths.length > 0) {
    try {
      // We already have the parsed zip; read synchronously isn't possible,
      // but we already have availableLangCodes which represents the same data.
    } catch { /* ignore */ }
  }
  return availableLangCodes;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ── Download: plain .lang file ──────────────────────────────────── */

downloadLangBtn.addEventListener("click", () => {
  const entries  = getCurrentTranslatedEntries();
  const packName = uploadedFileName.replace(/\.(mcpack|mcaddon)$/i, "");
  const content  = serializeLangEntries(entries, targetLangCode, packName);
  const blob     = new Blob([content], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `${targetLangCode}.lang`);
});

/* ── Download: full .mcpack ──────────────────────────────────────── */

downloadPackBtn.addEventListener("click", async () => {
  downloadPackBtn.disabled = true;
  downloadPackBtn.textContent = "⏳ Building…";

  try {
    const entries       = getCurrentTranslatedEntries();
    const packName      = uploadedFileName.replace(/\.(mcpack|mcaddon)$/i, "");
    const langContent   = serializeLangEntries(entries, targetLangCode, packName);
    const languagesJson = buildLanguagesJson(getExistingLangCodes(), targetLangCode);

    // Paths inside the ZIP that we will add/replace (normalised to forward slashes, lowercase)
    const safeBase          = textsBasePath.endsWith("/") ? textsBasePath : textsBasePath + "/";
    const targetLangPath    = (safeBase + targetLangCode + ".lang").toLowerCase();
    const langsJsonPath     = (safeBase + "languages.json").toLowerCase();

    // Build output ZIP starting from every file in the original pack,
    // skipping only the files we are about to add/replace.
    const outputZip = new JSZip();
    for (const [path, zipEntry] of Object.entries(parsedZip.files)) {
      if (zipEntry.dir) continue;
      const normPath = path.replace(/\\/g, "/").toLowerCase();
      if (normPath === targetLangPath || normPath === langsJsonPath) continue;
      outputZip.file(path, await zipEntry.async("uint8array"), { binary: true });
    }

    // Add the translated lang file and the updated languages.json
    const normalizedBasePath = safeBase.replace(/\/$/, "").replace(/^\/+/, "");
    const targetFolder = normalizedBasePath ? outputZip.folder(normalizedBasePath) : outputZip;
    targetFolder.file(`${targetLangCode}.lang`, langContent);
    targetFolder.file("languages.json", languagesJson);

    const blob = await outputZip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    triggerDownload(blob, uploadedFileName);
  } catch (err) {
    alert("Error generating pack: " + err.message);
  } finally {
    downloadPackBtn.disabled = false;
    downloadPackBtn.textContent = "⬇ Download as .mcpack";
  }
});

restoreDraft().catch(() => {
  clearDraftStorage().catch(() => {});
});
