"use strict";
var NihongoZotero = (() => {
  // src/modules/jaFields.ts
  var JA_FIELDS = [
    "is-japanese",
    "title-roman",
    "title-en",
    "author-roman",
    "editor-roman",
    "translator-roman",
    "book-author-roman",
    "container-roman",
    "series-roman",
    "series-en",
    "seriesEditor-roman",
    "publisher-roman",
    "place-roman",
    "edition-roman",
    "conferenceName-roman"
  ];
  var KEY_VALUE_RE = /^([a-z][a-z0-9-]*): (.*)$/;
  function parseExtra(extra) {
    const jaFields = {};
    const otherLines = [];
    const jaFieldSet = new Set(JA_FIELDS);
    for (const rawLine of extra.split("\n")) {
      const line = rawLine.trimEnd();
      const match = line.match(KEY_VALUE_RE);
      if (match && jaFieldSet.has(match[1])) {
        jaFields[match[1]] = match[2].trimStart();
      } else {
        otherLines.push(rawLine);
      }
    }
    return { jaFields, otherLines };
  }
  function serializeExtra(jaFields, otherLines) {
    const pluginLines = [];
    for (const key of JA_FIELDS) {
      const value = jaFields[key];
      if (value !== void 0 && value.trim() !== "") {
        pluginLines.push(`${key}: ${value}`);
      }
    }
    const trimmedOther = trimTrailingEmpty(otherLines);
    const allLines = [...trimmedOther, ...pluginLines];
    return allLines.join("\n").trim();
  }
  function trimTrailingEmpty(lines) {
    let end = lines.length;
    while (end > 0 && lines[end - 1].trim() === "") {
      end--;
    }
    return lines.slice(0, end);
  }
  function getJaField(item, key) {
    const extra = item.getField("extra") || "";
    const { jaFields } = parseExtra(extra);
    return jaFields[key] ?? "";
  }
  function setJaField(item, key, value) {
    const extra = item.getField("extra") || "";
    const { jaFields, otherLines } = parseExtra(extra);
    if (value.trim() === "") {
      delete jaFields[key];
    } else {
      jaFields[key] = value.trim();
    }
    item.setField("extra", serializeExtra(jaFields, otherLines));
  }
  function isJapanese(item) {
    if (getJaField(item, "is-japanese") === "true")
      return true;
    const lang = item.getField("language") || "";
    return lang.toLowerCase().startsWith("ja");
  }
  function setIsJapanese(item, value) {
    setJaField(item, "is-japanese", value ? "true" : "");
    if (value) {
      const current = item.getField("language") || "";
      if (!current)
        item.setField("language", "ja");
    } else {
      const current = item.getField("language") || "";
      if (current.toLowerCase().startsWith("ja"))
        item.setField("language", "");
    }
  }

  // src/modules/translate.ts
  var PREF_KEY = "extensions.nihongo-zotero.claude-api-key";
  var ALLOWED_KEYS = /* @__PURE__ */ new Set([
    "title-roman",
    "title-en",
    "author-roman",
    "editor-roman",
    "translator-roman",
    "book-author-roman",
    "container-roman",
    "series-roman",
    "series-en",
    "seriesEditor-roman",
    "publisher-roman",
    "place-roman",
    "edition-roman",
    "conferenceName-roman"
  ]);
  function getClaudeApiKey(win) {
    let key = Zotero.Prefs.get(PREF_KEY, true);
    if (!key?.trim()) {
      key = win?.prompt("Enter your Anthropic API key (sk-ant-...):") ?? null;
      if (!key?.trim())
        return null;
      Zotero.Prefs.set(PREF_KEY, key.trim(), true);
    }
    return key.trim();
  }
  function tryGetField(item, field) {
    try {
      return item.getField(field) || "";
    } catch {
      return "";
    }
  }
  function creatorNames(item, type) {
    return item.getCreators().filter((c) => Zotero.CreatorTypes.getName(c.creatorTypeID) === type).map((c) => {
      const split = `${c.lastName ?? ""}${c.firstName ? " " + c.firstName : ""}`.trim();
      return split || (c.name ?? "");
    }).filter(Boolean).join("; ");
  }
  async function generateRomanization(item, win) {
    const apiKey = getClaudeApiKey(win);
    if (!apiKey)
      return;
    const title = tryGetField(item, "title");
    const authors = creatorNames(item, "author");
    const editors = creatorNames(item, "editor");
    const translators = creatorNames(item, "translator");
    const seriesEditors = creatorNames(item, "seriesEditor");
    const bookAuthors = creatorNames(item, "bookAuthor");
    const container = tryGetField(item, "publicationTitle") || tryGetField(item, "bookTitle");
    const series = tryGetField(item, "series") || tryGetField(item, "seriesTitle");
    const publisher = tryGetField(item, "publisher");
    const place = tryGetField(item, "place");
    const edition = tryGetField(item, "edition");
    const conferenceName = tryGetField(item, "conferenceName");
    const fmt = (v) => v || "(none)";
    const lines = [
      `Title: ${fmt(title)}`
    ];
    if (authors)
      lines.push(`Authors: ${authors}`);
    if (editors)
      lines.push(`Editors: ${editors}`);
    if (translators)
      lines.push(`Translators: ${translators}`);
    if (seriesEditors)
      lines.push(`Series editors: ${seriesEditors}`);
    if (bookAuthors)
      lines.push(`Book authors (for bookSection "by X"): ${bookAuthors}`);
    lines.push(`Container (journal/book title): ${fmt(container)}`);
    if (series)
      lines.push(`Series: ${series}`);
    lines.push(`Publisher: ${fmt(publisher)}`);
    lines.push(`Place: ${fmt(place)}`);
    if (edition)
      lines.push(`Edition: ${edition}`);
    if (conferenceName)
      lines.push(`Conference name: ${conferenceName}`);
    const outputFields = [
      `  "title-roman": "accurate Hepburn romanization, sentence case"`,
      `  "title-en": "English translation of the title, sentence case"`
    ];
    if (authors)
      outputFields.push(`  "author-roman": "Family Given; Family2 Given2"`);
    if (editors)
      outputFields.push(`  "editor-roman": "Family Given; Family2 Given2"`);
    if (translators)
      outputFields.push(`  "translator-roman": "Family Given; Family2 Given2"`);
    if (seriesEditors)
      outputFields.push(`  "seriesEditor-roman": "Family Given; Family2 Given2"`);
    if (bookAuthors)
      outputFields.push(`  "book-author-roman": "Family Given; Family2 Given2"`);
    outputFields.push(`  "container-roman": "Hepburn romanization, sentence case"`);
    if (series) {
      outputFields.push(`  "series-roman": "Hepburn romanization of series name"`);
      outputFields.push(`  "series-en": "English translation of series name"`);
    }
    outputFields.push(`  "publisher-roman": "Hepburn romanization of publisher"`);
    outputFields.push(`  "place-roman": "Hepburn romanization of place (e.g. T\u014Dky\u014D)"`);
    if (edition)
      outputFields.push(`  "edition-roman": "Hepburn romanization or English equivalent of the edition statement"`);
    if (conferenceName)
      outputFields.push(`  "conferenceName-roman": "Hepburn romanization of the conference name"`);
    const userMessage = `Romanize and translate this Japanese bibliographic item.

${lines.join("\n")}

Rules:
- Use standard Hepburn romanization with macrons for long vowels (\u014D, \u016B, etc.). Be precise.
- All romanized text must be in sentence case (capitalize only the first word and proper nouns).
- English translations must be in sentence case.
- For names: write "Family Given" with no comma (e.g. "Hirata Atsutane; Tanaka Tar\u014D").
- Omit keys where the source field is "(none)" or absent.

Return only a JSON object with these fields:
{
${outputFields.join(",\n")}
}`;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: "You are a Japanese bibliographic metadata specialist. Return only valid JSON, no markdown, no explanation.",
        messages: [{ role: "user", content: userMessage }]
      })
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }
    const data = await response.json();
    const rawText = data.content[0]?.text ?? "";
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error(`Claude returned invalid JSON: ${rawText}`);
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (ALLOWED_KEYS.has(key) && typeof value === "string" && value.trim()) {
        setJaField(item, key, value.trim());
      }
    }
  }

  // src/modules/itemPane.ts
  var PLUGIN_ID = "nihongo-zotero@andrewkahn";
  var SECTION_PANE_ID = "nihongo-zotero-section";
  var REGISTERED_PANE_ID = PLUGIN_ID.replace("@", "-") + "-" + SECTION_PANE_ID;
  var ROMAN_FIELDS = [
    "title-roman",
    "title-en",
    "author-roman",
    "editor-roman",
    "translator-roman",
    "book-author-roman",
    "container-roman",
    "series-roman",
    "series-en",
    "seriesEditor-roman",
    "publisher-roman",
    "place-roman",
    "edition-roman",
    "conferenceName-roman"
  ];
  var FIELD_LABELS = {
    "title-roman": "Title (Romanized)",
    "title-en": "Title (English)",
    "author-roman": "Author (Romanized)",
    "editor-roman": "Editor (Romanized)",
    "translator-roman": "Translator (Romanized)",
    "book-author-roman": "Book Author (Romanized)",
    "container-roman": "Container (Romanized)",
    "series-roman": "Series (Romanized)",
    "series-en": "Series (English)",
    "seriesEditor-roman": "Series Editor (Romanized)",
    "publisher-roman": "Publisher (Romanized)",
    "place-roman": "Place (Romanized)",
    "edition-roman": "Edition (Romanized)",
    "conferenceName-roman": "Conference Name (Romanized)"
  };
  var sectionRegistered = false;
  function registerSection() {
    if (!Zotero.ItemPaneManager) {
      Zotero.debug(
        "[NihongoZotero] ItemPaneManager not available \u2014 skipping section registration"
      );
      return;
    }
    try {
      Zotero.ItemPaneManager.registerSection({
        paneID: SECTION_PANE_ID,
        pluginID: PLUGIN_ID,
        header: {
          l10nID: "ja-section-header",
          icon: "chrome://nihongo-zotero/content/icons/cite.svg"
        },
        sidenav: {
          l10nID: "ja-sidenav-label",
          icon: "chrome://nihongo-zotero/content/icons/cite.svg"
        },
        onInit({ body }) {
          const section = body.closest("collapsible-section");
          if (section)
            section.label = "NihongoZotero";
        },
        onRender({ body, item, editable }) {
          renderSection(body, item, editable);
        },
        onItemChange({ body, item, editable }) {
          renderSection(body, item, editable);
        }
      });
      sectionRegistered = true;
      Zotero.debug("[NihongoZotero] Registered NihongoZotero section");
    } catch (e) {
      Zotero.debug(`[NihongoZotero] Failed to register section: ${e}`);
    }
  }
  function renderSection(body, item, editable) {
    while (body.firstChild) {
      body.removeChild(body.firstChild);
    }
    const doc = body.ownerDocument;
    const japanese = isJapanese(item);
    const wrapper = doc.createElement("div");
    wrapper.style.cssText = "display: flex; flex-direction: column; gap: 6px; padding: 4px 0;";
    const checkboxRow = doc.createElement("div");
    checkboxRow.style.cssText = "display: flex; align-items: center; gap: 8px;";
    const checkboxLabel = doc.createElement("label");
    checkboxLabel.style.cssText = "font-size: 0.85em; color: var(--fill-secondary, #666); user-select: none;";
    checkboxLabel.textContent = "Source is in Japanese";
    if (editable) {
      const checkbox = doc.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "ja-is-japanese-checkbox";
      checkbox.checked = japanese;
      checkbox.style.cssText = "margin: 0;";
      checkboxLabel.setAttribute("for", "ja-is-japanese-checkbox");
      checkbox.addEventListener("change", () => {
        setIsJapanese(item, checkbox.checked);
        item.saveTx().then(() => {
          renderSection(body, item, editable);
        }).catch((err) => {
          Zotero.debug(`[NihongoZotero] Failed to save item: ${err}`);
        });
      });
      checkboxRow.appendChild(checkbox);
      checkboxRow.appendChild(checkboxLabel);
    } else {
      checkboxLabel.textContent = "Source is in Japanese";
      const valueSpan = doc.createElement("span");
      valueSpan.textContent = japanese ? "Yes" : "No";
      valueSpan.style.cssText = "font-size: 0.95em;";
      checkboxRow.appendChild(checkboxLabel);
      checkboxRow.appendChild(valueSpan);
    }
    wrapper.appendChild(checkboxRow);
    if (japanese) {
      if (editable) {
        const btn = doc.createElement("button");
        btn.textContent = "Generate Romanization";
        btn.style.cssText = "margin-top: 2px; font-size: 0.85em;";
        btn.addEventListener("click", () => {
          btn.disabled = true;
          btn.textContent = "Generating\u2026";
          const win = body.ownerDocument.defaultView;
          generateRomanization(item, win).then(() => item.saveTx()).then(() => renderSection(body, item, editable)).catch((err) => {
            Zotero.debug(`[NihongoZotero] Generation failed: ${err}`);
            win?.alert?.(`Romanization failed:
${err}`);
            btn.disabled = false;
            btn.textContent = "Generate Romanization";
          });
        });
        wrapper.appendChild(btn);
      }
      for (const key of ROMAN_FIELDS) {
        const value = getJaField(item, key);
        if (!editable && !value)
          continue;
        const row = doc.createElement("div");
        row.style.cssText = "display: grid; grid-template-columns: 150px 1fr; gap: 6px; align-items: start;";
        const label = doc.createElement("label");
        label.textContent = FIELD_LABELS[key];
        label.setAttribute("for", `ja-input-${key}`);
        label.style.cssText = "font-size: 0.85em; color: var(--fill-secondary, #666); padding-top: 2px; user-select: none;";
        let inputEl;
        if (editable) {
          const inp = doc.createElement("input");
          inp.id = `ja-input-${key}`;
          inp.type = "text";
          inp.value = value;
          inp.style.cssText = "width: 100%; box-sizing: border-box; font-family: inherit; font-size: inherit;";
          attachChangeHandler(inp, item, key);
          inputEl = inp;
        } else {
          const span = doc.createElement("span");
          span.id = `ja-input-${key}`;
          span.textContent = value || "\u2014";
          span.style.cssText = "font-size: 0.95em; word-break: break-word;";
          inputEl = span;
        }
        row.appendChild(label);
        row.appendChild(inputEl);
        wrapper.appendChild(row);
      }
    }
    body.appendChild(wrapper);
  }
  function attachChangeHandler(el, item, key) {
    el.addEventListener("change", () => {
      setJaField(item, key, el.value);
      item.saveTx().catch((err) => {
        Zotero.debug(`[NihongoZotero] Failed to save item: ${err}`);
      });
    });
  }
  function unregisterSection() {
    if (!Zotero.ItemPaneManager || !sectionRegistered)
      return;
    try {
      Zotero.ItemPaneManager.unregisterSection(REGISTERED_PANE_ID);
      sectionRegistered = false;
      Zotero.debug("[NihongoZotero] Unregistered Japanese Metadata section");
    } catch (e) {
      Zotero.debug(`[NihongoZotero] Failed to unregister section: ${e}`);
    }
  }

  // src/modules/migration.ts
  var MLZSYNC_RE = /^mlzsync1:([0-9]{4})([\s\S]*)/;
  var FIELD_MAP = [
    ["title", "ja-alalc97", "title-roman"],
    ["title", "en", "title-en"],
    ["publisher", "ja-alalc97", "publisher-roman"],
    ["place", "ja-alalc97", "place-roman"],
    ["publicationTitle", "ja-alalc97", "container-roman"],
    ["bookTitle", "ja-alalc97", "container-roman"]
  ];
  function parseMlzExtra(extra) {
    const m = extra.match(MLZSYNC_RE);
    if (!m)
      return null;
    const offset = parseInt(m[1], 10);
    try {
      return JSON.parse(m[2].slice(0, offset));
    } catch {
      return null;
    }
  }
  async function migrateFromJurism() {
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const Services = globalThis.Services;
    const win = Zotero.getMainWindow?.() ?? Services?.wm?.getMostRecentWindow("navigator:browser");
    const showAlert = (msg) => {
      if (win)
        win.alert(msg);
      Zotero.debug(`[ja-metadata] ${msg}`);
    };
    try {
      const libraryID = Zotero.Libraries?.userLibraryID ?? 1;
      const allIDs = await Zotero.Items.getAll(libraryID, false, false, true) ?? [];
      Zotero.debug(`[ja-metadata] Migration: scanning ${allIDs.length} items for mlzsync1 data`);
      for (const itemID of allIDs) {
        try {
          const item = await Zotero.Items.getAsync(itemID);
          if (!item || item.isAttachment() || item.isNote() || item.deleted) {
            skipped++;
            continue;
          }
          const extra = item.getField("extra") || "";
          const data = parseMlzExtra(extra);
          if (!data) {
            skipped++;
            continue;
          }
          const altKeys = data.multifields?._keys ?? {};
          const multicreators = data.multicreators ?? {};
          const hasJaAlt = Object.values(altKeys).some((langs) => "ja-alalc97" in langs) || Object.values(multicreators).some((c) => c._key && "ja-alalc97" in c._key);
          if (!hasJaAlt) {
            skipped++;
            continue;
          }
          setIsJapanese(item, true);
          for (const [field, lang, pluginKey] of FIELD_MAP) {
            const val = altKeys[field]?.[lang];
            if (val)
              setJaField(item, pluginKey, val);
          }
          const positions = Object.keys(multicreators).map(Number).sort((a, b) => a - b);
          const romanNames = [];
          for (const pos of positions) {
            const altName = multicreators[pos]._key?.["ja-alalc97"];
            if (!altName)
              continue;
            const last = (altName.lastName ?? altName.name ?? "").trim();
            const first = (altName.firstName ?? "").trim();
            if (last && first)
              romanNames.push(`${last}, ${first}`);
            else if (last || first)
              romanNames.push(last || first);
          }
          if (romanNames.length > 0) {
            setJaField(item, "author-roman", romanNames.join("; "));
          }
          await item.saveTx();
          updated++;
        } catch (err) {
          Zotero.debug(`[ja-metadata] Migration error for itemID ${itemID}: ${err}`);
          errors++;
        }
      }
    } catch (err) {
      showAlert(`Migration failed with unexpected error:
${err}`);
      return;
    }
    showAlert(
      `Migration complete.

${updated} updated, ${skipped} skipped (no ja-alalc97 data), ${errors} errors.`
    );
  }

  // src/modules/cslPatch.ts
  var originalItemToCSLJSON = null;
  var CITY_MAP = {
    "T\u014Dky\u014D": "Tokyo",
    "\u014Csaka": "Osaka",
    "Ky\u014Dto": "Kyoto",
    "K\u014Dbe": "Kobe",
    "\u014Cita": "Oita",
    "K\u014Dchi": "Kochi"
  };
  function normalizeCity(s) {
    for (const [k, v] of Object.entries(CITY_MAP)) {
      if (s.startsWith(k))
        return v + s.slice(k.length);
    }
    return s;
  }
  function capFirst(s) {
    if (!s)
      return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function toSentenceCase(s) {
    if (!s)
      return s;
    const parts = s.split(/(:\s+|\s+·\s+)/);
    return parts.map((part, i) => i % 2 === 1 ? part : capFirst(part.toLowerCase())).join("");
  }
  var TITLE_CASE_MINOR_WORDS = /* @__PURE__ */ new Set([
    "a",
    "an",
    "the",
    "and",
    "but",
    "or",
    "nor",
    "for",
    "so",
    "yet",
    "at",
    "by",
    "in",
    "of",
    "on",
    "to",
    "up",
    "as",
    "is",
    "it",
    "via",
    "per",
    "with",
    "into",
    "from",
    "over",
    "than",
    "that",
    "upon",
    "onto"
  ]);
  function toTitleCase(s) {
    if (!s)
      return s;
    const parts = s.split(/(:\s+|\s+·\s+)/);
    return parts.map((part, i) => {
      if (i % 2 === 1)
        return part;
      const words = part.split(" ");
      return words.map((word, wi) => {
        const lower = word.toLowerCase();
        if (wi === 0 || wi === words.length - 1)
          return capFirst(lower);
        return TITLE_CASE_MINOR_WORDS.has(lower) ? lower : capFirst(lower);
      }).join(" ");
    }).join("");
  }
  function hasJapaneseChars(s) {
    return /[\u3040-\u30FF\u3400-\u9FFF\uF900-\uFAFF]/.test(s);
  }
  function parseNames(romanStr) {
    return romanStr.split("; ").map((name) => ({
      family: name.replace(", ", " ").trim(),
      given: ""
    }));
  }
  function toJaLiterals(cslNames) {
    if (!Array.isArray(cslNames) || cslNames.length === 0)
      return null;
    const lits = cslNames.map((n) => ({
      literal: n.literal ?? [n.family, n.given].filter(Boolean).join("")
    }));
    return lits.some((l) => hasJapaneseChars(l.literal)) ? lits : null;
  }
  function applyRomanNames(cslNames, romanStr) {
    if (!romanStr || !Array.isArray(cslNames) || cslNames.length === 0) {
      return cslNames;
    }
    const parsed = parseNames(romanStr);
    if (parsed.length !== cslNames.length)
      return cslNames;
    return cslNames.map((orig, i) => {
      const { literal, ...rest } = orig;
      return { ...rest, family: parsed[i].family, given: parsed[i].given };
    });
  }
  function applyCSLPatch() {
    if (originalItemToCSLJSON)
      return;
    originalItemToCSLJSON = Zotero.Utilities.Item.itemToCSLJSON;
    Zotero.Utilities.Item.itemToCSLJSON = function(item) {
      const cslItem = originalItemToCSLJSON.call(this, item);
      if (typeof item?.getField !== "function")
        return cslItem;
      const rawTitle = item.getField("title") || "";
      const jaFlag = isJapanese(item);
      const rawTitleHasJa = hasJapaneseChars(rawTitle);
      Zotero.debug(
        `[ja-metadata] BEFORE | isJapanese=${jaFlag} | title="${rawTitle.slice(0, 80)}" | csl.title="${cslItem.title ?? "(none)"}" | csl.title-short="${cslItem["title-short"] ?? "(none)"}" | csl.language="${cslItem.language ?? "(none)"}" | csl.note="${cslItem["note"] ?? "(none)"}" | csl.original-title="${cslItem["original-title"] ?? "(none)"}" | csl.container-title="${cslItem["container-title"] ?? "(none)"}" | csl.container-title-short="${cslItem["container-title-short"] ?? "(none)"}" | csl.original-author=${JSON.stringify(cslItem["original-author"] ?? null)}`
      );
      if (!jaFlag) {
        delete cslItem["language"];
        Zotero.debug(`[ja-metadata] non-Japanese \u2192 cleared language, returning early`);
        return cslItem;
      }
      try {
        cslItem.language = "ja";
        delete cslItem["note"];
        delete cslItem["container-title-short"];
        delete cslItem["keyword"];
        Zotero.debug(`[ja-metadata] origContainer="${(cslItem["container-title"] || "").toString().slice(0, 80)}" hasJa=${hasJapaneseChars((cslItem["container-title"] || "").toString())}`);
        if (rawTitle && rawTitleHasJa) {
          cslItem["original-title"] = rawTitle;
          Zotero.debug(`[ja-metadata] SET original-title = rawTitle (has Japanese chars)`);
        } else {
          delete cslItem["original-title"];
          Zotero.debug(
            `[ja-metadata] DELETED original-title: rawTitle has no Japanese chars (rawTitle is likely already romanized)`
          );
        }
        const extra = item.getField("extra") || "";
        Zotero.debug(`[ja-metadata] extra="${extra.replace(/\n/g, "\\n").slice(0, 200)}"`);
        Zotero.debug(
          `[ja-metadata] rawTitle hasJapaneseChars=${rawTitleHasJa} | rawTitle="${rawTitle.slice(0, 80)}"`
        );
        const origTitle = rawTitle;
        const origContainer = cslItem["container-title"] || "";
        const titleRoman = getJaField(item, "title-roman");
        const titleEn = getJaField(item, "title-en");
        const journalRoman = getJaField(item, "container-roman");
        const publisherRoman = getJaField(item, "publisher-roman");
        const placeRoman = getJaField(item, "place-roman");
        const authorRoman = getJaField(item, "author-roman");
        const editorRoman = getJaField(item, "editor-roman");
        const translatorRoman = getJaField(item, "translator-roman");
        const bookAuthorRoman = getJaField(item, "book-author-roman");
        const seriesRoman = getJaField(item, "series-roman");
        const seriesEn = getJaField(item, "series-en");
        const seriesEditorRoman = getJaField(item, "seriesEditor-roman");
        const editionRoman = getJaField(item, "edition-roman");
        const conferenceNameRoman = getJaField(item, "conferenceName-roman");
        Zotero.debug(
          `[ja-metadata] fields | title-roman="${titleRoman}" | title-en="${titleEn}" | author-roman="${authorRoman}"`
        );
        Zotero.debug(
          `[ja-metadata] cslItem.title BEFORE="${cslItem.title}" | cslItem.author BEFORE=${JSON.stringify(cslItem.author)}`
        );
        if (titleRoman)
          cslItem.title = toSentenceCase(titleRoman);
        const enDiffers = titleEn && titleEn.toLowerCase().trim() !== titleRoman.toLowerCase().trim();
        if (enDiffers && rawTitleHasJa) {
          cslItem["title-short"] = toTitleCase(titleEn);
          Zotero.debug(`[ja-metadata] SET title-short="${cslItem["title-short"]}"`);
        } else {
          delete cslItem["title-short"];
          Zotero.debug(
            `[ja-metadata] DELETED title-short | enDiffers=${!!enDiffers} rawTitleHasJa=${rawTitleHasJa} | titleEn="${titleEn}" titleRoman="${titleRoman}"`
          );
        }
        if (journalRoman) {
          cslItem["container-title"] = journalRoman;
          if (hasJapaneseChars(origContainer)) {
            cslItem["keyword"] = origContainer;
          }
        }
        if (publisherRoman)
          cslItem.publisher = publisherRoman;
        if (placeRoman)
          cslItem["publisher-place"] = normalizeCity(placeRoman);
        if (seriesRoman) {
          const enPart = seriesEn && seriesEn.toLowerCase().trim() !== seriesRoman.toLowerCase().trim() ? ` [${seriesEn}]` : "";
          cslItem["collection-title"] = `${seriesRoman}${enPart}`;
        }
        if (authorRoman) {
          const origAuthors = cslItem.author || [];
          const jaLiterals = toJaLiterals(origAuthors);
          cslItem.author = applyRomanNames(origAuthors, authorRoman);
          if (jaLiterals) {
            cslItem["original-author"] = jaLiterals;
            const parsed = parseNames(authorRoman);
            if (parsed.length === origAuthors.length) {
              cslItem.narrator = origAuthors.map((orig, i) => {
                const jaName = orig.literal ? orig.literal : [orig.family, orig.given].filter(Boolean).join("");
                const jaStr = hasJapaneseChars(jaName) ? ` ${jaName}` : "";
                return { family: parsed[i].family + jaStr, given: "" };
              });
            }
          }
        }
        if (editorRoman) {
          cslItem.editor = applyRomanNames(cslItem.editor, editorRoman);
        }
        if (translatorRoman) {
          cslItem.translator = applyRomanNames(cslItem.translator, translatorRoman);
        }
        if (bookAuthorRoman) {
          cslItem["container-author"] = applyRomanNames(
            cslItem["container-author"],
            bookAuthorRoman
          );
        }
        if (seriesEditorRoman) {
          cslItem["collection-editor"] = applyRomanNames(
            cslItem["collection-editor"],
            seriesEditorRoman
          );
        }
        if (editionRoman)
          cslItem.edition = editionRoman;
        if (conferenceNameRoman)
          cslItem.event = conferenceNameRoman;
        Zotero.debug(
          `[ja-metadata] FINAL | title="${cslItem.title}" | original-title="${cslItem["original-title"]}" | title-short="${cslItem["title-short"]}" | container-title="${cslItem["container-title"]}" | container-title-short="${cslItem["container-title-short"] ?? "(none)"}" | author=${JSON.stringify(cslItem.author)}`
        );
      } catch (e) {
        Zotero.debug(`[ja-metadata] CRASH in Japanese processing: ${e?.message ?? e}
${e?.stack ?? ""}`);
      }
      return cslItem;
    };
    Zotero.debug("[ja-metadata] itemToCSLJSON patched");
  }
  function removeCSLPatch() {
    if (!originalItemToCSLJSON)
      return;
    Zotero.Utilities.Item.itemToCSLJSON = originalItemToCSLJSON;
    originalItemToCSLJSON = null;
    Zotero.debug("[ja-metadata] itemToCSLJSON patch removed");
  }

  // src/modules/styles.ts
  async function installStyles() {
    const styleBase = "chrome://nihongo-zotero/content/styles/";
    const files = ["chicago-ja-roman.csl", "chicago-ja-roman-no-trans.csl", "chicago-ja-full.csl"];
    for (const file of files) {
      const url = styleBase + file;
      try {
        const content = await Zotero.File.getContentsFromURLAsync(url);
        await Zotero.Styles.install(content, url, true);
        Zotero.debug(`[NihongoZotero] Installed style: ${file}`);
      } catch (e) {
        Zotero.debug(`[NihongoZotero] Style install skipped (${file}): ${e}`);
      }
    }
  }

  // src/index.ts
  var NihongoZoteroPlugin = class {
    constructor() {
      this.started = false;
      this.migrateMenuItem = null;
      this.apiKeyMenuItem = null;
    }
    async startup(data) {
      Zotero.debug(`[NihongoZotero] Starting up v${data.version}`);
      {
        const gAny = globalThis;
        const Services2 = gAny.Services;
        const win2 = Zotero.getMainWindow?.() ?? Services2?.wm?.getMostRecentWindow("navigator:browser");
        Zotero.logError(new Error(
          `[NihongoZotero] L10n diag: win=${!!win2} | win.L10nRegistry=${!!win2?.L10nRegistry} | global.L10nRegistry=${!!gAny.L10nRegistry} | Zotero.l10n=${!!Zotero.l10n} | Zotero.l10n.addResourceIds=${typeof Zotero.l10n?.addResourceIds} | win.document.l10n=${!!win2?.document?.l10n}`
        ));
        const L10nRegistry = win2?.L10nRegistry ?? gAny.L10nRegistry;
        const FileSource = win2?.L10nFileSource ?? win2?.FileSource ?? gAny.L10nFileSource ?? gAny.FileSource;
        if (L10nRegistry && FileSource) {
          Zotero.logError(new Error(`[NihongoZotero] FileSource.length=${FileSource.length}`));
          try {
            const prePath = "chrome://nihongo-zotero/content/locale/{locale}/";
            Zotero.logError(new Error(`[NihongoZotero] prePath=${prePath}`));
            const source = new FileSource(
              "nihongo-zotero",
              "app",
              ["en-US"],
              prePath
            );
            const reg = L10nRegistry.getInstance?.() ?? L10nRegistry;
            if (typeof reg.registerSources === "function")
              reg.registerSources([source]);
            else
              reg.registerSource(source);
            win2?.document?.l10n?.addResourceIds(["addon.ftl"]);
            Zotero.logError(new Error("[NihongoZotero] L10n: Strategy 1 (global registry) OK"));
          } catch (e) {
            Zotero.logError(new Error(`[NihongoZotero] L10n: Strategy 1 FAILED: ${e?.message || String(e)}`));
          }
        } else {
          const zl10n = Zotero.l10n;
          if (typeof zl10n?.addResourceIds === "function") {
            try {
              zl10n.addResourceIds(["nihongo-zotero/addon.ftl"]);
              Zotero.logError(new Error("[NihongoZotero] L10n: Strategy 2 (Zotero.l10n) OK"));
            } catch (e) {
              Zotero.logError(new Error(`[NihongoZotero] L10n: Strategy 2 FAILED: ${e?.message || String(e)}`));
            }
          } else {
            Zotero.logError(new Error(
              `[NihongoZotero] L10n: all strategies exhausted. L10nRegistry=${!!L10nRegistry} FileSource=${!!FileSource} Zotero.l10n keys=${Object.keys(Zotero.l10n ?? {}).join(",")}`
            ));
          }
        }
      }
      registerSection();
      await Zotero.uiReadyPromise;
      {
        const gAny2 = globalThis;
        const win2 = Zotero.getMainWindow?.() ?? gAny2.Services?.wm?.getMostRecentWindow("navigator:browser");
        const l10n = win2?.document?.l10n;
        l10n?.formatMessages?.([{ id: "ja-section-header" }])?.then?.((msgs) => {
          Zotero.logError(new Error(
            `[NihongoZotero] formatMessages("ja-section-header")=${JSON.stringify(msgs)}`
          ));
        });
        setTimeout(() => {
          const el = win2?.document?.querySelector("collapsible-section[data-pane]");
          if (el) {
            Zotero.logError(new Error(
              `[NihongoZotero] section el: data-l10n-id=${el.dataset?.l10nId} | label attr=${el.getAttribute("label")} | textContent="${el._title?.textContent}"`
            ));
          } else {
            Zotero.logError(new Error("[NihongoZotero] no collapsible-section found (no item selected?)"));
          }
        }, 2e3);
      }
      applyCSLPatch();
      await installStyles();
      const Services = globalThis.Services;
      const win = Zotero.getMainWindow?.() ?? Services?.wm?.getMostRecentWindow("navigator:browser");
      const toolsPopup = win?.document?.getElementById("menu_ToolsPopup");
      Zotero.debug(
        `[NihongoZotero] menu_ToolsPopup lookup: win=${!!win} popup=${!!toolsPopup}`
      );
      if (toolsPopup) {
        const doc = win.document;
        const menuItem = typeof doc.createXULElement === "function" ? doc.createXULElement("menuitem") : doc.createElementNS(
          "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
          "menuitem"
        );
        menuItem.setAttribute("label", "NihongoZotero: Migrate from Jurism\u2026");
        menuItem.setAttribute("id", "ja-metadata-migrate-menuitem");
        menuItem.addEventListener("command", () => {
          migrateFromJurism().catch((err) => {
            Zotero.debug(`[NihongoZotero] Migration failed: ${err}`);
          });
        });
        toolsPopup.appendChild(menuItem);
        this.migrateMenuItem = menuItem;
        const apiKeyItem = typeof doc.createXULElement === "function" ? doc.createXULElement("menuitem") : doc.createElementNS(
          "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
          "menuitem"
        );
        apiKeyItem.setAttribute("label", "NihongoZotero: Set Anthropic API key\u2026");
        apiKeyItem.setAttribute("id", "ja-metadata-apikey-menuitem");
        apiKeyItem.addEventListener("command", () => {
          const key = win.prompt("Enter your Anthropic API key (sk-ant-...):");
          if (key?.trim()) {
            Zotero.Prefs.set(
              "extensions.nihongo-zotero.claude-api-key",
              key.trim(),
              true
            );
          }
        });
        toolsPopup.appendChild(apiKeyItem);
        this.apiKeyMenuItem = apiKeyItem;
      }
      this.started = true;
      Zotero.debug("[NihongoZotero] Startup complete");
    }
    shutdown(_data) {
      if (!this.started)
        return;
      Zotero.debug("[NihongoZotero] Shutting down");
      removeCSLPatch();
      unregisterSection();
      if (this.migrateMenuItem) {
        this.migrateMenuItem.remove();
        this.migrateMenuItem = null;
      }
      if (this.apiKeyMenuItem) {
        this.apiKeyMenuItem.remove();
        this.apiKeyMenuItem = null;
      }
      this.started = false;
    }
  };
  Zotero.__nihongoZotero = { plugin: new NihongoZoteroPlugin() };
})();
