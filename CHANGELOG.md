# Changelog

## Unreleased

The first release of open-prototype, whose command is `open-prototype`. It is under the Apache-2.0 licence, in `LICENSE`. It holds one design format, its checks, a viewer, review rounds, screenshots, and a command line, with a skill for an AI agent. The parts below are in the order a person who uses the tool meets them.

### The format

- A design is one ordinary HTML file, in design format 1. The tool reads it through one set of attributes that start with `data-proto-`, and nothing of the tool's is written into the file.
- A screen is a `<section>` with `data-proto-screen`, and each of its states is a direct child with `data-proto-state`. A layer over a screen, such as a dialog, is a state too, so a person can link to it, capture it, and comment on it.
- A design declares its platforms (web, iOS, Android, desktop) and its themes (light, dark) in two `<meta>` lines.
- The example data is one JSON block in the design. `data-proto-text` fills a text from its top, and `data-proto-field` from the current entry of a list.
- A designer composes with four words. A block is markup in its own file, used by name with arguments. A slot is a place the tool fills, such as a screen's title. A list draws one item for each entry of the example data. Tokens are the one place where a raw colour may stand.
- A design grows in place as `flow -> screen -> block`. An element with `data-proto-flow` puts a file of `flows/` in its place, and each screen id in it is qualified with the flow's id, such as `projects:detail`.
- An `@font-face` in a design's style or in a tokens file names a font file in the project, and the build writes the file into the page, so a brand font loads with no network.

### The checks

- The tool has 96 rules in 14 families, and a fifteenth family, `compose`, holds none. Each finding is one line with its level, its file and line, what to do, and the rule's id.
- A finding is a problem or a note. A problem makes the exit code 1, and a note never does.
- A `read` or `unsafe` problem stops the page, and no setting turns it off. A project turns any other rule off in its settings.
- The `accessibility` rules read what a file shows with no browser: its language, a heading order in each view, one main landmark, and motion that stops under reduced motion. Each names its WCAG 2.2 criterion in the specification.
- `stories` checks Storybook's `index.json` against the design's components, so the built interface has a story for each variant.

### The viewer

- `build` writes one HTML page that holds the viewer and the design. It runs from a file, with no server and no network.
- Three tabs show a design: Prototype, to click through it in a device frame; Board, every screen and state; and System, its tokens and components with a specimen of each variant.
- The Board draws a cell's picture when the cell comes near the view, so a design of 2,000 screens is ready in about half a second. Every cell is there from the start, in the same Tab order.
- The Screens panel lists every screen with its states, and counts the views a person has seen.
- Eight device frames come with the tool: an iPhone, an Android phone, four web widths, and two desktop sizes. The Checks menu shows text at 200%, right to left, and a phone's system bars.
- Every view has its own link. The keys work without a pointer, `?` lists them, and a person can switch the single-key shortcuts off.
- Compare puts a screenshot of the built interface beside the frame, or under it when the frame is too wide for both, matched to a view by the picture's name.

### Review rounds

- A reviewer pins a comment to an element in the page. The page keeps each comment in the browser, and exports the round as a download, as JSON, or as a prompt for an agent.
- `save-comments` saves a round beside the design, in `rounds/<design name>/<N>/comments.json`. It keeps each comment whole or refuses the save and says why, and it never writes over a round.
- The next round's `changes.json` names the comments each change answers. The next build shows each earlier comment as Answered, with its summary, or as Open.
- A round holds up to 200 comments of up to 2,000 characters, and a page shows up to 20 earlier rounds. Nothing past a limit is cut in silence.
- Once every view is seen, the page says so and records no decision. A person tells their agent, in their own words, when the design is done.

### Screenshots

- `shots` prints the views a review needs, sized to the change: a whole design, `--changed-screen`, or `--changed-component`.
- A full pass takes every state at each frame in each theme, then text at 200% at the narrowest frame and right to left, on each screen's fullest state.
- `shots --capture` takes each view as a PNG with headless Chrome or Chromium. A view taller than its frame is pictured whole, up to 16,384 px.
- `--out` takes a round's pictures into the round's own folder, beside its files.

### The commands

- Thirteen commands: `check`, `build`, `screens`, `components`, `shots`, `stories`, `serve`, `project`, `new-design`, `new-design-md`, `save-comments`, `example`, and `guide`.
- A flag may stand anywhere on the line, and `open-prototype <command> --help` says what each one means.
- With `--json`, every command but `serve` prints one JSON object, in one envelope that `schemas/output.schema.json` holds.
- The exit code says what to do next: 0 done, 1 the design has a problem, 2 the request was refused, and 3 the tool failed. A refusal names its next step in one line.
- `open-prototype guide` prints the format, the frames, the shots, the round files, the review, and the settings. `open-prototype guide --reference` prints every name, rule, command, and exit code.
- `open-prototype example` writes Baseplate, a complete design to read: a SaaS starter kit with six flows, nine screens, 27 states, and six shared blocks. Its page is in `.prototype/views/.example/`, where no page of the project's own designs can be.
- `bun run compile` builds one binary that holds the tool and every file it ships.
- The tool is not on npm. Each release holds a binary for macOS on arm64 and x64, for Linux on x64 and arm64, and for Windows on x64, each run on its own system before the release, with a `SHA256SUMS` file and a signed build provenance for each. From a clone, the tool runs with Bun.

