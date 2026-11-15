import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore/lite';
import { liveConfig } from './config';

export interface Backend {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  emulator: boolean;
}

/** Null when the portal is not configured. Everything here is synchronous after the await. */
export async function initBackend(): Promise<Backend | null> {
  if (import.meta.env.PUBLIC_FIREBASE_EMULATOR === '1') {
    // Dead code in a normal build: Vite replaces the env value, so this branch and its import go away.
    const ports = (await import('../../firebase.json')).default.emulators;
    const app = initializeApp({ projectId: 'demo-members', apiKey: 'demo-api-key' });
    const auth = getAuth(app);
    const db = getFirestore(app);
    connectAuthEmulator(auth, `http://127.0.0.1:${ports.auth.port}`, { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', ports.firestore.port);
    return { app, auth, db, emulator: true };
  }
  const cfg = liveConfig();
  if (!cfg) return null;
  const app = initializeApp(cfg);
  return { app, auth: getAuth(app), db: getFirestore(app), emulator: false };
}
