# Changelog

## Unreleased

The first release of open-prototype, whose command is `open-prototype`. It is under the Apache-2.0 licence, in `LICENSE`. It holds one design format, its checks, a viewer, review rounds, screenshots, and a command line, with a skill for an AI agent. The parts below are in the order a person who uses the tool meets them.

### The format

- A design is one ordinary HTML file, in design format 1. The tool reads it through one set of attributes that start with `data-proto-`, and nothing of the tool's is written into the file.
- A screen is a `<section>` with `data-proto-screen`, and each of its states is a direct child with `data-proto-state`. A layer over a screen, such as a dialog, is a state too, so a person can link to it, capture it, and comment on it.
- A design declares its platforms (web, iOS, Android, desktop) and its themes (light, dark) in two `<meta>` lines.
- The example data is one JSON block in the main file. `data-proto-text` fills a text from its top, and `data-proto-field` from the current entry of a list.
- A designer composes with five words: `flow`, `use`, `slot`, `list`, and `tokens`. A flow is a file of screens. A block is markup in its own file, used by name with arguments. A slot is a place the tool fills, such as a screen's title. A list draws one item for each entry of the example data. Tokens are the one place where a raw colour may stand.
- A design grows in place as `flow -> screen -> block`. An element with `data-proto-flow` puts a file of `flows/` in its place, and each screen id in it is qualified with the flow's id, such as `projects:detail`. A link or a parent in a flow names the flow's own screen when the flow holds it, and a screen of the main file otherwise. A flow includes no flow.
- An `@font-face` in a design's style or in a tokens file names a font file in the project, and the build writes the file into the page, so a brand font loads with no network.
- The tool reads a design's markup as a browser builds it. An element whose end tag is left out closes where a browser closes it, such as a `<p>` before a `<div>`, an `<li>` at the next `<li>`, or a `<button>` at the next `<button>`, and an end tag closes only what it closes in a browser. Markup a browser builds otherwise than its text reads, such as a `<b>` closed by `</p>` or text directly in a `<table>`, is a `structure.nesting` problem that says what a browser does and how to write it, so a design with no such problem nests as in a browser; a test of thousands of random texts against Chrome holds it.
- The tool reads a design's CSS as a browser does: a property in any case and spacing, such as `Color : #FFF`, a style attribute after its character references, a `/*` inside a string as no comment, an unquoted `url(data:...)` to its `)`, a custom property's `{ }` block as its value, and a declaration in an `@media` nested in a rule as that rule's. A string or a `url()` holds no colour.

### The checks

