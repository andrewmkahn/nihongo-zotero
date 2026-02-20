// esbuild configuration for nihongo-zotero
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");

const outDir = "addon/chrome/content";

async function build() {
  const ctx = await esbuild.context({
    entryPoints: ["src/index.ts"],
    bundle: true,
    outfile: `${outDir}/index.js`,
    platform: "browser",
    target: "firefox102",
    format: "iife",
    globalName: "NihongoZotero",
    // Zotero globals are available at runtime; don't bundle them
    external: [],
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    logLevel: "info",
  });

  if (isWatch) {
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log("Build complete.");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
