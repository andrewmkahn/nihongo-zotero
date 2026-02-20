/**
 * migration.ts — Migrate Japanese multilingual metadata from Jurism's
 * sync-encoded Extra field into this plugin's Extra-field format.
 *
 * When Jurism syncs items to Zotero it prepends a JSON blob to the Extra field:
 *
 *   mlzsync1:NNNN{...json...}rest of extra
 *
 * where NNNN is the 4-digit length of the JSON blob.  The JSON contains:
 *   multifields._keys.<fieldName>.<langTag>  — alt text for title/publisher/place/…
 *   multicreators.<pos>._key.<langTag>       — alt creator names
 *
 * We iterate over every Zotero item whose Extra field starts with that prefix,
 * extract ja-alalc97 / en data, and write it in our plugin's format.
 */

import { setIsJapanese, setJaField } from "./jaFields";
import type { JaFieldKey } from "./jaFields";

// Matches the Jurism sync prefix: mlzsync1:NNNN<rest>
const MLZSYNC_RE = /^mlzsync1:([0-9]{4})([\s\S]*)/;

// Field names in the Jurism JSON → our plugin field keys
const FIELD_MAP: Array<[string, string, JaFieldKey]> = [
  ["title",            "ja-alalc97", "title-roman"],
  ["title",            "en",         "title-en"],
  ["publisher",        "ja-alalc97", "publisher-roman"],
  ["place",            "ja-alalc97", "place-roman"],
  ["publicationTitle", "ja-alalc97", "container-roman"],
  ["bookTitle",        "ja-alalc97", "container-roman"],
];

interface MlzExtraData {
  multifields?: {
    main: Record<string, string>;
    _keys: Record<string, Record<string, string>>;
  };
  multicreators?: Record<string, {
    main?: string;
    _key?: Record<string, { lastName?: string; firstName?: string; name?: string }>;
  }>;
}

/**
 * Parse the mlzsync JSON blob from an Extra field string.
 * Returns null if the field doesn't contain Jurism sync data.
 */
function parseMlzExtra(extra: string): MlzExtraData | null {
  const m = extra.match(MLZSYNC_RE);
  if (!m) return null;
  const offset = parseInt(m[1], 10);
  try {
    return JSON.parse(m[2].slice(0, offset)) as MlzExtraData;
  } catch {
    return null;
  }
}

/**
 * Iterate over all Zotero items that have Jurism sync data in their Extra
 * field, extract ja-alalc97 / en variants, and write them using our plugin's
 * Extra-field format (is-japanese, title-roman, author-roman, …).
 *
 * Shows an alert when done.
 */
export async function migrateFromJurism(): Promise<void> {
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const Services = (globalThis as any).Services;
  const win =
    (Zotero as any).getMainWindow?.() ??
    Services?.wm?.getMostRecentWindow("navigator:browser");

  const showAlert = (msg: string) => {
    if (win) win.alert(msg);
    Zotero.debug(`[ja-metadata] ${msg}`);
  };

  try {
    // Get all regular items from the user library
    const libraryID = (Zotero as any).Libraries?.userLibraryID ?? 1;
    const allIDs: number[] = await Zotero.Items.getAll(libraryID, false, false, true) ?? [];

    Zotero.debug(`[ja-metadata] Migration: scanning ${allIDs.length} items for mlzsync1 data`);

    for (const itemID of allIDs) {
    try {
      const item = await Zotero.Items.getAsync(itemID as unknown as number);
      if (!item || item.isAttachment() || item.isNote() || item.deleted) {
        skipped++;
        continue;
      }

      const extra = (item.getField("extra") as string) || "";
      const data = parseMlzExtra(extra);
      if (!data) { skipped++; continue; }

      const altKeys = data.multifields?._keys ?? {};
      const multicreators = data.multicreators ?? {};

      // Check whether there is any ja-alalc97 data at all
      const hasJaAlt =
        Object.values(altKeys).some(langs => "ja-alalc97" in langs) ||
        Object.values(multicreators).some(c => c._key && "ja-alalc97" in c._key);

      if (!hasJaAlt) { skipped++; continue; }

      setIsJapanese(item, true);

      // Alt field values
      for (const [field, lang, pluginKey] of FIELD_MAP) {
        const val = altKeys[field]?.[lang];
        if (val) setJaField(item, pluginKey, val);
      }

      // Alt creator names — sorted by creator position
      const positions = Object.keys(multicreators)
        .map(Number)
        .sort((a, b) => a - b);

      const romanNames: string[] = [];
      for (const pos of positions) {
        const altName = multicreators[pos]._key?.["ja-alalc97"];
        if (!altName) continue;
        // Can be stored as .name (single) or .lastName + .firstName
        const last = (altName.lastName ?? altName.name ?? "").trim();
        const first = (altName.firstName ?? "").trim();
        if (last && first) romanNames.push(`${last}, ${first}`);
        else if (last || first) romanNames.push(last || first);
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
    showAlert(`Migration failed with unexpected error:\n${err}`);
    return;
  }

  showAlert(
    `Migration complete.\n\n` +
    `${updated} updated, ${skipped} skipped (no ja-alalc97 data), ${errors} errors.`
  );
}
