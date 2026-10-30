# Ecosystems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher picks Ecosystem, photographs or types a food web, checks the reading and the event, and presents it: populations play out, the class predicts the knock-on effect, and students remove species and replay.

**Architecture:** Ecosystem is a self-contained module under `src/ecosystem/` (zod schema, pure population model, sketch, questions, playback). The session's `Lesson` becomes a union tagged by `subject`. Physics types and screens stay as they are; they are narrowed to the physics branch. The server takes a `subject` on each route, and ecosystem gets its own reader, writer and drafter files next to the physics ones.

**Tech Stack:** TypeScript strict, zod 4, Vite 8, Vitest 5, canvas 2D. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-subjects-design.md`. Read its sections "Ecosystem" and "Decisions after review".

## Global Constraints

- TypeScript strict. Prefer `type`. Small pure functions. No `// TODO:` comments.
- TDD with colocated `*.spec.ts`. Strong assertions, and no unexplained literals: name them as constants.
- Physics behaves exactly as on `trial-combined` at `f56f624`. `npm run check` passes after every task, and no existing physics spec is edited except where a task names the change (the `Lesson` union in Task 5).
- Commit only with the user's approval. Otherwise, checkpoint with `git add -A && git write-tree` and record the tree id in the ledger. Commits use Conventional Commits with no AI attribution.
- Never use `/tmp`. Kill any dev server you start. Never print or copy keys. Live runs use `node --env-file=/Users/adamrowe/Projects/board-to-life/.env …`.
- The UI calls population numbers "a model" and never presents them as field data.
- Arrows run from the eaten to the eater, are read as drawn, and are never corrected silently.
- Students' replays use questions built from templates. There is no model call in front of the class.
- Ecosystem drawings use the same 0–1000 reader grid and `drawingSize` as physics.

## Review Focus

1. **A web with a cycle** (A eats B and B eats A, or a species eats itself). Trophic levels must terminate and the model must stay finite. Test in Task 1.
2. **Removing the only producer.** Every consumer reads "died out", never `NaN` or "steady". Test in Task 2.
3. **Written counts of 0 or 100 000.** The model stays finite, and the chart and rings scale without overflow. Tests in Tasks 2 and 10.
4. **A species with no arrows at all.** It validates, holds steady, and is listed on the check screen. Tests in Tasks 1 and 2.
5. **Students remove every species and replay.** The run completes with all series at zero, and no question is asked about a removed species. Test in Task 10.

---

### Task 1: Web schema, validation and trophic levels

**Files:**
- Create: `src/ecosystem/schema.ts`, `src/ecosystem/trophic.ts`
- Test: `src/ecosystem/schema.spec.ts`, `src/ecosystem/trophic.spec.ts`

**Interfaces:**
- Produces:
  - `ROLES = ['producer','consumer','decomposer'] as const`; `type Role`.
  - `type Species = { id: string; name: string; role: Role; x: number; y: number; width: number; height: number; count?: number; confidence: number }`.
  - `type Eats = { id: string; from: string; to: string; confidence: number }` (`from` is eaten by `to`).
  - `type WebEvent = { kind: 'remove'; species: string } | { kind: 'drought' }`.
  - `type Web = { version: 1; drawing: { width: number; height: number }; species: Species[]; eats: Eats[]; labels: { id; text; x; y; confidence }[]; unknownMarks: { id; note; x; y; width; height; confidence }[]; event: WebEvent | null }`. The label and mark shapes match physics.
  - `validateWeb(input: unknown): { ok: true; web: Web } | { ok: false; errors: string[] }`.
  - `trophicLevels(web: Web): Map<string, number>`.
  - `backwardArrows(web: Web): string[]` (ids of eats).
  - `flipArrow(web: Web, eatsId: string): Web`.
  - `suggestedEvent(web: Web): WebEvent`.

