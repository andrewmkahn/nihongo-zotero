#!/usr/bin/env bash
# package-xpi.sh — Build and zip the plugin into a .xpi file
# Usage: ./package-xpi.sh
set -euo pipefail

cd "$(dirname "$0")"

echo "Building..."
node build.js

XPI_NAME="nihongo-zotero.xpi"

# Remove old XPI
rm -f "$XPI_NAME"

echo "Packaging $XPI_NAME..."
# Zip from inside the addon/ directory plus the top-level bootstrap.js and manifest.json
zip -r "$XPI_NAME" \
  manifest.json \
  bootstrap.js \
  addon/

echo "Done: $XPI_NAME"
echo ""
echo "To install:"
echo "  Zotero → Tools → Developer → Load Plugin From Manifest..."
echo "  (select the manifest.json file for development)"
echo "  OR drag $XPI_NAME into Zotero"