### The design document

- The tool reads the project's `DESIGN.md`, in the open format of that name, version alpha. Each token becomes a CSS custom property that every design reads, such as `--color-surface`.
- A colour given for light and for dark becomes one role that follows the theme the viewer shows.
- The `system` rules find a value a design sets again to another value, and a token a design reads that the document lacks. No `system` finding stops a page.
- `open-prototype project` prints what a project holds: the document's tokens with their values in each theme, its components, its section headings, the token files, and the story index.
- `new-design-md` starts a design document with tokens and sections to fill in. Its text is 14 px, and a form field's 16 px on a phone, where iOS Safari zooms on smaller. A design started after it reads the document's tokens.

### The skill

- The repository is a Claude Code plugin marketplace: `/plugin install open-prototype --marketplace thaithienvanid/open-prototype` gives Claude the skill and the `open-prototype` command, run from the plugin's own copy with Bun. On Windows, Claude Code runs the command through Git Bash.
- Antigravity, Codex, Muse Code, and OpenCode read the same skill, each installed once for every project. Antigravity installs the plugin from this repository's address through `.antigravity-plugin/plugin.json`, Codex and Muse Code install it from this repository as a marketplace, and OpenCode 2 or later installs it as a plugin, `opencode/server.ts`, which adds the skill and puts the command on the PATH of OpenCode's shells, with no import from OpenCode.
- `skills/prototyping/` teaches an agent when to prototype, what a good prototype is, and the loop from what the project holds to a compared build.
- Agents review first. A fresh second agent, never the design's maker, reviews from the screenshots and saves a round, and the maker answers it, for three rounds at most, or until a reviewer finds no fault. Then the person comments, or decides in their own words that the design is done.
- Its references hold a review checklist of eleven checks, the steps of a review round, draft copy, a run with no person to answer, and the loop on one small design.
- Its evals hold a cold run on a fresh agent, and `evals/evals.json` holds that run and twenty queries, half of which should load the skill.
- It sends the agent to `open-prototype guide` for every fact, and names no harness.

### Safety

- The reader takes a design by an allow-list of elements and attributes. A script, an event handler, a form that submits, or a load from the network is refused, and the design gets no page.
- The page loads nothing. Its policy names one script, the viewer's, by its hash, and each frame is sandboxed with no script.
- The page holds no live address to another machine. A design's link that leaves its screen points to `about:blank` in the page, with the address the design wrote kept as text in `data-proto-href`. So pressing it opens no connection, and the viewer says that address.
- The tool sends nothing off the machine. `serve` answers on `127.0.0.1` alone, and only a request addressed to it. With no `--port`, it takes the first free port from 8765 to 8784, so a second design served at once still opens, and a design keeps its address from run to run. With `--lan` it answers a phone on the same network, by an address with a secret token.
- The tool reads and writes only inside the project, through no link, but for the comments file you give `save-comments`. It never writes over a design, a design document, or a saved round.
- The capture drives Chrome over a pipe, with no port open, turns off Chrome's own network use, and removes its profile however it ends. It keeps Chrome's sandbox on, so it never runs as root.
- Section 12 of `docs/tech-spec.md` holds the threat model, each control with its test, and what is not defended.

### The systems and the checks

- The tool runs on Bun 1.4.4 or newer, with no runtime dependency.
- `bun run check` passes on macOS, Linux and Windows, each with Chrome. On GitHub, a workflow runs it on all three for every push to `main` and every pull request, and a pushed tag builds the release's binaries.
- `sh tools/check-linux.sh` runs the same check on Linux with Chromium, in a container.
- The check runs Biome's lint and format check, the type checks of the tool and of the viewer, the viewer's drift check, every test with the browser tests on, and the compiled binary's help.
- `SECURITY.md` says how to report a vulnerability privately, and `CONTRIBUTING.md` how to send a change.

### Known limits

- The checks read the file and draw nothing. So contrast, target size, reflow, and focus need a look or the skill's review.
- The viewer is not tested in Firefox or Safari, or from a phone over `serve --lan`.
- No person has listened to the viewer with a screen reader yet.
- In a page forced past the reader, Chrome opens a connection on its own to a frame's address that the policy blocks. No byte goes over `http://`, and over `https://` Chrome's TLS hello reaches the host. Section 12 of `docs/tech-spec.md` says what it sends.
- Section 12 of `docs/tech-spec.md` lists everything not verified, and section 5 of `docs/product-spec.md` the later work and the decisions.