- The tool has 79 rules in 13 families, and 9 outcomes of a command, which the reference lists apart. A family is a topic, such as `compose` for every fault of a block's use. The reference prints each rule's level, whether it stops the page, one line of what it means, and the WCAG 2.2 criterion of each `accessibility` rule.
- A finding is a problem or a note. A problem makes the exit code 1, and a note never does. Each finding is one line with its level, its file and line, what to do, and the rule's id.
- A finding inside a block names the block's line and each use out to the design's file, and a fault of the block itself is told once. A fault of the example data, a flow, or a block is told at its own line. Findings in the design document, a tokens file, and a round file sort by file, then line, after the design's own files, and two like findings on one line are one that says so, such as "(2 on this line)".
- A rule whose row says so stops the page, and no setting turns it off: each `read` and `unsafe` rule, and the faults of a block's use, a slot, a name only the tool sets, a tokens file, or a flow that cannot be read. A project turns any other rule off in its settings, and `check`, `project`, and `stories` leave it out; a setting that names an outcome, such as `integrity.more` or `request.usage`, or `stories.missing`, is refused with the reason.
- `check` prints at most 200 findings. Past that it keeps every finding that stops the page, then problems, then notes, and its last line, a note, says how many of each it cut, so a problem is never hidden behind notes and a design of notes alone passes.
- A design nested deeper than the reader's limit is `read.depth`, which stops the page and the manifests, since what was read of it is a fragment. Text such as `Wait--!` is text; `--!` is refused only inside a comment, where a browser ends the comment at `--!>`.
- A missing block or flow names the file to write from the project's top, such as "blocks/card.html does not exist: write design/blocks/card.html". An argument a block never reads, such as `data-proto-arg-subtitle` on a use of a block that has no `{{subtitle}}`, is a `compose.unused-arg` note at each use; an argument passed on to a nested use counts as read. A `{{name}}` left after the blocks are filled is checked as written: a link, a key, an id, or `aria-labelledby` that holds one names nothing, and one in the copy is `copy.placeholder`.
- A `data-proto-text` or `data-proto-field` key that holds a list, an object, or null is an `integrity.fixture-key` problem that says what the page would show, such as `[object Object]`. The copy rules read the example data's string values only, as the page shows them: a key named `TODO` and an image's base64 bytes are no copy, and an escaped value such as `"\u0054BD"` reads as `TBD`.
- A `url()`, an `@import`, or an `image-set()` in a design's CSS that names a file or the network is an `integrity.load` problem, since the page loads an image only as a `data:` URI; its words say to write a `data:` URI or to draw the image with `data-proto-image`. An `@namespace`'s `url()` names a namespace and loads nothing. A page's images may take 20 MB, counted in bytes, once for each field that shows one.
- `paint.raw-color` reads the shorthands `text-decoration`, `text-emphasis`, and `column-rule` too. A suggestion of `paint.raw-color` or `paint.depth` names a token as the CSS reader reads it, capitals and `_` kept, such as `--brandBlue`.
- The `accessibility` rules read what a file shows with no browser: its language, a heading order in each view, one main landmark, motion that stops under reduced motion, and each control's label, name, or alternative text. `lang` must be a well-formed language tag, so `lang="english language"` is a problem. A button or a link whose only text is under `hidden` has no name, as in a browser. A transition needs reduced motion whether its duration is a plain time, a `calc()`, a `var()` whose fallback holds brackets, such as `var(--dur, calc(1s * 2))`, or a `transition-duration` after a `transition`.
- `stories` checks Storybook's `index.json` against the design's components, so the built interface has a story for each variant.

### The viewer

- `build` writes one HTML page that holds the viewer and the design. It runs from a file, with no server and no network.
- Three tabs show a design: Prototype, to click through it in a device frame; Board, every screen and state; and System, its tokens and components with a specimen of each variant.
- The Board is a row for each screen at every width: its name and its count seen, then its own states in the order the design draws them, each picture with its name under it, and no name cut. Fit stops at a zoom of 0.75, where a web frame's picture is 96 px wide, and a longer row pans with the board. A cell's picture is drawn when the cell comes near the view, so a design of 2,000 screens is ready in about half a second, and every cell is there from the start, in the same Tab order. The Board of a design with no screen says it is ready, so a script that waits on it goes on.
- The System view shows a colour token's light and dark values, written with `light-dark()`, under `@media (prefers-color-scheme: dark)`, or under the dark theme's rule, and an alias such as `var(--radius-lg)` paints the design's own token. A large spacing token, such as a page width, keeps its name beside its bar, and a click on a link in a specimen leaves the specimen shown.
- The Screens panel lists every screen with its states, and counts the views a person has seen. A change to the design's markup, its copy, or its images counts every view as not seen again, and the page says so; building the same design again does not.
- Eight device frames come with the tool: an iPhone, an Android phone, four web widths, and two desktop sizes. The Checks menu shows text at 200%, right to left, and a phone's system bars.
- Every view has its own link, and a link writes a flow's colon plain, as `#items:list/populated`. Copy link writes the frame a person picked, the default one too, so a phone opens it as well. A go to the view already shown adds no entry to the browser's history.
- The keys work without a pointer, `?` lists them, and a person can switch the single-key shortcuts off. A letter typed in a field, or in a design's editable text, is text and no shortcut. J and K on the Board or the System view stay in that view. A redraw keeps the focus on the control a keyboard user is on.
- A go to a screen of a list's entry opens the list's first entry, as its link does; a go from an item opens that item's, and a go between two screens of one list keeps it. A list whose `data-proto-limit` is no whole number from 1 draws every entry.
- In each `<nav>` of a design, the viewer marks one link as the current page, `aria-current="page"`: the shown screen's own. A link to a screen the shown one stands under takes `data-proto-section`, so one rule styles the section a person is in. A `<nav>` with no link to the shown screen marks its link to the nearest screen above it `aria-current="true"`.
- A move to another screen or state closes each panel of the design again as its markup writes it, as a page the product opens would; a change of theme or frame keeps what a person opened.
- Compare puts a screenshot of the built interface beside the frame, or under it when the frame is too wide for both, matched to a view by the picture's name. A pick of files it cannot show keeps the screenshots loaded before, and says so.

