# NihongoZotero

A [Zotero 7](https://www.zotero.org/) plugin for scholars who work with Japanese-language sources. NihongoZotero adds a dedicated metadata panel to the item pane where you can store romanized titles, author names, publisher names, and English translations — and then cite those sources accurately using bundled Chicago-style citation styles.

---

## The problem

Zotero's standard fields weren't designed for CJK sources. When you cite a Japanese book or article, you typically need:

- A **romanized title** (Hepburn transliteration) for the bibliography
- An **English translation** of the title, shown in brackets
- **Romanized author/editor/publisher names** in the order expected by Western citation styles
- Consistent handling of diacritics, macrons, and city names (Tōkyō → Tokyo)

None of this fits naturally into Zotero's existing fields, and standard citation styles don't know what to do with Japanese text.

---

## Features

### 引 NihongoZotero item pane section

A collapsible section appears in the item pane for every item. Check **"Source is in Japanese"** to reveal the romanization fields:

| Field | Description |
|---|---|
| Title (Romanized) | Hepburn transliteration of the title |
| Title (English) | English translation, shown in brackets in citations |
| Author (Romanized) | Author name(s) in Roman script |
| Editor (Romanized) | Editor name(s) in Roman script |
| Translator (Romanized) | Translator name(s) |
| Book Author (Romanized) | Book author for chapter-in-book items |
| Container (Romanized) | Journal or book title romanized |
| Series (Romanized) | Series name romanized |
| Series (English) | Series name in English |
| Series Editor (Romanized) | Series editor name(s) |
| Publisher (Romanized) | Publisher name romanized |
| Place (Romanized) | City of publication romanized |
| Edition (Romanized) | Edition statement (e.g. *Kaitei-ban*) |
| Conference Name (Romanized) | Conference or event name |

All data is stored in the item's **Extra** field as plain `key: value` lines, so it is fully portable: your library remains valid Zotero data with no lock-in, and the fields survive export/import.

### AI-assisted romanization

Click **Generate Romanization** to send the item's existing metadata to [Claude](https://www.anthropic.com/) (Anthropic's AI) and automatically populate the romanization fields. You will be prompted for an Anthropic API key the first time; the key is stored in Zotero's preferences and reused thereafter. You can also set or update it via **Tools → NihongoZotero: Set Anthropic API key…**

The AI handles:
- Hepburn romanization of titles, publisher names, place names, and personal names
- English translation of titles
- Correct name order for Japanese authors in Western citation contexts

Always review the generated output — AI romanization is a starting point, not a guarantee.

### Bundled citation styles

Three Chicago-style citation styles are installed automatically:

| Style | Behavior |
|---|---|
| **Chicago (Japanese — Romanized)** | Romanized fields in all positions; English title translation in brackets |
| **Chicago (Japanese — Romanized, No Translation)** | Romanized fields only; no English translation |
| **Chicago (Japanese — Romanized + Japanese)** | Composite "Romanized (Japanese)" strings |

These styles hook into Zotero's citation engine and substitute the plugin's romanized values wherever Zotero would normally use the raw Japanese text.

### Jurism migration

If you are migrating from [Jurism](https://juris-m.github.io/) (a Zotero fork with built-in multilingual support), use **Tools → NihongoZotero: Migrate from Jurism…** to extract the romanized and English-language data that Jurism stores in the Extra field's `mlzsync1:` block and write it into this plugin's format.

---

## Installation

1. Download the latest `nihongo-zotero.xpi` from the [Releases](https://github.com/andrewmkahn/nihongo-zotero/releases) page.
2. In Zotero: **Tools → Add-ons → gear icon → Install Add-on From File…**
3. Select the `.xpi` file and restart Zotero.

**Requirements:** Zotero 7.0 or later.

---

## Usage

1. Select any item in your library.
2. Click the **引** (NihongoZotero) section in the item pane on the right.
3. Check **Source is in Japanese**.
4. Fill in fields manually, or click **Generate Romanization** (requires an Anthropic API key).
5. Choose one of the **Chicago (Japanese —…)** styles in your word processor to cite the item.

---

## Data format

All plugin data lives in the item's **Extra** field alongside any other notes you have there. The plugin reads and writes only lines it recognizes; everything else is left untouched.

```
is-japanese: true
title-roman: Nihongo no Bunpō
title-en: Japanese Grammar
author-roman: Tanaka Tarō
publisher-roman: Iwanami Shoten
place-roman: Tokyo
```

---

## Development

```bash
git clone https://github.com/andrewmkahn/nihongo-zotero.git
cd nihongo-zotero
npm install
npm run build        # compile TypeScript → addon/chrome/content/index.js
./package-xpi.sh     # build + zip → nihongo-zotero.xpi
```

The source is TypeScript compiled by [esbuild](https://esbuild.github.io/). The main entry point is `src/index.ts`; item pane logic is in `src/modules/itemPane.ts`.

**Load without reinstalling** (faster iteration): in Zotero, go to **Tools → Developer → Load Plugin From Manifest…** and select `manifest.json` from the project root. Zotero loads the plugin directly from the source tree; you only need to run `npm run build` between changes.

---

## Author

Andrew Kahn — [ak3398@columbia.edu](mailto:ak3398@columbia.edu)

This plugin was built in a day using [Claude Code](https://claude.ai/claude-code). Use it at your own risk. I cannot make any promises about maintaining it.

---

## License

MIT
