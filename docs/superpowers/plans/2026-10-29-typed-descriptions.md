# Typed Descriptions (Physics) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher types a physics setup ("a ball rolls down a ramp into five dominoes"), and Muse Spark lays it out as a scene. The app draws it in the board's hand-drawn style, and the lesson continues through the normal check, predict and play steps.

**Architecture:**
- A new `/api/describe` route sends the text to the model. It uses the reader's existing JSON schema and a layout prompt, then converts the result with the existing `toScene` on a fixed 3:2 grid.
- If validation fails, it retries once with the errors added to the request.
- The browser draws the returned scene with the existing `sketchScene`, renders that SVG to a PNG, and uses the PNG in place of the photo. The check screen and presenter need no changes.

**Tech Stack:** TypeScript strict, Vite, Vitest, zod, Matter.js, and Muse Spark through the existing `requestModelJson`.

**Spec:** `docs/superpowers/specs/2026-10-29-subjects-design.md` (section "Typed descriptions"). This is plan 1 of 3; ecosystem and geometry get their own plans. The subject registry and the `Lesson` union from the spec's work step 1 move into the ecosystem plan, where a second subject first needs them. Building them here would be a one-option picker.

## Global Constraints

- **Code style:** TypeScript strict. Use `type`, not `interface`. Small pure functions. No `// TODO:` comments. Colocated `*.spec.ts`, written before the code.
- **Commits:** none without the user's approval. Make the checkbox "Commit" steps as local commits on branch `trial-combined` only once the user has said yes. Use Conventional Commits with no AI attribution.
- **Model calls and keys:** paid model calls only in Task 5, within a $2 budget. Keys come from `.env` and are never printed.
- **Scratch files and servers:** never use `/tmp`. Stop any dev server you start.
- **Quality gate:** `npm run check` passes (lint, typecheck and tests) at the end of every task.
- **Typed descriptions skip nothing:** a generated scene goes through the same check screen as a photo reading, and the teacher must approve it.

## Review Focus

1. Empty, whitespace-only or very long text (over 600 characters) is refused with a plain message before any model call.
2. A description that isn't physics, such as "a frog eating flies", or that gives a scene with nothing that can move, is refused with "Nothing in that description can move. Describe objects such as balls, ramps, blocks or dominoes." It must not reach the check screen.
3. If the model's first layout fails validation, it retries exactly once with the errors. A second failure returns 502 with the validation errors.
4. After an error, "Try again" re-sends the same text, and "Start over" brings back the capture screen with the description still filled in.
5. Generated positions outside the board are clamped by `toScene` and are never refused. The test pins one item at grid x 1200.

---

### Task 1: The layout prompt and the model call

**Files:**
- Create: `server/sceneWriter.ts`, `server/sceneWriter.spec.ts`

**Interfaces:**
- Consumes:
  - `requestModelJson`, `MODEL_SCENE_SCHEMA`, `toScene`, `ProviderWithKey`, `CallOptions` and `ModelScene` from `server/sceneReader.ts`
  - `validateScene` from `src/scene/schema.ts`
- Produces:
  - `export const DESCRIPTION_LIMIT = 600`
  - `export const WRITER_SIZE = { width: 1500, height: 1000 }`, the pretend photo size. Through `drawingSize` it gives a 1200 × 800 drawing.
  - `export const writerPrompt = (description: string, errors: readonly string[]): string`
  - `export const describeSceneWithModel = (description: string, provider: ProviderWithKey, options: CallOptions): Promise<unknown>`. It returns the validated `Scene`, or throws `LayoutError`.
  - `export class LayoutError extends Error { readonly kind: 'invalid' | 'nothing-moves'; readonly details: string[] }`. A class, matching `ModelCallError` in `sceneReader.ts`. For `'invalid'`, the message is "The layout failed validation." and `details` holds the validation errors. For `'nothing-moves'`, the message is the Review Focus 2 text.

