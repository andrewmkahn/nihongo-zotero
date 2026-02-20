/**
 * bootstrap.js — Zotero 7 plugin lifecycle entry point.
 * Based on the official pattern from zotero/make-it-red and
 * windingwind/zotero-plugin-template.
 */

/* global Zotero, Components, Services, APP_SHUTDOWN */
"use strict";

var chromeHandle;

function install(data, reason) {}

async function startup({ id, version, rootURI }, reason) {
  // Register our chrome:// URI (standard Zotero 7 step)
  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);

  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "nihongo-zotero", rootURI + "addon/chrome/content/"],
    ["locale", "nihongo-zotero", "en-US", rootURI + "addon/locale/en-US/"],
  ]);

  // Wait for Zotero to be fully initialized before touching its APIs
  await Zotero.initializationPromise;

  // Load our compiled bundle. The bundle attaches itself to Zotero.__nihongoZotero.
  Services.scriptloader.loadSubScript(
    rootURI + "addon/chrome/content/index.js",
    { Zotero }
  );

  // Retrieve and start the plugin instance
  if (Zotero.__nihongoZotero && Zotero.__nihongoZotero.plugin) {
    await Zotero.__nihongoZotero.plugin.startup({ id, version, rootURI });
  } else {
    Zotero.debug("[NihongoZotero] bootstrap: plugin instance not found after loadSubScript");
  }
}

async function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;

  if (Zotero.__nihongoZotero && Zotero.__nihongoZotero.plugin) {
    Zotero.__nihongoZotero.plugin.shutdown({ id, version, rootURI });
    delete Zotero.__nihongoZotero;
  }

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function uninstall(data, reason) {}
