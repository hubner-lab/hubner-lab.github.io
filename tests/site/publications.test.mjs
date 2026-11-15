// node --test tests/site/publications.test.mjs   (the last group needs `pnpm build` first)
// The Publications page in three groups:
//   1. the library src/lib/publications.ts on small made-up cases;
//   2. the same library on the real data: the records the Scholar bot wrote, the names on the
//      Team page and the spellings in src/site.config.ts;
//   3. the built page: every paper is in the markup, the controls that need a script are marked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  citationsLabel, doiFromUrl, foldAuthors, foldText, groupByYear, isPreprint, labMatcher, matchesTerms,
  nameKey, paperLink, searchFold, searchTerms, splitAuthors, toPaper, totals, yearCounts,
} from '../../src/lib/publications.ts';
import { site } from '../../src/site.config.ts';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// ------------------------------------------------------------------------------ 1. the library

test('splitAuthors: the names in order, spaces tidied, empty parts dropped', () => {
  assert.deepEqual(splitAuthors('Ana  Ruiz and Bo Li and  Cy Day '), ['Ana Ruiz', 'Bo Li', 'Cy Day']);
  assert.deepEqual(splitAuthors('Ana Ruiz'), ['Ana Ruiz']);
  assert.deepEqual(splitAuthors(''), []);
  assert.deepEqual(splitAuthors('Ana Ruiz and '), ['Ana Ruiz']);
  // "and" inside a word, or capitalised as a surname, does not split a name
  assert.deepEqual(splitAuthors('Alexander Brandt and Mehmet And'), ['Alexander Brandt', 'Mehmet And']);
});

test('foldText and nameKey: accents, case, hyphens, dots, apostrophes, middle initials', () => {
  assert.equal(foldText('Hübner'), 'hubner');
  assert.equal(nameKey('Sariel Hübner'), 'sariel hubner');
  assert.equal(nameKey('SARIEL  HUBNER'), 'sariel hubner');
  assert.equal(nameKey('Loren H. Rieseberg'), 'loren rieseberg');
  assert.equal(nameKey('Loren H Rieseberg'), nameKey('Loren Rieseberg'));
  assert.equal(nameKey('Shiran Ben‐Zeev'), nameKey('Shiran Ben-Zeev'), 'U+2010 and the keyboard hyphen');
  assert.equal(nameKey('Guy Ben-Zvi'), nameKey('Guy Ben Zvi'));
  assert.equal(nameKey('Ciarán O’Brien'), nameKey("Ciaran O'Brien"));
  assert.equal(nameKey('S Hübner'), 's hubner', 'an initial that is the whole first name stays');
  assert.notEqual(nameKey('S Hübner'), nameKey('Sariel Hübner'), 'an initial alone is not the full name');
  assert.equal(nameKey('  '), '');
});

test('labMatcher: any listed spelling, and nobody else', () => {
  const isLab = labMatcher(['Sariel Hübner', 'S Hübner', 'Evgenii Potapenko', 'Guy Ben Zvi', '']);
  for (const name of ['Sariel Hübner', 'Sariel Hubner', 'sariel hübner', 'S Hübner', 'S. Hubner', 'Evgenii V Potapenko', 'Guy Ben-Zvi']) {
    assert.ok(isLab(name), `${name} is a lab member`);
  }
  for (const name of ['Sarah Hübner', 'E Potapenko', 'Roi Ben-David', 'Zvi Peleg', 'Hübner', '']) {
    assert.ok(!isLab(name), `${name} is not a lab member`);
  }
});

test('foldAuthors: short lists are left whole', () => {
  const none = () => false;
  for (const n of [0, 1, 3, 4]) {
    const names = Array.from({ length: n }, (_, i) => `Author ${i + 1}`);
    const line = foldAuthors(names, none);
    assert.equal(line.more, 0, `${n} authors`);
    assert.deepEqual(line.shown.map((a) => a.name), names);
    assert.ok(line.shown.every((a) => !a.gap));
  }
});

test('foldAuthors: the first three, then the count of the rest', () => {
  const names = ['A One', 'B Two', 'C Three', 'D Four', 'E Five', 'F Six'];
  const line = foldAuthors(names, () => false);
  assert.deepEqual(line.shown.map((a) => a.name), ['A One', 'B Two', 'C Three']);
  assert.equal(line.more, 3);
  assert.deepEqual(line.all.map((a) => a.name), names, 'the whole list stays available, in order');
});

