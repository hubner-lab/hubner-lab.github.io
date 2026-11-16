import {
  GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut,
  type Auth, type User,
} from 'firebase/auth';
import type { Firestore } from 'firebase/firestore/lite';
import {
  deletePhoto, readCard, readPhoto, readPublished, readSynced, saveCard, savePhoto, takeDown,
  type Published, type StoredCard,
} from './cards';
import { isConfigured } from './config';
import { initBackend } from './firebase';
import { alumniLine, formerRole, initials, LINKS, linkHref, linkName, yearsLabel } from '../lib/team';
import { cardYear, groupOptions, MAX, normalizeInterests, validate, type CardValues } from './limits';
import { createCropper, type Cropper, type PhotoResult } from './photo';
import { mountAdmin } from './admin';
import { isAdminSession } from './adminCards';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const FIELD_KEYS = [
  'name', 'role', 'group', 'bio', 'interests', 'email', 'orcid', 'scholar', 'github', 'linkedin',
  'website', 'yearJoined', 'yearLeft', 'currentPosition',
] as const;

type Panel = 'loading' | 'signin' | 'app';
function show(panel: Panel) {
  $('m-loading')?.toggleAttribute('hidden', panel !== 'loading');
  $('m-signin').toggleAttribute('hidden', panel !== 'signin');
  $('m-app').toggleAttribute('hidden', panel !== 'app');
}

// ---------------------------------------------------------------- errors

function messageFor(e: unknown): string | null {
  const code = (e as { code?: string })?.code ?? '';
  // Firestore Lite reports a request that never reached the server as `unknown`.
  if (code === 'unknown' && /failed to fetch|networkerror|load failed/i.test(String((e as { message?: unknown })?.message ?? ''))) {
    return 'The server could not be reached. Check your connection and try again.';
  }
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null; // the member closed the window: nothing to report
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site, then press the button again.';
    case 'auth/unauthorized-domain':
      return 'This web address is not authorised for sign-in. Open the portal from the lab website\'s own address.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Wrong email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'The server could not be reached. Check your connection and try again.';
    case 'resource-exhausted':
    case 'auth/quota-exceeded':
      return 'The portal\'s daily quota is used up. Try again tomorrow. The public site is not affected.';
    case 'permission-denied':
      return 'The server refused this action (permission denied). Sign out and in again and check every field against its limit; if it keeps happening, ask an admin.';
    default:
      return `Something went wrong${code ? ` (${code})` : ''}. Try again.`;
  }
}

function showError(e: unknown) {
  const box = $('m-error');
  const msg = messageFor(e);
  box.textContent = msg ?? '';
  box.toggleAttribute('hidden', msg === null);
  if (msg === null) return;
  console.error(e);
  // The box is at the top of the page; the button that failed may be far below it. Centred, so
  // the fixed site header does not cover it.
  box.scrollIntoView({ block: 'center' });
}
const clearError = () => $('m-error').setAttribute('hidden', '');

// ---------------------------------------------------------------- form

const form = () => $<HTMLFormElement>('m-form');
const input = (name: string) => form().elements.namedItem(name) as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;

function readForm(): CardValues {
  const v = Object.fromEntries(FIELD_KEYS.map((k) => [k, input(k).value])) as unknown as CardValues;
  v.alumni = input('alumni').checked;
  return v;
}

function writeForm(c: Partial<Record<string, unknown>> | null, fallbackName = '') {
  const s = (k: string) => (c && c[k] !== undefined && c[k] !== null ? String(c[k]) : '');
  for (const k of FIELD_KEYS) input(k).value = s(k);
  if (!c) input('name').value = fallbackName;
  input('alumni').checked = c?.alumni === true;
  // `pi` is offered only to a card that already is one.
  const sel = $<HTMLSelectElement>('m-group');
  const want = s('group');
  sel.innerHTML = '<option value="">Choose…</option>' + groupOptions(want).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  sel.value = want;
  updateCounts();
}

function updateCounts() {
  document.querySelectorAll<HTMLElement>('[data-count-for]').forEach((el) => {
    const k = el.dataset.countFor as keyof typeof MAX;
    el.textContent = `${input(k).value.length} / ${MAX[k]}`;
  });
}

function showErrors(errors: Record<string, string | undefined>) {
  document.querySelectorAll<HTMLElement>('[data-err]').forEach((el) => {
    const msg = errors[el.dataset.err as string];
    el.textContent = msg ?? '';
    el.toggleAttribute('hidden', !msg);
  });
  for (const k of FIELD_KEYS) input(k).setAttribute('aria-invalid', errors[k] ? 'true' : 'false');
}

