export const rampBallDominoes = {
  version: 1,
  drawing: { width: 1200, height: 800 },
  items: [
    { id: 'floor', kind: 'floor', x: 600, y: 770, width: 1200, height: 60, confidence: 0.97 },
    { id: 'ramp', kind: 'ramp', x1: 60, y1: 330, x2: 470, y2: 728, thickness: 16, confidence: 0.93 },
    { id: 'ball', kind: 'ball', x: 104, y: 330, radius: 30, velocity: { x: 180, y: 0 }, confidence: 0.95 },
    { id: 'domino-1', kind: 'domino', x: 640, y: 685, width: 18, height: 110, angle: 0, confidence: 0.91 },
    { id: 'domino-2', kind: 'domino', x: 712, y: 685, width: 18, height: 110, angle: 0, confidence: 0.9 },
    { id: 'domino-3', kind: 'domino', x: 784, y: 685, width: 18, height: 110, angle: 0, confidence: 0.88 },
    { id: 'domino-4', kind: 'domino', x: 856, y: 685, width: 18, height: 110, angle: 0, confidence: 0.86 },
    { id: 'domino-5', kind: 'domino', x: 928, y: 685, width: 18, height: 110, angle: 0, confidence: 0.58 },
    { id: 'wall', kind: 'wall', x: 1150, y: 590, width: 24, height: 300, confidence: 0.84 },
  ],
  joints: [],
  labels: [
    { id: 'label-push', text: 'push', x: 150, y: 250, attachesTo: 'ball', confidence: 0.82 },
    { id: 'label-ramp', text: 'ramp', x: 330, y: 470, attachesTo: 'ramp', confidence: 0.79 },
  ],
  unknownMarks: [
    { id: 'mark-1', x: 1060, y: 145, width: 130, height: 130, note: 'Unrecognised mark (looks like a sun)', confidence: 0.31 },
  ],
  predictPoints: [{ id: 'pp-1', trigger: { kind: 'time', seconds: 0.75 } }],
} as const;

export const rampBallDominoesQuestions = [
  {
    id: 'q-1',
    predictPointId: 'pp-1',
    prompt: 'Will the last domino fall?',
    choices: ['Yes', 'No'],
    observe: { kind: 'fallen', item: 'domino-5' },
    explanation:
      'The ball rolls down the ramp and hits the first domino. Each domino tips into the next one, passing the push along the row.',
    cites: ['ball', 'ramp', 'domino-1', 'domino-5'],
  },
] as const;
