// Admin tab: the approval queue. Every string that came from a member goes in through textContent.
import { Timestamp, type Firestore } from 'firebase/firestore/lite';
import {
  approve, loadRows, otherSlugs, readPhotoBytes, removeAll, requestChanges, saveEdit, StaleCardError,
  unpublish, type Row,
} from './adminCards';
import { readSynced } from './cards';
import {
  CONTENT_KEYS, groupOptions, isSlug, MAX, normalizeInterests, validate, type CardValues,
} from './limits';

const SYNC_WORKFLOW = 'https://github.com/hubner-lab/hubner-lab.github.io/actions/workflows/members-sync.yml';
const WAIT_WARN_MS = 90 * 60 * 1000;

const LABELS: Record<string, string> = {
  name: 'Name', role: 'Role', group: 'Group', alumni: 'Alumni', bio: 'Bio', interests: 'Interests',
  email: 'Email', orcid: 'ORCID', scholar: 'Scholar', github: 'GitHub', website: 'Website',
  linkedin: 'LinkedIn', yearJoined: 'Year joined', yearLeft: 'Year left',
  currentPosition: 'Current position', photoRev: 'Photo', order: 'Pinned order',
};

type Attrs = Record<string, string | boolean | undefined>;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Attrs = {}, ...kids: Array<Node | string | null | false>
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids) if (kid) e.append(kid);
  return e;
}

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '(empty)' : String(v));
const ts = (v: unknown) => (v instanceof Timestamp ? v.toDate().toLocaleString() : '');
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function toValues(c: Row['card']): CardValues {
  return {
    name: str(c.name), role: str(c.role), group: str(c.group), alumni: c.alumni === true, bio: str(c.bio),
    interests: str(c.interests), email: str(c.email), orcid: str(c.orcid), scholar: str(c.scholar),
    github: str(c.github), linkedin: str(c.linkedin), website: str(c.website),
    yearJoined: str(c.yearJoined), yearLeft: str(c.yearLeft), currentPosition: str(c.currentPosition),
  };
}

/** Field-by-field: what this card says against the copy that is live. */
export function changesAgainstLive(card: Row['card'], live: Row['published']): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  const keys = [...CONTENT_KEYS, 'order'] as const;
  for (const k of keys) {
    const a = live ? show(live[k]) : '';
    const b = show(card[k]);
    if (live ? a !== b : b !== '(empty)') out.push([k, live ? a : '', b]);
  }
  return out;
}

export interface AdminContext {
  db: Firestore;
  syncedUrl: string;
  onError: (e: unknown) => void;
}