test('foldAuthors: a lab member further down stays visible, in order, with the gap marked', () => {
  const names = ['A One', 'B Two', 'C Three', 'D Four', 'E Five', 'Lab Member', 'G Seven', 'Second Member'];
  const isLab = labMatcher(['Lab Member', 'Second Member']);
  const line = foldAuthors(names, isLab);
  assert.deepEqual(
    line.shown.map((a) => [a.name, a.lab, a.gap]),
    [['A One', false, false], ['B Two', false, false], ['C Three', false, false], ['Lab Member', true, true], ['Second Member', true, true]],
  );
  assert.equal(line.more, 3);
  assert.equal(line.shown.length + line.more, line.all.length);
});

test('foldAuthors: a lab member right after the first three leaves no gap; one of the first three is bold too', () => {
  const names = ['Lab Member', 'B Two', 'C Three', 'Second Member', 'E Five', 'F Six', 'G Seven'];
  const line = foldAuthors(names, labMatcher(['Lab Member', 'Second Member']));
  assert.deepEqual(line.shown.map((a) => [a.name, a.lab, a.gap]),
    [['Lab Member', true, false], ['B Two', false, false], ['C Three', false, false], ['Second Member', true, false]]);
  assert.equal(line.more, 3);
});

test('foldAuthors: hiding one name is not worth a fold', () => {
  // five authors, the last a lab member: the fold would hide only the fourth
  const names = ['A One', 'B Two', 'C Three', 'D Four', 'Lab Member'];
  const line = foldAuthors(names, labMatcher(['Lab Member']));
  assert.equal(line.more, 0);
  assert.deepEqual(line.shown.map((a) => a.name), names);
  assert.deepEqual(line.shown.map((a) => a.lab), [false, false, false, false, true]);
});

test('doiFromUrl: the shapes publishers use', () => {
  const cases = [
    // Atypon and Wiley: /doi/<kind>/<DOI>
    ['https://onlinelibrary.wiley.com/doi/abs/10.1111/mec.70540', '10.1111/mec.70540'],
    ['https://nph.onlinelibrary.wiley.com/doi/abs/10.1002/ppp3.10505', '10.1002/ppp3.10505'],
    ['https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1365-294X.2011.05434.x', '10.1111/j.1365-294X.2011.05434.x'],
    ['https://onlinelibrary.wiley.com/doi/abs/10.1002/9781119072799.ch20', '10.1002/9781119072799.ch20'],
    ['https://onlinelibrary.wiley.com/doi/pdfdirect/10.1002/ece3.7519?download=true', '10.1002/ece3.7519'],
    ['https://onlinelibrary.wiley.com/doi/pdf/10.1002%2Fece3.7519', '10.1002/ece3.7519'],
    ['https://www.science.org/doi/abs/10.1126/science.add8655', '10.1126/science.add8655'],
    ['https://www.pnas.org/doi/abs/10.1073/pnas.2205783119', '10.1073/pnas.2205783119'],
    ['https://www.journals.uchicago.edu/doi/abs/10.1086/728405', '10.1086/728405'],
    ['https://www.cabidigitallibrary.org/doi/abs/10.1079/9781845938512.0186', '10.1079/9781845938512.0186'],
    // Springer
    ['https://link.springer.com/article/10.1186/s13059-026-04315-4', '10.1186/s13059-026-04315-4'],
    ['https://link.springer.com/article/10.1186/s12870-015-0528-z', '10.1186/s12870-015-0528-z'],
    ['https://link.springer.com/content/pdf/10.1007/s00122-025-04981-1.pdf', '10.1007/s00122-025-04981-1'],
    // bioRxiv: a version and a view after the DOI, the old and the new registrant
    ['https://www.biorxiv.org/content/10.1101/2024.09.02.610836.abstract', '10.1101/2024.09.02.610836'],
    ['https://www.biorxiv.org/content/10.64898/2026.01.28.702265.abstract', '10.64898/2026.01.28.702265'],
    ['https://www.biorxiv.org/content/10.1101/2020.07.02.185488v2', '10.1101/2020.07.02.185488'],
    ['https://www.biorxiv.org/content/10.1101/2020.07.02.185488v1.full', '10.1101/2020.07.02.185488'],
    ['https://www.biorxiv.org/content/10.1101/2020.07.02.185488v3.full.pdf+html', '10.1101/2020.07.02.185488'],
    ['https://www.biorxiv.org/content/biorxiv/early/2021/04/16/2021.04.15.439933.full.pdf', null],
    // Frontiers: /full after the DOI
    ['https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2023.1145371/full', '10.3389/fpls.2023.1145371'],
    ['https://www.frontiersin.org/journals/microbiology/articles/10.3389/fmicb.2016.00248/full', '10.3389/fmicb.2016.00248'],
    // PLOS: the DOI is a parameter
    ['https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0021227', '10.1371/journal.pone.0021227'],
    // Oxford: an article number, and sometimes a file, after a two-part DOI
    ['https://academic.oup.com/mbe/article-pdf/doi/10.1093/molbev/msag051/67287342/msag051.pdf', '10.1093/molbev/msag051'],
    ['https://academic.oup.com/jxb/advance-article-abstract/doi/10.1093/jxb/erag141/8537280', '10.1093/jxb/erag141'],
    ['https://academic.oup.com/mbe/article/doi/10.1093/molbev/msaf014', '10.1093/molbev/msaf014'],
    // the DOI's own address
    ['https://doi.org/10.1111/eva.12367', '10.1111/eva.12367'],
    ['https://doi.org/10.1093/molbev/msag051', '10.1093/molbev/msag051'],
    ['http://dx.doi.org/10.1016/S0169-5347(03)00060-4/', '10.1016/S0169-5347(03)00060-4'],
  ];
  for (const [url, doi] of cases) assert.equal(doiFromUrl(url), doi, url);
});