- [ ] **Step 1: Write failing tests.**
  - `validateWeb` accepts a grassland web (grass, rabbit, fox, hawk). It rejects each of these with a message naming the id: a duplicate id; eats from or to a missing species; an event removing a missing species; a web with no producer ("The web needs at least one producer, such as a plant."); and `count < 0`.
  - `trophicLevels` returns these levels: producers 1, rabbit 2, fox 3. An omnivore that eats grass and rabbit gets 3, the longest path. A decomposer gets 0. A species with no arrows gets 1 if it is a producer, otherwise 2. A cycle (rabbit eats fox and fox eats rabbit) returns finite levels and terminates.
  - `backwardArrows` flags an arrow into a producer (rabbit → grass). It flags `fox → rabbit` when grass → rabbit exists and fox has no incoming arrow. It does not flag an omnivore's two arrows. It does not flag arrows into a decomposer.
  - `flipArrow` swaps `from` and `to` of only that id and leaves the input unchanged.
  - `suggestedEvent` returns `web.event` when one is present. Otherwise it removes the consumer with the highest level, with ties going to the first in `species` order. A web with only producers gets `{ kind: 'drought' }`.
- [ ] **Step 2:** Run `npx vitest run src/ecosystem`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.**
  - Write zod schemas like `src/scene/schema.ts`, with `version: z.literal(1)`, and do the referential checks in `validateWeb`.
  - Levels are the longest path from any producer over arrows that are not backward. Cap the path length at the species count so cycles end.
  - Backward rule:
    - an arrow whose `to` is a producer; or
    - an arrow whose `from` is a consumer with no incoming non-backward arrow, while `to` is a consumer that does have one.
- [ ] **Step 4:** Run `npx vitest run src/ecosystem && npm run check`. Expected: PASS.
- [ ] **Step 5:** Checkpoint `feat(ecosystem): add the food web schema and trophic levels`.

### Task 2: Population model and directions of change

**Files:**
- Create: `src/ecosystem/model.ts`, `src/ecosystem/outcomes.ts`
- Test: `src/ecosystem/model.spec.ts`, `src/ecosystem/outcomes.spec.ts`

**Interfaces:**
- Consumes: `Web`, `WebEvent`, `trophicLevels` (Task 1).
- Produces:
  - `MODEL_STEPS = 600`, `EVENT_STEP = 150`, `STEPS_PER_SECOND_SHOWN = 60` (a 10 s run with the event at 2.5 s).
  - `type Rates = { growth: number; capacity: number; attack: number; handling: number; efficiency: number; death: number }`.
  - `ratesFor(web: Web, overrides?: Record<string, Partial<Rates>>): Map<string, Rates>`.
  - `startingPopulations(web: Web): Record<string, number>`.
  - `type Run = { steps: number; event: WebEvent | null; eventStep: number; removed: ReadonlySet<string>; start?: Record<string, number> }`.
  - `type Series = { ids: string[]; values: Record<string, number[]> }` (length `steps + 1`).
  - `simulate(web: Web, run: Run, overrides?): Series`.
  - `type Direction = 'rose' | 'fell' | 'steady' | 'died out'`.
  - `directionsAfter(series: Series, eventStep: number): Record<string, Direction>`.
  - `CHANGE_THRESHOLD = 0.1`, `EXTINCT_FRACTION = 0.01`.

