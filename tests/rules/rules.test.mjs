import { test, before, after, beforeEach, describe } from 'node:test';
import {
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, writeBatch,
} from 'firebase/firestore';
import {
  makeEnv, memberCtx, adminCtx, anonCtx, seedAccess, seed, ADMIN_EMAIL,
  content, memberCard, pendingCard, adminCard, publishedDoc, photoDoc, bigBytes,
} from './helpers.mjs';

let env;
before(async () => { env = await makeEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seedAccess(env);
});

// Seeds, with rules disabled, a stored (server-shaped) card and published copy.
const stored = (over = {}) => ({
  ...content(),
  status: 'draft',
  updatedAt: Timestamp.now(),
  accountEmail: 'alice@example.org',
  emailVerified: true,
  provider: 'google.com',
  ...over,
});
const storedPublished = (over = {}) => ({
  ...content(),
  v: 1, slug: 'alice-example', rev: '9f2c4a1b7d3e5f60', order: 3,
  publishedAt: Timestamp.now(),
  ...over,
});
const storedPhoto = () => ({
  data: bigBytes(5000), rev: '0123456789abcdef', w: 640, h: 640, updatedAt: Timestamp.now(),
});

describe('signed out', () => {
  test('reads and lists published', async () => {
    await seed(env, 'published/alice', storedPublished());
    const db = anonCtx(env);
    await assertSucceeds(getDoc(doc(db, 'published/alice')));
    await assertSucceeds(getDocs(collection(db, 'published')));
  });
  test('gets but cannot list published_photos', async () => {
    await seed(env, 'published_photos/alice', storedPhoto());
    const db = anonCtx(env);
    await assertSucceeds(getDoc(doc(db, 'published_photos/alice')));
    await assertFails(getDocs(collection(db, 'published_photos')));
  });
  test('reads nothing else', async () => {
    await seed(env, 'cards/alice', stored());
    await seed(env, 'photos/alice', storedPhoto());
    const db = anonCtx(env);
    await assertFails(getDoc(doc(db, 'cards/alice')));
    await assertFails(getDocs(collection(db, 'cards')));
    await assertFails(getDoc(doc(db, 'photos/alice')));
    await assertFails(getDoc(doc(db, 'config/access')));
  });
  test('writes nothing', async () => {
    const db = anonCtx(env);
    await assertFails(setDoc(doc(db, 'cards/alice'), memberCard()));
    await assertFails(setDoc(doc(db, 'published/alice'), publishedDoc()));
    await assertFails(setDoc(doc(db, 'photos/alice'), photoDoc()));
  });
});

