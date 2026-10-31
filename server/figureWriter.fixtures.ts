import type { Figure } from "../src/geometry/schema";

// Reflection description, check run 2026-10-31T02-58-29-731Z case 9 run 2: the model drew the image as ApBpCp.
export const REFLECTION_WRITE_WITH_PRIMED_IMAGE: Figure = {
  version: 1,
  drawing: { width: 1200, height: 800 },
  points: [
    { id: "A", x: 240, y: 240, confidence: 1 },
    { id: "B", x: 216, y: 560, confidence: 1 },
    { id: "C", x: 516, y: 440, confidence: 1 },
    { id: "M", x: 660, y: 80, confidence: 1 },
    { id: "N", x: 660, y: 720, confidence: 1 },
    { id: "Ap", x: 1080, y: 240, confidence: 1 },
    { id: "Bp", x: 1104, y: 560, confidence: 1 },
    { id: "Cp", x: 804, y: 440, confidence: 1 },
  ],
  segments: [],
  lines: [{ id: "lMN", from: "M", to: "N", confidence: 1 }],
  rays: [],
  circles: [],
  polygons: [
    { id: "abc", vertices: ["A", "B", "C"], confidence: 1 },
    { id: "abc2", vertices: ["Ap", "Bp", "Cp"], confidence: 1 },
  ],
  marks: [],
  transformations: [
    {
      id: "t1",
      kind: "reflect",
      mirror: ["M", "N"],
      polygon: "abc",
      confidence: 1,
    },
  ],
  labels: [],
  unknownMarks: [],
  focus: { kind: "transform", transformation: "t1" },
};

// Reflection description, check run 2026-10-31T02-58-29-731Z case 9 run 1: the model drew the image as P1P2P3.
export const REFLECTION_WRITE_WITH_NUMBERED_IMAGE: Figure = {
  version: 1,
  drawing: { width: 1200, height: 800 },
  points: [
    { id: "A", x: 240, y: 240, confidence: 1 },
    { id: "B", x: 180, y: 480, confidence: 1 },
    { id: "C", x: 420, y: 440, confidence: 1 },
    { id: "M", x: 600, y: 160, confidence: 1 },
    { id: "N", x: 600, y: 640, confidence: 1 },
    { id: "P1", x: 960, y: 240, confidence: 1 },
    { id: "P2", x: 1020, y: 480, confidence: 1 },
    { id: "P3", x: 780, y: 440, confidence: 1 },
  ],
  segments: [],
  lines: [{ id: "lMN", from: "M", to: "N", confidence: 1 }],
  rays: [],
  circles: [],
  polygons: [
    { id: "abc", vertices: ["A", "B", "C"], confidence: 1 },
    { id: "abcm", vertices: ["P1", "P2", "P3"], confidence: 1 },
  ],
  marks: [],
  transformations: [
    {
      id: "t1",
      kind: "reflect",
      mirror: ["M", "N"],
      polygon: "abc",
      confidence: 1,
    },
  ],
  labels: [],
  unknownMarks: [],
  focus: { kind: "transform", transformation: "t1" },
};

// Rotation description, check run 2026-10-31T01-48-07-904Z case 12 run 2: the model drew P1P2P3 well away from where the rotation lands.
export const ROTATION_WRITE_WITH_MISPLACED_IMAGE: Figure = {
  version: 1,
  drawing: { width: 1200, height: 800 },
  points: [
    { id: "O", x: 360, y: 480, confidence: 1 },
    { id: "A", x: 660, y: 400, confidence: 1 },
    { id: "B", x: 840, y: 400, confidence: 1 },
    { id: "C", x: 750, y: 560, confidence: 1 },
    { id: "P1", x: 240, y: 280, confidence: 1 },
    { id: "P2", x: 240, y: 160, confidence: 1 },
    { id: "P3", x: 480, y: 220, confidence: 1 },
  ],
  segments: [],
  lines: [],
  rays: [],
  circles: [],
  polygons: [
    { id: "abc", vertices: ["A", "B", "C"], confidence: 1 },
    { id: "abc2", vertices: ["P1", "P2", "P3"], confidence: 1 },
  ],
  marks: [],
  transformations: [
    {
      id: "t1",
      kind: "rotate",
      centre: "O",
      degrees: 90,
      polygon: "abc",
      confidence: 1,
    },
  ],
  labels: [],
  unknownMarks: [],
  focus: { kind: "transform", transformation: "t1" },
};