test('doiFromUrl: no DOI is better than a wrong one', () => {
  const none = [
    '',
    'not a link',
    'javascript:alert(1)',
    'https://www.nature.com/articles/s41477-026-02283-y',
    'https://www.mdpi.com/2073-4425/10/9/422',
    'https://www.sciencedirect.com/science/article/pii/S1369526622000243',
    'https://academic.oup.com/gbe/article-abstract/15/1/evac168/6855281',
    'https://europepmc.org/article/ppr/ppr470786',
    'https://scholar.google.com/scholar?cluster=169660489207441322&hl=en&oi=scholarr',
    'https://books.google.com/books?hl=en&lr=&id=AVSvDAAAQBAJ&oi=fnd&pg=PA13',
    'https://assets-eu.researchsquare.com/files/rs-8786947/v1/225dab17-94c0-4b87-8b96-d4b7a46e4b53.pdf',
    'https://pdfs.semanticscholar.org/90d7/c6695fe6dc2402822ff55d8d8184ecb68970.pdf',
    'https://scisoc.confex.com/scisoc/2014am/meetingapp.cgi/Paper/86069',
    // something this module does not know follows the DOI: no guess
    'https://example.org/doi/10.1234/abc.123/suppl_file/data.zip',
    'https://www.researchsquare.com/article/10.21203/rs.3.rs-8786947/v1',
    // Oxford with nothing recognisable left after the article number
    'https://academic.oup.com/genetics/article/doi/10.1093/genetics/123456',
    // characters a link would have to escape
    'https://example.org/doi/10.1002/(SICI)1097-0010(199601)70:1%3C1::AID-JSFA451%3E3.0.CO;2-B',
  ];
  for (const url of none) assert.equal(doiFromUrl(url), null, url);
});

test('paperLink: the DOI address, else the stored link, else nothing', () => {
  assert.deepEqual(paperLink('https://onlinelibrary.wiley.com/doi/abs/10.1111/mec.16380'),
    { href: 'https://doi.org/10.1111/mec.16380', doi: '10.1111/mec.16380' });
  assert.deepEqual(paperLink(' https://www.nature.com/articles/nature22380 '),
    { href: 'https://www.nature.com/articles/nature22380', doi: null });
  assert.equal(paperLink(''), null);
  assert.equal(paperLink('   '), null);
  assert.equal(paperLink('javascript:alert(1)'), null, 'only web addresses become links');
  assert.equal(paperLink('see the journal'), null);
});