**What `writerPrompt` must say.** Reuse the item kinds and the legend wording from `READER_PROMPT`. Extract the shared item-kind paragraph into an exported constant `ITEM_KINDS` in `sceneReader.ts` rather than copying it. The prompt must also say:
- "Lay this setup out as a teacher would draw it on a whiteboard 3 units wide by 2 tall, on the same 0-1000 grid."
- "Put a floor along the bottom unless the description says otherwise."
- "Rest everything on a surface."
- "Space dominoes about half their height apart so each one can knock the next over."
- "Keep every item on the board."
- "Add one predict point."
- "When the description gives a weight or says one thing is heavier, write its mass as a label such as 2 kg attached to that item." (Masses reach the scene through labels, via `writtenMass`.)
- "Use the words of the description as labels only when the teacher would write them on the board."

When `errors` is non-empty, add "Your last layout was rejected for these reasons; fix them:" followed by one line per error.

- [ ] **Step 1: Write the failing tests** in `server/sceneWriter.spec.ts`. Use the `fakeFetch` and `completion` helpers pattern from `server/sceneReader.spec.ts` (copy the two small helpers):
  - `it('sends the description as text with no image')`: the request body has one user message whose `content` has exactly one part of type `text`, and that text contains the description.
  - `it('returns a valid 1200 by 800 scene')`: given a model reply of a floor, a ramp, a ball and 3 dominoes, the result passes `validateScene`, and `drawing` equals `{ width: 1200, height: 800 }`.
  - `it('clamps an item placed off the board')`: given a ball at grid x 1200, the result's ball `x` is ≤ 1200.
  - `it('retries once with the validation errors when the first layout is invalid')`: the fake returns an invalid reply, then a valid one. Two calls are made, the second prompt contains "Your last layout was rejected" and the first error, and the result is valid.
  - `it('gives up after the second invalid layout')`: rejects with a `LayoutError` of kind `'invalid'`, with `details` non-empty and exactly 2 calls made.
  - `it('refuses a scene where nothing can move')`: the fake returns only a floor and a wall. It rejects with a `LayoutError` of kind `'nothing-moves'`, after one call.