- [ ] **Step 1: Write failing tests.**
  - With no event, every grassland species stays within `CHANGE_THRESHOLD` of its start for `MODEL_STEPS` (a steady state holds).
  - Every value is finite and ≥ 0 for these webs: the cycle web from Task 1, counts of 0 and 100 000, and a web with an isolated consumer.
  - Removing the only producer gives `died out` for every consumer.
  - Removing a species sets its series to 0 from `eventStep` on.
  - Removing a species listed in `run.removed` sets it to 0 from step 0.
  - Drought ends producers lower than the same run without drought.
  - In `startingPopulations`, a written `count` wins. Without one, the value is the level after a warm-up run, the same value the steady test checks.
  - In `directionsAfter`: ±`CHANGE_THRESHOLD` of the value at `eventStep` is `steady`; a final mean below `EXTINCT_FRACTION` of it is `died out`; above or below the band is `rose` or `fell`. The final mean is the mean of the last 100 steps.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Use a discrete Euler step of `dt = 0.05`.
  - Producers grow logistically: `growth·N·(1 − N/capacity)`, minus what they lose to grazing.
  - Consumers gain `efficiency·Σ attack·Nprey / (1 + attack·handling·ΣNprey)` (Holling II), minus `death·N`.
  - Decomposers gain from that step's total deaths and have their own death rate.
  - Drought halves producer `growth` from `eventStep`.
  - Default rates come from role and level. The values are left to you, but they must pass the steady-state test above and Task 3's pins.
- [ ] **Step 4:** Run `npx vitest run src/ecosystem && npm run check`. Expected: PASS.
- [ ] **Step 5:** Checkpoint `feat(ecosystem): add the population model`.

### Task 3: Sample webs and the tuning bar

**Files:**
- Create: `src/ecosystem/samples.ts`
- Test: `src/ecosystem/samples.spec.ts`
- Modify: `src/ecosystem/model.ts`, for rates only if the pins demand it.

**Interfaces:**
- Produces:
  - `type WebSample = { id: string; title: string; web: Web; overrides?: Record<string, Partial<Rates>>; expect: { event: Record<string, Direction>; topPredator: Record<string, Direction> } }`.
  - `WEB_SAMPLES: readonly WebSample[]`.
  - `webSampleUrl(id) => /samples/web-${id}.png`.

Positions are on a 1200 × 800 drawing. Arrows run from the eaten to the eater. In the tables, "either" marks directions that ecology does not settle. For those, pin the run's direction and explain why in the test name.

| id | Species (role) | Eats | Event | Expected after event | Top predator removed |
| --- | --- | --- | --- | --- | --- |
| `grassland` | grass (P), rabbit, fox, hawk | grass→rabbit, rabbit→fox, rabbit→hawk | remove fox | rabbit rose, grass fell, hawk rose | hawk: rabbit rose, grass fell, fox rose |
| `ocean` | kelp (P), urchin, sea otter | kelp→urchin, urchin→otter | remove otter | urchin rose, kelp fell | same run, so one pin |
| `pond` | algae (P), water flea, minnow, duck, heron | algae→flea, flea→minnow, algae→duck, flea→duck, minnow→heron, duck→heron | remove heron | minnow rose, duck rose, flea fell, algae either | heron, so one pin |
| `forest` | oak (P), caterpillar, deer, songbird, wolf, fungi (D) | oak→caterpillar, oak→deer, caterpillar→songbird, deer→wolf | remove songbird | caterpillar rose, oak fell, deer fell, wolf fell, fungi either | wolf: deer rose, oak fell, caterpillar fell, songbird fell, fungi either |
| `grassland-messy` | as grassland, but rabbit is named "rabit" and a wrong arrow is crossed out (an `unknownMarks` entry) | as grassland | remove fox | as grassland | as grassland |

- [ ] **Step 1: Write failing tests.** Use `it.each` over `WEB_SAMPLES`:
  - Each sample validates.
  - Each sample holds steady with no event.
  - `directionsAfter(simulate(...event))` equals `expect.event`.
  - The removal from `suggestedEvent` (with `web.event` cleared) equals `expect.topPredator`.
  - There is one test for each `overrides` entry, and its name says why the override is needed.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Write the samples, then tune the default rates in `model.ts` until every pin passes. Prefer changing defaults to adding overrides.
- [ ] **Step 4:** Run `npm run check`. Expected: PASS.
- [ ] **Step 5:** Checkpoint `feat(ecosystem): add sample food webs pinned to their outcomes`.

### Task 4: Hand-drawn web sketch and sample images

