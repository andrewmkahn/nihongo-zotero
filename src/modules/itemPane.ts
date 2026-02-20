/**
 * itemPane.ts — Register a "Japanese Metadata" section in Zotero 7's item pane.
 *
 * Uses Zotero.ItemPaneManager.registerSection() — the official plugin API.
 * All fields render inside a single collapsible section.
 */

import {
  getJaField,
  setJaField,
  isJapanese,
  setIsJapanese,
  JaFieldKey,
} from "./jaFields";
import { generateRomanization } from "./translate";

const PLUGIN_ID = "nihongo-zotero@andrewkahn";
const SECTION_PANE_ID = "nihongo-zotero-section";
// Zotero prefixes paneID with pluginID (replacing "@" with "-") when storing
// internally, so unregisterSection must use this full prefixed ID.
const REGISTERED_PANE_ID = PLUGIN_ID.replace("@", "-") + "-" + SECTION_PANE_ID;

/** The romanization fields shown when the source is Japanese */
const ROMAN_FIELDS: Exclude<JaFieldKey, "is-japanese">[] = [
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
  "conferenceName-roman",
];

/** Human-readable labels for each roman field (fallback if Fluent not loaded) */
const FIELD_LABELS: Record<(typeof ROMAN_FIELDS)[number], string> = {
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
  "conferenceName-roman": "Conference Name (Romanized)",
};

let sectionRegistered = false;

// ---------------------------------------------------------------------------
// Section registration
// ---------------------------------------------------------------------------

/**
 * Register the "Japanese Metadata" collapsible section.
 * Call once during plugin startup.
 */
export function registerSection(): void {
  if (!Zotero.ItemPaneManager) {
    Zotero.debug(
      "[NihongoZotero] ItemPaneManager not available — skipping section registration"
    );
    return;
  }

  try {
    Zotero.ItemPaneManager.registerSection({
      paneID: SECTION_PANE_ID,
      pluginID: PLUGIN_ID,
      header: {
        l10nID: "ja-section-header",
        icon: "chrome://nihongo-zotero/content/icons/cite.svg",
      },
      sidenav: {
        l10nID: "ja-sidenav-label",
        icon: "chrome://nihongo-zotero/content/icons/cite.svg",
      },
      onInit({ body }) {
        // DOMLocalization can't load our FTL via chrome:// fetch in this context,
        // so we set the section label directly. DOMLocalization leaves the
        // attribute unchanged when it can't resolve the l10nID, so this persists.
        const section = body.closest("collapsible-section");
        if (section) (section as any).label = "NihongoZotero";
      },
      onRender({ body, item, editable }) {
        renderSection(body, item, editable);
      },
      onItemChange({ body, item, editable }) {
        renderSection(body, item, editable);
      },
    });

    sectionRegistered = true;
    Zotero.debug("[NihongoZotero] Registered NihongoZotero section");
  } catch (e) {
    Zotero.debug(`[NihongoZotero] Failed to register section: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Section rendering
// ---------------------------------------------------------------------------

/**
 * Render (or re-render) the section body.
 *
 * Always shows a "Source is in Japanese" checkbox (or Yes/No in read-only).
 * When checked, shows five romanization/translation input fields below it.
 */
function renderSection(
  body: HTMLDivElement,
  item: Zotero.Item,
  editable: boolean
): void {
  // Clear previous content
  while (body.firstChild) {
    body.removeChild(body.firstChild);
  }

  const doc = body.ownerDocument;
  const japanese = isJapanese(item);

  const wrapper = doc.createElement("div");
  wrapper.style.cssText =
    "display: flex; flex-direction: column; gap: 6px; padding: 4px 0;";

  // ── Checkbox row ──────────────────────────────────────────────────────────
  const checkboxRow = doc.createElement("div");
  checkboxRow.style.cssText =
    "display: flex; align-items: center; gap: 8px;";

  const checkboxLabel = doc.createElement("label");
  checkboxLabel.style.cssText =
    "font-size: 0.85em; color: var(--fill-secondary, #666); user-select: none;";
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
      item
        .saveTx()
        .then(() => {
          renderSection(body, item, editable);
        })
        .catch((err: unknown) => {
          Zotero.debug(`[NihongoZotero] Failed to save item: ${err}`);
        });
    });

    checkboxRow.appendChild(checkbox);
    checkboxRow.appendChild(checkboxLabel);
  } else {
    // Read-only: show plain text
    checkboxLabel.textContent = "Source is in Japanese";
    const valueSpan = doc.createElement("span");
    valueSpan.textContent = japanese ? "Yes" : "No";
    valueSpan.style.cssText = "font-size: 0.95em;";
    checkboxRow.appendChild(checkboxLabel);
    checkboxRow.appendChild(valueSpan);
  }

  wrapper.appendChild(checkboxRow);

  // ── Roman fields (only when Japanese is checked) ──────────────────────────
  if (japanese) {
    if (editable) {
      const btn = doc.createElement("button");
      btn.textContent = "Generate Romanization";
      btn.style.cssText = "margin-top: 2px; font-size: 0.85em;";
      btn.addEventListener("click", () => {
        btn.disabled = true;
        btn.textContent = "Generating\u2026";
        const win = (body.ownerDocument.defaultView as any);
        generateRomanization(item, win)
          .then(() => item.saveTx())
          .then(() => renderSection(body, item, editable))
          .catch((err: unknown) => {
            Zotero.debug(`[NihongoZotero] Generation failed: ${err}`);
            win?.alert?.(`Romanization failed:\n${err}`);
            btn.disabled = false;
            btn.textContent = "Generate Romanization";
          });
      });
      wrapper.appendChild(btn);
    }

    for (const key of ROMAN_FIELDS) {
      const value = getJaField(item, key as JaFieldKey);

      // In read-only mode, skip empty fields
      if (!editable && !value) continue;

      const row = doc.createElement("div");
      row.style.cssText =
        "display: grid; grid-template-columns: 150px 1fr; gap: 6px; align-items: start;";

      const label = doc.createElement("label");
      label.textContent = FIELD_LABELS[key];
      label.setAttribute("for", `ja-input-${key}`);
      label.style.cssText =
        "font-size: 0.85em; color: var(--fill-secondary, #666); padding-top: 2px; user-select: none;";

      let inputEl: HTMLInputElement | HTMLSpanElement;

      if (editable) {
        const inp = doc.createElement("input");
        inp.id = `ja-input-${key}`;
        inp.type = "text";
        inp.value = value;
        inp.style.cssText =
          "width: 100%; box-sizing: border-box; font-family: inherit; font-size: inherit;";
        attachChangeHandler(inp, item, key as JaFieldKey);
        inputEl = inp;
      } else {
        const span = doc.createElement("span");
        span.id = `ja-input-${key}`;
        span.textContent = value || "—";
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

function attachChangeHandler(
  el: HTMLInputElement,
  item: Zotero.Item,
  key: JaFieldKey
): void {
  el.addEventListener("change", () => {
    setJaField(item, key, el.value);
    item.saveTx().catch((err: unknown) => {
      Zotero.debug(`[NihongoZotero] Failed to save item: ${err}`);
    });
  });
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Unregister the section.
 * Call during plugin shutdown.
 */
export function unregisterSection(): void {
  if (!Zotero.ItemPaneManager || !sectionRegistered) return;

  try {
    Zotero.ItemPaneManager.unregisterSection(REGISTERED_PANE_ID);
    sectionRegistered = false;
    Zotero.debug("[NihongoZotero] Unregistered Japanese Metadata section");
  } catch (e) {
    Zotero.debug(`[NihongoZotero] Failed to unregister section: ${e}`);
  }
}
