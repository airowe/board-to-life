import type { FallbackEntry, Library } from './manifest';
import { findFallback, findLibrarySubject, normaliseName } from './match';

export type PictureSource =
  | { kind: 'library'; subject: string }
  | { kind: 'live'; key: string }
  | { kind: 'emoji'; file: string }
  | { kind: 'drawing' };

export type LiveState = (key: string) => 'ready' | 'pending' | 'failed' | 'none';

export const pictureSource = (name: string, library: Library, fallback: FallbackEntry[], live: LiveState): PictureSource => {
  const subject = findLibrarySubject(library, name);
  if (subject !== null) return { kind: 'library', subject };
  const key = normaliseName(name);
  if (live(key) === 'ready') return { kind: 'live', key };
  const emoji = findFallback(fallback, name);
  if (emoji !== null) return { kind: 'emoji', file: emoji.file };
  return { kind: 'drawing' };
};

export const liveCandidates = (names: string[], library: Library, cap: number): string[] => {
  const unique = new Set<string>();
  for (const name of names) {
    if (unique.size >= cap) break;
    const key = normaliseName(name);
    if (key !== '' && findLibrarySubject(library, name) === null) unique.add(key);
  }
  return [...unique];
};