describe('member: cards', () => {
  test('creates own card as draft and as pending', async () => {
    const db = memberCtx(env);
    await assertSucceeds(setDoc(doc(db, 'cards/alice'), memberCard()));
    await assertSucceeds(setDoc(doc(db, 'cards/alice'), pendingCard(), { merge: true }));
  });
  test('updates own card with updateDoc and merge', async () => {
    await seed(env, 'cards/alice', stored());
    const db = memberCtx(env);
    await assertSucceeds(updateDoc(doc(db, 'cards/alice'), {
      bio: 'New bio.', status: 'pending', updatedAt: serverTimestamp(), submittedAt: serverTimestamp(),
      accountEmail: 'alice@example.org', emailVerified: true, provider: 'google.com',
    }));
  });
  test('reads own card, not another member\'s', async () => {
    await seed(env, 'cards/alice', stored());
    await seed(env, 'cards/bob', stored({ accountEmail: 'bob@example.org' }));
    const db = memberCtx(env);
    await assertSucceeds(getDoc(doc(db, 'cards/alice')));
    await assertFails(getDoc(doc(db, 'cards/bob')));
    await assertFails(getDocs(collection(db, 'cards')));
  });
  test('cannot write approved or changes_requested', async () => {
    const db = memberCtx(env);
    await assertFails(setDoc(doc(db, 'cards/alice'), memberCard({ status: 'approved' })));
    await assertFails(setDoc(doc(db, 'cards/alice'), memberCard({ status: 'changes_requested' })));
    await seed(env, 'cards/alice', stored());
    await assertFails(updateDoc(doc(db, 'cards/alice'), {
      status: 'approved', updatedAt: serverTimestamp(),
      accountEmail: 'alice@example.org', emailVerified: true, provider: 'google.com',
    }));
  });
  test('cannot write an admin key', async () => {
    const db = memberCtx(env);
    for (const k of [{ order: 1 }, { slug: 'alice' }, { adminNote: 'x' }, { reviewedAt: serverTimestamp() }]) {
      await assertFails(setDoc(doc(db, 'cards/alice'), memberCard(k)));
    }
    await seed(env, 'cards/alice', stored());
    await assertFails(updateDoc(doc(db, 'cards/alice'), {
      order: 1, updatedAt: serverTimestamp(),
      accountEmail: 'alice@example.org', emailVerified: true, provider: 'google.com',
    }));
  });
  test('cannot change an existing admin key via merge', async () => {
    await seed(env, 'cards/alice', stored({ order: 3, slug: 'alice-example', status: 'approved' }));
    const db = memberCtx(env);
    await assertFails(setDoc(doc(db, 'cards/alice'), memberCard({ order: 1 }), { merge: true }));
    // a merge that leaves admin keys untouched is fine
    await assertSucceeds(setDoc(doc(db, 'cards/alice'), memberCard({ bio: 'edit' }), { merge: true }));
  });
  test('cannot become pi, may keep pi', async () => {
    const db = memberCtx(env);
    await assertFails(setDoc(doc(db, 'cards/alice'), memberCard({ group: 'pi' })));
    await seed(env, 'cards/alice', stored());
    await assertFails(updateDoc(doc(db, 'cards/alice'), {
      group: 'pi', updatedAt: serverTimestamp(),
      accountEmail: 'alice@example.org', emailVerified: true, provider: 'google.com',
    }));
    await seed(env, 'cards/alice', stored({ group: 'pi', status: 'approved', order: 1, slug: 'alice' }));
    await assertSucceeds(updateDoc(doc(db, 'cards/alice'), {
      bio: 'still pi', status: 'draft', updatedAt: serverTimestamp(),
      accountEmail: 'alice@example.org', emailVerified: true, provider: 'google.com',
    }));
  });
  test('cannot write another member\'s card or photo', async () => {
    const db = memberCtx(env);
    await assertFails(setDoc(doc(db, 'cards/bob'), memberCard()));
    await assertFails(setDoc(doc(db, 'photos/bob'), photoDoc()));
    await seed(env, 'cards/bob', stored({ accountEmail: 'bob@example.org' }));
    await assertFails(updateDoc(doc(db, 'cards/bob'), {
      bio: 'hijack', updatedAt: serverTimestamp(),
      accountEmail: 'alice@example.org', emailVerified: true, provider: 'google.com',
    }));
    await assertFails(deleteDoc(doc(db, 'cards/bob')));
  });
  test('the token mirrors must match the token', async () => {
    const db = memberCtx(env);
    await assertFails(setDoc(doc(db, 'cards/alice'), memberCard({ accountEmail: 'other@example.org' })));
    await assertFails(setDoc(doc(db, 'cards/alice'), memberCard({ emailVerified: false })));
    await assertFails(setDoc(doc(db, 'cards/alice'), memberCard({ provider: 'password' })));
  });
  test('updatedAt must be the server time; pending needs submittedAt', async () => {
    const db = memberCtx(env);
    await assertFails(setDoc(doc(db, 'cards/alice'), memberCard({ updatedAt: Timestamp.fromDate(new Date('2020-01-01')) })));
    await assertFails(setDoc(doc(db, 'cards/alice'), memberCard({ status: 'pending' })));
  });
  test('cannot read config/access', async () => {
    const db = memberCtx(env);
    await assertFails(getDoc(doc(db, 'config/access')));
  });
  test('deletes own card only while it has no published copy', async () => {
    await seed(env, 'cards/alice', stored());
    const db = memberCtx(env);
    await assertSucceeds(deleteDoc(doc(db, 'cards/alice')));
    await seed(env, 'cards/alice', stored());
    await seed(env, 'published/alice', storedPublished());
    await assertFails(deleteDoc(doc(db, 'cards/alice')));
  });
});