**Files:**
- Create: `src/checks/ink.ts` (the wobble primitives moved out of `sketch.ts`), `src/ecosystem/sketch.ts`
- Modify: `src/checks/sketch.ts` (import from `ink.ts`), `scripts/draw-samples.mjs`
- Test: `src/checks/ink.spec.ts`, `src/ecosystem/sketch.spec.ts`
- Generate: `public/samples/web-*.png`

**Interfaces:**
- Produces:
  - `sketchWeb(web: Web, seed: number): string` (SVG with `viewBox` matching `web.drawing`).
  - `ink.ts` exports `seededJitter`, `wobblyLine`, `wobblyCircle`, `wobblyPolygon`, `stroke`, `escapeText`, `towards`, and the colour constants.

- [ ] **Step 1: Write failing tests.**
  - Before moving anything, record `sketchScene(rampBallDominoes, SKETCH_SEED)` and assert the refactored output is byte-identical.
  - `sketchWeb`:
    - writes each species `name` as text;
    - draws one arrowhead path per `eats`, ending at the eater's box edge;
    - draws a scribble per `unknownMarks` entry;
    - is deterministic for a given seed and differs between seeds.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Move the primitives to `ink.ts` without changing them.
  - `sketchWeb` writes names in marker handwriting style, using the existing font stack in `sketch.ts` labels. It draws a wobbly box round each name, and wobbly arrows from box edge to box edge.
  - Extend `draw-samples.mjs` to draw `WEB_SAMPLES` with `sketchWeb` at seed `SEED_BASE + 100 + index`.
- [ ] **Step 4:** Run `npm run samples:draw`. Then open two of the PNGs and confirm by eye that the arrows point to the eater. Run `npm run check`.
- [ ] **Step 5:** Checkpoint `feat(ecosystem): draw sample food webs by hand`.

### Task 5: Subject registry and the Lesson union

**Files:**
- Create: `src/subjects.ts`
- Modify:
  - `src/session/store.ts`
  - `src/ui/check.ts`, `src/ui/present.ts`, `src/present/playback.ts` (narrow to physics only)
  - `src/main.ts`
- Test: `src/subjects.spec.ts`, `src/session/store.spec.ts`

**Interfaces:**
- Produces:
  - `SUBJECTS = ['physics','ecosystem'] as const`; `type Subject`.
  - `parseSubject(value: unknown): Subject | null`. Missing gives `'physics'`; an unknown string gives `null`.
  - `SUBJECT_LABELS: Record<Subject, string>`, with the values "Physics" and "Ecosystem".
  - Lesson types:
    - `type PhysicsLesson = { subject: 'physics'; scene: Scene; questions: PredictQuestion[] }`
    - `type EcosystemLesson = { subject: 'ecosystem'; web: Web; questions: WebQuestion[] }`
    - `type Lesson = PhysicsLesson | EcosystemLesson`
  - `type DraftContent = { subject: 'physics'; scene: Scene } | { subject: 'ecosystem'; web: Web }`.
  - `Session.startDraft(content: DraftContent): number`.
  - `Session.setDraftQuestions(id, questions: Lesson['questions']): boolean`. It returns false if the subject's question type doesn't match.
  - `draft()` and `presentable()` return the union with `status`.
  - `WebQuestion` is created in Task 7. In this task, declare it in `src/ecosystem/questions.ts` as its final type: `{ id; prompt; choices: string[]; observe: { kind: 'direction'; species: string }; explanation; cites: string[] }`.

Geometry joins in plan 3. Leave it out of `SUBJECTS` until then.

- [ ] **Step 1: Write failing tests.**
  - `parseSubject` cases: `undefined → 'physics'`, `'ecosystem'`, `'geometry' → null` (for now), `42 → null`.
  - Existing store specs are updated to `startDraft({ subject: 'physics', scene })`.
  - A new spec: an ecosystem draft approves to an `EcosystemLesson`.
  - A new spec: `startDraft` with a new web after questions arrive clears the questions and makes the old `draftId` stale. This is how changing the event re-drafts.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Narrow the physics screens with `lesson.subject === 'physics'` at their entry points, and take `PhysicsLesson`. `main.ts` passes `{ subject: 'physics', scene }`.