test('isPreprint: by the venue; by the link only when there is no venue', () => {
  const yes = [
    { venue: 'bioRxiv', url: '' }, { venue: 'BioRxiv', url: '' }, { venue: 'medRxiv', url: '' },
    { venue: 'arXiv preprint arXiv:2101.00001', url: '' }, { venue: 'Research Square', url: '' },
    { venue: 'Authorea Preprints', url: '' }, { venue: 'EcoEvoRxiv', url: '' },
    { venue: '', url: 'https://assets-eu.researchsquare.com/files/rs-8786947/v1/x.pdf' },
    { venue: '', url: 'https://europepmc.org/article/ppr/ppr470786' },
    { venue: ' ', url: 'https://www.biorxiv.org/content/10.1101/2022.03.17.484745.abstract' },
  ];
  const no = [
    { venue: 'Molecular Ecology', url: '' },
    { venue: 'Molecular Ecology', url: 'https://www.biorxiv.org/content/10.1101/2022.03.17.484745.abstract' },
    { venue: 'Plant and Animal Genome XXVIII Conference (January 11-15, 2020)', url: '' },
    { venue: '', url: '' }, { venue: '', url: 'not a link' },
    { venue: '', url: 'https://europepmc.org/article/med/12345' },
    { venue: '', url: 'https://onlinelibrary.wiley.com/doi/abs/10.1111/eva.12367' },
  ];
  for (const r of yes) assert.ok(isPreprint(r), `${JSON.stringify(r)} is a preprint`);
  for (const r of no) assert.ok(!isPreprint(r), `${JSON.stringify(r)} is not a preprint`);
});

test('toPaper, citationsLabel, groupByYear, yearCounts, totals', () => {
  const isLab = labMatcher(['Lab Member']);
  const records = [
    { year: 2024, title: ' A  title ', authors: 'Lab Member and B Two', venue: 'bioRxiv', url: 'https://www.biorxiv.org/content/10.1101/2024.09.02.610836.abstract', citations: 1 },
    { year: 2021, title: 'Older', authors: 'B Two', venue: '', url: '', citations: 0 },
    { year: 2024, title: 'Second of 2024', authors: 'B Two', venue: 'Genetics', url: 'https://example.org/x', citations: 1200 },
  ];
  const papers = records.map((r) => toPaper(r, isLab));
  assert.deepEqual(papers[0], {
    year: 2024, title: 'A title', venue: 'bioRxiv', citations: 1, type: 'preprint',
    link: { href: 'https://doi.org/10.1101/2024.09.02.610836', doi: '10.1101/2024.09.02.610836' },
    authors: {
      all: [{ name: 'Lab Member', lab: true }, { name: 'B Two', lab: false }],
      shown: [{ name: 'Lab Member', lab: true, gap: false }, { name: 'B Two', lab: false, gap: false }],
      more: 0,
    },
  });
  assert.equal(papers[1].link, null);
  assert.equal(papers[1].type, 'article');

  assert.deepEqual(papers.map((p) => citationsLabel(p.citations)), ['1 citation', '', '1,200 citations']);

  assert.deepEqual(groupByYear(papers).map((g) => [g.year, g.items.map((p) => p.title)]),
    [[2024, ['A title', 'Second of 2024']], [2021, ['Older']]]);

  assert.deepEqual(yearCounts(papers), [
    { year: 2021, count: 1 }, { year: 2022, count: 0 }, { year: 2023, count: 0 }, { year: 2024, count: 2 },
  ]);
  assert.deepEqual(yearCounts([]), []);

  assert.deepEqual(totals(papers), { count: 3, articles: 2, preprints: 1, citations: 1201, firstYear: 2021, lastYear: 2024 });
  assert.deepEqual(totals([]), { count: 0, articles: 0, preprints: 0, citations: 0, firstYear: null, lastYear: null });
});

