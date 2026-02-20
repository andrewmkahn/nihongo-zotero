"use strict";
var NihongoZotero = (() => {
  // src/modules/itemPane.ts
  var PLUGIN_ID = "nihongo-zotero@andrewkahn";
  var SECTION_PANE_ID = "nihongo-zotero-section";
  var REGISTERED_PANE_ID = PLUGIN_ID.replace("@", "-") + "-" + SECTION_PANE_ID;

  // src/index.ts
  Zotero.__nihongoZotero = { plugin: new JaMetadataPlugin() };
})();
