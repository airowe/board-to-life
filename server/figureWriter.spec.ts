import { describe, expect, it } from "vitest";
import { validateFigure } from "../src/geometry/schema";
import type { ModelFigure } from "./figureReader";
import type { Figure } from "../src/geometry/schema";
import {
  describeFigureWithModel,
  figureWriterPrompt,
  namedPoints,
  withoutDrawnImages,
} from "./figureWriter";
import {
  REFLECTION_WRITE_WITH_NUMBERED_IMAGE,
  REFLECTION_WRITE_WITH_PRIMED_IMAGE,
  ROTATION_WRITE_WITH_MISPLACED_IMAGE,
} from "./figureWriter.fixtures";
import { drawingSize, PROVIDERS } from "./sceneReader";
import { LayoutError, WRITER_SIZE } from "./sceneWriter";

const TIMEOUT_MS = 1000;
const DESCRIPTION = "Triangle ABC with a 50° angle at A and a 60° angle at B.";
const ATTEMPTS = 2;
const REFLECTION_DESCRIPTION = "A triangle ABC on the left of a vertical mirror line MN. Reflect triangle ABC in the mirror line MN.";
const ROTATION_DESCRIPTION = "A triangle ABC to the right of a point O. Rotate triangle ABC by 90 degrees counterclockwise about O.";

const point = (id: string, x: number, y: number) => ({
  id,
  x,
  y,
  confidence: 1,
});

const layout: ModelFigure = {
  points: [point("A", 250, 750), point("B", 650, 750), point("C", 490, 400)],
  segments: [
    { id: "sAB", from: "A", to: "B", confidence: 1 },
    { id: "sBC", from: "B", to: "C", confidence: 1 },
    { id: "sCA", from: "C", to: "A", confidence: 1 },
  ],
  lines: [],
  rays: [],
  circles: [],
  polygons: [{ id: "abc", vertices: ["A", "B", "C"], confidence: 1 }],
  marks: [
    {
      id: "mA",
      kind: "angle",
      at: "A",
      from: "B",
      to: "C",
      degrees: 50,
      confidence: 1,
    },
    {
      id: "mB",
      kind: "angle",
      at: "B",
      from: "C",
      to: "A",
      degrees: 60,
      confidence: 1,
    },
  ],
  transformations: [],
  labels: [],
  unknownMarks: [],
  focus: null,
};
const invalidLayout: ModelFigure = {
  ...layout,
  segments: [
    ...layout.segments,
    { id: "sAG", from: "A", to: "ghost", confidence: 1 },
  ],
};

type Call = { body: string };

const fakeFetch =
  (replies: ModelFigure[], calls: Call[] = []): typeof fetch =>
  (_input, init) => {
    calls.push({ body: String(init?.body) });
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    const content = JSON.stringify(reply);
    return Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
      }),
    );
  };

const describeWith = (replies: ModelFigure[], calls: Call[] = []) =>
  describeFigureWithModel(
    DESCRIPTION,
    { ...PROVIDERS.meta, apiKey: "test-key" },
    { timeoutMs: TIMEOUT_MS, fetchImpl: fakeFetch(replies, calls) },
  );

describe("figureWriterPrompt", () => {
  it("includes the description and the point-naming rule", () => {
    const prompt = figureWriterPrompt(DESCRIPTION, []);
    expect(prompt).toContain(DESCRIPTION);
    expect(prompt).toContain("Name each point by the letter written beside it");
  });

  it("asks for parallel lines to be marked and drawn parallel", () => {
    expect(figureWriterPrompt(DESCRIPTION, [])).toContain(
      "When the description says two lines are parallel, mark them with a parallel mark and draw them parallel.",
    );
  });

  it("tells the model not to draw where a transformed shape lands", () => {
    expect(figureWriterPrompt(DESCRIPTION, [])).toContain(
      "Do not draw where a transformed shape lands; the app animates it.",
    );
  });

  it("asks for no fix when there are no errors", () => {
    expect(figureWriterPrompt(DESCRIPTION, [])).not.toContain(
      "Your last layout was rejected",
    );
  });

  it("lists each rejection reason on its own line", () => {
    expect(
      figureWriterPrompt(DESCRIPTION, ["first problem", "second problem"]),
    ).toContain(
      "Your last layout was rejected for these reasons; fix them:\nfirst problem\nsecond problem",
    );
  });
});

describe("describeFigureWithModel", () => {
  it("returns a valid figure on the writer drawing", async () => {
    const figure = await describeWith([layout]);
    expect(validateFigure(figure)).toMatchObject({ ok: true });
    expect(figure).toMatchObject({
      version: 1,
      drawing: drawingSize(WRITER_SIZE),
    });
  });

  it("sends the description as text with no image", async () => {
    const calls: Call[] = [];
    await describeWith([layout], calls);
    const sent = JSON.parse(calls[0]?.body ?? "{}") as {
      messages: { content: { type: string; text?: string }[] }[];
    };
    expect(sent.messages[0]?.content).toHaveLength(1);
    expect(sent.messages[0]?.content[0]?.text).toContain(DESCRIPTION);
  });

  it("retries once with the validation errors and returns the fixed figure", async () => {
    const calls: Call[] = [];
    const figure = await describeWith([invalidLayout, layout], calls);
    expect(calls).toHaveLength(ATTEMPTS);
    expect(calls[1]?.body).toContain("Your last layout was rejected");
    expect(calls[1]?.body).toContain("ghost");
    expect(validateFigure(figure)).toMatchObject({ ok: true });
  });

  it("gives up after two attempts with a LayoutError carrying the details", async () => {
    const calls: Call[] = [];
    const error = await describeWith([invalidLayout], calls).catch(
      (caught: unknown) => caught,
    );
    expect(calls).toHaveLength(ATTEMPTS);
    expect(error).toBeInstanceOf(LayoutError);
    expect(error).toMatchObject({
      kind: "invalid",
      details: [expect.stringContaining("ghost")],
    });
  });
});

