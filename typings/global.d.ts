/**
 * global.d.ts — Pull in zotero-types and add any missing declarations.
 */

/// <reference path="../node_modules/zotero-types/index.d.ts" />

// Services global (Mozilla/Firefox)
declare var Services: {
  scriptloader: {
    loadSubScript(url: string, scope?: object): void;
  };
  [key: string]: unknown;
};

// Fluent localization global (Zotero 7)
declare var l10n:
  | {
      addResourceIds(ids: string[]): void;
      removeResourceIds(ids: string[]): void;
      formatValue(
        id: string,
        args?: Record<string, string | number>
      ): Promise<string>;
    }
  | undefined;
