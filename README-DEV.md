# Developer Guide — ATS Resume Optimizer

## Project Structure

```
ats-optimizer/
├── src/                          # Source files (edit these)
│   ├── 00-styles.css             # All CSS
│   ├── 01-head.html              # <head> opening + meta tags
│   ├── 02-body.html              # <body> markup (no scripts)
│   ├── 10-config-auth.js         # CONFIG, TokenTracker, auth, helpers
│   ├── 20-api-client.js          # claudeFetch (API client)
│   ├── 30-projects.js            # ProjectStore + project grid
│   ├── 40-workspace-resume.js    # Workspace + Resume panel + Upload
│   ├── 50-jd-modal.js            # JD analyzer UI + URL fetch + AI modal
│   ├── 60-jd-analysis.js         # analyzeJD + generateQuestions
│   ├── 70-validation.js          # Validation, dedup, post-processing
│   ├── 80-pipeline.js            # applySelectedFixes, autoOptimize
│   ├── 90-format.js              # _fmt, TEMPLATE_PRESETS, format render
│   └── 99-pdf-init.js            # fmtSavePdf + final init
│
├── build.sh                      # Build script (concatenates src/* → index.html)
├── index.html                    # Generated output (deployed to GitHub Pages)
├── CLAUDE.md                     # Project rules and deployment guide
└── README-DEV.md                 # This file
```

## Quick Start

### Build the app
```bash
./build.sh
```
Generates `index.html` from `src/*` files.

### Test locally
```bash
./build.sh && open index.html
```

### Deploy
After editing source files in `src/`:
```bash
./build.sh
git add . && git commit -m "Build X.X.X: Description"
git push
```
GitHub Pages auto-deploys ~2 minutes after push.

## Where to Find Code

| What you want to change | File to edit |
|---|---|
| App config / constants | `10-config-auth.js` |
| Auth, login, Supabase | `10-config-auth.js` |
| API calls / prompts | `20-api-client.js` |
| Projects list / grid | `30-projects.js` |
| Save / load / workspace | `40-workspace-resume.js` |
| Resume upload / parse | `40-workspace-resume.js` |
| JD analyzer UI | `50-jd-modal.js` |
| AI questions modal | `50-jd-modal.js` |
| `analyzeJD()` function | `60-jd-analysis.js` |
| `generateQuestions()` function | `60-jd-analysis.js` |
| Pronoun validation | `70-validation.js` |
| Bullet cap (3 per role) | `70-validation.js` |
| Strip placeholders | `70-validation.js` |
| Dedup functions | `70-validation.js` |
| `applySelectedFixes()` | `80-pipeline.js` |
| `autoOptimize()` | `80-pipeline.js` |
| Template defaults `_fmt` | `90-format.js` |
| Template presets | `90-format.js` |
| Resume format/render | `90-format.js` |
| PDF generation | `99-pdf-init.js` |

## Why This Structure

### Concatenated Output
All `src/*` files are concatenated into a single `index.html` for GitHub Pages deployment. **Order matters** — files are concatenated by filename (numeric prefix). JavaScript constants like `_fmt` are still in their original positions to preserve dependency order.

### Single-Page App
This is intentionally a single-file deployment. Reasons:
1. GitHub Pages serves static files — single `index.html` is fastest
2. No build complexity (just bash, no Node.js / webpack)
3. Easy to inspect in DevTools (one file)
4. Works offline once loaded

### Why Bash for Build?
- No toolchain dependencies (no Node.js / npm install needed)
- Works on any Unix-like system (Mac, Linux, WSL)
- Simple, debuggable, fast (<1 sec build)

## Adding New Features

### Adding a new validation rule
1. Open `70-validation.js`
2. Add your function (e.g., `validateNoEmoji(text)`)
3. Add it to the apply pipeline in `80-pipeline.js`
4. Run `./build.sh` to test

### Adding a new AI prompt
1. Open `60-jd-analysis.js` (or relevant pipeline file)
2. Add your `claudeFetch()` call
3. Add corresponding validation in `70-validation.js`
4. Run `./build.sh` to test

### Adding a new template
1. Open `90-format.js`
2. Add to `TEMPLATE_PRESETS` object
3. Add render function in same file
4. Run `./build.sh` to test

## Testing Changes

After every edit:
```bash
./build.sh
```

Then hard-refresh the deployed app. Look for:
- No JavaScript errors in DevTools console
- All buttons still work
- PDF export produces clean output
- Apply Selected / Auto-Optimize work end-to-end

## Reverting Bad Changes

```bash
# Revert to last stable
git reset --hard v3.7.3-stable
git push --force origin main
```

Or use any tagged build:
```bash
git tag -l                       # List tags
git reset --hard <tag>
```

## Performance Notes

### API Cost Reduction
- `20-api-client.js` includes a request cache for repeated identical prompts
- Same JD analyzed twice → reuses cached result
- Saves ~20-30% on API costs for typical usage

### File Size
- Built `index.html`: ~700KB
- Loads instantly even on slow connections
- No external JS dependencies (all bundled)

## Troubleshooting

### "Build script fails"
- Check all `src/*` files exist
- Verify file permissions: `chmod +x build.sh`

### "App breaks after refactor"
- Revert to stable: `git reset --hard v3.7.3-stable`
- Check JS syntax: open DevTools console
- Compare with original: `diff index.html /tmp/original-index.html`

### "Build succeeds but output is wrong"
- Verify file order in `build.sh` `JS_FILES` array
- Check no source file is empty
- Run `./build.sh` again

## Style Guide

- Use `function foo()` for top-level functions (hoisted)
- Use `const foo = () => {}` only inside other functions
- Comment major sections with `// ──────────────────`
- Keep functions under 100 lines when possible
- Add comments explaining WHY, not just WHAT
