export const DESCRIPTION_LIMIT = 600;

export type DescriptionCheck = { ok: true; text: string } | { ok: false; error: string };

export const checkDescription = (text: unknown): DescriptionCheck => {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed.length === 0) return { ok: false, error: 'Type a description of the setup first.' };
  if (trimmed.length > DESCRIPTION_LIMIT) return { ok: false, error: `Keep the description under ${DESCRIPTION_LIMIT} characters.` };
  return { ok: true, text: trimmed };
};