- [ ] **Step 2: Run** `npx vitest run server/sceneWriter.spec.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** in `server/sceneWriter.ts`:
  - `writerPrompt`, `describeSceneWithModel`, and the `ITEM_KINDS` extraction in `sceneReader.ts`. `READER_PROMPT` must be byte-for-byte unchanged, and `server/sceneReader.spec.ts` must still pass.
  - Movable kinds are `ball`, `block`, `domino`, `cart` and `lever`. Check for them after validation.
  - The retry here is the layout retry. It's separate from `requestModelJson`'s network retry, and both share `options.timeoutMs` as one deadline: pass the remaining time to the second call.
- [ ] **Step 4: Run** `npx vitest run server/sceneWriter.spec.ts server/sceneReader.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: lay out physics scenes from a typed description`

### Task 2: The `/api/describe` route, stub and deploy

**Files:**
- Create: `server/describe.ts`, `server/describe.spec.ts`, and `src/capture/description.ts` with `src/capture/description.spec.ts`, which holds `checkDescription` so the client can use it too
- Modify:
  - `server/stub.ts`: add `handleDescribe`
  - `server/stub.spec.ts`
  - `server/plugin.ts`: route, and `describe` on `modelFrom`
  - `server/plugin.spec.ts`
  - `scripts/build-vercel.mjs`: `ROUTES` gains `'describe'`

**Interfaces:**
- Consumes: from Task 1, `describeSceneWithModel` and `DESCRIPTION_LIMIT`.
- Produces:
  - `POST /api/describe` with JSON body `{ text: string }`.
  - On success, 200 with `{ stub: boolean, reader?: string, scene: Scene }`.
  - On failure, `{ error, details }` with status 400 (bad text), 422 (nothing can move) or 502 (model or validation failure).
  - The access-code check works exactly as on the other routes.
  - `export const handleDescribeWithModel = (request: { text: unknown; reader: string; describe: (text: string) => Promise<unknown> }): Promise<StubResponse>`
  - `export const handleDescribe = (request: Timing & { text: unknown }): Promise<StubResponse>`. In `ok` mode, the stub returns `rampBallDominoes`. Its `error`, `timeout` and `invalid` modes behave as in `handleUnderstand`.
  - `export const checkDescription = (text: unknown): { ok: true; text: string } | { ok: false; error: string }`. It trims the text, then refuses non-strings, empty text with "Type a description of the setup first.", and text over 600 characters with "Keep the description under 600 characters."

- [ ] **Step 1: Write the failing tests.**
  - In `src/capture/description.spec.ts`: `checkDescription` is parameterised over `['', '   ', 'x'.repeat(601), 42, null]`, all refused with the messages above, and `'  a ball  '` gives `'a ball'`.
  - In `describe.spec.ts`: the model handler maps a `LayoutError` of kind `'nothing-moves'` to 422 and kind `'invalid'` to 502 with its `details`. Any other thrown error maps to 502 "The scene writer failed: {message}".
  - In `plugin.spec.ts`:
    - `it('describes with the stub when no reader is set')`: POST `/api/describe` with `{ text: 'a ball rolls into dominoes' }` returns 200 with a scene.
    - `it('turns away a describe request without the code')`: 401.
  - In `stub.spec.ts`: an empty text returns 400 before the stub's delay.
- [ ] **Step 2: Run** `npx vitest run server/`. Expected: FAIL.
- [ ] **Step 3: Implement** the handlers and the route. In `modelFrom`, add `describe: (text) => describeSceneWithModel(text, provider, options)`. In `apiMiddleware`, parse the body with the existing `parseJson` and read `text`.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS. Also run `npm run build:vercel` and check that it prints `/api/describe` among the routes.
- [ ] **Step 5: Commit** `feat: add a describe route for typed setups`

### Task 3: Turn a scene's sketch into the board image

**Files:**
- Create: `src/capture/sketchImage.ts`, which is DOM wiring with no spec, verified in Task 4's browser check.
- Modify: `src/reading.ts` and `src/reading.spec.ts`, adding `describedNote`.

**Interfaces:**
- Consumes: `sketchScene(scene, seed)` from `src/checks/sketch.ts`.
- Produces:
  - `export const sketchImage = (scene: Scene): Promise<Blob>`. It draws `sketchScene(scene, SKETCH_SEED)` with `SKETCH_SEED = 7`. It loads the SVG into an `Image` from a `data:image/svg+xml` URL, draws it on a canvas of `scene.drawing.width × height`, and returns `canvas.toBlob('image/png')`. If `toBlob` gives `null`, it rejects with "Could not draw the described setup."
  - `export const describedNote = (body: unknown): string`. For a stub body: "Stub layout: a fixed scene for the sample drawing. No AI was called." For a reader body: "Laid out by {reader name} from your description. Check that it matches what you meant." The reader names come from `readingNote`'s `READERS` map; reuse it, don't copy it.

- [ ] **Step 1: Write the failing tests** for `describedNote`: stub body, `reader: 'meta'`, and an unknown reader. The unknown reader gives "Laid out from your description. Check that it matches what you meant."
- [ ] **Step 2: Run** `npx vitest run src/reading.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `describedNote` and `sketchImage`.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: draw described scenes as the board image`

### Task 4: "Describe it instead" on the capture screen

**Files:**
- Modify: `src/ui/capture.ts` and `src/main.ts`. Both are DOM wiring, verified in the browser.
- Modify: `src/styles.css`, appending at the end.
- Create: `src/capture/examples.ts` and `src/capture/examples.spec.ts`.

**Interfaces:**
- Consumes: from Task 2, `/api/describe`. From Task 3, `sketchImage` and `describedNote`.
- Produces:
  - `CaptureHandlers` becomes `{ onPhoto: (photo: Blob) => void; onDescribe: (text: string) => void; description?: string }`. `description` pre-fills the text box.
  - `export const DESCRIPTION_EXAMPLES: readonly string[]` contains exactly these four:
    - "A ball rolls down a ramp and knocks over a row of five dominoes."
    - "A cart rolls down a long ramp and crashes into a wall."
    - "Two blocks hang from a rope over a pulley. The left one is twice as heavy."
    - "A ball is pushed along a high shelf, falls off the end and knocks over three dominoes on the floor."

**Capture screen:**
- A section titled "Or describe it", with a `textarea` (`maxlength` 600, 3 rows) and a primary button "Lay it out".
- Each example is a quiet button that fills the textarea when tapped.
- Submitting empty text shows `checkDescription`'s message in the existing `status` line and makes no request. Use `checkDescription` from `src/capture/description.ts` (Task 2).

**`main.ts`:** add `describeSetup(text)`, mirroring `readDrawing`:
1. `showReading` with the headline changed. Give `showReading` a `headline` parameter that defaults to the current text; for typed descriptions it's "Laying out your description…".
2. POST `/api/describe`, then `validateScene`.
3. `sketchImage(scene)`, then `photoUrl = URL.createObjectURL(blob)` and `photoNote = describedNote(body)`.
4. `session.startDraft`, `showCheck()` and `draftQuestions`. These are unchanged.

Errors use `showError` with retry `() => describeSetup(text)`. Keep `lastDescription` so `showCapture` passes it back as `description` (Review Focus 4).

- [ ] **Step 1: Write the failing test** in `examples.spec.ts`. Every example is at most 600 characters and passes `checkDescription`, and there are exactly 4. (`DESCRIPTION_EXAMPLES` is data; the test protects it against later edits.)
- [ ] **Step 2: Run** `npx vitest run src/capture/`. Expected: FAIL.
- [ ] **Step 3: Implement** the examples, the capture section and `describeSetup`.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Verify in the browser.** Use the built-in preview (`preview_start` with the project's launch config; dev, stub reader) and check:
  - Tapping an example fills the box.
  - "Lay it out" shows "Laying out your description…", then the check screen. The check screen shows the sketched sample scene with the stub note.
  - Approve and present plays it.
  - An empty submit shows the message and makes no network request (check with `read_network_requests`).
  - With stub mode `error`: "Start over" brings back the text.

  Screenshot the check screen. Stop the server.
- [ ] **Step 6: Commit** `feat: let teachers describe a setup instead of photographing it`

### Task 5: Measure live layouts and report them

**Files:**
- Create:
  - `scripts/check-descriptions.mjs`
  - `src/checks/descriptions.ts`
  - `src/checks/descriptions.spec.ts`
- Modify:
  - `package.json`: `"descriptions": "node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/check-descriptions.mjs"`
  - `README.md`

**Interfaces:**
- Consumes:
  - From Task 1, `describeSceneWithModel`.
  - `createSimulation`, `SETTLE_SECONDS` and `STEPS_PER_SECOND` from `src/physics/simulation.ts`.
  - The script loads TS modules with `runnerImport`, as `scripts/check-drawings.mjs` does.
- Produces:
  - `export type DescriptionCase = { text: string; expect: (scene: Scene, fallen: (id: string) => boolean) => string[] }`. `expect` returns a list of problems, empty when the layout played as described.
  - `export const DESCRIPTION_CASES: readonly DescriptionCase[]`: the 4 examples plus one more, "Three dominoes stand in a row with a ball rolling toward them from the left."
  - `export const scoreLayout = (scene: Scene, testCase: DescriptionCase): string[]`. It runs the simulation for `SETTLE_SECONDS` and applies `expect`.

**What each case expects:**
- **Dominoes:** every domino in the scene has fallen, and there are as many as the text says.
- **Cart:** the cart touches the wall. Use the `contact` trigger with `runUntil`.
- **Pulley:** the heavier block ends lower than it started.
- **Shelf:** every domino has fallen. (Seesaws are left out: the reader cannot yet pin a lever to its pivot.)

- [ ] **Step 1: Write the failing tests** in `descriptions.spec.ts`. These run without the model:
  - `scoreLayout` on the `long-ride` sample scene with a dominoes case returns `[]`.
  - The same sample, with one domino moved 300 units away, returns one problem naming that domino. This is the negative control.
- [ ] **Step 2: Run** `npx vitest run src/checks/descriptions.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `descriptions.ts` and the script. The script:
  - runs each case `--runs N` times (default 2) with the `meta` reader;
  - prints a per-case pass count and cost (via `costOf`);
  - saves raw layouts under `check-runs/`, which git already ignores;
  - stops if the total cost would pass $2.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Run live** with `npm run descriptions -- --runs 2`. This makes paid calls, about 10. Record the exact pass counts and the cost.
- [ ] **Step 6: Update the README** with what was measured only. Use this sentence, with the numbers filled in: "Typed descriptions: Muse Spark's layouts played as described N of M times when last checked (`npm run descriptions`)." Add one line for each case that failed, saying how it failed.
- [ ] **Step 7: Commit** `test: measure typed-description layouts against the simulation`