// ---------------------------------------------------------------- preview (fills the data-f hooks of the real TeamCard)
// The card in #m-preview is the one the Team page draws (src/components/TeamCard.astro, with
// every slot in the markup). What a slot shows comes from src/lib/team.ts, the functions the
// page itself uses, so the preview and the page cannot drift apart.

let previewPhotoHolder: { el: HTMLElement; html: string } | null = null;

function updatePreview() {
  const root = $('m-preview');
  const f = (k: string) => root.querySelector<HTMLElement>(`[data-f="${k}"]`);
  /** Write a slot; an empty slot is hidden. A card that lacks the slot is left alone. */
  const fill = (k: string, value: string) => {
    const el = f(k);
    if (!el) return;
    el.textContent = value;
    el.toggleAttribute('hidden', value === '');
  };

  const v = readForm();
  const name = v.name.trim() || 'Your name';
  const role = v.role.trim() || 'Your role';
  f('name')!.textContent = name;
  f('role')!.textContent = role;
  const bio = f('bio')!;
  bio.textContent = v.bio;
  bio.toggleAttribute('hidden', v.bio === '');

  const chips = f('interests');
  if (chips) {
    const items = normalizeInterests(v.interests).split(', ').filter(Boolean);
    chips.replaceChildren(...items.map((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      return li;
    }));
    chips.toggleAttribute('hidden', items.length === 0);
  }

  let linked = false;
  for (const [key, label] of LINKS) {
    const a = f(key) as HTMLAnchorElement | null;
    if (!a) continue;
    const href = linkHref(key, v[key]);
    a.toggleAttribute('hidden', !href);
    if (href) a.href = href;
    else a.removeAttribute('href');
    a.setAttribute('aria-label', linkName(key, label, name));
    linked ||= !!href;
  }
  f('links')?.toggleAttribute('hidden', !linked);

  // A year the form would refuse (half typed, or wrong) is shown as no year.
  const years = { alumni: v.alumni, yearJoined: cardYear(v.yearJoined), yearLeft: cardYear(v.yearLeft) };
  const position = v.currentPosition.trim();
  fill('years', yearsLabel(years));
  fill('now', v.alumni && position ? `Now: ${position}` : '');

  // The Team page lists a former member as a line of its Alumni list, not as a card: show the line.
  const line = $('m-preview-alumni');
  if (line) {
    line.toggleAttribute('hidden', !v.alumni);
    const set = (k: string, value: string) => {
      const el = line.querySelector<HTMLElement>(`[data-alumni="${k}"]`);
      if (el) el.textContent = value;
    };
    set('name', name);
    set('line', `${formerRole(role)}${alumniLine({ ...years, currentPosition: position })}`);
  }

  const holder = f('photo')!;
  previewPhotoHolder ??= { el: holder, html: holder.innerHTML };
  if (photo.url) {
    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = '';   // the name stands under it
    holder.replaceChildren(img);
  } else {
    holder.innerHTML = previewPhotoHolder.html;
    const initial = f('initial');
    if (initial) initial.textContent = initials(name);
  }
}

// ---------------------------------------------------------------- photo state

type PhotoKind = 'none' | 'stored' | 'new' | 'removed';
const photo: { kind: PhotoKind; rev: string; url: string; fresh: PhotoResult | null } = {
  kind: 'none', rev: '', url: '', fresh: null,
};
let cropper: Cropper;

function setPhoto(kind: PhotoKind, rev = '', url = '', fresh: PhotoResult | null = null) {
  if (photo.url && photo.url !== url) URL.revokeObjectURL(photo.url);
  Object.assign(photo, { kind, rev, url, fresh });
  $('m-removephoto').toggleAttribute('hidden', !url);
  updatePreview();
}

// ---------------------------------------------------------------- state of the signed-in member

let backend: { auth: Auth; db: Firestore } | null = null;
let me: User | null = null;
let stored: StoredCard | null = null;
let published: Published | null = null;
let dirty = false;

function markDirty() {
  dirty = true;
  $('m-result').setAttribute('hidden', '');
}

const SYNC_URL = `${import.meta.env.BASE_URL}members/synced.json`.replace('//', '/');
const HANDWRITTEN_URL = `${import.meta.env.BASE_URL}members/handwritten.json`.replace('//', '/');