test('search: accents, case, dashes and apostrophes do not matter; every word must be there', () => {
  const text = searchFold('Intraspecific genome size  variation Sariel Hübner Shiran Ben‐Zeev Ciarán O’Brien Molecular Biology and Evolution 2026');
  const hit = (q) => matchesTerms(text, searchTerms(q));
  assert.ok(hit(''), 'an empty query matches everything');
  assert.ok(hit('   '));
  assert.ok(hit('hubner'));
  assert.ok(hit('HÜBNER'));
  assert.ok(hit('ben-zeev'));
  assert.ok(hit("o'brien"));
  assert.ok(hit('genome 2026'));
  assert.ok(hit('  evolution   genome '), 'the order of the words does not matter');
  assert.ok(!hit('genome 2025'));
  assert.ok(!hit('barley'));
  assert.deepEqual(searchTerms('  Wild  Barley '), ['wild', 'barley']);
});

// ------------------------------------------------------------------------------ 2. the real data

const records = JSON.parse(readFileSync(here('../../src/data/publications.json'), 'utf8'));
const teamDir = here('../../src/content/team/');
const teamNames = readdirSync(teamDir).filter((f) => f.endsWith('.md')).map((f) => {
  const name = /^name:\s*(.+?)\s*$/m.exec(readFileSync(path.join(teamDir, f), 'utf8'))?.[1];
  assert.ok(name, `${f} has no name`);
  return name.replace(/^(['"])(.*)\1$/, '$2');
});
const isLab = labMatcher([...teamNames, ...site.labAuthors, ...site.pi.spellings]);
const papers = records.map((r) => toPaper(r, isLab));

test('data: every record becomes a paper with a year, a title and at least one author', () => {
  assert.ok(papers.length > 0, 'publications.json is empty');
  for (const p of papers) {
    assert.ok(Number.isInteger(p.year) && p.year > 1900 && p.year < 2100, `"${p.title}": year ${p.year}`);
    assert.ok(p.title, 'a record has no title');
    assert.ok(p.authors.all.length > 0, `"${p.title}" has no author`);
    assert.equal(p.authors.shown.length + p.authors.more, p.authors.all.length, `"${p.title}": the fold loses or doubles a name`);
    assert.ok(p.authors.more === 0 || p.authors.more >= 2, `"${p.title}": folded for a single name`);
  }
});

test('data: the PI is recognised under every spelling the records use', () => {
  // The surname of the PI, accents off. An author with that surname who is not matched means a
  // new spelling: add it to `pi.spellings` in src/site.config.ts.
  const surname = nameKey(site.pi.name).split(' ').pop();
  const missed = new Set();
  let bold = 0;
  for (const p of papers) {
    for (const a of p.authors.all) {
      if (!nameKey(a.name).split(' ').includes(surname)) continue;
      if (a.lab) bold++;
      else missed.add(a.name);
    }
  }
  assert.deepEqual([...missed], [], `spelling(s) of the PI that are not in pi.spellings: ${[...missed].join(', ')}`);
  assert.ok(bold > 0, 'the PI is in no author list at all');
});

test('data: a lab member is never folded away', () => {
  for (const p of papers) {
    const shown = new Set(p.authors.shown.map((a) => a.name));
    for (const a of p.authors.all.filter((x) => x.lab)) {
      assert.ok(shown.has(a.name), `"${p.title}": ${a.name} is hidden in the fold`);
    }
  }
});

test('data: every link is a web address; a DOI link has the shape of a DOI', (t) => {
  let doi = 0, stored = 0, none = 0;
  for (const p of papers) {
    if (!p.link) { none++; continue; }
    assert.match(p.link.href, /^https?:\/\/[^\s"<>]+$/, `"${p.title}": ${p.link.href}`);
    if (p.link.doi) {
      doi++;
      assert.equal(p.link.href, `https://doi.org/${p.link.doi}`);
      assert.match(p.link.doi, /^10\.\d{4,9}\/[A-Za-z0-9][A-Za-z0-9._;()\/:-]*[A-Za-z0-9)]$/, `"${p.title}": ${p.link.doi}`);
    } else stored++;
  }
  t.diagnostic(`links: ${doi} through the DOI, ${stored} the stored link, ${none} without a link, of ${papers.length} papers`);
});

test('data: totals and the year strip agree with the list', (t) => {
  const sum = totals(papers);
  const counts = yearCounts(papers);
  assert.equal(sum.count, records.length);
  assert.equal(sum.articles + sum.preprints, sum.count);
  assert.equal(counts.reduce((n, y) => n + y.count, 0), sum.count);
  assert.equal(counts[0].year, sum.firstYear);
  assert.equal(counts.at(-1).year, sum.lastYear);
  assert.equal(counts.length, sum.lastYear - sum.firstYear + 1, 'one bar per year, years without a paper included');
  assert.deepEqual(groupByYear(papers).map((g) => g.year), counts.filter((y) => y.count > 0).map((y) => y.year).reverse());
  const folded = papers.filter((p) => p.authors.more > 0).length;
  const bold = papers.filter((p) => p.authors.all.some((a) => a.lab)).length;
  t.diagnostic(`papers: ${sum.count} (${sum.articles} articles, ${sum.preprints} preprints), ${sum.citations} citations, ` +
    `${sum.firstYear} to ${sum.lastYear}; ${folded} author lists folded; a lab member is bold in ${bold}`);
});

// ------------------------------------------------------------------------------ 3. the built page

const pageFile = here('../../dist/publications/index.html');
const built = () => {
  assert.ok(existsSync(pageFile), 'dist/publications/index.html is missing: run `pnpm build` first');
  return readFileSync(pageFile, 'utf8');
};
const unescape = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? unescape(m[1]) : undefined; };
const has = (tag, name) => new RegExp(`\\s${name}(?=[\\s=>])`).test(tag);
const openTags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))];
/** The whole element that starts with the opening tag `m` (a match of openTags), nested elements of the same name included. */
function element(html, m) {
  const name = /^<([a-z0-9]+)/i.exec(m[0])[1];
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, 'g');
  re.lastIndex = m.index;
  let depth = 0, t;
  while ((t = re.exec(html))) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(m.index, t.index + t[0].length);
  }
  assert.fail(`<${name}> is not closed`);
}
const listed = groupByYear(papers).flatMap((g) => g.items); // the papers in the order of the page

