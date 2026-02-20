/**
 * translate.ts — Generate romanization/translation via Anthropic Claude API.
 */

import { setJaField, JaFieldKey } from "./jaFields";

const PREF_KEY = "extensions.nihongo-zotero.claude-api-key";

const ALLOWED_KEYS = new Set<string>([
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
]);

function getClaudeApiKey(win: any): string | null {
  let key = Zotero.Prefs.get(PREF_KEY, true) as string | undefined;
  if (!key?.trim()) {
    key = win?.prompt("Enter your Anthropic API key (sk-ant-...):") ?? null;
    if (!key?.trim()) return null;
    Zotero.Prefs.set(PREF_KEY, key.trim(), true);
  }
  return key.trim();
}

function tryGetField(item: Zotero.Item, field: string): string {
  try {
    return (item.getField(field as any) as string) || "";
  } catch {
    return "";
  }
}

function creatorNames(item: Zotero.Item, type: string): string {
  return item
    .getCreators()
    .filter((c: any) => (Zotero.CreatorTypes as any).getName(c.creatorTypeID) === type)
    .map((c: any) => {
      const split = `${c.lastName ?? ""}${c.firstName ? " " + c.firstName : ""}`.trim();
      return split || (c.name ?? "");
    })
    .filter(Boolean)
    .join("; ");
}

export async function generateRomanization(
  item: Zotero.Item,
  win: any
): Promise<void> {
  const apiKey = getClaudeApiKey(win);
  if (!apiKey) return;

  const title = tryGetField(item, "title");
  const authors = creatorNames(item, "author");
  const editors = creatorNames(item, "editor");
  const translators = creatorNames(item, "translator");
  const seriesEditors = creatorNames(item, "seriesEditor");
  const bookAuthors = creatorNames(item, "bookAuthor");
  const container =
    tryGetField(item, "publicationTitle") || tryGetField(item, "bookTitle");
  const series =
    tryGetField(item, "series") || tryGetField(item, "seriesTitle");
  const publisher = tryGetField(item, "publisher");
  const place = tryGetField(item, "place");
  const edition = tryGetField(item, "edition");
  const conferenceName = tryGetField(item, "conferenceName");

  const fmt = (v: string) => v || "(none)";

  const lines: string[] = [
    `Title: ${fmt(title)}`,
  ];
  if (authors) lines.push(`Authors: ${authors}`);
  if (editors) lines.push(`Editors: ${editors}`);
  if (translators) lines.push(`Translators: ${translators}`);
  if (seriesEditors) lines.push(`Series editors: ${seriesEditors}`);
  if (bookAuthors) lines.push(`Book authors (for bookSection "by X"): ${bookAuthors}`);
  lines.push(`Container (journal/book title): ${fmt(container)}`);
  if (series) lines.push(`Series: ${series}`);
  lines.push(`Publisher: ${fmt(publisher)}`);
  lines.push(`Place: ${fmt(place)}`);
  if (edition) lines.push(`Edition: ${edition}`);
  if (conferenceName) lines.push(`Conference name: ${conferenceName}`);

  const outputFields: string[] = [
    `  "title-roman": "accurate Hepburn romanization, sentence case"`,
    `  "title-en": "English translation of the title, sentence case"`,
  ];
  if (authors) outputFields.push(`  "author-roman": "Family Given; Family2 Given2"`);
  if (editors) outputFields.push(`  "editor-roman": "Family Given; Family2 Given2"`);
  if (translators) outputFields.push(`  "translator-roman": "Family Given; Family2 Given2"`);
  if (seriesEditors) outputFields.push(`  "seriesEditor-roman": "Family Given; Family2 Given2"`);
  if (bookAuthors) outputFields.push(`  "book-author-roman": "Family Given; Family2 Given2"`);
  outputFields.push(`  "container-roman": "Hepburn romanization, sentence case"`);
  if (series) {
    outputFields.push(`  "series-roman": "Hepburn romanization of series name"`);
    outputFields.push(`  "series-en": "English translation of series name"`);
  }
  outputFields.push(`  "publisher-roman": "Hepburn romanization of publisher"`);
  outputFields.push(`  "place-roman": "Hepburn romanization of place (e.g. Tōkyō)"`);
  if (edition) outputFields.push(`  "edition-roman": "Hepburn romanization or English equivalent of the edition statement"`);
  if (conferenceName) outputFields.push(`  "conferenceName-roman": "Hepburn romanization of the conference name"`);

  const userMessage = `Romanize and translate this Japanese bibliographic item.

${lines.join("\n")}

Rules:
- Use standard Hepburn romanization with macrons for long vowels (ō, ū, etc.). Be precise.
- All romanized text must be in sentence case (capitalize only the first word and proper nouns).
- English translations must be in sentence case.
- For names: write "Family Given" with no comma (e.g. "Hirata Atsutane; Tanaka Tarō").
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
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        "You are a Japanese bibliographic metadata specialist. Return only valid JSON, no markdown, no explanation.",
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    content: { type: string; text: string }[];
  };
  const rawText = data.content[0]?.text ?? "";

  // Strip markdown code fences if present
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${rawText}`);
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (ALLOWED_KEYS.has(key) && typeof value === "string" && value.trim()) {
      setJaField(item, key as JaFieldKey, value.trim());
    }
  }
}
