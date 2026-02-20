/**
 * citation.ts — Prepare Japanese items for citation by overwriting Zotero
 * native fields with romanized (or composite romanized+Japanese) values.
 *
 * Two modes:
 *   prepareForCitationRoman() — overwrites fields with romanized text only
 *   prepareForCitationFull()  — overwrites with "Roman [English] (Japanese)" composites
 */

import { getJaField, isJapanese } from "./jaFields";

// ---------------------------------------------------------------------------
// City normalization
// ---------------------------------------------------------------------------

const CITY_MAP: Record<string, string> = {
  "Tōkyō": "Tokyo",
  "Osaka": "Osaka",
  "Ōsaka": "Osaka",
  "Kyōto": "Kyoto",
  "Kōbe": "Kobe",
  "Ōita": "Oita",
  "Kōchi": "Kochi",
  "Naha": "Naha",
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

/**
 * Convert to sentence case: capitalize only the first word and the first word
 * after subtitle delimiters (": " and " · ").
 */
function toSentenceCase(s: string): string {
  if (!s) return s;
  // Split on ": " or " · " to get subtitle segments
  const parts = s.split(/(:\s+|\s+·\s+)/);
  return parts
    .map((part, i) => {
      // Odd indices are the delimiter strings — pass through unchanged
      if (i % 2 === 1) return part;
      return capFirst(part.toLowerCase());
    })
    .join("");
}

const TITLE_CASE_MINOR_WORDS = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor", "for", "so", "yet",
  "at", "by", "in", "of", "on", "to", "up",
  "as", "is", "it", "via", "per",
  "with", "into", "from", "over", "than", "that", "upon", "onto",
]);

/**
 * Convert to English title case. Minor words are lowercased except at the
 * start/end of a segment. Respects subtitle delimiters (": " and " · ").
 */
