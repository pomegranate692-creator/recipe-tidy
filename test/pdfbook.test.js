// A designed cookbook PDF (section labels, PREP/COOK strip, step numbers without periods,
// group headings, sub-bullets, tips). Fixture = what the app's PDF reader produces for it.
const P = require('../js/parser.js'), fs = require('fs'), assert = require('assert');
const got = P.parseText(fs.readFileSync(__dirname + '/fixtures/tried-and-true.txt', 'utf8'));
const titles = ['Belgian Waffles', 'Homemade Cinnamon Rolls', 'Spinach Puffs', 'Pizza Dough', 'Cheese Pizza', 'Spaghetti and Chicken Meatballs',
  'Sauerkraut with Sausage', 'Perfect Pie Crust', 'Apple Pie', 'Chocolate Lava Cake', 'Chocolate Chip Cookie Brownie Skillet', 'Chocolate Chip Cookies', 'Crème Brûlée'];
assert.deepEqual(got.map(r => r.title), titles);
const by = t => got.find(r => r.title === t);
const count = r => r.groups.reduce((a, g) => a + g.items.length, 0);
assert.equal(by('Belgian Waffles').category, 'Breakfast');
assert.equal(by('Spinach Puffs').category, 'Snacks & appetizers');
assert.equal(by('Apple Pie').category, 'Desserts');
const cr = by('Homemade Cinnamon Rolls');
assert.deepEqual(cr.groups.map(g => g.name), ['Dough', 'Filling', 'Frosting']);
assert.equal(cr.steps.length, 14);
assert.deepEqual(cr.stepSections.map(s => [s.at, s.name]), [[0, 'Make the Dough'], [5, 'Fill and Shape'], [9, 'Bake'], [12, 'Frost']]);
assert.equal(cr.times.prep, '30 min'); assert.equal(cr.servings, 12);
assert.equal(count(by('Cheese Pizza')), 8);
assert.ok(by('Cheese Pizza').groups[0].items.some(i => i.raw === 'Herbs: Basil, Oregano'));
assert.equal(by('Pizza Dough').steps.length, 10);
assert.equal(by('Pizza Dough').notes.length, 1);
assert.equal(by('Chocolate Chip Cookie Brownie Skillet').times.cook, '30 to 35 min');
assert.equal(count(by('Crème Brûlée')), 5);
assert.equal(count(by('Apple Pie')), 11);
// Pasted text with bare step numbers
const t = P.parseText('Toast\nIngredients\n2 slices bread\n1 tbsp butter\nInstructions\n1 Toast the bread until golden brown.\n2 Spread the butter on while it is hot.');
assert.equal(t.length, 1); assert.equal(count(t[0]), 2); assert.equal(t[0].steps.length, 2);
console.log('PDF BOOK OK');
