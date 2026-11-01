# Living scenes: real pictures that move

Status: draft for review, 2026-10-31. Demo video due Mon Nov 3; submission Wed Nov 4, 9 PM ET.

## Intent

Today a food web plays as coloured rings joined by arrows, and a physics board plays as clean line drawings or on the board photo. The user looked at the rings and arrows and said it was "so bad with just squares and arrows". They want the app to read as a professional use of AI: what a teacher drew or described should come to life as real-looking pictures that move and "wow people". In their words, "every subject, every image, every animation should be real", and none of the motion should "seem forced. it should flow naturally".

The new view is a **living scene**. The board's subjects are drawn as illustrated pictures in one consistent style. They are placed in a matching habitat or on a tabletop, and they move the way the existing models say they should. The model stays the source of truth. The pictures are only the skin.

## Decided by the user

- **Style:** "in between" flat illustration and soft 3D, like a modern animated science explainer, seen from the side. The user approved the samples in the visual companion.
- **Motion:** natural and unforced. The kelp forest motion test showed the intended feel: otters bob and drift away one at a time, urchins crawl in from the edges and the kelp sways, then thins.
- **Three views of the same lesson**, borrowed from an X post the user shared: the **chart** (the board's species and arrows, as today), the **place** (the living scene) and the **time** (populations over time, as today's line chart).
- **Labels pinned in the scene** at the moment something happens, such as "urchins multiply" on the urchins, rather than a caption bar.
- **Keep the side-view style.** The isometric diorama look from the X post is out.
- **A picture library drawn ahead of time** keeps cost down and quality checked. Live generation is only for subjects the library lacks. The library is built and committed on branch `feat/picture-library` (see "What exists").
- **Pictures first for physics:** a physics board opens with library pictures even when it came from a photo; the photo is one tap away.
- **Fluent Emoji 3D as the fallback** when a picture is missing or cannot be generated, instead of today's labelled ring.

## Goals

1. **Ecosystem place view.** A food web from a photo, a typed description or a sample opens on a living scene:
   - a habitat background and each species drawn as its library picture;
   - the population model driving how many individuals are visible, and how plants grow or thin;
   - the existing predict pause, event, reveal and edit-and-replay loop working unchanged in this view.
2. **Three views** for ecosystems: Place, Chart and Time, switchable during a lesson. Board mode and touch work in all three.
3. **Pinned labels** in the place view for the event and each species' change, timed to when the change becomes visible.
4. **Physics in pictures.** The physics scene can be drawn with library pictures on the tabletop or lab background: balls, blocks, dominoes, planks for ramps and levers, the cart, pulleys, weights, the fulcrum and the pendulum bob. Ropes and springs are drawn by code in the same style. The matter-js simulation is unchanged.
5. **Live pictures for unknown subjects.**
   - A species or object the library does not cover is drawn by Muse Image on demand, in the house style, cut out and kept on that device.
   - Generation starts while the teacher is on the check screen, so the wait is mostly hidden.
   - It is capped per board.
6. **Never broken.** If a picture is missing, late or fails, the subject shows as its Fluent Emoji. If there is no emoji either, it shows as today's ring or line drawing. A lesson never stops because of a picture.
7. **Demo-ready:** the four ecosystem samples and the physics samples look right in the place view, and one typed board in the demo includes a subject outside the library to show live generation.

## Non-goals (this round)

- Geometry. It stays as clean diagrams, because a "real-looking" triangle means nothing.
- Physics "time" view (a graph such as speed over time). It is my call to leave it out under the deadline; Chart and Time are ecosystem-only this round.
- Generated video of any kind. Motion always comes from our models.
- A shared server-side cache of live pictures across devices. Live pictures are kept per device.
- Sound.
- Regenerating the library at runtime, or letting teachers restyle it.

## Anti-goals (failure even if it works)

- **Motion that looks forced:** teleporting, popping in or out without easing, everything moving in lockstep, or jitter.
- **Mixed styles side by side**, for example an emoji next to a library picture, when a library picture exists. The emoji is only a fallback.
- **Pictures that contradict the model**, such as a species shown thriving while its population line falls.
- **A slower or flakier lesson** than today. The place view must not add waiting after the check screen, beyond what live generation of an unknown subject needs, and even that has a fallback.
- **Cost surprises.** No per-board spend except capped live generation for unknown subjects.
- **Breaking what exists:** physics on the photo, the clean drawing, board mode, typed descriptions, edit-and-replay and the access code.

