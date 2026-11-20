import initialDbJson from '../../data/initial-db.json';

/** Snapshot database untuk instalasi baru (web native / APK). */
export function getInitialDbSnapshot(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(initialDbJson)) as Record<string, unknown>;
}