- [ ] **Step 4:** Run `npm run check`. Expected: PASS, with all physics specs green and no other physics edits.
- [ ] **Step 5:** Checkpoint `refactor: tag lessons by subject`.

### Task 6: Server reading and writing for food webs

**Files:**
- Create: `server/webReader.ts`, `server/webWriter.ts`
- Modify:
  - `server/understand.ts`, `server/describe.ts`
  - `server/stub.ts`, `server/plugin.ts`
- Test: `server/webReader.spec.ts`, `server/webWriter.spec.ts`, and the existing handler and stub specs

**Interfaces:**
- Consumes: `validateWeb`, `WEB_SAMPLES`, `parseSubject`, `requestModelJson`, `drawingSize`, `WRITER_SIZE`, `LayoutError`.
- Produces:
  - `MODEL_WEB_SCHEMA`, `WEB_READER_PROMPT`.
  - `toWeb(model: ModelWeb, photo: ImageSize): unknown`.
  - `readWebWithModel(photo, provider, options): Promise<unknown>`.
  - `webWriterPrompt(description, errors)`.
  - `describeWebWithModel(text, provider, options): Promise<unknown>`: two attempts within one deadline, then `LayoutError('invalid', …)`.
  - Routes:
    - `/api/understand?subject=ecosystem` → `{ stub, reader?, web }`.
    - `/api/describe` body `{ text, subject }` → `{ …, web }`.
    - A missing `subject` keeps the physics behaviour byte-for-byte.
    - An unknown subject → 400 "Pick a subject: Physics or Ecosystem."
  - The stub returns `WEB_SAMPLES[0].web` for ecosystem, and supports the `invalid` mode.

- [ ] **Step 1: Write failing tests.**
  - `WEB_READER_PROMPT` contains each of these sentences:
    - "Draw each arrow from the thing eaten to the thing that eats it: grass → rabbit means the rabbit eats the grass."
    - "Read every arrow the way it is drawn, even if it looks backwards; never reverse one."
    - "If an arrowhead is unclear, give that arrow a confidence below 0.7."
    - "If a species is crossed out, or the board says something like drought or remove foxes, report it as the event."
    - "Write each name exactly as it is spelled on the board."
  - `toWeb` scales grid boxes to `drawingSize`, drops an event that names a missing species, and keeps a written `count`.
  - `webWriterPrompt` includes the description and asks to "use what you know about who eats whom". It lists the retry errors as in `writerPrompt`.
  - `describeWebWithModel` retries once on validation errors and gives up after two attempts. Use the fake-fetch pattern from `server/sceneWriter.spec.ts`.
  - Handler specs:
    - a subject query routes to the web reader;
    - a missing subject still returns `scene`;
    - an unknown subject gives 400.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Mirror `sceneReader` and `sceneWriter`. In `plugin.ts`, `modelFrom` gains `readWeb` and `describeWeb`. Read the subject from the query for `/api/understand` and from the JSON body for `/api/describe`.
- [ ] **Step 4:** Run `npm run check`. Expected: PASS.
- [ ] **Step 5:** Checkpoint `feat(ecosystem): read and lay out food webs on the server`.

### Task 7: Ecosystem predict questions

