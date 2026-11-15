import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp, Bytes } from 'firebase/firestore';

const RULES = process.env.RULES_PATH ?? fileURLToPath(new URL('../../firebase/firestore.rules', import.meta.url));

export const ADMIN_EMAIL = 'boss@example.org';

export async function makeEnv(projectId = 'demo-members') {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  return initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(RULES, 'utf8'), host, port: Number(port) },
  });
}

export const memberCtx = (env, uid = 'alice', email = 'alice@example.org', extra = {}) =>
  env.authenticatedContext(uid, {
    email,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
    ...extra,
  }).firestore();

export const adminCtx = (env, extra = {}) =>
  memberCtx(env, 'admin1', ADMIN_EMAIL, extra);

export const anonCtx = (env) => env.unauthenticatedContext().firestore();

export async function seedAccess(env, admins = [ADMIN_EMAIL]) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'config/access'), { admins });
  });
}

export async function seed(env, path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

export const content = (over = {}) => ({
  name: 'Alice Example',
  role: 'PhD Student',
  group: 'phd',
  alumni: false,
  bio: 'Studies wild barley.',
  interests: 'wild barley, local adaptation',
  email: 'alice@example.org',
  orcid: '0000-0001-2345-6789',
  scholar: 'AbCdEfGhIjKl',
  github: 'alice',
  website: 'https://example.org/alice',
  linkedin: 'alice-example',
  yearJoined: 2023,
  yearLeft: null,
  currentPosition: '',
  photoRev: '',
  ...over,
});

// What a member writes. serverTimestamp() satisfies `updatedAt == request.time`.
export const memberCard = (over = {}, email = 'alice@example.org') => ({
  ...content(),
  status: 'draft',
  updatedAt: serverTimestamp(),
  accountEmail: email,
  emailVerified: true,
  provider: 'google.com',
  ...over,
});

export const pendingCard = (over = {}) =>
  memberCard({ status: 'pending', submittedAt: serverTimestamp(), ...over });

// What an admin writes to a card.
export const adminCard = (over = {}) => ({
  ...memberCard(),
  order: 3,
  slug: 'alice-example',
  adminNote: '',
  reviewedAt: serverTimestamp(),
  ...over,
});

export const publishedDoc = (over = {}) => ({
  ...content(),
  v: 1,
  slug: 'alice-example',
  rev: '9f2c4a1b7d3e5f60',
  order: 3,
  publishedAt: serverTimestamp(),
  ...over,
});

export const photoDoc = (over = {}) => ({
  data: Bytes.fromUint8Array(new Uint8Array(5000).fill(7)),
  rev: '0123456789abcdef',
  w: 640,
  h: 640,
  updatedAt: serverTimestamp(),
  ...over,
});

export const bigBytes = (n) => Bytes.fromUint8Array(new Uint8Array(n).fill(7));
