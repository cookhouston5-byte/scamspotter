// Houston's photos stay on the About page only. Shared chrome, the homepage,
// the slide-out menu, and the welcome email must not embed them.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { welcomeEmail } = require('../emails');

const root = path.join(__dirname, '..');
const PORTRAITS = ['houston-avatar.jpg', 'houston-plane.jpg', 'houston-river.jpg'];
const ABOUT_PHOTOS = ['houston-plane.jpg', 'houston-river.jpg'];

const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const pages = fs.readdirSync(path.join(root, 'public')).filter(f => f.endsWith('.html')).sort();

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log('PASS ', msg); };

for (const page of pages) {
  const html = read('public/' + page);
  const button = html.match(/<button class="menu-btn"[\s\S]*?<\/button>/);
  ok(button, page + ' has a menu button');
  ok(!/<img\b/i.test(button[0]), page + ' menu button is text and an icon, with no photo');
  ok(/aria-label="Menu"/.test(button[0]) && />Menu</.test(button[0]), page + ' menu button is labeled Menu');

  const mainMatch = html.match(/<main>([\s\S]*)<\/main>/);
  const main = mainMatch ? mainMatch[1] : '';
  const chrome = mainMatch ? html.replace(mainMatch[1], '') : html;
  for (const img of PORTRAITS) ok(!chrome.includes(img), page + ' header, nav, and footer omit ' + img);

  if (page === 'about.html') {
    for (const img of ABOUT_PHOTOS) ok(main.includes('/img/' + img), 'about page keeps ' + img);
    ok(!main.includes('houston-avatar.jpg'), 'about page biography does not use the menu avatar');
    ok(main.includes('Why ScamSpotter exists') && main.includes('Say hello') && main.includes('Houston Cook'), 'about page keeps the biography');
    ok(main.includes('Houston, in the air over the ice') && main.includes('Home is Alaska'), 'about page keeps the photo captions');
  } else {
    for (const img of PORTRAITS) ok(!html.includes(img), page + ' does not include ' + img);
  }
}

ok(pages.includes('index.html') && pages.includes('about.html'), 'homepage and about page are both covered');
const home = read('public/index.html');
ok(home.includes('Hi, I’m Houston.') && home.includes('href="/about"'), 'homepage keeps a text introduction and a link to About');
ok(!/<figure\b/i.test(home), 'homepage has no photo figure');

const site = read('public/site.js');
const aboutLink = site.match(/<a class="dlink" href="\/about">([\s\S]*?)<\/a>/);
ok(aboutLink, 'menu includes a link to /about');
const aboutLabel = aboutLink[1].replace(/\$\{[^}]+\}/g, '').replace(/<[^>]+>/g, '').trim();
ok(aboutLabel === 'About', 'menu About item is the text “About”');
ok(!/data-menu/.test(aboutLink[0]), 'menu About item navigates to the page');
ok(!site.includes('id="m-about"') && !/About the owner/.test(site), 'menu does not embed an About teaser');
ok(!/<img\b/i.test(site), 'menu script has no images');
for (const img of PORTRAITS) ok(!site.includes(img), 'menu script omits ' + img);

for (const rel of ['public/home.js', 'public/app.js', 'public/samples.js', 'public/styles.css', 'emails.js']) {
  const src = read(rel);
  for (const img of PORTRAITS) ok(!src.includes(img), rel + ' omits ' + img);
}

for (const img of ABOUT_PHOTOS) ok(fs.existsSync(path.join(root, 'public/img', img)), img + ' is still on disk for the About page');

const mail = welcomeEmail({ name: 'Pat Lee', key: 'SS-cus_TEST.key' });
for (const img of PORTRAITS) {
  ok(!mail.html.includes(img) && !mail.text.includes(img), 'welcome email omits ' + img);
}
ok(mail.html.includes('Houston Cook') && mail.text.includes('Houston Cook'), 'welcome email keeps the written signature');
ok(!/<img\b/i.test(mail.html), 'welcome email has no portrait image');

console.log(`Portrait placement tests passed (${n})`);