describe('member: published and photos', () => {
  test('cannot write published or published_photos', async () => {
    const db = memberCtx(env);
    await assertFails(setDoc(doc(db, 'published/alice'), publishedDoc()));
    await assertFails(setDoc(doc(db, 'published_photos/alice'), photoDoc()));
  });
  test('can delete own published copy and photo, not another\'s', async () => {
    await seed(env, 'published/alice', storedPublished());
    await seed(env, 'published_photos/alice', storedPhoto());
    await seed(env, 'published/bob', storedPublished({ slug: 'bob' }));
    const db = memberCtx(env);
    await assertSucceeds(deleteDoc(doc(db, 'published/alice')));
    await assertSucceeds(deleteDoc(doc(db, 'published_photos/alice')));
    await assertFails(deleteDoc(doc(db, 'published/bob')));
  });
  test('writes and reads own working photo', async () => {
    const db = memberCtx(env);
    await assertSucceeds(setDoc(doc(db, 'photos/alice'), photoDoc()));
    await assertSucceeds(getDoc(doc(db, 'photos/alice')));
    await assertSucceeds(deleteDoc(doc(db, 'photos/alice')));
  });
  test('cannot read another member\'s working photo', async () => {
    await seed(env, 'photos/bob', storedPhoto());
    await assertFails(getDoc(doc(memberCtx(env), 'photos/bob')));
  });
});

describe('field limits', () => {
  const refused = async (label, over) => {
    await assertFails(setDoc(doc(memberCtx(env), 'cards/alice'), memberCard(over)), label);
  };
  test('over-long fields are refused', async () => {
    await refused('name', { name: 'x'.repeat(81) });
    await refused('role', { role: 'x'.repeat(81) });
    await refused('bio', { bio: 'x'.repeat(601) });
    await refused('interests', { interests: 'x'.repeat(201) });
    await refused('currentPosition', { currentPosition: 'x'.repeat(121) });
    await refused('email', { email: 'a'.repeat(120) + '@example.org' });
    await refused('github', { github: 'a'.repeat(40) });
    await refused('website', { website: 'https://example.org/' + 'a'.repeat(200) });
  });
  test('limit-sized fields are accepted', async () => {
    const db = memberCtx(env);
    await assertSucceeds(setDoc(doc(db, 'cards/alice'), memberCard({
      name: 'x'.repeat(80), role: 'x'.repeat(80), bio: 'x'.repeat(600),
      interests: 'x'.repeat(200), currentPosition: 'x'.repeat(120),
    })));
  });
  test('empty required strings are refused', async () => {
    await refused('name', { name: '' });
    await refused('role', { role: '' });
  });
  test('a missing key is refused', async () => {
    const c = memberCard();
    delete c.bio;
    await assertFails(setDoc(doc(memberCtx(env), 'cards/alice'), c));
    const d = memberCard();
    delete d.status;
    await assertFails(setDoc(doc(memberCtx(env), 'cards/alice'), d));
  });
  test('an extra key is refused', async () => {
    await refused('extra', { isAdmin: true });
  });
  test('website must start with https://', async () => {
    await refused('http', { website: 'http://example.org/alice' });
    await refused('bare', { website: 'example.org/alice' });
    await refused('javascript', { website: 'javascript:alert(1)' });
  });
  test('format checks: orcid, email, group, year, photoRev', async () => {
    await refused('orcid', { orcid: '1234' });
    await refused('email', { email: 'not-an-email' });
    await refused('group', { group: 'grad' });
    await refused('group', { group: 'wizard' });
    await refused('year low', { yearJoined: 1900 });
    await refused('year high', { yearLeft: 9999 });
    await refused('year string', { yearJoined: '2020' });
    await refused('photoRev', { photoRev: 'XYZ' });
    await refused('alumni', { alumni: 'no' });
  });
  test('year may be null and empty optional strings are fine', async () => {
    await assertSucceeds(setDoc(doc(memberCtx(env), 'cards/alice'), memberCard({
      yearJoined: null, yearLeft: null, email: '', orcid: '', scholar: '', github: '',
      website: '', linkedin: '', photoRev: '',
    })));
  });
  test('a photo over 256 KiB is refused, at 256 KiB accepted', async () => {
    const db = memberCtx(env);
    await assertFails(setDoc(doc(db, 'photos/alice'), photoDoc({ data: bigBytes(262145) })));
    await assertSucceeds(setDoc(doc(db, 'photos/alice'), photoDoc({ data: bigBytes(262144) })));
  });
  test('photo shape: too small, non-square, bad rev, extra key, stale time', async () => {
    const db = memberCtx(env);
    await assertFails(setDoc(doc(db, 'photos/alice'), photoDoc({ data: bigBytes(100) })));
    await assertFails(setDoc(doc(db, 'photos/alice'), photoDoc({ h: 500 })));
    await assertFails(setDoc(doc(db, 'photos/alice'), photoDoc({ w: 2000, h: 2000 })));
    await assertFails(setDoc(doc(db, 'photos/alice'), photoDoc({ rev: 'nope' })));
    await assertFails(setDoc(doc(db, 'photos/alice'), photoDoc({ extra: 1 })));
    await assertFails(setDoc(doc(db, 'photos/alice'), photoDoc({ updatedAt: Timestamp.now() })));
  });
});