function toTitleCase(s: string): string {
  if (!s) return s;
  const parts = s.split(/(:\s+|\s+·\s+)/);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // delimiter
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

// ---------------------------------------------------------------------------
// Name parsing (fix #2)
// ---------------------------------------------------------------------------

/**
 * Parse "Family Given; Family2 Given2" into [{lastName}, …].
 *
 * The full name goes into lastName with firstName left empty, so Zotero
 * renders "Family Given" without an inverting comma.
 * Handles legacy "Family, Given" entries by replacing the first comma+space.
 */
function parseAuthorRoman(authorRoman: string): Array<{ lastName: string }> {
  return authorRoman.split("; ").map((name) => ({
    lastName: name.replace(", ", " ").trim(),
  }));
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function getWindow(): Window | null {
  const Services = (globalThis as any).Services;
  return (
    (Zotero as any).getMainWindow?.() ??
    Services?.wm?.getMostRecentWindow("navigator:browser") ??
    null
  );
}

function showAlert(msg: string): void {
  const win = getWindow();
  if (win) (win as any).alert(msg);
  Zotero.debug(`[ja-metadata] ${msg}`);
}

async function getAllJapaneseItems(): Promise<Zotero.Item[]> {
  const libraryID = (Zotero as any).Libraries?.userLibraryID ?? 1;
  const allIDs: number[] =
    (await Zotero.Items.getAll(libraryID, false, false, true)) ?? [];

  const result: Zotero.Item[] = [];
  for (const id of allIDs) {
    const item = await Zotero.Items.getAsync(id as unknown as number);
    if (!item || item.isAttachment() || item.isNote() || item.deleted) continue;
    if (!isJapanese(item)) continue;
    result.push(item);
  }
  return result;
}

function tryGetField(item: Zotero.Item, field: string): string {
  try {
    return (item.getField(field as any) as string) || "";
  } catch {
    return "";
  }
}

function trySetField(item: Zotero.Item, field: string, value: string): void {
  try {
    item.setField(field as any, value);
  } catch {
    // field not applicable for this item type
  }
}

// ---------------------------------------------------------------------------
// Creator update helpers (fix #5)
// ---------------------------------------------------------------------------

type CreatorEntry = ReturnType<Zotero.Item["getCreators"]>[number];

/**
 * Update a subset of creators (filtered by creatorType) using a roman-name string.
 * Returns a new copy of the creators array with the updates applied.
 *
 * In Roman mode: sets lastName = full roman name, firstName = "".
 * In Full mode:  sets lastName = "Roman (Japanese)", firstName = "".
 */
function applyRomanToCreators(
  allCreators: CreatorEntry[],
  creatorType: string,
  romanStr: string,
  mode: "roman" | "full"
): CreatorEntry[] {
  if (!romanStr) return allCreators;

  const parsed = parseAuthorRoman(romanStr);
  const indices = allCreators
    .map((c, i) => i)
    .filter((i) => allCreators[i].creatorType === creatorType);

  if (parsed.length !== indices.length) {
    // Count mismatch — leave this creator type untouched
    return allCreators;
  }

  const updated = [...allCreators];
  indices.forEach((origIdx, i) => {
    const c = allCreators[origIdx];
    let newLastName: string;
    if (mode === "roman") {
      newLastName = parsed[i].lastName;
    } else {
      // Combine original Japanese last + first for the parenthetical
      const jaName = [c.lastName, c.firstName].filter(Boolean).join("");
      newLastName = jaName
        ? `${parsed[i].lastName} (${jaName})`
        : parsed[i].lastName;
    }
    updated[origIdx] = { ...c, lastName: newLastName, firstName: "" };
  });

  return updated;
}

// ---------------------------------------------------------------------------
// prepareForCitationRoman
// ---------------------------------------------------------------------------

/**
 * Overwrite Zotero native fields with romanized values for all Japanese items.
 */
export async function prepareForCitationRoman(): Promise<void> {
  let updated = 0;
  let errors = 0;

  try {
    const items = await getAllJapaneseItems();

    for (const item of items) {
      try {
        const titleRoman = getJaField(item, "title-roman");
        const titleEn = getJaField(item, "title-en");
        const journalRoman = getJaField(item, "container-roman");
        const publisherRoman = getJaField(item, "publisher-roman");
        const placeRoman = getJaField(item, "place-roman");
        const authorRoman = getJaField(item, "author-roman");
        const editorRoman = getJaField(item, "editor-roman");
        const bookAuthorRoman = getJaField(item, "book-author-roman");
        const seriesRoman = getJaField(item, "series-roman");

        // Title: romanized in sentence case; shortTitle = English translation
        if (titleRoman) item.setField("title", toSentenceCase(titleRoman));
        item.setField("shortTitle", titleEn ? toTitleCase(titleEn) : "");

        if (journalRoman) trySetField(item, "publicationTitle", journalRoman);
        if (publisherRoman) trySetField(item, "publisher", publisherRoman);
        if (placeRoman) trySetField(item, "place", normalizeCity(placeRoman));

        // Series
        if (seriesRoman) {
          trySetField(item, "series", seriesRoman);
          trySetField(item, "seriesTitle", seriesRoman);
        }

        // Creators
        let creators = item.getCreators();
        creators = applyRomanToCreators(creators, "author", authorRoman, "roman");
        creators = applyRomanToCreators(creators, "editor", editorRoman, "roman");
        creators = applyRomanToCreators(creators, "bookAuthor", bookAuthorRoman, "roman");
        item.setCreators(creators);

        await item.saveTx();
        updated++;
      } catch (err) {
        Zotero.debug(`[ja-metadata] prepareForCitationRoman error: ${err}`);
        errors++;
      }
    }
  } catch (err) {
    showAlert(`Prepare for Citation (Roman) failed:\n${err}`);
    return;
  }

  showAlert(
    `Prepare for Citation (Romanized) complete.\n\n` +
      `${updated} updated, ${errors} errors.`
  );
}

// ---------------------------------------------------------------------------
// prepareForCitationFull
// ---------------------------------------------------------------------------

/**
 * Overwrite Zotero native fields with composite "Romanized [English] (Japanese)" values.
 */
export async function prepareForCitationFull(): Promise<void> {
  let updated = 0;
  let errors = 0;

  try {
    const items = await getAllJapaneseItems();

    for (const item of items) {
      try {
        // Read original Japanese values BEFORE modifying
        const origTitle = tryGetField(item, "title");
        const origJournal = tryGetField(item, "publicationTitle");
        const origPublisher = tryGetField(item, "publisher");
        const origPlace = tryGetField(item, "place");
        const origSeries =
          tryGetField(item, "series") || tryGetField(item, "seriesTitle");

        const titleRoman = getJaField(item, "title-roman");
        const titleEn = getJaField(item, "title-en");
        const journalRoman = getJaField(item, "container-roman");
        const publisherRoman = getJaField(item, "publisher-roman");
        const placeRoman = getJaField(item, "place-roman");
        const authorRoman = getJaField(item, "author-roman");
        const editorRoman = getJaField(item, "editor-roman");
        const bookAuthorRoman = getJaField(item, "book-author-roman");
        const seriesRoman = getJaField(item, "series-roman");
        const seriesEn = getJaField(item, "series-en");

        // Title: "Sentence-case roman [Title Case English] (Japanese)"
        // Fix #1: only add [English] bracket when it differs from the roman text
        // Fix #3: sentence case for roman, title case for English translation
        if (titleRoman) {
          const romanPart = toSentenceCase(titleRoman);
          const enDiffers =
            titleEn &&
            titleEn.toLowerCase().trim() !== titleRoman.toLowerCase().trim();
          const enPart = enDiffers ? ` [${toTitleCase(titleEn)}]` : "";
          const jaPart = origTitle ? ` (${origTitle})` : "";
          item.setField("title", `${romanPart}${enPart}${jaPart}`);
        }
        // shortTitle cleared — everything is in title
        item.setField("shortTitle", "");

        if (journalRoman) {
          try {
            const jaPart = origJournal ? ` (${origJournal})` : "";
            item.setField("publicationTitle", `${journalRoman}${jaPart}`);
          } catch {
            // not applicable
          }
        }

        if (publisherRoman) {
          try {
            const jaPart = origPublisher ? ` (${origPublisher})` : "";
            item.setField("publisher", `${publisherRoman}${jaPart}`);
          } catch {
            // not applicable
          }
        }

        if (placeRoman) {
          try {
            const jaPart = origPlace ? ` (${origPlace})` : "";
            item.setField(
              "place",
              `${normalizeCity(placeRoman)}${jaPart}`
            );
          } catch {
            // not applicable
          }
        }

        // Series (fix #4)
        if (seriesRoman) {
          const enDiffers =
            seriesEn &&
            seriesEn.toLowerCase().trim() !== seriesRoman.toLowerCase().trim();
          const enPart = enDiffers ? ` [${seriesEn}]` : "";
          const jaPart = origSeries ? ` (${origSeries})` : "";
          const seriesValue = `${seriesRoman}${enPart}${jaPart}`;
          trySetField(item, "series", seriesValue);
          trySetField(item, "seriesTitle", seriesValue);
        }

        // Creators: handle each type separately (fix #5)
        // Fix #2: parseAuthorRoman puts full name in lastName, no comma
        let creators = item.getCreators();
        creators = applyRomanToCreators(creators, "author", authorRoman, "full");
        creators = applyRomanToCreators(creators, "editor", editorRoman, "full");
        creators = applyRomanToCreators(creators, "bookAuthor", bookAuthorRoman, "full");
        item.setCreators(creators);

        await item.saveTx();
        updated++;
      } catch (err) {
        Zotero.debug(`[ja-metadata] prepareForCitationFull error: ${err}`);
        errors++;
      }
    }
  } catch (err) {
    showAlert(`Prepare for Citation (Full) failed:\n${err}`);
    return;
  }

  showAlert(
    `Prepare for Citation (Romanized + Japanese) complete.\n\n` +
      `${updated} updated, ${errors} errors.`
  );
}
