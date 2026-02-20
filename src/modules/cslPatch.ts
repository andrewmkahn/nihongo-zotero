import { getJaField, isJapanese } from "./jaFields";

let originalItemToCSLJSON: ((item: Zotero.Item) => any) | null = null;

// ---------------------------------------------------------------------------
// City normalization
// ---------------------------------------------------------------------------

const CITY_MAP: Record<string, string> = {
  "Tōkyō": "Tokyo", "Ōsaka": "Osaka", "Kyōto": "Kyoto",
  "Kōbe": "Kobe", "Ōita": "Oita", "Kōchi": "Kochi",
};

function normalizeCity(s: string): string {
  for (const [k, v] of Object.entries(CITY_MAP)) {
    if (s.startsWith(k)) return v + s.slice(k.length);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Case helpers (fix #3)
// ---------------------------------------------------------------------------

function capFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Sentence case: capitalize only the first word and words after ": " / " · " */
function toSentenceCase(s: string): string {
  if (!s) return s;
  const parts = s.split(/(:\s+|\s+·\s+)/);
  return parts
    .map((part, i) => (i % 2 === 1 ? part : capFirst(part.toLowerCase())))
    .join("");
}

const TITLE_CASE_MINOR_WORDS = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor", "for", "so", "yet",
  "at", "by", "in", "of", "on", "to", "up",
  "as", "is", "it", "via", "per",
  "with", "into", "from", "over", "than", "that", "upon", "onto",
]);

/** English title case: minor words lowercased except at segment start/end */
function toTitleCase(s: string): string {
  if (!s) return s;
  const parts = s.split(/(:\s+|\s+·\s+)/);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      const words = part.split(" ");
      return words
        .map((word, wi) => {
          const lower = word.toLowerCase();
          if (wi === 0 || wi === words.length - 1) return capFirst(lower);
          return TITLE_CASE_MINOR_WORDS.has(lower) ? lower : capFirst(lower);
        })
        .join(" ");
    })
    .join("");
}

/** True if the string contains any CJK / kana characters */
function hasJapaneseChars(s: string): boolean {
  return /[\u3040-\u30FF\u3400-\u9FFF\uF900-\uFAFF]/.test(s);
}

// ---------------------------------------------------------------------------
// Name helpers (fix #2 + #5)
// ---------------------------------------------------------------------------

/**
 * Parse "Family Given; Family2 Given2" (or legacy "Family, Given") into CSL
 * name objects with only `family` set and `given` left empty, so that the
 * CSL processor renders "Family Given" without an inverting comma.
 */
function parseNames(romanStr: string): { family: string; given: string }[] {
  return romanStr.split("; ").map((name) => ({
    family: name.replace(", ", " ").trim(),
    given: "",
  }));
}

/** Extract Japanese literal name objects from an original CSL name array.
 *  Returns [{literal: "荒俣宏"}, ...] when at least one name has Japanese chars, else null.
 *  Used to populate `original-author` for the full CSL style's footnote display. */
function toJaLiterals(cslNames: any[]): { literal: string }[] | null {
  if (!Array.isArray(cslNames) || cslNames.length === 0) return null;
  const lits = cslNames.map((n: any) => ({
    literal: n.literal ?? [n.family, n.given].filter(Boolean).join(""),
  }));
  return lits.some((l) => hasJapaneseChars(l.literal)) ? lits : null;
}

function applyRomanNames(cslNames: any[], romanStr: string): any[] {
  if (!romanStr || !Array.isArray(cslNames) || cslNames.length === 0) {
    return cslNames;
  }
  const parsed = parseNames(romanStr);
  if (parsed.length !== cslNames.length) return cslNames; // count mismatch — leave untouched
  return cslNames.map((orig, i) => {
    // Drop `literal` so citeproc-js uses family/given instead of the Japanese literal form.
    const { literal, ...rest } = orig as any;
    return { ...rest, family: parsed[i].family, given: parsed[i].given };
  });
}

// ---------------------------------------------------------------------------
// Patch
// ---------------------------------------------------------------------------