describe('admin', () => {
  test('reads and lists everything', async () => {
    await seed(env, 'cards/alice', stored());
    await seed(env, 'photos/alice', storedPhoto());
    await seed(env, 'published/alice', storedPublished());
    await seed(env, 'published_photos/alice', storedPhoto());
    const db = adminCtx(env);
    await assertSucceeds(getDoc(doc(db, 'config/access')));
    await assertSucceeds(getDocs(collection(db, 'cards')));
    await assertSucceeds(getDoc(doc(db, 'photos/alice')));
    await assertSucceeds(getDocs(collection(db, 'published')));
    await assertSucceeds(getDocs(collection(db, 'published_photos')));
  });
  test('cannot write config/access', async () => {
    await assertFails(setDoc(doc(adminCtx(env), 'config/access'), { admins: [ADMIN_EMAIL, 'x@example.org'] }));
  });
  test('approves: writes published, published_photos, and the card', async () => {
    await seed(env, 'cards/alice', stored({ status: 'pending' }));
    const db = adminCtx(env);
    await assertSucceeds(setDoc(doc(db, 'published/alice'), publishedDoc()));
    await assertSucceeds(setDoc(doc(db, 'published_photos/alice'), photoDoc()));
    await assertSucceeds(setDoc(doc(db, 'cards/alice'), adminCard({ status: 'approved' }), { merge: true }));
  });
  test('may set group pi and pin order', async () => {
    await seed(env, 'cards/alice', stored());
    const db = adminCtx(env);
    await assertSucceeds(setDoc(doc(db, 'cards/alice'), adminCard({ group: 'pi', order: 1 })));
    await assertSucceeds(setDoc(doc(db, 'published/alice'), publishedDoc({ group: 'pi', order: 1 })));
  });
  test('requests changes only with a note', async () => {
    await seed(env, 'cards/alice', stored({ status: 'pending' }));
    const db = adminCtx(env);
    await assertFails(setDoc(doc(db, 'cards/alice'), adminCard({ status: 'changes_requested', adminNote: '' })));
    await assertSucceeds(setDoc(doc(db, 'cards/alice'), adminCard({ status: 'changes_requested', adminNote: 'Add a photo.' })));
  });
  test('approved needs a slug; slug must be valid', async () => {
    const db = adminCtx(env);
    const noSlug = adminCard({ status: 'approved' });
    delete noSlug.slug;
    await assertFails(setDoc(doc(db, 'cards/alice'), noSlug));
    await assertFails(setDoc(doc(db, 'cards/alice'), adminCard({ status: 'approved', slug: 'Not A Slug' })));
  });
  test('publishes only a document with exactly the published keys', async () => {
    const db = adminCtx(env);
    const missing = publishedDoc();
    delete missing.rev;
    await assertFails(setDoc(doc(db, 'published/alice'), missing));
    await assertFails(setDoc(doc(db, 'published/alice'), publishedDoc({ status: 'approved' })));
    await assertFails(setDoc(doc(db, 'published/alice'), publishedDoc({ v: 2 })));
    await assertFails(setDoc(doc(db, 'published/alice'), publishedDoc({ slug: 'Bad Slug' })));
    await assertFails(setDoc(doc(db, 'published/alice'), publishedDoc({ rev: 'zz' })));
    await assertFails(setDoc(doc(db, 'published/alice'), publishedDoc({ website: 'http://x.org' })));
    await assertFails(setDoc(doc(db, 'published/alice'), publishedDoc({ publishedAt: Timestamp.now() })));
    await assertSucceeds(setDoc(doc(db, 'published/alice'), publishedDoc()));
  });
  test('unpublishes: deletes published, published_photos and the card', async () => {
    await seed(env, 'published/alice', storedPublished());
    await seed(env, 'published_photos/alice', storedPhoto());
    await seed(env, 'cards/alice', stored());
    const db = adminCtx(env);
    await assertSucceeds(deleteDoc(doc(db, 'published/alice')));
    await assertSucceeds(deleteDoc(doc(db, 'published_photos/alice')));
    await assertSucceeds(deleteDoc(doc(db, 'cards/alice')));
  });
  test('may delete a card that has a published copy', async () => {
    await seed(env, 'cards/alice', stored());
    await seed(env, 'published/alice', storedPublished());
    await assertSucceeds(deleteDoc(doc(adminCtx(env), 'cards/alice')));
  });
});

