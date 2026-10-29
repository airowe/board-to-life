export const ACCESS_HEADER = 'x-access-code';
const STORAGE_KEY = 'board-to-life:access-code';

type CodeStorage = Pick<Storage, 'getItem' | 'setItem'>;

const attempt = <T>(action: () => T): T | null => {
  try {
    return action();
  } catch {
    return null;
  }
};

// The live demo link carries ?code=…; it is kept so a reload or a new photo still works.
export const rememberAccessCode = (search: string, storage: CodeStorage): string | null => {
  const fromLink = new URLSearchParams(search).get('code');
  if (fromLink) {
    attempt(() => storage.setItem(STORAGE_KEY, fromLink));
    return fromLink;
  }
  return attempt(() => storage.getItem(STORAGE_KEY));
};

export const accessHeaders = (code: string | null): Record<string, string> => (code ? { [ACCESS_HEADER]: code } : {});
