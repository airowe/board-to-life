import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

// With ACCESS_CODE set, only requests carrying that code reach the paid model calls.
export const hasAccess = (expected: string | undefined, given: string | undefined): boolean => {
  if (!expected) return true;
  return given !== undefined && timingSafeEqual(digest(expected), digest(given));
};