describe('who counts as an admin', () => {
  test('a listed address that is unverified is not an admin', async () => {
    const db = adminCtx(env, { email_verified: false });
    await assertFails(getDoc(doc(db, 'config/access')));
    await assertFails(getDocs(collection(db, 'cards')));
    await assertFails(setDoc(doc(db, 'published/alice'), publishedDoc()));
  });
  test('a verified address in another letter case is not listed in lowercase', async () => {
    await seedAccess(env, ['Boss@Example.org']);        // mixed case entry never matches a lowercased token email
    await assertFails(getDoc(doc(adminCtx(env), 'config/access')));
  });
  test('a verified address differing in case from a lowercase entry IS an admin', async () => {
    // The rules lowercase the token address, so a lowercase list entry matches any casing of the sign-in address.
    const db = memberCtx(env, 'admin1', 'BOSS@Example.org');
    await assertSucceeds(getDoc(doc(db, 'config/access')));
  });
  test('an address not in the list is not an admin', async () => {
    const db = memberCtx(env, 'eve', 'eve@example.org');
    await assertFails(getDoc(doc(db, 'config/access')));
    await assertFails(getDocs(collection(db, 'cards')));
    await assertFails(setDoc(doc(db, 'published/eve'), publishedDoc()));
  });
  test('a missing config/access denies instead of erroring into access', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await deleteDoc(doc(ctx.firestore(), 'config/access')); });
    const db = adminCtx(env);
    await assertFails(getDoc(doc(db, 'config/access')));
    await assertFails(getDocs(collection(db, 'cards')));
    await assertFails(setDoc(doc(db, 'published/alice'), publishedDoc()));
    // public data is still readable, a member can still write their own card
    await assertSucceeds(getDocs(collection(db, 'published')));
    await assertSucceeds(setDoc(doc(db, 'cards/admin1'), memberCard({}, ADMIN_EMAIL)));
  });
  test('a config/access without an admins field denies', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'config/access'), { other: 1 }); });
    await assertFails(getDoc(doc(adminCtx(env), 'config/access')));
  });
  test('an empty admins list denies', async () => {
    await seedAccess(env, []);
    await assertFails(getDoc(doc(adminCtx(env), 'config/access')));
  });
  test('a token without an email is not an admin', async () => {
    const db = env.authenticatedContext('anon1', { email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, 'config/access')));
  });
});

