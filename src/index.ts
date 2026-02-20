/**
 * index.ts — Main plugin entry point.
 *
 * Compiled by esbuild into addon/chrome/content/index.js and loaded
 * by bootstrap.js via Services.scriptloader.loadSubScript().
 *
 * We attach the plugin instance to Zotero.__nihongoZotero so bootstrap.js
 * can call startup()/shutdown() after the script is loaded.
 */

import { registerSection, unregisterSection } from "./modules/itemPane";
import { migrateFromJurism } from "./modules/migration";
import { applyCSLPatch, removeCSLPatch } from "./modules/cslPatch";
import { installStyles } from "./modules/styles";

interface StartupData {
  id: string;
  version: string;
  rootURI: string;
  reason?: number;
}

class NihongoZoteroPlugin {
  private started = false;
  private migrateMenuItem: Element | null = null;
  private apiKeyMenuItem: Element | null = null;

  async startup(data: StartupData): Promise<void> {
    Zotero.debug(`[NihongoZotero] Starting up v${data.version}`);

    // Register our FTL with Firefox's L10n system so that l10nID references in
    // registerSection resolve correctly. We use L10nRegistry to add a FileSource
    // that points at our locale directory, then add the resource to the document's
    // DOMLocalization. This must happen BEFORE registerSection().
    {
      const gAny = globalThis as any;
      const Services = gAny.Services;
      const win =
        (Zotero as any).getMainWindow?.() ??
        Services?.wm?.getMostRecentWindow("navigator:browser");

      // Diagnostic: report what l10n objects are available
      Zotero.logError(new Error(
        `[NihongoZotero] L10n diag: win=${!!win}` +
        ` | win.L10nRegistry=${!!win?.L10nRegistry}` +
        ` | global.L10nRegistry=${!!gAny.L10nRegistry}` +
        ` | Zotero.l10n=${!!(Zotero as any).l10n}` +
        ` | Zotero.l10n.addResourceIds=${typeof (Zotero as any).l10n?.addResourceIds}` +
        ` | win.document.l10n=${!!win?.document?.l10n}`
      ));

      // Strategy 1: L10nRegistry as window global (available in window context)
      const L10nRegistry = win?.L10nRegistry ?? gAny.L10nRegistry;
      const FileSource =
        win?.L10nFileSource ?? win?.FileSource ??
        gAny.L10nFileSource ?? gAny.FileSource;

      if (L10nRegistry && FileSource) {
        Zotero.logError(new Error(`[NihongoZotero] FileSource.length=${FileSource.length}`));

        try {
          // Use chrome content URL for the prePath. The "content" chrome type
          // does direct path mapping (no locale magic), so {locale} expands
          // correctly: chrome://nihongo-zotero/content/locale/en-US/addon.ftl
          // → rootURI/addon/chrome/content/locale/en-US/addon.ftl.
          // (Using locale-type chrome:// or data.rootURI jar: URLs both failed.)
          const prePath = "chrome://nihongo-zotero/content/locale/{locale}/";
          Zotero.logError(new Error(`[NihongoZotero] prePath=${prePath}`));
          // Correct 5-param constructor (options has default, so length=4):
          //   L10nFileSource(name, type, locales, prePath, options={})
          // Use "app" type — Zotero's own sources use this type and it has
          // the file access permissions needed to fetch chrome:// URLs.
          const source = new FileSource(
            "nihongo-zotero",
            "app",
            ["en-US"],
            prePath
          );
          const reg = L10nRegistry.getInstance?.() ?? L10nRegistry;
          if (typeof reg.registerSources === "function") reg.registerSources([source]);
          else reg.registerSource(source);
          win?.document?.l10n?.addResourceIds(["addon.ftl"]);
          Zotero.logError(new Error("[NihongoZotero] L10n: Strategy 1 (global registry) OK"));
        } catch (e: any) {
          Zotero.logError(new Error(`[NihongoZotero] L10n: Strategy 1 FAILED: ${e?.message || String(e)}`));
        }
      } else {
        // Strategy 2: Zotero.l10n.addResourceIds
        const zl10n = (Zotero as any).l10n;
        if (typeof zl10n?.addResourceIds === "function") {
          try {
            zl10n.addResourceIds(["nihongo-zotero/addon.ftl"]);
            Zotero.logError(new Error("[NihongoZotero] L10n: Strategy 2 (Zotero.l10n) OK"));
          } catch (e: any) {
            Zotero.logError(new Error(`[NihongoZotero] L10n: Strategy 2 FAILED: ${e?.message || String(e)}`));
          }
        } else {
          Zotero.logError(new Error(
            `[NihongoZotero] L10n: all strategies exhausted.` +
            ` L10nRegistry=${!!L10nRegistry} FileSource=${!!FileSource}` +
            ` Zotero.l10n keys=${Object.keys((Zotero as any).l10n ?? {}).join(",")}`
          ));
        }
      }
    }

    registerSection();

    await Zotero.uiReadyPromise;

    // Diagnostics: verify FTL message resolves and inspect section element state
    {
      const gAny2 = globalThis as any;
      const win2 =
        (Zotero as any).getMainWindow?.() ??
        gAny2.Services?.wm?.getMostRecentWindow("navigator:browser");
      const l10n = win2?.document?.l10n;

      // Check if the FTL message resolves
      l10n?.formatMessages?.([{ id: "ja-section-header" }])
        ?.then?.((msgs: any[]) => {
          Zotero.logError(new Error(
            `[NihongoZotero] formatMessages("ja-section-header")=${JSON.stringify(msgs)}`
          ));
        });

      // After a short delay, inspect the section element
      setTimeout(() => {
        const el = win2?.document?.querySelector("collapsible-section[data-pane]");
        if (el) {
          Zotero.logError(new Error(
            `[NihongoZotero] section el: data-l10n-id=${(el as any).dataset?.l10nId}` +
            ` | label attr=${el.getAttribute("label")}` +
            ` | textContent="${(el as any)._title?.textContent}"`
          ));
        } else {
          Zotero.logError(new Error("[NihongoZotero] no collapsible-section found (no item selected?)"));
        }
      }, 2000);
    }

    applyCSLPatch();
    await installStyles();

    const Services = (globalThis as any).Services;
    const win =
      (Zotero as any).getMainWindow?.() ??
      Services?.wm?.getMostRecentWindow("navigator:browser");
    const toolsPopup = win?.document?.getElementById("menu_ToolsPopup");
    Zotero.debug(
      `[NihongoZotero] menu_ToolsPopup lookup: win=${!!win} popup=${!!toolsPopup}`
    );
    if (toolsPopup) {
      const doc = win.document;
      const menuItem: Element =
        typeof doc.createXULElement === "function"
          ? doc.createXULElement("menuitem")
          : doc.createElementNS(
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

      const apiKeyItem: Element =
        typeof doc.createXULElement === "function"
          ? doc.createXULElement("menuitem")
          : doc.createElementNS(
              "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
              "menuitem"
            );
      apiKeyItem.setAttribute("label", "NihongoZotero: Set Anthropic API key\u2026");
      apiKeyItem.setAttribute("id", "ja-metadata-apikey-menuitem");
      apiKeyItem.addEventListener("command", () => {
        const key = win.prompt("Enter your Anthropic API key (sk-ant-...):") as string | null;
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

  shutdown(_data: StartupData): void {
    if (!this.started) return;
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
}

// Attach to Zotero so bootstrap.js can reach it after loadSubScript()
(Zotero as any).__nihongoZotero = { plugin: new JaMetadataPlugin() };
