/* Recipe Snap — the app. Screens are switched with the address #hash so the phone's back gesture works.
 * Flow: Scan or upload → Extract → Review → Save. */
(function () {
  'use strict';
  const P = window.RecipeParser, X = window.RecipeExtract, T = window.RecipeTranslate, S = window.SnapStore, I = window.Icon;
  const $ = s => document.querySelector(s);
  const KEY = 'recipeTidy.recipes.v1', SKEY = 'recipeTidy.settings.v1', GKEY = 'recipeSnap.groceries.v1';

  // ---------- Data ----------
  let recipes = S.kv.get(KEY, []);
  let settings = Object.assign({
    aiOn: false, apiKey: '', model: 'claude-haiku-5-5', translate: true, ocrLang: 'eng', collection: '',
    mtEngine: 'auto', mtQuality: 'light', textSize: 'normal', welcomed: false, userName: '', cameraOk: false
  }, S.kv.get(SKEY, {}));
  let groceries = S.kv.get(GKEY, []);
  const saveRecipes = () => { if (!S.kv.set(KEY, recipes)) toast('Your device is out of space. Please save a backup in Settings.', true); };
  const saveSettings = () => S.kv.set(SKEY, settings);
  const saveGroceries = () => S.kv.set(GKEY, groceries);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const byId = id => recipes.find(r => r.id === id);

  // Screen state
  let catFilter = '', colFilter = '', favOnly = false, query = '';
  let factor = 1, showOriginal = false, lastRecipeId = null, detailTab = 'ings';
  let pending = null;            // recipes waiting for review: { items: [{ r, keep, sources: [Blob], photo: Blob }] }
  let editDraft = null;          // working copy on the edit screen

  // ---------- Helpers ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };
  let toastTimer;
  function toast(msg, isErr) {
    const el = $('#toast');
    el.textContent = msg; el.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, isErr ? 6000 : 2800);
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
    'Breakfast': '🥞', 'Soups & stews': '🍲', 'Salads': '🥗', 'Main dishes': '🥘', 'Sides': '🥔',
    'Breads & baking': '🍞', 'Desserts': '🍰', 'Sauces & dips': '🥣', 'Snacks & appetizers': '🧀',
    'Drinks': '🥤', 'Preserves': '🫙', 'Other': '🍽️'
  };
  const emo = c => CAT_ICON[c] || '🍽️';
  const SHORT = { 'Main dishes': 'Dinner', 'Soups & stews': 'Soups', 'Snacks & appetizers': 'Snacks', 'Breads & baking': 'Baking', 'Sauces & dips': 'Sauces' };
  const LANGS = [['eng', 'English'], ['slk', 'Slovak'], ['ces', 'Czech'], ['pol', 'Polish'], ['hun', 'Hungarian'], ['deu', 'German'],
    ['fra', 'French'], ['ita', 'Italian'], ['spa', 'Spanish'], ['por', 'Portuguese'], ['ukr', 'Ukrainian'], ['rus', 'Russian'],
    ['ell', 'Greek'], ['tur', 'Turkish'], ['ara', 'Arabic'], ['urd', 'Urdu'], ['hin', 'Hindi'], ['vie', 'Vietnamese'],
    ['tgl', 'Tagalog'], ['chi_sim', 'Chinese'], ['jpn', 'Japanese'], ['kor', 'Korean']];
  const langName = code => (LANGS.find(l => l[0] === code) || [code, code])[1];

  // Small headings inside the steps ("Make the Dough", "Bake"). They don't take a step number.
  document.head.insertAdjacentHTML('beforeend', `<style>
    .steps ol li.step-sec { counter-increment: none; padding: 1rem 0 .15rem; font-size: .85rem; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); cursor: default; }
    .steps ol li.step-sec::before { display: none; }
    .cook-sec { display: inline-block; margin: 0 0 .6rem; padding: .2rem .8rem; border-radius: 999px; background: var(--sage-soft); font-weight: 700; font-size: .9rem; }
  </style>`);
  const sectionsAt = (r, i) => (r.stepSections || []).filter(x => x.at === i);

  // "1 hr 5 min", "45 mins", "1 hour" → minutes
  function minutes(s) {
    if (!s) return null;
    s = String(s).toLowerCase();
    let m = 0, hit = false;
    const h = s.match(/(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|hr|h|hod\w*)\b/);
    const mi = s.match(/(\d+)\s*(?:minutes?|mins?|min|m|minút\w*)\b/);
    if (h) { m += parseFloat(h[1].replace(',', '.')) * 60; hit = true; }
    if (mi) { m += parseInt(mi[1], 10); hit = true; }
    return hit ? Math.round(m) : null;
  }
  const fmtMin = m => m == null ? '' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`;
  function totalTime(r) {
    const t = minutes(r.times.total);
    if (t) return t;
    const p = minutes(r.times.prep), c = minutes(r.times.cook);
    return p || c ? (p || 0) + (c || 0) : null;
  }
  const ingCount = r => r.groups.reduce((a, g) => a + g.items.length, 0);

  // Lines that may have been misread (scanner noise, odd symbols, impossible amounts)
  const odd = s => /[|\\{}<>~^_=@$%]/.test(s) || /[a-z]\d[a-z]/i.test(s) || (s.length > 8 && (s.replace(/[\p{L}\s\d.,'’()/-]/gu, '').length / s.length) > 0.25);
  function checkRecipe(r) {
    const flags = new Set(), issues = [];
    if (!r.title || r.title === 'Untitled recipe') issues.push('It needs a name');
    if (!ingCount(r)) issues.push('No ingredients were found');
    if (!r.steps.length) issues.push('No steps were found');
    r.groups.forEach(g => g.items.forEach(i => {
      if (odd(i.raw) || (i.qty != null && ((['cup', 'tbsp', 'tsp', 'stick'].includes(i.unitKey) && i.qty > 40) || i.qty > 5000))) flags.add(i.raw);
    }));
    r.steps.forEach(s => { if (odd(s)) flags.add(s); });
    if (flags.size) issues.push(`${plural(flags.size, 'line')} might have been read wrong`);
    return { issues, flags };
  }

  // ---------- Pictures ----------
  function cover(r, cls, pendingItem) {
    let src = '';
    if (pendingItem && pendingItem.photo) src = pendingItem.photoUrl || (pendingItem.photoUrl = URL.createObjectURL(pendingItem.photo));
    const key = !src && r.hasPhoto && r.id ? 'photo:' + r.id : '';
    const url = !src && !key && r.imageUrl ? r.imageUrl : '';
    return `<div class="cover ${cls || ''}" data-cat="${esc(r.category || 'Other')}">
      <span class="cover-emoji" aria-hidden="true">${emo(r.category)}</span>
      ${src || url ? `<img alt="" src="${esc(src || url)}" onerror="this.remove()">` : key ? `<img alt="" data-photo="${key}" hidden>` : ''}
    </div>`;
  }
  async function hydrate(root) {
    for (const img of (root || document).querySelectorAll('img[data-photo]')) {
      const u = await S.photoURL(img.dataset.photo);
      if (u) { img.src = u; img.hidden = false; }
    }
  }

  // ---------- Pop ups ----------
  const overlay = $('#overlay'), card = $('#overlayCard');
  function showOverlay(html, kind) {
    card.className = 'overlay-card' + (kind ? ' ' + kind : '');
    overlay.className = 'overlay' + (kind ? ' ' + kind : '');
    card.innerHTML = html; overlay.hidden = false;
    const f = card.querySelector('button'); if (f) f.focus({ preventScroll: true });
    card.scrollTop = 0;
  }
  function hideOverlay() { overlay.hidden = true; card.innerHTML = ''; card.onclick = null; }
  overlay.addEventListener('click', e => { if (e.target === overlay && !overlay.classList.contains('processing')) hideOverlay(); });
  function ask(title, text, choices) {
    return new Promise(resolve => {
      showOverlay(`<h2>${title}</h2>${text ? `<p>${text}</p>` : ''}
        <div class="choice-list">${choices.map((c, i) => `<button class="big-choice${c.primary ? ' primary-choice' : ''}" data-i="${i}"><span class="bc-icon">${c.icon}</span><span><b>${c.label}</b>${c.sub ? `<small>${c.sub}</small>` : ''}</span></button>`).join('')}</div>`, 'sheet');
      card.onclick = e => { const b = e.target.closest('[data-i]'); if (b) { card.onclick = null; resolve(choices[+b.dataset.i].value); } };
    });
  }

  // Processing screen. Only shows a real progress bar when we actually know how far along it is.
  function working(detail) {
    if (overlay.hidden || !overlay.classList.contains('processing')) {
      showOverlay(`<div class="proc-icon">${I('file')}<span class="spark s1">${I('sparkles')}</span></div>
        <h2>Extracting your recipe…</h2>
        <p class="proc-sub">We're finding the ingredients, steps and details.</p>
        <div class="pbar"><span id="procBar"></span></div>
        <p class="proc-detail" id="procDetail"></p>
        <p class="proc-note">This can take up to a minute. Please keep the app open.</p>`, 'processing');
    }
    const d = $('#procDetail'); if (d) d.textContent = detail || '';
    const m = String(detail || '').match(/(\d+)\s+of\s+(\d+)/);
    const bar = $('#procBar');
    if (bar) { if (m) { bar.parentNode.classList.remove('indet'); bar.style.width = Math.round(+m[1] / +m[2] * 100) + '%'; } else bar.parentNode.classList.add('indet'); }
  }

  // ---------- Getting recipes in ----------
  async function finishImport(found, lang) {
    found.forEach(r => { r.lang = lang; });
    if (!settings.translate || !T.needs(lang)) return { found };
    if (settings.aiOn && settings.apiKey) { found.forEach(r => { r.translated = true; r.translatedBy = 'Claude'; }); return { found }; }
    try { await T.recipes(found, lang, settings, working); return { found }; }
    catch (e) { console.error(e); return { found, translateError: e.message }; }
  }

  async function handleFiles(files, opts) {
    files = [...files];
    if (!files.length) return;
    opts = opts || {};
    const lang = settings.ocrLang;
    if (settings.translate) T.prepare(lang, settings); // must start right after the tap
    const photos = files.filter(X.isImage);
    let asPages = !!opts.asPages;
    if (!opts.asPages && photos.length > 1 && photos.length === files.length) {
      asPages = await ask(`You picked ${photos.length} photos`, 'What are they?', [
        { icon: '📖', label: 'One recipe', sub: 'The recipe goes across several pages', value: true },
        { icon: '📚', label: 'Different recipes', sub: 'Each photo is its own recipe', value: false }
      ]);
    }
    working('Getting started…');
    const items = [], problems = [];
    let translateError = '';
    const small = async f => X.isImage(f) ? S.shrink(f, 1600, 0.8) : null;
    try {
      if (asPages) {
        const res = await finishImport(await X.pagesToRecipes(files, settings, working), lang);
        const srcs = (await Promise.all(files.map(small))).filter(Boolean);
        res.found.forEach(r => items.push({ r, keep: true, sources: srcs }));
        translateError = res.translateError || '';
      } else {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const prefix = files.length > 1 ? `File ${i + 1} of ${files.length}: ` : '';
          try {
            working(prefix + 'opening…');
            const res = await finishImport(await X.fileToRecipes(f, settings, m => working(prefix + m)), lang);
            if (!res.found.length) { problems.push(f.name); continue; }
            const src = await small(f);
            res.found.forEach(r => items.push({ r, keep: true, sources: src ? [src] : [] }));
            translateError = translateError || res.translateError || '';
          } catch (e) { console.error(e); problems.push(`${f.name} (${e.message})`); }
        }
      }
    } catch (e) { console.error(e); problems.push(e.message); }
    hideOverlay();
    if (!items.length) return showProblem(problems);
    pending = { items, problems, translateError, collection: settings.collection };
    go('#review');
  }

  async function handleText(text) {
    text = (text || '').trim();
    if (!text) { toast('Type or paste the recipe first.', true); return; }
    const lang = settings.ocrLang;
    if (settings.translate) T.prepare(lang, settings);
    working('Tidying it up…');
    try {
      const res = await finishImport(await X.textToRecipes(text, settings, working), lang);
      hideOverlay();
      if (!res.found.length) return showProblem([], true);
      pending = { items: res.found.map(r => ({ r, keep: true, sources: [] })), problems: [], translateError: res.translateError, collection: settings.collection };
      go('#review');
    } catch (e) { console.error(e); hideOverlay(); showProblem([e.message]); }
  }

  function showProblem(problems, typed) {
    if ((problems || []).some(p => /internet|fetch|network|load a helper/i.test(p))) {
      showOverlay(`<div class="big-icon">📶</div><h2>Please connect to the internet</h2>
        <p>The first time you scan, Recipe Snap downloads its recipe reader. After that it works without internet.</p>
        <div class="stack"><button class="btn primary big" id="ok1">Try again</button></div>`);
      $('#ok1').onclick = () => { hideOverlay(); go('#scan'); };
      return;
    }
    showOverlay(`<div class="big-icon">🤔</div>
      <h2>We couldn't find a recipe${typed ? ' in that text' : ' there'}</h2>
      ${typed ? `<p>Make sure it has a list of ingredients and the steps. Writing <b>Ingredients</b> above the list and <b>Steps</b> above the steps helps.</p>`
      : `${problems && problems.length ? `<p class="muted small">${esc(problems.join(', '))}</p>` : ''}
      <p><b>Tips for a good scan:</b></p>
      <ul class="tips"><li>Lay the page flat in good light</li><li>Fit the whole recipe in the frame</li><li>Hold the phone straight above the page</li><li>Check the recipe language is right</li></ul>`}
      <div class="stack">
        <button class="btn primary big" id="tryAgain">Try again</button>
        <button class="btn big" id="typeInstead">Type it in instead</button>
      </div>`);
    $('#tryAgain').onclick = () => { hideOverlay(); go('#scan'); };
    $('#typeInstead').onclick = () => { hideOverlay(); openTypeSheet(); };
  }

  function openTypeSheet() {
    showOverlay(`<h2>Type or paste a recipe</h2>
      <p class="muted">Copy it from a website or a message and paste it here.</p>
      <textarea id="pasteBox" rows="10" placeholder="Pancakes&#10;Ingredients&#10;1 cup flour&#10;1 egg&#10;Steps&#10;Mix everything and cook in a hot pan."></textarea>
      <div class="stack"><button class="btn primary big" id="pasteGo">Extract recipe</button><button class="btn big ghost" id="pasteCancel">Cancel</button></div>`, 'sheet');
    $('#pasteBox').focus();
    $('#pasteGo').onclick = () => { const t = $('#pasteBox').value; hideOverlay(); handleText(t); };
    $('#pasteCancel').onclick = hideOverlay;
  }

  async function savePending(indexes) {
    const saved = [];
    for (const i of indexes) {
      const it = pending.items[i];
      const r = it.r;
      r.id = uid(); r.created = Date.now(); r.collection = r.collection || pending.collection || '';
      r.favorite = false;
      for (let n = 0; n < (it.sources || []).length; n++) await S.blobs.put(`src:${r.id}:${n}`, it.sources[n]);
      r.sourceCount = (it.sources || []).length;
      if (it.photo) { await S.blobs.put('photo:' + r.id, it.photo); r.hasPhoto = true; }
      saved.push(r);
    }
    recipes = saved.concat(recipes);
    saveRecipes();
    pending.items.forEach(it => { if (it.photoUrl) URL.revokeObjectURL(it.photoUrl); });
    pending = null;
    return saved;
  }

  // ---------- Router ----------
  const app = $('#app'), tabbar = $('#tabbar');
  const TABS = ['home', 'recipes', 'groceries', 'profile'];
  let lastTab = 'home';
  function route() {
    const h = location.hash.slice(1) || (settings.welcomed || recipes.length ? 'home' : 'welcome');
    const [name, arg] = h.split('/');
    if (name !== 'scan') stopCamera();
    if (name !== 'cook') releaseWake();
    if (!overlay.classList.contains('processing')) hideOverlay();
    document.body.dataset.screen = name;
    if (TABS.includes(name)) lastTab = name;
    tabbar.hidden = !TABS.includes(name);
    tabbar.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    window.scrollTo(0, 0);
    const screens = { categories: renderCategories, collections: renderCollections, history: renderHistory, welcome: renderWelcome, home: renderHome, recipes: renderRecipes, scan: renderScan, review: renderReview, r: renderRecipe, edit: renderEdit, cook: renderCook, groceries: renderGroceries, search: renderSearch, profile: renderProfile, settings: renderSettings, help: renderHelp };
    (screens[name] || renderHome)(arg);
    hydrate(app);
    if (successQueue) { const s = successQueue; successQueue = null; savedScreen(s); }
  }

  // ---------- Welcome ----------
  function renderWelcome() {
    app.innerHTML = `<section class="welcome">
      <div class="leaf">${I('leaf')}</div>
      <h1>Recipe Snap</h1>
      <p class="tagline">Scan. Save. Cook.</p>
      ${BOWL}
      <p class="welcome-text">Turn any recipe into a digital collection. Just scan it, and we'll handle the rest.</p>
      <div class="welcome-steps">
        <div><b>1</b> Take a photo of a recipe</div>
        <div><b>2</b> We read it for you</div>
        <div><b>3</b> Check it and save it</div>
      </div>
      <button class="btn cream big" id="getStarted">Get Started</button>
      <button class="link-light" id="haveBackup">I have a backup of my recipes</button>
    </section>`;
    $('#getStarted').onclick = () => { settings.welcomed = true; saveSettings(); go('#home'); };
    $('#haveBackup').onclick = () => { settings.welcomed = true; saveSettings(); $('#restoreInput').click(); };
  }

  // A simple drawn bowl of pasta for the welcome screen (no photo files needed)
  const BOWL = `<svg class="bowl" viewBox="0 0 320 230" aria-hidden="true">
    <defs><radialGradient id="bg1" cx="50%" cy="35%" r="60%"><stop offset="0" stop-color="#f3d9a0"/><stop offset="1" stop-color="#d9a85a"/></radialGradient></defs>
    <ellipse cx="160" cy="205" rx="130" ry="16" fill="rgba(0,0,0,.25)"/>
    <path d="M30 105 Q160 120 290 105 Q280 200 160 205 Q40 200 30 105Z" fill="#c9b79a"/>
    <path d="M30 105 Q160 120 290 105 Q282 128 265 150 Q160 168 55 150 Q38 128 30 105Z" fill="#b39c7a"/>
    <ellipse cx="160" cy="105" rx="130" ry="34" fill="#efe6d6"/>
    <ellipse cx="160" cy="104" rx="114" ry="27" fill="url(#bg1)"/>
    <g fill="none" stroke="#e9c27a" stroke-width="5" stroke-linecap="round">
      <path d="M70 100c20-18 40 14 60-4s40 12 60-4 30 10 50-2"/><path d="M80 112c22-14 38 10 58-2s44 10 64-4 22 8 36 0"/>
      <path d="M95 90c18-12 30 10 50-2s34 8 52-4 24 6 40-2"/><path d="M110 120c16-8 30 6 46-2s30 6 46-2"/>
    </g>
    <g fill="#4f7a3a"><circle cx="120" cy="96" r="4"/><circle cx="190" cy="108" r="4"/><circle cx="215" cy="92" r="3.5"/><circle cx="150" cy="114" r="3"/><circle cx="95" cy="108" r="3"/></g>
    <g fill="#f6f1e6"><circle cx="140" cy="92" r="3"/><circle cx="175" cy="96" r="2.6"/><circle cx="205" cy="112" r="2.4"/></g>
    <path d="M250 40 L300 15" stroke="#8a6a45" stroke-width="10" stroke-linecap="round"/><ellipse cx="238" cy="50" rx="22" ry="12" transform="rotate(-28 238 50)" fill="#9b7a52"/>
    <g fill="#6b8f4e"><path d="M40 70c10-14 26-14 30-2-12 6-22 8-30 2z"/><path d="M58 52c6-14 20-16 26-6-10 8-18 10-26 6z"/><path d="M262 150c14-6 26 2 24 12-12 0-20-4-24-12z"/></g>
  </svg>`;

  // ---------- Home ----------
  function hello() {
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    return settings.userName ? `${part}, ${esc(settings.userName.split(' ')[0])}` : part;
  }
  function metaSmall(r) {
    const t = totalTime(r);
    const bits = [];
    if (t) bits.push(`${I('clock')} ${fmtMin(t)}`);
    if (r.servings) bits.push(plural(r.servings, 'serving'));
    return bits.length ? bits.join(' • ') : esc(r.category || 'Other');
  }
  function miniCard(r) {
    const t = totalTime(r);
    return `<button class="mini" data-go="#r/${r.id}">${cover(r, 'mini-cover')}<b>${esc(r.title)}</b><small>${t ? I('clock') + ' ' + fmtMin(t) : esc(r.category || 'Other')}</small></button>`;
  }
  const PLATE = `<svg class="hero-plate" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="96" fill="#f3efe6"/><circle cx="100" cy="100" r="82" fill="#fffdf8" stroke="#e6dfcf" stroke-width="2"/>
    <circle cx="100" cy="100" r="62" fill="#ecc884"/>
    <g fill="none" stroke="#f6dca0" stroke-width="7" stroke-linecap="round"><path d="M52 92c14-18 28 12 44-4s30 14 46-2"/><path d="M56 110c16-14 28 10 44-2s32 10 44-4"/><path d="M64 78c12-10 24 8 38-2s26 8 36 0"/><path d="M62 124c14-8 26 6 40-2s24 6 34-2"/></g>
    <g fill="#4f7a3a"><circle cx="78" cy="88" r="4"/><circle cx="118" cy="104" r="4"/><circle cx="130" cy="82" r="3.5"/><circle cx="96" cy="118" r="3"/></g>
    <g fill="#fffaf0"><circle cx="90" cy="80" r="3"/><circle cx="112" cy="92" r="2.6"/><circle cx="104" cy="126" r="2.4"/></g>
    <g fill="#6b8f4e"><path d="M170 30c-14 2-24 12-24 24 14-2 24-10 24-24z"/><path d="M186 52c-10 0-18 8-18 18 10-2 18-8 18-18z"/></g>
  </svg>`;
  function renderHome() {
    const recent = recipes.slice().sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 6);
    const quick = [['Breakfast', 'Breakfast'], ['Main dishes', 'Dinner'], ['Desserts', 'Desserts'], ['Snacks & appetizers', 'Snacks']];
    app.innerHTML = `<section class="home">
      <header class="home-top"><span class="brand">${I('leaf')}<b>RecipeSnap</b></span><button class="icon-btn outline" data-go="#profile" aria-label="Profile">${I('user')}</button></header>
      <div class="home-hero">
        <div class="hero-text"><h1 class="hello">${hello().replace(', ', ',<br>')}</h1><p class="sub">What would you like to cook today?</p></div>
        ${PLATE}
      </div>
      <button class="search fake" data-go="#search">${I('search')}<span>Search recipes, ingredients, or cuisines...</span></button>
      <div class="tiles">
        <button data-go="#scan">${I('camera')}<span>Scan<br>Recipe</span></button>
        <button id="addManual">${I('edit')}<span>Add<br>Manually</span></button>
        <button data-go="#collections">${I('cookbook')}<span>Collections</span></button>
        <button data-go="#groceries">${I('list')}<span>Groceries</span></button>
      </div>

      ${recipes.length ? `
      <div class="sec-head"><h2>Recently Added</h2><button class="see-all" data-go="#recipes">View all</button></div>
      <div class="hscroll">${recent.map(miniCard).join('')}</div>`
      : `<div class="empty-card">
          <div class="big-icon">📖</div>
          <h2>Your cookbook is empty</h2>
          <p>Scan your first recipe, or see how it works with a few examples.</p>
          <button class="btn primary big" data-go="#scan">${I('camera')} Scan my first recipe</button>
          <button class="btn big ghost" id="sampleBtn">Show me examples</button>
        </div>`}

      <div class="sec-head"><h2>Popular Categories</h2><button class="see-all" data-go="#categories">See all</button></div>
      <div class="pcats">${quick.map(([c, l]) => `<button data-catgo="${esc(c)}"><span class="circ">${emo(c)}</span><small>${esc(l)}</small></button>`).join('')}</div>
    </section>`;
    const sb = $('#sampleBtn'); if (sb) sb.onclick = addExamples;
    $('#addManual').onclick = openTypeSheet;
  }
  function gridCard(r) {
    return `<div class="gcard"><button class="gcard-main" data-go="#r/${r.id}">${cover(r, 'gcover')}<b>${esc(r.title)}</b><small>${metaSmall(r)}</small></button>
      <button class="fav-btn float${r.favorite ? ' on' : ''}" data-fav-id="${r.id}" aria-label="${r.favorite ? 'Remove from favorites' : 'Add to favorites'}">${I(r.favorite ? 'heart-on' : 'heart')}</button></div>`;
  }
  function listRow(r) {
    return `<li class="rcard"><button class="rcard-main" data-go="#r/${r.id}">${cover(r, 'thumb')}<span class="rcard-text"><b>${esc(r.title)}</b><small>${metaSmall(r)}</small></span></button>
      <button class="fav-btn${r.favorite ? ' on' : ''}" data-fav-id="${r.id}" aria-label="${r.favorite ? 'Remove from favorites' : 'Add to favorites'}">${I(r.favorite ? 'heart-on' : 'heart')}</button></li>`;
  }
  function addExamples() {
    const ex = P.parseText(SAMPLE).map(r => Object.assign(r, { id: uid(), created: Date.now(), collection: 'Examples', favorite: false }));
    recipes = ex.concat(recipes); saveRecipes();
    toast(`Added ${ex.length} example recipes`);
    route();
  }

  // ---------- Recipes (library) ----------
  function renderRecipes() {
    const cols = collections();
    if (colFilter && !cols.includes(colFilter)) colFilter = '';
    const pool = recipes.filter(r => (!colFilter || r.collection === colFilter) && (!favOnly || r.favorite));
    const counts = {}; pool.forEach(r => { counts[r.category || 'Other'] = (counts[r.category || 'Other'] || 0) + 1; });
    if (catFilter && !counts[catFilter]) catFilter = '';
    const q = query.trim().toLowerCase();
    const items = pool.filter(r => (!catFilter || (r.category || 'Other') === catFilter) && (!q ||
      r.title.toLowerCase().includes(q) || (r.originalTitle || '').toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q) ||
      (r.collection || '').toLowerCase().includes(q) || (r.tags || []).some(t => t.toLowerCase().includes(q)) ||
      r.groups.some(g => g.items.some(i => i.name.toLowerCase().includes(q)))));
    const sub = !!(catFilter || colFilter || q);
    const asList = sub || favOnly;
    app.innerHTML = `<section class="library">
      ${sub ? `<header class="page-head sub-head"><button class="icon-btn" id="clearF2" aria-label="Back">${I('left')}</button><h1>${esc(colFilter || SHORT[catFilter] || catFilter || query.trim())}</h1><span class="bar-gap"></span></header>`
      : `<header class="page-head"><h1>My Recipes</h1><button class="icon-btn outline" data-go="#profile" aria-label="Profile">${I('user')}</button></header>`}
      <label class="search">${I('search')}<input type="search" id="search" placeholder="Search your recipes..." value="${esc(query)}" autocomplete="off"></label>
      <div class="chips">
        <button class="chip${!catFilter && !favOnly ? ' on' : ''}" data-chip="all">All</button>
        <button class="chip${favOnly ? ' on' : ''}" data-chip="fav">${I(favOnly ? 'heart-on' : 'heart')} Favorites</button>
        ${P.CATEGORIES.filter(c => counts[c]).map(c => `<button class="chip${c === catFilter ? ' on' : ''}" data-chip="cat" data-v="${esc(c)}">${esc(SHORT[c] || c)}</button>`).join('')}
      </div>
      <p class="count-line">${plural(items.length, 'recipe')}${catFilter ? ` in ${esc(catFilter)}` : ''}${favOnly ? ' in favorites' : ''}</p>
      ${items.length ? (asList ? `<ul class="rlist">${items.map(listRow).join('')}</ul>` : `<div class="grid2">${items.map(gridCard).join('')}</div>`)
      : recipes.length ? `<div class="empty-card"><p>No recipes match.</p><button class="btn big" id="clearF">Show all recipes</button></div>`
      : `<div class="empty-card"><div class="big-icon">📖</div><h2>No recipes yet</h2><p>Tap the Scan button below to add your first one.</p></div>`}
    </section>`;
    const s = $('#search');
    s.oninput = () => { query = s.value; const pos = s.selectionStart; renderRecipes(); hydrate(app); const n = $('#search'); n.focus(); n.setSelectionRange(pos, pos); };
    const c = $('#clearF'); if (c) c.onclick = () => { query = ''; catFilter = ''; favOnly = false; colFilter = ''; route(); };
    const c2 = $('#clearF2'); if (c2) c2.onclick = () => { query = ''; catFilter = ''; favOnly = false; colFilter = ''; route(); };
  }

  function renderSearch() {
    const recents = (settings.recentSearches || []).slice(0, 6);
    const popular = recipes.filter(r => r.favorite).concat(recipes.slice().sort((a, b) => (b.created || 0) - (a.created || 0))).filter((r, i, a) => a.indexOf(r) === i).slice(0, 4);
    app.innerHTML = `<section class="searchpage">
      <header class="bar"><button class="icon-btn" data-back aria-label="Back">${I('left')}</button><h1>Search</h1><span class="bar-gap"></span></header>
      <div class="sbar"><label class="search">${I('search')}<input id="sIn" type="search" placeholder="Search recipes, ingredients..." autocomplete="off" enterkeyhint="search"></label>
        <button class="text-btn" data-back>Cancel</button></div>
      <h2 class="s-h">Recent Searches</h2>
      ${recents.length ? `<ul class="recents">${recents.map(x => `<li><button data-recent="${esc(x)}">${I('clock')}<span>${esc(x)}</span></button></li>`).join('')}</ul>` : `<p class="muted small">Your searches will show up here.</p>`}
      ${popular.length ? `<h2 class="s-h">Popular Recipes</h2><ul class="rlist">${popular.map(listRow).join('')}</ul>` : ''}
    </section>`;
    const run = v => {
      v = (v || '').trim(); if (!v) return;
      settings.recentSearches = [v].concat((settings.recentSearches || []).filter(x => x.toLowerCase() !== v.toLowerCase())).slice(0, 8);
      saveSettings(); query = v; catFilter = ''; favOnly = false; colFilter = ''; go('#recipes');
    };
    const inp = $('#sIn');
    inp.onkeydown = e => { if (e.key === 'Enter') run(inp.value); };
    app.querySelectorAll('[data-recent]').forEach(b => b.onclick = () => run(b.dataset.recent));
  }

  function renderCategories() {
    const counts = {}; recipes.forEach(r => { counts[r.category || 'Other'] = (counts[r.category || 'Other'] || 0) + 1; });
    app.innerHTML = `<section class="cats">
      <header class="bar"><button class="icon-btn" data-back aria-label="Back">${I('left')}</button><h1>Categories</h1><span class="bar-gap"></span></header>
      <div class="grid2">${P.CATEGORIES.map(c => {
        const first = recipes.find(r => r.category === c && (r.hasPhoto || r.imageUrl));
        return `<button class="tile" data-catgo="${esc(c)}">${first ? cover(first, 'gcover') : `<div class="cover gcover" data-cat="${esc(c)}"><span class="cover-emoji">${emo(c)}</span></div>`}<b>${esc(c)}</b><small>${plural(counts[c] || 0, 'recipe')}</small></button>`;
      }).join('')}</div>
    </section>`;
  }
  function renderCollections() {
    const cols = collections();
    app.innerHTML = `<section class="colls">
      <header class="bar"><button class="icon-btn" data-back aria-label="Back">${I('left')}</button><h1>Collections</h1><button class="icon-btn" id="newCol" aria-label="New collection">${I('plus')}</button></header>
      ${cols.length ? '' : `<p class="hint">Collections are like cookbooks. They keep recipes together, like “Mom's recipes” or “Holiday baking”.</p>`}
      ${cols.length ? `<ul class="rlist">${cols.map(c => { const rs = recipes.filter(r => r.collection === c); return `<li class="rcard">
        <button class="rcard-main" data-col-go="${esc(c)}">${cover(rs.find(r => r.hasPhoto || r.imageUrl) || rs[0], 'thumb')}
          <span class="rcard-text"><b>${esc(c)}</b><small>${plural(rs.length, 'recipe')}</small></span></button></li>`; }).join('')}</ul>`
      : `<div class="empty-card"><div class="big-icon">📚</div><h2>No collections yet</h2><p>When you scan a recipe, tap <b>No cookbook</b> at the top of the camera to put it in a collection. You can also open any recipe, tap <b>Edit recipe</b> and type a cookbook name.</p></div>`}
    </section>`;
    $('#newCol').onclick = () => {
      showOverlay(`<h2>New collection</h2><p class="muted">New scans will go into it until you change it on the scan screen.</p><input id="ncIn" placeholder="For example: Mom's recipes">
        <div class="stack"><button class="btn primary big" id="ncOk">Create</button></div>`, 'sheet');
      $('#ncIn').focus();
      $('#ncOk').onclick = () => { const v = $('#ncIn').value.trim(); if (!v) return; settings.collection = v; saveSettings(); hideOverlay(); toast(`New scans will go into “${v}”`); go('#scan'); };
    };
  }
  function renderHistory() {
    const list = recipes.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
    const day = t => t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    app.innerHTML = `<section class="colls">
      <header class="bar"><button class="icon-btn" data-back aria-label="Back">${I('left')}</button><h1>Scan History</h1><span class="bar-gap"></span></header>
      ${list.length ? `<ul class="rlist">${list.map(r => `<li class="rcard"><button class="rcard-main" data-go="#r/${r.id}">${cover(r, 'thumb')}
        <span class="rcard-text"><b>${esc(r.title)}</b><small>Added ${day(r.created)}${r.source ? ' · from ' + esc(r.source) : r.sourceCount ? ' · scanned' : ''}</small></span>${I('right')}</button></li>`).join('')}</ul>`
      : `<div class="empty-card"><p>Nothing scanned yet.</p></div>`}
    </section>`;
  }

  // ---------- Scan (camera) ----------
  let stream = null, shots = [], torchOn = false;
  function stopCamera() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } torchOn = false; }
  function renderScan() {
    const hasCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const last = shots[shots.length - 1];
    app.innerHTML = `<section class="scan">
      <header class="scan-top">
        <button class="icon-btn light" id="scanClose" aria-label="Close">${I('x')}</button>
        <span class="scan-gap"></span>
        <button class="icon-btn light" id="torch" aria-label="Flash" hidden>${I('flash')}</button>
        ${last ? '' : `<button class="icon-btn light" id="moreBtn" aria-label="Add a file">${I('image')}</button>`}
      </header>
      <div class="scan-opts">
        <button class="opt" id="langOpt">${I('globe')} ${esc(langName(settings.ocrLang))}${settings.ocrLang !== 'eng' && settings.translate ? ' → English' : ''}</button>
        <button class="opt" id="bookOpt">${I('cookbook')} ${settings.collection ? esc(settings.collection) : 'No cookbook'}</button>
      </div>
      <div class="viewfinder">
        ${last ? `<img class="shot" src="${URL.createObjectURL(last)}" alt="Your photo">` : `<video id="video" playsinline muted autoplay></video>
        <div class="cam-msg" id="camMsg">
          <div class="big-icon">${I('camera')}</div>
          <h2>Scan a recipe</h2>
          <p>Recipe Snap uses your camera to take a photo of the recipe. The photo stays on your phone.</p>
          ${hasCam ? `<button class="btn cream big" id="camOn">Turn on camera</button>` : ''}
          <button class="btn outline-light big" id="camFallback">${I('camera')} Take a photo</button>
        </div>`}
        <div class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      </div>
      ${last ? `<div class="shot-bar">
          <p>${shots.length > 1 ? `${shots.length} pages so far. ` : ''}Is the whole recipe clear and easy to read?</p>
          <div class="shot-actions">
            <button class="btn outline-light" id="retake">${I('retake')} Retake</button>
            <button class="btn outline-light" id="addPage">${I('plus')} Add a page</button>
          </div>
          <button class="btn cream big" id="usePhoto">${I('check')} Use ${shots.length > 1 ? `these ${shots.length} photos` : 'this photo'}</button>
        </div>`
      : `<div class="scan-bottom">
          <div class="shutter-row">
            <button class="side-btn" id="galleryBtn">${I('image')}<span>Photo Library</span></button>
            <button class="shutter" id="shutter" aria-label="Take photo"><span></span></button>
            <button class="side-btn" id="camSide">${I('camera')}<span>Camera</span></button>
          </div>
          <p class="tap-hint">Tap to scan</p>
          <div class="tips-card"><b>Tips for best results:</b>
            <ul><li>Make sure the text is well lit</li><li>Keep the image clear and not blurry</li><li>Fill the frame with the recipe</li></ul></div>
        </div>`}
    </section>`;

    $('#scanClose').onclick = () => { shots = []; stopCamera(); go('#' + lastTab); };
    $('#langOpt').onclick = openLangSheet;
    $('#bookOpt').onclick = openBookSheet;
    if (last) {
      $('#retake').onclick = () => { shots.pop(); renderScan(); };
      $('#addPage').onclick = () => { renderScanCamera(); };
      $('#usePhoto').onclick = () => {
        const files = shots.map((b, i) => new File([b], `scan-${i + 1}.jpg`, { type: 'image/jpeg' }));
        shots = []; stopCamera();
        handleFiles(files, { asPages: files.length > 1 });
      };
      return;
    }
    $('#galleryBtn').onclick = () => $('#photoInput').click();
    $('#moreBtn').onclick = () => ask('Add from somewhere else', '', [
      { icon: '📄', label: 'A PDF or Word file', sub: 'Even a whole cookbook. We split it into separate recipes', value: 'file' },
      { icon: '⌨️', label: 'Type or paste it', sub: 'From a website, email or message', value: 'type' },
      { icon: '↩️', label: 'Cancel', value: '' }
    ]).then(v => { hideOverlay(); if (v === 'file') $('#fileInput').click(); if (v === 'type') openTypeSheet(); });
    const fb = $('#camFallback'); if (fb) fb.onclick = () => $('#cameraInput').click();
    const on = $('#camOn'); if (on) on.onclick = startCamera;
    const cs = $('#camSide'); if (cs) cs.onclick = () => (hasCam ? startCamera() : $('#cameraInput').click());
    $('#shutter').onclick = capture;
    if (hasCam && settings.cameraOk) startCamera();
  }
  function renderScanCamera() { const keep = shots; shots = []; renderScan(); shots = keep; if (shots.length) { const n = document.createElement('div'); n.className = 'page-count'; n.textContent = `Page ${shots.length + 1}`; $('.viewfinder').appendChild(n); } }

  async function startCamera() {
    const msg = $('#camMsg'), video = $('#video');
    if (!video) return;
    try {
      stream = stream || await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (msg) msg.hidden = true;
      settings.cameraOk = true; saveSettings();
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      const torch = $('#torch');
      if (caps.torch && torch) {
        torch.hidden = false;
        torch.onclick = async () => { torchOn = !torchOn; try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); torch.classList.toggle('on', torchOn); } catch (e) { /* not supported */ } };
      }
    } catch (e) {
      console.warn(e);
      settings.cameraOk = false; saveSettings();
      if (msg) {
        msg.hidden = false;
        msg.innerHTML = `<div class="big-icon">${I('camera')}</div><h2>Camera is turned off</h2>
          <p>To scan with the camera, allow camera access for Recipe Snap in your phone's settings. Or take a photo with your camera app instead.</p>
          <button class="btn cream big" id="camFallback2">${I('camera')} Take a photo</button>
          <button class="btn outline-light big" id="gal2">${I('image')} Choose from my photos</button>`;
        $('#camFallback2').onclick = () => $('#cameraInput').click();
        $('#gal2').onclick = () => $('#photoInput').click();
      }
    }
  }
  async function capture() {
    const video = $('#video');
    if (!stream || !video || !video.videoWidth) { $('#cameraInput').click(); return; }
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) return;
    if (navigator.vibrate) navigator.vibrate(30);
    shots.push(blob);
    renderScan();
  }

  function openLangSheet() {
    const isEng = settings.ocrLang === 'eng';
    showOverlay(`<h2>What language is the recipe in?</h2>
      <div class="lang-list">${LANGS.map(l => `<button class="lang${l[0] === settings.ocrLang ? ' on' : ''}" data-lang="${l[0]}">${esc(l[1])}${l[0] === settings.ocrLang ? I('check') : ''}</button>`).join('')}</div>
      <label class="switch${isEng ? ' dim' : ''}"><input type="checkbox" id="trToggle" ${settings.translate ? 'checked' : ''}><span class="switch-ui"></span><span>Translate it into English for me</span></label>
      <div class="stack"><button class="btn primary big" id="langDone">Done</button></div>`, 'sheet');
    card.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { settings.ocrLang = b.dataset.lang; saveSettings(); openLangSheet(); });
    $('#trToggle').onchange = e => { settings.translate = e.target.checked; saveSettings(); };
    $('#langDone').onclick = () => { hideOverlay(); if (location.hash === '#scan') renderScanKeep(); };
  }
  function openBookSheet() {
    const cols = collections();
    showOverlay(`<h2>Put it in a cookbook?</h2>
      <p class="muted">A cookbook keeps recipes together, like “Mom's recipes” or “Holiday baking”. You can skip this.</p>
      <input type="text" id="bookIn" value="${esc(settings.collection)}" placeholder="Type a name">
      ${cols.length ? `<div class="chips wrap">${cols.map(c => `<button class="chip" data-b="${esc(c)}">${I('cookbook')} ${esc(c)}</button>`).join('')}</div>` : ''}
      <div class="stack"><button class="btn primary big" id="bookDone">Done</button><button class="btn big ghost" id="bookNone">No cookbook</button></div>`, 'sheet');
    card.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { $('#bookIn').value = b.dataset.b; });
    $('#bookDone').onclick = () => { settings.collection = $('#bookIn').value.trim(); saveSettings(); hideOverlay(); if (location.hash === '#scan') renderScanKeep(); };
    $('#bookNone').onclick = () => { settings.collection = ''; saveSettings(); hideOverlay(); if (location.hash === '#scan') renderScanKeep(); };
  }
  // Re-draw the scan screen without restarting the camera
  function renderScanKeep() {
    const lo = $('#langOpt'), bo = $('#bookOpt');
    if (lo) lo.innerHTML = `${I('globe')} ${esc(langName(settings.ocrLang))}${settings.ocrLang !== 'eng' && settings.translate ? ' → English' : ''}`;
    if (bo) bo.innerHTML = `${I('cookbook')} ${settings.collection ? esc(settings.collection) : 'No cookbook'}`;
  }

  // ---------- Review (check before saving) ----------
  function recipeBody(r, opts) {
    opts = opts || {};
    const chk = opts.flags || new Set();
    const f = opts.factor || 1;
    return `<div class="cols">
      <section class="ings">
        <h2>Ingredients</h2>
        ${r.groups.map(g => `${g.name ? `<h3>${esc(g.name)}</h3>` : ''}<ul>${g.items.map(i => {
          const x = P.formatIngredient(i, f);
          const flag = chk.has(i.raw);
          return `<li class="${flag ? 'flag' : ''}"><label>${opts.checkable ? '<input type="checkbox" class="no-print">' : '<span class="dot"></span>'}<span>${x.amount ? `<b>${esc(x.amount)}</b> ` : ''}${esc(x.name)}${flag ? ` <em class="chk">${I('alert')} Please check</em>` : ''}</span></label></li>`;
        }).join('')}</ul>`).join('') || '<p class="missing">No ingredients found.</p>'}
      </section>
      <section class="steps">
        <h2>Instructions</h2>
        <ol>${r.steps.map((s, i) => sectionsAt(r, i).map(x => `<li class="step-sec">${esc(x.name)}</li>`).join('') +
          `<li class="${chk.has(s) ? 'flag' : ''}" ${opts.checkable ? 'tabindex="0" role="button"' : ''}>${esc(s)}${chk.has(s) ? ` <em class="chk">${I('alert')} Please check</em>` : ''}</li>`).join('') || '<p class="missing">No steps found.</p>'}</ol>
        ${r.notes.length ? `<div class="notes"><h3>Notes</h3><ul>${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
      </section>
    </div>`;
  }
  function metaRow(r, f) {
    f = f || 1;
    const t = totalTime(r);
    const bits = [];
    if (t) bits.push(`${I('clock')} ${fmtMin(t)}`);
    if (r.servings) bits.push(`${I('serves')} ${plural(Math.round(r.servings * f * 10) / 10, 'serving')}`);
    if (r.difficulty) bits.push(`${I('level')} ${esc(r.difficulty)}`);
    return bits.length ? `<div class="meta">${bits.map(b => `<span>${b}</span>`).join('')}</div>` : '';
  }

  function renderReview(arg) {
    if (!pending || !pending.items.length) return go('#home');
    const many = pending.items.length > 1;
    if (many && arg == null) return renderReviewList();
    const idx = many ? +arg : 0;
    const it = pending.items[idx];
    if (!it) return go('#review');
    const r = it.r;
    const { issues, flags } = checkRecipe(r);
    app.innerHTML = `<section class="review">
      <header class="bar">
        <button class="icon-btn" id="revBack" aria-label="${many ? 'Back to the list' : 'Cancel'}">${I(many ? 'left' : 'x')}</button>
        <h1>${many ? `Recipe ${idx + 1} of ${pending.items.length}` : 'Review &amp; Edit'}</h1>
        ${many ? '<span class="bar-gap"></span>' : '<button class="pill-btn" id="revSaveTop">Save</button>'}
      </header>
      ${issues.length ? `<div class="banner warn">${I('alert')}<div><b>Please check before saving</b><ul>${issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div></div>`
        : `<div class="banner ok">${I('check')}<div><b>Looks good!</b> Read it over, then tap Save Recipe.</div></div>`}
      ${pending.translateError ? `<div class="banner warn">${I('globe')}<div>We couldn't translate it right now. You can translate it later from the recipe page.</div></div>` : ''}
      <div class="detail-head">
        ${cover(r, 'hero-sm', it)}
        <div>
          <span class="pill">${emo(r.category)} ${esc(r.category || 'Other')}</span>
          <h2 class="title">${esc(r.title)}</h2>
          ${r.originalTitle ? `<p class="orig">${esc(langName(r.lang))}: ${esc(r.originalTitle)}</p>` : ''}
          ${metaRow(r)}
        </div>
      </div>
      ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}
      ${it.sources && it.sources.length ? `<button class="btn ghost full" id="viewSrc">${I('eye')} Compare with the original photo</button>` : ''}
      ${recipeBody(r, { flags })}
      <div class="sticky-actions">
        <button class="btn big" id="revFix">${I('edit')} Fix something</button>
        <button class="btn primary big" id="revSave">${I('check')} ${many ? 'Looks right' : 'Save Recipe'}</button>
      </div>
    </section>`;
    $('#revBack').onclick = () => many ? go('#review') : discardPending();
    $('#revFix').onclick = () => go(`#edit/p${idx}`);
    const st = $('#revSaveTop'); if (st) st.onclick = () => $('#revSave').click();
    $('#revSave').onclick = async () => {
      if (many) { it.keep = true; it.checked = true; return go('#review'); }
      const [saved] = await savePending([0]);
      successQueue = [saved];
      location.replace('#home');
    };
    const vs = $('#viewSrc'); if (vs) vs.onclick = () => showSources(it.sources);
  }
  function renderReviewList() {
    const items = pending.items;
    const kept = items.filter(i => i.keep).length;
    const cats = {}; items.forEach(i => { const c = i.r.category || 'Other'; cats[c] = (cats[c] || 0) + 1; });
    app.innerHTML = `<section class="review">
      <header class="bar"><button class="icon-btn" id="revBack" aria-label="Cancel">${I('x')}</button><h1>We found ${items.length} recipes</h1><span class="bar-gap"></span></header>
      <div class="banner ok">${I('sparkles')}<div>We split your file into separate recipes and sorted them. Untick any you don't want, and tap one to check it.</div></div>
      <div class="sorted">${P.CATEGORIES.filter(c => cats[c]).map(c => `<span>${emo(c)} ${esc(c)} <b>${cats[c]}</b></span>`).join('')}</div>
      <div class="row-between"><button class="link" id="allOn">Select all</button><button class="link" id="allOff">Select none</button></div>
      <ul class="rlist">${items.map((it, i) => { const { issues } = checkRecipe(it.r); return `<li class="rcard${it.keep ? '' : ' off'}">
        <label class="keep"><input type="checkbox" data-keep="${i}" ${it.keep ? 'checked' : ''} aria-label="Keep ${esc(it.r.title)}"></label>
        <button class="rcard-main" data-go="#review/${i}">${cover(it.r, 'thumb', it)}
          <span class="rcard-text"><b>${esc(it.r.title)}</b><small>${esc(it.r.category || 'Other')} · ${plural(ingCount(it.r), 'ingredient')}</small>
          ${issues.length ? `<em class="chk">${I('alert')} Check this one</em>` : it.checked ? `<em class="okk">${I('check')} Checked</em>` : ''}</span></button>
      </li>`; }).join('')}</ul>
      <div class="sticky-actions single"><button class="btn primary big" id="saveAll" ${kept ? '' : 'disabled'}>${I('check')} Save ${plural(kept, 'recipe')}</button></div>
    </section>`;
    $('#revBack').onclick = discardPending;
    app.querySelectorAll('[data-keep]').forEach(c => c.onchange = () => { items[+c.dataset.keep].keep = c.checked; renderReviewList(); hydrate(app); });
    $('#allOn').onclick = () => { items.forEach(i => { i.keep = true; }); renderReviewList(); hydrate(app); };
    $('#allOff').onclick = () => { items.forEach(i => { i.keep = false; }); renderReviewList(); hydrate(app); };
    $('#saveAll').onclick = async () => {
      const idx = items.map((it, i) => it.keep ? i : -1).filter(i => i >= 0);
      const saved = await savePending(idx);
      catFilter = ''; favOnly = false; query = '';
      successQueue = saved;
      location.replace('#home');
    };
  }
  let successQueue = null;
  function savedScreen(saved) {
    {
      const one = saved.length === 1;
      showOverlay(`<div class="leaves" aria-hidden="true"></div><div class="saved-check">${I('check')}</div>
        <h2>${one ? 'Recipe Saved!' : `${saved.length} Recipes Saved!`}</h2>
        <p>${one ? 'Your recipe has been added to your collection.' : 'Your recipes have been added to your collection.'}</p>
        <div class="stack"><button class="btn cream big" id="svView">${one ? 'View Recipe' : 'See My Recipes'}</button><button class="btn outline-light big" id="svHome">Back to Home</button></div>`, 'success');
      $('#svView').onclick = () => { hideOverlay(); go(one ? '#r/' + saved[0].id : '#recipes'); };
      $('#svHome').onclick = () => { hideOverlay(); route(); };
    }
  }
  function discardPending() {
    ask('Leave without saving?', 'The recipe you just scanned will not be saved.', [
      { icon: '↩️', label: 'Keep checking', value: false, primary: true },
      { icon: '🗑️', label: 'Yes, throw it away', value: true }
    ]).then(yes => { hideOverlay(); if (yes) { pending = null; location.replace('#home'); } });
  }
  function showSources(blobsArr) {
    const urls = blobsArr.map(b => URL.createObjectURL(b));
    showOverlay(`<h2>Original</h2><div class="src-imgs">${urls.map(u => `<img src="${u}" alt="Original photo">`).join('')}</div>
      <div class="stack"><button class="btn primary big" id="srcClose">Close</button></div>`, 'sheet tall');
    $('#srcClose').onclick = () => { urls.forEach(u => URL.revokeObjectURL(u)); hideOverlay(); };
  }

  // ---------- Recipe page ----------
  function renderRecipe(id) {
    const live = byId(id);
    if (!live) return go('#recipes');
    if (lastRecipeId !== id) { factor = 1; showOriginal = false; lastRecipeId = id; detailTab = 'ings'; }
    const r = showOriginal && live.original ? Object.assign({}, live, live.original) : live;
    const canTranslate = !live.translated && T.needs(live.lang);
    const serv = r.servings ? Math.round(r.servings * factor * 100) / 100 : null;
    const hasImg = live.hasPhoto || live.imageUrl;
    app.innerHTML = `<article class="detail" id="card">
      <header class="bar detail-bar no-print"><button class="icon-btn" data-act="back" aria-label="Back">${I('left')}</button><h1>Recipe Detail</h1><button class="icon-btn fav-top${live.favorite ? ' on' : ''}" data-act="fav" aria-label="Favorite">${I(live.favorite ? 'heart-on' : 'heart')}</button></header>
      <div class="hero${hasImg ? '' : ' no-img'}">
        ${cover(live, 'hero-img')}
        ${!hasImg ? `<button class="add-photo no-print" data-act="photo">${I('camera')} Add a photo of the dish</button>` : ''}
      </div>
      <div class="detail-body">
        <div class="title-row"><h1 class="title">${esc(r.title)}</h1><span class="pill">${esc(r.category || 'Other')}</span></div>
        ${live.originalTitle && !showOriginal ? `<p class="orig">${esc(langName(live.lang))}: ${esc(live.originalTitle)}</p>` : ''}
        ${live.collection ? `<p class="in-book">${I('cookbook')} ${esc(live.collection)}</p>` : ''}
        ${metaRow(r, factor)}
        ${live.translated ? `<div class="notice no-print">${I('globe')}<span>${showOriginal ? `Showing the original ${esc(langName(live.lang))}.` : 'Translated by computer. A few words might be off.'} <button class="link" data-act="orig">${showOriginal ? 'Show in English' : 'Show the original'}</button></span></div>` : ''}
        ${canTranslate ? `<div class="notice no-print">${I('globe')}<span>This recipe is in ${esc(langName(live.lang))}.</span><button class="btn primary small" data-act="translate">Translate to English</button></div>` : ''}
        ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}

        <div class="scaler no-print">
          <span>${serv != null ? 'Servings' : 'Recipe size'}</span>
          <div class="stepper">
            <button data-act="minus" aria-label="Less">${I('minus')}</button>
            <b>${serv != null ? serv : P.formatQty(factor) + '×'}</b>
            <button data-act="plus" aria-label="More">${I('plus')}</button>
          </div>
          ${factor !== 1 ? `<button class="link" data-act="reset">Reset</button>` : ''}
        </div>
        ${factor !== 1 ? `<p class="print-only">${serv != null ? `Makes ${serv} servings` : `${P.formatQty(factor)}× the recipe`}</p>` : ''}

        <div class="tabs no-print" role="tablist">
          <button class="tab${detailTab === 'ings' ? ' on' : ''}" data-tab-d="ings" role="tab">Ingredients</button>
          <button class="tab${detailTab === 'steps' ? ' on' : ''}" data-tab-d="steps" role="tab">Instructions</button>
        </div>
        <div class="tabbed show-${detailTab}">${recipeBody(r, { factor, checkable: true })}</div>

        <div class="actions no-print">
          <button class="action" data-act="grocery">${I('cart')}<span>Add to grocery list</span></button>
          <button class="action" data-act="edit">${I('edit')}<span>Edit recipe</span></button>
          <button class="action" data-act="print">${I('print')}<span>Print</span></button>
          <button class="action" data-act="copy">${I('save')}<span>Save a copy</span></button>
          ${live.sourceCount ? `<button class="action" data-act="source">${I('eye')}<span>See original</span></button>` : ''}
          ${hasImg ? `<button class="action" data-act="photo">${I('camera')}<span>Change photo</span></button>` : ''}
          <button class="action danger" data-act="delete">${I('trash')}<span>Delete</span></button>
        </div>
      </div>
      <div class="sticky-actions single no-print"><button class="btn primary big" data-act="cook">${I('play')} Start Cooking</button></div>
    </article>`;
  }

  function stepFactor(r, dir) {
    if (r.servings) factor = Math.max(1, Math.round(r.servings * factor) + dir) / r.servings;
    else {
      const steps = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
      let i = steps.findIndex(v => v >= factor - 1e-9);
      if (i < 0) i = steps.length - 1;
      if (steps[i] !== factor && dir < 0) i++;
      factor = steps[Math.min(steps.length - 1, Math.max(0, i + dir))];
    }
  }

  let photoTarget = null;
  async function onRecipeAction(act, r, b) {
    switch (act) {
      case 'back': return go('#' + lastTab);
      case 'fav': r.favorite = !r.favorite; saveRecipes(); toast(r.favorite ? 'Added to favorites' : 'Removed from favorites'); return route();
      case 'minus': stepFactor(r, -1); return route();
      case 'plus': stepFactor(r, 1); return route();
      case 'reset': factor = 1; return route();
      case 'orig': showOriginal = !showOriginal; return route();
      case 'cook': return go('#cook/' + r.id);
      case 'edit': return go('#edit/' + r.id);
      case 'print': return window.print();
      case 'copy': download(slug(r.title) + '.txt', P.toMarkdown(r, factor), 'text/plain'); return toast('Saved a copy to your downloads ✓');
      case 'grocery': return addToGroceries(r);
      case 'photo': photoTarget = r.id; return $('#dishPhotoInput').click();
      case 'source': {
        const bl = [];
        for (let n = 0; n < r.sourceCount; n++) { const x = await S.blobs.get(`src:${r.id}:${n}`); if (x) bl.push(x); }
        return bl.length ? showSources(bl) : toast('The original photo is no longer on this device.', true);
      }
      case 'translate': {
        T.prepare(r.lang, settings);
        working('Translating…');
        return T.recipes([r], r.lang, settings, working)
          .then(() => { saveRecipes(); hideOverlay(); route(); toast('Translated ✓'); })
          .catch(err => {
            console.error(err);
            showOverlay(`<div class="big-icon">📶</div><h2>Couldn't translate right now</h2>
              <p>The first translation needs internet to download the translator. Check you're online and try again.</p>
              <div class="stack"><button class="btn primary big" id="ok2">OK</button></div>`);
            $('#ok2').onclick = hideOverlay;
          });
      }
      case 'delete':
        return ask('Delete this recipe?', `“${esc(r.title)}” will be gone for good.`, [
          { icon: '↩️', label: 'No, keep it', value: false, primary: true },
          { icon: '🗑️', label: 'Yes, delete it', value: true }
        ]).then(async yes => {
          hideOverlay();
          if (!yes) return;
          recipes = recipes.filter(x => x.id !== r.id); saveRecipes();
          await S.blobs.del('photo:' + r.id); S.forget('photo:' + r.id);
          for (let n = 0; n < (r.sourceCount || 0); n++) await S.blobs.del(`src:${r.id}:${n}`);
          toast('Recipe deleted'); location.replace('#recipes');
        });
    }
  }

  // ---------- Edit ----------
  function renderEdit(arg) {
    const isPending = arg && arg[0] === 'p';
    const it = isPending && pending ? pending.items[+arg.slice(1)] : null;
    const src = isPending ? it && it.r : byId(arg);
    if (!src) return go('#home');
    if (!editDraft || editDraft._for !== arg) {
      editDraft = JSON.parse(JSON.stringify(src));
      editDraft._for = arg;
      editDraft._lines = [];
      src.groups.forEach(g => { if (g.name) editDraft._lines.push(g.name + ':'); g.items.forEach(i => { const f = P.formatIngredient(i, 1); editDraft._lines.push([f.amount, f.name].filter(Boolean).join(' ')); }); });
      if (!editDraft._lines.length) editDraft._lines.push('');
      if (!editDraft.steps.length) editDraft.steps.push('');
    }
    const d = editDraft;
    const cols = collections();
    app.innerHTML = `<section class="edit">
      <header class="bar">
        <button class="icon-btn" id="edCancel" aria-label="Back">${I('left')}</button>
        <h1>Edit Recipe</h1>
        <button class="text-btn strong" id="edSave">Save</button>
      </header>
      <div class="ed-photo">${cover(src, 'thumb lg', it)}<button class="btn" id="edPhoto">${I('camera')} ${src.hasPhoto || (it && it.photo) ? 'Change Photo' : 'Add a photo'}</button></div>

      <div class="form">
        <label class="field"><span>Title</span><input id="fTitle" value="${esc(d.title)}"></label>
        <label class="field row"><span>Type of dish</span><select id="fCat">${P.CATEGORIES.map(c => `<option value="${esc(c)}"${c === d.category ? ' selected' : ''}>${emo(c)} ${esc(c)}</option>`).join('')}</select></label>
        <label class="field row"><span>Cookbook</span><input id="fBook" list="bookList" value="${esc(isPending ? (d.collection || pending.collection || '') : (d.collection || ''))}" placeholder="None"><datalist id="bookList">${cols.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <div class="field row"><span>Servings</span><div class="stepper"><button type="button" id="sMinus" aria-label="Fewer">${I('minus')}</button><b id="sVal">${d.servings || '–'}</b><button type="button" id="sPlus" aria-label="More">${I('plus')}</button></div></div>
        <label class="field row"><span>Prep time</span><input id="fPrep" value="${esc(d.times.prep)}" placeholder="e.g. 10 min"></label>
        <label class="field row"><span>Cook time</span><input id="fCook" value="${esc(d.times.cook)}" placeholder="e.g. 15 min"></label>
        <label class="field row"><span>Difficulty</span><select id="fDiff">${['', 'Easy', 'Medium', 'Hard'].map(v => `<option value="${v}"${v === (d.difficulty || '') ? ' selected' : ''}>${v || 'Not set'}</option>`).join('')}</select></label>
      </div>

      <h2 class="form-h">Ingredients</h2>
      <p class="hint">One ingredient per box, amount first. To start a group, type a name ending in a colon, like “For the sauce:”.</p>
      <div class="rows" id="ingRows">${d._lines.map((l, i) => `<div class="erow"><input data-ing="${i}" value="${esc(l)}" placeholder="e.g. 2 cups flour"><button class="x" data-del-ing="${i}" aria-label="Remove ingredient">${I('x')}</button></div>`).join('')}</div>
      <button class="add-row" id="addIng">${I('plus')} Add ingredient</button>

      <h2 class="form-h">Instructions</h2>
      <div class="rows" id="stepRows">${d.steps.map((s, i) => `<div class="erow step"><span class="n">${i + 1}</span><textarea data-step="${i}" rows="2" placeholder="Describe this step">${esc(s)}</textarea>
        <div class="mv"><button data-up="${i}" aria-label="Move up" ${i ? '' : 'disabled'}>${I('up')}</button><button data-down="${i}" aria-label="Move down" ${i < d.steps.length - 1 ? '' : 'disabled'}>${I('down')}</button><button class="x" data-del-step="${i}" aria-label="Remove step">${I('x')}</button></div></div>`).join('')}</div>
      <button class="add-row" id="addStep">${I('plus')} Add step</button>

      <h2 class="form-h">Notes</h2>
      <textarea id="fNotes" rows="3" placeholder="Your own tips, like “Mom adds extra garlic”">${esc(d.notes.join('\n'))}</textarea>

      <div class="sticky-actions"><button class="btn big" id="edCancel2">Cancel</button><button class="btn primary big" id="edSave2">${I('check')} Save changes</button></div>
    </section>`;

    const sync = () => {
      d.title = $('#fTitle').value; d.category = $('#fCat').value; d.collection = $('#fBook').value.trim();
      d.times.prep = $('#fPrep').value.trim(); d.times.cook = $('#fCook').value.trim(); d.difficulty = $('#fDiff').value;
      app.querySelectorAll('[data-ing]').forEach(x => { d._lines[+x.dataset.ing] = x.value; });
      app.querySelectorAll('[data-step]').forEach(x => { d.steps[+x.dataset.step] = x.value; });
      d.notes = $('#fNotes').value.split('\n').map(s => s.trim()).filter(Boolean);
    };
    const redraw = () => { sync(); renderEdit(arg); hydrate(app); };
    // Step headings ("Make the Dough") stay put only while the steps keep their places
    const dropSections = () => { d.stepSections = []; };
    $('#sMinus').onclick = () => { sync(); d.servings = Math.max(1, (d.servings || 2) - 1); $('#sVal').textContent = d.servings; };
    $('#sPlus').onclick = () => { sync(); d.servings = (d.servings || 0) + 1; $('#sVal').textContent = d.servings; };
    $('#addIng').onclick = () => { sync(); d._lines.push(''); redraw(); const ins = app.querySelectorAll('[data-ing]'); ins[ins.length - 1].focus(); };
    $('#addStep').onclick = () => { sync(); d.steps.push(''); redraw(); const ts = app.querySelectorAll('[data-step]'); ts[ts.length - 1].focus(); };
    app.querySelectorAll('[data-del-ing]').forEach(b => b.onclick = () => { sync(); d._lines.splice(+b.dataset.delIng, 1); redraw(); });
    app.querySelectorAll('[data-del-step]').forEach(b => b.onclick = () => { sync(); d.steps.splice(+b.dataset.delStep, 1); dropSections(); redraw(); });
    app.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { sync(); const i = +b.dataset.up; [d.steps[i - 1], d.steps[i]] = [d.steps[i], d.steps[i - 1]]; dropSections(); redraw(); });
    app.querySelectorAll('[data-down]').forEach(b => b.onclick = () => { sync(); const i = +b.dataset.down; [d.steps[i + 1], d.steps[i]] = [d.steps[i], d.steps[i + 1]]; dropSections(); redraw(); });
    $('#edPhoto').onclick = () => { sync(); photoTarget = isPending ? arg : src.id; $('#dishPhotoInput').click(); };
    const back = () => location.replace(isPending ? '#review' + (pending.items.length > 1 ? '/' + arg.slice(1) : '') : '#r/' + src.id);
    const cancel = () => { editDraft = null; back(); };
    $('#edCancel').onclick = cancel; $('#edCancel2').onclick = cancel;
    const save = () => {
      sync();
      const groups = []; let g = { name: '', items: [] }; groups.push(g);
      d._lines.map(s => s.trim()).filter(Boolean).forEach(l => {
        if (/:$/.test(l) && !P.parseIngredient(l).qty) { g = { name: l.replace(/:$/, '').trim(), items: [] }; groups.push(g); }
        else g.items.push(P.parseIngredient(l));
      });
      const steps = d.steps.map(s => s.trim()).filter(Boolean);
      Object.assign(src, {
        title: d.title.trim() || 'Untitled recipe', category: d.category, collection: d.collection, servings: d.servings || null,
        times: { prep: d.times.prep, cook: d.times.cook, total: (d.times.prep !== src.times.prep || d.times.cook !== src.times.cook) ? '' : src.times.total },
        difficulty: d.difficulty, groups: groups.filter(x => x.items.length), steps,
        stepSections: steps.length === d.steps.length ? (d.stepSections || []).filter(x => x.at < steps.length) : [],
        notes: d.notes, updated: Date.now()
      });
      editDraft = null;
      if (isPending) { it.checked = true; return back(); }
      saveRecipes(); toast('Changes saved ✓'); back();
    };
    $('#edSave').onclick = save; $('#edSave2').onclick = save;
  }

  // ---------- Cooking mode ----------
  let wake = null, cookStep = 0, cookId = null;
  function releaseWake() { if (wake) { wake.release().catch(() => {}); wake = null; } }
  function renderCook(id) {
    const r = byId(id);
    if (!r) return go('#recipes');
    if (cookId !== id) { cookStep = 0; cookId = id; }
    if (!wake && navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { wake = w; }).catch(() => {});
    const n = r.steps.length;
    const done = cookStep >= n;
    const step = r.steps[cookStep] || '';
    const sec = (r.stepSections || []).filter(x => x.at <= cookStep).pop();
    const tm = step.match(/(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/i);
    const timerMin = tm ? (/^h/i.test(tm[3]) ? +tm[1] * 60 : +tm[1]) : 0;
    const tl = timer ? (timer.paused ? timer.left : Math.max(0, Math.round((timer.end - Date.now()) / 1000))) : timerMin * 60;
    const ttot = timer ? timer.total : timerMin * 60;
    const m2 = x => String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
    app.innerHTML = `<section class="cook">
      <header class="bar">
        <button class="icon-btn" id="cookClose" aria-label="Close cooking mode">${I('left')}</button>
        <h1>${done ? 'All done!' : `Step ${cookStep + 1} of ${n}`}</h1>
        <button class="icon-btn" id="cookIngs" aria-label="Ingredients">${I('ingredients')}</button>
      </header>
      <div class="progress"><span style="width:${n ? Math.min(100, Math.round(cookStep / n * 100)) : 0}%"></span></div>
      ${done ? `<div class="cook-done"><div class="big-icon">🍽️</div><h2>Enjoy your ${esc(r.title)}!</h2>
          <div class="stack"><button class="btn cream big" id="cookFinish">Back to the recipe</button><button class="btn big outline-light" id="cookRestart">Start again</button></div></div>`
      : `<div class="cook-photo">${cover(r, 'cook-img')}</div>
        ${sec ? `<div class="cook-sec-wrap"><span class="cook-sec">${esc(sec.name)}</span></div>` : ''}
        <div class="cook-step">${esc(step)}</div>
        ${timerMin ? `<button class="ring-timer" id="startTimer" aria-label="${timer ? 'Timer' : 'Start ' + fmtMin(timerMin) + ' timer'}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" cx="60" cy="60" r="54"/><circle class="ring-fg" id="ringFg" cx="60" cy="60" r="54" style="stroke-dashoffset:${(339.3 * (1 - tl / ttot)).toFixed(1)}"/></svg><span id="ringTime">${m2(tl)}</span></button>
          ${timer ? '' : `<p class="ring-hint">Tap to start the timer</p>`}` : ''}
        <div class="cook-nav">
          ${timer ? `<button class="btn big dark" id="pauseBtn">${timer.paused ? 'Resume' : 'Pause'}</button>` : `<button class="btn big dark" id="prevStep" ${cookStep ? '' : 'disabled'}>Back</button>`}
          <button class="btn big sage" id="nextStep">${cookStep === n - 1 ? 'Finish' : 'Next'}</button>
        </div>
        ${timer && cookStep ? `<button class="link-light center" id="prevStep2">Previous step</button>` : ''}`}
    </section>`;
    $('#cookClose').onclick = () => { releaseWake(); location.replace('#r/' + id); };
    $('#cookIngs').onclick = () => {
      showOverlay(`<h2>Ingredients</h2><div class="ings">${r.groups.map(g => `${g.name ? `<h3>${esc(g.name)}</h3>` : ''}<ul>${g.items.map(i => { const f = P.formatIngredient(i, factor); return `<li><label><input type="checkbox"><span>${f.amount ? `<b>${esc(f.amount)}</b> ` : ''}${esc(f.name)}</span></label></li>`; }).join('')}</ul>`).join('')}</div>
        <div class="stack"><button class="btn primary big" id="ingClose">Back to cooking</button></div>`, 'sheet tall');
      $('#ingClose').onclick = hideOverlay;
    };
    if (done) { $('#cookFinish').onclick = () => { releaseWake(); location.replace('#r/' + id); }; $('#cookRestart').onclick = () => { cookStep = 0; renderCook(id); }; return; }
    const prev = () => { cookStep = Math.max(0, cookStep - 1); renderCook(id); };
    const pv = $('#prevStep'); if (pv) pv.onclick = prev;
    const pv2 = $('#prevStep2'); if (pv2) pv2.onclick = prev;
    const pb = $('#pauseBtn'); if (pb) pb.onclick = () => { toggleTimerPause(); renderCook(id); };
    $('#nextStep').onclick = () => { cookStep++; renderCook(id); };
    const st = $('#startTimer'); if (st) st.onclick = () => { if (!timer) startTimer(timerMin, r.title); else toggleTimerPause(); renderCook(id); };
    hydrate(app);
  }

  // A kitchen timer that keeps running while you move around the app
  let timer = null;
  const mmss = x => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
  function paintTimer() {
    if (!timer) return 0;
    const left = timer.paused ? timer.left : Math.max(0, Math.round((timer.end - Date.now()) / 1000));
    const el = $('#timerPill');
    el.hidden = document.body.dataset.screen === 'cook';
    el.innerHTML = `${I('timer')} <b>${mmss(left)}</b> <button aria-label="Stop timer" id="timerStop">${I('x')}</button>`;
    $('#timerStop').onclick = stopTimer;
    const rt = $('#ringTime'), rf = $('#ringFg');
    if (rt) rt.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
    if (rf) rf.style.strokeDashoffset = String((339.3 * (1 - left / timer.total)).toFixed(1));
    return left;
  }
  function stopTimer() { if (timer) clearInterval(timer.int); timer = null; $('#timerPill').hidden = true; }
  function tick() {
    if (!timer || timer.paused) return;
    const left = paintTimer();
    if (!left) {
      const mins = timer.mins;
      stopTimer(); beep(); if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
      showOverlay(`<div class="big-icon">⏰</div><h2>Time's up!</h2><p>Your ${mins} minute timer is done.</p><div class="stack"><button class="btn primary big" id="tOk">OK</button></div>`);
      $('#tOk').onclick = hideOverlay;
      if (document.body.dataset.screen === 'cook') { const id = cookId; if (id) renderCook(id); }
    }
  }
  function startTimer(mins, label) {
    if (timer) clearInterval(timer.int);
    timer = { end: Date.now() + mins * 60000, total: mins * 60, left: mins * 60, mins, label, paused: false, int: null };
    timer.int = setInterval(tick, 500);
    paintTimer();
  }
  function toggleTimerPause() {
    if (!timer) return;
    if (timer.paused) { timer.end = Date.now() + timer.left * 1000; timer.paused = false; timer.int = setInterval(tick, 500); }
    else { timer.left = Math.max(0, Math.round((timer.end - Date.now()) / 1000)); timer.paused = true; clearInterval(timer.int); }
    paintTimer();
  }
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.5, 1].forEach(t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.3, ctx.currentTime + t); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3); });
    } catch (e) { /* no sound */ }
  }

  // ---------- Grocery list ----------
  const AISLES = [
    ['Produce', /\b(apple|banana|lemon|lime|orange|berr|strawberr|tomato|potato|onion|garlic|carrot|celery|pepper(?!corn)|jalape|lettuce|romaine|spinach|kale|cabbage|broccoli|cauliflower|zucchini|cucumber|avocado|cilantro|parsley|basil|mint|dill|thyme|rosemary|ginger|mushroom|corn|peas|beans? sprout|squash|eggplant|scallion|leek|herb|fruit|vegetable|kapust|cibul|cesnak|zemiak|mrkv|petržlen)\w*/i],
    ['Meat & fish', /\b(chicken|beef|pork|lamb|turkey|bacon|sausage|ham|steak|mince|ground (beef|pork|turkey)|fish|salmon|tuna|shrimp|cod|kurac|bravč|hovädz|klobás|mäso|slanin)\w*/i],
    ['Dairy & eggs', /\b(milk|butter|cream|cheese|yogurt|yoghurt|egg|feta|parmesan|mozzarella|cheddar|ricotta|sour cream|mlieko|maslo|smotan|syr|vajc|tvaroh|žĺtk)\w*/i],
    ['Bakery', /\b(bread|tortilla|bun|roll|bagel|pita|croissant|crust|chlieb|rožk)\w*/i],
    ['Spices', /\b(salt|pepper|paprika|cumin|cinnamon|oregano|chili powder|nutmeg|vanilla|seasoning|spice|curry|bay lea|clove(?!s? garlic)|soľ|korenie|rasc)\w*/i],
    ['Frozen', /\bfrozen\b/i],
    ['Pantry', /\b(flour|sugar|rice|pasta|spaghetti|noodle|oil|vinegar|sauce|broth|stock|baking|yeast|honey|syrup|oats|cereal|beans|lentil|chickpea|can|nuts?|almond|walnut|chocolate|cocoa|jam|mustard|mayo|ketchup|soy|múk|cukor|ryž|drožd|olej|ocot)\w*/i]
  ];
  const aisleOf = name => /\bsalt\b|black pepper|^pepper\b|and pepper|peppercorn/i.test(name) ? 'Spices' : (AISLES.find(a => a[1].test(name)) || ['Other'])[0];
  const baseName = n => n.toLowerCase().replace(/\(.*?\)/g, '').split(',')[0]
    .replace(/\b(fresh|large|small|medium|chopped|diced|minced|sliced|grated|shredded|softened|melted|peeled|beaten|ripe|finely|roughly|thinly|cooked|boneless|skinless|to taste)\b/g, '').replace(/\s+/g, ' ').trim();

  function addToGroceries(r) {
    let added = 0;
    r.groups.forEach(g => g.items.forEach(i => {
      const name = baseName(i.name) || i.name;
      const qty = i.qty != null ? i.qty * factor : null;
      const ex = groceries.find(x => !x.done && x.name === name && x.unitKey === (i.unitKey || '') && (x.qty == null) === (qty == null));
      if (ex) { if (qty != null) ex.qty += qty; if (!ex.from.includes(r.title)) ex.from.push(r.title); }
      else { groceries.push({ id: uid(), name, qty, unit: i.unit || '', unitKey: i.unitKey || '', aisle: aisleOf(i.name), done: false, from: [r.title] }); added++; }
    }));
    saveGroceries();
    toast(`Added ${ingCount(r)} ingredients to your grocery list ✓`);
    return added;
  }
  let gFilter = 'all', gAddOpen = false;
  function renderGroceries() {
    const shown = groceries.filter(x => gFilter === 'all' || (gFilter === 'recipes' ? (x.from && x.from.length) : !(x.from && x.from.length)));
    const groups = {};
    shown.forEach(x => { (groups[x.aisle] = groups[x.aisle] || []).push(x); });
    const order = AISLES.map(a => a[0]).concat('Other');
    const left = groceries.filter(x => !x.done).length;
    app.innerHTML = `<section class="groceries">
      <header class="page-head"><h1>Grocery List</h1><button class="add-pill" id="gAddFocus">${I('plus')} Add Items</button></header>
      <div class="gtabs" role="tablist">${[['all', 'All'], ['recipes', 'Recipes'], ['custom', 'Custom']].map(([k, l]) => `<button class="${gFilter === k ? 'on' : ''}" data-gf="${k}" role="tab">${l}</button>`).join('')}</div>
      ${gAddOpen || !groceries.length ? `<form class="gadd" id="gAdd"><input id="gIn" placeholder="Add an item, like “2 lemons”" autocomplete="off"><button class="btn primary">Add</button></form>` : ''}
      ${groceries.length ? `<p class="count-line">${left ? `${plural(left, 'item')} to buy` : 'All done! 🎉'}</p>
        ${shown.length ? order.filter(a => groups[a]).map(a => `<div class="gsec"><h2>${esc(a)}</h2><ul>${groups[a].map(x => {
          const amt = x.qty != null ? P.formatIngredient({ qty: x.qty, qtyMax: null, unit: x.unit, unitKey: x.unitKey, size: '', name: x.name }, 1).amount : '';
          return `<li class="${x.done ? 'done' : ''}"><label><input type="checkbox" data-g="${x.id}" ${x.done ? 'checked' : ''}><span><b>${esc(x.name)}</b>${amt ? ` <small>${esc(amt)}</small>` : ''}${x.from && x.from.length ? `<em>${esc(x.from.join(', '))}</em>` : ''}</span></label>
          <button class="x" data-gdel="${x.id}" aria-label="Remove">${I('x')}</button></li>`; }).join('')}</ul></div>`).join('') : `<p class="muted center">Nothing here yet.</p>`}
        <div class="stack">
          <button class="btn primary big" id="gAll">${I('check')} Mark all as purchased</button>
          <button class="btn big ghost" id="gClear">Clear purchased items</button>
        </div>`
      : `<div class="empty-card"><div class="big-icon">🛒</div><h2>Your list is empty</h2><p>Open a recipe and tap <b>Add to grocery list</b>, or type an item above.</p></div>`}
    </section>`;
    $('#gAddFocus').onclick = () => { gAddOpen = !gAddOpen; renderGroceries(); const i = $('#gIn'); if (i) i.focus(); };
    app.querySelectorAll('[data-gf]').forEach(b => b.onclick = () => { gFilter = b.dataset.gf; renderGroceries(); });
    const form = $('#gAdd');
    if (form) form.onsubmit = e => {
      e.preventDefault();
      const v = $('#gIn').value.trim(); if (!v) return;
      const i = P.parseIngredient(v);
      groceries.push({ id: uid(), name: i.qty != null ? i.name : v, qty: i.qty, unit: i.unit, unitKey: i.unitKey, aisle: aisleOf(v), done: false, from: [] });
      saveGroceries(); renderGroceries(); $('#gIn').focus();
    };
    app.querySelectorAll('[data-g]').forEach(c => c.onchange = () => { const x = groceries.find(g => g.id === c.dataset.g); x.done = c.checked; saveGroceries(); renderGroceries(); });
    app.querySelectorAll('[data-gdel]').forEach(b => b.onclick = () => { groceries = groceries.filter(g => g.id !== b.dataset.gdel); saveGroceries(); renderGroceries(); });
    const all = $('#gAll'); if (all) all.onclick = () => { groceries.forEach(g => { g.done = true; }); saveGroceries(); renderGroceries(); };
    const clr = $('#gClear'); if (clr) clr.onclick = () => { groceries = groceries.filter(g => !g.done); saveGroceries(); renderGroceries(); };
  }

  // ---------- Profile, settings, help ----------
  function renderProfile() {
    const name = settings.userName;
    const initials = name ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('') : '';
    const left = groceries.filter(g => !g.done).length;
    const row = (icon, label, count, attrs) => `<li><button ${attrs}>${I(icon)}<span>${label}</span>${count == null ? '' : `<em>${count}</em>`}${I('right')}</button></li>`;
    app.innerHTML = `<section class="profile">
      <div class="pf-avatar">${initials ? esc(initials) : I('user')}</div>
      <button class="pf-name" id="nameBtn">${name ? esc(name) : 'Add your name'} ${I('edit')}</button>
      <p class="pf-sub">Your recipes are private and stay on this device</p>
      <ul class="pf-menu">
        ${row('book', 'My Recipes', recipes.length, 'data-go="#recipes"')}
        ${row('heart', 'Favorites', recipes.filter(r => r.favorite).length, 'id="favLink"')}
        ${row('list', 'Grocery List', left, 'data-go="#groceries"')}
        ${row('cookbook', 'Collections', collections().length, 'data-go="#collections"')}
        ${row('scan', 'Scan History', recipes.length, 'data-go="#history"')}
        ${row('sliders', 'Settings', null, 'data-go="#settings"')}
        ${row('help', 'Help &amp; Support', null, 'data-go="#help"')}
      </ul>
      <button class="pf-out" id="backupLink">${I('save')} Back up my recipes</button>
      ${I('leaf', 'pf-leaf')}
    </section>`;
    $('#nameBtn').onclick = () => {
      showOverlay(`<h2>What's your name?</h2><input id="nmIn" value="${esc(name)}" placeholder="Your first name">
        <div class="stack"><button class="btn primary big" id="nmOk">Save</button></div>`, 'sheet');
      $('#nmIn').focus();
      $('#nmOk').onclick = () => { settings.userName = $('#nmIn').value.trim(); saveSettings(); hideOverlay(); route(); };
    };
    $('#favLink').onclick = () => { favOnly = true; catFilter = ''; go('#recipes'); };
    $('#backupLink').onclick = backup;
  }
  async function backup() {
    if (!recipes.length) return toast('You don’t have any recipes to back up yet.', true);
    working('Packing up your recipes…');
    const photos = {};
    for (const r of recipes) if (r.hasPhoto) { const b = await S.blobs.get('photo:' + r.id); if (b) photos[r.id] = await S.toDataURL(b); }
    hideOverlay();
    download(`recipe-snap-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'recipe-snap', version: 2, recipes, photos, groceries }), 'application/json');
    toast('Backup saved to your downloads ✓');
  }
  function renderSettings() {
    const sizes = [['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']];
    app.innerHTML = `<section class="settings">
      <header class="bar"><button class="icon-btn" id="setBack" aria-label="Back">${I('left')}</button><h1>Settings</h1><span class="bar-gap"></span></header>
      <div class="set-block"><h2>Text size</h2>
        <div class="seg">${sizes.map(s => `<button class="seg-btn${settings.textSize === s[0] ? ' on' : ''}" data-size="${s[0]}">${s[1]}</button>`).join('')}</div></div>
      <div class="set-block"><h2>Keep your recipes safe</h2>
        <p>Your recipes are saved on this device only. Save a backup file now and then so you don't lose them if you get a new phone.</p>
        <div class="stack"><button class="btn primary big" id="backupBtn">${I('save')} Save a backup file</button>
        <button class="btn big" id="restoreBtn">${I('upload')} Load a backup file</button></div></div>
      <div class="set-block"><h2>Translation</h2>
        <p>Recipes in other languages are translated on your device. The first time, the translator downloads (needs internet).</p>
        <details class="more"><summary>More options</summary>
          <label class="field"><span>Translator</span><select id="mtEngine"><option value="auto"${settings.mtEngine !== 'model' ? ' selected' : ''}>Automatic (recommended)</option><option value="model"${settings.mtEngine === 'model' ? ' selected' : ''}>Always use the downloaded translator</option></select></label>
          <label class="field"><span>Downloaded translator size</span><select id="mtQuality"><option value="light"${settings.mtQuality !== 'best' ? ' selected' : ''}>Small and quick, about 100 MB (best for phones)</option><option value="best"${settings.mtQuality === 'best' ? ' selected' : ''}>Large and more accurate, about 900 MB (computers only)</option></select></label>
        </details></div>
      <div class="set-block"><details class="more"><summary>Smart reading with AI (advanced)</summary>
        <p>For handwriting or very messy pages, Claude AI can read your recipes instead. You need your own Anthropic API key from console.anthropic.com; each recipe costs a fraction of a cent. Photos are sent to Anthropic when this is on. Your key stays on this device.</p>
        <label class="switch"><input type="checkbox" id="aiOn" ${settings.aiOn ? 'checked' : ''}><span class="switch-ui"></span><span>Use AI to read recipes</span></label>
        <label class="field"><span>API key</span><input type="password" id="apiKey" value="${esc(settings.apiKey)}" placeholder="sk-ant-…" autocomplete="off"></label>
        <label class="field"><span>Model</span><input id="model" value="${esc(settings.model)}" placeholder="claude-haiku-5-5"></label>
      </details></div>
      <div class="set-block"><h2>Start over</h2>
        <button class="btn big ghost full" id="showWelcome">Show the welcome screen again</button>
        <button class="btn big danger full" id="wipeBtn">${I('trash')} Delete all my recipes</button></div>
    </section>`;
    $('#setBack').onclick = () => go('#profile');
    app.querySelectorAll('[data-size]').forEach(b => b.onclick = () => { settings.textSize = b.dataset.size; saveSettings(); applyTextSize(); renderSettings(); });
    $('#backupBtn').onclick = backup;
    $('#restoreBtn').onclick = () => $('#restoreInput').click();
    const persist = () => {
      Object.assign(settings, { mtEngine: $('#mtEngine').value, mtQuality: $('#mtQuality').value, aiOn: $('#aiOn').checked, apiKey: $('#apiKey').value.trim(), model: $('#model').value.trim() || 'claude-haiku-5-5' });
      saveSettings();
      toast(settings.aiOn && !settings.apiKey ? 'AI reading needs an API key to work.' : 'Saved ✓', settings.aiOn && !settings.apiKey);
    };
    ['#mtEngine', '#mtQuality', '#aiOn', '#apiKey', '#model'].forEach(s => $(s).addEventListener('change', persist));
    $('#showWelcome').onclick = () => { settings.welcomed = false; saveSettings(); go('#welcome'); };
    $('#wipeBtn').onclick = () => ask('Delete ALL your recipes?', 'This can’t be undone. Save a backup file first if you might want them later.', [
      { icon: '↩️', label: 'No, keep my recipes', value: false, primary: true },
      { icon: '🗑️', label: 'Yes, delete everything', value: true }
    ]).then(async yes => {
      hideOverlay(); if (!yes) return;
      for (const k of await S.blobs.keys()) await S.blobs.del(k);
      recipes = []; saveRecipes(); toast('All recipes deleted'); go('#home');
    });
  }
  function renderHelp() {
    app.innerHTML = `<section class="help">
      <header class="bar"><button class="icon-btn" id="hBack" aria-label="Back">${I('left')}</button><h1>Help &amp; Tips</h1><span class="bar-gap"></span></header>
      <div class="set-block"><h2>📷 Scanning a recipe</h2><ul class="tips"><li>Tap the round Scan button at the bottom.</li><li>Lay the page flat in good light, fit it in the frame and tap the big white button.</li><li>If the recipe goes onto another page, tap <b>Add a page</b>.</li><li>Check the recipe, fix anything that's wrong, then tap <b>Save Recipe</b>.</li></ul></div>
      <div class="set-block"><h2>📚 A whole cookbook</h2><p>Tap Scan, then <b>Files</b>, and pick a PDF or Word file. Recipe Snap splits it into separate recipes and sorts them for you.</p></div>
      <div class="set-block"><h2>🌐 Other languages</h2><p>On the scan screen, tap the language button at the top and pick the language. Leave <b>Translate it into English</b> on to get it in English. You can always switch back to the original.</p></div>
      <div class="set-block"><h2>🍳 Cooking</h2><p>Open a recipe and tap <b>Start Cooking</b>. You'll see one step at a time in big letters, and the screen stays on. Steps with a time get a timer button.</p></div>
      <div class="set-block"><h2>🛒 Grocery list</h2><p>On a recipe, tap <b>Add to grocery list</b>. Items are sorted by store aisle. Tick them off as you shop.</p></div>
      <div class="set-block"><h2>💾 Don't lose your recipes</h2><p>Everything is saved on this device. Go to Profile, then <b>Back up my recipes</b>, now and then.</p></div>
    </section>`;
    $('#hBack').onclick = () => go('#profile');
  }
  function applyTextSize() { document.documentElement.dataset.size = settings.textSize || 'normal'; }

  // ---------- Global events ----------
  window.addEventListener('hashchange', route);
  app.addEventListener('click', e => {
    const nav = e.target.closest('[data-go]');
    if (nav) return go(nav.dataset.go);
    if (e.target.closest('[data-back]')) return go('#' + lastTab);
    const cgo = e.target.closest('[data-col-go]');
    if (cgo) { colFilter = cgo.dataset.colGo; catFilter = ''; favOnly = false; return go('#recipes'); }
    const dt = e.target.closest('[data-tab-d]');
    if (dt) { detailTab = dt.dataset.tabD; app.querySelectorAll('[data-tab-d]').forEach(x => x.classList.toggle('on', x === dt)); const tb = app.querySelector('.tabbed'); tb.className = 'tabbed show-' + detailTab; return; }
    const cg = e.target.closest('[data-catgo]');
    if (cg) { catFilter = cg.dataset.catgo; favOnly = false; query = ''; return go('#recipes'); }
    const fl = e.target.closest('[data-fav]');
    if (fl) { favOnly = true; catFilter = ''; return go('#recipes'); }
    const ch = e.target.closest('[data-chip]');
    if (ch) {
      const k = ch.dataset.chip;
      if (k === 'all') { catFilter = ''; favOnly = false; }
      if (k === 'fav') favOnly = !favOnly;
      if (k === 'cat') catFilter = catFilter === ch.dataset.v ? '' : ch.dataset.v;
      if (k === 'col') colFilter = ch.dataset.v;
      renderRecipes(); return hydrate(app);
    }
    const fv = e.target.closest('[data-fav-id]');
    if (fv) { const r = byId(fv.dataset.favId); r.favorite = !r.favorite; saveRecipes(); renderRecipes(); hydrate(app); return toast(r.favorite ? 'Added to favorites' : 'Removed from favorites'); }
    const li = e.target.closest('.detail .steps ol li:not(.step-sec)');
    if (li) { li.classList.toggle('done'); return; }
    const b = e.target.closest('[data-act]');
    if (b && location.hash.startsWith('#r/')) { const r = byId(location.hash.split('/')[1]); if (r) onRecipeAction(b.dataset.act, r, b); }
  });
  app.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.detail .steps ol li:not(.step-sec)')) { e.preventDefault(); e.target.classList.toggle('done'); } });
  tabbar.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) go('#' + b.dataset.tab); });

  const pick = (sel, fn) => { $(sel).onchange = e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) fn(f); }; };
  pick('#cameraInput', f => handleFiles(f));
  pick('#photoInput', f => handleFiles(f));
  pick('#fileInput', f => handleFiles(f));
  pick('#dishPhotoInput', async f => {
    const blob = await S.shrink(f[0], 1200, 0.85);
    const t = photoTarget; photoTarget = null;
    if (t && t[0] === 'p' && pending) { const it = pending.items[+t.slice(1)]; if (it.photoUrl) URL.revokeObjectURL(it.photoUrl); it.photo = blob; it.photoUrl = null; return route(); }
    const r = byId(t); if (!r) return;
    await S.blobs.put('photo:' + r.id, blob); S.forget('photo:' + r.id);
    r.hasPhoto = true; saveRecipes(); toast('Photo added ✓'); route();
  });
  pick('#restoreInput', async f => {
    try {
      const data = JSON.parse(await f[0].text());
      const list = (data.recipes || []).filter(r => r && r.title && Array.isArray(r.groups));
      const have = new Set(recipes.map(r => r.id));
      const fresh = list.filter(r => !have.has(r.id));
      for (const r of fresh) {
        if (data.photos && data.photos[r.id]) { await S.blobs.put('photo:' + r.id, await S.fromDataURL(data.photos[r.id])); r.hasPhoto = true; } else r.hasPhoto = false;
        r.sourceCount = 0;
      }
      recipes = fresh.concat(recipes); saveRecipes();
      if (Array.isArray(data.groceries) && !groceries.length) { groceries = data.groceries; saveGroceries(); }
      settings.welcomed = true; saveSettings();
      toast(`Loaded ${plural(fresh.length, 'recipe')} ✓`); go('#recipes');
    } catch (err) { toast('That file isn’t a recipe backup. Pick the file that starts with “recipe-snap-backup”.', true); }
  });

  document.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  document.addEventListener('drop', e => {
    e.preventDefault(); document.body.classList.remove('dragging');
    if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden && !overlay.classList.contains('processing')) hideOverlay(); });

  const SAMPLE = `Creamy Garlic Pasta
Serves 4
Prep time: 10 min   Cook time: 15 min
Ingredients
12 oz pasta
2 tbsp olive oil
4 cloves garlic, minced
1 cup heavy cream
1/2 cup grated Parmesan cheese
Salt and pepper to taste
Instructions
1. Cook pasta according to package instructions.
2. Heat olive oil in a pan and sauté garlic for 1 to 2 minutes.
3. Add cream and simmer for 5 minutes.
4. Stir in Parmesan, then season with salt and pepper.
5. Toss with pasta and serve.

Chicken Teriyaki Bowl
Serves 4
Prep time: 15 min   Cook time: 15 min
Ingredients
1 lb chicken breast
1/4 cup soy sauce
2 tbsp honey
1 tbsp rice vinegar
2 cloves garlic, minced
1 tsp ginger, grated
2 cups rice
Instructions
1. In a bowl, whisk together soy sauce, honey, rice vinegar, garlic and ginger.
2. Marinate the chicken for at least 15 minutes.
3. Cook the chicken in a hot pan for 6 minutes per side, adding the sauce at the end.
4. Slice and serve over rice.

Chocolate Chip Cookies
Makes 24
Prep time: 15 min   Cook time: 10 min
Ingredients
2 1/4 cups flour
1 cup butter, softened
3/4 cup brown sugar
2 eggs
1 tsp vanilla
2 cups chocolate chips
Instructions
1. Cream the butter and sugar, then beat in the eggs and vanilla.
2. Mix in the flour and fold in the chocolate chips.
3. Bake spoonfuls at 375°F for 10 minutes.`;

  applyTextSize();
  route();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e)));
  }
})();
