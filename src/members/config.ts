// The public web config of the Firebase project, written by the site owner at go-live.
// A plain import of a missing file would break the build, hence the glob.
const found = import.meta.glob('../data/firebase-config.json', { eager: true, import: 'default' });

export type WebConfig = Record<string, string>;

export function liveConfig(): WebConfig | null {
  const first = Object.values(found)[0];
  return first && typeof first === 'object' ? (first as WebConfig) : null;
}

export const emulatorRequested = import.meta.env.PUBLIC_FIREBASE_EMULATOR === '1';
export const isConfigured = emulatorRequested || liveConfig() !== null;
