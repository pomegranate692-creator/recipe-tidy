# Recipe Snap: Project Summary (start here)

Owner: Romaan Malik. Built with Claude (Cowork), Oct 13 and 14, 2026. Formerly called **Recipe Tidy**.

## What it is
A free, installable web app (PWA) that turns messy recipes (photos of cookbook pages, recipe cards, PDFs, Word docs, pasted text, saved web pages) into clean recipe cards in one searchable library. Built first for Romaan's mom's **Slovak cookbook**, but meant to be universal for anyone. Tagline: **Scan. Save. Cook.**

## Where it lives
- Static site, no build step, hosted on **GitHub Pages** (same setup as his Sip Check app; GitHub account `pomegranate692-creator`).
- Suggested repo: `recipe-tidy` (keep this name; renaming changes the URL and the home screen app would need re-adding). Live URL would be `pomegranate692-creator.github.io/recipe-tidy`.
- Deploy: upload every file in the repo folder to GitHub, then Settings → Pages → Branch `main`, folder `/ (root)`.
- **Every time files change, bump `VERSION` in `sw.js`** (currently `v4`) so installed phones update.
- Install on iPhone: open in Safari → Share → Add to Home Screen. Use the home screen app from the start (it has separate storage from Safari tabs).

## Decisions made in the chat
1. GitHub repo, not a Claude artifact. Free, works offline, no server.
2. Rule-based parser by default (free). Optional **AI reading** with the user's own Anthropic API key (Settings, advanced), default model `claude-haiku-5-5`. Key stays in the browser.
3. Features he asked for: saved library, serving scaler, print/export, photo import, auto categories, collections (cookbooks), Slovak support, translation to English.
4. **Embedded translation** (no key needed): Chrome's built-in Translator if available, else Transformers.js in a web worker. Light = Opus-MT (~100 MB, Slovak uses the Czech model). Best = NLLB-200 600M (~900 MB, computers only). Translated recipes keep the original (Show original toggle). Units convert when translated: dkg→g, dl→ml, PL→tbsp, ČL→tsp, etc.
5. Must work like Sip Check: home screen app (manifest, service worker, icons, offline).
6. Must be **extremely easy for non-tech users**: big buttons, plain words, Atkinson Hyperlegible font, Text size setting (Normal / Large / Extra large), friendly error screens with photo tips.
7. Big PDFs must **split into separate recipes** (e.g. 20 recipes in one cookbook PDF → 20 recipes), each auto categorized.
8. Renamed to **Recipe Snap** and redesigned from his ChatGPT mockups + brief (docs/RecipeSnap_App_Brief.md): forest green + warm cream, bottom tab bar (Home, Recipes, Scan, Groceries, Profile), live camera scan, review before save, favorites, grocery list, cooking mode.
9. Writing style for Romaan: no dashes in prose, short and scannable, end with one next step, keep usage low.

## Current features
- **Scan:** live camera (getUserMedia, needs https) with gold scan frame, flash/torch where supported, multi page (Retake / Add a page / Use photo), Photo | Gallery | Upload tabs. Language and cookbook chips on top. Falls back to the phone camera app.
- **Upload:** PDF (pdf.js, font size headings, two column pages, scanned PDFs via OCR up to 80 pages), Word .docx (mammoth, keeps headings), txt/md/rtf, HTML with schema.org JSON-LD, pasted text. Photos via Tesseract.js OCR in 20+ languages (eng + chosen language).
- **Review & Edit before saving:** flags "Please check" lines (odd symbols, impossible amounts, missing name/ingredients/steps). Compare with original photo. Multi recipe files show "We found N recipes" with keep checkboxes. Then a dark "Recipe Saved!" screen.
- **Home:** greeting, Scan Recipe card, quick tiles (My Recipes, Grocery List, Collections), Recently Added, Favorites, Quick Categories, example recipes for empty state.
- **Library:** 2 column grid, search (title, ingredient, category, cookbook, tags), category chips, Favorites, cookbook chips.
- **Recipe page:** hero photo (or category emoji tile + Add a photo), servings stepper, Ingredients / Instructions tabs (side by side on desktop), tap to check off, translate / show original, Add to grocery list, Edit, Print, Save a copy (.txt), See original scan, Change photo, Delete, Start Cooking.
- **Cooking mode:** one big step at a time, progress bar, ingredient sheet, auto timer buttons from step text, screen wake lock, beep + vibrate.
- **Grocery list:** grouped by aisle (Produce, Meat & fish, Dairy & eggs, Bakery, Spices, Frozen, Pantry, Other), merges same item + unit, manual add, Mark all purchased, Clear purchased.
- **Edit screen:** title, type of dish, cookbook, servings, prep/cook time, difficulty, ingredient rows (a line ending in ":" starts a group), step rows with reorder, notes, photo.
- **Other screens:** Categories, Collections, Scan History, Profile (dark, name), Settings (text size, backup/restore, translation options, AI reading, show welcome, delete all), Help & Support, Welcome (drawn pasta bowl SVG).
- **Storage:** localStorage keys `recipeTidy.recipes.v1`, `recipeTidy.settings.v1`, `recipeSnap.groceries.v1` (old keys kept so data carried over). Photos and original scans in IndexedDB `recipe-snap` / store `blobs` (`photo:<id>`, `src:<id>:<n>`). Backup file `recipe-snap-backup-DATE.json` includes recipes, dish photos and groceries.

