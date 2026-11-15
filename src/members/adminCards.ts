// Admin-side Firestore operations. The rules decide who may call them (config/access); the page only
// offers them after a successful read of config/access.
import {
  Bytes, Timestamp, collection, deleteField, doc, getDoc, getDocs, runTransaction,
  serverTimestamp, setDoc, writeBatch, type Firestore,
} from 'firebase/firestore/lite';
import { contentFields } from './cards';
import { CONTENT_KEYS, isSlug, uniqueSlug, type CardValues } from './limits';
import {
  isManagedCard, isManagedId, managedId, MANAGED_PROVIDER, parseHandwritten, type Handwritten,
} from './managed';
import { revOf } from './photo';

export type Doc = Record<string, unknown>;

export interface Row {
  uid: string;
  card: Doc;
  published: Doc | null;
}

export class StaleCardError extends Error {
  constructor() {
    super('card-changed');
    this.name = 'StaleCardError';
  }
}

/** Every card, with its published copy. Pending first, then the most recently changed. */
export async function loadRows(db: Firestore): Promise<Row[]> {
  const [cards, pubs] = await Promise.all([getDocs(collection(db, 'cards')), getDocs(collection(db, 'published'))]);
  const published = new Map(pubs.docs.map((d) => [d.id, d.data() as Doc]));
  const ms = (c: Doc) => (c.updatedAt instanceof Timestamp ? c.updatedAt.toMillis() : 0);
  return cards.docs
    .map((d) => ({ uid: d.id, card: d.data() as Doc, published: published.get(d.id) ?? null }))
    .sort((a, b) => {
      const pa = a.card.status === 'pending' ? 0 : 1;
      const pb = b.card.status === 'pending' ? 0 : 1;
      return pa - pb || ms(b.card) - ms(a.card);
    });
}

/** `getDoc` of config/access succeeds only for an admin: that success is how the page learns it. */
export async function isAdminSession(db: Firestore): Promise<boolean> {
  try {
    await getDoc(doc(db, 'config/access'));
    return true;
  } catch {
    return false;
  }
}

/** Sorted keys, no whitespace, raw UTF-8: the same text whatever order the keys were built in. */
export function canonicalJson(o: Doc): string {
  return JSON.stringify(Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]])));
}

export async function contentRev(content: Doc): Promise<string> {
  return revOf(new TextEncoder().encode(canonicalJson(content)));
}

/** Slugs of every published card except `uid`'s own. */
export function otherSlugs(rows: Row[], uid: string): Set<string> {
  return new Set(rows.filter((r) => r.uid !== uid && typeof r.published?.slug === 'string').map((r) => r.published!.slug as string));
}

export interface ApproveOptions {
  /**
   * A record kept for a person without an account (`rec-<slug>`) that this member's own card
   * replaces. Its four documents are deleted in the same transaction, so the person is never
   * listed twice and never missing in between.
   */
  replace?: string;
  /** The slug to publish under when the card has none yet: the replaced record's. */
  slug?: string;
}

/**
 * Approve in one transaction: re-read the card and abort when it changed since the admin looked,
 * write the published copy (exactly the published keys), its photo, and mark the card approved.
 * The slug is derived from the name at first approval and never changed afterwards.
 */
export async function approve(
  db: Firestore, uid: string, seen: Timestamp, taken: ReadonlySet<string>, opts: ApproveOptions = {},
) {
  await runTransaction(db, async (tx) => {
    const cardRef = doc(db, `cards/${uid}`);
    const pubRef = doc(db, `published/${uid}`);
    const cardSnap = await tx.get(cardRef);
    if (!cardSnap.exists()) throw new StaleCardError();
    const card = cardSnap.data() as Doc;
    if (!(card.updatedAt instanceof Timestamp) || !card.updatedAt.isEqual(seen)) throw new StaleCardError();
    const pubSnap = await tx.get(pubRef);
    if (opts.replace) {
      // Only a record the admins keep may be replaced, never another member's card.
      if (!isManagedId(opts.replace) || opts.replace === uid) throw new Error('bad-replace');
      const old = await tx.get(doc(db, `cards/${opts.replace}`));
      if (old.exists() && !isManagedCard(old.data() as Doc)) throw new Error('bad-replace');
    }

    const existing = (card.slug as string | undefined) || (pubSnap.exists() ? (pubSnap.data().slug as string) : '');
    const slug = existing || opts.slug || uniqueSlug(String(card.name), taken);
    if (!isSlug(slug)) throw new Error('bad-slug');
    if (taken.has(slug)) throw new Error('slug-taken');

    const content: Doc = {};
    for (const k of CONTENT_KEYS) {
      if (!(k in card)) throw new Error(`missing-${k}`);
      content[k] = card[k];
    }

    if (content.photoRev) {
      const photoSnap = await tx.get(doc(db, `photos/${uid}`));
      const p = photoSnap.exists() ? photoSnap.data() : null;
      if (!p || p.rev !== content.photoRev) throw new Error('photo-mismatch');
      tx.set(doc(db, `published_photos/${uid}`), {
        data: p.data as Bytes, rev: p.rev, w: p.w, h: p.h, updatedAt: serverTimestamp(),
      });
    } else {
      tx.delete(doc(db, `published_photos/${uid}`));
    }

    tx.set(pubRef, {
      ...content,
      v: 1,
      slug,
      rev: await contentRev(content),
      order: typeof card.order === 'number' ? card.order : null,
      publishedAt: serverTimestamp(),
    });
    tx.set(cardRef, { status: 'approved', slug, adminNote: '', reviewedAt: serverTimestamp() }, { merge: true });
    if (opts.replace) {
      for (const path of ['cards', 'photos', 'published', 'published_photos']) tx.delete(doc(db, `${path}/${opts.replace}`));
    }
  });
}