## Constraints

- Stack as today: Vite and TypeScript (strict), canvas 2D rendering, matter-js, zod, Vercel functions behind the `x-access-code` header.
- No new runtime dependencies unless there is no reasonable way without one.
- TDD with colocated `*.spec.ts`. Pure logic (matching, counts, placement, label choice, cut-out) is unit tested apart from canvas and DOM code.
- Assets are ones we have rights to. Library pictures are our own Muse Image output. Fluent Emoji is MIT, and its `LICENSE` ships beside the files.
- Respect `prefers-reduced-motion`: subjects still appear, change and leave, but without idle bobbing and swaying, and with short fades instead of travel.
- Measured results only in the README.

## What exists

- **Picture library** (`public/library/`, built by `scripts/build-library.mjs` from `scripts/library-subjects.mjs`):
  - 74 cut-out subjects as transparent WebP (at most 512 px) and 7 backgrounds (1536 px wide).
  - Most animals have a `rest` and a `move` pose and face right.
  - `manifest.json` lists, for each entry, `id`, `subject`, `pose`, `group` (`organism`, `prop` or `background`), `aliases`, `file`, `width` and `height`.
  - Full-size originals are in `art/library/raw/`, which git ignores.
- **Backgrounds:** kelp forest, grassland, woodland, pond (cut-away), desert, tabletop and lab. Each has a flat floor along roughly the bottom fifth.
- **Fallback:** `public/library/fallback/` holds 156 Fluent Emoji 3D animals and nature subjects (256 px WebP), a `manifest.json` of `{ name, file }` and the MIT `LICENSE`.
- **Muse Image** (`muse-image-1.0`, `POST /v1/images/generations`):
  - About 1¢ per picture, about 9–15 s at `reasoning_strength: "low"`, and 150 requests a minute.
  - No transparent output, so subjects are drawn on white and cut out.
  - Measured in this project's spikes.
- **Motion test:** a throwaway canvas page from the brainstorm (`motion-kelp.html` in the scratchpad). Its timings and easing are the reference for the feel, not code to keep.
- **Ecosystem pieces:**
  - `src/ecosystem/model.ts` simulates populations (`Series` per species over `MODEL_STEPS`, event at `EVENT_STEP`).
  - `outcomes.ts` gives each species' direction (rose, fell, died out, steady).
  - `src/ecosystem/playback.ts` runs the phases.
  - `src/ui/presentWeb.ts` draws rings, arrows and the population chart.
- **Physics:** `src/ui/present.ts` draws the matter-js scene as a clean drawing or on the photo (`src/present/onPhoto.ts`).

## How it works

### Matching subjects to pictures