async function renderStatus() {
  const box = $('m-status');
  const status = stored?.status;
  let text: string;
  if (!stored) {
    text = 'You have no card yet. Fill in the form, then save a draft or submit it for approval.';
  } else if (status === 'draft') {
    text = 'Draft. Only you can see it. Submit it for approval when it is ready.';
  } else if (status === 'pending') {
    text = 'Waiting for approval. An admin will review it. Submitting again replaces what the admin sees.';
  } else if (status === 'changes_requested') {
    text = `Changes requested: ${stored.adminNote || '(no note)'}`;
  } else {
    const synced = await readSynced(SYNC_URL);
    const live = !!published && !!synced && synced[me!.uid] === published.rev;
    text = live
      ? 'Approved and live. Your card is on the Team page.'
      : 'Approved. Waiting for the site to pick it up; the Team page updates shortly.';
  }
  if (published && status !== 'approved' && stored) {
    text += ' Your live card stays online unchanged until the new version is approved.';
  }
  box.textContent = text;
  $('m-takedown').toggleAttribute('hidden', !published);
}

async function loadMember(user: User) {
  const { db } = backend!;
  me = user;
  $('m-who').textContent = user.email ?? user.displayName ?? user.uid;
  show('loading');
  [stored, published] = await Promise.all([readCard(db, user.uid), readPublished(db, user.uid)]);
  writeForm(stored, user.displayName ?? '');
  setPhoto('none');
  if (stored?.photoRev) {
    const p = await readPhoto(db, user.uid);
    if (p) setPhoto('stored', p.rev, URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: 'image/jpeg' })));
  }
  showErrors({});
  updatePreview();
  dirty = false;
  await renderStatus();
  $('m-notice').toggleAttribute('hidden', !!stored && stored.status === 'approved');
  show('app');
  await setupAdmin(user);
}

// ---------------------------------------------------------------- admin tab

let adminFor: string | null = null;
let adminApi: ReturnType<typeof mountAdmin> | null = null;
/** Input that is not stored yet: in the member's own form, or in a form of the admin tab. */
const unsavedInput = () => dirty || adminApi?.hasUnsaved() === true;

function selectTab(tab: 'card' | 'admin') {
  $('m-member').toggleAttribute('hidden', tab !== 'card');
  $('m-admin').toggleAttribute('hidden', tab !== 'admin');
  $('m-tab-card').setAttribute('aria-selected', String(tab === 'card'));
  $('m-tab-admin').setAttribute('aria-selected', String(tab === 'admin'));
  if (tab === 'admin') void adminApi?.refresh();
}

async function setupAdmin(user: User) {
  if (adminFor === user.uid) return;
  adminFor = null;
  adminApi = null;
  $('m-tabs').setAttribute('hidden', '');
  selectTab('card');
  // A successful getDoc of config/access is how the page learns it faces an admin.
  if (!(await isAdminSession(backend!.db))) return;
  adminFor = user.uid;
  adminApi = mountAdmin($('m-admin'), {
    db: backend!.db, syncedUrl: SYNC_URL, handwrittenUrl: HANDWRITTEN_URL, onError: showError, describe: messageFor,
  });
  $('m-tabs').removeAttribute('hidden');
}

