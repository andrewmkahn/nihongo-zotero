/**
 * jaFields.ts — Read and write Japanese multilingual metadata from/to
 * Zotero's "Extra" field using a simple key: value line format.
 *
 * Supported fields:
 *   is-japanese        "true" when the source is in Japanese
 *   title-roman        Romanized title (Hepburn transliteration)
 *   title-en           English translation of the title
 *   author-roman         Author name(s) romanized (chapter author for bookSection)
 *   editor-roman         Editor name(s) romanized
 *   translator-roman     Translator name(s) romanized
 *   book-author-roman    Book author name(s) romanized (for bookSection "by X")
 *   container-roman      Journal/book title romanized
 *   series-roman         Series name romanized
 *   series-en            Series name in English
 *   seriesEditor-roman   Series editor name(s) romanized
 *   publisher-roman      Publisher name romanized
 *   place-roman          Publication place romanized
 *   edition-roman        Edition statement romanized (e.g. "Kaitei-ban")
 *   conferenceName-roman Conference/event name romanized
 *
 * Format (lines in Extra field):
 *   is-japanese: true
 *   title-roman: Nihongo no Taitoru
 *   author-roman: Tanaka Taro
 *
 * Non-plugin lines in Extra are preserved as-is.
 */

export const JA_FIELDS = [
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
  "conferenceName-roman",
] as const;

export type JaFieldKey = (typeof JA_FIELDS)[number];

/** All possible values; absent keys have undefined values */
export type JaFieldMap = Partial<Record<JaFieldKey, string>>;

// Matches lines like "title-roman: ..." — keys are lowercase letters and hyphens
const KEY_VALUE_RE = /^([a-z][a-z0-9-]*): (.*)$/;

/**
 * Parse the Extra field string into:
 *   - `jaFields`: map of our plugin's key→value pairs
 *   - `otherLines`: all other lines (preserved verbatim)
 */
export function parseExtra(extra: string): {
  jaFields: JaFieldMap;
  otherLines: string[];
} {
  const jaFields: JaFieldMap = {};
  const otherLines: string[] = [];
  const jaFieldSet = new Set<string>(JA_FIELDS);

  for (const rawLine of extra.split("\n")) {
    const line = rawLine.trimEnd(); // preserve leading indent if any
    const match = line.match(KEY_VALUE_RE);
    if (match && jaFieldSet.has(match[1])) {
      jaFields[match[1] as JaFieldKey] = match[2].trimStart();
    } else {
      otherLines.push(rawLine);
    }
  }

  return { jaFields, otherLines };
}

/**
 * Serialize jaFields back into an Extra field string,
 * preserving non-plugin lines.
 */
export function serializeExtra(
  jaFields: JaFieldMap,
  otherLines: string[]
): string {
  const pluginLines: string[] = [];

  for (const key of JA_FIELDS) {
    const value = jaFields[key];
    if (value !== undefined && value.trim() !== "") {
      pluginLines.push(`${key}: ${value}`);
    }
  }

  // Trim trailing empty lines from otherLines to keep Extra clean
  const trimmedOther = trimTrailingEmpty(otherLines);

  const allLines = [...trimmedOther, ...pluginLines];
  return allLines.join("\n").trim();
}

function trimTrailingEmpty(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") {
    end--;
  }
  return lines.slice(0, end);
}

// ---------------------------------------------------------------------------
// High-level helpers that operate directly on a Zotero item
// ---------------------------------------------------------------------------

/**
 * Get a single Japanese metadata field from an item.
 * Returns empty string if not set.
 */
export function getJaField(item: Zotero.Item, key: JaFieldKey): string {
  const extra = (item.getField("extra") as string) || "";
  const { jaFields } = parseExtra(extra);
  return jaFields[key] ?? "";
}

/**
 * Set a single Japanese metadata field on an item.
 * Pass an empty string or undefined to delete the field.
 * Does NOT save the item — call item.saveTx() after.
 */
export function setJaField(
  item: Zotero.Item,
  key: JaFieldKey,
  value: string
): void {
  const extra = (item.getField("extra") as string) || "";
  const { jaFields, otherLines } = parseExtra(extra);

  if (value.trim() === "") {
    delete jaFields[key];
  } else {
    jaFields[key] = value.trim();
  }

  item.setField("extra", serializeExtra(jaFields, otherLines));
}

/**
 * Get all Japanese metadata fields from an item as a map.
 */
export function getAllJaFields(item: Zotero.Item): JaFieldMap {
  const extra = (item.getField("extra") as string) || "";
  return parseExtra(extra).jaFields;
}

/**
 * Returns true when the item is marked as a Japanese-language source.
 * True if either the Extra field flag is set OR the Zotero Language field is "ja".
 */
export function isJapanese(item: Zotero.Item): boolean {
  if (getJaField(item, "is-japanese") === "true") return true;
  const lang = (item.getField("language") as string) || "";
  return lang.toLowerCase().startsWith("ja");
}

/**
 * Set or clear the "source is in Japanese" flag.
 * Also syncs the Zotero Language field: sets it to "ja" when enabling,
 * clears it when disabling (only if it was "ja").
 * Does NOT save the item — call item.saveTx() after.
 */
export function setIsJapanese(item: Zotero.Item, value: boolean): void {
  setJaField(item, "is-japanese", value ? "true" : "");
  if (value) {
    const current = (item.getField("language") as string) || "";
    if (!current) item.setField("language", "ja");
  } else {
    const current = (item.getField("language") as string) || "";
    if (current.toLowerCase().startsWith("ja")) item.setField("language", "");
  }
}