test('page: every paper is in the markup, in order, with its year and its kind, and none is hidden', () => {
  const html = built();
  const rows = openTags(html, 'li').filter((m) => has(m[0], 'data-pub'));
  assert.equal(rows.length, listed.length, 'one row per record');
  rows.forEach((m, i) => {
    const row = element(html, m);
    const title = unescape(/<p class="title"[^>]*>([\s\S]*?)<\/p>/.exec(row)?.[1] ?? '').trim();
    assert.equal(title, listed[i].title, `row ${i + 1}`);
    assert.equal(attr(m[0], 'data-year'), String(listed[i].year), `"${title}": data-year`);
    assert.equal(attr(m[0], 'data-type'), listed[i].type, `"${title}": data-type`);
    assert.ok(!has(m[0], 'hidden'), `"${title}" is hidden in the markup`);
  });
});

test('page: a section for every year with papers, and a bar of the strip leads to each', () => {
  const html = built();
  const years = groupByYear(papers).map((g) => g.year);
  const sections = openTags(html, 'section').filter((m) => has(m[0], 'data-year-group'));
  assert.deepEqual(sections.map((m) => attr(m[0], 'id')), years.map((y) => `y${y}`));
  assert.ok(sections.every((m) => !has(m[0], 'hidden')), 'a year is hidden in the markup');
  const links = openTags(html, 'a').filter((m) => has(m[0], 'data-year-link'));
  assert.deepEqual(links.map((m) => attr(m[0], 'href')).sort(), years.map((y) => `#y${y}`).sort());
  for (const m of links) {
    const year = attr(m[0], 'data-year-link');
    const count = papers.filter((p) => String(p.year) === year).length;
    assert.equal(attr(m[0], 'aria-label'), `${year}: ${count} ${count === 1 ? 'paper' : 'papers'}`);
  }
  const bars = element(html, openTags(html, 'ol').find((m) => /\bbars\b/.test(attr(m[0], 'class') ?? '')));
  assert.equal(openTags(bars, 'li').length, yearCounts(papers).length, 'one bar per year from the first to the last');
});

