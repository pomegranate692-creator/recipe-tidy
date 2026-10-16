/* Recipe Snap — rule-based recipe parser.
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
    ['stick', 'stick', 'sticks', ['sticks', 'stick', 'st']],
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
    ['handful', 'handful', 'handfuls', ['handfuls', 'handful', 'hrsti', 'hrste', 'hrsť', 'hrst']],
    ['drop', 'drop', 'drops', ['drops', 'drop']],
    ['bottle', 'bottle', 'bottles', ['bottles', 'bottle']],
    ['envelope', 'envelope', 'envelopes', ['envelopes', 'envelope']],
    ['scoop', 'scoop', 'scoops', ['scoops', 'scoop']],
    ['strip', 'strip', 'strips', ['strips', 'strip']],
    ['cube', 'cube', 'cubes', ['cubes', 'cube']],
    // Slovak / Czech / Central European units (shown as written)
    // handwritten "20 dg" in Slovak notebooks means dekagrams
    ['dkg', 'dkg', 'dkg', ['dkg', 'dag', 'dek', 'dg']],
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
  const BULLET_RE = /^\s*(?:[-*•·▪◦‣–—+>●○■◆➢➤✓✔]|\[\s?[xX]?\s?\]|▢|☐|□|o(?=\s))\s*/;

  function cleanLine(s) {
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/(\d)\s*⁄\s*(\d)/g, '$1/$2') // fraction slash
      .replace(/\s\|\s/g, ' / ')
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
  const INLINE_HDR = /^(ingredients?|directions?|instructions?|method|notes?|tips?|cook(?:'|’)?s note|suroviny|postup|poznámka|tip)\s*:\s*(.+)$/i;

  const SERV_RE = /\b(?:serves|servings?|yields?|makes|portions?|feeds)\b\s*:?\s*(?:about|approx\.?|approximately)?\s*(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*([a-z][a-z ]{0,20})?/i;
  const SERV_RE2 = /\b(?:porci[ea]|porcií|počet porcií|portionen|porciones|porzioni|portions)\s*:?\s*(\d+)|\b(?:pre|na|für|para|per|pour)\s+(\d+)\s*(?:os[oô]b|osoby|personen|personas|persone|personnes|porci)/i;
  const TIME_VAL = '(\\d[\\d\\s\\/.½¼¾-]*(?:(?:to|–)\\s*\\d[\\d\\s\\/.]*)?\\s*(?:hodín|hodiny|hodina|hod|hours?|hrs?|hr|h|minút|minúty|minut|minutes?|mins?|min|m)\\b(?:\\s*,?\\s*(?:and\\s*)?\\d+\\s*(?:minutes?|mins?|min|m)\\b)?)';
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
    if (/^\s*(?:[•·▪◦‣–—●○■]|[-*+](?=\s))/.test(line)) return false; // a bulleted line is never a title
    const t = line.replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').trim();
    if (!t || t.length > 70 || t.length < 2) return false;
    if (/[.!?,;]$/.test(t) && !/\.\.\.$/.test(t)) return false;
    if (QTY_RE.test(t) && !/^\d+[.)]?\s*$/.test(t)) return false;
    if (/^\d+[.)]\s/.test(t)) return false;
    const k = headerKey(t);
    if (ING_HDR.test(k) || DIR_HDR.test(k) || NOTE_HDR.test(k)) return false;
    if (SERV_RE.test(t) || SERV_RE2.test(t) || TIME_RES.prep.test(t) || TIME_RES.cook.test(t) || TIME_RES.total.test(t)) return false;
    if (/^(page \d+|\d+)$/i.test(t)) return false;
    if (/^[\p{L} ]{2,20}:\s*\S*\d/u.test(t)) return false; // "Oven: 425°F", "Makes: 6"
    if (/^[\p{L} ]{2,20}:\s+\S/u.test(t) && META_LABEL.test(t)) return false; // "Course: Dessert"
    if ((t.match(/\(/g) || []).length !== (t.match(/\)/g) || []).length) return false; // "CRUST)" is the end of a note
    return /\p{L}/u.test(t);
  }

  function isStrongTitle(line) {
    if (!isTitleLike(line)) return false;
    const t = line.replace(/^\*\*|\*\*$/g, '').trim();
    return /^#{1,3}\s/.test(line) || (t === t.toUpperCase() && /[A-Z]{3}/.test(t)) || /^\*\*.+\*\*$/.test(line.trim());
  }

  const STEP_VERB = /^(predhrej\w*|zmieša\w*|vymieša\w*|prida\w*|nakrája\w*|uvarí\w*|upeč\w*|pečie\w*|necha\w*|rozvaľka\w*|preheat|heat|combine|mix|whisk|stir|add|place|bake|cook|bring|pour|remove|let|serve|season|cover|melt|beat|fold|transfer|spread|sprinkle|simmer|boil|grease|line|cut|chop|slice|blend|roll|knead|cream|set|top|drain|return|reduce|toss|mash|crush|dissolve|halve|scoop|divide|fill|brown|roast|scramble|preheat|refrigerate|chill|marinate|whip|puree|saute|sauté|fry|grill|arrange|shape|form|garnish|squeeze|peel|wash|rinse|soak|drop|ladle|sift|switch|cool|taste|reheat|gently|generously|immediately|dust|repeat|wrap)\b/i;

  function isStepLike(line) {
    const t = line.replace(BULLET_RE, '');
    if (/^(?:step\s*)?\d+\s*(?:[.):]|-(?=\s))\s+\S/i.test(t)) return true;
    if (bareStep(t)) return true;
    if (t.length > 70 && /[.!]$/.test(t)) return true;
    return /^(predhrej|zmiešame|zmiešajte|vymiešame|pridáme|pridajte|nakrájame|uvaríme|pečieme|necháme|rozvaľkáme|preheat|heat|in a|combine|mix|whisk|stir|add|place|bake|cook|bring|pour|remove|let|serve|season|cover|melt|beat|fold|transfer|spread|sprinkle|simmer|boil|grease|line|cut|chop|slice|blend|roll|knead|cream|set|top|drain|return|reduce)\b/i.test(t) && t.split(' ').length > 5;
  }

  // "1 Pour the milk into the bowl." (a step number with no period, as in many PDFs)
  function bareStep(t) {
    const m = t.match(/^(\d{1,2})\s+(\p{Lu}\p{Ll}+)\b(.*)$/u);
    if (!m || matchUnit(m[2] + m[3])) return false;
    const words = t.split(/\s+/).length;
    return words >= 5 && (STEP_VERB.test(m[2]) || /[.!]$/.test(t) || t.length > 60);
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

  function looksLikeInstruction(line) {
    const t = cleanLine(line).replace(BULLET_RE, '');
    if (!t || isIngredientLike(t) || isGroupHeader(line)) return false;
    const words = t.split(/\s+/).length;
    return words >= 7 || (/[.!]$/.test(t) && words >= 4) || (words >= 3 && STEP_VERB.test(t));
  }

  function stripStepNum(t) {
    return t.replace(BULLET_RE, '').replace(/^(?:step\s*)?\d+\s*(?:[.):]|-(?=\s))\s*/i, '').trim();
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
    'Breakfast': 'breakfast pancake waffle omelet omelette granola oatmeal porridge french toast frittata scrambled smoothie hash brown ranajky ovsena kasa mic frühstück desayuno',
    'Soups & stews': 'soup stew chowder chili bisque broth gumbo ramen pho minestrone polievka polievky vyvar gulas gulasova kapustnica fazulovica bors strukovinova cesnackova paradajkova kulajda demikat polevka suppe sopa soupe zuppa zupa',
    'Salads': 'salad slaw salat salata ensalada salade insalata salatka',
    'Main dishes': 'teriyaki chicken beef pork steak lamb turkey salmon fish shrimp tacos burger lasagna pasta spaghetti curry casserole meatball meatloaf roast enchilada stir fry risotto pizza sauerkraut sausage kuraci kuracie kura bravcove bravcova hovadzie hovadzia rezen rezne sviečkova sviekova paprikas kapor ryba halusky pirohy segedin plnena kacica morka maso masom fasirky rizoto',
    'Sides': 'side rice potatoes mashed fries roasted vegetables coleslaw dumpling dumplings knedle knedliky ryza zemiaky zemiakova kasa hranolky priloha zemiakovy',
    'Breads & baking': 'bread rolls buns focaccia baguette biscuits scones bagel pretzel loaf dough banana bread cornbread chlieb chleba rozky pagace vianocka bagety cesto kysnute kysnuteho calta kolac na chlieb',
    'Desserts': 'cake cookie cookies brownie brownies pie tart muffin cupcake cheesecake pudding dessert frosting icing fudge candy ice cream crumble cobbler tiramisu torta tortu kolac kolace kolaciky buchty strudla zavin pernik pernicky medovnik oblatky linecke sisky palacinky babovka laskonky zakusok mucnik krem rezy salka vanilkove rohliky orechovnik makovnik tvarohovnik bublanina kuchen pastel gateau dolce ciasto',
    'Sauces & dips': 'sauce dressing dip salsa pesto gravy marinade aioli hummus guacamole vinaigrette omacka natierka dresing',
    'Snacks & appetizers': 'appetizer appetizers snack snacks puff puffs bites chips crackers deviled wings nachos jednohubky chlebicky pochutka pochutky',
    'Drinks': 'drink cocktail lemonade tea coffee punch latte milkshake juice napoj limonada caj punc kava sirup',
    'Preserves': 'jam jelly pickles pickled preserve preserves chutney marmalade dzem lekvar zavarania zavaranina kompot sterilizovane uhorky'
  };
  const ING_HINTS = {
    'Breads & baking': 'yeast drozdie kvasok',
    'Desserts': 'baking powder baking soda powdered sugar cocoa vanilla prasok do peciva vanilkovy cukor kakao maslo cukor',
    'Main dishes': 'chicken beef pork sausage salmon kuracie bravcove hovadzie maso ryba'
  };
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hasWord = (hay, w) => new RegExp(`(?:^|[^a-z])${w.replace(/ /g, '\\s+')}(?:s|es)?(?:$|[^a-z])`).test(hay);
  const lastWord = s => (s.match(/[a-z]+(?=[^a-z]*$)/) || [''])[0];
  function categorize(r) {
    const title = fold(r.title + ' ' + (r.tags || []).join(' '));
    const ings = fold(r.groups.map(g => g.items.map(i => i.name).join(' ')).join(' '));
    let best = 'Other', score = 0;
    for (const c of Object.keys(CAT_WORDS)) {
      let sc = 0;
      const head = lastWord(title);
      for (const w of CAT_WORDS[c].split(' ')) if (w.length > 2 && hasWord(title, w)) sc += 3 + w.length / 20 + (head === w || head === w + 's' || head === w + 'es' ? 2 : 0);
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
    return { title: '', description: '', servings: null, yieldText: '', times: { prep: '', cook: '', total: '' }, groups: [], steps: [], stepSections: [], notes: [], tags: [] };
  }

  function finalize(r) {
    r.groups = r.groups.filter(g => g.items.length);
    r.title = (r.title || '').replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').replace(/^(.{6,}?)\s+recipe$/i, '$1').trim() || 'Untitled recipe';
    if (r.title === r.title.toUpperCase() && r.title.length > 3) r.title = titleCase(r.title);
    if (r.facts && r.facts.length) r.description = [r.description.trim(), r.facts.join(' · ')].filter(Boolean).join(' · ');
    delete r.facts;
    r.description = r.description.trim();
    // Drop empty steps and keep the step section headings ("Make the dough") pointing at the right step
    const at = [];
    let kept = 0;
    r.steps.forEach(s => { at.push(kept); if (s.trim()) kept++; });
    at.push(kept);
    r.stepSections = (r.stepSections || []).map(x => ({ at: at[Math.min(x.at, at.length - 1)], name: x.name }))
      .filter((x, i, a) => x.name && x.at < kept && !(a[i + 1] && a[i + 1].at === x.at));
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
    let stepNumbered = false, stepBulleted = false, parenNote = false;
    let blankBefore = false;
    let mainBullet = '';
    const subbed = new Set();
    const newGroup = name => { group = { name: name || '', items: [] }; r.groups.push(group); mainBullet = ''; };
    const bulletOf = l => (l.match(/^\s*([-*•·▪◦‣–—+>●○■◆➢➤✓✔])\s/) || [])[1] || '';
    const nextLine = i => lines.slice(i + 1).find(l => l && !isMark(l)) || '';

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (!line) { blankBefore = true; continue; }
      if (isMark(line)) { r.category = line.slice(MARK.length); continue; }
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
        else if (/^(note|tip|cook)/.test(which)) state = 'notes';
        else state = 'steps';
        if (state === 'ing' && /,/.test(line) && (line.match(new RegExp(NUM, 'g')) || []).length > 1) {
          line.split(/\s*,\s*(?=\S)/).forEach(p => { const it = parseIngredient(p); group.items.push(it); lastIng = it; });
          continue;
        }
      }

      if (state === 'pre') {
        if (!r.title && isTitleLike(line)) { r.title = line; blankBefore = false; continue; }
        if (readMeta(line, r)) { blankBefore = false; continue; }
        // "Oven: 450°F", "Rise: 1 hr" and other short facts from a recipe's header strip
        if (/^\p{Lu}[\p{L} ]{1,18}: \S/u.test(line) && line.length <= 50 && !isIngredientLike(line)) { (r.facts = r.facts || []).push(line); blankBefore = false; continue; }
        if (!hasIng && isIngredientLike(line)) { state = 'ing'; newGroup(''); }
        else if (!hasIng && !hasDir && r.title && isStepLike(line) && r.groups.length) { state = 'steps'; }
        else { r.description += (r.description ? ' ' : '') + line; blankBefore = false; continue; }
      }

      if (state === 'ing') {
        if (readMeta(line, r) && !isIngredientLike(line)) { blankBefore = false; continue; }
        if (!hasDir && (isStepLike(line) || looksLikeInstruction(line))) { state = 'steps'; }
        else {
          const t = line.replace(BULLET_RE, '');
          // A plain short line over a bulleted list is a group name ("Dough", "Filling", "Tomato Sauce")
          const nx = nextLine(i);
          const plainHead = /^\p{Lu}/u.test(t) && !bulletOf(line) && bulletOf(nx) && line.length <= 40 && line.split(/\s+/).length <= 5 && isTitleLike(line) && !isIngredientLike(line);
          if ((isGroupHeader(line) || plainHead) && !isIngredientLike(t) && !(lastIng && mainBullet && !bulletOf(line) && /^\p{Ll}/u.test(t))) {
            const name = t.replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').replace(/:$/, '').trim();
            if (group && !group.items.length) group.name = name; else newGroup(name);
            lastIng = null; blankBefore = false; continue;
          }
          // "(ENOUGH FOR BOTTOM AND TOP CRUST)" above the list is a note, not an ingredient
          if (parenNote || (!lastIng && /^\(/.test(t))) {
            r.description += (r.description ? ' ' : '') + t.trim();
            parenNote = !/\)\s*$/.test(t); blankBefore = false; continue;
          }
          // In a bulleted list, a line without a bullet is the rest of the item above it
          if (lastIng && mainBullet && !bulletOf(line) && !plainHead && !(isGroupHeader(line) && /^\p{Lu}/u.test(t)) &&
            (!/^\d/.test(t) || /(?:[,(/-]|\b(?:into|of|to|and|or|about|plus|for|in|with|a|the))$/i.test(lastIng.raw))) {
            lastIng.raw += ' ' + t.trim(); lastIng.name += ' ' + t.trim(); blankBefore = false; continue;
          }
          // A sub-bullet ("– Onion" under "• Vegetable toppings") belongs to the item above it
          const bc = bulletOf(line);
          if (bc && !mainBullet) mainBullet = bc;
          if (bc && bc !== mainBullet && lastIng) {
            const sep = subbed.has(lastIng) ? ', ' : ': ';
            subbed.add(lastIng);
            lastIng.raw += sep + t.trim(); lastIng.name += sep + t.trim();
            blankBefore = false; continue;
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

      if (state === 'steps' || state === 'notes') {
        // A second part of the dish ("Frosting:", "Na plnku:") followed by ingredients
        const nx = lines.slice(i + 1).find(Boolean);
        const subHead = (isGroupHeader(line) || /^(?:#+\s*)?(?:topping|filling|frosting|glaze|sauce|dressing|icing|crust|plnka|poleva)\b/i.test(line.replace(/^\*\*/, ''))) && line.length <= 45 && !isIngredientLike(line);
        if (subHead && nx && isIngredientLike(nx)) {
          const name = line.replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').replace(/:$/, '').trim();
          newGroup(name); state = 'ing2'; lastIng = null; blankBefore = false; continue;
        }
      }
      if (state === 'ing2') {
        if (isIngredientLike(line) || (lastIng && /^[\p{Ll}(]/u.test(line) && !looksLikeInstruction(line))) {
          if (isIngredientLike(line)) { const ing = parseIngredient(line); group.items.push(ing); lastIng = ing; }
          else { lastIng.raw += ' ' + line; lastIng.name += ' ' + line; }
          blankBefore = false; continue;
        }
        state = 'steps';
      }

      if (state === 'steps') {
        const t = line.replace(BULLET_RE, '');
        // A short heading inside the method ("Make the Dough", "Bake") followed by a numbered step
        const nx = nextLine(i);
        const lastStep = r.steps.length ? r.steps[r.steps.length - 1] : '';
        if (!BULLET_RE.test(line) && /^\p{Lu}/u.test(t) && t.length <= 40 && t.split(/\s+/).length <= 5 && !/[.!?,;)]$/.test(t) && isTitleLike(line) &&
          (/^(?:step\s*)?\d+\s*(?:[.):]|-(?=\s))\s*\S/i.test(nx) || bareStep(nx) ||
            (BULLET_RE.test(nx) && (/:$/.test(t) || !lastStep || /[.!?:]$/.test(lastStep))))) {
          r.stepSections.push({ at: r.steps.length, name: t.replace(/^#+\s*/, '').replace(/:$/, '').trim() });
          blankBefore = false; continue;
        }
        const bare = bareStep(t) || (hasDir && /^\d{1,2}\s+\p{Lu}\p{Ll}/u.test(t) && !matchUnit(t.replace(/^\d+\s+/, '')) && t.split(/\s+/).length >= 3);
        const numbered = /^(?:step\s*)?\d+\s*(?:[.):]|-(?=\s))\s*\S/i.test(t) || /^step\s*\d+\s*$/i.test(t) || bare;
        if (/^step\s*\d+\s*:?\s*$/i.test(t)) { r.steps.push(''); stepNumbered = true; blankBefore = false; continue; }
        if (numbered) stepNumbered = true;
        if (BULLET_RE.test(line) && !numbered) stepBulleted = true;
        const text = bare ? t.replace(/^\d+\s+/, '').trim() : stripStepNum(line);
        const prev = r.steps.length ? r.steps[r.steps.length - 1] : null;
        const continues = prev != null && !numbered && (
          prev === '' ||
          (stepNumbered && !BULLET_RE.test(line)) ||
          (stepBulleted && !BULLET_RE.test(line)) ||
          (!BULLET_RE.test(line) && !/[.!?:)]$/.test(prev) && (/^[\p{Ll}(]/u.test(text) || prev.length >= 55))
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

  // ---------- Tidying lines from recipe websites / printouts ----------
  const META_WORDS = 'course|cuisine|author|keyword|keywords|prep time|cook time|cooking time|bake time|total time|rise time|rising time|chill time|resting time|servings|serves|yield|calories|difficulty';
  const META_LABEL = new RegExp(`^(?:${META_WORDS})\\s*:`, 'i');
  const GLUED = new RegExp(`^(${META_WORDS}|yields)\\s*[:\\-–]?\\s*(\\S.*)$`, 'iu');
  function tidyLines(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      let l = lines[i];
      if (!l) { out.push(l); continue; }
      // A checkbox or bullet on its own line belongs to the next line
      if (/^[▢☐□●•○◦▪]$/.test(l)) { const j = nonBlank(lines, i, 1); if (j > 0) lines[j] = '• ' + lines[j]; out.push(''); continue; }
      // "CourseDessert", "Prep Time10 minutes", "Servings-4 or more" → "Course: Dessert"
      const g = l.length <= 60 && l.match(GLUED);
      if (g && /^[\d\p{Lu}]/u.test(g[2])) l = g[1].charAt(0).toUpperCase() + g[1].slice(1).toLowerCase() + ': ' + g[2].trim();
      // "Servings 12 (makes one 10-12" pizza)" broken over two lines
      if ((l.match(/\(/g) || []).length > (l.match(/\)/g) || []).length && lines[i + 1] && lines[i + 1].length <= 40 && /\)/.test(lines[i + 1]) && !/^[-*•●▢]/.test(lines[i + 1])) {
        l += ' ' + lines[i + 1]; lines[i + 1] = '';
      }
      // "Ingredients→ per 1 serving" → a note, then the header
      const ih = l.match(/^(ingredients?)\s*(?:→|->|—|–)\s*(.+)$/i);
      if (ih) { out.push(ih[2].charAt(0).toUpperCase() + ih[2].slice(1) + '.', 'Ingredients'); continue; }
      out.push(l);
    }
    return out;
  }

  // ---------- Cookbook section labels ----------
  // A small all-caps line right above a recipe's big title ("DESSERTS" over "# Apple Pie") is the
  // book's own section. It isn't the title; it tells us the category.
  const MARK = '\u0001cat:';
  const isMark = l => typeof l === 'string' && l.startsWith(MARK);
  const SECTION_CATS = [
    [/^(breakfast|brunch)/, 'Breakfast'], [/^(soups?|stews?|soups (and|&) stews)$/, 'Soups & stews'], [/^salads?$/, 'Salads'],
    [/^(mains?|main (dishes|courses?|meals?)|entr[eé]es?|dinners?)$/, 'Main dishes'], [/^sides?( dishes)?$/, 'Sides'],
    [/^(breads?|baking|breads (and|&) baking)$/, 'Breads & baking'], [/^(desserts?|sweets|cakes|cookies|treats)$/, 'Desserts'],
    [/^(sauces?|dips?|dressings?|sauces (and|&) dips)$/, 'Sauces & dips'], [/^(appetizers?|starters?|snacks?|snacks (and|&) appetizers)$/, 'Snacks & appetizers'],
    [/^(drinks?|beverages?|cocktails?)$/, 'Drinks'], [/^(preserves?|canning|pickles)$/, 'Preserves']
  ];
  function markSections(lines) {
    const out = lines.slice();
    for (let i = 0; i < out.length; i++) {
      const l = out[i];
      if (!l || !/^[A-Z][A-Z &'’-]{2,30}$/.test(l) || !/[A-Z]{3}/.test(l)) continue;
      const nx = nonBlank(out, i, 1);
      if (nx < 0 || nx - i > 2 || !/^#\s/.test(out[nx])) continue;
      const k = l.toLowerCase().trim();
      const hit = SECTION_CATS.find(([re]) => re.test(k));
      out[i] = '';
      if (hit) out.splice(nx + 1, 0, MARK + hit[1]);
    }
    return out;
  }

  // ---------- Splitting a document (a whole cookbook PDF) into one block per recipe ----------
  const nonBlank = (lines, i, dir) => { for (let j = i + dir; j >= 0 && j < lines.length; j += dir) if (lines[j]) return j; return -1; };
  const isSubHeading = l => /^(?:#+\s*)?(?:for (?:the )?|na |pre |to (?:serve|finish|decorate)|topping|filling|frosting|glaze|sauce|dressing|plnka|poleva)/i.test(l.replace(/^\*\*/, '')) || /:\s*$/.test(l);
  const isIngHeader = l => ING_HDR.test(headerKey(l)) || /^ingredients?\s*:\s*\S/i.test(l) || /^suroviny\s*:\s*\S/i.test(l);

  // Finds where each recipe starts. A new recipe begins when the current one already has
  // ingredients AND steps, and then we hit a big heading, an "Ingredients" header, or a fresh
  // run of ingredient lines. The title is found by looking back from that point.
  function splitBlocks(lines) {
    const n = lines.length;
    const ingLike = lines.map(l => !!l && !isMark(l) && !isIngHeader(l) && isIngredientLike(l));
    const starts = [];
    let cur = null; // { start, hasIng, hasSteps, lastStep }

    // Walk back from where the ingredients start to the recipe's name. A name is a short line
    // that sits after a blank line, after the end of a sentence (the last recipe's final step),
    // or is a big heading. Descriptions and "Serves 4" lines in between are skipped.
    const findTitle = (from, floor) => {
      // A big heading close above wins over any other short line
      for (let j = from - 1, seen = 0; j >= floor && seen < 16; j--) {
        if (!lines[j] || isMark(lines[j])) continue;
        seen++;
        if (ingLike[j] || /^(?:step\s*)?\d+\s*[.)]\s/i.test(lines[j])) break;
        if (/^#\s/.test(lines[j]) && isStrongTitle(lines[j]) && !isSubHeading(lines[j])) return j;
      }
      let fallback = -1, seen = 0;
      for (let j = from - 1; j >= floor && seen < 10; j--) {
        if (!lines[j] || isMark(lines[j])) continue;
        seen++;
        if (ingLike[j] || /^(?:step\s*)?\d+\s*[.)]\s/i.test(lines[j])) break; // reached the previous recipe
        if (!isTitleLike(lines[j]) || isSubHeading(lines[j])) continue;
        if (isStrongTitle(lines[j])) return j;
        if (!/^[\p{Lu}\d]/u.test(lines[j].replace(/^[#*\s]+/, ''))) continue;
        const before = j - 1;
        if (before < floor || !lines[before] || /[.!?)]$/.test(lines[before])) return j;
        if (fallback < 0) fallback = j;
      }
      return fallback;
    };

    for (let i = 0; i < n; i++) {
      const l = lines[i];
      if (!l || isMark(l)) continue;
      const strong = isStrongTitle(l) && !isSubHeading(l);
      const ingHdr = isIngHeader(l);
      const prev = nonBlank(lines, i, -1), next = nonBlank(lines, i, 1);
      const runStart = ingLike[i] && !(prev >= 0 && ingLike[prev]) && next >= 0 && ingLike[next];

      if (!cur) {
        // First recipe: starts at the first title before its ingredients (skips a cookbook's intro pages).
        if (ingHdr || runStart) {
          const t = findTitle(i, 0);
          cur = { start: t >= 0 ? t : i, hasIng: true, hasSteps: false };
          starts.push(cur.start);
        }
        continue;
      }

      const complete = cur.hasIng && cur.hasSteps;
      const looseComplete = cur.hasIng && (cur.hasSteps || cur.hasText);
      if ((complete && runStart) || (looseComplete && (strong || ingHdr))) {
        let s = i, split = true;
        if (!strong) {
          const t = findTitle(i, cur.start + 1);
          if (t >= 0) s = t;
          // No name in front of these ingredients? Then it's a part of the same dish (e.g. the frosting).
          else split = false;
        }
        if (split) {
          cur = { start: s, hasIng: false, hasSteps: false, hasText: false };
          starts.push(s);
        }
      }
      const bulletInList = /^\s*[-*•·▪◦‣–—+●○■]\s/.test(l) && ((prev >= 0 && ingLike[prev]) || (next >= 0 && ingLike[next]));
      if (ingHdr || ingLike[i] || bulletInList) cur.hasIng = true;
      else if (cur.hasIng && (DIR_HDR.test(headerKey(l)) || isStepLike(l) || looksLikeInstruction(l) || (l.length > 50 && /[.!]$/.test(l)))) {
        cur.hasSteps = true; cur.lastStep = i;
      } else if (cur.hasIng && !isGroupHeader(l) && i > cur.start) { cur.hasText = true; }
    }
    if (!starts.length) return [lines];
    // Pull a title that sits just above a block's start into that block (e.g. "Ingredients" was the trigger).
    const blocks = [];
    for (let k = 0; k < starts.length; k++) blocks.push(lines.slice(starts[k], k + 1 < starts.length ? starts[k + 1] : n));
    return blocks;
  }

  // Remove page furniture: running headers/footers repeated on many pages, contents pages, page numbers.
  function cleanDocument(lines) {
    const junk = /^(page \d+( of \d+)?|\d{1,3}|[-–—]\s*\d{1,3}\s*[-–—]|print( recipe)?|jump to recipe|pin( it)?|save recipe|https?:\/\/\S+|www\.\S+|©.*)$/i;
    const toc = /^.{2,60}?(?:\s?\.{3,}|\s{3,}|\t)\s*\d{1,4}$/; // "Banana Bread ....... 12"
    const key = l => l.replace(/^#+\s*/, '').replace(/\d+/g, '#').toLowerCase().trim();
    const counts = {};
    lines.forEach(l => { if (l) { const k = key(l); counts[k] = (counts[k] || 0) + 1; } });
    return lines.map(l => {
      if (!l || isMark(l)) return l;
      if (junk.test(l.replace(/^#+\s*/, '')) || toc.test(l)) return '';
      const k = key(l);
      const hk = headerKey(l);
      // Same short line on 3+ pages = running header/footer (but section words like "Ingredients" legitimately repeat)
      if (counts[k] >= 3 && l.length < 60 && isTitleLike(l) && !ING_HDR.test(hk) && !DIR_HDR.test(hk) && !NOTE_HDR.test(hk) && !isIngredientLike(l) && !isGroupHeader(l)) return '';
      return l;
    });
  }

  function parseText(text) {
    const lines = cleanDocument(markSections(tidyLines(String(text || '').replace(/\r\n?/g, '\n').replace(/\f/g, '\n').split('\n').map(cleanLine))));
    const blocks = splitBlocks(lines);
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
    const o = obj.original;
    if (o && typeof o === 'object' && (o.ingredientGroups || o.steps)) {
      r.original = {
        title: o.title || obj.originalTitle || '', description: o.description || '',
        groups: (o.ingredientGroups || []).map(g => ({ name: g.name || '', items: (g.items || []).map(parseIngredient) })).filter(g => g.items.length),
        steps: (o.steps || []).map(String), notes: (o.notes || []).map(String)
      };
      if (!r.originalTitle && o.title && o.title !== r.title) r.originalTitle = String(o.title);
    }
    return finalize(r);
  }



  // ---------- Is this OCR text real words or scanner noise? ----------
  // Tesseract only reads print. On cursive it returns junk like "A.rr o 7 7 i S HR A fe Sa = 4 a5 & §".
  // Returns { ok, score, reason } so the app can stop before turning noise into a "recipe".
  function ocrQuality(text, confidence) {
    const toks = String(text || '').split(/\s+/).filter(Boolean);
    if (toks.length < 4) return { ok: false, score: 0, reason: 'almost no text' };
    let good = 0, letters = 0, letterLen = 0;
    for (const t0 of toks) {
      const t = t0.replace(/^[("'“„•\-–]+|[)"'”.,:;!?]+$/g, '');
      if (!t) continue;
      if (/^\d+(?:[.,/]\d+)?(?:[-–]\d+)?$|^[½¼¾⅓⅔]$/.test(t) || matchUnit(t + ' x')) { good++; continue; }
      if (/^\p{L}+$/u.test(t)) {
        letters++; letterLen += t.length;
        if (t.length >= 2 && /[aeiouyáäéíóôúýěůrlŕĺ]/i.test(t) && !/^(\p{Lu}\p{Ll}?){2,}$/u.test(t) || /^(a|i|v|k|s|z|o|u)$/.test(t)) good++;
      }
    }
    const score = good / toks.length;
    const avgWord = letters ? letterLen / letters : 0;
    let reason = '';
    if (confidence != null && confidence < 45) reason = 'low reader confidence';
    else if (score < 0.6) reason = 'mostly unreadable';
    else if (avgWord < 2.8 || toks.filter(t => t.length === 1).length > toks.length * 0.3) reason = 'broken words';
    return { ok: !reason, score: Math.round(score * 100) / 100, reason };
  }

  // ---------- Slovak / Czech kitchen words → English (before machine translation) ----------
  // Small generic translators get grandma's shorthand wrong ("hl. múka", "HERA", "lekvár").
  // Whole phrases first, then word by word; null means "let the translator try".
  const SK_ABBR = { 'hl': 'hladka', 'prask': 'praskovy', 'mlet': 'mlete', 'kr': 'krystalovy', 'vanil': 'vanilkovy', 'pol': 'polohruba', 'cerst': 'cerstve', 'strk': 'struhana' };
  const SK_PHRASES = {
    'hladka muka special': 'all-purpose flour (fine, "špeciál")', 'hladka muka': 'all-purpose flour', 'polohruba muka': 'semi-coarse flour', 'hruba muka': 'coarse flour',
    'praskovy cukor': 'powdered sugar', 'krystalovy cukor': 'granulated sugar', 'vanilkovy cukor': 'vanilla sugar',
    'soda bikarbona': 'baking soda', 'soda bicarbona': 'baking soda', 'jedla soda': 'baking soda', 'prasok do peciva': 'baking powder',
    'kysla smotana': 'sour cream', 'smotana na slahanie': 'whipping cream', 'mlete orechy': 'ground walnuts', 'mlete orechov': 'ground walnuts',
    'mlete maku': 'ground poppy seeds', 'struhana citronova kora': 'grated lemon zest', 'citronova kora': 'lemon zest', 'hera': 'margarine (Hera)', 'perník korenie': 'gingerbread spice', 'pernikove korenie': 'gingerbread spice'
  };
  const SK_WORDS = {
    muka: 'flour', muky: 'flour', muku: 'flour', hladka: 'fine', hladkej: 'fine', cukor: 'sugar', cukru: 'sugar', praskovy: 'powdered', praskoveho: 'powdered',
    med: 'honey', medu: 'honey', maslo: 'butter', masla: 'butter', margarin: 'margarine', margarinu: 'margarine', hera: 'margarine (Hera)', heru: 'margarine (Hera)',
    lekvar: 'plum butter (lekvár)', lekvaru: 'plum butter (lekvár)', dzem: 'jam', dzemu: 'jam', hrebicek: 'clove', hrebicky: 'cloves', hrebicka: 'cloves', hrebickov: 'cloves',
    skorica: 'cinnamon', skorice: 'cinnamon', mlete: 'ground', mletych: 'ground', mletej: 'ground', orechy: 'walnuts', orechov: 'walnuts', mak: 'poppy seeds', maku: 'poppy seeds',
    vajce: 'egg', vajcia: 'eggs', vajec: 'eggs', vajicko: 'egg', vajicka: 'eggs', zltok: 'egg yolk', zltky: 'egg yolks', zltkov: 'egg yolks', bielok: 'egg white', bielky: 'egg whites',
    mlieko: 'milk', mlieka: 'milk', smotana: 'cream', smotany: 'cream', tvaroh: 'farmer cheese (tvaroh)', tvarohu: 'farmer cheese (tvaroh)', sol: 'salt', soli: 'salt',
    olej: 'oil', oleja: 'oil', drozdie: 'yeast', drozdia: 'yeast', kakao: 'cocoa', citron: 'lemon', citrona: 'lemon', rum: 'rum', rumu: 'rum', voda: 'water', vody: 'water',
    hrozienka: 'raisins', hrozienok: 'raisins', struhanka: 'breadcrumbs', struhanky: 'breadcrumbs', zemiaky: 'potatoes', zemiakov: 'potatoes', cibula: 'onion', cibule: 'onions',
    cesnak: 'garlic', cesnaku: 'garlic', paprika: 'paprika', papriky: 'paprika', ocot: 'vinegar', octu: 'vinegar', kapusta: 'cabbage', kapusty: 'cabbage', klobasa: 'sausage', klobasy: 'sausage',
    huby: 'mushrooms', hub: 'mushrooms', susene: 'dried', susenych: 'dried', udena: 'smoked', udenej: 'smoked', kysla: 'sour', kyslej: 'sour', cerstve: 'fresh', struhana: 'grated',
    kuracie: 'chicken', bravcove: 'pork', hovadzie: 'beef', maso: 'meat', masa: 'meat', soda: 'soda', vanilkovy: 'vanilla', polohruba: 'semi-coarse', krystalovy: 'granulated'
  };
  function skGlossary(name) {
    if (!name) return null;
    const parts = String(name).split(/\s*,\s*/);
    const out = [];
    for (const part of parts) {
      const toks = fold(part).replace(/[()]/g, ' ').split(/[\s.]+/).filter(Boolean).map(t => SK_ABBR[t] || t);
      if (!toks.length) return null;
      const phrase = toks.join(' ');
      if (SK_PHRASES[phrase]) { out.push(SK_PHRASES[phrase]); continue; }
      const words = toks.map(t => SK_WORDS[t]);
      if (words.some(w => !w)) return null;
      out.push(words.join(' '));
    }
    return out.join(', ');
  }
  // Expand handwritten shorthand so a machine translator has real words to work with.
  function skExpand(s) {
    return String(s || '').replace(/\b(hl|prášk|prask|mlet|kr|vanil|pol)\.\s*/gi, (m, a) => ({ hl: 'hladká ', prášk: 'práškový ', prask: 'práškový ', mlet: 'mletých ', kr: 'kryštálový ', vanil: 'vanilkový ', pol: 'polohrubá ' })[a.toLowerCase()] || m)
      .replace(/\bhod\.(?=\s|$)/gi, 'hodiny').replace(/\bmin\.(?=\s|$)/gi, 'minút');
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
  const sectionsAt = (r, i) => (r.stepSections || []).filter(x => x.at === i).map(x => x.name);
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
    r.steps.forEach((s, i) => { sectionsAt(r, i).forEach(n => out.push(n)); out.push(`${i + 1}. ${s}`); });
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
    r.steps.forEach((s, i) => { sectionsAt(r, i).forEach(n => out.push('', `**${n}**`, '')); out.push(`${i + 1}. ${s}`); });
    if (r.notes.length) { out.push('', '## Notes', ''); r.notes.forEach(n => out.push(`- ${n}`)); }
    return out.join('\n') + '\n';
  }

  // ---------- PDF layout → text ----------
  // pages: [{ width, items: [{ x, y, h, w, s }] }] (pdf.js text pieces). Rebuilds lines column by
  // column, marks big-font lines as headings ("# "), adds a period to bare step numbers
  // ("1   Pour the milk" → "1. Pour the milk") and turns label rows that sit over value rows
  // (PREP / COOK / MAKES with "30 min" / "22 min" / "12 rolls" under them) into "Prep: 30 min" lines.
  function layoutPdfText(pages) {
    const allLines = []; // { text, h, gapBefore }
    const isLabel = s => /^[A-Z][A-Z&/ ]{1,18}$/.test(s.trim()) && s.trim().split(/\s+/).length <= 2;
    const cap = s => s.charAt(0) + s.slice(1).toLowerCase();
    for (const pg of pages) {
      const items = pg.items.filter(it => it.s && it.s.trim());
      const mid = pg.width / 2;
      const crossing = items.filter(it => it.x < mid - 8 && it.x + it.w > mid + 8).length;
      const left = items.filter(it => it.x + it.w <= mid + 8), right = items.filter(it => it.x >= mid - 8);
      // Two-column cookbook pages: read the left column, then the right one. Rows of spread-out
      // labels and values (the PREP / COOK strip) are not columns, so they don't count against it.
      const rowsOf = arr => new Set(arr.map(it => Math.round(it.y))).size;
      const twoCol = items.length > 20 && crossing < items.length * 0.08 && left.length >= 3 && rowsOf(right) >= 3 &&
        (right.length > items.length * 0.2 || crossing <= 1) &&
        !items.some(it => isLabel(it.s) && items.filter(o => Math.abs(o.y - it.y) < 1 && isLabel(o.s)).length >= 3);
      // A word just right of the middle that carries on a left-column line ("…any kind" + "is desired") stays on the left.
      const carriesOn = it => items.some(o => o !== it && o.x < mid - 8 && Math.abs(o.y - it.y) < 2 && it.x - (o.x + o.w) < 12 && it.x - (o.x + o.w) > -2);
      const columns = twoCol ? [items.filter(it => it.x < mid - 8 || carriesOn(it)), items.filter(it => it.x >= mid - 8 && !carriesOn(it))] : [items];
      let firstCol = true;
      const pageStartIdx = allLines.length;
      for (const col of columns) {
        const rows = [];
        for (const it of col) {
          let row = rows.find(r => Math.abs(r.y - it.y) < Math.max(r.h, it.h) * 0.5);
          if (!row) { row = { y: it.y, h: it.h, parts: [] }; rows.push(row); }
          row.h = Math.max(row.h, it.h);
          row.parts.push(it);
        }
        rows.sort((a, b) => b.y - a.y);
        rows.forEach(r => r.parts.sort((a, b) => a.x - b.x));
        let prevY = null, prevH = 10;
        for (let k = 0; k < rows.length; k++) {
          const r = rows[k];
          const gap = prevY != null && prevY - r.y > Math.max(prevH, r.h) * 1.9;
          prevY = r.y; prevH = r.h;
          // Label row over a value row → "Label: value" lines
          const nx = rows[k + 1];
          if (nx && r.parts.every(p => isLabel(p.s)) && r.y - nx.y < r.h * 3.5 && nx.h < r.h * 1.8 && (r.parts.length >= 2 || nx.h > r.h * 1.1) &&
            !nx.parts.every(p => isLabel(p.s)) && nx.parts.length >= r.parts.length) {
            const vals = r.parts.map(() => []);
            for (const v of nx.parts) {
              const c = v.x + v.w / 2;
              let best = 0, bd = Infinity;
              r.parts.forEach((p, j) => { const d = Math.abs(p.x + p.w / 2 - c); if (d < bd) { bd = d; best = j; } });
              vals[best].push(v.s.trim());
            }
            if (vals.every(v => v.length)) {
              allLines.push({ text: '', h: 0 });
              r.parts.forEach((p, j) => allLines.push({ text: cap(p.s.trim()) + ': ' + vals[j].join(' '), h: nx.h }));
              allLines.push({ text: '', h: 0 });
              k++; prevY = nx.y; prevH = nx.h;
              continue;
            }
          }
          let line = '', end = null;
          r.parts.forEach((pt, j) => {
            if (end != null && pt.x - end > 1.5 && !/\s$/.test(line) && !/^\s/.test(pt.s)) line += ' ';
            // A bare step number set apart from its text: "1      Pour…" → "1. Pour…"
            if (j === 1 && /^\d{1,3}$/.test(line.trim()) && pt.x - end > 6 && /^\s*\p{L}/u.test(pt.s)) line = line.trim() + '. ';
            line += pt.s; end = pt.x + pt.w;
          });
          allLines.push({ text: line.trim(), h: r.h, gapBefore: gap, top: firstCol && k === 0, page: pageStartIdx });
        }
        allLines.push({ text: '', h: 0 }); // column / page break
        firstCol = false;
      }
    }
    // Per page body size, so a title a little bigger than its own page's text still counts
    const pageBody = {};
    allLines.forEach(l => { if (l.text) (pageBody[l.page] = pageBody[l.page] || []).push(l.h); });
    Object.keys(pageBody).forEach(k => { const a = pageBody[k].sort((x, y) => x - y); pageBody[k] = a[Math.floor(a.length / 2)]; });
    const hasIngHdr = page => allLines.some(l => l.page === page && l.text && /^ingredients?\b/i.test(l.text));
    // Lines in a clearly bigger font than the body text are headings (recipe titles).
    const sizes = allLines.filter(l => l.text).map(l => Math.round(l.h * 2) / 2).sort((a, b) => a - b);
    const body = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 10;
    const out = [];
    let lastH = 0;
    for (const l of allLines) {
      if (!l.text) { out.push(''); lastH = 0; continue; }
      if (l.gapBefore) out.push('');
      const plain = l.text.length <= 70 && !/[.,;:!?]$/.test(l.text) && !/^\S+: /.test(l.text) && /\p{L}/u.test(l.text);
      const big = l.h >= body * 1.25 || (l.page != null && l.h >= pageBody[l.page] * 1.2);
      // Recipe pages often start with the recipe's name in plain text: "Chocolate Lava Cake" at the top of a page that has an Ingredients list
      const pageTop = l.top && /^\p{Lu}/u.test(l.text) && l.text !== l.text.toUpperCase() && l.text.length <= 60 &&
        l.text.split(/\s+/).length <= 8 && !/^ingredients?\b|^instructions?\b|^directions?\b/i.test(l.text) && hasIngHdr(l.page);
      const heading = plain && (big || pageTop);
      if (heading && out.length && /^# /.test(out[out.length - 1]) && !l.gapBefore && l.h === lastH) out[out.length - 1] += ' ' + l.text; // a title on two lines
      else out.push(heading ? '# ' + l.text : l.text);
      lastH = l.h;
    }
    return out.join('\n');
  }

  const api = { ocrQuality, skGlossary, skExpand, layoutPdfText, CATEGORIES, categorize, toEnglishUnits, parseText, parseBlock, parseIngredient, formatIngredient, formatQty, parseNum, parseJsonLd, fromAI, toEditableText, toMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecipeParser = api;
})(typeof window !== 'undefined' ? window : this);
