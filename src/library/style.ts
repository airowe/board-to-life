// Mirrors STYLE in scripts/library-subjects.mjs, which style.spec.ts keeps identical.
export const PICTURE_STYLE =
  'polished educational illustration halfway between flat vector art and a soft 3D render: clean simple rounded shapes, ' +
  'smooth soft gradient shading that gives gentle volume, soft rim light, natural true-to-life colours, harmonious palette, ' +
  'no outlines, no fine texture, no text, no labels';

const OBJECT_LAYOUT = 'centered, whole subject visible with margin around it, no shadow, no ground';

export const objectPrompt = (subject: string): string =>
  `A single ${subject}, seen from the side, facing right, isolated on a plain pure white background, ${OBJECT_LAYOUT}, ${PICTURE_STYLE}`;