test('page: the search box and the filter are marked as needing a script; the list and the year strip are not', () => {
  const html = built();
  const blocks = openTags(html, '[a-z0-9]+').filter((m) => has(m[0], 'data-js-only')).map((m) => element(html, m));
  const inBlock = (needle) => blocks.some((b) => b.includes(needle));
  const search = openTags(html, 'input').filter((m) => has(m[0], 'data-pub-search'));
  const filters = openTags(html, 'input').filter((m) => has(m[0], 'data-pub-filter'));
  assert.equal(search.length, 1, 'one search box');
  assert.deepEqual(filters.map((m) => attr(m[0], 'value')), ['all', 'article', 'preprint']);
  assert.deepEqual(filters.map((m) => has(m[0], 'checked')), [true, false, false], '"All" is the choice at the start');
  for (const m of [...search, ...filters]) assert.ok(inBlock(m[0]), `${m[0]} would show without JavaScript and do nothing`);
  assert.ok(!inBlock('data-pub '), 'a paper is inside a block that is hidden without JavaScript');
  assert.ok(!inBlock('data-year-link'), 'the year strip is inside a block that is hidden without JavaScript');
  const empty = openTags(html, 'p').find((m) => has(m[0], 'data-pub-empty'));
  assert.ok(empty && has(empty[0], 'hidden'), 'the "No papers match" line must start hidden');
});

test('page: the header and the filter give the totals of the data', () => {
  const html = built();
  const sum = totals(papers);
  const lead = unescape((/<p class="lead"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  assert.equal(lead, `${sum.count} papers, ${sum.citations.toLocaleString('en-US')} citations, ${sum.firstYear} to ${sum.lastYear}. Refreshed from Google Scholar.`);
  const chips = openTags(html, 'label').filter((m) => /\bfilter\b/.test(attr(m[0], 'class') ?? ''))
    .map((m) => element(html, m).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  assert.deepEqual(chips, [`All ${sum.count}`, `Articles ${sum.articles}`, `Preprints ${sum.preprints}`]);
});

test('page: lab members are bold; a folded list keeps the whole list inside; names are never markup', () => {
  const html = built();
  const rows = openTags(html, 'li').filter((m) => has(m[0], 'data-pub')).map((m) => element(html, m));
  const text = (s) => unescape(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  rows.forEach((row, i) => {
    const { authors, title } = listed[i];
    const bold = [...row.matchAll(/<b\b[^>]*>([\s\S]*?)<\/b>/g)].map((m) => unescape(m[1]));
    const lab = (list) => list.filter((a) => a.lab).map((a) => a.name);
    const all = authors.all.map((a) => a.name).join(', ');
    if (authors.more > 0) {
      assert.deepEqual(bold, [...lab(authors.shown), ...lab(authors.all)], `"${title}": the names in bold`);
      const details = element(row, openTags(row, 'details')[0]);
      assert.equal(text(/<p class="all"[^>]*>([\s\S]*?)<\/p>/.exec(details)[1]), all, `"${title}": the whole list`);
      assert.match(text(/<summary\b[^>]*>([\s\S]*?)<\/summary>/.exec(details)[1]), new RegExp(`\\+${authors.more} more`), `"${title}": the count of the fold`);
    } else {
      assert.deepEqual(bold, lab(authors.all), `"${title}": the names in bold`);
      assert.equal(openTags(row, 'details').length, 0, `"${title}": a list that is not folded needs no <details>`);
      assert.equal(text(/<p class="authors"[^>]*>([\s\S]*?)<\/p>/.exec(row)[1]), all, `"${title}": the author line`);
    }
  });
  for (const f of ['../../src/pages/publications.astro', '../../src/components/PublicationItem.astro']) {
    assert.ok(!/set:html/.test(readFileSync(here(f), 'utf8')), `${f} writes a string as markup (set:html)`);
  }
});

test('page: "Read paper" is the link the library gives, opens a new tab safely and is named after its paper', () => {
  const html = built();
  const links = openTags(html, 'a').filter((m) => /\bread\b/.test(attr(m[0], 'class') ?? ''));
  const want = listed.filter((p) => p.link);
  assert.deepEqual(links.map((m) => attr(m[0], 'href')), want.map((p) => p.link.href));
  links.forEach((m, i) => {
    assert.equal(attr(m[0], 'target'), '_blank');
    assert.match(attr(m[0], 'rel') ?? '', /\bnoopener\b/);
    assert.equal(attr(m[0], 'aria-label'), `Read paper: ${want[i].title} (opens in a new tab)`);
  });
});