### Review rounds

- A reviewer pins a comment to an element in the page. The page keeps each comment in the browser, and exports the round as a download, as JSON, or as a prompt for an agent. A comment kept in the browser that does not read whole, such as one another page wrote, is left out of the list and the export, and the page says how many.
- The page keeps a design's comments by its project folder's name and its path, so two projects with a design of one path keep their comments apart, and a page built on another machine keeps them. A design named in another case than its file, such as `Design/A.html` for `design/a.html` on macOS or Windows, is refused with the file's own spelling, so one design never opens with two sets of comments.
- `save-comments` saves a round beside the design, in `rounds/<design name>/<N>/comments.json`. It keeps each comment whole or refuses the save and says why, and it never writes over a round. A round saved again, when later rounds exist, is told to pass `--round` with the next free round.
- The next round's `changes.json` names the comments each change answers. The next build shows each earlier comment as Answered, with its summary, or as Open. Show on an earlier comment outlines the element it names, such as the second of a list's cards. An open comment that names a screen or a state the design lacks is a `rounds.view` note that says to answer it in a later round.
- The round schemas and the tool refuse the same files, such as an empty comment or round, an id not written `r<round>-<n>`, or a comments file with no `round`. The guide's "Round files" part says which list may not be empty and each number's highest value.
- A round holds up to 200 comments of up to 2,000 characters, and a page shows up to 20 earlier rounds, 200,000 characters in all. The newest round a page can read always shows whole, and the rounds before it follow while they fit, with no gap; each round left out is a `rounds.limit` note that says to read its comments in its file. Nothing past a limit is cut in silence. Save turns off, with its reason, in a saved round or a full one.
- The page opens in the round after the last one saved beside the design, so the next export never names a round already saved. Back, Forward, the design's back control, and a typed link keep that round; only a link that names a round opens a saved one.
- Once every view is seen, the page says so and records no decision. A person tells their agent, in their own words, when the design is done.

### Screenshots

- `shots` prints the views a review needs, sized to the change: a whole design, `--changed-screen`, or `--changed-component`.
- A full pass takes every state at each frame in each theme, then text at 200% at the narrowest frame and right to left, on each screen's fullest state.
- `shots --capture` takes each view as a PNG with headless Chrome or Chromium. A view taller than its frame is pictured whole, up to 16,384 px.
- A picture's name joins its view's parts with dots, `<screen>.<state>.<frame>.<theme>`, then `.text-200`, `.rtl`, or `.<component>.<variant>`, such as `start.ready.320.light.png`, and a flow's screen `items:list` is written `items+list`. No id holds a dot or a `+`, so two views never share a picture, and a name reads back into its parts. Two screen ids that differ only by case, such as `Home` and `home`, are an `integrity.screen-repeat` problem, since a disk that ignores case would keep one picture.
- `--out` takes a round's pictures into the round's own folder, beside its files, and makes no output folder. `--frames` takes ids comma-separated, or repeated.

### The commands

