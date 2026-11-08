// The homepage knight uses the real ScamSpotter crosshair on its shield,
// keeps the rifle pointed down, and does not bring portraits back.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log('PASS ', msg); };

const logo = read('public/logo.svg');
const knight = read('public/img/knight.svg');
const home = read('public/index.html');
const mark = logo.match(/d="(M16 2\.5v6M16 23\.5v6M2\.5 16h6M23\.5 16h6)"/);
ok(mark, 'logo.svg still has the crosshair mark');
ok(knight.includes(`d="${mark[1]}"`), 'knight shield uses that same crosshair path');
ok(knight.includes('r="10"') && knight.includes('r="4.2"') && knight.includes('r="1.1"'), 'knight shield keeps the logo circles');

const barrel = knight.match(/<rect id="rifle-barrel"[^>]*>/);
ok(barrel, 'knight carries a rifle');
const width = Number(barrel[0].match(/width="([\d.]+)"/)[1]);
const height = Number(barrel[0].match(/height="([\d.]+)"/)[1]);
ok(height > width * 4, 'rifle barrel is vertical, muzzle down, not aimed across the picture');
ok(!/<g id="rifle"[^>]*rotate/.test(knight), 'rifle group is not rotated toward a target');

const uses = home.match(/src="\/img\/knight\.svg"/g) || [];
ok(uses.length === 3, 'homepage shows the knight three times');
ok((home.match(/class="mascot hero-mascot"[^>]*alt="[^"]+"/g) || []).length === 1, 'hero knight has a text alternative');
ok((home.match(/<img class="mascot" src="\/img\/knight\.svg" alt=""/g) || []).length === 1, 'how-it-works knight is decorative');
ok((home.match(/<img class="mascot band-mascot" src="\/img\/knight\.svg" alt=""/g) || []).length === 1, 'banner knight is decorative');
ok(!/<figure\b/i.test(home), 'homepage still has no photo figure');
for (const img of ['houston-avatar.jpg', 'houston-plane.jpg', 'houston-river.jpg']) ok(!home.includes(img), 'homepage still omits ' + img);

for (const rel of ['public/about.html', 'public/site.js', 'public/check.html', 'emails.js']) {
  ok(!read(rel).includes('knight.svg'), rel + ' does not add the mascot');
}
const about = read('public/about.html');
ok(about.includes('/img/houston-plane.jpg') && about.includes('/img/houston-river.jpg'), 'about page still has both photos');

console.log(`Mascot tests passed (${n})`);
