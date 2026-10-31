import type { ModelFigure } from './figureReader';

export const TRIANGLE_READ_CASE_13_RUN_1: ModelFigure = {
  points: [
    { id: 'A', x: 242, y: 740, confidence: 0.97 },
    { id: 'B', x: 690, y: 740, confidence: 0.97 },
    { id: 'C', x: 499, y: 324, confidence: 0.97 },
  ],
  segments: [
    { id: 'sAB', from: 'A', to: 'B', confidence: 0.98 },
    { id: 'sBC', from: 'B', to: 'C', confidence: 0.98 },
    { id: 'sCA', from: 'C', to: 'A', confidence: 0.98 },
  ],
  lines: [],
  rays: [],
  circles: [],
  polygons: [
    { id: 'triABC', vertices: ['A', 'B', 'C'], confidence: 0.97 },
  ],
  marks: [
    { id: 'mA', kind: 'angle', at: 'A', from: 'B', to: 'C', confidence: 0.9 },
    { id: 'mB', kind: 'angle', at: 'B', from: 'A', to: 'C', degrees: 60, confidence: 0.95 },
    { id: 'mC', kind: 'angle', at: 'C', from: 'A', to: 'B', confidence: 0.9 },
    { id: 'lAB', kind: 'length', from: 'A', to: 'B', value: 50, unit: '°', confidence: 0.85 },
  ],
  transformations: [],
  labels: [],
  unknownMarks: [],
  focus: null,
};

export const TRIANGLE_READ_CASE_14_RUN_2: ModelFigure = {
  points: [
    { id: 'A', x: 329, y: 617, confidence: 0.96 },
    { id: 'B', x: 616, y: 620, confidence: 0.96 },
    { id: 'C', x: 508, y: 369, confidence: 0.96 },
  ],
  segments: [
    { id: 'sAB', from: 'A', to: 'B', confidence: 0.96 },
    { id: 'sBC', from: 'B', to: 'C', confidence: 0.96 },
    { id: 'sCA', from: 'C', to: 'A', confidence: 0.96 },
  ],
  lines: [],
  rays: [],
  circles: [],
  polygons: [
    { id: 'ABC', vertices: ['A', 'B', 'C'], confidence: 0.96 },
  ],
  marks: [
    { id: 'mA', kind: 'angle', at: 'A', from: 'B', to: 'C', confidence: 0.85 },
    { id: 'mB', kind: 'angle', at: 'B', from: 'A', to: 'C', degrees: 60, confidence: 0.92 },
    { id: 'mC', kind: 'angle', at: 'C', from: 'A', to: 'B', confidence: 0.85 },
    { id: 'lenAB', kind: 'length', from: 'A', to: 'B', value: 50, unit: '°', confidence: 0.75 },
  ],
  transformations: [],
  labels: [],
  unknownMarks: [],
  focus: null,
};
