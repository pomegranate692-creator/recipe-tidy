const P = require('../js/parser.js');
const assert = require('assert');
const show = rs => rs.forEach(r => console.log(JSON.stringify({t:r.title,s:r.servings,tm:r.times,d:r.description,g:r.groups.map(g=>[g.name,g.items.map(i=>[i.qty,i.qtyMax,i.unit,i.size,i.name])]),st:r.steps,n:r.notes},null,0)));

const messy = `GRANDMA'S BANANA BREAD
The best one ever, trust me.
Serves 8   Prep time: 15 mins  Bake time: 1 hour

Ingredients:
• 3 ripe bananas, mashed
• 1/3 cup melted butter
• 1 tsp baking soda
• pinch of salt
• 3/4 cup sugar
• 1 large egg, beaten
• 1 ½ cups all-purpose flour
• 1 (14 oz) can sweetened condensed
milk

Directions
1. Preheat oven to 350°F (175°C) and grease a 4x8 inch
loaf pan.
2. In a mixing bowl, mash the bananas with a fork. Mix in the melted butter.
3. Bake for 1 hour.

Notes
Freezes well for up to 3 months.

Chicken Tacos
Makes 4 servings
Ingredients
For the chicken:
2 lbs chicken thighs
2 T olive oil
1-2 tsp chili powder
For the salsa:
2 tomatoes, diced
salt to taste
Instructions
Season the chicken with chili powder and salt, then sear in olive oil for 6 minutes per side.
Chop and serve in warm tortillas.
`;
const r = P.parseText(messy); show(r);
assert.equal(r.length, 2);
assert.equal(r[0].title, "Grandma's Banana Bread");
assert.equal(r[0].servings, 8);
assert.equal(r[0].steps.length, 3);
assert.equal(r[1].groups.length, 2);
assert.equal(r[1].groups[0].items[1].unitKey, 'tbsp');

const noHeaders = `Easy Pancakes
1 cup flour
2 tbsp sugar
1 egg
1 cup milk
Whisk the dry ingredients together, then whisk in the egg and milk until smooth.
Cook on a hot greased griddle until bubbles form, then flip.`;
show(P.parseText(noHeaders));
const inline = `Ingredients: 2 cups rice, 4 cups water, 1 tsp salt\nDirections: Boil water, add rice and salt, simmer 18 min.`;
show(P.parseText(inline));
// scaling
const ing = P.parseIngredient('1 ½ cups all-purpose flour');
console.log(P.formatIngredient(ing, 2), P.formatIngredient(P.parseIngredient('1 cup milk'),0.5), P.formatIngredient(P.parseIngredient('1-2 tsp chili'),3), P.formatIngredient(P.parseIngredient('250 g butter'),1.5));
const ld = JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"Recipe","name":"Soup &amp; Bread","recipeYield":["4","4 bowls"],"prepTime":"PT10M","cookTime":"PT1H5M","recipeIngredient":["2 cups broth","1 onion"],"recipeInstructions":[{"@type":"HowToSection","name":"Soup","itemListElement":[{"@type":"HowToStep","text":"Simmer."}]}]}]});
show(P.parseJsonLd([ld]));
console.log(P.toMarkdown(r[1], 2));
console.log('OK');
const sk = `Babkine šišky

Suroviny:
50 dkg hladkej múky
2,5 dl mlieka
1 kocka droždia
2 PL cukru
štipka soli
3 žĺtky
Postup:
Do vlažného mlieka rozdrobíme droždie, pridáme cukor a necháme vykysnúť kvások.
Z ostatných surovín vymiesime cesto a necháme ho kysnúť asi hodinu.
Poznámka
Podávame s lekvárom.

Kapustnica
Porcie: 6
Suroviny
1 kg kyslej kapusty
30 dkg údenej klobásy
2 strúčiky cesnaku
Postup
Kapustu varíme s klobásou asi hodinu.`;
const s = P.parseText(sk); show(s); console.log(s.map(r=>r.category), r.map(x=>x.category));
assert.equal(s.length, 2); assert.equal(s[1].servings, 6);
console.log(P.formatIngredient(s[0].groups[0].items[1], 2), P.formatIngredient(s[0].groups[0].items[0], 0.5));
console.log('SK OK');
