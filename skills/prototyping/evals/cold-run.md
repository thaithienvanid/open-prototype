# The cold run of the skill

A cold run proves the skill on an agent that has never seen the tool. Give a fresh agent an empty project folder, a shell with `open-prototype` on the PATH, this skill, and the request below, and nothing else. No person answers during the run, so the request holds what the skill tells an agent to ask for.

## The request

Use the prototyping skill. Design "Shelf", a small product for a person who borrows from a public library, as a prototype of three screens: the loans list, one loan's detail, and renewing a loan. The loans list has four states: ready with three loans, empty, loading, and failed to load. The detail shows one loan's title, author, and due date, and has two states: ready, and overdue. Renewing has three states: asking the person to confirm, renewed with the new due date, and refused because someone else has reserved the book. The product runs on the web and on iOS, in a light and a dark theme. The project has no tokens, components, or copy yet, so define a small set of tokens and write plain, real copy yourself, and say in your report that you wrote it. Keep the design in `design/shelf.html`. I cannot answer questions during this run: where you would ask, write down what you assumed. Finish with a report of the screens and states you drew, the commands you ran with their exit codes, what you looked at, and what you could not verify.

## The pass checks

A script can tick the first list. Run each command in the project folder after the agent has finished.

- [ ] `design/shelf.html` exists, and `open-prototype check design/shelf.html` exits with code 0.
- [ ] `open-prototype check design/shelf.html --json` prints `"ok": true` and no finding whose level is `problem`.
- [ ] `open-prototype screens design/shelf.html --json` lists three screens.
- [ ] In that output, one screen has four states, one has two, and one has three.
- [ ] `open-prototype build design/shelf.html` exits with code 0 and writes a page.
- [ ] `open-prototype shots design/shelf.html --json` lists views for a web frame and for the iOS frame, each in `light` and in `dark`.
- [ ] The project has no `prototype.config.json` that turns a rule off.
- [ ] `DESIGN.md` exists at the project's top, as step 1 writes it for a new product.
- [ ] No file is tracked or left in the project outside `design/` but the tool's output folder and that `DESIGN.md`.
- [ ] Every comment in each round under `design/rounds/shelf/` names its writer in `by`, in the form `agent:<harness>/<model>`.
- [ ] The design file holds no `<script>` but its one block of example data.

A person, or a second fresh agent that reviews by the skill, ticks the second list. Look at the built page, never at the design file.

- [ ] Each of the nine states says what happened, in real copy, and gives one next step that is a control on that state.
- [ ] The three loans differ, and one has a long title. The detail screen shows the loan a person opened, on the second and third loan as on the first.
- [ ] No state claims an outcome that has not happened: "renewed" shows only in the renewed state, with a new date later than the old one.
- [ ] Every colour comes from a token, and both themes are finished: no text is hard to read in either.
- [ ] The report names every screen and state, each command with its exit code, and what the agent could not verify.
- [ ] The report says which copy and which tokens the agent wrote itself, and lists what it assumed.
- [ ] The report says whether the agent read pictures of the views. If it could not, it says so and lists each such view for the person's turn.
- [ ] The report says how many agent rounds ran, each saved by another agent that named itself in `by`, or that no second agent could run.
- [ ] The agent stopped before the person's round, and the report does not say that a person saw or approved the design.

## The request for an existing project

Give a fresh agent a copy of the existing test project, `tests/projects/existing` in the tool's repository, with `open-prototype` on the PATH and this skill, and this request: "Use the prototyping skill. Inbox is our product, and it has its own design document, tokens, components, and copy. Design one new screen for it: the settings of a person's notifications, with a ready state, a saved state, and a state where saving failed. Keep it in `design/notifications.html`. I cannot answer questions during this run: where you would ask, write down what you assumed." It passes when:

- [ ] The agent ran `open-prototype project` before its first design, and read `DESIGN.md` before it drew.
- [ ] `open-prototype check design/notifications.html` exits with code 0, and its `--json` form prints no `system` or `accessibility` finding.
- [ ] Every custom property the design reads is one `DESIGN.md` gives, or one the design sets itself, and the design sets none of `DESIGN.md`'s names again.
- [ ] Every component the design names is a component of `DESIGN.md` or the story index, and the copy follows the document's voice.
- [ ] From every state, the person's task finishes: a state that lets a person change a setting also lets them save it.
- [ ] The hand-off lists each key of the example data whose copy is a draft, for the person to approve.
- [ ] The agent stopped before the person's round, and said what waits for a person: its questions with the answers it assumed, the draft copy, the round, and the approval.

## The second agent

Give a second fresh agent the same folder as the first one left it, this skill, and this request: "Use the prototyping skill. Review the design in `design/shelf.html`, which another agent made. Save your comments as its next round." Its round is one more than the highest round the first run left under `design/rounds/shelf/`, or 1 when it left none. It passes when that round's `comments.json` exists, or, with no fault found, when no new round exists and the hand-back says the round brings no comment. `open-prototype check design/shelf.html` still exits with code 0. Each comment names a screen and a state the design has, gives a proof, names its writer in `by`, and has an id of that round. Each check the agent could not run is in its hand-back, with the reason, and is no comment. Compare its comments with a person's look at the same page: list each fault only one of them found.