- Thirteen commands: `check`, `build`, `screens`, `components`, `shots`, `stories`, `serve`, `project`, `new-design`, `new-design-md`, `save-comments`, `example`, and `guide`.
- A flag may stand anywhere on the line, and `open-prototype <command> --help` says what each one means.
- With `--json`, every command but `serve` prints one JSON object, in one envelope that `schemas/output.schema.json` holds.
- The exit code says what to do next: 0 done, 1 the design has a problem, 2 the request was refused, and 3 the tool failed. A refusal, `serve`'s among them, names its next step and its rule's id in one line.
- `open-prototype guide` prints the format, the frames, the shots, the round files, the review, and the settings. `open-prototype guide --reference` prints every name, rule, command, and exit code.
- `open-prototype example` writes Baseplate, a complete design to read: a SaaS starter kit with six flows, nine screens, 32 states, and seven shared blocks. Every control leads to a state that is true whatever state came before it, no control exists only to move a reviewer between states, and each list's columns hold across its rows. Its styles are mobile first: its sidebar folds behind a Menu toggle at 320 and stands open from 45rem. Its page is in `.prototype/views/.example/`, where no page of the project's own designs can be, and it writes over no file in an output folder of the person's, such as `--out-dir design`.
- A page is written at its design's own path in `views/`, so `build design/a.html --out-dir design` writes `design/views/design/a.html`. An output folder whose first part is `.example` is refused, since a design in it would take the example's page.
- `bun run compile` builds one binary that holds the tool and every file it ships.
- The tool is not on npm. Each release holds a binary for macOS on arm64 and x64, for Linux on x64 and arm64, and for Windows on x64, each run on its own system before the release, with a `SHA256SUMS` file and a signed build provenance for each binary and for the sums. From a clone, the tool runs with Bun.

### The design document

- The tool reads the project's `DESIGN.md`, in the open format of that name, version alpha. Each token becomes a CSS custom property that every design reads, such as `--color-surface`. Its front matter's `---` lines may end with spaces or tabs.
- A colour given for light and for dark becomes one role that follows the theme the viewer shows. A colour only one of them gives is a `system.theme` note at its line that says to add the other.
- The `system` rules find a value a design sets again to another value, `:root, .x { ... }` among them, and a token a design reads that the document lacks. No finding of the document stops a page; a tokens file that cannot be read, `system.tokens-file`, does.
- Each value is held to the form the format gives it: `rounded` and a component's `rounded`, `padding`, `size`, `height`, and `width` take a number with `px`, `em`, or `rem`; `spacing` takes a length in any unit CSS has, such as `16px`, `60ch`, or `100dvh`, or `%`, or a bare number, for a column count or a ratio; a bare `0` goes wherever a dimension does; a duration is in `ms`. Any other value is a `system.value` problem whose words say what the key takes. A design that reads a bare number of `spacing` where a length goes, such as `padding: var(--spacing-md)` with `md: 16`, gets a `system.unitless` note, since CSS drops that declaration.
- `open-prototype project` prints what a project holds: the document's tokens with their values in each theme, its components, its section headings, the token files, and the story index.
- `new-design-md` starts a design document with tokens and sections to fill in. Its body text and a form field's are 16 px, `1rem` at a line height of 1.5, as are the starter's, so iOS Safari zooms on neither. A design started after it reads the document's tokens; in a project whose document lacks some of the names the starter reads, the start keeps its own tokens for those, so it passes the check, with a note that names them.

### The skill