export function mountAdmin(root: HTMLElement, ctx: AdminContext) {
  const open = new Set<string>();
  let rows: Row[] = [];
  let synced: Record<string, string> | null = null;
  let busy = false;

  async function refresh() {
    try {
      [rows, synced] = await Promise.all([loadRows(ctx.db), readSynced(ctx.syncedUrl)]);
      render();
    } catch (e) {
      ctx.onError(e);
    }
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    try {
      await action();
    } catch (e) {
      if (e instanceof StaleCardError) {
        alert('This card changed after you opened it. The list was reloaded: review it again before approving.');
      } else if (e instanceof Error && e.message === 'photo-mismatch') {
        alert('The working photo does not match the card\'s photo. Ask the member to save the card again.');
      } else if (e instanceof Error && e.message === 'slug-taken') {
        alert('Another published card already uses this slug. Edit the card and choose a different slug first.');
      } else if (e instanceof Error && e.message === 'note-required') {
        alert('Write a note for the member first.');
      } else {
        ctx.onError(e);
      }
    } finally {
      busy = false;
      root.removeAttribute('aria-busy');
      await refresh();
    }
  }

  const waiting = (r: Row) =>
    r.card.status === 'approved' && !!r.published && synced !== null && synced[r.uid] !== r.published.rev;

  function head() {
    const late = rows.filter(
      (r) => waiting(r) && r.card.reviewedAt instanceof Timestamp && Date.now() - r.card.reviewedAt.toMillis() > WAIT_WARN_MS,
    );
    return h(
      'div', { class: 'mb-6' },
      h('p', { class: 'm-small' },
        'Approved cards reach the Team page when the site next updates. ',
        h('a', { class: 'm-link', href: SYNC_WORKFLOW, target: '_blank', rel: 'noopener noreferrer' }, 'Publish now'),
        ' opens the update job on GitHub; press "Run workflow" there.'),
      late.length > 0 && h('div', { class: 'm-note m-error mt-4', role: 'alert' },
        h('strong', {}, `${late.length} approved card${late.length > 1 ? 's have' : ' has'} waited more than 90 minutes for the site.`),
        h('span', {}, 'The update job may have failed. Open it with "Publish now" and check the last run.')),
    );
  }

  function render() {
    root.replaceChildren(head());
    if (rows.length === 0) root.append(h('p', { class: 'm-small' }, 'No cards yet.'));
    for (const r of rows) root.append(rowEl(r));
  }

  function rowEl(r: Row) {
    const c = r.card;
    const status = str(c.status);
    const verified = c.emailVerified === true;
    const changes = changesAgainstLive(c, r.published);
    const isOpen = open.has(r.uid);

    const summary = h('button', { type: 'button', class: 'm-rowhead', 'aria-expanded': String(isOpen) },
      h('span', { class: 'm-rowname' }, show(c.name), ' ', h('span', { class: 'm-req' }, show(c.role))),
      h('span', { class: `m-badge m-${status}` }, status.replace('_', ' ')),
    );
    summary.addEventListener('click', () => {
      if (open.has(r.uid)) open.delete(r.uid);
      else open.add(r.uid);
      render();
    });

    const meta = h('p', { class: 'm-small' },
      `Account ${show(c.accountEmail)} via ${show(c.provider)} · `,
      h('span', { class: verified ? '' : 'm-err' }, verified ? 'verified' : 'NOT verified'),
      c.updatedAt ? ` · changed ${ts(c.updatedAt)}` : '',
      r.published ? ` · live as "${str(r.published.slug)}"${waiting(r) ? ' (waiting for the site)' : ''}` : ' · not published',
    );

    const diff = h('div', { class: 'mt-2' },
      h('p', { class: 'caption mb-1' }, r.published ? 'Changes against the live card' : 'New card, nothing published yet'),
    );
    if (changes.length === 0) diff.append(h('p', { class: 'm-small' }, r.published ? 'No changes.' : 'Nothing filled in.'));
    else {
      const ul = h('ul', { class: 'm-diff' });
      for (const [k, a, b] of changes) {
        if (k === 'photoRev') {
          ul.append(h('li', {}, h('strong', {}, `${LABELS[k]}: `), r.published ? 'changed' : 'added'));
          continue;
        }
        ul.append(h('li', {}, h('strong', {}, `${LABELS[k] ?? k}: `),
          r.published ? h('span', { class: 'm-old' }, a) : null, r.published ? ' → ' : null, h('span', { class: 'm-new' }, b)));
      }
      diff.append(ul);
    }

    const body = h('div', { class: 'm-rowbody' }, meta, diff);

    // Photo
    const photoBox = h('div', { class: 'mt-3' });
    if (c.photoRev) {
      const holder = h('span', { class: 'm-small' }, 'Loading photo…');
      photoBox.append(holder);
      readPhotoBytes(ctx.db, r.uid).then((bytes) => {
        if (!bytes) { holder.textContent = 'Photo missing.'; return; }
        const img = h('img', { alt: '', width: '96', height: '96', class: 'm-thumb' });
        img.src = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
        holder.replaceWith(img);
      }).catch(() => (holder.textContent = 'Photo could not be read.'));
    }
    body.append(photoBox);

    // Actions
    const btn = (label: string, cls: string, fn: () => void) => {
      const b = h('button', { type: 'button', class: cls }, label);
      b.addEventListener('click', fn);
      return b;
    };
    const note = h('textarea', { class: 'm-input', rows: '3', maxlength: '500', placeholder: 'What should the member change?', hidden: true });
    const noteRow = h('div', { class: 'mt-3 flex flex-col gap-2', hidden: true }, note,
      btn('Send request', 'm-btn', () => run(() => requestChanges(ctx.db, r.uid, note.value))));
    const edit = editor(r);

    const canApprove = status !== 'draft';
    const actions = h('div', { class: 'flex flex-wrap gap-3 mt-4' },
      canApprove && btn(status === 'approved' ? 'Re-publish' : 'Approve', 'm-btn m-btn-primary', () => {
        const seen = c.updatedAt;
        if (!(seen instanceof Timestamp)) return;
        run(() => approve(ctx.db, r.uid, seen, otherSlugs(rows, r.uid)));
      }),
      canApprove && status !== 'changes_requested' && btn('Request changes', 'm-btn', () => {
        noteRow.toggleAttribute('hidden');
        note.toggleAttribute('hidden');
        note.focus();
      }),
      btn('Edit', 'm-btn', () => edit.toggleAttribute('hidden')),
      r.published && btn('Unpublish', 'm-btn', () => {
        if (confirm(`Take ${show(c.name)} off the Team page? The card goes back to draft.`)) run(() => unpublish(ctx.db, r.uid));
      }),
      btn('Reject and delete', 'm-link', () => {
        if (confirm(`Delete the card of ${show(c.name)}${r.published ? ', including the live copy' : ''}? This cannot be undone.`)) {
          run(() => removeAll(ctx.db, r.uid));
        }
      }),
    );
    if (status === 'draft') body.append(h('p', { class: 'm-small mt-3' }, 'A draft is not submitted: nothing to approve yet.'));
    body.append(actions, noteRow, edit);

    const wrap = h('section', { class: 'm-row', 'data-uid': r.uid }, summary);
    if (isOpen) wrap.append(body);
    return wrap;
  }

  function editor(r: Row) {
    const v = toValues(r.card);
    const form = h('form', { class: 'mt-4 flex flex-col gap-3 m-edit', novalidate: true, hidden: true });
    const inputs: Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = {};
    const errs: Record<string, HTMLElement> = {};
    const field = (key: string, label: string, el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
      inputs[key] = el;
      errs[key] = h('span', { class: 'm-err', hidden: true });
      form.append(h('label', { class: 'm-label' }, label, el, errs[key]));
    };
    const text = (key: keyof CardValues, max?: number) =>
      h('input', { class: 'm-input', type: 'text', name: key, maxlength: max ? String(max) : undefined, value: str(v[key] as string) });

    field('name', 'Name', text('name', MAX.name));
    field('role', 'Role', text('role', MAX.role));
    const g = h('select', { class: 'm-input', name: 'group' });
    for (const [val, label] of groupOptions('pi')) g.append(h('option', { value: val }, label));
    g.value = v.group || 'phd';
    field('group', 'Group (admins may set Principal investigator)', g);
    const alumni = h('input', { type: 'checkbox', name: 'alumni' });
    alumni.checked = v.alumni;
    form.append(h('label', { class: 'm-check' }, alumni, h('span', {}, 'Alumni')));
    const bio = h('textarea', { class: 'm-input', name: 'bio', rows: '4', maxlength: String(MAX.bio) });
    bio.value = v.bio;
    field('bio', 'Bio', bio);
    field('interests', 'Interests (comma-separated)', text('interests', MAX.interests));
    field('email', 'Public email', text('email', MAX.email));
    field('orcid', 'ORCID', text('orcid', MAX.orcid));
    field('scholar', 'Google Scholar id', text('scholar', MAX.scholar));
    field('github', 'GitHub user', text('github', MAX.github));
    field('linkedin', 'LinkedIn id', text('linkedin', MAX.linkedin));
    field('website', 'Website', text('website', MAX.website));
    field('yearJoined', 'Year joined', text('yearJoined', 4));
    field('yearLeft', 'Year left', text('yearLeft', 4));
    field('currentPosition', 'Current position', text('currentPosition', MAX.currentPosition));
    const order = h('input', { class: 'm-input', type: 'text', inputmode: 'numeric', name: 'order', maxlength: '4', value: str(r.card.order) });
    field('order', 'Pinned order (0-9999, empty = not pinned; takes effect at the next publish)', order);
    const hasSlug = typeof r.card.slug === 'string' && r.card.slug !== '';
    if (!hasSlug) {
      field('slug', 'Slug (set once, then fixed; empty = derived from the name at approval)', h('input', { class: 'm-input', type: 'text', name: 'slug', maxlength: '48' }));
    } else {
      form.append(h('p', { class: 'm-small' }, `Slug: ${str(r.card.slug)} (fixed)`));
    }

    const save = h('button', { type: 'submit', class: 'm-btn' }, 'Save changes');
    form.append(save);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const vals: CardValues = {
        ...v,
        alumni: alumni.checked,
        ...Object.fromEntries(
          (['name', 'role', 'group', 'bio', 'interests', 'email', 'orcid', 'scholar', 'github', 'linkedin', 'website', 'yearJoined', 'yearLeft', 'currentPosition'] as const)
            .map((k) => [k, inputs[k].value]),
        ),
      } as CardValues;
      const e: Record<string, string | undefined> = { ...validate(vals, { piAllowed: true }) };
      const o = order.value.trim();
      const orderN = o === '' ? null : /^\d+$/.test(o) ? Number(o) : NaN;
      if (orderN !== null && !(orderN >= 0 && orderN <= 9999)) e.order = 'A whole number from 0 to 9999, or empty.';
      const slug = !hasSlug ? inputs.slug.value.trim() : '';
      if (slug && !isSlug(slug)) e.slug = 'Lowercase letters, digits and single hyphens, at most 48.';
      if (normalizeInterests(vals.interests).length > MAX.interests) e.interests = `At most ${MAX.interests} characters.`;
      for (const k of Object.keys(errs)) {
        errs[k].textContent = e[k] ?? '';
        errs[k].toggleAttribute('hidden', !e[k]);
      }
      if (Object.keys(e).length) return;
      run(() => saveEdit(ctx.db, r.uid, { values: vals, order: orderN as number | null, slug: slug || undefined }, str(r.card.photoRev)));
    });
    return form;
  }

  return { refresh };
}