## Reading and translating other languages (3 layers)
1. **Reading the photo (always on, free):** Tesseract.js OCR runs in the app, 20+ languages. User picks the language with the 🌐 chip on the scan screen (it uses English + that language).
2. **Translating to English (on by default, free, no key):** Chrome built-in Translator on desktop Chrome; otherwise an on-device model downloads once and then works offline. Light Opus-MT ~100 MB (default, fine on phones; Slovak uses the Czech model). Best NLLB-200 ~900 MB (Settings, computers only, better Slovak). "Show the original" toggle; units convert (dkg→g, PL→tbsp).
3. **Claude AI (optional, best for handwriting / faded pages):** Settings → Smart reading with AI + own Anthropic API key, a fraction of a cent per recipe. Reads and translates in one step.
Caveat: real OCR and translation quality not yet tested on real cookbook pages. Plan: scan one Slovak page with the free setup; if messy, compare with AI reading on.

## How the parser works (js/parser.js)
- Section headers in English, Slovak/Czech, German, Spanish, French, Italian, Polish, Hungarian (e.g. Suroviny / Postup / Poznámka).
- Quantities: fractions, unicode fractions, ranges, decimal commas (2,5 dl). Units incl. Slovak (dkg, dl, PL, ČL, KL, lyžica, hrnček, štipka, ks, strúčik, balíček, kocka, plechovka) and EL/TL, cda/cdta.
- **Cookbook splitting:** cleans page furniture (page numbers, running headers repeated 3+ times, table of contents dot leaders), then starts a new recipe when the current one has ingredients AND steps and it hits a big heading, an Ingredients header, or a fresh run of ingredient lines. Title found by walking back to a short line after a blank line or a sentence end. Ingredients with no title in front (e.g. "Frosting") stay in the same dish as a new ingredient group.
- **Categories:** keyword scoring on the title (last word gets a bonus, plurals ok) plus ingredient hints. 12 categories: Breakfast, Soups & stews, Salads, Main dishes, Sides, Breads & baking, Desserts, Sauces & dips, Snacks & appetizers, Drinks, Preserves, Other.

## File map
- `index.html` page shell, tab bar, hidden file pickers
- `css/styles.css` all styling (light cream + dark forest modes, print)
- `js/icons.js` line icons · `js/store.js` storage + IndexedDB + image shrink
- `js/parser.js` parser, scaler, categorizer, unit conversion, markdown export
- `js/extract.js` file reading (pdf.js 3.11.174, mammoth 1.8.0, tesseract.js 5.1.1 via jsDelivr, lazy loaded) + Claude API call with JSON salvage
- `js/translate.js` + `js/translate-worker.js` on device translation (@huggingface/transformers 3.8.1)
- `js/app.js` all screens and logic (hash routes: #welcome #home #recipes #scan #review #r/<id> #edit/<id> #cook/<id> #groceries #profile #settings #help #categories #collections #history)
- `manifest.json`, `sw.js` installable app + offline cache
- `icons/*.png` app icons (regenerate with `tools/make_icons.py`)
- `test/parser.test.js`, `test/cookbook.test.js` (+ fixtures): run `node test/parser.test.js && node test/cookbook.test.js`
- `docs/RecipeSnap_App_Brief.md` the ChatGPT design brief he provided

## Tested vs not tested
- Tested (headless Chromium, iPhone size): all screens, scan with fake camera, review/save flow, 20 recipe PDF, two column PDF, Word and text cookbooks (20/20 recipes, ingredients, steps, categories), Slovak samples, service worker offline, translation flow with a mocked translator.
- **Not tested yet on real devices/networks:** Tesseract photo OCR quality, real translation models (Hugging Face downloads were blocked in the build sandbox), live camera on a real iPhone, real cookbook PDFs.

## Known limits / ideas for next
- No accounts or sync (everything on one device; use backup files). Real sync would need a backend (e.g. Supabase or Firebase).
- No stock food photos; recipes show an emoji tile until a dish photo is added.
- Handwriting and faded scans: use AI reading.
- Possible next: Slovak cooking glossary for better translations, meal planning, sharing recipes, URL import, cloud sync.
- Immediate next step: deploy, then test with real pages from his mom's Slovak cookbook and fix what it trips on.
