/* Recipe Tidy — rule-based recipe parser.
 * Turns messy recipe text (or schema.org JSON-LD) into structured recipes.
 * Works in the browser (window.RecipeParser) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---------- Quantities ----------
  const FRACS = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
  const FC = Object.keys(FRACS).join('');
  const NUM = `(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*[${FC}]|\\d+\\s*\\/\\s*\\d+|\\d+,\\d+(?!\\s*\\d)|\\d*\\.\\d+|\\d+|[${FC}])`;
  const QTY_RE = new RegExp(`^(${NUM})(?:\\s*(?:-|–|—|to|or)\\s*(${NUM}))?(?![\\d.])\\s*`, 'i');

  function parseNum(s) {
    if (s == null) return null;
    s = String(s).trim();
    let m;
    if ((m = s.match(new RegExp(`^(\\d+)\\s*([${FC}])$`)))) return +m[1] + FRACS[m[2]];
    if ((m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/))) return +m[1] + +m[2] / +m[3];
    if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) return +m[2] ? +m[1] / +m[2] : null;
    if (FRACS[s] != null) return FRACS[s];
    const n = parseFloat(s.replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  const NICE = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']];
  function formatQty(n) {
    if (n == null || isNaN(n)) return '';
    if (n >= 20) return String(Math.round(n));
    if (n >= 10) return String(Math.round(n * 2) / 2).replace('.5', '½');
    let whole = Math.floor(n);
    const frac = n - whole;
    let best = NICE[0], err = Infinity;
    for (const c of NICE) { const e = Math.abs(frac - c[0]); if (e < err) { err = e; best = c; } }
    if (err > 0.04) return String(Math.round(n * 100) / 100);
    if (best[0] === 1) { whole += 1; best = NICE[0]; }
    if (!whole && !best[1]) return String(Math.round(n * 100) / 100);
    return (whole ? String(whole) : '') + best[1];
  }

  // ---------- Units ----------
  const UNIT_DEFS = [
    ['tbsp', 'tablespoon', 'tablespoons', ['tablespoons', 'tablespoon', 'tbsps', 'tbsp', 'tbls', 'tbl', 'tbs', 'T']],
    ['tsp', 'teaspoon', 'teaspoons', ['teaspoons', 'teaspoon', 'tsps', 'tsp', 'ts', 't']],
    ['floz', 'fl oz', 'fl oz', ['fluid ounces', 'fluid ounce', 'fl. oz', 'fl oz', 'floz']],
    ['cup', 'cup', 'cups', ['cups', 'cup', 'c']],
    ['oz', 'ounce', 'ounces', ['ounces', 'ounce', 'oz']],
    ['lb', 'pound', 'pounds', ['pounds', 'pound', 'lbs', 'lb']],
    ['kg', 'kg', 'kg', ['kilograms', 'kilogram', 'kgs', 'kg']],
    ['mg', 'mg', 'mg', ['milligrams', 'milligram', 'mg']],
    ['g', 'g', 'g', ['grams', 'gram', 'grs', 'gr', 'g']],
    ['ml', 'ml', 'ml', ['milliliters', 'milliliter', 'millilitres', 'millilitre', 'mls', 'ml', 'mL']],
    ['l', 'liter', 'liters', ['liters', 'liter', 'litres', 'litre', 'l', 'L']],
    ['pint', 'pint', 'pints', ['pints', 'pint', 'pts', 'pt']],
    ['quart', 'quart', 'quarts', ['quarts', 'quart', 'qts', 'qt']],
    ['gallon', 'gallon', 'gallons', ['gallons', 'gallon', 'gal']],
    ['stick', 'stick', 'sticks', ['sticks', 'stick']],
    ['can', 'can', 'cans', ['cans', 'can']],
    ['jar', 'jar', 'jars', ['jars', 'jar']],
    ['package', 'package', 'packages', ['packages', 'package', 'pkgs', 'pkg', 'packets', 'packet']],
    ['bag', 'bag', 'bags', ['bags', 'bag']],
    ['box', 'box', 'boxes', ['boxes', 'box']],
    ['clove', 'clove', 'cloves', ['cloves', 'clove']],
    ['pinch', 'pinch', 'pinches', ['pinches', 'pinch']],
    ['dash', 'dash', 'dashes', ['dashes', 'dash']],
    ['slice', 'slice', 'slices', ['slices', 'slice']],
    ['piece', 'piece', 'pieces', ['pieces', 'piece', 'pcs', 'pc']],
    ['bunch', 'bunch', 'bunches', ['bunches', 'bunch']],
    ['sprig', 'sprig', 'sprigs', ['sprigs', 'sprig']],
    ['head', 'head', 'heads', ['heads', 'head']],
    ['handful', 'handful', 'handfuls', ['handfuls', 'handful']],
    ['drop', 'drop', 'drops', ['drops', 'drop']],
    ['bottle', 'bottle', 'bottles', ['bottles', 'bottle']],
    ['envelope', 'envelope', 'envelopes', ['envelopes', 'envelope']],
    ['scoop', 'scoop', 'scoops', ['scoops', 'scoop']],
    ['strip', 'strip', 'strips', ['strips', 'strip']],
    ['cube', 'cube', 'cubes', ['cubes', 'cube']],
    // Slovak / Czech / Central European units (shown as written)
    ['dkg', 'dkg', 'dkg', ['dkg', 'dag', 'dek']],
    ['dl', 'dl', 'dl', ['dl']],
    ['cl', 'cl', 'cl', ['cl']],
    ['pl', 'PL', 'PL', ['polievkové lyžice', 'polievkovej lyžice', 'polievková lyžica', 'polievkových lyžíc', 'lžíce', 'lžíci', 'PL', 'pl', 'pl.']],
    ['cl_sk', 'ČL', 'ČL', ['čajové lyžičky', 'čajová lyžička', 'čajových lyžičiek', 'čajovej lyžičky', 'lžička', 'lžičky', 'ČL', 'čl', 'KL', 'kl']],
    ['lyzica', 'lyžica', 'lyžice', ['lyžíc', 'lyžice', 'lyžicu', 'lyžica']],
    ['lyzicka', 'lyžička', 'lyžičky', ['lyžičiek', 'lyžičky', 'lyžičku', 'lyžička']],
    ['hrncek', 'hrnček', 'hrnčeky', ['hrnčekov', 'hrnčeky', 'hrnčeka', 'hrnček', 'hrnky', 'hrnek', 'šálky', 'šálka', 'šálku']],
    ['stipka', 'štipka', 'štipky', ['štipky', 'štipku', 'štipka', 'špetka', 'špetku']],
    ['ks', 'ks', 'ks', ['ks', 'kusy', 'kusov', 'kus']],
    ['strucik', 'strúčik', 'strúčiky', ['strúčikov', 'strúčiky', 'strúčik', 'stroužky', 'stroužek']],
    ['balicek', 'balíček', 'balíčky', ['balíčkov', 'balíčky', 'balíčka', 'balíček', 'bal']],
    ['kocka', 'kocka', 'kocky', ['kocky', 'kocku', 'kocka']],
    ['plechovka', 'plechovka', 'plechovky', ['plechoviek', 'plechovky', 'plechovku', 'plechovka', 'konzervy', 'konzerva']],
    ['EL', 'EL', 'EL', ['EL', 'Esslöffel']],
    ['TL', 'TL', 'TL', ['TL', 'Teelöffel']],
    ['cda', 'cda', 'cda', ['cucharadas', 'cucharada', 'cda']],
    ['cdta', 'cdta', 'cdta', ['cucharaditas', 'cucharadita', 'cdta']],
    ['cas', 'c. à s.', 'c. à s.', ['c. à soupe', 'c. à s.', 'cs']],
    ['cac', 'c. à c.', 'c. à c.', ['c. à café', 'c. à c.', 'cc']]
  ];
  const CASE_SENSITIVE = new Set(['T', 't', 'L', 'c', 'EL', 'TL', 'cc', 'cs']);
  const UNIT_LIST = [];
  for (const [key, sing, plur, aliases] of UNIT_DEFS) for (const a of aliases) UNIT_LIST.push({ key, sing, plur, alias: a });
  UNIT_LIST.sort((a, b) => b.alias.length - a.alias.length);

  function matchUnit(s) {
    for (const u of UNIT_LIST) {
      const esc = u.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^${esc}\\.?(?![\\p{L}])`, CASE_SENSITIVE.has(u.alias) ? 'u' : 'iu');
      const m = s.match(re);
      if (m) {
        // single letter units must be followed by a space and more text ("2 c flour"), not be the word itself
        if (u.alias.length === 1 && !/^\.?\s+\S/.test(s.slice(u.alias.length))) continue;
        return { unit: u, len: m[0].length };
      }
    }
    return null;
  }

  function unitLabel(ing, value) {
    if (!ing.unitKey) return '';
    const def = UNIT_DEFS.find(d => d[0] === ing.unitKey);
    if (!def) return ing.unit || '';
    const orig = ing.unit || '';
    if (orig === 'T') return 'tbsp';
    if (orig === 't') return 'tsp';
    if (orig === 'c' || orig === 'C') return value != null && value > 1 ? 'cups' : 'cup';
    const isWord = orig.toLowerCase() === def[1] || orig.toLowerCase() === def[2];
    if (!isWord) return orig; // keep abbreviations as written (tbsp, g, oz)
    return value != null && value > 1 ? def[2] : def[1];
  }

  // ---------- Ingredients ----------
  const BULLET_RE = /^\s*(?:[-*•·▪◦‣–—+>]|\[\s?[xX]?\s?\]|▢|☐|□|o(?=\s))\s*/;

  function cleanLine(s) {
    return String(s || '')
      .replace(/ /g, ' ')
      .replace(/(\d)\s*⁄\s*(\d)/g, '$1/$2') // fraction slash
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseIngredient(raw) {
    let text = cleanLine(raw).replace(BULLET_RE, '').replace(/^\*\*|\*\*$/g, '').trim();
    const ing = { raw: text, qty: null, qtyMax: null, unit: '', unitKey: '', size: '', name: text };
    let rest = text;
    // "a" / "an" as a quantity of 1 when followed by a unit ("a pinch of salt")
    const aM = rest.match(/^(an?)\s+/i);
    if (aM) {
      const u = matchUnit(rest.slice(aM[0].length));
      if (u) { ing.qty = 1; rest = rest.slice(aM[0].length); }
    }
    if (ing.qty == null) {
      const m = rest.match(QTY_RE);
      if (m && !/^\d+[.)]\s/.test(rest)) {
        ing.qty = parseNum(m[1]);
        ing.qtyMax = m[2] ? parseNum(m[2]) : null;
        rest = rest.slice(m[0].length);
      }
    }
    if (ing.qty != null) {
      const sz = rest.match(/^\(([^)]{1,30})\)\s*/);
      if (sz) { ing.size = sz[1].trim(); rest = rest.slice(sz[0].length); }
      const u = matchUnit(rest);
      if (u) {
        ing.unit = rest.slice(0, u.len).replace(/\.$/, '');
        ing.unitKey = u.unit.key;
        rest = rest.slice(u.len).trim();
        rest = rest.replace(/^of\s+/i, '');
      }
    }
    ing.name = rest.trim() || text;
    return ing;
  }

  function formatIngredient(ing, factor) {
    factor = factor || 1;
    if (ing.qty == null) return { amount: '', name: ing.name };
    const q = ing.qty * factor;
    const qm = ing.qtyMax != null ? ing.qtyMax * factor : null;
    let amount = formatQty(q) + (qm != null ? '–' + formatQty(qm) : '');
    const unit = unitLabel(ing, qm != null ? qm : q);
    if (ing.size) amount += ` (${ing.size})`;
    if (unit) amount += ' ' + unit;
    return { amount, name: ing.name };
  }

  // ---------- Section detection ----------
  function headerKey(line) {
    return line.replace(/^[#*_=\-\s]+|[#*_=:\-\s]+$/g, '').replace(/\s+/g, ' ').toLowerCase();
  }
  const ING_HDR = /^(?:ingredients?(?: list)?|what you(?:'|’)?ll need|you(?:'|’)?ll need|you will need|what you need|shopping list|suroviny|potrebné suroviny|potrebujeme|ingrediencie|ingredience|zutaten|ingredientes|ingrédients|ingredienti|składniki|hozzávalók)$/;
  const DIR_HDR = /^(?:directions?|instructions?|method|preparation|steps|prep(?:aration)? steps|how to make(?: it)?|procedure|to make|cooking instructions|the method|postup|postup prípravy|príprava|příprava|návod|zubereitung|preparación|elaboración|préparation|preparazione|procedimento|przygotowanie|sposób przygotowania|elkészítés)$/;
  const NOTE_HDR = /^(?:notes?|tips?|poznámka|poznámky|tip|rada|hinweis|tipps?|notas?|consejos?|astuces?|consigli|uwagi|cook(?:'|’)?s notes?|chef(?:'|’)?s notes?|recipe notes?|variations?|storage|to store|serving suggestions?|nutrition(?: facts| info(?:rmation)?)?)$/;
  const INLINE_HDR = /^(ingredients?|directions?|instructions?|method|notes?|suroviny|postup|poznámka)\s*:\s*(.+)$/i;

  const SERV_RE = /\b(?:serves|servings?|yields?|makes|portions?|feeds)\b\s*:?\s*(?:about|approx\.?|approximately)?\s*(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*([a-z][a-z ]{0,20})?/i;
  const SERV_RE2 = /\b(?:porci[ea]|porcií|počet porcií|portionen|porciones|porzioni|portions)\s*:?\s*(\d+)|\b(?:pre|na|für|para|per|pour)\s+(\d+)\s*(?:os[oô]b|osoby|personen|personas|persone|personnes|porci)/i;
  const TIME_VAL = '(\\d[\\d\\s\\/.½¼¾-]*\\s*(?:hodín|hodiny|hodina|hod|hours?|hrs?|hr|h|minút|minúty|minut|minutes?|mins?|min|m)\\b(?:\\s*(?:and\\s*)?\\d+\\s*(?:minutes?|mins?|min|m)\\b)?)';
  const TIME_RES = {
    prep: new RegExp(`(?:čas prípravy|príprava|\\bprep(?:aration)?)(?:\\s*time)?\\s*:?\\s*${TIME_VAL}`, 'i'),
    cook: new RegExp(`(?:čas pečenia|čas varenia|pečenie|varenie|\\bcook(?:ing)?|\\bbake|\\bbaking)(?:\\s*time)?\\s*:?\\s*${TIME_VAL}`, 'i'),
    total: new RegExp(`(?:celkový čas|\\btotal(?:\\s*time)?|\\bready in)\\s*:?\\s*${TIME_VAL}`, 'i')
  };

  function readMeta(line, r) {
    let hit = false;
    const s = line.match(SERV_RE) || line.match(SERV_RE2);
    if (s && line.length < 90) {
      r.servings = r.servings || parseInt(s[1] || s[2], 10);
      if (!r.yieldText) r.yieldText = line.replace(/^[#*_\s]+|[*_\s]+$/g, '');
      hit = true;
    }
    for (const k of Object.keys(TIME_RES)) {
      const m = line.match(TIME_RES[k]);
      if (m && line.length < 120) { if (!r.times[k]) r.times[k] = m[1].trim(); hit = true; }
    }
    return hit;
  }

  function isTitleLike(line) {
    const t = line.replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').trim();
    if (!t || t.length > 70 || t.length < 2) return false;
    if (/[.!?,;]$/.test(t) && !/\.\.\.$/.test(t)) return false;
    if (QTY_RE.test(t) && !/^\d+[.)]?\s*$/.test(t)) return false;
    if (/^\d+[.)]\s/.test(t)) return false;
    const k = headerKey(t);
    if (ING_HDR.test(k) || DIR_HDR.test(k) || NOTE_HDR.test(k)) return false;
    if (SERV_RE.test(t) || SERV_RE2.test(t) || TIME_RES.prep.test(t) || TIME_RES.cook.test(t) || TIME_RES.total.test(t)) return false;
    if (/^(page \d+|\d+)$/i.test(t)) return false;
    return /\p{L}/u.test(t);
  }

  function isStrongTitle(line) {
    if (!isTitleLike(line)) return false;
    const t = line.replace(/^\*\*|\*\*$/g, '').trim();
    return /^#{1,3}\s/.test(line) || (t === t.toUpperCase() && /[A-Z]{3}/.test(t)) || /^\*\*.+\*\*$/.test(line.trim());
  }

  function isStepLike(line) {
    const t = line.replace(BULLET_RE, '');
    if (/^(?:step\s*)?\d+\s*[.):-]\s+\S/i.test(t)) return true;
    if (t.length > 70 && /[.!]$/.test(t)) return true;
    return /^(predhrej|zmiešame|zmiešajte|vymiešame|pridáme|pridajte|nakrájame|uvaríme|pečieme|necháme|rozvaľkáme|preheat|heat|in a|combine|mix|whisk|stir|add|place|bake|cook|bring|pour|remove|let|serve|season|cover|melt|beat|fold|transfer|spread|sprinkle|simmer|boil|grease|line|cut|chop|slice|blend|roll|knead|cream|set|top|drain|return|reduce)\b/i.test(t) && t.split(' ').length > 5;
  }

  function isIngredientLike(line) {
    const t = cleanLine(line).replace(BULLET_RE, '');
    if (!t || isStepLike(t)) return false;
    const ing = parseIngredient(t);
    if (ing.qty != null) return true;
    if (/^(salt|pepper|salt and pepper|oil|water|ice)\b/i.test(t) && t.length < 50) return true;
    if (/\bto taste\b|\bfor (?:garnish|serving|frying|greasing)\b|\bas needed\b|\boptional\b/i.test(t) && t.length < 70) return true;
    return false;
  }

  function stripStepNum(t) {
    return t.replace(BULLET_RE, '').replace(/^(?:step\s*)?\d+\s*[.):-]\s*/i, '').trim();
  }

  function isGroupHeader(line) {
    const t = line.replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').trim();
    if (t.length > 45 || QTY_RE.test(t)) return false;
    return /:$/.test(t) || /^(?:for (?:the )?|na )\p{L}/iu.test(t) || /^#{2,}\s/.test(line);
  }


  // ---------- Auto categories ----------
  const CATEGORIES = ['Breakfast', 'Soups & stews', 'Salads', 'Main dishes', 'Sides', 'Breads & baking', 'Desserts', 'Sauces & dips', 'Snacks & appetizers', 'Drinks', 'Preserves', 'Other'];
  // Keywords are matched without accents, so OCR'd "polievka" and "polievka" both hit.
  const CAT_WORDS = {
    'Breakfast': 'breakfast pancake waffle omelet omelette granola oatmeal porridge french toast frittata scrambled smoothie bowl hash brown ranajky ovsena kasa mic frühstück desayuno',
    'Soups & stews': 'soup stew chowder chili bisque broth gumbo ramen pho minestrone polievka polievky vyvar gulas gulasova kapustnica fazulovica bors strukovinova cesnackova paradajkova kulajda demikat polevka suppe sopa soupe zuppa zupa',
    'Salads': 'salad slaw salat salata ensalada salade insalata salatka',
    'Main dishes': 'chicken beef pork steak lamb turkey salmon fish shrimp tacos burger lasagna pasta spaghetti curry casserole meatball meatloaf roast enchilada stir fry risotto pizza kuraci kuracie kura bravcove bravcova hovadzie hovadzia rezen rezne sviečkova sviekova paprikas kapor ryba halusky pirohy segedin plnena kacica morka maso masom fasirky rizoto',
    'Sides': 'side rice potatoes mashed fries roasted vegetables coleslaw dumpling dumplings knedle knedliky ryza zemiaky zemiakova kasa hranolky priloha zemiakovy',
    'Breads & baking': 'bread rolls buns focaccia baguette biscuits scones bagel pretzel loaf dough banana bread cornbread chlieb chleba rozky pagace vianocka bagety cesto kysnute kysnuteho calta kolac na chlieb',
    'Desserts': 'cake cookie cookies brownie brownies pie tart muffin cupcake cheesecake pudding dessert frosting icing fudge candy ice cream crumble cobbler tiramisu torta tortu kolac kolace kolaciky buchty strudla zavin pernik pernicky medovnik oblatky linecke sisky palacinky babovka laskonky zakusok mucnik krem rezy salka vanilkove rohliky orechovnik makovnik tvarohovnik bublanina kuchen pastel gateau dolce ciasto',
    'Sauces & dips': 'sauce dressing dip salsa pesto gravy marinade aioli hummus guacamole vinaigrette omacka natierka dresing',
    'Snacks & appetizers': 'appetizer appetizers snack snacks bites chips crackers deviled wings nachos jednohubky chlebicky pochutka pochutky',
    'Drinks': 'drink cocktail lemonade tea coffee punch latte milkshake juice napoj limonada caj punc kava sirup',
    'Preserves': 'jam jelly pickles pickled preserve preserves chutney marmalade dzem lekvar zavarania zavaranina kompot sterilizovane uhorky'
  };
  const ING_HINTS = {
    'Breads & baking': 'yeast drozdie kvasok',
    'Desserts': 'baking powder baking soda powdered sugar cocoa vanilla prasok do peciva vanilkovy cukor kakao maslo cukor',
    'Main dishes': 'chicken beef pork salmon kuracie bravcove hovadzie maso ryba'
  };
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hasWord = (hay, w) => new RegExp(`(?:^|[^a-z])${w.replace(/ /g, '\\s+')}(?:$|[^a-z])`).test(hay);
  function categorize(r) {
    const title = fold(r.title + ' ' + (r.tags || []).join(' '));
    const ings = fold(r.groups.map(g => g.items.map(i => i.name).join(' ')).join(' '));
    let best = 'Other', score = 0;
    for (const c of Object.keys(CAT_WORDS)) {
      let sc = 0;
      for (const w of CAT_WORDS[c].split(' ')) if (w.length > 2 && hasWord(title, w)) sc += 3 + w.length / 20;
      for (const w of (ING_HINTS[c] || '').split(' ')) if (w.length > 2 && hasWord(ings, w)) sc += 0.6;
      if (sc > score) { score = sc; best = c; }
    }
    return score >= 1.2 ? best : 'Other';
  }
  function normalizeCategory(c) {
    if (!c) return '';
    const f = fold(c);
    return CATEGORIES.find(x => fold(x) === f) || CATEGORIES.find(x => fold(x).startsWith(f.slice(0, 5))) || '';
  }

  // ---------- Recipe model ----------
  function emptyRecipe() {
    return { title: '', description: '', servings: null, yieldText: '', times: { prep: '', cook: '', total: '' }, groups: [], steps: [], notes: [], tags: [] };
  }

  function finalize(r) {
    r.groups = r.groups.filter(g => g.items.length);
    r.title = (r.title || '').replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').trim() || 'Untitled recipe';
    if (r.title === r.title.toUpperCase() && r.title.length > 3) r.title = titleCase(r.title);
    r.description = r.description.trim();
    r.steps = r.steps.map(s => s.trim()).filter(Boolean);
    r.notes = r.notes.map(s => s.trim()).filter(Boolean);
    r.category = normalizeCategory(r.category) || categorize(r);
    return r;
  }

  function titleCase(s) {
    const small = /^(a|an|and|or|the|of|in|on|with|for|to|de|la|al)$/;
    return s.toLowerCase().split(' ').map((w, i) => (i && small.test(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Parse one block of lines into a recipe.
  function parseBlock(lines) {
    const r = emptyRecipe();
    const hasIng = lines.some(l => ING_HDR.test(headerKey(l)) || INLINE_HDR.test(l) && /^ingr/i.test(l));
    const hasDir = lines.some(l => DIR_HDR.test(headerKey(l)));
    let state = 'pre';
    let group = null;
    let lastIng = null;
    let stepNumbered = false;
    let blankBefore = false;
    const newGroup = name => { group = { name: name || '', items: [] }; r.groups.push(group); };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (!line) { blankBefore = true; continue; }
      const key = headerKey(line);

      // Section headers
      if (ING_HDR.test(key)) { state = 'ing'; newGroup(''); blankBefore = false; continue; }
      if (DIR_HDR.test(key)) { state = 'steps'; blankBefore = false; continue; }
      if (NOTE_HDR.test(key) && state !== 'pre') { state = 'notes'; blankBefore = false; continue; }
      const inl = line.match(INLINE_HDR);
      if (inl) {
        const which = inl[1].toLowerCase();
        line = inl[2].trim();
        if (which.startsWith('ingr')) { state = 'ing'; newGroup(''); }
        else if (which.startsWith('note')) state = 'notes';
        else state = 'steps';
        if (state === 'ing' && /,/.test(line) && (line.match(new RegExp(NUM, 'g')) || []).length > 1) {
          line.split(/\s*,\s*(?=\S)/).forEach(p => { const it = parseIngredient(p); group.items.push(it); lastIng = it; });
          continue;
        }
      }

      if (state === 'pre') {
        if (!r.title && isTitleLike(line)) { r.title = line; blankBefore = false; continue; }
        if (readMeta(line, r)) { blankBefore = false; continue; }
        if (!hasIng && isIngredientLike(line)) { state = 'ing'; newGroup(''); }
        else if (!hasIng && !hasDir && r.title && isStepLike(line) && r.groups.length) { state = 'steps'; }
        else { r.description += (r.description ? ' ' : '') + line; blankBefore = false; continue; }
      }

      if (state === 'ing') {
        if (readMeta(line, r) && !isIngredientLike(line)) { blankBefore = false; continue; }
        if (!hasDir && isStepLike(line)) { state = 'steps'; }
        else {
          const t = line.replace(BULLET_RE, '');
          if (isGroupHeader(line) && !isIngredientLike(t)) {
            const name = t.replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').replace(/:$/, '').trim();
            if (group && !group.items.length) group.name = name; else newGroup(name);
            lastIng = null; blankBefore = false; continue;
          }
          // wrapped continuation line (common in PDFs)
          if (lastIng && !blankBefore && !BULLET_RE.test(line) && /^[\p{Ll}(]/u.test(t) && !isIngredientLike(t) && !matchUnit(t) &&
            t.split(' ').length <= 5 && (/(?:[,(/-]|\b(?:and|or|with|a|alebo|s|so))$/i.test(lastIng.raw) || lastIng.raw.length >= 28)) {
            lastIng.raw += ' ' + t; lastIng.name += ' ' + t; continue;
          }
          if (!group) newGroup('');
          const ing = parseIngredient(line);
          group.items.push(ing); lastIng = ing; blankBefore = false; continue;
        }
      }

      if (state === 'steps') {
        const t = line.replace(BULLET_RE, '');
        const numbered = /^(?:step\s*)?\d+\s*[.):-]\s*\S/i.test(t) || /^step\s*\d+\s*$/i.test(t);
        if (/^step\s*\d+\s*:?\s*$/i.test(t)) { r.steps.push(''); stepNumbered = true; blankBefore = false; continue; }
        if (numbered) stepNumbered = true;
        const text = stripStepNum(line);
        const prev = r.steps.length ? r.steps[r.steps.length - 1] : null;
        const continues = prev != null && !numbered && (
          prev === '' ||
          (stepNumbered && !blankBefore && !BULLET_RE.test(line)) ||
          (!/[.!?:)]$/.test(prev) && /^[\p{Ll}(]/u.test(text))
        );
        if (continues) r.steps[r.steps.length - 1] = (prev ? prev + ' ' : '') + text;
        else r.steps.push(text);
        blankBefore = false; continue;
      }

      if (state === 'notes') {
        const t = line.replace(BULLET_RE, '');
        const prev = r.notes.length ? r.notes[r.notes.length - 1] : null;
        if (prev != null && !blankBefore && !BULLET_RE.test(line) && !/[.!?:)]$/.test(prev)) r.notes[r.notes.length - 1] += ' ' + t;
        else r.notes.push(t);
        blankBefore = false;
      }
    }
    return finalize(r);
  }

  // Split a document into one block per recipe.
  function splitBlocks(lines) {
    const hdr = [];
    lines.forEach((l, i) => { if (l && (ING_HDR.test(headerKey(l)) || /^ingredients?\s*:\s*\S/i.test(l))) hdr.push(i); });
    if (hdr.length <= 1) return [lines];
    const starts = [];
    let floor = 0;
    for (let k = 0; k < hdr.length; k++) {
      const h = hdr[k];
      let titleIdx = -1, strongIdx = -1, seen = 0;
      for (let j = h - 1; j >= floor && seen < 10; j--) {
        if (!lines[j]) continue;
        seen++;
        if (strongIdx < 0 && isStrongTitle(lines[j])) strongIdx = j;
        if (titleIdx < 0 && isTitleLike(lines[j])) titleIdx = j;
        if (strongIdx >= 0) break;
      }
      let start = strongIdx >= 0 ? strongIdx : titleIdx >= 0 ? titleIdx : h;
      if (k === 0) start = 0; // keep anything before the first recipe with it
      starts.push(start);
      floor = h + 1;
    }
    const blocks = [];
    for (let k = 0; k < starts.length; k++) blocks.push(lines.slice(starts[k], k + 1 < starts.length ? starts[k + 1] : lines.length));
    return blocks;
  }

  function parseText(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(cleanLine);
    // Drop obvious junk: page numbers, URLs alone, "Print recipe" etc.
    const filtered = lines.map(l => (/^(page \d+( of \d+)?|\d{1,3}|print( recipe)?|jump to recipe|pin( it)?|save recipe|https?:\/\/\S+)$/i.test(l) ? '' : l));
    const blocks = splitBlocks(filtered);
    return blocks.map(parseBlock).filter(r => r.groups.some(g => g.items.length) || r.steps.length);
  }

  // ---------- schema.org JSON-LD (saved web pages) ----------
  function isoDuration(s) {
    if (!s || typeof s !== 'string') return '';
    const m = s.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
    if (!m) return s;
    const d = +(m[1] || 0), h = +(m[2] || 0) + d * 24, mi = +(m[3] || 0);
    if (!h && !mi) return '';
    return [h ? `${h} hr` : '', mi ? `${mi} min` : ''].filter(Boolean).join(' ');
  }
  function decode(s) {
    return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  }
  function findRecipeNodes(node, out) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach(n => findRecipeNodes(n, out)); return out; }
    const t = node['@type'];
    if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) out.push(node);
    if (node['@graph']) findRecipeNodes(node['@graph'], out);
    return out;
  }
  function fromSchema(node) {
    const r = emptyRecipe();
    r.title = decode(node.name);
    r.description = decode(node.description);
    const y = Array.isArray(node.recipeYield) ? node.recipeYield : [node.recipeYield];
    for (const v of y) {
      if (v == null) continue;
      const n = parseInt(String(v), 10);
      if (!r.servings && !isNaN(n)) r.servings = n;
      if (!r.yieldText && isNaN(+v)) r.yieldText = decode(v);
    }
    r.times.prep = isoDuration(node.prepTime);
    r.times.cook = isoDuration(node.cookTime);
    r.times.total = isoDuration(node.totalTime);
    r.groups = [{ name: '', items: (node.recipeIngredient || node.ingredients || []).map(s => parseIngredient(decode(s))) }];
    const walk = (ins, prefix) => {
      if (!ins) return;
      if (typeof ins === 'string') { decode(ins).split(/\n+|(?<=\.)\s+(?=[A-Z])/).forEach(s => s.trim() && r.steps.push(s.trim())); return; }
      if (Array.isArray(ins)) { ins.forEach(i => walk(i, prefix)); return; }
      if (ins['@type'] === 'HowToSection' || ins.itemListElement) { walk(ins.itemListElement, decode(ins.name)); return; }
      const txt = decode(ins.text || ins.name);
      if (txt) r.steps.push(txt);
    };
    walk(node.recipeInstructions);
    const kw = node.keywords ? (Array.isArray(node.keywords) ? node.keywords : String(node.keywords).split(',')) : [];
    r.tags = [].concat(node.recipeCategory || [], node.recipeCuisine || []).concat(kw).map(decode).filter(Boolean).slice(0, 8);
    return finalize(r);
  }
  function parseJsonLd(jsonStrings) {
    const out = [];
    for (const s of jsonStrings) {
      try { findRecipeNodes(JSON.parse(s), []).forEach(n => out.push(fromSchema(n))); } catch (e) { /* ignore bad blocks */ }
    }
    return out;
  }

  // ---------- AI output → recipe ----------
  function fromAI(obj) {
    const r = emptyRecipe();
    r.title = obj.title || '';
    r.description = obj.description || '';
    r.servings = obj.servings ? parseInt(obj.servings, 10) || null : null;
    r.yieldText = obj.yield || obj.yieldText || '';
    r.times = { prep: obj.prepTime || '', cook: obj.cookTime || '', total: obj.totalTime || '' };
    r.groups = (obj.ingredientGroups || []).map(g => ({ name: g.name || '', items: (g.items || []).map(parseIngredient) }));
    r.steps = (obj.steps || []).map(String);
    r.notes = (obj.notes || []).map(String);
    r.tags = (obj.tags || []).map(String).slice(0, 8);
    r.category = obj.category || '';
    if (obj.originalTitle && obj.originalTitle !== r.title) r.originalTitle = String(obj.originalTitle);
    return finalize(r);
  }


  // ---------- Converting European units when a recipe is translated ----------
  const TO_EN = {
    dkg: ['g', 'g', 10], dl: ['ml', 'ml', 100], cl: ['ml', 'ml', 10],
    pl: ['tbsp', 'tbsp'], lyzica: ['tbsp', 'tbsp'], EL: ['tbsp', 'tbsp'], cda: ['tbsp', 'tbsp'], cas: ['tbsp', 'tbsp'],
    cl_sk: ['tsp', 'tsp'], lyzicka: ['tsp', 'tsp'], TL: ['tsp', 'tsp'], cdta: ['tsp', 'tsp'], cac: ['tsp', 'tsp'],
    hrncek: ['cup', 'cup'], stipka: ['pinch', 'pinch'], ks: ['piece', 'piece'], strucik: ['clove', 'clove'],
    balicek: ['package', 'package'], kocka: ['cube', 'cube'], plechovka: ['can', 'can']
  };
  function toEnglishUnits(ing) {
    const c = TO_EN[ing.unitKey];
    if (!c) return ing;
    ing.unitKey = c[0]; ing.unit = c[1];
    if (c[2]) {
      if (ing.qty != null) ing.qty *= c[2];
      if (ing.qtyMax != null) ing.qtyMax *= c[2];
    }
    return ing;
  }

  // ---------- Back to text (for editing / export) ----------
  function toEditableText(r) {
    const out = [r.title, ''];
    if (r.description) out.push(r.description, '');
    if (r.servings) out.push(`Servings: ${r.servings}`);
    if (r.times.prep) out.push(`Prep time: ${r.times.prep}`);
    if (r.times.cook) out.push(`Cook time: ${r.times.cook}`);
    if (r.times.total) out.push(`Total time: ${r.times.total}`);
    out.push('', 'Ingredients');
    r.groups.forEach(g => { if (g.name) out.push('', g.name + ':'); g.items.forEach(i => out.push('- ' + i.raw)); });
    out.push('', 'Directions');
    r.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`));
    if (r.notes.length) { out.push('', 'Notes'); r.notes.forEach(n => out.push('- ' + n)); }
    return out.join('\n');
  }

  function toMarkdown(r, factor) {
    factor = factor || 1;
    const out = [`# ${r.title}`, ''];
    if (r.description) out.push(r.description, '');
    const meta = [];
    if (r.servings) meta.push(`**Serves:** ${Math.round(r.servings * factor * 10) / 10}`);
    if (r.times.prep) meta.push(`**Prep:** ${r.times.prep}`);
    if (r.times.cook) meta.push(`**Cook:** ${r.times.cook}`);
    if (r.times.total) meta.push(`**Total:** ${r.times.total}`);
    if (meta.length) out.push(meta.join(' · '), '');
    out.push('## Ingredients', '');
    r.groups.forEach(g => {
      if (g.name) out.push(`**${g.name}**`, '');
      g.items.forEach(i => { const f = formatIngredient(i, factor); out.push(`- ${[f.amount, f.name].filter(Boolean).join(' ')}`); });
      out.push('');
    });
    out.push('## Directions', '');
    r.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`));
    if (r.notes.length) { out.push('', '## Notes', ''); r.notes.forEach(n => out.push(`- ${n}`)); }
    return out.join('\n') + '\n';
  }

  const api = { CATEGORIES, categorize, toEnglishUnits, parseText, parseBlock, parseIngredient, formatIngredient, formatQty, parseNum, parseJsonLd, fromAI, toEditableText, toMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecipeParser = api;
})(typeof window !== 'undefined' ? window : this);
