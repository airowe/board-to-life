# Ecosystems, geometry and typed descriptions

Status: draft for review, 2026-10-29. Hackathon deadline: Wed Nov 4, 9 PM ET.

## Intent

Board to Life turns a whiteboard physics drawing into a scene the class predicts and then watches. The user wants it to cover more of a typical middle school curriculum and to show more of what Muse Spark can do. The idea is to grow it from "physics drawings come alive" into "any whiteboard diagram you can predict comes alive". The loop stays the same in every subject:

1. The teacher draws, or now types, the setup.
2. Muse Spark reads it.
3. The teacher checks the reading.
4. The class predicts.
5. The board plays it out.
6. Students change something and replay.

This round adds two subjects and one new way in:

- **Ecosystems (biology).** The teacher draws a food web. It comes alive as populations rising and falling over time. Students remove a species and watch the knock-on effects.
- **Geometry.** The teacher draws a figure. Students drag its points while measurements update live. Reflections, rotations and translations animate.
- **Typed descriptions.** Instead of a photo, the teacher types something like "a ball rolls down a ramp into five dominoes" or "grass, rabbits, foxes and hawks". Muse Spark produces the same reading it would from a photo. The app draws it cleanly and the lesson continues as normal. This works for all three subjects.

The user chose ecosystems and geometry from a wider list: genetics, probability, functions, deeper physics. Those come later, so the structure must make adding a subject a self-contained job.

## Goals

- A teacher can pick Physics, Ecosystem or Geometry, give a photo or a typed description, check the reading, and present it with a predict pause and a student edit-and-replay step.
- Each new subject has 4 or 5 sample drawings, drawn by a script like `scripts/draw-samples.mjs`. Each sample's outcome is pinned by a spec.
- Each new subject is measured against live Muse Spark readings of its samples. Measured results go in the README in the same style as physics ("played through N of N when last checked"). Only measured numbers are reported.
- Physics keeps working exactly as it does on branch `trial-combined`, including drag-to-edit, board mode and board-image import.

## Non-goals (this round)

- **Detecting the subject automatically.** The teacher picks it. This is my call: it saves a model call and a failure mode under deadline. Auto-detect can come later.
- Genetics, probability, functions and deeper physics.
- PDF import, and APIs from whiteboard vendors.
- Realistic ecology. The population model only needs to show the right direction of change and show it clearly: remove the predator, prey rises, then plants fall.
- Proofs, or geometry constructions that hold constraints such as "stays parallel" while points are dragged. Points move freely and the measurements update.

## Anti-goals (failure even if it works)

- Breaking or slowing the physics path.
- A typed description that skips the teacher's check. Generated readings go through the same check screen as photo readings.
- Showing ecosystem numbers as if they were real field data. The UI should call them "a model".
- A subject that only works on our own clean sample drawings. Each one must be checked against Muse Spark readings, including deliberately messy drawings, before it is called done.

## Constraints

**From the user's standing rules:**
- TypeScript strict. Prefer `type`. Small, pure, composable functions.
- TDD, with colocated `*.spec.ts`. No `// TODO:` comments.
- Conventional Commits with no AI attribution. Commit only when the user approves.
- Never use `/tmp`. Kill dev servers when done.
- Keys live in `.env` and are never printed.

**From the code as it stands:**
- **Reader:** `server/sceneReader.ts` has one physics prompt (`READER_PROMPT`) and a JSON schema (`MODEL_SCENE_SCHEMA`). The model reports positions on a 0–1000 grid, and `toScene` converts that to a 1200-unit drawing.
- **Scenes:** `src/scene/schema.ts` defines the physics `Scene` (zod, `version: 1`) and `validateScene`.
- **Session and screens:** `src/session/store.ts` holds `Lesson = { scene, questions }`. `src/ui/check.ts`, `src/ui/present.ts` and `server/questionDrafter.ts` are all physics-specific.
- **Playback on the photo:** `src/present/onPhoto.ts` paints out the drawn ink of moving pieces.
- **Drawing samples:** `src/checks/sketch.ts` (`sketchScene`) draws a scene as a hand-drawn-looking SVG, which is used for samples.
- **Model calls** go through Muse Spark (`muse-spark-1.3` on Meta, with a Baseten fallback). Reads can take up to 120 seconds. Costs are tracked by `costOf`.

## How it fits together

### A subject is a module

Introduce a `Subject` registry: `'physics' | 'ecosystem' | 'geometry'`. Each subject owns:

