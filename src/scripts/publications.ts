// The Publications page: the search box, the article and preprint filter, and the year strip
// that follows them. Every paper is in the markup already; this only hides the rows that do
// not match, then the years that have no row left, and switches off the bar of such a year.
// What a paper is searched by: its year, and the text of its parts marked `data-search`
// (the title, the whole author list, the venue).
import { matchesTerms, searchFold, searchTerms } from '../lib/publications';

const root = document.querySelector<HTMLElement>('[data-pubs]');

if (root) {
  const search = root.querySelector<HTMLInputElement>('[data-pub-search]');
  const filters = [...root.querySelectorAll<HTMLInputElement>('[data-pub-filter]')];
  const status = root.querySelector<HTMLElement>('[data-pub-status]');
  const empty = root.querySelector<HTMLElement>('[data-pub-empty]');
  const reset = root.querySelector<HTMLButtonElement>('[data-pub-reset]');

  const yearLinks = new Map(
    [...root.querySelectorAll<HTMLAnchorElement>('[data-year-link]')].map((a) => [a.dataset.yearLink, a]),
  );
  const years = [...root.querySelectorAll<HTMLElement>('[data-year-group]')].map((group) => ({
    group,
    link: yearLinks.get(group.dataset.yearGroup),
    rows: [...group.querySelectorAll<HTMLElement>('[data-pub]')].map((row) => ({
      row,
      type: row.dataset.type,
      text: searchFold(
        [row.dataset.year, ...[...row.querySelectorAll('[data-search]')].map((part) => part.textContent)].join(' '),
      ),
    })),
  }));
  const total = years.reduce((n, year) => n + year.rows.length, 0);

  const apply = () => {
    const terms = searchTerms(search?.value ?? '');
    const type = filters.find((f) => f.checked)?.value ?? 'all';
    let shown = 0;
    for (const { group, link, rows } of years) {
      let inYear = 0;
      for (const { row, type: rowType, text } of rows) {
        const match = (type === 'all' || rowType === type) && matchesTerms(text, terms);
        row.hidden = !match;
        if (match) inYear++;
      }
      group.hidden = inYear === 0;
      if (link) {
        // A link to a year that is not shown would lead nowhere.
        if (inYear === 0) {
          link.setAttribute('aria-disabled', 'true');
          link.tabIndex = -1;
        } else {
          link.removeAttribute('aria-disabled');
          link.removeAttribute('tabindex');
        }
      }
      shown += inYear;
    }
    if (empty) empty.hidden = shown > 0;
    if (status) {
      status.textContent =
        shown === total ? '' : shown === 0 ? 'No papers match.' : `${shown} of ${total} papers shown.`;
    }
  };

  search?.addEventListener('input', apply);
  filters.forEach((f) => f.addEventListener('change', apply));
  reset?.addEventListener('click', () => {
    if (search) search.value = '';
    filters.forEach((f) => (f.checked = f.value === 'all'));
    apply();
    search?.focus();
  });
  // A browser may put back what was typed when the visitor returns to the page.
  window.addEventListener('pageshow', apply);
  apply();
}