describe('batched writes (the shape of Phase 4: approve and unpublish)', () => {
  // Every write in a batch calls isAdmin(), which reads config/access: this proves the
  // per-request document-access budget holds for the exact batches the admin flow sends.
  test('admin approves in one batch: published + published_photos + card', async () => {
    await seed(env, 'cards/alice', stored({ status: 'pending' }));
    const db = adminCtx(env);
    const b = writeBatch(db);
    b.set(doc(db, 'published/alice'), publishedDoc());
    b.set(doc(db, 'published_photos/alice'), photoDoc());
    b.set(doc(db, 'cards/alice'), adminCard({ status: 'approved' }), { merge: true });
    await assertSucceeds(b.commit());
  });
  test('admin unpublishes in one batch: delete both published docs, card back to draft', async () => {
    await seed(env, 'cards/alice', stored({ status: 'approved', slug: 'alice-example', order: 3 }));
    await seed(env, 'published/alice', storedPublished());
    await seed(env, 'published_photos/alice', storedPhoto());
    const db = adminCtx(env);
    const b = writeBatch(db);
    b.delete(doc(db, 'published/alice'));
    b.delete(doc(db, 'published_photos/alice'));
    b.set(doc(db, 'cards/alice'), adminCard({ status: 'draft' }), { merge: true });
    await assertSucceeds(b.commit());
  });
  test('the same approve batch from a member is refused', async () => {
    await seed(env, 'cards/alice', stored({ status: 'pending' }));
    const db = memberCtx(env);
    const b = writeBatch(db);
    b.set(doc(db, 'published/alice'), publishedDoc());
    b.set(doc(db, 'published_photos/alice'), photoDoc());
    b.set(doc(db, 'cards/alice'), adminCard({ status: 'approved' }), { merge: true });
    await assertFails(b.commit());
  });
  test('one bad write refuses the whole approve batch', async () => {
    await seed(env, 'cards/alice', stored({ status: 'pending' }));
    const db = adminCtx(env);
    const b = writeBatch(db);
    b.set(doc(db, 'published/alice'), publishedDoc());
    b.set(doc(db, 'published_photos/alice'), photoDoc({ data: bigBytes(262145) }));
    await assertFails(b.commit());
    await assertFails(getDoc(doc(anonCtx(env), 'cards/alice')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), 'published/alice'));
      if (snap.exists()) throw new Error('published/alice was written by a refused batch');
    });
  });
});