| Part | Physics today | What a subject provides |
| --- | --- | --- |
| Model output schema and reader prompt | `MODEL_SCENE_SCHEMA`, `READER_PROMPT` | Its own schema, plus a prompt for photos and one for text |
| Conversion and validation | `toScene`, `validateScene` | `toX(model, size)` and `validateX`, both zod |
| Drawing | `sketchScene` | `sketchX(model, seed)` returning SVG. Used for samples and for typed descriptions |
| Check-screen rows | item list with confidence | Rows to list, plus overlay boxes on the photo |
| Engine | Matter.js `simulation.ts` | A pure step or derive function |
| Presenter | `present.ts` | Canvas drawing on top of the photo or the sketch |
| Student edits | `src/scene/edit.ts` | The edits that subject allows |
| Predict questions | `questionDrafter.ts` | Outcomes worked out from its engine, given to the same drafting call |

The session's `Lesson` becomes a tagged union: `{ subject: 'physics', scene, questions } | { subject: 'ecosystem', web, questions } | { subject: 'geometry', figure, questions }`. Physics code keeps its own types. Wrap it rather than rewrite it.

The API gains a subject field on the read request. The stub reader returns a fixed sample for each subject so the UI can be built without model calls.

### Typed descriptions (all subjects)

- **Capture screen:** next to the photo options, add "Describe it instead". It has a text box, the subject picker, and a few example prompts for each subject.
- **Server:** the same subject schema, with a text prompt. The text prompt asks the model to *lay out* the setup on the 0–1000 grid as a teacher would draw it on a 3:2 board. For physics, it is told to rest things on surfaces and keep everything on the board.
- **Retry:** if validation fails, retry once with the validation errors added to the request. If it still fails, show the errors with the description kept so the teacher can rephrase.
- **Image:** the app draws the reading with `sketchX` and turns the SVG into an image in the browser. That image takes the place of the photo, so the check screen and presenter need no special case.
- **Physics layouts may not play as described.** For example, the dominoes might be too far apart. In this round, the check screen shows the reading and the teacher can still approve it. Running a simulation on the server and retrying is a stretch goal.

### Ecosystem

**Model output:**
- `species[]`, each with:
  - `id` and `name` as written
  - `role`: `producer`, `consumer` or `decomposer`
  - `x`, `y`, and a box around the drawing or word
  - `count` if a number is written next to it
  - `confidence`
- `eats[]` arrows: `{ from: prey, to: predator }`. The arrow direction follows the energy-flow convention, from the thing eaten to the eater. The prompt must say this explicitly, because students and teachers sometimes draw it the other way. If arrowheads are unclear, use lower confidence.
- `labels[]` and `unknownMarks[]`, as in physics.
- An optional `event`: a species crossed out, or written instructions such as "drought" or "remove foxes". This becomes the predict point.

**Engine:**
- A pure discrete-time model in `src/ecosystem/model.ts`.
- Producers grow logistically up to a carrying capacity.
- Each consumer gains from each of its prey with a saturating (Holling type II) response and has a base death rate. Decomposers grow with total deaths, which keeps them simple and visible.
- Default rates come from each species' role and trophic level (its longest path from a producer). They are tuned so the sample webs settle into a steady state that holds, rather than collapsing or exploding.
- Written counts set the starting numbers. Without them, start each species at its steady-state level.
- The output is a time series for each species.
- **Tuning bar:** for every sample web, removing a species sends the next level up down and the level below up within one run. Pin this in the specs, just as physics outcomes are pinned.

**Presenter:**
- Each species' spot on the photo gets a ring that grows and shrinks with its population. Dots move between linked species to show feeding.
- A strip chart plots one line per species, coloured to match its ring.
- **Predict pause:** the web runs steady for a few seconds. Then the event is applied (or the teacher triggers it) and the run pauses on a question such as "Foxes are removed. What happens to the grass?" Afterwards the result plays out.

**Student edits:**
- Tap a species to remove it or bring it back.
- Drag a species' starting number up or down.
- Then replay, with the previous run's lines left faint, as in physics.

**Questions:** outcomes are the direction each species moved after the event (rose, fell, steady, died out) and when. These go to the existing question-drafting call with an ecosystem-specific prompt.

**Samples, 4–5 webs:**
- a pond
- grassland (grass, rabbit, fox, hawk)
- ocean (kelp, urchin, sea otter, with the classic urchin-barren cascade)
- a forest with decomposers
- one messy drawing: crossed arrows and a word misspelt

### Geometry

**Model output:**
- `points[]`: `id` as written (A, B, C…), `x`, `y`, `confidence`.
- `segments[]`, `lines[]` (through two points, drawn extending past them), and `rays[]`.
- `circles[]`: a centre point, and either a radius or a point on the circle.
- `polygons[]`: an ordered list of point ids.
- `marks[]`, given as point ids:
  - angle arcs: an angle at a point between two others, with any written value
  - right-angle squares
  - tick marks for equal lengths
  - arrowheads for parallel lines