/**
 * A record for a person without an account, kept by the admins. It starts as a draft under
 * `rec-<slug>`; the slug is fixed from here on. Refuses when a record for this slug exists.
 */
export async function createManaged(db: Firestore, slug: string, values: CardValues, order: number | null) {
  if (!isSlug(slug)) throw new Error('bad-slug');
  const uid = managedId(slug);
  const ref = doc(db, `cards/${uid}`);
  await runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) throw new Error('record-exists');
    tx.set(ref, {
      ...contentFields(values, ''),
      status: 'draft',
      updatedAt: serverTimestamp(),
      accountEmail: '',
      emailVerified: false,
      provider: MANAGED_PROVIDER,
      slug,
      adminNote: '',
      ...(order === null ? {} : { order }),
    });
  });
  return uid;
}

/** `updatedAt` of a card as stored now: what `approve` must be given right after a save. */
export async function cardUpdatedAt(db: Firestore, uid: string): Promise<Timestamp | null> {
  const snap = await getDoc(doc(db, `cards/${uid}`));
  const at = snap.exists() ? snap.data().updatedAt : null;
  return at instanceof Timestamp ? at : null;
}

/** The team entries still written by hand (see pages/members/handwritten.json.ts). Null when unreadable. */
export async function loadHandwritten(url: string): Promise<Handwritten[] | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    return r.ok ? parseHandwritten(await r.json()) : null;
  } catch {
    return null;
  }
}

export async function requestChanges(db: Firestore, uid: string, note: string) {
  if (!note.trim()) throw new Error('note-required');
  await setDoc(
    doc(db, `cards/${uid}`),
    { status: 'changes_requested', adminNote: note.trim(), reviewedAt: serverTimestamp() },
    { merge: true },
  );
}

export interface AdminEdit {
  values: CardValues;
  order: number | null;
  slug?: string; // only while the card has none
}

/** Edit any card before approving. The status stays; `order` is cleared with deleteField when empty. */
export async function saveEdit(db: Firestore, uid: string, edit: AdminEdit, photoRev: string) {
  await setDoc(
    doc(db, `cards/${uid}`),
    {
      ...contentFields(edit.values, photoRev),
      order: edit.order === null ? deleteField() : edit.order,
      ...(edit.slug ? { slug: edit.slug } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Unpublish: both published documents go, the card goes back to draft. */
export async function unpublish(db: Firestore, uid: string) {
  const b = writeBatch(db);
  b.delete(doc(db, `published/${uid}`));
  b.delete(doc(db, `published_photos/${uid}`));
  b.set(doc(db, `cards/${uid}`), { status: 'draft', reviewedAt: serverTimestamp() }, { merge: true });
  await b.commit();
}

/** Reject and delete: the card, its working photo, and any published copy. */
export async function removeAll(db: Firestore, uid: string) {
  const b = writeBatch(db);
  for (const path of ['cards', 'photos', 'published', 'published_photos']) b.delete(doc(db, `${path}/${uid}`));
  await b.commit();
}

export async function readPhotoBytes(db: Firestore, uid: string): Promise<Uint8Array | null> {
  const s = await getDoc(doc(db, `photos/${uid}`));
  return s.exists() ? (s.data().data as Bytes).toUint8Array() : null;
}

