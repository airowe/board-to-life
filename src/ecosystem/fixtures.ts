import type { Web } from './schema';

const CONFIDENCE = 0.9;
const BOX = { width: 80, height: 60 };

export const speciesAt = (id: string, role: Web['species'][number]['role'], x: number, y: number): Web['species'][number] => ({
  id,
  name: id,
  role,
  x,
  y,
  ...BOX,
  confidence: CONFIDENCE,
});

export const eatsArrow = (id: string, from: string, to: string): Web['eats'][number] => ({ id, from, to, confidence: CONFIDENCE });

export const webOf = (species: Web['species'], eats: Web['eats'], event: Web['event'] = null): Web => ({
  version: 1,
  drawing: { width: 1000, height: 1000 },
  species,
  eats,
  labels: [],
  unknownMarks: [],
  event,
});

export const grasslandWeb = (): Web =>
  webOf(
    [
      speciesAt('grass', 'producer', 100, 800),
      speciesAt('rabbit', 'consumer', 400, 600),
      speciesAt('fox', 'consumer', 700, 400),
      speciesAt('hawk', 'consumer', 700, 100),
    ],
    [eatsArrow('a1', 'grass', 'rabbit'), eatsArrow('a2', 'rabbit', 'fox'), eatsArrow('a3', 'rabbit', 'hawk')],
  );