- `transformations[]`:
  - reflect over a line
  - rotate about a point by N° (written)
  - translate by a drawn arrow
  - dilate from a point by k

  Each applies to a polygon.
- `labels[]` (written values such as "40°" or "5 cm"), and `unknownMarks[]`.

**Engine:** pure derive functions in `src/geometry/`:
- lengths
- angles: interior, and those around a transversal
- polygon area and perimeter
- the sum of a polygon's angles
- the image of a polygon under each transformation

There is no time-stepping. Moving a point re-runs the derive functions.

**Presenter:**
- The figure is redrawn cleanly over the photo, with live measurements next to each marked angle and length.
- A transformation plays as an animation: the figure flips over the mirror, turns about the centre, or slides along the arrow. The image shape is left drawn in a second colour.

**Predict pause, two kinds:**
- **Before a transformation plays:** "Where will triangle ABC land?" Students can drag a ghost triangle to their guess before the reveal, and the reveal shows both.
- **Invariant questions:** "Drag C anywhere. Will the three angles still add up to 180°?" The pause shows the question. Then dragging is unlocked, and the live total answers it.

**Student edits:** drag any point, using the pointer and hit-testing approach from physics drag-to-edit. Drag the mirror line, the rotation centre or the arrow tip, then replay the transformation.

**Questions:** outcomes are the invariants that hold in the figure: angle sums, equal angles from parallel lines, congruence under rigid transformations, area scaling by k² under dilation. Work these out from the figure and give them to the drafting call.

**Samples, 4–5 figures:**
- a triangle with angles marked
- parallel lines cut by a transversal
- a reflection over a line
- a 90° rotation about a point
- a messy drawing, with labels written next to the wrong points

## Order of work (my call)

1. The subject registry, a session `Lesson` union, and a subject picker on capture. Physics keeps passing all of its existing tests.
2. Typed descriptions for physics. This gives the demo its earliest win and exercises the sketch-instead-of-photo path.
3. Ecosystem, end to end: stub, engine and specs, presenter, edits, reader prompts, samples, then live reads.
4. Geometry, end to end, in the same order.
5. README and measured results. Then the user records the demo.

If time runs short, step 4 shrinks to drag-a-point with live angle sums and one transformation. Step 3 ships whole.

## Decisions after review (my calls unless marked)

- **The event is chosen at check time, so questions are approved as they are today.**
  - The reader suggests an event: one drawn on the board, or the most dramatic removal if none is drawn (usually the top predator).
  - The teacher can change the event on the check screen before approving. Questions are drafted for the event the teacher chooses.
  - Changes students make during replays use questions built from templates ("What happens to the grass now?"), with no model call in front of the class.
  - Geometry works the same way: a figure with no transformation drawn gets an invariant question chosen at check time.
- **Arrows drawn backwards are read as drawn and flagged.**
  - If an arrow runs from predator to prey (fox → rabbit), the check screen marks it with "This arrow points from the eater to the eaten. Flip it?" and a one-tap flip.
  - Nothing is corrected silently, and a wrong arrow becomes a teaching moment.
  - Typed descriptions use what the model knows about who eats whom.
- **Ecosystem tuning bar, restated:**
  - For each sample, pin its chosen event plus removing its top predator.
  - The expected direction for each species after the event is written out in the spec for each sample, which covers omnivores and the kelp cascade.
  - Default rates come from each species' role. A sample may override a rate when it has to, and the spec says why.
- **What counts as "played through" in the README:**
  - **Ecosystem:** the reading's run gives the same direction of change for every species after the event.
  - **Geometry:** the reading gives the same derived facts (angle sums, equal angles, where the transformed shape lands, within a tolerance). Written labels count as attached to the points they were meant for.
  - Each subject gets mock phone-photo versions of its samples through the existing `photos:mock` approach, and those are read too.

- **In geometry, written values win** (the user's decision):
  - When the teacher writes an angle or a length, the figure's starting points are adjusted as little as possible so it holds exactly. The derive functions then work from the adjusted points.
  - Points with nothing written keep their drawn positions.
  - If the written values can't all hold at once (for example, triangle angles that add up to 190°), the check screen says so and names the values, and the figure keeps its drawn positions.
  - Lengths are shown in the unit written on the board, scaled from one written length. With no length written, they are shown without a unit.
  - Once students drag a point, measurements show the live values. The written ones describe only the figure as the teacher drew it.

## Left to the builder

- Exact population parameters and chart styling, provided the tuning bar above is met.
- How subject modules are laid out in folders, provided physics files don't need to move.
- Whether the text and photo prompts share most of their wording.
- The wording of the UI copy, within the existing tone: plain and teacher-facing.
