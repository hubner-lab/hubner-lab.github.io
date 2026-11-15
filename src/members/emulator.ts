// Emulator-only test sign-ins. Imported dynamically behind PUBLIC_FIREBASE_EMULATOR, so it is not
// part of a normal build. The Auth emulator accepts a Google credential given as a JSON string.
import { GoogleAuthProvider, signInWithCredential, type Auth } from 'firebase/auth';

const PEOPLE: Record<string, { sub: string; email: string; email_verified: boolean; name: string }> = {
  member: { sub: 'test-member', email: 'member@example.org', email_verified: true, name: 'Test Member' },
  admin: { sub: 'test-admin', email: 'admin@example.org', email_verified: true, name: 'Test Admin' },
};

export function wireTestButtons(auth: Auth, onError: (e: unknown) => void) {
  document.querySelectorAll<HTMLButtonElement>('[data-test-signin]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const person = PEOPLE[btn.dataset.testSignin ?? ''];
      if (!person) return;
      signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify(person))).catch(onError);
    });
  });
}