export function applyCSLPatch(): void {
  if (originalItemToCSLJSON) return; // already patched
  originalItemToCSLJSON = Zotero.Utilities.Item.itemToCSLJSON;

  (Zotero.Utilities.Item as any).itemToCSLJSON = function (item: Zotero.Item) {
    const cslItem = originalItemToCSLJSON!.call(this, item);

    if (typeof (item as any)?.getField !== "function") return cslItem;

    const rawTitle = ((item as any).getField("title") || "") as string;
    const jaFlag = isJapanese(item);
    // Compute once here so it's available throughout (used for annote, title-short).
    const rawTitleHasJa = hasJapaneseChars(rawTitle);

    // ── Diagnostic: dump cslItem state BEFORE our modifications ──────────────
    Zotero.debug(
      `[ja-metadata] BEFORE | isJapanese=${jaFlag} | title="${rawTitle.slice(0, 80)}"` +
      ` | csl.title="${cslItem.title ?? "(none)"}"` +
      ` | csl.title-short="${cslItem["title-short"] ?? "(none)"}"` +
      ` | csl.language="${cslItem.language ?? "(none)"}"` +
      ` | csl.note="${cslItem["note"] ?? "(none)"}"` +
      ` | csl.original-title="${cslItem["original-title"] ?? "(none)"}"` +
      ` | csl.container-title="${cslItem["container-title"] ?? "(none)"}"` +
      ` | csl.container-title-short="${cslItem["container-title-short"] ?? "(none)"}"` +
      ` | csl.original-author=${JSON.stringify(cslItem["original-author"] ?? null)}`
    );

    if (!jaFlag) {
      // Clear language so Zotero items with a Language field set don't
      // accidentally trigger the <if variable="language"> gate in the CSL.
      delete cslItem["language"];
      Zotero.debug(`[ja-metadata] non-Japanese → cleared language, returning early`);
      return cslItem;
    }

    try {

    // Tell citeproc-js this is a Japanese-language item so it does not apply
    // English text-case="title" rules after we return our sentence-case title.
    cslItem.language = "ja";

    // Clear note immediately: Zotero populates it from the Extra field for some items
    // (e.g. mlzsync data). We only want note to contain the Japanese original title,
    // gated by language="ja" in the full CSL. Without clearing first, items with
    // romanized Zotero titles (rawTitleHasJa=false) would leak Extra field junk.
    delete cslItem["note"];
    // container-title-short is overwritten by citeproc-js's automatic journal abbreviation
    // engine (active when inserting via Word) regardless of what we set. We cannot use it.
    // Use `keyword` instead — a standard CSL 1.0 variable the abbreviation engine never
    // touches and the Chicago style never renders for chapters/articles.
    delete cslItem["container-title-short"];
    delete cslItem["keyword"];
    Zotero.debug(`[ja-metadata] origContainer="${(cslItem["container-title"] || "").toString().slice(0, 80)}" hasJa=${hasJapaneseChars((cslItem["container-title"] || "").toString())}`);

    // Store the Japanese title in original-title (rendered by full CSL in both footnote and
    // bibliography contexts). Using original-title rather than note because citeproc-js
    // suppresses the `note` item-data variable in citation/footnote rendering.
    // Only set when the Zotero title itself contains Japanese characters; for items whose
    // Zotero title is already romanized, delete original-title so it doesn't show spuriously.
    if (rawTitle && rawTitleHasJa) {
      cslItem["original-title"] = rawTitle;
      Zotero.debug(`[ja-metadata] SET original-title = rawTitle (has Japanese chars)`);
    } else {
      delete cslItem["original-title"];
      Zotero.debug(
        `[ja-metadata] DELETED original-title: rawTitle has no Japanese chars` +
        ` (rawTitle is likely already romanized)`
      );
    }

    const extra = ((item as any).getField("extra") || "") as string;
    Zotero.debug(`[ja-metadata] extra="${extra.replace(/\n/g, "\\n").slice(0, 200)}"`);

    // ── Diagnostic: confirm rawTitleHasJa ────────────────────────────────────
    Zotero.debug(
      `[ja-metadata] rawTitle hasJapaneseChars=${rawTitleHasJa}` +
      ` | rawTitle="${rawTitle.slice(0, 80)}"`
    );

    const origTitle = rawTitle;
    const origContainer = (cslItem["container-title"] || "") as string;

    const titleRoman         = getJaField(item, "title-roman");
    const titleEn            = getJaField(item, "title-en");
    const journalRoman       = getJaField(item, "container-roman");
    const publisherRoman     = getJaField(item, "publisher-roman");
    const placeRoman         = getJaField(item, "place-roman");
    const authorRoman        = getJaField(item, "author-roman");
    const editorRoman        = getJaField(item, "editor-roman");
    const translatorRoman    = getJaField(item, "translator-roman");
    const bookAuthorRoman    = getJaField(item, "book-author-roman");
    const seriesRoman        = getJaField(item, "series-roman");
    const seriesEn           = getJaField(item, "series-en");
    const seriesEditorRoman  = getJaField(item, "seriesEditor-roman");
    const editionRoman       = getJaField(item, "edition-roman");
    const conferenceNameRoman = getJaField(item, "conferenceName-roman");

    Zotero.debug(
      `[ja-metadata] fields | title-roman="${titleRoman}" | title-en="${titleEn}" | author-roman="${authorRoman}"`
    );
    Zotero.debug(
      `[ja-metadata] cslItem.title BEFORE="${cslItem.title}" | cslItem.author BEFORE=${JSON.stringify(cslItem.author)}`
    );

    // Title: sentence case
    if (titleRoman) cslItem.title = toSentenceCase(titleRoman);

    // Translation bracket: only when title is actually Japanese and translation differs.
    // NOTE: enDiffers checks titleEn vs titleRoman; the hasJapaneseChars guard ensures
    // we only show [translation] for items whose Zotero title contains Japanese.
    const enDiffers =
      titleEn &&
      titleEn.toLowerCase().trim() !== titleRoman.toLowerCase().trim();
    if (enDiffers && rawTitleHasJa) {
      cslItem["title-short"] = toTitleCase(titleEn);
      Zotero.debug(`[ja-metadata] SET title-short="${cslItem["title-short"]}"`);
    } else {
      delete cslItem["title-short"];
      Zotero.debug(
        `[ja-metadata] DELETED title-short | enDiffers=${!!enDiffers}` +
        ` rawTitleHasJa=${rawTitleHasJa} | titleEn="${titleEn}" titleRoman="${titleRoman}"`
      );
    }

    if (journalRoman) {
      cslItem["container-title"] = journalRoman;
      if (hasJapaneseChars(origContainer)) {
        cslItem["keyword"] = origContainer; // Japanese container title; rendered non-italic by CSL
      }
    }
    if (publisherRoman) cslItem.publisher = publisherRoman;
    if (placeRoman)     cslItem["publisher-place"] = normalizeCity(placeRoman);

    // Series
    if (seriesRoman) {
      const enPart =
        seriesEn &&
        seriesEn.toLowerCase().trim() !== seriesRoman.toLowerCase().trim()
          ? ` [${seriesEn}]`
          : "";
      cslItem["collection-title"] = `${seriesRoman}${enPart}`;
    }

    // Names — romanize author; also set original-author (Japanese literals for full CSL
    // footnotes) and narrator (romanized+Japanese combined, used as the primary bibliography
    // names variable in the full CSL so subsequent-author-substitute / em-dash replaces
    // the combined form cleanly).
    if (authorRoman) {
      const origAuthors = (cslItem.author || []) as any[];
      const jaLiterals = toJaLiterals(origAuthors);
      cslItem.author = applyRomanNames(origAuthors, authorRoman);
      if (jaLiterals) {
        cslItem["original-author"] = jaLiterals;
        const parsed = parseNames(authorRoman);
        if (parsed.length === origAuthors.length) {
          cslItem.narrator = origAuthors.map((orig: any, i: number) => {
            const jaName = orig.literal
              ? orig.literal
              : [orig.family, orig.given].filter(Boolean).join("");
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
    if (editionRoman)        cslItem.edition = editionRoman;
    if (conferenceNameRoman) cslItem.event   = conferenceNameRoman;

    Zotero.debug(
      `[ja-metadata] FINAL | title="${cslItem.title}" | original-title="${cslItem["original-title"]}"` +
      ` | title-short="${cslItem["title-short"]}"` +
      ` | container-title="${cslItem["container-title"]}"` +
      ` | container-title-short="${cslItem["container-title-short"] ?? "(none)"}"` +
      ` | author=${JSON.stringify(cslItem.author)}`
    );

    } catch (e: any) {
      Zotero.debug(`[ja-metadata] CRASH in Japanese processing: ${e?.message ?? e}\n${e?.stack ?? ""}`);
    }

    return cslItem;
  };

  Zotero.debug("[ja-metadata] itemToCSLJSON patched");
}

export function removeCSLPatch(): void {
  if (!originalItemToCSLJSON) return;
  (Zotero.Utilities.Item as any).itemToCSLJSON = originalItemToCSLJSON;
  originalItemToCSLJSON = null;
  Zotero.debug("[ja-metadata] itemToCSLJSON patch removed");
}
