// Admin tab: the approval queue of members' cards, then the records the admins keep for people
// without an account. Every string that came from a member or a file goes in through textContent.
import { Timestamp, type Firestore } from 'firebase/firestore/lite';
import {
  approve, cardUpdatedAt, createManaged, loadHandwritten, loadRows, otherSlugs, readPhotoBytes,
  removeAll, requestChanges, saveEdit, StaleCardError, unpublish, type Row,
} from './adminCards';
import { deletePhoto, readSynced, savePhoto } from './cards';
import {
  CONTENT_KEYS, groupOptions, isSlug, MAX, parseYear, slugify, validate, type CardValues,
} from './limits';
import {
  fileNamesInUse, isManagedCard, recordInTheWay, stillHandwritten, valuesFromHandwritten,
  type Handwritten,
} from './managed';
import { createCropper, type PhotoResult } from './photo';

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

function button(label: string, cls: string, fn: () => void) {
  const b = h('button', { type: 'button', class: cls }, label);
  b.addEventListener('click', fn);
  return b;
}

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '(empty)' : String(v));
const ts = (v: unknown) => (v instanceof Timestamp ? v.toDate().toLocaleString() : '');
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

const TEXT_KEYS = [
  'name', 'role', 'group', 'bio', 'interests', 'email', 'orcid', 'scholar', 'github', 'linkedin',
  'website', 'yearJoined', 'yearLeft', 'currentPosition',
] as const;

const EMPTY: CardValues = {
  name: '', role: '', group: '', alumni: false, bio: '', interests: '', email: '', orcid: '', scholar: '',
  github: '', linkedin: '', website: '', yearJoined: '', yearLeft: '', currentPosition: '',
};

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

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** What a form edits. The last three are records for people without an account. */
type FormTarget =
  | { kind: 'member'; row: Row }
  | { kind: 'record'; row: Row; photo: Promise<Uint8Array | null> | null }
  | { kind: 'new' }
  | { kind: 'adopt'; entry: Handwritten };

type PhotoKind = 'none' | 'stored' | 'new' | 'removed';

/**
 * The photo block of a kept record: the square crop members have, on a canvas of its own. `kind`
 * tells the save what to do: write `fresh`, delete the stored photo, or leave it alone.
 */
function photoControl(storedRev: string, stored: Promise<Uint8Array | null> | null, touched: () => void) {
  const state: { kind: PhotoKind; rev: string; fresh: PhotoResult | null } = {
    kind: storedRev ? 'stored' : 'none', rev: storedRev, fresh: null,
  };
  const thumb = h('img', { alt: '', width: '96', height: '96', class: 'm-thumb', hidden: true });
  const note = h('span', { class: 'm-small' }, storedRev ? 'Loading photo…' : 'No photo.');
  const file = h('input', { type: 'file', accept: 'image/*', class: 'm-file', 'aria-label': 'Choose a photo' });
  const canvas = h('canvas', { width: '320', height: '320', class: 'm-canvas', 'aria-label': 'Drag to position the photo' });
  const zoom = h('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1' });
  const err = h('span', { class: 'm-err', hidden: true });
  const cropper = createCropper(canvas, zoom);
  let url = '';

  const say = (m: string) => {
    err.textContent = m;
    err.toggleAttribute('hidden', !m);
  };
  const paint = (kind: PhotoKind, text: string, src = '') => {
    state.kind = kind;
    if (url && url !== src) URL.revokeObjectURL(url);
    url = src;
    if (src) thumb.src = src;
    else thumb.removeAttribute('src');
    thumb.toggleAttribute('hidden', !src);
    note.textContent = text;
    remove.toggleAttribute('hidden', kind !== 'stored' && kind !== 'new');
  };
  const closeCrop = () => {
    crop.setAttribute('hidden', '');
    file.value = '';
    cropper.reset();
  };

  const remove = button('Remove photo', 'm-link', () => {
    state.rev = '';
    state.fresh = null;
    paint(storedRev ? 'removed' : 'none', storedRev ? 'The photo is removed when you save.' : 'No photo.');
    touched();
  });
  remove.toggleAttribute('hidden', !storedRev);

  const crop = h('div', { class: 'mt-3', hidden: true },
    canvas,
    h('label', { class: 'm-label mt-3' }, 'Zoom', zoom),
    h('div', { class: 'flex gap-3 mt-3' },
      button('Use this crop', 'm-btn', async () => {
        try {
          const r = await cropper.commit();
          state.rev = r.rev;
          state.fresh = r;
          paint('new', 'New photo: stored when you save.', r.url);
          closeCrop();
          say('');
          touched();
        } catch (e) {
          say(e instanceof Error ? e.message : 'The photo could not be processed.');
        }
      }),
      button('Cancel', 'm-link', () => {
        closeCrop();
        say('');
      })));

  file.addEventListener('change', async () => {
    say('');
    const f = file.files?.[0];
    if (!f) return;
    try {
      await cropper.load(f);
      crop.removeAttribute('hidden');
    } catch {
      closeCrop();
      say('That file could not be read as a picture.');
    }
  });

  stored?.then((bytes) => {
    if (state.kind !== 'stored') return; // the admin chose or removed a photo meanwhile
    if (bytes) {
      paint('stored', '', URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' })));
    } else {
      state.rev = '';
      paint('removed', 'The stored photo is missing. Saving clears it: choose the photo again to keep one.');
    }
  }).catch(() => {
    if (state.kind === 'stored') note.textContent = 'The photo could not be read.';
  });

  return {
    el: h('fieldset', { class: 'm-photo' },
      h('legend', { class: 'm-label' }, 'Photo'),
      h('div', { class: 'flex items-center gap-4 mb-3' }, thumb, note),
      file,
      crop,
      h('p', { class: 'm-hint mt-2' }, 'Square, 640 px. Drag to move, use the slider to zoom. Location data is removed.'),
      remove,
      err),
    state,
    say,
    /** A picture sits in the crop box and was neither taken nor cancelled. */
    cropping: () => !crop.hasAttribute('hidden'),
  };
}

