// A 20 recipe "cookbook" (intro, contents page, running headers, mixed styles) must split into 20 recipes.
const P = require('../js/parser.js'), fs = require('fs'), assert = require('assert');
const want = require('./fixtures/recipes.json');
const got = P.parseText(fs.readFileSync(__dirname + '/fixtures/cookbook.txt', 'utf8'));
assert.equal(got.length, 20, 'recipe count');
want.forEach(([title, cat, ings, steps]) => {
  const r = got.find(x => x.title === title);
  assert.ok(r, 'missing ' + title);
  assert.equal(r.groups.reduce((a, g) => a + g.items.length, 0), ings.length, title + ' ingredients');
  assert.equal(r.steps.length, steps.length, title + ' steps');
  assert.equal(r.category, cat, title + ' category');
});
console.log('COOKBOOK OK');
