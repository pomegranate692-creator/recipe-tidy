/* Recipe Tidy — UI */
(function () {
  'use strict';
  const P = window.RecipeParser, X = window.RecipeExtract, T = window.RecipeTranslate;
  const $ = s => document.querySelector(s);
  const KEY = 'recipeTidy.recipes.v1', SKEY = 'recipeTidy.settings.v1';

  // ---------- Storage ----------
  let memory = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return memory[k] || d; } },
    set(k, v) { memory[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { flash('Couldn’t save to this browser’s storage. Use Backup to keep a copy.', true); } }
  };
  let recipes = store.get(KEY, []);
  let settings = Object.assign({ aiOn: false, apiKey: '', model: 'claude-haiku-5-5', translate: false, ocrLang: 'eng', collection: '', mtEngine: 'auto', mtQuality: 'light' }, store.get(SKEY, {}));
  let catFilter = '', colFilter = '';
  let currentId = recipes[0] ? recipes[0].id : null;
  let factor = 1, editing = false, showOriginal = false;
  const save = () => store.set(KEY, recipes);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Helpers ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const current = () => recipes.find(r => r.id === currentId);
  let flashTimer;
  function flash(msg, isErr, sticky) {
    const el = $('#status');
    el.textContent = msg; el.className = 'status show' + (isErr ? ' err' : '');
    clearTimeout(flashTimer);
    if (!sticky) flashTimer = setTimeout(() => { el.className = 'status'; }, isErr ? 7000 : 3500);
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const slug = s => (s || 'recipe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'recipe';

  function addRecipes(list, source) {
    const collection = $('#collectionInput').value.trim();
    const added = list.map(r => Object.assign(r, { id: uid(), source: source || '', created: Date.now(), collection: r.collection || collection }));
    recipes = added.concat(recipes);
    save();
    if (added[0]) { currentId = added[0].id; factor = 1; editing = false; }
    renderList(); renderMain();
    return added.length;
  }

  // ---------- Import ----------
  // Tag language and translate (unless Claude already did it while reading).
  async function finishImport(found, lang) {
    found.forEach(r => { r.lang = lang; });
    if (!settings.translate || !T.needs(lang)) return found;
    if (settings.aiOn && settings.apiKey) {
      found.forEach(r => { r.translated = true; r.translatedBy = 'Claude'; });
      return found;
    }
    try { await T.recipes(found, lang, settings, m => flash(m, false, true)); }
    catch (e) { console.error(e); flash('Added, but translation failed: ' + e.message, true); }
    return found;
  }

  async function handleFiles(files) {
    files = [...files];
    if (!files.length) return;
    const lang = $('#ocrLang').value;
    if (settings.translate) T.prepare(lang, settings);
    let total = 0, failed = [];
    if ($('#pagesMode').checked && files.length > 1) {
      try {
        flash(`Reading ${files.length} pages…`, false, true);
        const found = await finishImport(await X.pagesToRecipes(files, settings, m => flash(m, false, true)), lang);
        if (!found.length) flash('Couldn’t find a recipe on those pages.', true);
        else { addRecipes(found, files.map(f => f.name).join(', ')); flash(`Added “${found[0].title}” ✓`); }
      } catch (e) { console.error(e); flash(e.message, true); }
      closeSidebar();
      return;
    }
    for (const f of files) {
      try {
        flash(`Reading ${f.name}…`, false, true);
        const found = await finishImport(await X.fileToRecipes(f, settings, m => flash(`${f.name}: ${m}`, false, true)), lang);
        if (!found.length) failed.push(`${f.name} (no recipe found)`);
        else total += addRecipes(found, f.name);
      } catch (e) {
        console.error(e);
        failed.push(`${f.name}: ${e.message}`);
      }
    }
    if (failed.length) flash(`${total ? `Added ${total} recipe${total > 1 ? 's' : ''}. ` : ''}Trouble with ${failed.join('; ')}`, true);
    else flash(`Added ${total} recipe${total === 1 ? '' : 's'} ✓`);
    closeSidebar();
  }

  async function handlePaste() {
    const text = $('#pasteBox').value.trim();
    if (!text) return;
    const lang = $('#ocrLang').value;
    if (settings.translate) T.prepare(lang, settings);
    try {
      const found = await finishImport(await X.textToRecipes(text, settings, m => flash(m, false, true)), lang);
      if (!found.length) return flash('Couldn’t find a recipe in that text. Make sure it has ingredients or steps.', true);
      const n = addRecipes(found, 'Pasted text');
      $('#pasteBox').value = '';
      flash(`Added ${n} recipe${n === 1 ? '' : 's'} ✓`);
      closeSidebar();
    } catch (e) { flash(e.message, true); }
  }

  // ---------- Library list ----------
  function renderList() {
    const q = $('#search').value.trim().toLowerCase();
    renderFilters();
    const items = recipes.filter(r => (!catFilter || r.category === catFilter) && (!colFilter || (r.collection || '') === colFilter)).filter(r => !q || r.title.toLowerCase().includes(q) ||
      (r.originalTitle || '').toLowerCase().includes(q) || (r.collection || '').toLowerCase().includes(q) ||
      (r.tags || []).some(t => t.toLowerCase().includes(q)) ||
      r.groups.some(g => g.items.some(i => i.name.toLowerCase().includes(q))));
    $('#count').textContent = recipes.length ? `(${recipes.length})` : '';
    $('#list').innerHTML = items.length ? items.map(r => {
      const n = r.groups.reduce((a, g) => a + g.items.length, 0);
      return `<li><button class="item${r.id === currentId ? ' active' : ''}" data-id="${r.id}">
        <span class="item-title">${esc(r.title)}</span>
        <span class="item-sub">${esc(r.category || 'Other')} · ${n} ingredient${n === 1 ? '' : 's'}${r.collection && !colFilter ? ' · ' + esc(r.collection) : ''}</span>
      </button></li>`;
    }).join('') : `<li class="muted small empty-list">${recipes.length ? 'No matches.' : 'Your recipes will show up here.'}</li>`;
  }

  function collections() {
    return [...new Set(recipes.map(r => r.collection).filter(Boolean))].sort();
  }
  function renderFilters() {
    const cols = collections();
    if (colFilter && !cols.includes(colFilter)) colFilter = '';
    const sel = $('#collectionFilter');
    sel.hidden = !cols.length;
    sel.innerHTML = `<option value="">All collections</option>` + cols.map(c => `<option${c === colFilter ? ' selected' : ''}>${esc(c)}</option>`).join('');
    $('#collectionList').innerHTML = cols.map(c => `<option value="${esc(c)}">`).join('');
    const pool = recipes.filter(r => !colFilter || (r.collection || '') === colFilter);
    const counts = {};
    pool.forEach(r => { const c = r.category || 'Other'; counts[c] = (counts[c] || 0) + 1; });
    const cats = P.CATEGORIES.filter(c => counts[c]);
    if (catFilter && !counts[catFilter]) catFilter = '';
    $('#chips').innerHTML = cats.length > 1 ? [`<button class="chip${!catFilter ? ' on' : ''}" data-cat="">All <span>${pool.length}</span></button>`]
      .concat(cats.map(c => `<button class="chip${c === catFilter ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)} <span>${counts[c]}</span></button>`)).join('') : '';
  }

  // ---------- Recipe view ----------
  function renderEmpty() {
    $('#main').innerHTML = `<div class="empty">
      <div class="empty-emoji">📄 → 🍽️</div>
      <h1>Messy recipes in, clean recipe cards out.</h1>
      <p>Drop in PDFs, Word docs, text files, photos of cookbook pages or recipe cards, or saved web pages, in almost any language. Recipe Tidy pulls out the ingredients, steps, servings and times, sorts each recipe into a category, and keeps everything in one searchable library.</p>
      <div class="row center"><button class="btn" id="sampleBtn">Try a messy sample</button>
      <label class="btn ghost" for="fileInput">Choose files</label></div>
      <p class="small muted">Everything stays in your browser. Nothing is uploaded unless you turn on AI reading in Settings.</p>
    </div>`;
    $('#sampleBtn').onclick = () => { addRecipes(P.parseText(SAMPLE).map(r => Object.assign(r, { collection: 'Samples' })), 'Sample'); flash('Added sample recipes ✓'); };
  }

  function renderMain() {
    const live = current();
    if (!live) return renderEmpty();
    if (editing) return renderEdit(live);
    const r = showOriginal && live.original ? Object.assign({}, live, live.original) : live;
    const canTranslate = !live.translated && T.needs(live.lang || $('#ocrLang').value);
    const meta = [];
    if (r.times.prep) meta.push(['Prep', r.times.prep]);
    if (r.times.cook) meta.push(['Cook', r.times.cook]);
    if (r.times.total) meta.push(['Total', r.times.total]);
    if (r.yieldText && !r.servings) meta.push(['Yield', r.yieldText]);
    const serv = r.servings ? Math.round(r.servings * factor * 100) / 100 : null;
    const fLabel = P.formatQty(factor) + '×';

    $('#main').innerHTML = `<article class="card" id="card">
      <div class="card-head">
        ${(r.tags || []).length ? `<div class="tags">${r.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <h1 class="title">${esc(r.title)}</h1>
        ${live.originalTitle && !showOriginal ? `<p class="orig">${esc(live.originalTitle)}</p>` : ''}
        ${live.translated ? `<p class="translated-note no-print">${showOriginal ? 'Showing the original' : `Translated by ${esc(live.translatedBy || 'machine translation')}. Double check anything that looks odd.`}</p>` : ''}
        <div class="filing no-print">
          <label>Category <select data-field="category">${P.CATEGORIES.map(c => `<option${c === r.category ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <label>Collection <input data-field="collection" list="collectionList" value="${esc(r.collection || '')}" placeholder="None"></label>
        </div>
        ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}
        ${meta.length ? `<div class="meta">${meta.map(m => `<div><span>${m[0]}</span><b>${esc(m[1])}</b></div>`).join('')}</div>` : ''}
      </div>

      <div class="toolbar no-print">
        <div class="scaler" aria-label="Scale recipe">
          <button class="icon-btn" data-act="minus" aria-label="Less">−</button>
          <div class="scale-val">${serv != null ? `<b>${serv}</b> serving${serv === 1 ? '' : 's'}` : `<b>${fLabel}</b> batch`}</div>
          <button class="icon-btn" data-act="plus" aria-label="More">+</button>
          ${factor !== 1 ? `<button class="btn ghost small" data-act="reset">Reset</button>` : ''}
        </div>
        <div class="actions">
          ${live.original ? `<button class="btn ghost small" data-act="orig">${showOriginal ? 'Show English' : 'Show original'}</button>` : ''}
          ${canTranslate ? `<button class="btn ghost small" data-act="translate">🌐 Translate</button>` : ''}
          <button class="btn ghost small" data-act="edit">✎ Edit</button>
          <button class="btn ghost small" data-act="print">⎙ Print</button>
          <button class="btn ghost small" data-act="md">⤓ Export</button>
          <button class="btn ghost small danger" data-act="delete">Delete</button>
        </div>
      </div>
      ${factor !== 1 ? `<p class="print-only small">Scaled ${fLabel}</p>` : ''}

      <div class="cols">
        <section class="ings">
          <h2>Ingredients</h2>
          ${r.groups.map((g, gi) => `
            ${g.name ? `<h3>${esc(g.name)}</h3>` : ''}
            <ul>${g.items.map((i, ii) => {
              const f = P.formatIngredient(i, factor);
              return `<li><label><input type="checkbox" class="no-print"><span><b>${esc(f.amount)}</b> ${esc(f.name)}</span></label></li>`;
            }).join('')}</ul>`).join('') || '<p class="muted">No ingredients found. Use Edit to add them.</p>'}
        </section>
        <section class="steps">
          <h2>Directions</h2>
          <ol>${r.steps.map(s => `<li tabindex="0">${esc(s)}</li>`).join('') || '<p class="muted">No steps found. Use Edit to add them.</p>'}</ol>
          ${r.notes.length ? `<div class="notes"><h2>Notes</h2><ul>${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
        </section>
      </div>
      ${r.source ? `<p class="source small muted">From ${esc(r.source)}</p>` : ''}
    </article>`;
  }

  function renderEdit(r) {
    $('#main').innerHTML = `<article class="card edit">
      <h1 class="title">Edit recipe</h1>
      <p class="small muted">Fix anything that came out wrong. Keep the <b>Ingredients</b> and <b>Directions</b> headings, one ingredient or step per line. Lines ending in a colon (like “For the sauce:”) become ingredient groups.</p>
      <label class="small">Tags (comma separated)<input type="text" id="editTags" value="${esc((r.tags || []).join(', '))}"></label>
      <textarea id="editBox" spellcheck="true">${esc(P.toEditableText(r))}</textarea>
      <div class="row end">
        <button class="btn ghost" data-act="cancel">Cancel</button>
        <button class="btn" data-act="saveEdit">Save</button>
      </div>
    </article>`;
    const box = $('#editBox');
    box.style.height = Math.max(380, box.scrollHeight + 10) + 'px';
  }

  function stepFactor(dir) {
    const r = current();
    if (r && r.servings) {
      const s = Math.max(1, Math.round(r.servings * factor) + dir);
      factor = s / r.servings;
    } else {
      const steps = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
      let i = steps.findIndex(v => v >= factor - 1e-9);
      if (i < 0) i = steps.length - 1;
      if (steps[i] !== factor && dir < 0) i++;
      factor = steps[Math.min(steps.length - 1, Math.max(0, i + dir))];
    }
    renderMain();
  }

  $('#main').addEventListener('click', e => {
    const li = e.target.closest('.steps ol li');
    if (li) { li.classList.toggle('done'); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const r = current();
    switch (b.dataset.act) {
      case 'minus': return stepFactor(-1);
      case 'plus': return stepFactor(1);
      case 'reset': factor = 1; return renderMain();
      case 'orig': showOriginal = !showOriginal; return renderMain();
      case 'translate': {
        const lang = T.needs(r.lang) ? r.lang : $('#ocrLang').value;
        T.prepare(lang, settings); // start now, while the click still counts as a user gesture
        b.disabled = true;
        flash('Translating…', false, true);
        T.recipes([r], lang, settings, m => flash(m, false, true))
          .then(() => { save(); renderList(); renderMain(); flash('Translated ✓'); })
          .catch(e => { console.error(e); flash('Translation failed: ' + e.message, true); renderMain(); });
        return;
      }
      case 'print': return window.print();
      case 'md': return download(slug(r.title) + '.md', P.toMarkdown(r, factor), 'text/markdown');
      case 'edit': editing = true; showOriginal = false; return renderMain();
      case 'cancel': editing = false; return renderMain();
      case 'saveEdit': {
        const lines = $('#editBox').value.replace(/\r\n?/g, '\n').split('\n').map(s => s.trim());
        const parsed = P.parseBlock(lines);
        Object.assign(r, parsed, { id: r.id, source: r.source, created: r.created, collection: r.collection, originalTitle: r.originalTitle, original: r.original, translated: r.translated, translatedBy: r.translatedBy, lang: r.lang, category: r.category && r.category !== 'Other' ? r.category : parsed.category });
        r.tags = $('#editTags').value.split(',').map(s => s.trim()).filter(Boolean);
        save(); editing = false; factor = 1; renderList(); renderMain(); flash('Saved ✓');
        return;
      }
      case 'delete':
        if (!confirm(`Delete “${r.title}”?`)) return;
        recipes = recipes.filter(x => x.id !== r.id); save();
        currentId = recipes[0] ? recipes[0].id : null; factor = 1;
        renderList(); renderMain(); return;
    }
  });
  $('#main').addEventListener('change', e => {
    const f = e.target.dataset && e.target.dataset.field;
    if (!f) return;
    const r = current();
    r[f] = e.target.value.trim();
    save(); renderList(); flash('Saved ✓');
  });
  $('#main').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.steps ol li')) { e.preventDefault(); e.target.classList.toggle('done'); }
  });

  // ---------- Sidebar / list events ----------
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('.item');
    if (!b) return;
    currentId = b.dataset.id; factor = 1; editing = false; showOriginal = false;
    renderList(); renderMain(); closeSidebar(); window.scrollTo(0, 0);
  });
  $('#search').addEventListener('input', renderList);
  $('#chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { catFilter = b.dataset.cat; renderList(); } });
  $('#collectionFilter').addEventListener('change', e => { colFilter = e.target.value; renderList(); });
  $('#collectionInput').value = settings.collection || '';
  $('#ocrLang').value = settings.ocrLang || 'eng';
  $('#translateImport').checked = !!settings.translate;
  $('#translateImport').addEventListener('change', e => { settings.translate = e.target.checked; store.set(SKEY, settings); });
  const keepImport = () => { settings.collection = $('#collectionInput').value.trim(); settings.ocrLang = $('#ocrLang').value; store.set(SKEY, settings); };
  $('#collectionInput').addEventListener('change', keepImport);
  $('#ocrLang').addEventListener('change', keepImport);
  $('#fileInput').addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });
  $('#pasteBtn').addEventListener('click', handlePaste);

  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || !e.relatedTarget) drop.classList.remove('over'); }));
  document.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

  $('#exportAllBtn').addEventListener('click', () => {
    if (!recipes.length) return flash('Nothing to back up yet.', true);
    download(`recipe-tidy-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'recipe-tidy', version: 1, recipes }, null, 2), 'application/json');
  });
  $('#restoreInput').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const list = (data.recipes || []).filter(r => r && r.title && Array.isArray(r.groups));
      const have = new Set(recipes.map(r => r.id));
      const fresh = list.filter(r => !have.has(r.id));
      recipes = fresh.concat(recipes); save();
      if (!currentId && recipes[0]) currentId = recipes[0].id;
      renderList(); renderMain(); flash(`Restored ${fresh.length} recipe${fresh.length === 1 ? '' : 's'} ✓`);
    } catch (err) { flash('That doesn’t look like a Recipe Tidy backup.', true); }
  });

  const sidebar = $('#sidebar'), scrim = $('#scrim');
  function closeSidebar() { sidebar.classList.remove('open'); scrim.classList.remove('show'); }
  $('#menuBtn').addEventListener('click', () => { sidebar.classList.add('open'); scrim.classList.add('show'); });
  scrim.addEventListener('click', closeSidebar);

  // ---------- Settings ----------
  const dlg = $('#settings');
  $('#settingsBtn').addEventListener('click', () => {
    $('#mtEngine').value = settings.mtEngine || 'auto'; $('#mtQuality').value = settings.mtQuality || 'light';
    $('#aiOn').checked = !!settings.aiOn; $('#apiKey').value = settings.apiKey; $('#model').value = settings.model;
    dlg.showModal();
  });
  $('#saveSettings').addEventListener('click', () => {
    Object.assign(settings, { aiOn: $('#aiOn').checked, mtEngine: $('#mtEngine').value, mtQuality: $('#mtQuality').value, apiKey: $('#apiKey').value.trim(), model: $('#model').value.trim() || 'claude-haiku-5-5' });
    store.set(SKEY, settings);
    if (settings.aiOn && !settings.apiKey) flash('AI reading needs an API key. Using built-in rules for now.', true);
  });
  $('#wipeBtn').addEventListener('click', () => {
    if (!confirm('Delete every recipe in this browser? Make a backup first if you want to keep them.')) return;
    recipes = []; save(); currentId = null; dlg.close(); renderList(); renderMain();
  });

  const SAMPLE = `GRANDMA'S BANANA BREAD
The one from the stained index card.
Serves 8   Prep time: 15 mins  Bake time: 1 hour

Ingredients:
• 3 ripe bananas, mashed
• 1/3 cup melted butter
• 1 tsp baking soda
• pinch of salt
• 3/4 cup sugar
• 1 large egg, beaten
• 1 tsp vanilla
• 1 ½ cups all-purpose flour

Directions
1. Preheat oven to 350°F (175°C) and grease a 4x8 inch
loaf pan.
2. In a mixing bowl, mash the bananas with a fork. Mix in the melted butter.
3. Mix in the baking soda and salt. Stir in the sugar, beaten egg, and vanilla. Mix in the flour.
4. Pour batter into the pan. Bake for 1 hour, until a tester comes out clean.

Notes
Freezes well for up to 3 months.

Chicken Tacos
Makes 4 servings
Ingredients
For the chicken:
2 lbs boneless chicken thighs
2 T olive oil
1-2 tsp chili powder
For the salsa:
2 tomatoes, diced
1/2 red onion, finely chopped
1 lime, juiced
salt to taste
Instructions
Season the chicken with chili powder and salt, then sear in olive oil for 6 minutes per side.
Stir together the tomatoes, onion, lime juice and a pinch of salt.
Slice the chicken and serve in warm tortillas with the salsa.`;

  renderList(); renderMain();

  // Installable app (home screen) + offline support
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e)));
  }
})();