// A record an admin keeps for a person without an account (src/members/managed.ts): a normal card
// under the id `rec-<slug>` with `provider: 'admin'`. The rules need no clause of their own for it;
// these tests pin that the existing ones give exactly this behaviour.
describe('records without an account (kept by an admin)', () => {
  const REC = 'rec-jane-doe';
  const managedCard = (over = {}) => ({
    ...content({ name: 'Jane Doe', role: 'MSc (Alumni)', group: 'msc', alumni: true, email: '',
      yearJoined: 2019, yearLeft: 2022, currentPosition: 'Postdoc, Example University' }),
    status: 'draft',
    updatedAt: serverTimestamp(),
    accountEmail: '',
    emailVerified: false,
    provider: 'admin',
    slug: 'jane-doe',
    adminNote: '',
    ...over,
  });
  const storedManaged = (over = {}) => ({ ...managedCard(), updatedAt: Timestamp.now(), ...over });
  const publishedManaged = (over = {}) => publishedDoc({
    name: 'Jane Doe', role: 'MSc (Alumni)', group: 'msc', alumni: true, email: '',
    yearJoined: 2019, yearLeft: 2022, currentPosition: 'Postdoc, Example University',
    slug: 'jane-doe', order: null, ...over,
  });

  test('an admin creates the record, adds a photo and publishes it from draft', async () => {
    const db = adminCtx(env);
    await assertSucceeds(setDoc(doc(db, `cards/${REC}`), managedCard()));
    await assertSucceeds(setDoc(doc(db, `photos/${REC}`), photoDoc()));
    await assertSucceeds(setDoc(doc(db, `cards/${REC}`), { photoRev: '0123456789abcdef', updatedAt: serverTimestamp() }, { merge: true }));
    const b = writeBatch(db);
    b.set(doc(db, `published_photos/${REC}`), photoDoc());
    b.set(doc(db, `published/${REC}`), publishedManaged({ photoRev: '0123456789abcdef' }));
    b.set(doc(db, `cards/${REC}`), { status: 'approved', slug: 'jane-doe', adminNote: '', reviewedAt: serverTimestamp() }, { merge: true });
    await assertSucceeds(b.commit());
  });
  test('an admin may keep the principal investigator and pin the order', async () => {
    const db = adminCtx(env);
    await assertSucceeds(setDoc(doc(db, 'cards/rec-the-pi'), managedCard({ group: 'pi', alumni: false, slug: 'the-pi', order: 1 })));
  });
  test('the record must still be a valid card', async () => {
    const db = adminCtx(env);
    await assertFails(setDoc(doc(db, `cards/${REC}`), managedCard({ group: 'grad' })));
    await assertFails(setDoc(doc(db, `cards/${REC}`), managedCard({ name: '' })));
    await assertFails(setDoc(doc(db, `cards/${REC}`), managedCard({ slug: 'Not A Slug' })));
    await assertFails(setDoc(doc(db, `cards/${REC}`), managedCard({ managed: true })));
    const noProvider = managedCard();
    delete noProvider.provider;
    await assertFails(setDoc(doc(db, `cards/${REC}`), noProvider));
  });
  test('a member can neither read, create, change nor delete the record or its photo', async () => {
    const db = memberCtx(env);
    await assertFails(setDoc(doc(db, `cards/${REC}`), managedCard()));
    await assertFails(setDoc(doc(db, `cards/${REC}`), memberCard()));
    await seed(env, `cards/${REC}`, storedManaged());
    await seed(env, `photos/${REC}`, storedPhoto());
    await assertFails(getDoc(doc(db, `cards/${REC}`)));
    await assertFails(getDoc(doc(db, `photos/${REC}`)));
    await assertFails(setDoc(doc(db, `cards/${REC}`), { name: 'Mallory', updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(db, `photos/${REC}`), photoDoc()));
    await assertFails(deleteDoc(doc(db, `cards/${REC}`)));
    await assertFails(deleteDoc(doc(db, `photos/${REC}`)));
  });
  test('a member cannot take the published record down or overwrite it', async () => {
    await seed(env, `published/${REC}`, { ...publishedManaged(), publishedAt: Timestamp.now() });
    await seed(env, `published_photos/${REC}`, storedPhoto());
    const db = memberCtx(env);
    await assertFails(deleteDoc(doc(db, `published/${REC}`)));
    await assertFails(deleteDoc(doc(db, `published_photos/${REC}`)));
    await assertFails(setDoc(doc(db, `published/${REC}`), publishedManaged()));
  });
  test('a member cannot give their own card the marker of a kept record', async () => {
    const db = memberCtx(env);
    await assertFails(setDoc(doc(db, 'cards/alice'), memberCard({ provider: 'admin' })));
    await assertFails(setDoc(doc(db, 'cards/alice'), memberCard({ accountEmail: '' })));
    await assertSucceeds(setDoc(doc(db, 'cards/alice'), memberCard()));
    await assertFails(setDoc(doc(db, 'cards/alice'), { provider: 'admin', updatedAt: serverTimestamp() }, { merge: true }));
  });
  test('signed out reads the published copy and nothing of the working copy', async () => {
    await seed(env, `cards/${REC}`, storedManaged());
    await seed(env, `photos/${REC}`, storedPhoto());
    await seed(env, `published/${REC}`, { ...publishedManaged(), publishedAt: Timestamp.now() });
    await seed(env, `published_photos/${REC}`, storedPhoto());
    const db = anonCtx(env);
    await assertSucceeds(getDoc(doc(db, `published/${REC}`)));
    await assertSucceeds(getDoc(doc(db, `published_photos/${REC}`)));
    await assertFails(getDoc(doc(db, `cards/${REC}`)));
    await assertFails(getDoc(doc(db, `photos/${REC}`)));
  });

  // approve() with `replace`: the person signed in, so their own card takes the record's place.
  const OLD = 'rec-alice-example';
  const seedReplaceable = async () => {
    await seed(env, `cards/${OLD}`, storedManaged({ status: 'approved', slug: 'alice-example' }));
    await seed(env, `photos/${OLD}`, storedPhoto());
    await seed(env, `published/${OLD}`, storedPublished());
    await seed(env, `published_photos/${OLD}`, storedPhoto());
    await seed(env, 'cards/alice', stored({ status: 'pending' }));
    await seed(env, 'photos/alice', storedPhoto());
  };
  const replaceBatch = (db) => {
    const b = writeBatch(db);
    b.set(doc(db, 'published_photos/alice'), photoDoc());
    b.set(doc(db, 'published/alice'), publishedDoc({ photoRev: '0123456789abcdef' }));
    b.set(doc(db, 'cards/alice'), { status: 'approved', slug: 'alice-example', adminNote: '', reviewedAt: serverTimestamp() }, { merge: true });
    for (const path of ['cards', 'photos', 'published', 'published_photos']) b.delete(doc(db, `${path}/${OLD}`));
    return b;
  };
  test('an admin replaces the record with the member\'s own card in one batch', async () => {
    await seedReplaceable();
    await assertSucceeds(replaceBatch(adminCtx(env)).commit());
    await env.withSecurityRulesDisabled(async (ctx) => {
      for (const path of ['cards', 'photos', 'published', 'published_photos']) {
        if ((await getDoc(doc(ctx.firestore(), `${path}/${OLD}`))).exists()) throw new Error(`${path}/${OLD} survived the replacement`);
      }
      const pub = await getDoc(doc(ctx.firestore(), 'published/alice'));
      if (!pub.exists() || pub.data().slug !== 'alice-example') throw new Error('the member\'s card was not published under the record\'s slug');
    });
  });
  test('the same batch from the member is refused and changes nothing', async () => {
    await seedReplaceable();
    await assertFails(replaceBatch(memberCtx(env)).commit());
    await env.withSecurityRulesDisabled(async (ctx) => {
      if (!(await getDoc(doc(ctx.firestore(), `published/${OLD}`))).exists()) throw new Error('a refused batch deleted the record');
      if ((await getDoc(doc(ctx.firestore(), 'published/alice'))).exists()) throw new Error('a refused batch published the card');
    });
  });
});

describe('test context', () => {
  test('email_verified and firebase.sign_in_provider reach the rules', async () => {
    // provider mirror passes only if the test context really sets sign_in_provider
    const pw = env.authenticatedContext('pw', {
      email: 'pw@example.org', email_verified: false, firebase: { sign_in_provider: 'password' },
    }).firestore();
    await assertSucceeds(setDoc(doc(pw, 'cards/pw'), memberCard({ provider: 'password', emailVerified: false }, 'pw@example.org')));
    await assertFails(setDoc(doc(pw, 'cards/pw'), memberCard({ provider: 'google.com', emailVerified: false }, 'pw@example.org')));
    await assertFails(setDoc(doc(pw, 'cards/pw'), memberCard({ provider: 'password', emailVerified: true }, 'pw@example.org')));
  });
});