**Files:**
- Create: `src/ecosystem/questions.ts` (filling in Task 5's type), `server/webDrafter.ts`
- Modify: `server/draft.ts`, `server/stub.ts`, `server/plugin.ts`
- Test: `src/ecosystem/questions.spec.ts`, `server/webDrafter.spec.ts`, `server/draft.spec.ts`

**Interfaces:**
- Produces:
  - `WEB_CHOICES = ['Rises', 'Falls', 'Stays about the same', 'Dies out']`.
  - `CHOICE_FOR: Record<Direction, string>`.
  - `checkWebGrounding(input: unknown, web: Web): { ok: true; questions: WebQuestion[] } | { ok: false; errors: string[] }`.
  - `describeEvent(web, event): string`, for example "The foxes are removed." or "A drought hits."
  - `templateQuestion(web: Web, event: WebEvent, observe: string): WebQuestion`, for example "Foxes are removed. What happens to the grass?" Its explanation is filled from the run.
  - `webDraftPrompt(web, directions)`.
  - `draftWebQuestionsWithModel(web, provider, options): Promise<WebQuestion[]>`, which drafts one question.
  - `/api/draft-questions` body `{ subject: 'ecosystem', web }` → `{ questions }`.

- [ ] **Step 1: Write failing tests.**
  - Grounding rejects a cite or observe of a missing species, and an observe of the removed species.
  - `templateQuestion` names the event and the observed species by `name`, and its `choices` equal `WEB_CHOICES`.
  - The prompt:
    - contains each species' direction as "rabbit: rose";
    - says "This is a simple model, not field data";
    - asks for the species "whose change best shows the knock-on effect, usually two links from the removed one".
  - The schema enum for `observe` excludes the removed species.
  - The draft route returns 422 "Nothing in the web changes after the event, so there is nothing to predict." when every direction is `steady`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement, mirroring `questionDrafter.ts` and `draft.ts`.
- [ ] **Step 4:** Run `npm run check`. Expected: PASS.
- [ ] **Step 5:** Checkpoint `feat(ecosystem): draft predict questions from the model run`.

### Task 8: Subject picker on capture, and wiring in main

**Files:**
- Modify:
  - `src/ui/capture.ts`, `src/capture/examples.ts`
  - `src/capture/sketchImage.ts`, `src/main.ts`, `src/reading.ts`
  - `src/styles.css`
- Test: `src/capture/examples.spec.ts`, `src/reading.spec.ts`, and a `sketchImage` spec if one exists

**Interfaces:**
- Produces:
  - `CaptureHandlers` gains `subject: Subject` and `onSubject(subject)`, and `onPhoto` and `onDescribe` take the subject.
  - `DESCRIPTION_EXAMPLES: Record<Subject, readonly string[]>`. Ecosystem has 3, including "grass, rabbits, foxes and hawks".
  - The capture screen shows samples for the picked subject only.
  - `sketchImage(content: DraftContent)` draws a web with `sketchWeb`.
  - `readingNote` and `describedNote` say "food web" for ecosystem.

- [ ] **Step 1: Write failing tests.**
  - Each subject has at least 3 examples, and each is within `DESCRIPTION_LIMIT`.
  - The ecosystem notes mention "food web".
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The picker is a radio group above the photo actions, labelled "Subject". The choice is kept in `localStorage` (wrapped in try/catch) and in `main.ts` state.
  - In `main.ts`, the read, describe and draft calls send the subject and validate with `validateWeb` for ecosystem. They start a draft with `{ subject: 'ecosystem', web }`. `showCheck` and `showPresent` dispatch on `subject`.
- [ ] **Step 4:** Run `npm run check`. Then check in the browser with the stub (preview config pointed at the worktree):
  - Pick Ecosystem, then pick the grassland sample. The check screen opens (Task 9 replaces the placeholder).
  - Physics samples still read and present.
  - Stop the server.
- [ ] **Step 5:** Checkpoint `feat: pick the subject before reading a drawing`.

Until Task 9 lands, `showCheck` for ecosystem renders a one-line placeholder. Task 9 removes it.

### Task 9: Ecosystem check screen

**Files:**
- Create: `src/ui/checkWeb.ts`, `src/ui/questionCards.ts` (the card and placeholder pieces moved out of `check.ts`)
- Modify: `src/ui/check.ts`, `src/main.ts`, `src/styles.css`, `server/stub.ts` (a `backward` stub mode, also listed in the `#stub-mode` select)
- Test: `src/ui/checkWeb.spec.ts` (pure helpers only), `server/stub.spec.ts`

**Interfaces:**
- Produces:
  - `renderWebCheck(root, session, photoUrl, note, handlers: { onPresent; onRestart; onEvent: (event: WebEvent) => void; onFlip: (eatsId: string) => void }): CheckScreen`.
  - `eventOptions(web: Web): { value: string; label: string; event: WebEvent }[]`. These are "Remove <name>" for each species, plus "Drought".
  - `BACKWARD_NOTE = 'This arrow points from the eater to the eaten. Flip it?'`.

- [ ] **Step 1: Write failing tests.**
  - `eventOptions` lists every species once plus drought, and marks the `suggestedEvent` as the default.
  - Row text for a species with a count: "rabbit · consumer · 40 written".
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Draw an overlay box per species and a line per arrow. A low-confidence arrow is dashed, and a backward arrow is red with `BACKWARD_NOTE` and a "Flip" button.
  - Show the event `<select>` titled "What happens", and the warnings and unknown marks as in physics.
  - The questions panel uses `questionCards.ts`.
  - Selecting an event or flipping an arrow calls the handler. `main.ts` then runs `startDraft` with the changed web and drafts again, so approval always matches the shown event.
  - Show the line "Populations come from a simple model, not field data."
- [ ] **Step 4:** Run `npm run check`. Then in the browser with the stub:
  - Change the event: the questions re-draft.
  - Flip an arrow: add a stub mode `backward` that returns grassland with fox → rabbit reversed.
  - Approve.
  - Confirm the physics check screen is unchanged.
- [ ] **Step 5:** Checkpoint `feat(ecosystem): check the food web and choose the event`.

### Task 10: Ecosystem playback, chart and rings (pure)

**Files:**
- Create: `src/ecosystem/playback.ts`, `src/ecosystem/chart.ts`, `src/ecosystem/edits.ts`
- Test: `src/ecosystem/playback.spec.ts`, `src/ecosystem/chart.spec.ts`, `src/ecosystem/edits.spec.ts`

**Interfaces:**
- Produces:
  - Phases: `type WebPhase = { kind: 'ready' } | { kind: 'steady' } | { kind: 'predict'; question: WebQuestion } | { kind: 'playing' } | { kind: 'done'; result: { question: WebQuestion; direction: Direction } | null }`.
  - `createWebPlayback(lesson: EcosystemLesson): { phase; step; series; previous: Series | null; play; tick(maxSteps); reveal; replay(edits?: WebEdits) }`.
    - Playback pauses at `EVENT_STEP` on the question and finishes at `MODEL_STEPS`.
    - A replay keeps the last run's series as `previous` and uses `templateQuestion`.
  - Edits:
    - `type WebEdits = { removed: ReadonlySet<string>; start: Record<string, number> }`
    - `toggleRemoved(edits, id)`
    - `setStart(edits, id, value)`, clamped to `[0, START_MAX]`, where `START_MAX` = 4 × the steady start.
  - Chart geometry:
    - `chartPaths(series: Series, box: Box, upTo: number): Record<string, string>` (SVG path data, y scaled to the series max, with a minimum of 1).
    - `ringRadius(value: number, start: number): number`, between `RING_MIN` and `RING_MAX`, with √ scaling.
    - `feedingDots(web, step): { from: Point; to: Point; t: number }[]`.

- [ ] **Step 1: Write failing tests.**
  - Phases go ready → steady → predict at exactly `EVENT_STEP`, then reveal → playing → done at `MODEL_STEPS`.
  - `done.result.direction` equals `directionsAfter` for the observed species.
  - A replay with fox restored and rabbit removed asks a template question about a species that is not removed, and sets `previous`.
  - If every species is removed, the replay completes with zero series, and the phase skips `predict` and goes to `done` with no question.
  - `chartPaths` with counts up to 100 000 stays inside the box.
  - `ringRadius(0, s)` = `RING_MIN`, and `ringRadius(huge, s)` = `RING_MAX`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run check`. Expected: PASS.
- [ ] **Step 5:** Checkpoint `feat(ecosystem): add playback, chart and edit logic`.

### Task 11: Ecosystem presenter

**Files:**
- Create: `src/ui/presentWeb.ts`
- Modify: `src/main.ts`, `src/styles.css`

**Interfaces:**
- Consumes: everything from Task 10, `viewOf` and `toDrawing` from `src/present/view.ts`, `TOUCH_REACH_PX` (export it from `present.ts`, or move it to `view.ts`).
- Produces: `renderWebPresent(root, lesson: EcosystemLesson, photoUrl: string | null, onExit): () => void`.

- [ ] **Step 1: Write a failing test** for the one pure helper added here. `pickSpecies(web, view, point, reachPx): string | null` hits a species box within reach and misses outside it. It lives in `src/ecosystem/edits.ts`.
- [ ] **Step 2:** Run the test. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Canvas over the photo:** each species gets a ring sized by `ringRadius`, coloured from a fixed 6-colour palette. Feeding dots run along arrows.
  - **Strip chart:** one line per species in its ring colour. The previous run is drawn at 0.3 alpha. Its title is "Populations (a model)".
  - **Caption and controls,** in the physics presenter's style: Play, the predict question with `WEB_CHOICES` buttons, Reveal, Replay.
  - **After the run:** tapping a species toggles removal (drawn crossed out). Dragging up or down on a species sets its starting number, shown as a label.
  - Use `requestAnimationFrame` with `STEPS_PER_SECOND_SHOWN`, and clean up on exit. Honour `prefers-reduced-motion` by drawing dots static.
- [ ] **Step 4:** Run `npm run check`. Then in the browser with the stub, run the grassland sample end to end:
  - steady, then the pause with the question, then the reveal; grass falls after fox removal;
  - remove the hawk and replay: the faint previous lines show;
  - board mode and full screen;
  - phone width at 375 px.

  Take a screenshot as proof. Confirm physics presenting is unchanged. Stop the server.
- [ ] **Step 5:** Checkpoint `feat(ecosystem): present the food web with a predict pause`.

### Task 12: Live checks and measured README results

**Files:**
- Create: `src/checks/webs.ts`, `scripts/check-webs.mjs`
- Modify: `scripts/mock-photos.mjs` (adds `web-*` mocks into `check-photos/mock/`), `package.json` (`"webs"` script), `README.md`
- Test: `src/checks/webs.spec.ts`

**Interfaces:**
- Produces:
  - `scoreWeb(sample: WebSample, read: Web): { played: boolean; mismatches: string[] }`.
    - It matches species by name: case-insensitive, edit distance ≤ 2, so "rabit" matches "rabbit".
    - It runs the sample's event on the read web.
    - `played` is true when every species' direction equals `expect.event`, after any arrows flagged backward are flipped, as the teacher would.
  - Web description cases: one per sample title ("grass, rabbits, foxes and hawks", and so on).

- [ ] **Step 1: Write failing tests.**
  - `scoreWeb(sample, sample.web)` is played for every sample.
  - A read with fox → rabbit reversed and flipped by the scorer is played.
  - A read missing the hawk is not played, and the mismatch names hawk.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the scorer and the script, following `check-descriptions.mjs`:
  - a `$3.00` budget guard;
  - each sample PNG, its mock photo, and its description run twice;
  - raw readings saved to `check-runs/<timestamp>-webs`.
- [ ] **Step 4:** Ask the user before running it, since it costs money. Then run `node --env-file=/Users/adamrowe/Projects/board-to-life/.env scripts/check-webs.mjs`. Write the measured totals and the cost into the README in the physics style: "played as described N of N when last checked (`npm run webs`)", with the date, the sample size, and any failure explained. Report only measured numbers.
- [ ] **Step 5:** Run `npm run check`. Checkpoint `docs: report measured food web readings`.
