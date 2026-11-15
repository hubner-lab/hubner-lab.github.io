// Firestore access for one member's card. Only firebase/firestore/lite, only from here and main.ts.
import type { User } from 'firebase/auth';
import {
  Bytes, deleteDoc, doc, getDoc, serverTimestamp, setDoc, writeBatch,
  type Firestore,
} from 'firebase/firestore/lite';
import { normalizeInterests, parseYear, type CardValues } from './limits';

export type Status = 'draft' | 'pending' | 'changes_requested' | 'approved';

export interface StoredCard extends Record<string, unknown> {
  status: Status;
  group: string;
  photoRev: string;
  adminNote?: string;
}

export interface Published {
  rev: string;
  group: string;
}

const get = async (db: Firestore, path: string) => {
  const snap = await getDoc(doc(db, path));
  return snap.exists() ? snap.data() : null;
};

export async function readCard(db: Firestore, uid: string) {
  return (await get(db, `cards/${uid}`)) as StoredCard | null;
}

export async function readPublished(db: Firestore, uid: string) {
  return (await get(db, `published/${uid}`)) as Published | null;
}

export async function readPhoto(db: Firestore, uid: string): Promise<{ bytes: Uint8Array; rev: string } | null> {
  const d = await get(db, `photos/${uid}`);
  if (!d) return null;
  return { bytes: (d.data as Bytes).toUint8Array(), rev: d.rev as string };
}

/** `{ uid: rev }` of what the site currently shows. Null when it cannot be read: not an error for the page. */
export async function readSynced(url: string): Promise<Record<string, string> | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

export function contentFields(v: CardValues, photoRev: string) {
  return {
    name: v.name.trim(),
    role: v.role.trim(),
    group: v.group,
    alumni: v.alumni,
    bio: v.bio,
    interests: normalizeInterests(v.interests),
    email: v.email,
    orcid: v.orcid,
    scholar: v.scholar,
    github: v.github,
    website: v.website,
    linkedin: v.linkedin,
    yearJoined: parseYear(v.yearJoined),
    yearLeft: parseYear(v.yearLeft),
    currentPosition: v.currentPosition,
    photoRev,
  };
}

/** The rules compare these with the sign-in token, so they are read from the token, never typed. */
async function tokenMirror(user: User) {
  const t = await user.getIdTokenResult();
  return {
    accountEmail: String(t.claims.email ?? ''),
    emailVerified: t.claims.email_verified === true,
    provider: String(t.signInProvider ?? ''),
  };
}

/**
 * Write the card. `setDoc` with `merge: true`: a plain setDoc would drop the admin keys
 * (order, slug, adminNote, reviewedAt), which the rules refuse a member to write.
 */
export async function saveCard(
  db: Firestore,
  user: User,
  v: CardValues,
  photoRev: string,
  status: 'draft' | 'pending',
) {
  const data = {
    ...contentFields(v, photoRev),
    ...(await tokenMirror(user)),
    status,
    updatedAt: serverTimestamp(),
    ...(status === 'pending' ? { submittedAt: serverTimestamp() } : {}),
  };
  await setDoc(doc(db, `cards/${user.uid}`), data, { merge: true });
}

export async function savePhoto(db: Firestore, uid: string, bytes: Uint8Array, rev: string) {
  await setDoc(doc(db, `photos/${uid}`), {
    data: Bytes.fromUint8Array(bytes),
    rev,
    w: 640,
    h: 640,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePhoto(db: Firestore, uid: string) {
  await deleteDoc(doc(db, `photos/${uid}`));
}

/** A member takes their own live card down: both published documents go, the card goes back to draft. */
export async function takeDown(db: Firestore, user: User) {
  const batch = writeBatch(db);
  batch.delete(doc(db, `published/${user.uid}`));
  batch.delete(doc(db, `published_photos/${user.uid}`));
  batch.set(
    doc(db, `cards/${user.uid}`),
    { ...(await tokenMirror(user)), status: 'draft', updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
}
