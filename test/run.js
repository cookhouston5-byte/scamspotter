const { analyze } = require('../engine'); const { SAMPLES, LEGIT_SAMPLE } = require('../public/samples');
let fail = 0;
for (const s of [...SAMPLES, LEGIT_SAMPLE]) {
  const r = analyze(s); const ok = r.verdict === s.expect; if (!ok) fail++;
  console.log(`${ok?'PASS':'FAIL'}  ${s.label.padEnd(42)} expected=${s.expect.padEnd(10)} got=${r.verdict} (${r.score})`);
  r.reasons.forEach(x => console.log('       -', x.category, '+'+x.points));
}
console.log(fail ? `${fail} failed` : 'All tests passed'); process.exit(fail ? 1 : 0);