- Each species name, or physics body kind, resolves to one picture in this order:
  1. library entry by `subject` or `aliases`;
  2. a live picture already kept on this device;
  3. a live picture being generated now (shown as the next step's picture until it arrives, then crossfaded in);
  4. Fluent Emoji by name;
  5. today's drawing.
- Names are matched case-insensitively, singular and plural, ignoring punctuation and "the". "sea otters", "Otter" and "otters" all match `sea-otter`. Misspellings the reader already tolerates, such as "rabit", are in the aliases.
- Physics kinds map directly: `ball` to `steel-ball`, `block` to `wooden-block`, `domino` to `domino`, `ramp` and `lever` to `plank`, `wall` to `brick-wall`, `cart` to `cart`, `pulley` to `pulley`, `pivot` to `fulcrum`.
- One exception (my call): a body that hangs from a rope or spring and rests on nothing else uses `pendulum-bob` if it is a ball and `weight` if it is a block. `rubber-ball` is unused for now.
- Live generation is ecosystem-only, because the physics kinds are a closed set and all of them have pictures.
- `floor` is the background's floor. `rope` and `spring` are drawn by code.

### The ecosystem place view

- **Habitat:** chosen from the species, by which background most of them belong to. Each library subject gets a habitat tag (kelp forest, grassland, woodland, pond), and a `bg-*` entry's aliases double as habitat words. With no clear winner, grassland is the default.
- **Other species:** subjects without a habitat tag (live pictures and emoji) don't vote. Species from another habitat, such as a rabbit in a kelp web, are still shown with their own picture (my call). Every picture is in the same style, so this mixes habitats, not styles.
- **The four samples** (grassland, kelp forest, pond and woodland) each have a library picture for every species, so none of them depends on live generation.
- **Where things live:** each subject gets a zone: floor, water, surface, sky or tree. Floor dwellers stand on the background's floor line. Swimmers wander in the water. Floaters such as otters and ducks bob at the surface. Fliers glide in the sky. Producers root on the floor.
- **Zones for subjects outside the library** (my call): guessed from the name with a short keyword table (fish, shark, whale, eel and similar swim; bird, eagle, bat, bee and similar fly). Everything else stands on the floor. The reader and its schema are not changed.
- **Left to right:** order follows the board, so the scene feels like the teacher's own drawing. Spacing avoids overlaps.
- **How many:** each species shows a crowd sized by its population relative to its settled value before any edits (the model's warm-up result), so an edited-up species shows a bigger crowd (my call). The base crowd is 3–5 individuals for animals and 4–7 stalks or clumps for producers, and the count scales with population up to a cap. An extinct species has none left. Producers also scale in height and fade as they thin, which reads better than counting plants.
- **Changes look like life, not counters:**
  - Newcomers walk, swim or fly in from the nearest edge with easing.
  - Leavers move off an edge or, for producers, shrink and fade.
  - Individuals idle with small, unsynchronised motions (bob, sway, wander, an occasional hop) using each picture's `rest` pose, and switch to the `move` pose while travelling.
  - Subjects face their direction of travel by mirroring.
- **Timing:** the scene follows the playback step that already drives the chart, so the Place and Time views always agree.

### Pinned labels

- A short label pins beside the group it describes, with a thin leader line:
  - at the event, such as "the sea otters are removed";
  - when a species' direction becomes clear, such as "urchins multiply", "the kelp thins" or "the foxes die out".
- The text comes from templates over `outcomes.ts` directions and the event, not from a model call, so it is instant and free.
- At most three labels show at once, and the oldest fades. Labels never cover the subject they describe.

### Three views

- During an ecosystem lesson, a control switches between **Place**, **Chart** and **Time**. All three read the same playback.
- Predict, play, reveal, edit and replay work from any view.
- Students' edits, such as removing a species or changing a starting number, are made on Chart, as today, and show up in Place on replay.

### Physics in pictures

- Each moving body draws its library picture, fitted to the body's size and rotated with it.
- Ramps and levers stretch the plank picture along the body. Fixed walls use the brick wall.
- Ropes are drawn as smooth rope-coloured lines, and springs as a coiled metal stroke.
- The background is the tabletop, or the lab when the board reads as a lab setup. It is scaled to cover the stage, cropping its sides or top rather than leaving bars, and placed so the board's floor lands on the background's floor line (my call).
- If the board has no `floor` item, the lowest body's bottom edge stands in for it. Bodies are fitted into the stage exactly as the clean drawing fits them today.
- Pictures are the default skin for every physics board, including boards made from a photo (the user's choice). The toggle offers "Show it on the photo" when there is a photo, and the clean drawing stays available too.

### Live pictures

- **Route:** a new server route, `POST /api/picture`, protected by the access code like the others.
  - It takes `{ subject, kind: 'organism' | 'prop' }` and calls Muse Image with the library's style prompt.
  - It returns the PNG.
- **Cut-out:** the browser cuts the picture out of its white backdrop with the same flood fill from the corners as the library script, then caches it on the device under the normalised subject name.
- **When it runs:** generation starts for unmatched subjects once the reading arrives, while the teacher checks it.
- **Cap:** at most 4 live pictures per board. The rest use the fallback.
- **Late or failed pictures** (my call): a picture may swap in at any moment, including mid-travel, with a short crossfade. A failure drops silently to the emoji. The teacher is not told, because the lesson still works.
- **Key:** the route uses the existing `MODEL_API_KEY`, which already serves Muse Spark in production. The 150 requests a minute limit is shared by every teacher. With the cap of 4, one retry on failure is enough handling.

## Left to the builder

- Exact crowd sizes, easing curves, idle motion amplitudes and label wording, tuned by eye against the motion test.
- How zone and habitat tags are added: in `library-subjects.mjs` and regenerated into the manifest, or in a separate TypeScript table.
- The device cache: IndexedDB or the Cache API.
- Whether the Place, Chart and Time control is tabs or a segmented button, as long as it works in board mode at classroom distance.
- Swapping individual library pictures that look off when seen in motion, by rerunning the script for that entry.