export interface AdminContext {
  db: Firestore;
  syncedUrl: string;
  handwrittenUrl: string;
  onError: (e: unknown) => void;
  /** The sentence `onError` shows for this error, so a form can repeat it next to its buttons. */
  describe: (e: unknown) => string | null;
}

interface RunOptions {
  /** The action is on a kept record: the known failures are worded for one. */
  kept?: boolean;
  /** The form that started the action; what the other open forms hold would be lost by a reload. */
  form?: HTMLFormElement;
  /** True while nothing was stored and the form still holds what the admin typed: no reload then. */
  keepForm?: () => boolean;
  /** Shows a failure next to the form's buttons when the form stays. */
  say?: (message: string) => void;
}

export function mountAdmin(root: HTMLElement, ctx: AdminContext) {
  const open = new Set<string>();
  /** Forms that hold input which is not stored. A reload of the list would throw it away. */
  const unsaved = new Set<HTMLFormElement>();
  let rows: Row[] = [];
  let synced: Record<string, string> | null = null;
  let handwritten: Handwritten[] | null = null;
  let busy = false;
  /** One line on the row an action just changed. */
  let flash: { uid: string; text: string } | null = null;

  async function refresh() {
    try {
      [rows, synced, handwritten] = await Promise.all([
        loadRows(ctx.db), readSynced(ctx.syncedUrl), loadHandwritten(ctx.handwrittenUrl),
      ]);
      render();
    } catch (e) {
      ctx.onError(e);
    }
  }

  /** The failures the page can name. Null: an unexpected one, reported through `ctx.onError`. */
  function explain(e: unknown, kept: boolean): string | null {
    if (e instanceof StaleCardError) {
      return kept
        ? 'This record changed after you opened it. The list was reloaded: check it, then publish again.'
        : 'This card changed after you opened it. The list was reloaded: review it again before approving.';
    }
    switch (e instanceof Error ? e.message : '') {
      case 'photo-mismatch':
        return kept
          ? 'The stored photo does not match the record. Open "Edit", choose the photo again and save.'
          : 'The working photo does not match the card\'s photo. Ask the member to save the card again.';
      case 'slug-taken':
        return kept
          ? 'A member\'s card is already published under this file name, so this record cannot be published. If it is the same person, delete the record.'
          : 'Another published card already uses this slug. Edit the card and choose a different slug first.';
      case 'note-required':
        return 'Write a note for the member first.';
      case 'record-exists':
        return 'A record with this file name exists already. Use that record, or choose another file name under "More details".';
      case 'bad-replace':
        return 'The record to replace is no longer one the admins keep. The list was reloaded: review the card again.';
      default:
        return null;
    }
  }

  async function run(action: () => Promise<void>, o: RunOptions = {}) {
    if (busy) return;
    const others = [...unsaved].filter((f) => f !== o.form);
    if (others.length > 0 && !confirm('Another form on this page holds changes that are not saved. This action reloads the list and discards them. Continue?')) return;
    busy = true;
    flash = null;
    root.setAttribute('aria-busy', 'true');
    let reload = true;
    try {
      await action();
    } catch (e) {
      const known = explain(e, o.kept === true);
      const stays = !(e instanceof StaleCardError) && o.keepForm?.() === true;
      reload = !stays;
      if (known === null) ctx.onError(e);
      if (stays) o.say?.(known ?? ctx.describe(e) ?? 'Something went wrong. Try again.');
      else if (known !== null) alert(known);
    } finally {
      busy = false;
      root.removeAttribute('aria-busy');
      if (reload) await refresh();
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
        'Approved cards and published records reach the Team page when the site next updates. ',
        h('a', { class: 'm-link', href: SYNC_WORKFLOW, target: '_blank', rel: 'noopener noreferrer' }, 'Publish now'),
        ' opens the update job on GitHub; press "Run workflow" there.'),
      late.length > 0 && h('div', { class: 'm-note m-error mt-4', role: 'alert' },
        h('strong', {}, `${late.length} approved ${late.length > 1 ? 'cards or records have' : 'card or record has'} waited more than 90 minutes for the site.`),
        h('span', {}, 'The update job may have failed. Open it with "Publish now" and check the last run.')),
    );
  }

  function group(title: string, intro: string, ...kids: Array<Node | null | false>) {
    return h('section', { class: 'm-group' },
      h('h2', { class: 'm-grouphead' }, title),
      intro && h('p', { class: 'm-small' }, intro),
      ...kids);
  }

  function render() {
    unsaved.clear();
    const members = rows.filter((r) => !isManagedCard(r.card));
    // The queue keeps its order (pending first, then the latest change); the records are a list
    // of people, found by name.
    const kept = rows.filter((r) => isManagedCard(r.card))
      .sort((a, b) => str(a.card.name).localeCompare(str(b.card.name)));
    root.replaceChildren(
      head(),
      group('Members\' cards', '',
        members.length === 0 && h('p', { class: 'm-small' }, 'No cards yet.'),
        ...members.map(rowEl)),
      group('People without an account',
        'Records the admins keep for people who do not sign in, alumni first. Publish a record only with the person\'s consent: it becomes public and stays in the site\'s public history.',
        kept.length === 0 && h('p', { class: 'm-small' }, 'No records yet. Adopt an entry below, or add a person.'),
        ...kept.map(rowEl),
        addPerson(),
        handwrittenList()),
    );
    if (flash) root.querySelector(`[data-uid="${CSS.escape(flash.uid)}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function rowEl(r: Row) {
    const c = r.card;
    const kept = isManagedCard(c);
    const status = str(c.status);
    const changes = changesAgainstLive(c, r.published);
    // A kept record is never submitted or approved by someone else: its badge says where it stands.
    const [badgeClass, badge] = !kept ? [`m-${status}`, status.replace('_', ' ')]
      : !r.published ? ['m-draft', 'not published']
      : changes.length > 0 ? ['m-pending', 'changes not published']
      : ['m-approved', 'published'];

    const summary = h('button', { type: 'button', class: 'm-rowhead', 'aria-expanded': 'false' },
      h('span', { class: 'm-rowname' }, show(c.name), ' ', h('span', { class: 'm-req' }, show(c.role))),
      h('span', { class: `m-badge ${badgeClass}` }, badge),
    );
    const wrap = h('section', { class: 'm-row', 'data-uid': r.uid }, summary);
    if (flash?.uid === r.uid) wrap.append(h('p', { class: 'm-flash', role: 'status' }, flash.text));

    // Opening a row builds its body once and never redraws the list: a form that is open elsewhere
    // keeps what the admin typed.
    let body: HTMLElement | null = null;
    const setOpen = (on: boolean) => {
      summary.setAttribute('aria-expanded', String(on));
      if (on) {
        open.add(r.uid);
        wrap.append((body ??= rowBody(r, changes)));
      } else {
        open.delete(r.uid);
        body?.remove();
      }
    };
    summary.addEventListener('click', () => setOpen(!open.has(r.uid)));
    if (open.has(r.uid)) setOpen(true);
    return wrap;
  }

  function rowBody(r: Row, changes: Array<[string, string, string]>) {
    const c = r.card;
    const kept = isManagedCard(c);
    const status = str(c.status);
    const name = show(c.name);
    const verified = c.emailVerified === true;
    const changed = c.updatedAt ? ` · changed ${ts(c.updatedAt)}` : '';
    const live = r.published
      ? ` · live as "${str(r.published.slug)}"${waiting(r) ? ' (waiting for the site)' : ''}`
      : ' · not published';

    const meta = kept
      ? h('p', { class: 'm-small' }, 'No account: kept by the admins', changed, live)
      : h('p', { class: 'm-small' },
          `Account ${show(c.accountEmail)} via ${show(c.provider)} · `,
          h('span', { class: verified ? '' : 'm-err' }, verified ? 'verified' : 'NOT verified'),
          changed, live);

    const diff = h('div', { class: 'mt-2' },
      h('p', { class: 'caption mb-1' }, r.published
        ? (kept ? 'Changes against the published record' : 'Changes against the live card')
        : (kept ? 'New record, nothing published yet' : 'New card, nothing published yet')),
    );
    if (changes.length === 0) diff.append(h('p', { class: 'm-small' }, r.published ? 'No changes.' : 'Nothing filled in.'));
    else {
      const ul = h('ul', { class: 'm-diff' });
      for (const [k, a, b] of changes) {
        if (k === 'photoRev') {
          const what = !r.published || a === '(empty)' ? 'added' : b === '(empty)' ? 'removed' : 'changed';
          ul.append(h('li', {}, h('strong', {}, `${LABELS[k]}: `), what));
          continue;
        }
        ul.append(h('li', {}, h('strong', {}, `${LABELS[k] ?? k}: `),
          r.published ? h('span', { class: 'm-old' }, a) : null, r.published ? ' → ' : null, h('span', { class: 'm-new' }, b)));
      }
      diff.append(ul);
    }

    const body = h('div', { class: 'm-rowbody' }, meta, diff);

    // The person signed in after an admin started a record for them: this card takes its place.
    // A draft cannot be approved yet, so there is nothing to announce for it.
    const wanted = str(c.slug) || slugify(str(c.name)) || 'member';
    const inTheWay = status === 'draft' ? null : recordInTheWay(r, wanted, rows);
    if (inTheWay) {
      body.append(h('p', { class: 'm-small mt-3' },
        `A record is kept for ${show(inTheWay.card.name)} under the file name this card gets ("${wanted}"). Approving asks whether this card replaces it.`));
    }

    // Photo
    const photoBytes = c.photoRev ? readPhotoBytes(ctx.db, r.uid) : null;
    const photoBox = h('div', { class: 'mt-3' });
    if (photoBytes) {
      const holder = h('span', { class: 'm-small' }, 'Loading photo…');
      photoBox.append(holder);
      photoBytes.then((bytes) => {
        if (!bytes) { holder.textContent = 'Photo missing.'; return; }
        const img = h('img', { alt: '', width: '96', height: '96', class: 'm-thumb' });
        img.src = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
        holder.replaceWith(img);
      }).catch(() => (holder.textContent = 'Photo could not be read.'));
    }
    body.append(photoBox);

    // Actions
    const note = h('textarea', { class: 'm-input', rows: '3', maxlength: '500', placeholder: 'What should the member change?', hidden: true });
    const noteRow = h('div', { class: 'mt-3 flex flex-col gap-2', hidden: true }, note,
      button('Send request', 'm-btn', () => void run(() => requestChanges(ctx.db, r.uid, note.value))));

    // "Cancel" in the form of a kept record puts a fresh, closed form in its place.
    const target: FormTarget = kept ? { kind: 'record', row: r, photo: photoBytes } : { kind: 'member', row: r };
    const makeEdit = (): HTMLFormElement => {
      const f = cardForm(target, () => {
        const fresh = makeEdit();
        edit.replaceWith(fresh);
        edit = fresh;
      });
      f.setAttribute('hidden', '');
      return f;
    };
    let edit = makeEdit();

    const publish = () => {
      const seen = c.updatedAt;
      if (!(seen instanceof Timestamp)) return;
      if (!inTheWay) {
        void run(async () => {
          await approve(ctx.db, r.uid, seen, otherSlugs(rows, r.uid));
          if (kept) flash = { uid: r.uid, text: 'Published. The Team page shows it after the next site update.' };
        }, { kept });
        return;
      }
      const keptName = show(inTheWay.card.name);
      const yes = confirm(
        `Replace the record kept for ${keptName} with this member's own card?\n\n`
        + 'OK: the record is deleted and this card takes its place on the Team page.\n'
        + 'Cancel: nothing is approved. If this is another person with the same name, open "Edit" and give this card a different slug first.',
      );
      if (!yes) return;
      const others = rows.filter((x) => x.uid !== inTheWay.uid);
      void run(async () => {
        await approve(ctx.db, r.uid, seen, otherSlugs(others, r.uid), { replace: inTheWay.uid, slug: wanted });
        flash = { uid: r.uid, text: `Approved. This card replaced the record kept for ${keptName}.` };
      });
    };

    // A member's card can be approved once it is submitted. A kept record is published by the admin,
    // and the button is there only while it has something to publish.
    const publishLabel = !kept ? (status === 'draft' ? '' : status === 'approved' ? 'Re-publish' : 'Approve')
      : !r.published ? 'Publish'
      : changes.length > 0 ? 'Publish changes' : '';
    const actions = h('div', { class: 'flex flex-wrap gap-3 mt-4' },
      publishLabel !== '' && button(publishLabel, 'm-btn m-btn-primary', publish),
      !kept && status !== 'draft' && status !== 'changes_requested' && button('Request changes', 'm-btn', () => {
        noteRow.toggleAttribute('hidden');
        note.toggleAttribute('hidden');
        note.focus();
      }),
      button('Edit', 'm-btn', () => edit.toggleAttribute('hidden')),
      r.published && button('Unpublish', 'm-btn', () => {
        const q = kept
          ? `Take ${name} off the Team page? The record stays here, not published.`
          : `Take ${name} off the Team page? The card goes back to draft.`;
        if (confirm(q)) void run(() => unpublish(ctx.db, r.uid), { kept });
      }),
      button(kept ? 'Delete record' : 'Reject and delete', 'm-link', () => {
        const q = !kept
          ? `Delete the card of ${name}${r.published ? ', including the live copy' : ''}? This cannot be undone.`
          : `Delete the record kept for ${name}? ${r.published
            ? 'The person leaves the Team page at the next site update, and a hand-written entry this record replaced does not come back.'
            : 'It is not published, so the Team page does not change.'} This cannot be undone.`;
        if (confirm(q)) void run(() => removeAll(ctx.db, r.uid), { kept });
      }),
    );
    if (!kept && status === 'draft') body.append(h('p', { class: 'm-small mt-3' }, 'A draft is not submitted: nothing to approve yet.'));
    body.append(actions, noteRow, edit);
    return body;
  }

  /**
   * One form for a member's card, a kept record, a new record and a hand-written entry being
   * adopted. A member's card keeps the fields and the single button it always had. The other three
   * put what an alumni record needs first, fold the rest away, and add the photo and "Save and publish".
   */
  function cardForm(t: FormTarget, onCancel?: () => void): HTMLFormElement {
    const kept = t.kind !== 'member';
    const row = t.kind === 'member' || t.kind === 'record' ? t.row : null;
    const v = row ? toValues(row.card) : t.kind === 'adopt' ? valuesFromHandwritten(t.entry) : EMPTY;
    const order0 = row ? str(row.card.order)
      : t.kind === 'adopt' && typeof t.entry.order === 'number' ? String(t.entry.order) : '';
    const fixedSlug = row ? str(row.card.slug) : t.kind === 'adopt' ? t.entry.slug : '';

    const form = h('form', { class: 'mt-4 flex flex-col gap-3 m-edit', novalidate: true });
    const touched = () => unsaved.add(form);
    form.addEventListener('input', touched);
    form.addEventListener('change', touched);

    const inputs: Record<string, Control> = {};
    const errs: Record<string, HTMLElement> = {};
    const field = (parent: HTMLElement, key: string, label: string, el: Control, hint = '') => {
      inputs[key] = el;
      errs[key] = h('span', { class: 'm-err', hidden: true });
      const box = h('label', { class: 'm-label' }, label, el, hint && h('span', { class: 'm-hint' }, hint), errs[key]);
      parent.append(box);
      return box;
    };
    const text = (key: keyof CardValues, max?: number, numeric = false) =>
      h('input', {
        class: 'm-input', type: 'text', name: key, maxlength: max ? String(max) : undefined,
        inputmode: numeric ? 'numeric' : undefined, autocomplete: 'off', value: str(v[key] as string),
      });

    const group = h('select', { class: 'm-input', name: 'group' });
    if (kept) group.append(h('option', { value: '' }, 'Choose…'));
    for (const [val, label] of groupOptions('pi')) group.append(h('option', { value: val }, label));
    group.value = kept ? v.group : v.group || 'phd';
    const alumni = h('input', { type: 'checkbox', name: 'alumni' });
    alumni.checked = v.alumni;
    const bio = h('textarea', { class: 'm-input', name: 'bio', rows: '4', maxlength: String(MAX.bio) });
    bio.value = v.bio;
    const order = h('input', { class: 'm-input', type: 'text', inputmode: 'numeric', name: 'order', maxlength: '4', autocomplete: 'off', value: order0 });
    const links = (parent: HTMLElement, hints: boolean) => {
      field(parent, 'email', 'Public email', text('email', MAX.email), hints ? 'Shown on the site. Leave empty to show none.' : '');
      field(parent, 'orcid', 'ORCID', text('orcid', MAX.orcid), hints ? 'In the form 0000-0001-2345-6789.' : '');
      field(parent, 'scholar', 'Google Scholar id', text('scholar', MAX.scholar), hints ? 'The id after "user=" in the profile link.' : '');
      field(parent, 'github', 'GitHub user', text('github', MAX.github));
      field(parent, 'linkedin', 'LinkedIn id', text('linkedin', MAX.linkedin), hints ? 'The part after "/in/".' : '');
      field(parent, 'website', 'Website', text('website', MAX.website), hints ? 'Starts with https://.' : '');
    };

    let photo: ReturnType<typeof photoControl> | null = null;
    let more: HTMLDetailsElement | null = null;

    if (!kept) {
      field(form, 'name', 'Name', text('name', MAX.name));
      field(form, 'role', 'Role', text('role', MAX.role));
      field(form, 'group', 'Group (admins may set Principal investigator)', group);
      form.append(h('label', { class: 'm-check' }, alumni, h('span', {}, 'Alumni')));
      field(form, 'bio', 'Bio', bio);
      field(form, 'interests', 'Interests (comma-separated)', text('interests', MAX.interests));
      links(form, false);
      field(form, 'yearJoined', 'Year joined', text('yearJoined', 4));
      field(form, 'yearLeft', 'Year left', text('yearLeft', 4));
      field(form, 'currentPosition', 'Current position', text('currentPosition', MAX.currentPosition));
      field(form, 'order', 'Pinned order (0-9999, empty = not pinned; takes effect at the next publish)', order);
      if (fixedSlug) form.append(h('p', { class: 'm-small' }, `Slug: ${fixedSlug} (fixed)`));
      else field(form, 'slug', 'Slug (set once, then fixed; empty = derived from the name at approval)', h('input', { class: 'm-input', type: 'text', name: 'slug', maxlength: '48' }));
    } else {
      const nameBox = field(form, 'name', 'Name', text('name', MAX.name));
      field(form, 'role', 'Role', text('role', MAX.role), 'As it reads on the Team page, for example "PhD Student" or "MSc (Alumni)".');
      field(form, 'group', 'Group', group,
        (t.kind === 'adopt' && !v.group ? `The hand-written entry says "${t.entry.group}", which the portal does not offer: choose the level. ` : '')
        + 'For someone who has left: the level they had in the lab.');
      form.append(h('div', { class: 'flex flex-col gap-1' },
        h('label', { class: 'm-check' }, alumni, h('span', {}, 'Left the lab (listed under Alumni)')),
        h('span', { class: 'm-hint' }, 'The Alumni list shows the name, the role, the years and the current position.')));
      const years = h('div', { class: 'grid grid-cols-2 gap-4' });
      field(years, 'yearJoined', 'Year joined', text('yearJoined', 4, true));
      field(years, 'yearLeft', 'Year left', text('yearLeft', 4, true));
      form.append(years);
      field(form, 'currentPosition', 'Current position', text('currentPosition', MAX.currentPosition),
        'Where the person is now, for example "Postdoc, Example University".');
      photo = photoControl(row ? str(row.card.photoRev) : '', t.kind === 'record' ? t.photo : null, touched);
      form.append(photo.el);
      if (t.kind === 'adopt' && t.entry.hasPhoto) {
        form.append(h('span', { class: 'm-hint' }, 'The photo of the hand-written entry is not carried over: choose it again here.'));
      }

      const inner = h('div', { class: 'flex flex-col gap-3 mt-3' });
      field(inner, 'bio', 'Bio', bio, 'One to three sentences, shown on the card of a current member.');
      field(inner, 'interests', 'Interests (comma-separated)', text('interests', MAX.interests));
      links(inner, true);
      field(inner, 'order', 'Pinned order', order, 'A whole number from 0 to 9999, or empty. Pinned people come first inside their group.');
      const filled = [v.bio, v.interests, v.email, v.orcid, v.scholar, v.github, v.linkedin, v.website, order0].filter(Boolean).length;
      more = h('details', { class: 'm-more' },
        h('summary', {},
          `More details: bio, interests, links, pinned order${t.kind === 'new' ? ', file name' : ''}`,
          filled > 0 && h('span', { class: 'm-req' }, ` · ${filled} filled`)),
        inner);
      form.append(more);

      if (t.kind === 'new') {
        // The file name follows the name until the admin types one; it is fixed by the first save.
        const slugIn = h('input', { class: 'm-input', type: 'text', name: 'slug', maxlength: '48', autocomplete: 'off', spellcheck: 'false' });
        field(inner, 'slug', 'File name on the site', slugIn, 'Derived from the name: lowercase letters, digits and hyphens. Fixed after the first save.');
        const fileLine = h('span', { class: 'm-hint' });
        nameBox.insertBefore(fileLine, errs.name);
        let typed = false;
        const inUse = fileNamesInUse(rows);
        const byHand = stillHandwritten(handwritten ?? [], rows);
        const derive = () => {
          if (!typed) slugIn.value = slugify(inputs.name.value);
          const s = slugIn.value.trim();
          const entry = byHand.find((e) => e.slug === s);
          fileLine.textContent = !s ? '' : `File name on the site: ${s}.`
            + (inUse.has(s) ? ' A card or a record has this file name already: choose another under "More details".'
              : entry ? ` The hand-written entry of ${entry.name} has this file name: publishing this record replaces that entry.`
              : '');
        };
        inputs.name.addEventListener('input', derive);
        slugIn.addEventListener('input', () => {
          typed = true;
          derive();
        });
        slugIn.addEventListener('blur', () => {
          if (slugIn.value.trim() !== '') return;
          typed = false;
          derive();
        });
      } else {
        form.append(h('p', { class: 'm-small' },
          `File name on the site: ${fixedSlug} (fixed).`,
          t.kind === 'adopt' && ' Once published, this record replaces the hand-written entry; until then the Team page keeps showing that entry.'));
      }
    }

    const save = h('button', { type: 'submit', class: 'm-btn' }, kept ? 'Save' : 'Save changes');
    const publish = kept ? h('button', { type: 'submit', class: 'm-btn m-btn-primary' }, 'Save and publish') : null;
    const working = h('p', { class: 'm-small', role: 'status', hidden: true }, 'Saving…');
    const failed = h('p', { class: 'm-err', role: 'alert', hidden: true });
    if (kept) {
      form.append(
        h('p', { class: 'm-small' }, '"Save" keeps the record here and leaves the Team page as it is. "Save and publish" also sends it to the Team page at the next site update.'),
        h('div', { class: 'flex flex-wrap items-center gap-3' }, save, publish, onCancel !== undefined && button('Cancel', 'm-link', () => {
          if (unsaved.has(form) && !confirm('Discard what you typed in this form?')) return;
          unsaved.delete(form);
          onCancel();
        })),
        working, failed);
    } else {
      form.append(save, failed);
    }

    const read = (): CardValues => ({
      ...v,
      alumni: alumni.checked,
      // A kept record is typed by the admin: stray spaces around a one-line value are dropped.
      ...Object.fromEntries(TEXT_KEYS.map((k) => [k, kept && k !== 'bio' ? inputs[k].value.trim() : inputs[k].value])),
    } as CardValues);

    const check = (vals: CardValues) => {
      const errors: Record<string, string | undefined> = { ...validate(vals, { piAllowed: true }) };
      const o = order.value.trim();
      const orderN = o === '' ? null : /^\d+$/.test(o) ? Number(o) : NaN;
      if (orderN !== null && !(orderN >= 0 && orderN <= 9999)) errors.order = 'A whole number from 0 to 9999, or empty.';
      let slug = t.kind === 'adopt' ? fixedSlug : '';
      if (t.kind === 'new') {
        slug = inputs.slug.value.trim();
        if (!slug) errors.slug = 'Type a file name: the name has no Latin letters or digits to derive one from.';
        else if (!isSlug(slug)) errors.slug = 'Lowercase letters, digits and single hyphens, at most 48.';
        else if (fileNamesInUse(rows).has(slug)) errors.slug = 'A card or a record with this file name exists already.';
      } else if (t.kind === 'member' && !fixedSlug) {
        slug = inputs.slug.value.trim();
        if (slug && !isSlug(slug)) errors.slug = 'Lowercase letters, digits and single hyphens, at most 48.';
      }
      if (kept) {
        const from = parseYear(vals.yearJoined);
        const to = parseYear(vals.yearLeft);
        if (!errors.yearJoined && !errors.yearLeft && from !== null && to !== null && to < from) {
          errors.yearLeft = 'The year left is before the year joined.';
        }
        if (photo?.cropping()) errors.photo = 'Press "Use this crop" to take the picture, or "Cancel".';
      }
      return { errors, orderN: orderN as number | null, slug };
    };

    const paint = (errors: Record<string, string | undefined>) => {
      for (const k of Object.keys(errs)) {
        errs[k].textContent = errors[k] ?? '';
        errs[k].toggleAttribute('hidden', !errors[k]);
        inputs[k].setAttribute('aria-invalid', errors[k] ? 'true' : 'false');
      }
      photo?.say(errors.photo ?? '');
      const first = Object.keys(inputs).find((k) => errors[k]);
      if (first) {
        if (more?.contains(inputs[first])) more.open = true;
        inputs[first].focus();
      } else if (errors.photo) {
        photo?.el.scrollIntoView({ block: 'nearest' });
      }
    };

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const andPublish = publish !== null && (ev as SubmitEvent).submitter === publish;
      const vals = read();
      const { errors, orderN, slug } = check(vals);
      paint(errors);
      if (Object.keys(errors).length) return;

      const buttons = [save, publish].filter((b): b is HTMLButtonElement => b !== null);
      const showBusy = (on: boolean) => {
        buttons.forEach((b) => (b.disabled = on));
        working.toggleAttribute('hidden', !on);
      };
      failed.setAttribute('hidden', '');
      showBusy(true);
      // True once the card itself is written. From then on the list is the truth, so it is reloaded
      // even when a later step fails; before that the form stays, with what the admin typed.
      let stored = false;
      void run(async () => {
        let uid: string;
        if (row) {
          uid = row.uid;
          let rev = str(row.card.photoRev);
          if (photo) {
            const p = photo.state;
            if (p.kind === 'new' && p.fresh) await savePhoto(ctx.db, uid, p.fresh.bytes, p.fresh.rev);
            rev = p.kind === 'stored' || p.kind === 'new' ? p.rev : '';
          }
          await saveEdit(ctx.db, uid, { values: vals, order: orderN, slug: slug || undefined }, rev);
          stored = true;
          if (photo?.state.kind === 'removed') await deletePhoto(ctx.db, uid);
        } else {
          uid = await createManaged(ctx.db, slug, vals, orderN);
          stored = true;
          const fresh = photo?.state.kind === 'new' ? photo.state.fresh : null;
          if (fresh) {
            await savePhoto(ctx.db, uid, fresh.bytes, fresh.rev);
            await saveEdit(ctx.db, uid, { values: vals, order: orderN }, fresh.rev);
          }
        }
        unsaved.delete(form);
        if (andPublish) {
          const seen = await cardUpdatedAt(ctx.db, uid);
          if (!seen) throw new StaleCardError();
          await approve(ctx.db, uid, seen, otherSlugs(rows, uid));
        }
        flash = {
          uid,
          text: !kept ? 'Saved.'
            : andPublish ? 'Saved and published. The Team page shows it after the next site update.'
            : row?.published ? 'Saved. The Team page keeps the published version until you publish again.'
            : t.kind === 'adopt' ? 'Saved, not published: the Team page keeps the hand-written entry until you publish.'
            : 'Saved, not published: the Team page does not show this record yet.',
        };
      }, {
        kept,
        form,
        keepForm: () => !stored,
        say: (m) => {
          failed.textContent = m;
          failed.removeAttribute('hidden');
        },
      }).finally(() => showBusy(false));
    });
    return form;
  }

  function addPerson() {
    const box = h('div', { class: 'm-add' });
    const add = button('Add a person', 'm-btn', () => {
      const form = cardForm({ kind: 'new' }, () => {
        card.remove();
        add.removeAttribute('hidden');
      });
      const card = h('section', { class: 'm-row' },
        h('div', { class: 'm-rowbody' }, h('p', { class: 'm-rowname m-formtitle' }, 'New record'), form));
      add.setAttribute('hidden', '');
      box.append(card);
      (form.elements.namedItem('name') as HTMLInputElement).focus();
    });
    box.append(add);
    return box;
  }

  function handwrittenList() {
    const box = h('div', { class: 'm-hw' }, h('h3', { class: 'm-subhead' }, 'Entries still written by hand'));
    if (handwritten === null) {
      box.append(h('p', { class: 'm-small' }, 'The list of hand-written entries could not be read. Reload the page to try again.'));
      return box;
    }
    const left = stillHandwritten(handwritten, rows);
    if (left.length === 0) {
      box.append(h('p', { class: 'm-small' }, 'No entry on the Team page is written by hand any more.'));
      return box;
    }
    box.append(h('p', { class: 'm-small' },
      'These people are on the Team page from a file in the repository. "Adopt" opens the entry as a record, filled in; once published, the record replaces the file.'));
    for (const e of left) box.append(entryEl(e));
    return box;
  }

  function entryEl(e: Handwritten) {
    const wrap = h('section', { class: 'm-row', 'data-slug': e.slug });
    const adopt = button('Adopt', 'm-btn', () => {
      const form = cardForm({ kind: 'adopt', entry: e }, () => {
        body.remove();
        adopt.removeAttribute('hidden');
      });
      const body = h('div', { class: 'm-rowbody' }, form);
      adopt.setAttribute('hidden', '');
      wrap.append(body);
      // The first thing to decide: a group the portal does not offer, else the name.
      const group = form.elements.namedItem('group') as HTMLSelectElement;
      (group.value === '' ? group : (form.elements.namedItem('name') as HTMLInputElement)).focus();
    });
    wrap.append(h('div', { class: 'm-rowhead m-hwhead' },
      h('span', { class: 'm-rowname' }, e.name, ' ', h('span', { class: 'm-req' }, e.role)),
      h('span', { class: 'flex items-center gap-3' }, e.alumni && h('span', { class: 'm-badge' }, 'alumni'), adopt)));
    return wrap;
  }

  return {
    /** Reloads the list, unless a form holds input that is not stored: a reload would discard it. */
    refresh: () => (unsaved.size > 0 ? Promise.resolve() : refresh()),
    hasUnsaved: () => unsaved.size > 0,
  };
}
