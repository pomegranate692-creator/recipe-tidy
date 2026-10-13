# Recipe Tidy 🍳

Turn a pile of messy recipes into one clean, searchable cookbook.

Drop in PDFs, Word docs, text files, photos of cookbook pages or recipe cards, or saved web pages. Recipe Tidy pulls out the title, ingredients, steps, servings and times, sorts each recipe into a category, and keeps everything in a library in your browser.

## Features

- **Reads almost anything:** PDF (including scanned), .docx, .txt, .md, .rtf, saved web pages (.html), and photos (JPG, PNG, WebP)
- **Any language:** photo text recognition for 20+ languages, including Slovak, Czech, Polish, German, Spanish and more. Understands European units like dkg, dl, PL and ČL
- **Built-in translation to English:** runs on your device, free, no account. Uses Chrome's built-in translator when available, otherwise an open translation model (Opus-MT or NLLB-200) that downloads once and then works offline. European units convert too (dkg → g, dl → ml, PL → tbsp, ČL → tsp). Flip between English and the original anytime
- **Auto categories:** Breakfast, Soups & stews, Salads, Main dishes, Sides, Breads & baking, Desserts, Sauces & dips, Snacks, Drinks, Preserves
- **Collections:** file a batch under a name like "Mom's cookbook" and filter by it
- **Whole cookbooks:** a PDF or Word file with dozens of recipes is split into separate recipes, each sorted into its own category. Skips intro pages, contents pages, page numbers and running headers, and reads two column layouts
- **Multi page recipes:** pick several photos and choose "One recipe" to combine them
- **Made for everyone:** one big Add button, plain step by step questions, large readable text (Atkinson Hyperlegible) and a Text size setting
- **Serving scaler:** quantities update as you change servings (fractions stay readable)
- **Print and export:** clean printable recipe cards and Markdown export
- **Edit anything** the parser got wrong
- **Backup and restore** your whole library as a JSON file
- **Private:** everything stays in your browser. Nothing is uploaded unless you turn on AI reading

## Translation

Tap **Add a recipe**, choose **Another language**, pick the language and leave **Translate it into English for me** on, or hit **🌐 Translate** on any recipe later.

| Engine | Size | Notes |
|---|---|---|
| Chrome built-in translator | small language pack | Fastest. Chrome desktop only. Used automatically when available |
| Light model (Opus-MT) | about 100 MB once | Quick. Slovak uses the Czech model, so a few words may slip through |
| Best model (NLLB-200 600M) | about 900 MB once | Best for Slovak and less common languages. Choose it in Settings |

Models come from Hugging Face, run in a background worker, and are cached by the browser. Translation needs the site served over http(s) (GitHub Pages or a local server), not opened as a file.

## Optional: AI reading

The built-in parser is free and works well on typed recipes. For handwriting, faded book scans or very messy files, open **Settings**, turn on **Use AI to read files**, and paste your own Anthropic API key (from console.anthropic.com). Claude then reads each file, assigns the category, and can translate recipes into English if you want. The key is stored only in your browser and sent only to Anthropic. Default model: `claude-haiku-5-5` (cheapest).

## Run it

It's a static site with no build step.

- **Locally:** open `index.html` in a browser, or run `python3 -m http.server` in this folder and visit http://localhost:8000
- **GitHub Pages:** push this repo, then go to Settings → Pages → Deploy from a branch → `main` / root

## Put it on your phone's home screen

Recipe Tidy is an installable web app that works offline once it's open.

- **iPhone (Safari):** open the site, tap Share, then **Add to Home Screen**
- **Android (Chrome):** open the site, tap ⋮, then **Install app** or **Add to Home screen**

When you upload changes, bump `VERSION` in `sw.js` (v1 → v2) so installed copies update.

## Tips

- iPhone photos in HEIC format: share them as JPG first (or set Camera → Formats → Most Compatible)
- The first photo in a new language downloads that language's data, so give it a few seconds
- Library data lives in your browser. Use **Backup** to move it to another device

## Project layout

```
index.html        page
css/styles.css    styles (light, dark, mobile, print)
js/parser.js      rule-based recipe parser, scaler, categorizer
js/translate.js   on-device translation (Chrome Translator, Transformers.js worker)
js/translate-worker.js  model runner
js/extract.js     file reading (pdf.js, mammoth, tesseract.js loaded on demand) and optional Claude API
js/app.js         UI, library, storage
test/             node test/parser.test.js and node test/cookbook.test.js
```

## License

MIT
