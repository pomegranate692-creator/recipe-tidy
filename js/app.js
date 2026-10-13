/* Recipe Tidy — UI. Screens: home, add, recipe, edit, settings (switched with the address #hash so the phone's back gesture works). */
(function () {
  'use strict';
  const P = window.RecipeParser, X = window.RecipeExtract, T = window.RecipeTranslate;
  const $ = s => document.querySelector(s);
  const KEY = 'recipeTidy.recipes.v1', SKEY = 'recipeTidy.settings.v1';

  // ---------- Storage ----------
  const memory = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return memory[k] || d; } },
    set(k, v) { memory[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Your phone is out of space for recipes. Please save a backup in Settings.', true); } }
  };
  let recipes = store.get(KEY, []);
  let settings = Object.assign({
    aiOn: false, apiKey: '', model: 'claude-haiku-5-5', translate: true, ocrLang: 'eng', collection: '',
    mtEngine: 'auto', mtQuality: 'light', textSize: 'normal'
  }, store.get(SKEY, {}));
  const saveRecipes = () => store.set(KEY, recipes);
  const saveSettings = () => store.set(SKEY, settings);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // Screen state
  let catFilter = '', colFilter = '', query = '';
  let factor = 1, showOriginal = false, lastRecipeId = null, pasteOpen = false;

  // ---------- Helpers ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const byId = id => recipes.find(r => r.id === id);
  const go = hash => { if (location.hash === hash || (hash === '#' && !location.hash)) route(); else location.hash = hash; };
  let toastTimer;
  function toast(msg, isErr) {
    const el = $('#toast');
    el.textContent = msg; el.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, isErr ? 6000 : 3000);
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const slug = s => (s || 'recipe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'recipe';
  const collections = () => [...new Set(recipes.map(r => r.collection).filter(Boolean))].sort();

  const CAT_ICON = {
    'Breakfast': '🥞', 'Soups & stews': '🍲', 'Salads': '🥗', 'Main dishes': '🍗', 'Sides': '🥔',
    'Breads & baking': '🍞', 'Desserts': '🍰', 'Sauces & dips': '🥣', 'Snacks & appetizers': '🧀',
    'Drinks': '🥤', 'Preserves': '🫙', 'Other': '🍽️'
  };
  const icon = c => CAT_ICON[c] || '🍽️';

  const LANGS = [['eng', 'English'], ['slk', 'Slovak'], ['ces', 'Czech'], ['pol', 'Polish'], ['hun', 'Hungarian'], ['deu', 'German'],
    ['fra', 'French'], ['ita', 'Italian'], ['spa', 'Spanish'], ['por', 'Portuguese'], ['ukr', 'Ukrainian'], ['rus', 'Russian'],
    ['ell', 'Greek'], ['tur', 'Turkish'], ['ara', 'Arabic'], ['urd', 'Urdu'], ['hin', 'Hindi'], ['vie', 'Vietnamese'],
    ['tgl', 'Tagalog'], ['chi_sim', 'Chinese'], ['jpn', 'Japanese'], ['kor', 'Korean']];
  const langName = code => (LANGS.find(l => l[0] === code) || [code, code])[1];

  function applyTextSize() { document.documentElement.dataset.size = settings.textSize || 'normal'; }

  // ---------- Overlay (working / done / problem / question) ----------
  const overlay = $('#overlay'), card = $('#overlayCard');
  function showOverlay(html) { card.innerHTML = html; overlay.hidden = false; const f = card.querySelector('button'); if (f) f.focus({ preventScroll: true }); card.scrollTop = 0; }
  function hideOverlay() { overlay.hidden = true; card.innerHTML = ''; }
  function working(detail) {
    if (overlay.hidden || !card.querySelector('.spinner')) {
      showOverlay(`<div class="spinner" aria-hidden="true"></div>
        <h2>Reading your recipe…</h2>
        <p class="work-detail" id="workDetail"></p>
        <p class="muted">This can take up to a minute. Please keep this screen open.</p>`);
    }
    const d = $('#workDetail'); if (d) d.textContent = detail || '';
  }
  function ask(title, text, choices) {
    return new Promise(resolve => {
      showOverlay(`<h2>${title}</h2>${text ? `<p>${text}</p>` : ''}
        <div class="choice-list">${choices.map((c, i) => `<button class="big-choice" data-i="${i}"><span class="bc-icon">${c.icon}</span><span><b>${c.label}</b>${c.sub ? `<small>${c.sub}</small>` : ''}</span></button>`).join('')}</div>`);
      card.onclick = e => { const b = e.target.closest('[data-i]'); if (b) { card.onclick = null; resolve(choices[+b.dataset.i].value); } };
    });
  }

  // ---------- Adding recipes ----------
  function addRecipes(list, source) {
    const collection = (settings.collection || '').trim();
    const added = list.map(r => Object.assign(r, { id: uid(), source: source || '', created: Date.now(), collection: r.collection || collection }));
    recipes = added.concat(recipes);
    saveRecipes();
    return added;
  }

  async function finishImport(found, lang) {
    found.forEach(r => { r.lang = lang; });
    if (!settings.translate || !T.needs(lang)) return { found };
    if (settings.aiOn && settings.apiKey) { found.forEach(r => { r.translated = true; r.translatedBy = 'Claude'; }); return { found }; }
    try { await T.recipes(found, lang, settings, working); return { found }; }
    catch (e) { console.error(e); return { found, translateError: e.message }; }
  }

  function showDone(added, problems, translateError) {
    if (!added.length) return showProblem(problems);
    const one = added.length === 1;
    showOverlay(`<div class="big-icon" aria-hidden="true">✅</div>
      <h2>${one ? 'Recipe added!' : `${added.length} recipes added!`}</h2>
      ${added.length > 1 ? `<p>We split it into separate recipes and sorted them for you:</p>
      <div class="sorted">${P.CATEGORIES.filter(c => added.some(r => r.category === c)).map(c => `<span>${icon(c)} ${esc(c)} <b>${added.filter(r => r.category === c).length}</b></span>`).join('')}</div>` : ''}
      ${added.length <= 4 ? `<ul class="added-list">${added.map(r => `<li>${icon(r.category)} ${esc(r.title)}</li>`).join('')}</ul>` : ''}
      ${translateError ? `<p class="warn">We saved it, but couldn't translate it right now. Open the recipe and tap <b>Translate to English</b> to try again.</p>` : ''}
      ${problems.length ? `<p class="warn">Some files didn't work: ${esc(problems.join(', '))}</p>` : ''}
      <p class="muted">Check it over. If anything looks wrong, tap <b>Fix mistakes</b> on the recipe.</p>
      <div class="stack">
        <button class="btn primary big" id="openAdded">${one ? 'Open the recipe' : 'See my recipes'}</button>
        <button class="btn big" id="addAnother">Add another recipe</button>
      </div>`);
    $('#openAdded').onclick = () => { hideOverlay(); go(one ? '#r/' + added[0].id : '#'); };
    $('#addAnother').onclick = () => { hideOverlay(); go('#add'); };
  }

  function showProblem(problems) {
    if ((problems || []).some(p => /internet|fetch|network|load a helper/i.test(p))) {
      showOverlay(`<div class="big-icon" aria-hidden="true">📶</div>
        <h2>Please connect to the internet</h2>
        <p>The first time you add a photo or file, the app downloads its recipe reader. After that it works without internet.</p>
        <p>Connect to Wi-Fi and try again.</p>
        <div class="stack"><button class="btn primary big" id="tryAgain">Try again</button></div>`);
      $('#tryAgain').onclick = () => { hideOverlay(); go('#add'); };
      return;
    }
    showOverlay(`<div class="big-icon" aria-hidden="true">🤔</div>
      <h2>We couldn't find a recipe there</h2>
      ${problems && problems.length ? `<p class="muted small">${esc(problems.join(', '))}</p>` : ''}
      <p><b>Tips for a good photo:</b></p>
      <ul class="tips">
        <li>Lay the page flat in good light</li>
        <li>Get the whole recipe in the picture</li>
        <li>Hold the phone straight above the page</li>
        <li>Check the language is set right</li>
      </ul>
      <div class="stack">
        <button class="btn primary big" id="tryAgain">Try again</button>
        <button class="btn big" id="typeInstead">Type it in instead</button>
      </div>`);
    $('#tryAgain').onclick = () => { hideOverlay(); go('#add'); };
    $('#typeInstead').onclick = () => { hideOverlay(); pasteOpen = true; go('#add'); setTimeout(() => { const t = $('#pasteBox'); if (t) t.focus(); }, 50); };
  }

  async function handleFiles(files) {
    files = [...files];
    if (!files.length) return;
    const lang = settings.ocrLang;
    if (settings.translate) T.prepare(lang, settings); // must start right after the tap
    const photos = files.filter(X.isImage);
    let asPages = false;
    if (photos.length > 1 && photos.length === files.length) {
      asPages = await ask(`You picked ${photos.length} photos`, 'What are they?', [
        { icon: '📖', label: 'One recipe', sub: 'The recipe goes across several pages', value: true },
        { icon: '📚', label: 'Different recipes', sub: 'Each photo is its own recipe', value: false }
      ]);
    }
    working('Getting started…');
    const added = [], problems = [];
    let translateError = '';
    try {
      if (asPages) {
        const res = await finishImport(await X.pagesToRecipes(files, settings, working), lang);
        if (res.found.length) added.push(...addRecipes(res.found, files.map(f => f.name).join(', ')));
        translateError = res.translateError || '';
      } else {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const prefix = files.length > 1 ? `File ${i + 1} of ${files.length}: ` : '';
          try {
            working(prefix + 'opening…');
            const res = await finishImport(await X.fileToRecipes(f, settings, m => working(prefix + m)), lang);
            if (!res.found.length) problems.push(f.name);
            else added.push(...addRecipes(res.found, f.name));
            translateError = translateError || res.translateError || '';
          } catch (e) { console.error(e); problems.push(`${f.name} (${e.message})`); }
        }
      }
    } catch (e) { console.error(e); problems.push(e.message); }
    showDone(added, problems, translateError);
  }

  async function handlePaste() {
    const text = ($('#pasteBox').value || '').trim();
    if (!text) { toast('Type or paste the recipe in the box first.', true); return; }
    const lang = settings.ocrLang;
    if (settings.translate) T.prepare(lang, settings);
    working('Tidying it up…');
    try {
      const res = await finishImport(await X.textToRecipes(text, settings, working), lang);
      if (!res.found.length) return showOverlay(`<div class="big-icon">🤔</div><h2>We couldn't spot a recipe</h2>
        <p>Make sure it has a list of ingredients and the steps. Putting the word <b>Ingredients</b> above the list and <b>Steps</b> above the steps helps a lot.</p>
        <div class="stack"><button class="btn primary big" onclick="document.getElementById('overlay').hidden=true">OK</button></div>`);
      pasteOpen = false;
      showDone(addRecipes(res.found, 'Typed in'), [], res.translateError);
    } catch (e) { console.error(e); showProblem([e.message]); }
  }

  // ---------- Screens ----------
  const app = $('#app');
  function setHeader(back) {
    $('#backBtn').hidden = !back;
    $('#brand').hidden = !!back;
    if (back) $('#backLabel').textContent = back.label;
    $('#backBtn').onclick = () => go(back ? back.to : '#');
    $('#settingsBtn').hidden = location.hash === '#settings';
  }

  function route() {
    const h = location.hash.slice(1);
    hideOverlayIfIdle();
    window.scrollTo(0, 0);
    if (h === 'add') return renderAdd();
    if (h === 'settings') return renderSettings();
    if (h.startsWith('r/')) return renderRecipe(h.slice(2));
    if (h.startsWith('edit/')) return renderEdit(h.slice(5));
    renderHome();
  }
  function hideOverlayIfIdle() { if (!overlay.hidden && !card.querySelector('.spinner')) hideOverlay(); }

  // ----- Home -----
  function renderHome() {
    setHeader(null);
    if (!recipes.length) return renderWelcome();
    const cols = collections();
    if (colFilter && !cols.includes(colFilter)) colFilter = '';
    const pool = recipes.filter(r => !colFilter || r.collection === colFilter);
    const counts = {};
    pool.forEach(r => { const c = r.category || 'Other'; counts[c] = (counts[c] || 0) + 1; });
    if (catFilter && !counts[catFilter]) catFilter = '';
    const q = query.trim().toLowerCase();
    const items = pool.filter(r => (!catFilter || (r.category || 'Other') === catFilter) && (!q ||
      r.title.toLowerCase().includes(q) || (r.originalTitle || '').toLowerCase().includes(q) ||
      (r.collection || '').toLowerCase().includes(q) ||
      r.groups.some(g => g.items.some(i => i.name.toLowerCase().includes(q)))));

    app.innerHTML = `
      <button class="add-hero" data-go="#add">
        <span class="add-plus" aria-hidden="true">+</span>
        <span><b>Add a recipe</b><small>Take a photo or choose a file</small></span>
      </button>

      <label class="search">
        <span class="sr">Find a recipe</span>
        <span aria-hidden="true" class="search-icon">🔍</span>
        <input type="search" id="search" placeholder="Find a recipe or ingredient" value="${esc(query)}" autocomplete="off">
      </label>

      ${cols.length ? `<section class="section">
        <h2 class="label">Cookbooks</h2>
        <div class="pills">
          <button class="pill${!colFilter ? ' on' : ''}" data-col="">All recipes</button>
          ${cols.map(c => `<button class="pill${c === colFilter ? ' on' : ''}" data-col="${esc(c)}">📖 ${esc(c)}</button>`).join('')}
        </div>
      </section>` : ''}

      ${Object.keys(counts).length > 1 ? `<section class="section">
        <h2 class="label">Type of dish</h2>
        <div class="cat-grid">
          <button class="cat${!catFilter ? ' on' : ''}" data-cat=""><span class="cat-icon">🍴</span><span>All</span><small>${pool.length}</small></button>
          ${P.CATEGORIES.filter(c => counts[c]).map(c => `<button class="cat${c === catFilter ? ' on' : ''}" data-cat="${esc(c)}"><span class="cat-icon">${icon(c)}</span><span>${esc(c)}</span><small>${counts[c]}</small></button>`).join('')}
        </div>
      </section>` : ''}

      <section class="section">
        <h2 class="label">${catFilter ? esc(catFilter) : colFilter ? esc(colFilter) : 'All my recipes'} <span class="count">(${items.length})</span></h2>
        ${items.length ? `<ul class="recipe-list">${items.map(r => `<li><button class="recipe-row" data-go="#r/${r.id}">
            <span class="row-icon" aria-hidden="true">${icon(r.category)}</span>
            <span class="row-text"><b>${esc(r.title)}</b><small>${esc(r.category || 'Other')}${r.collection ? ' · ' + esc(r.collection) : ''}</small></span>
            <span class="row-arrow" aria-hidden="true">›</span>
          </button></li>`).join('')}</ul>`
        : `<p class="empty-note">No recipes match${q ? ` “${esc(query)}”` : ''}. ${q || catFilter ? '<button class="link" id="clearFilters">Show all recipes</button>' : ''}</p>`}
      </section>`;

    const s = $('#search');
    s.oninput = () => { query = s.value; const pos = s.selectionStart; renderHome(); const n = $('#search'); n.focus(); n.setSelectionRange(pos, pos); };
    const clr = $('#clearFilters'); if (clr) clr.onclick = () => { query = ''; catFilter = ''; renderHome(); };
  }

  function renderWelcome() {
    app.innerHTML = `<section class="welcome">
      <h1>Welcome! 👋</h1>
      <p class="lead">Keep all your recipes in one tidy place. Here's how it works:</p>
      <ol class="how">
        <li><span class="how-num">1</span><span><b>Tap “Add a recipe”</b><small>The big orange button</small></span></li>
        <li><span class="how-num">2</span><span><b>Take a photo of a recipe</b><small>A cookbook page, a recipe card, or a file you already have</small></span></li>
        <li><span class="how-num">3</span><span><b>We tidy it up for you</b><small>Ingredients and steps, neat and easy to read, saved here for next time</small></span></li>
      </ol>
      <button class="add-hero" data-go="#add">
        <span class="add-plus" aria-hidden="true">+</span>
        <span><b>Add a recipe</b><small>Take a photo or choose a file</small></span>
      </button>
      <button class="btn big ghost full" id="sampleBtn">Show me an example first</button>
      <p class="muted small center">Your recipes stay on this device. Nothing is shared.</p>
    </section>`;
    $('#sampleBtn').onclick = () => {
      const added = addRecipes(P.parseText(SAMPLE).map(r => Object.assign(r, { collection: 'Examples' })), 'Example');
      toast('Here are 2 example recipes. Tap one to open it.');
      renderHome(); window.scrollTo(0, 0);
      return added;
    };
  }

  // ----- Add -----
  function renderAdd() {
    setHeader({ label: 'Back', to: '#' });
    const isEng = settings.ocrLang === 'eng';
    const cols = collections();
    app.innerHTML = `<section class="add">
      <h1>Add a recipe</h1>

      <div class="q">
        <h2 class="q-title"><span class="q-num">1</span><span>What language is the recipe in?</span></h2>
        <div class="seg" role="radiogroup">
          <button class="seg-btn${isEng ? ' on' : ''}" data-lang="eng" role="radio" aria-checked="${isEng}">English</button>
          <button class="seg-btn${!isEng ? ' on' : ''}" data-lang="other" role="radio" aria-checked="${!isEng}">Another language</button>
        </div>
        <div class="other-lang" ${isEng ? 'hidden' : ''}>
          <label class="field"><span>Which language?</span>
            <select id="langSelect">${LANGS.filter(l => l[0] !== 'eng').map(l => `<option value="${l[0]}"${l[0] === settings.ocrLang ? ' selected' : ''}>${l[1]}</option>`).join('')}</select>
          </label>
          <label class="switch"><input type="checkbox" id="translateToggle" ${settings.translate ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Translate it into English for me</span></label>
        </div>
      </div>

      <div class="q">
        <h2 class="q-title"><span class="q-num">2</span><span>Put it in a cookbook? <span class="optional">(you can skip this)</span></span></h2>
        <p class="hint">A cookbook keeps recipes together, like “Mom's recipes” or “Holiday baking”.</p>
        <input type="text" id="cookbookInput" list="cookbookList" value="${esc(settings.collection)}" placeholder="Type a name, or leave empty">
        <datalist id="cookbookList">${cols.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
        ${cols.length ? `<div class="pills small-pills">${cols.map(c => `<button class="pill" data-cookbook="${esc(c)}">📖 ${esc(c)}</button>`).join('')}</div>` : ''}
      </div>

      <div class="q">
        <h2 class="q-title"><span class="q-num">3</span><span>Add your recipe</span></h2>
        <div class="choice-list">
          <button class="big-choice primary-choice" id="takePhoto"><span class="bc-icon">📷</span><span><b>Take a photo</b><small>Point your camera at the recipe</small></span></button>
          <button class="big-choice" id="chooseFile"><span class="bc-icon">🖼️</span><span><b>Choose photos or files</b><small>From your photos, or a PDF or Word document</small></span></button>
          <button class="big-choice" id="typeIt"><span class="bc-icon">⌨️</span><span><b>Type or paste it</b><small>Copy the recipe from a website or message</small></span></button>
        </div>
        <div class="paste" ${pasteOpen ? '' : 'hidden'}>
          <label class="field"><span>Your recipe</span>
            <textarea id="pasteBox" rows="9" placeholder="Paste or type the recipe here.&#10;&#10;Example:&#10;Pancakes&#10;Ingredients&#10;1 cup flour&#10;1 egg&#10;Steps&#10;Mix everything and cook in a hot pan."></textarea>
          </label>
          <button class="btn primary big full" id="pasteBtn">Add this recipe</button>
        </div>
        <p class="hint drop-hint">On a computer you can also drag files onto this page.</p>
      </div>
    </section>`;

    app.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
      const other = b.dataset.lang === 'other';
      settings.ocrLang = other ? (settings.lastOtherLang || 'slk') : 'eng';
      saveSettings(); renderAdd();
    });
    const ls = $('#langSelect');
    if (ls) ls.onchange = () => { settings.ocrLang = settings.lastOtherLang = ls.value; saveSettings(); };
    const tt = $('#translateToggle');
    if (tt) tt.onchange = () => { settings.translate = tt.checked; saveSettings(); };
    const cb = $('#cookbookInput');
    cb.oninput = () => { settings.collection = cb.value.trim(); saveSettings(); };
    app.querySelectorAll('[data-cookbook]').forEach(b => b.onclick = () => { cb.value = b.dataset.cookbook; cb.oninput(); toast(`Will go in “${b.dataset.cookbook}”`); });
    $('#takePhoto').onclick = () => $('#cameraInput').click();
    $('#chooseFile').onclick = () => $('#fileInput').click();
    $('#typeIt').onclick = () => { pasteOpen = true; app.querySelector('.paste').hidden = false; $('#pasteBox').focus(); };
    $('#pasteBtn').onclick = handlePaste;
  }

  // ----- Recipe -----
  function renderRecipe(id) {
    const live = byId(id);
    if (!live) return go('#');
    if (lastRecipeId !== id) { factor = 1; showOriginal = false; lastRecipeId = id; }
    setHeader({ label: 'My recipes', to: '#' });
    const r = showOriginal && live.original ? Object.assign({}, live, live.original) : live;
    const canTranslate = !live.translated && T.needs(live.lang);
    const times = [];
    if (r.times.prep) times.push(['⏱️', 'Prep', r.times.prep]);
    if (r.times.cook) times.push(['🔥', 'Cook', r.times.cook]);
    if (r.times.total) times.push(['⏰', 'Total', r.times.total]);
    const serv = r.servings ? Math.round(r.servings * factor * 100) / 100 : null;
    const nIngs = r.groups.reduce((a, g) => a + g.items.length, 0);

    app.innerHTML = `<article class="recipe" id="card">
      <p class="recipe-cat no-print">${icon(r.category)} ${esc(r.category || 'Other')}${r.collection ? ` · 📖 ${esc(r.collection)}` : ''}</p>
      <h1 class="title">${esc(r.title)}</h1>
      ${live.originalTitle && !showOriginal ? `<p class="orig">${esc(langName(live.lang))}: ${esc(live.originalTitle)}</p>` : ''}
      ${live.translated ? `<div class="notice no-print">${showOriginal
        ? `Showing the original ${esc(langName(live.lang))} recipe. <button class="link" data-act="orig">Show in English</button>`
        : `🌐 Translated into English by computer. Some words might be a little off. <button class="link" data-act="orig">Show the original</button>`}</div>` : ''}
      ${canTranslate ? `<div class="notice no-print">This recipe is in ${esc(langName(live.lang))}. <button class="btn primary" data-act="translate">🌐 Translate to English</button></div>` : ''}
      ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}
      ${times.length ? `<div class="times">${times.map(t => `<div><span aria-hidden="true">${t[0]}</span><small>${t[1]}</small><b>${esc(t[2])}</b></div>`).join('')}</div>` : ''}

      <div class="scaler no-print">
        <p class="scaler-label">${serv != null ? 'How many people are you cooking for?' : 'Make more or less'}</p>
        <div class="scaler-row">
          <button class="round" data-act="minus" aria-label="Less">−</button>
          <div class="scale-val">${serv != null ? `<b>${serv}</b><small>${serv === 1 ? 'person' : 'people'}</small>` : `<b>${P.formatQty(factor)}×</b><small>the recipe</small>`}</div>
          <button class="round" data-act="plus" aria-label="More">+</button>
        </div>
        ${factor !== 1 ? `<p class="scaler-note">Amounts below are changed to match. <button class="link" data-act="reset">Go back to the original amounts</button></p>` : ''}
      </div>
      ${factor !== 1 ? `<p class="print-only">${serv != null ? `Makes ${serv} servings` : `${P.formatQty(factor)}× the recipe`}</p>` : ''}

      <div class="cols">
        <section class="ings">
          <h2>Ingredients <span class="count">(${nIngs})</span></h2>
          <p class="hint no-print">Tap each one as you get it out.</p>
          ${r.groups.map(g => `${g.name ? `<h3>${esc(g.name)}</h3>` : ''}
            <ul>${g.items.map(i => { const f = P.formatIngredient(i, factor);
              return `<li><label><input type="checkbox" class="no-print"><span>${f.amount ? `<b>${esc(f.amount)}</b> ` : ''}${esc(f.name)}</span></label></li>`; }).join('')}</ul>`).join('')
            || '<p class="muted">No ingredients found. Tap “Fix mistakes” below to add them.</p>'}
        </section>
        <section class="steps">
          <h2>Steps</h2>
          <p class="hint no-print">Tap a step when you finish it.</p>
          <ol>${r.steps.map(s => `<li tabindex="0" role="button">${esc(s)}</li>`).join('') || '<p class="muted">No steps found. Tap “Fix mistakes” below to add them.</p>'}</ol>
          ${r.notes.length ? `<div class="notes"><h3>📝 Notes</h3><ul>${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
        </section>
      </div>

      <section class="details no-print">
        <h2>About this recipe</h2>
        <label class="field"><span>Type of dish</span>
          <select data-field="category">${P.CATEGORIES.map(c => `<option value="${esc(c)}"${c === r.category ? ' selected' : ''}>${icon(c)} ${esc(c)}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Cookbook</span>
          <input data-field="collection" list="cookbookList2" value="${esc(r.collection || '')}" placeholder="Not in a cookbook">
          <datalist id="cookbookList2">${collections().map(c => `<option value="${esc(c)}">`).join('')}</datalist>
        </label>
      </section>

      <section class="actions no-print">
        <button class="action" data-act="edit"><span>✏️</span>Fix mistakes</button>
        <button class="action" data-act="print"><span>🖨️</span>Print</button>
        <button class="action" data-act="md"><span>💾</span>Save a copy</button>
        <button class="action danger" data-act="delete"><span>🗑️</span>Delete</button>
      </section>
    </article>`;
  }

  function stepFactor(r, dir) {
    if (r.servings) {
      factor = Math.max(1, Math.round(r.servings * factor) + dir) / r.servings;
    } else {
      const steps = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
      let i = steps.findIndex(v => v >= factor - 1e-9);
      if (i < 0) i = steps.length - 1;
      if (steps[i] !== factor && dir < 0) i++;
      factor = steps[Math.min(steps.length - 1, Math.max(0, i + dir))];
    }
  }

  app.addEventListener('click', e => {
    const nav = e.target.closest('[data-go]');
    if (nav) return go(nav.dataset.go);
    const cat = e.target.closest('[data-cat]');
    if (cat) { catFilter = cat.dataset.cat; return renderHome(); }
    const col = e.target.closest('[data-col]');
    if (col) { colFilter = col.dataset.col; catFilter = ''; return renderHome(); }
    const li = e.target.closest('.steps ol li');
    if (li) { li.classList.toggle('done'); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = location.hash.split('/')[1];
    const r = byId(id);
    if (!r) return;
    switch (b.dataset.act) {
      case 'minus': stepFactor(r, -1); return renderRecipe(id);
      case 'plus': stepFactor(r, 1); return renderRecipe(id);
      case 'reset': factor = 1; return renderRecipe(id);
      case 'orig': showOriginal = !showOriginal; return renderRecipe(id);
      case 'translate': {
        T.prepare(r.lang, settings); // start now, while the tap still counts
        working('Translating…');
        T.recipes([r], r.lang, settings, working)
          .then(() => { saveRecipes(); hideOverlay(); renderRecipe(id); toast('Translated ✓'); })
          .catch(err => {
            console.error(err);
            showOverlay(`<div class="big-icon">📶</div><h2>Couldn't translate right now</h2>
              <p>The first translation needs an internet connection to download the translator. Please check you're online and try again.</p>
              <p class="muted small">${esc(err.message)}</p>
              <div class="stack"><button class="btn primary big" onclick="document.getElementById('overlay').hidden=true">OK</button></div>`);
          });
        return;
      }
      case 'print': return window.print();
      case 'md': download(slug(r.title) + '.txt', P.toMarkdown(r, factor), 'text/plain'); return toast('Saved a copy to your downloads ✓');
      case 'edit': return go('#edit/' + id);
      case 'delete':
        ask('Delete this recipe?', `“${esc(r.title)}” will be gone for good.`, [
          { icon: '🗑️', label: 'Yes, delete it', value: true },
          { icon: '↩️', label: 'No, keep it', value: false }
        ]).then(yes => {
          hideOverlay();
          if (!yes) return;
          recipes = recipes.filter(x => x.id !== r.id); saveRecipes();
          toast('Recipe deleted'); go('#');
        });
        return;
    }
  });
  app.addEventListener('change', e => {
    const f = e.target.dataset && e.target.dataset.field;
    if (!f) return;
    const r = byId(location.hash.split('/')[1]);
    if (!r) return;
    r[f] = e.target.value.trim();
    saveRecipes(); toast('Saved ✓');
    renderRecipe(r.id);
  });
  app.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.steps ol li')) { e.preventDefault(); e.target.classList.toggle('done'); }
  });

  // ----- Edit -----
  function renderEdit(id) {
    const r = byId(id);
    if (!r) return go('#');
    setHeader({ label: 'Cancel', to: '#r/' + id });
    app.innerHTML = `<section class="edit">
      <h1>Fix mistakes</h1>
      <p class="lead">Change anything that came out wrong, then tap <b>Save changes</b>.</p>
      <div class="howto">
        <p><b>How it works:</b></p>
        <ul>
          <li>The first line is the recipe name</li>
          <li>Put one ingredient on each line under <b>Ingredients</b></li>
          <li>Put one step on each line under <b>Directions</b></li>
        </ul>
      </div>
      <textarea id="editBox" spellcheck="true" aria-label="Recipe text">${esc(P.toEditableText(r))}</textarea>
      <div class="stack">
        <button class="btn primary big" id="saveEdit">Save changes</button>
        <button class="btn big ghost" id="cancelEdit">Cancel</button>
      </div>
    </section>`;
    const box = $('#editBox');
    box.style.height = Math.max(420, box.scrollHeight + 20) + 'px';
    $('#cancelEdit').onclick = () => go('#r/' + id);
    $('#saveEdit').onclick = () => {
      const parsed = P.parseBlock(box.value.replace(/\r\n?/g, '\n').split('\n').map(s => s.trim()));
      Object.assign(r, parsed, {
        id: r.id, source: r.source, created: r.created, collection: r.collection, tags: r.tags,
        originalTitle: r.originalTitle, original: r.original, translated: r.translated, translatedBy: r.translatedBy, lang: r.lang,
        category: r.category && r.category !== 'Other' ? r.category : parsed.category
      });
      saveRecipes(); toast('Changes saved ✓'); go('#r/' + id);
    };
  }

  // ----- Settings -----
  function renderSettings() {
    setHeader({ label: 'Back', to: '#' });
    const sizes = [['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']];
    app.innerHTML = `<section class="settings">
      <h1>Settings</h1>

      <div class="set-block">
        <h2>Text size</h2>
        <div class="seg">${sizes.map(s => `<button class="seg-btn${settings.textSize === s[0] ? ' on' : ''}" data-size="${s[0]}">${s[1]}</button>`).join('')}</div>
      </div>

      <div class="set-block">
        <h2>Keep your recipes safe</h2>
        <p>Your recipes are saved on this device only. Save a backup file now and then, so you don't lose them if you get a new phone or computer.</p>
        <div class="stack">
          <button class="btn primary big" id="backupBtn">💾 Save a backup file</button>
          <button class="btn big" id="restoreBtn">📂 Load recipes from a backup file</button>
        </div>
      </div>

      <div class="set-block">
        <h2>Translation</h2>
        <p>Recipes in other languages are translated right here on your device. The first time, the translator downloads (needs internet). After that it works without internet.</p>
        <details class="more">
          <summary>More options</summary>
          <label class="field"><span>Translator</span>
            <select id="mtEngine">
              <option value="auto"${settings.mtEngine !== 'model' ? ' selected' : ''}>Automatic (recommended)</option>
              <option value="model"${settings.mtEngine === 'model' ? ' selected' : ''}>Always use the downloaded translator</option>
            </select>
          </label>
          <label class="field"><span>Downloaded translator size</span>
            <select id="mtQuality">
              <option value="light"${settings.mtQuality !== 'best' ? ' selected' : ''}>Small and quick, about 100 MB (best for phones)</option>
              <option value="best"${settings.mtQuality === 'best' ? ' selected' : ''}>Large and more accurate, about 900 MB (computers only)</option>
            </select>
          </label>
        </details>
      </div>

      <div class="set-block">
        <details class="more">
          <summary>Smart reading with AI (for advanced users)</summary>
          <p>For handwriting or very messy pages, Claude AI can read your recipes instead. You need your own Anthropic API key (from console.anthropic.com), and each recipe costs a fraction of a cent. Photos are sent to Anthropic when this is on.</p>
          <label class="switch"><input type="checkbox" id="aiOn" ${settings.aiOn ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Use AI to read recipes</span></label>
          <label class="field"><span>API key</span><input type="password" id="apiKey" value="${esc(settings.apiKey)}" placeholder="sk-ant-…" autocomplete="off"></label>
          <label class="field"><span>Model</span><input type="text" id="model" value="${esc(settings.model)}" placeholder="claude-haiku-5-5"></label>
        </details>
      </div>

      <div class="set-block danger-zone">
        <h2>Start over</h2>
        <button class="btn big danger full" id="wipeBtn">🗑️ Delete all my recipes</button>
      </div>
    </section>`;

    app.querySelectorAll('[data-size]').forEach(b => b.onclick = () => { settings.textSize = b.dataset.size; saveSettings(); applyTextSize(); renderSettings(); });
    $('#backupBtn').onclick = () => {
      if (!recipes.length) return toast('You don’t have any recipes to back up yet.', true);
      download(`my-recipes-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'recipe-tidy', version: 1, recipes }, null, 2), 'application/json');
      toast('Backup saved to your downloads ✓');
    };
    $('#restoreBtn').onclick = () => $('#restoreInput').click();
    const persist = () => {
      Object.assign(settings, {
        mtEngine: $('#mtEngine').value, mtQuality: $('#mtQuality').value, aiOn: $('#aiOn').checked,
        apiKey: $('#apiKey').value.trim(), model: $('#model').value.trim() || 'claude-haiku-5-5'
      });
      saveSettings();
      if (settings.aiOn && !settings.apiKey) toast('AI reading needs an API key to work.', true); else toast('Saved ✓');
    };
    ['#mtEngine', '#mtQuality', '#aiOn', '#apiKey', '#model'].forEach(s => $(s).addEventListener('change', persist));
    $('#wipeBtn').onclick = () => ask('Delete ALL your recipes?', 'This can’t be undone. Save a backup file first if you might want them later.', [
      { icon: '🗑️', label: 'Yes, delete everything', value: true },
      { icon: '↩️', label: 'No, keep my recipes', value: false }
    ]).then(yes => { hideOverlay(); if (yes) { recipes = []; saveRecipes(); toast('All recipes deleted'); go('#'); } });
  }

  // ---------- Global events ----------
  window.addEventListener('hashchange', route);
  $('#settingsBtn').onclick = () => go('#settings');
  $('#brand').onclick = e => { e.preventDefault(); catFilter = ''; colFilter = ''; query = ''; go('#'); };
  $('#cameraInput').onchange = e => { const f = [...e.target.files]; e.target.value = ''; handleFiles(f); };
  $('#fileInput').onchange = e => { const f = [...e.target.files]; e.target.value = ''; handleFiles(f); };
  $('#restoreInput').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const list = (data.recipes || []).filter(r => r && r.title && Array.isArray(r.groups));
      const have = new Set(recipes.map(r => r.id));
      const fresh = list.filter(r => !have.has(r.id));
      recipes = fresh.concat(recipes); saveRecipes();
      toast(`Loaded ${plural(fresh.length, 'recipe')} ✓`);
      go('#');
    } catch (err) { toast('That file isn’t a recipe backup. Pick the file that starts with “my-recipes-backup”.', true); }
  };
  document.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  document.addEventListener('drop', e => {
    e.preventDefault(); document.body.classList.remove('dragging');
    if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden && !card.querySelector('.spinner')) hideOverlay(); });

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

  applyTextSize();
  route();

  // Installable app (home screen) + offline support
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e)));
  }
})();
