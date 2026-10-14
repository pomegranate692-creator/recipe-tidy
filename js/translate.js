/* Recipe Snap — translate recipes into English on the device.
 * 1) Chrome's built-in Translator (fast, small, private) when the browser has it
 * 2) Otherwise an open translation model that runs in the browser (downloads once, then works offline)
 */
(function () {
  'use strict';
  // OCR language code → [Chrome code, NLLB code, small Opus-MT model]
  const LANGS = {
    slk: ['sk', 'slk_Latn', 'Xenova/opus-mt-cs-en'], ces: ['cs', 'ces_Latn', 'Xenova/opus-mt-cs-en'],
    pol: ['pl', 'pol_Latn', 'Xenova/opus-mt-pl-en'], hun: ['hu', 'hun_Latn', 'Xenova/opus-mt-hu-en'],
    deu: ['de', 'deu_Latn', 'Xenova/opus-mt-de-en'], fra: ['fr', 'fra_Latn', 'Xenova/opus-mt-fr-en'],
    ita: ['it', 'ita_Latn', 'Xenova/opus-mt-it-en'], spa: ['es', 'spa_Latn', 'Xenova/opus-mt-es-en'],
    por: ['pt', 'por_Latn', 'Xenova/opus-mt-ROMANCE-en'], ukr: ['uk', 'ukr_Cyrl', 'Xenova/opus-mt-uk-en'],
    rus: ['ru', 'rus_Cyrl', 'Xenova/opus-mt-ru-en'], ell: ['el', 'ell_Grek', 'Xenova/opus-mt-mul-en'],
    tur: ['tr', 'tur_Latn', 'Xenova/opus-mt-tr-en'], ara: ['ar', 'arb_Arab', 'Xenova/opus-mt-ar-en'],
    urd: ['ur', 'urd_Arab', 'Xenova/opus-mt-mul-en'], hin: ['hi', 'hin_Deva', 'Xenova/opus-mt-hi-en'],
    vie: ['vi', 'vie_Latn', 'Xenova/opus-mt-vi-en'], tgl: ['fil', 'tgl_Latn', 'Xenova/opus-mt-mul-en'],
    chi_sim: ['zh', 'zho_Hans', 'Xenova/opus-mt-zh-en'], jpn: ['ja', 'jpn_Jpan', 'Xenova/opus-mt-ja-en'],
    kor: ['ko', 'kor_Hang', 'Xenova/opus-mt-ko-en']
  };
  const NLLB = 'Xenova/nllb-200-distilled-600M';
  const SCRIPT_SRC = document.currentScript ? document.currentScript.src : location.href;
  const needs = lang => !!LANGS[lang];

  // ---- Chrome built-in Translator ----
  let chromeJob = null;
  function prepare(lang, settings) {
    // Must start while the click/drop is still "fresh" (Chrome needs a user gesture to download a language pack).
    chromeJob = null;
    if (!needs(lang) || settings.mtEngine === 'model' || !('Translator' in self)) return;
    const sourceLanguage = LANGS[lang][0];
    chromeJob = (async () => {
      const a = await self.Translator.availability({ sourceLanguage, targetLanguage: 'en' });
      if (a === 'unavailable') return null;
      return self.Translator.create({
        sourceLanguage, targetLanguage: 'en',
        monitor(m) { m.addEventListener('downloadprogress', e => chromeProgress && chromeProgress(`Downloading ${sourceLanguage}→en language pack… ${Math.round(e.loaded * 100)}%`)); }
      });
    })().catch(() => null);
  }
  let chromeProgress = null;

  // ---- In-browser model (worker) ----
  let worker = null, seq = 0;
  const pending = {};
  function getWorker() {
    if (!worker) {
      worker = new Worker(new URL('translate-worker.js', SCRIPT_SRC), { type: 'module' });
      worker.onmessage = ({ data }) => { const p = pending[data.id]; if (p) p(data); };
      worker.onerror = e => Object.values(pending).forEach(p => p({ error: 'Translation model failed to start: ' + (e.message || 'unknown error') }));
    }
    return worker;
  }
  const files = {};
  function modelTranslate(texts, lang, settings, onProgress) {
    const best = settings.mtQuality === 'best';
    const model = best ? NLLB : LANGS[lang][2];
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending[id] = d => {
        if (d.download) {
          files[d.download.file] = d.download;
          const all = Object.values(files), loaded = all.reduce((a, f) => a + (f.loaded || 0), 0), total = all.reduce((a, f) => a + (f.total || 0), 0);
          onProgress && onProgress(`Downloading translation model (one time only)… ${Math.round(loaded / 1e6)} of ${Math.round(total / 1e6)} MB`);
        } else if (d.done) onProgress && onProgress(`Translating… ${d.done} of ${d.total}`);
        else if (d.error) { delete pending[id]; reject(new Error(d.error)); }
        else if (d.result) { delete pending[id]; resolve(d.result); }
      };
      getWorker().postMessage({ id, model, texts, src: LANGS[lang][1] });
    });
  }

  async function translateStrings(texts, lang, settings, onProgress) {
    if (chromeJob) {
      chromeProgress = onProgress;
      const t = await chromeJob;
      if (t) {
        const out = [];
        for (let i = 0; i < texts.length; i++) {
          out.push(await t.translate(texts[i]));
          onProgress && onProgress(`Translating… ${i + 1} of ${texts.length}`);
        }
        return { out, engine: 'Chrome built-in translator' };
      }
    }
    const out = await modelTranslate(texts, lang, settings, onProgress);
    return { out, engine: settings.mtQuality === 'best' ? 'NLLB-200 (on device)' : 'Opus-MT (on device)' };
  }

  // Translate recipes in place. Keeps the original so the user can switch back.
  async function recipes(list, lang, settings, onProgress) {
    if (!needs(lang) || !list.length) return list;
    const P = window.RecipeParser;
    const strs = new Set();
    const add = s => { if (s && /\p{L}{2}/u.test(s)) strs.add(s); };
    for (const r of list) {
      if (r.translated) continue;
      add(r.title); add(r.description);
      r.groups.forEach(g => { add(g.name); g.items.forEach(i => add(i.name)); });
      r.steps.forEach(add); r.notes.forEach(add);
    }
    const texts = [...strs];
    if (!texts.length) return list;
    const { out, engine } = await translateStrings(texts, lang, settings, onProgress);
    const map = new Map(texts.map((t, i) => [t, (out[i] || t).trim()]));
    const tr = s => (s && map.get(s)) || s;
    for (const r of list) {
      if (r.translated) continue;
      r.original = JSON.parse(JSON.stringify({ title: r.title, description: r.description, groups: r.groups, steps: r.steps, notes: r.notes }));
      r.originalTitle = r.title;
      r.title = tr(r.title);
      r.description = tr(r.description);
      r.groups.forEach(g => { g.name = tr(g.name); g.items.forEach(i => { i.name = tr(i.name); P.toEnglishUnits(i); i.raw = [P.formatIngredient(i, 1).amount, i.name].filter(Boolean).join(' '); }); });
      r.steps = r.steps.map(tr); r.notes = r.notes.map(tr);
      r.translated = true; r.translatedBy = engine; r.lang = lang;
      if (!r.category || r.category === 'Other') r.category = P.categorize(r);
    }
    return list;
  }

  window.RecipeTranslate = { needs, prepare, recipes, LANGS };
})();
