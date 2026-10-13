/* Recipe Tidy — getting text (or recipes) out of files. Libraries load only when needed. */
(function () {
  'use strict';
  const LIBS = {
    pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
  };
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.onload = resolve;
        s.onerror = () => { delete loaded[src]; reject(new Error('Could not load a helper library. Check your internet connection.')); };
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }

  const ext = f => (f.name.split('.').pop() || '').toLowerCase();
  const isImage = f => /^image\//.test(f.type) || /^(png|jpe?g|webp|gif|heic|bmp)$/.test(ext(f));
  const isPdf = f => f.type === 'application/pdf' || ext(f) === 'pdf';

  async function pdfText(file, onProgress) {
    await loadScript(LIBS.pdf);
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    // Pass 1: rebuild lines (with their font size) from positioned text pieces, column by column.
    const allLines = []; // { text, h, gapBefore, pageStart }
    for (let p = 1; p <= doc.numPages; p++) {
      onProgress && onProgress(`Reading page ${p} of ${doc.numPages}…`);
      const page = await doc.getPage(p);
      const width = page.getViewport({ scale: 1 }).width;
      const tc = await page.getTextContent();
      const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({
        x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || 10, w: it.width || 0, s: it.str
      }));
      // Two-column cookbook pages: read the left column, then the right one.
      const mid = width / 2;
      const crossing = items.filter(it => it.x < mid - 8 && it.x + it.w > mid + 8).length;
      const left = items.filter(it => it.x + it.w <= mid + 8), right = items.filter(it => it.x >= mid - 8);
      const twoCol = items.length > 20 && crossing < items.length * 0.08 && left.length > items.length * 0.2 && right.length > items.length * 0.2;
      // Each piece goes to the column it starts in (a long title may poke past the middle).
      const columns = twoCol ? [items.filter(it => it.x < mid - 8), items.filter(it => it.x >= mid - 8)] : [items];
      let first = true;
      for (const col of columns) {
        const rows = [];
        for (const it of col) {
          let row = rows.find(r => Math.abs(r.y - it.y) < Math.max(r.h, it.h) * 0.5);
          if (!row) { row = { y: it.y, h: it.h, parts: [] }; rows.push(row); }
          row.h = Math.max(row.h, it.h);
          row.parts.push(it);
        }
        rows.sort((a, b) => b.y - a.y);
        let prevY = null, prevH = 10;
        for (const r of rows) {
          r.parts.sort((a, b) => a.x - b.x);
          let line = '', end = null;
          for (const pt of r.parts) {
            if (end != null && pt.x - end > 1.5 && !/\s$/.test(line) && !/^\s/.test(pt.s)) line += ' ';
            line += pt.s; end = pt.x + pt.w;
          }
          const gap = prevY != null && prevY - r.y > Math.max(prevH, r.h) * 1.9;
          allLines.push({ text: line.trim(), h: r.h, gapBefore: gap, pageStart: first });
          first = false; prevY = r.y; prevH = r.h;
        }
        allLines.push({ text: '', h: 0 }); // column / page break
      }
    }
    // Pass 2: lines in a clearly bigger font than the body text are headings (recipe titles).
    const sizes = allLines.filter(l => l.text).map(l => Math.round(l.h * 2) / 2).sort((a, b) => a - b);
    const body = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 10;
    const out = [];
    for (const l of allLines) {
      if (!l.text) { out.push(''); continue; }
      if (l.gapBefore) out.push('');
      const heading = l.h >= body * 1.25 && l.text.length <= 70 && !/[.,;]$/.test(l.text) && /\p{L}/u.test(l.text);
      out.push(heading ? '# ' + l.text : l.text);
    }
    const text = out.join('\n');
    return { text, scanned: text.replace(/\s/g, '').length < 40 * doc.numPages };
  }

  async function docxText(file) {
    await loadScript(LIBS.mammoth);
    // Convert to HTML so headings survive (they mark where each recipe starts).
    const res = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    const doc = new DOMParser().parseFromString(res.value, 'text/html');
    const out = [];
    doc.body.querySelectorAll('h1,h2,h3,h4,p,li,tr').forEach(el => {
      const t = el.textContent.trim();
      if (!t) { out.push(''); return; }
      if (/^H[1-3]$/.test(el.tagName)) out.push('', '# ' + t);
      else if (el.tagName === 'P' && el.children.length === 1 && /^(STRONG|B)$/.test(el.children[0].tagName) && el.children[0].textContent.trim() === t && t.length <= 70) out.push('', '**' + t + '**');
      else if (el.tagName === 'LI') out.push('- ' + t);
      else out.push(t);
    });
    return out.join('\n');
  }

  async function ocr(fileOrCanvas, onProgress, lang) {
    await loadScript(LIBS.tesseract);
    onProgress && onProgress('Reading text from image (first time downloads the language, give it a moment)…');
    const langs = ['eng'].concat(lang && lang !== 'eng' ? [lang] : []).join('+');
    const res = await window.Tesseract.recognize(fileOrCanvas, langs, {
      logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(`Reading image… ${Math.round(m.progress * 100)}%`); }
    });
    return res.data.text;
  }

  async function pdfOcr(file, onProgress, lang) {
    await loadScript(LIBS.pdf);
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = '';
    for (let p = 1; p <= Math.min(doc.numPages, 80); p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 2 });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      onProgress && onProgress(`Scanning page ${p} of ${doc.numPages}…`);
      text += (await ocr(c, null, lang)) + '\n\n';
    }
    return text;
  }

  function htmlContent(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent);
    doc.querySelectorAll('script,style,noscript,nav,footer,header,aside,form,iframe,svg').forEach(n => n.remove());
    doc.querySelectorAll('br').forEach(n => n.replaceWith('\n'));
    doc.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,tr,section,article').forEach(n => n.append('\n'));
    doc.querySelectorAll('li').forEach(n => n.prepend('- '));
    return { ld, text: (doc.body ? doc.body.textContent : '').replace(/\n{3,}/g, '\n\n') };
  }

  function rtfText(rtf) {
    return rtf.replace(/\\par[d]?/g, '\n').replace(/\{\\\*[^}]*\}/g, '').replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '');
  }

  function toBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej; r.readAsDataURL(file);
    });
  }

  // Shrink big phone photos before sending them to Claude (API limit ~5 MB per image).
  async function imageForAI(file) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return { data: c.toDataURL('image/jpeg', 0.85).split(',')[1], mediaType: 'image/jpeg' };
    } catch (e) {
      throw new Error('This photo format can’t be opened in this browser (iPhone HEIC photos: export as JPG first).');
    }
  }

  // Reads Claude's JSON; if a very long answer got cut off, keeps every recipe that came through whole.
  function salvageRecipes(txt) {
    try { return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)).recipes || []; } catch (e) { /* fall through */ }
    const at = txt.indexOf('[', txt.indexOf('"recipes"'));
    const out = [];
    let depth = 0, inStr = false, escp = false, startObj = -1;
    for (let i = at + 1; at >= 0 && i < txt.length; i++) {
      const c = txt[i];
      if (inStr) { if (escp) escp = false; else if (c === '\\') escp = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') { if (depth++ === 0) startObj = i; }
      else if (c === '}') { if (--depth === 0) { try { out.push(JSON.parse(txt.slice(startObj, i + 1))); } catch (e) { /* skip */ } } }
    }
    if (!out.length) throw new Error('Claude’s answer couldn’t be read. Try again.');
    return out;
  }

  // ---------- Claude (optional, user's own key) ----------
  const AI_PROMPT = `Extract every recipe from the material above. It may be messy: OCR errors, broken lines, ads, stories, several recipes in one file.
Every separate dish is its own recipe in the list, even when a file holds dozens. Never merge two recipes. A sub-part of one dish (like the frosting for a cake) stays inside that dish as an ingredient group.
Return ONLY JSON, no prose, in exactly this shape:
{"recipes":[{"title":"","description":"one or two sentences or empty","servings":4,"yield":"text like '1 loaf' or empty","prepTime":"","cookTime":"","totalTime":"","ingredientGroups":[{"name":"empty string or group name like 'For the sauce'","items":["1 1/2 cups flour","2 eggs, beaten"]}],"steps":["one step per item, no numbering"],"notes":[],"tags":["e.g. dessert, chicken, vegetarian"]}]}
Also add "category": exactly one of: ${window.RecipeParser.CATEGORIES.join(', ')}.
Rules: keep the cook's original quantities and units; each ingredient item starts with its amount and unit when there is one; fix obvious OCR typos; servings is a number or null; skip anything that is not a recipe.`;

  async function aiExtract(settings, payload, onProgress) {
    onProgress && onProgress('Claude is reading your recipe…');
    const content = [];
    if (payload.images) payload.images.forEach(im => content.push({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } }));
    else if (payload.pdf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: payload.pdf } });
    else content.push({ type: 'text', text: '<material>\n' + payload.text.slice(0, 150000) + '\n</material>' });
    let prompt = AI_PROMPT;
    if (payload.images && payload.images.length > 1) prompt += '\nThe images are consecutive pages; a recipe may continue from one page onto the next.';
    prompt += settings.translate
      ? '\nTranslate everything into English (convert nothing else: keep the units as written, e.g. dkg, dl, PL). Put the original-language title in "originalTitle".'
      : '\nKeep the recipe in its original language. Do not translate.';
    content.push({ type: 'text', text: prompt });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: settings.model || 'claude-haiku-5-5', max_tokens: 32000, messages: [{ role: 'user', content }] })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('Claude: ' + ((data.error && data.error.message) || res.status));
    const txt = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return salvageRecipes(txt).map(window.RecipeParser.fromAI);
  }


  // Main entry: file → array of recipes
  async function fileToRecipes(file, settings, onProgress) {
    const P = window.RecipeParser;
    const useAI = settings.aiOn && settings.apiKey;

    if (isImage(file)) {
      if (useAI) return aiExtract(settings, { images: [await imageForAI(file)] }, onProgress);
      return P.parseText(await ocr(file, onProgress, settings.ocrLang));
    }

    if (isPdf(file)) {
      if (useAI) return aiExtract(settings, { pdf: await toBase64(file) }, onProgress);
      const { text, scanned } = await pdfText(file, onProgress);
      return P.parseText(scanned ? await pdfOcr(file, onProgress, settings.ocrLang) : text);
    }

    let text;
    const e = ext(file);
    if (e === 'docx') text = await docxText(file);
    else if (e === 'doc') throw new Error('Old .doc files can’t be read in the browser. Open it in Word or Google Docs and save as .docx or PDF.');
    else if (e === 'html' || e === 'htm') {
      const h = htmlContent(await file.text());
      const fromLd = P.parseJsonLd(h.ld);
      if (fromLd.length) return fromLd;
      text = h.text;
    } else if (e === 'json') {
      const raw = await file.text();
      const fromLd = P.parseJsonLd([raw]);
      if (fromLd.length) return fromLd;
      text = raw;
    } else if (e === 'rtf') text = rtfText(await file.text());
    else text = await file.text();

    if (useAI) return aiExtract(settings, { text }, onProgress);
    return P.parseText(text);
  }

  async function textToRecipes(text, settings, onProgress) {
    if (settings.aiOn && settings.apiKey) return aiExtract(settings, { text }, onProgress);
    if (/<\/?[a-z][\s\S]*>/i.test(text) && /<(html|body|div|p|li)\b/i.test(text)) {
      const h = htmlContent(text);
      const ld = window.RecipeParser.parseJsonLd(h.ld);
      return ld.length ? ld : window.RecipeParser.parseText(h.text);
    }
    return window.RecipeParser.parseText(text);
  }

  // Several photos that are pages of the same recipe (or a run of book pages).
  async function pagesToRecipes(files, settings, onProgress) {
    const P = window.RecipeParser;
    files = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (settings.aiOn && settings.apiKey) {
      const images = [];
      for (const f of files) {
        if (!isImage(f)) throw new Error(`${f.name} isn’t a photo. “Pages of one recipe” only works with photos.`);
        images.push(await imageForAI(f));
      }
      return aiExtract(settings, { images }, onProgress);
    }
    let text = '';
    for (let i = 0; i < files.length; i++) {
      onProgress && onProgress(`Photo ${i + 1} of ${files.length}…`);
      text += (isImage(files[i]) ? await ocr(files[i], null, settings.ocrLang) : await files[i].text()) + '\n';
    }
    const found = P.parseText(text);
    // Pages of one recipe: merge everything into the first recipe found.
    if (found.length > 1) {
      const base = found[0];
      found.slice(1).forEach(r => { base.groups.push(...r.groups); base.steps.push(...r.steps); base.notes.push(...r.notes); });
      return [base];
    }
    return found;
  }

  window.RecipeExtract = { fileToRecipes, textToRecipes, pagesToRecipes, isImage, pdfText };
})();
