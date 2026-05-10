#!/bin/bash
# build.sh — Concatenate src/* into deployable index.html
#
# Source structure:
#   00-styles.css           → CSS (extracted from <style>)
#   01-head.html            → <!DOCTYPE> + <head> opening + meta tags
#   02-body.html            → <body> markup (no scripts)
#   10-config-auth.js       → CONFIG, TokenTracker, auth, supabase, helpers
#   20-api-client.js        → claudeFetch
#   30-projects.js          → ProjectStore + project grid
#   40-workspace-resume.js  → Workspace + Resume panel + Upload
#   50-jd-modal.js          → JD analyzer UI + URL fetch + AI answer modal
#   60-jd-analysis.js       → analyzeJD + generateQuestions
#   70-validation.js        → Validation, dedup, post-processing
#   80-pipeline.js          → applySelectedFixes, autoOptimize
#   90-format.js            → _fmt, TEMPLATE_PRESETS, fmtParseText/Render
#   99-pdf-init.js          → fmtSavePdf, final init
#
# Output: index.html (deployed as-is to GitHub Pages)

set -e
cd "$(dirname "$0")"

OUTPUT="index.html"
SRC_DIR="src"

JS_FILES=(
  "10-config-auth.js"
  "20-api-client.js"
  "30-projects.js"
  "40-workspace-resume.js"
  "50-jd-modal.js"
  "60-jd-analysis.js"
  "70-validation.js"
  "80-pipeline.js"
  "90-format.js"
  "99-pdf-init.js"
)

# Verify all source files exist
for f in 00-styles.css 01-head.html 02-body.html "${JS_FILES[@]}"; do
  if [ ! -f "$SRC_DIR/$f" ]; then
    echo "❌ Missing: $SRC_DIR/$f"
    exit 1
  fi
done

# Build the bundle
{
  cat "$SRC_DIR/01-head.html"
  echo "<style>"
  cat "$SRC_DIR/00-styles.css"
  echo "</style>"
  echo "</head>"
  cat "$SRC_DIR/02-body.html"
  echo "<script>"
  for f in "${JS_FILES[@]}"; do
    cat "$SRC_DIR/$f"
  done
  echo "</script>"
  echo ""
  echo ""
  printf "</body></html><!-- Force rebuild %s -->\n" "$(date +%s)"
} > "$OUTPUT"

LINES=$(wc -l < "$OUTPUT")
SIZE=$(wc -c < "$OUTPUT")
echo "✓ Built $OUTPUT ($LINES lines, $SIZE bytes)"