- The repository is a Claude Code plugin marketplace: `/plugin install open-prototype --marketplace thaithienvanid/open-prototype` gives Claude the skill and the `open-prototype` command, run from the plugin's own copy with Bun. On Windows, Claude Code runs the command through Git Bash.
- Antigravity, Codex, Muse Code, and OpenCode read the same skill, each installed once for every project. Antigravity installs the plugin from this repository's address through `.antigravity-plugin/plugin.json`, Codex and Muse Code install it from this repository as a marketplace, and OpenCode 2 or later installs it as a plugin, `opencode/server.ts`, which adds the skill and puts the command on the PATH of OpenCode's shells, with no import from OpenCode.
- `skills/prototyping/` teaches an agent when to prototype, what a good prototype is, and the loop from what the project holds to a compared build. It sends the agent to `open-prototype guide` for every fact, and names no harness.
- Agents review first. A fresh second agent, never the design's maker, reviews from the screenshots and saves a round, and the maker answers it, for three rounds at most, or until a reviewer finds no fault. Then the person comments, or decides in their own words that the design is done. A reviewer's round is one more than the highest round folder that holds a `comments.json`.
- Its references hold a review checklist of eleven checks, the steps of a review round, draft copy, a run with no person to answer, the loop on one small design, and layout. Draft copy is listed by where it stands: a key of the example data, or a label in the markup.
- Its layout reference, `references/layout.md`, says where and when an element stands, and teaches a design drawn mobile first: the narrowest frame first, in one column, each wider layout added and never undone; the same content at every width; no sideways scroll and no cut text at 320 and at 200% text; the title and the main action in a phone's first screenful; targets of 44 by 44 on a phone; body and field text of 16 px; and meaning never carried by colour alone. Checks 4, 5, and 8 of the checklist measure it, and a browser test holds the shipped example to the rules a number can hold.
- Its evals hold a cold run on a fresh agent, a run on an existing project, and a second agent's review, and `evals/evals.json` holds those three runs and twenty queries, half of which should load the skill.

### Safety

- The reader takes a design by an allow-list of elements and attributes. A script, an event handler, a form that submits, or a load from the network is refused, and the design gets no page.
- The page loads nothing. Its policy names one script, the viewer's, by its hash, and each frame is sandboxed with no script.
- The page holds no live address to another machine. A design's link that leaves its screen points to `about:blank` in the page, with the address the design wrote kept as text in `data-proto-href`. So pressing it opens no connection, and the viewer says that address.
- The tool sends nothing off the machine. `serve` answers on `127.0.0.1` alone, and only a request addressed to it. With no `--port`, it takes the first free port from 8765 to 8784, so a second design served at once still opens, and a design keeps its address from run to run. With `--lan` it answers a phone on the same network, by an address with a secret token.
- The tool reads and writes only inside the project, through no link, but for the comments file you give `save-comments`. It never writes over a design, a design document, or a saved round, on a disk with no hard links, such as exFAT, too.
- `--open` on Windows hands the page's address to Windows' own handler of URLs, with no shell, so no folder's name can run a command.
- The capture drives Chrome over a pipe, with no port open, turns off Chrome's own network use, and removes its profile however it ends, and never a profile whose capture still runs. It keeps Chrome's sandbox on, so it never runs as root.
- Section 12 of `docs/tech-spec.md` holds the threat model, each control with its test, and what is not defended.

### The systems and the checks

- The tool runs on Bun 1.4.4 or newer, with no runtime dependency. An older Bun stops every command, however it was started, with exit 2 and the step to update it.
- `bun run check` passes on macOS, Linux and Windows, each with Chrome. It runs Biome's lint and format check, the type checks of the tool and of the viewer, the viewer's drift check, every test with the browser tests on, and the compiled binary: its help, and, from a folder outside the repository, the example, its build, a design document, and the reference.
- On GitHub, a workflow runs the check on all three systems for every push to `main` and every pull request, and a newer push to a pull request cancels the run it replaces. A pushed tag runs the same check on the tag's commit before it builds the release's binaries, and publishes the release only once every file is on it.
- `sh tools/check-linux.sh` runs the same check on Linux with Chromium, in a container.
- `SECURITY.md` says how to report a vulnerability privately, and `CONTRIBUTING.md` how to send a change.

### Known limits

- The checks read the file and draw nothing. So contrast, target size, reflow, and focus need a look or the skill's review.
- The viewer is not tested in Firefox or Safari, or from a phone over `serve --lan`.
- No person has listened to the viewer with a screen reader yet.
- In a page forced past the reader, Chrome opens a connection on its own to a frame's address that the policy blocks. No byte goes over `http://`, and over `https://` Chrome's TLS hello reaches the host. Section 12 of `docs/tech-spec.md` says what it sends.
- Section 12 of `docs/tech-spec.md` lists everything not verified, and section 5 of `docs/product-spec.md` the later work and the decisions.