async function save(status: 'draft' | 'pending') {
  if (!backend || !me) return;
  const v = readForm();
  const errors = validate(v, { piAllowed: stored?.group === 'pi' });
  showErrors(errors);
  if (Object.keys(errors).length) {
    const first = FIELD_KEYS.find((k) => errors[k]);
    if (first) input(first).focus();
    return;
  }
  const buttons = ['m-savedraft', 'm-submit'].map((id) => $<HTMLButtonElement>(id));
  buttons.forEach((b) => (b.disabled = true));
  const result = $('m-result');
  try {
    clearError();
    const { db } = backend;
    let rev = photo.kind === 'stored' || photo.kind === 'new' ? photo.rev : '';
    if (photo.kind === 'new' && photo.fresh) {
      await savePhoto(db, me.uid, photo.fresh.bytes, photo.fresh.rev);
    } else if (photo.kind === 'removed' && stored?.photoRev) {
      await deletePhoto(db, me.uid);
    }
    if (photo.kind === 'removed') rev = '';
    await saveCard(db, me, v, rev, status);
    dirty = false;
    stored = await readCard(db, me.uid);
    if (photo.kind === 'new') photo.kind = 'stored';
    if (photo.kind === 'removed') photo.kind = 'none';
    await renderStatus();
    result.textContent = status === 'pending' ? 'Submitted for approval.' : 'Draft saved.';
    result.removeAttribute('hidden');
  } catch (e) {
    showError(e);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

// ---------------------------------------------------------------- wiring

function wire(be: { auth: Auth; db: Firestore }) {
  backend = be;

  // Called straight from the click: anything awaited first would let the browser block the popup.
  $('m-google').addEventListener('click', () => {
    clearError();
    signInWithPopup(be.auth, new GoogleAuthProvider()).catch(showError);
  });

  $<HTMLFormElement>('m-emailform').addEventListener('submit', (ev) => {
    ev.preventDefault();
    clearError();
    const d = new FormData(ev.currentTarget as HTMLFormElement);
    signInWithEmailAndPassword(be.auth, String(d.get('email')), String(d.get('password'))).catch(showError);
  });

  $('m-signout').addEventListener('click', async () => {
    if (unsavedInput() && !confirm('You have unsaved changes. Sign out anyway?')) return;
    dirty = false;
    await signOut(be.auth);
  });

  const f = form();
  f.addEventListener('input', () => {
    markDirty();
    updateCounts();
    updatePreview();
  });
  f.addEventListener('change', () => {
    markDirty();
    updatePreview();
  });
  f.addEventListener('submit', (e) => e.preventDefault());

  $('m-tab-card').addEventListener('click', () => selectTab('card'));
  $('m-tab-admin').addEventListener('click', () => selectTab('admin'));
  $('m-savedraft').addEventListener('click', () => save('draft'));
  $('m-submit').addEventListener('click', () => save('pending'));

  $('m-takedown').addEventListener('click', async () => {
    if (!me) return;
    if (!confirm('Take your live card down from the Team page? The site drops it at its next update. You can submit it again later.')) return;
    try {
      clearError();
      await takeDown(be.db, me);
      published = null;
      stored = await readCard(be.db, me.uid);
      await renderStatus();
    } catch (e) {
      showError(e);
    }
  });

  // Photo
  cropper = createCropper($<HTMLCanvasElement>('m-canvas'), $<HTMLInputElement>('m-zoom'));
  const fileInput = $<HTMLInputElement>('m-file');
  const photoErr = document.querySelector<HTMLElement>('[data-err="photo"]')!;
  const photoMsg = (m: string) => {
    photoErr.textContent = m;
    photoErr.toggleAttribute('hidden', !m);
  };
  fileInput.addEventListener('change', async () => {
    photoMsg('');
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      await cropper.load(file);
      $('m-crop').removeAttribute('hidden');
    } catch {
      photoMsg('That file could not be read as a picture.');
    }
  });
  $('m-usecrop').addEventListener('click', async () => {
    try {
      const r = await cropper.commit();
      setPhoto('new', r.rev, r.url, r);
      markDirty();
      photoMsg('');
      $('m-crop').setAttribute('hidden', '');
      fileInput.value = '';
      cropper.reset();
    } catch (e) {
      photoMsg(e instanceof Error ? e.message : 'The photo could not be processed.');
    }
  });
  $('m-cancelcrop').addEventListener('click', () => {
    $('m-crop').setAttribute('hidden', '');
    fileInput.value = '';
    cropper.reset();
  });
  $('m-removephoto').addEventListener('click', () => {
    setPhoto(stored?.photoRev || photo.kind === 'stored' ? 'removed' : 'none');
    markDirty();
  });

  window.addEventListener('beforeunload', (e) => {
    if (unsavedInput()) e.preventDefault();
  });

  onAuthStateChanged(be.auth, (user) => {
    if (!user) {
      me = null;
      stored = null;
      published = null;
      adminFor = null;
      adminApi = null;
      $('m-tabs').setAttribute('hidden', '');
      show('signin');
      return;
    }
    loadMember(user).catch((e) => {
      showError(e);
      show('app');
    });
  });
}

async function main() {
  if (!isConfigured) return; // the page already says so
  const be = await initBackend();
  if (!be) return;
  wire(be);
  if (import.meta.env.PUBLIC_FIREBASE_EMULATOR === '1') {
    const { wireTestButtons } = await import('./emulator');
    wireTestButtons(be.auth, showError);
  }
}

main().catch((e) => {
  $('m-loading')?.setAttribute('hidden', '');
  showError(e);
});