describe("namedPoints", () => {
  it.each([
    [REFLECTION_DESCRIPTION, ["A", "B", "C", "M", "N"]],
    [ROTATION_DESCRIPTION, ["A", "B", "C", "O"]],
    ["Translate square PQRS so P moves to T.", ["P", "Q", "R", "S", "T"]],
    ["Points P1P2P3 and A′B′C′.", ["P1", "P2", "P3", "A′", "B′", "C′"]],
  ])("reads the point letters in %j", (description, expected) => {
    expect([...namedPoints(description)].sort()).toEqual([...expected].sort());
  });
});

describe("withoutDrawnImages", () => {
  const pointIds = (figure: Figure): string[] =>
    figure.points.map((entry) => entry.id);
  const polygonIds = (figure: Figure): string[] =>
    figure.polygons.map((entry) => entry.id);

  it.each([
    ["ApBpCp", REFLECTION_WRITE_WITH_PRIMED_IMAGE, ["Ap", "Bp", "Cp"]],
    ["P1P2P3", REFLECTION_WRITE_WITH_NUMBERED_IMAGE, ["P1", "P2", "P3"]],
  ])(
    "drops the drawn reflection image %s and its now-unused points",
    (_, figure, imagePoints) => {
      const cleaned = withoutDrawnImages(figure, REFLECTION_DESCRIPTION);
      expect(polygonIds(cleaned)).toEqual(["abc"]);
      expect(pointIds(cleaned)).toEqual(
        pointIds(figure).filter((id) => !imagePoints.includes(id)),
      );
      expect(validateFigure(cleaned)).toMatchObject({ ok: true });
    },
  );

  it("keeps image points that something else still uses", () => {
    const joined: Figure = {
      ...REFLECTION_WRITE_WITH_PRIMED_IMAGE,
      segments: [{ id: "sApBp", from: "Ap", to: "Bp", confidence: 1 }],
    };
    const cleaned = withoutDrawnImages(joined, REFLECTION_DESCRIPTION);
    expect(polygonIds(cleaned)).toEqual(["abc"]);
    expect(pointIds(cleaned)).toEqual(["A", "B", "C", "M", "N", "Ap", "Bp"]);
  });

  it("drops a second polygon away from the landing spot whose letters the description never names", () => {
    const cleaned = withoutDrawnImages(ROTATION_WRITE_WITH_MISPLACED_IMAGE, ROTATION_DESCRIPTION);
    expect(polygonIds(cleaned)).toEqual(["abc"]);
    expect(pointIds(cleaned)).toEqual(["O", "A", "B", "C"]);
    expect(validateFigure(cleaned)).toMatchObject({ ok: true });
  });

  it("keeps a second polygon away from the landing spot when the description names all its letters", () => {
    const description = `${ROTATION_DESCRIPTION} A second triangle P1P2P3 sits above O.`;
    expect(withoutDrawnImages(ROTATION_WRITE_WITH_MISPLACED_IMAGE, description)).toEqual(
      ROTATION_WRITE_WITH_MISPLACED_IMAGE,
    );
  });

  it("leaves a figure with no transformation alone", () => {
    const plain: Figure = {
      ...REFLECTION_WRITE_WITH_PRIMED_IMAGE,
      transformations: [],
      focus: null,
    };
    expect(withoutDrawnImages(plain, DESCRIPTION)).toEqual(plain);
  });

  it("drops the image from a written layout before returning it", async () => {
    const reflection: ModelFigure = {
      ...layout,
      points: [
        point("A", 200, 300),
        point("B", 180, 700),
        point("C", 430, 550),
        point("M", 550, 100),
        point("N", 550, 900),
        point("Ap", 900, 300),
        point("Bp", 920, 700),
        point("Cp", 670, 550),
      ],
      segments: [],
      polygons: [
        { id: "abc", vertices: ["A", "B", "C"], confidence: 1 },
        { id: "img", vertices: ["Ap", "Bp", "Cp"], confidence: 1 },
      ],
      marks: [],
      lines: [{ id: "lMN", from: "M", to: "N", confidence: 1 }],
      transformations: [
        {
          id: "t1",
          kind: "reflect",
          mirror: ["M", "N"],
          polygon: "abc",
          confidence: 1,
        },
      ],
      focus: { kind: "transform", transformation: "t1" },
    };
    const figure = await describeWith([reflection]);
    expect(polygonIds(figure)).toEqual(["abc"]);
    expect(pointIds(figure)).toEqual(["A", "B", "C", "M", "N"]);
  });
});
