# open-prototype: technical specification

This page is for a person or an agent who must change the tool with no one to ask. It says how the tool works: what each part does, which rule each part keeps, and which test holds that rule. What the tool is for, what it leaves out, and what comes later are in the [product specification](product-spec.md), so read that first, then section 2. Then read the section for the part you change, and section 14 for the steps.

To use the tool on a design, read `README.md`, run `open-prototype guide`, or load the skill in `skills/prototyping/`. This page does not teach the format to a designer.

**What this page does not copy.** The code owns some lists: the vocabulary, the allow-list, the rules, the commands and their flags, the exit codes, and the module rows. They are in [`docs/reference.md`](reference.md), which `open-prototype guide --reference` writes from the code. This page links to them.

**What is generated in this page.** `tools/tech-spec.ts` writes four parts of this page from the code. Each sits between two `generated` marks. Never edit one by hand. Run `bun tools/tech-spec.ts` after a change to what a part reads. The parts, in the order of the sections:

- Section 5: what the public entry exports.
- Section 9: the limits.
- Section 10: each command's usage and the keys of its JSON.
- Section 14: the device frames.

**What holds this page.** `tests/docs.test.ts` fails when:

- a generated part is stale;
- this page names a file, a rule, a flag, a command, or a `data-proto-` name that the code does not have;
- this page leaves out a command, a test file, a tool, or a module of the viewer;
- the example in section 3 no longer passes the check and builds;
- a count it states of the folders the package ships, the binaries a release builds, or the ways to compose, or a ceiling of the walk, differs from what the code holds.

### Terms

Each term has one meaning in this page, in the guide, and in the code. They are in alphabetical order.

| Term | Meaning |
| --- | --- |
| Block | a piece of markup in its own file, `blocks/<name>.html`, which a design uses by name with `data-proto-use` |
| Design | what a designer writes: one HTML file, with the flows and blocks it includes |
| Design document | the project's `DESIGN.md`, in the open format of that name: tokens in YAML, then prose; the one source of each value |
| Finding | one thing a check found, with its rule, its file, and its line; a problem or a note |
| Flow | a group of screens in `flows/<id>.html`, included by `data-proto-flow` |
| Frame | the box a design shows in, at a device's size; in the viewer, an `<iframe>` |
| Page | the one HTML file the tool builds: the viewer with a design filled in |
| Project | the folder a person runs the tool in |
| Repository | the tool's own source |
| Round | one pass of review: a file of comments, and later a file of the changes that answer them |
| Screen | one place of the design a person can be |
| State | one condition a screen can be in; a direct child of its screen |
| View | one state on one platform in one theme; the one thing a review counts |
| Viewer | the browser program in a page, which shows the design and takes comments |

## 1. What the tool is for

The [product specification](product-spec.md) says who the tool is for, the jobs it does, its scope, what it deliberately does not do, and the work left for later. This page owns none of those facts. It says how the tool does what that page promises, and each statement there links to the section here that makes it true.

### What it runs on

The tool runs on Bun 1.4.4 or newer and has no runtime dependency. Its three development dependencies are `typescript`, `@types/bun`, and `@biomejs/biome`, which lints and formats the source. `bun run compile` builds one binary that holds the tool and its assets. Bun's build can name another system as its target, so one machine could make the binary for macOS on arm64 and x64, for Linux on x64 and arm64, and for Windows on x64; a release builds each of the five on a machine of its own system, as the next heading says.

The floor is written once, as `engines.bun` in `package.json`. `run` in `src/cli.ts` compares `Bun.version` with it before it reads a word of the command line, so a Bun older than the floor stops every way in, `bun add -g`, `bunx`, and `bun run src/cli.ts` among them, with exit 2 and the step to update it; `bin/open-prototype` reads the same line and stops it before it starts the source. `tests/cli.test.ts` holds the first, and `tests/plugin.test.ts` the second. The floor is 1.4.4 because a Bun older than 1.4.0 keeps each write to Chrome's pipe in the tool's own process on Windows, so no call of the capture reaches Chrome (oven-sh/bun#27977), and 1.4.4 is the Bun every check runs with.

### Where it has run

The tool was built on macOS. `bun run check` passes on macOS, Linux and Windows: `.github/workflows/check.yml` runs it on GitHub's runner for each, with the runner's Chrome, for every change. `tools/check-linux.sh` runs it on Linux with Chromium, in a container. On Windows it runs every test but one, whose file name holds a control character, a name Windows refuses. On every system, a harness's own validator runs only where that harness's binary is on the PATH ([where the command comes from](#where-the-command-comes-from)). The code has branches for Windows: the places it looks for Chrome, the command that opens a page, and the error code a refused file gives there. Section 12 lists everything that no one has verified.

No release is published yet, because no version is tagged. `.github/workflows/release.yml` builds each of a release's five binaries on a GitHub machine of its own system, with Bun 1.4.4's `bun build`, its target named by the end of the file's name, such as `darwin-arm64`, and runs it there. A trial run of the workflow, started by hand on 2026-11-19 and publishing nothing, passed all five: each printed its version, started a design, and checked it, the macOS arm64 one on `macos-latest`, the macOS x64 one there under Rosetta 2, the Linux x64 one on `ubuntu-latest`, the Linux arm64 one on `ubuntu-24.04-arm`, and the Windows x64 one on `windows-latest`. The commands added to that run since, the example, its `build`, `new-design-md`, and the reference, have run from a binary on macOS arm64 only, in `bun run check`. No binary was run on an Intel Mac. Whether Bun's plain x64 targets need a processor with AVX2 is not known here; no baseline build is offered.

## 2. The boundary rule

**A design holds only the designer's content. The tool reads it through one small vocabulary of prefixed attributes, and adds everything else when it builds. The tool never writes its own parts into a designer's file.**

| The designer's | The tool's |
| --- | --- |
| The HTML document: its markup, styles, classes, ids, and copy | The page: the viewer, the page's policy, the two data blocks |
| The example data, in one fixtures block | The frames a design shows in, and the device table |
| The names of screens, states, components, and test ids | The names it sets inside a frame, and its own test ids, which start with `proto-` |
| The blocks, the flows, the tokens files, and the design document `DESIGN.md` | The output folder, and every file in it |
| `hidden`, `display`, and `!important`, on anything of the design | What is shown: the tool takes what it does not show out of the frame |

The rows run from the file a designer opens to what a reviewer sees. `DESIGN.md` is the project's own file in an open format. It holds no name of the tool's and nothing the tool reads back; `new-design-md` writes it once as a start, like `new-design`'s starter, and never touches it again.

### How the code holds it

1. **One prefix.** Every name the tool gives a meaning to starts with `data-proto-`. `src/format.ts` writes each name once. The reader, the checks, the page, the guide, and the reference take the names from it. The viewer takes them through `viewer/names.ts`, the one viewer module that may import the tool. It imports two modules: `src/format.ts`, and `src/contract.ts`, which writes once each other fact the tool and the viewer both read: how a key of the fixtures is looked up, a comment's id, control characters, and keys, the limits of a round, the frame a person sees first, the ids of the page's blocks, the ready signal, a view's link, and the type of the page config. The viewer's bundle carries what they hold.
2. **Nothing unprefixed decides what a design is.** The tool reads `<title>`, five `<meta>` names, and `data-testid`, which is the web's own convention. It reads `id`, `for`, `alt`, `href`, and the `aria-` names only to check them.
3. **A wrong prefixed name is a finding.** A `data-proto-` name outside the vocabulary is `structure.vocabulary`, with the nearest name. A name the tool sets, written by a designer, is `structure.tool-name`.
4. **What is not shown is not in the frame.** The viewer takes each screen and state it does not show out of the frame's document, and puts it back when it shows it (`viewer/frame.ts`). So no rule of a design can show what the viewer says is not shown, and the viewer needs no rule of its own for `hidden`. `hidden` and `inert` on `<html>` or `<body>` are refused, `read.document`, because they would blank every frame.
5. **The viewer looks for nothing unprefixed inside a design,** with three exceptions, for safety, geometry, and the web's own landmark: `a[href]`, so that no link navigates; `svg, img`, so that a comment's pin keeps clear of an icon; and `nav`, the navigation whose links it marks with where a person is.
6. **The viewer holds no live copy of a design outside a frame.** It reads the design into a document with no window (`viewer/design.ts`).
7. **The ordinary names the tool sets inside a frame are listed once,** in [what the viewer reads from the design](#what-the-viewer-reads-from-the-design). They are `hidden` on a panel and on the back control, `aria-current` on a navigation's link (`page`, or `true`), `aria-expanded`, the back control's `aria-label`, and two custom properties for a phone's system bars, `SAFE_AREA` in `src/format.ts`. The guide prints those two with one rule that leaves room for the bars. A design that sets `display` on its panel or its back control keeps `hidden` working with one rule of its own, which the guide prints.

### Tests that hold it

- `tests/viewer/boundary.test.ts`: a design that tries to show a state the viewer does not show; no element of the design in the viewer's own document.
- `tests/viewer/plumbing.test.ts`: a design with nothing of the viewer in it shows one screen in one state, and only the title slot gets a `tabindex`.
- `tests/viewer/layers.test.ts`: no viewer module but `viewer/names.ts` holds a name of the format, however the name is built.
- `tests/checks.test.ts` and `tests/attacks.test.ts`: a tool name and an unknown name are findings.
- `tests/stages.test.ts`: the guide lists every name of the vocabulary.

## 3. The format

### An ordinary HTML document

A design is one HTML document: `<!doctype html>` first, then `<html>`, `<head>`, and `<body>`, once each. The reader is an allow-list by place. `src/design/allow.ts` owns the allowed elements and attributes. In short:

- **The head** holds `<title>`, `<style>`, the fixtures block, and `<meta>`. A `<meta>` is `charset`, or one of five names with `content`, or the designer's own `Content-Security-Policy`. The tool never reads that policy and never carries it into a page.
- **The body** holds ordinary flow elements, SVG drawing elements with `title` and `desc`, and `<style>` directly in `<body>`.
- **One script** is allowed: `<script type="application/json" data-proto-fixtures>`, with no other attribute.
- **One template** is allowed: a list's item.
- **A link** is `#name` on `<a>` or SVG `<use>`, or `https://` on `<a>`. `#screen/state` is `structure.view-link`: a link to another view is `data-proto-go`.
- **An image** is a `data:image` URI on `<img>`, or a fixtures key through `data-proto-image`.
- **A comment** is `<!-- ... -->`, and `<!doctype html>` stands only first. A form a browser reads differently from a comment that ends at its first `-->` is refused: `<!-->`, `<!--->`, `<![`, `<?`, and `<!` that starts no comment, wherever it stands, and `--!` inside a comment, read from each `<!--` to its first `-->`, since `--!>` ends a comment in a browser. Outside every comment `--!` is text, such as `Wait--!`.
- **A font** is a file inside the project that a `url()` of an `@font-face` names, in a `<style>` or in a tokens file. [The reference's allow-list](reference.md#the-allow-list) gives its types, the folder each path is read from, and its limits. A font loaded from the network is `integrity.load`.

Anything else is `unsafe.markup`, and the design gets no page. Section 12 says why.

### The vocabulary

The whole vocabulary is in [the reference](reference.md#the-vocabulary), by kind: structure, content, behaviour, composition, and the names the tool sets. `open-prototype guide` prints the same names, each with one example that a test checks (`tests/examples.test.ts`).

### Screens and states

- A screen is a `<section>` with `data-proto-screen`. Its id is unique in the design, even with case ignored: two ids that differ only by case, a flow's counted as written, are `integrity.screen-repeat`, since their pictures would share one name on a disk that ignores case ([the capture](#the-capture)).
- A state is a direct child of its screen with `data-proto-state`. The states of a screen are the designer's own names, in the order the design draws them. A state anywhere else is `structure.state-place`.
- A screen opens in the state `data-proto-initial` names, else in its first state. A screen with no state is `structure.no-state`.
- An element inside a screen and outside every state shows with every state. An element outside every screen shows with every screen.
- A layer over a screen, such as a dialog or a sheet, is a state of that screen. So a person can link to it, capture it, and comment on it. A `data-proto-panel` is for a small disclosure that needs no view of its own.
- The guide suggests eight familiar state names. A name close to one of them is the note `structure.state-near-core`, never a problem.
- Every screen but the first must be reached from the first by `data-proto-go`, or it is `integrity.unreached`. A go outside every screen, such as a navigation's, counts from every screen.

### Platforms, themes, and views

A design declares its platforms and its themes in two `<meta>` lines. The reference lists the choices. With no line, the design is `web` and `light`. The tool never reads them from CSS.

A **view** is one state on one platform in one theme. It is the one thing a review counts. `shots`, the viewer's count, and the Board all use it.

A design follows the theme the viewer shows by `data-proto-theme` on the frame's root, or by `light-dark()` with `color-scheme: light dark`. A `prefers-color-scheme` rule follows the system only.

### Example data

A design holds at most one fixtures block, anywhere in its main file. A fixtures block in a flow or a block, and each after the first in the main file, is `read.fixtures` at its own file and line, and the design reads the main file's first (`fixturesBlock` in `src/design/load.ts`). It is one JSON object, read strictly: `NaN`, `Infinity`, and a key written twice are refused, at the mistake's own line of the file, counted from the line where the start tag ends, with its column. A finding inside the fixtures, such as a copy rule's, is at its own line the same way. `data-proto-text`, `data-proto-field`, `data-proto-list`, and `data-proto-image` read it. A key the fixtures lack is `integrity.fixture-key`. An image key names a file beside the design, or holds a `data:image` URI. The build reads each file into the page.

Each of the two names that fill a text means one thing, wherever it stands:

- **`data-proto-text`** names a key of the fixtures, from the top: inside a list's item and on a screen with `data-proto-source` too. So the words a screen says itself stay in the fixtures. A key that only an entry holds is a finding that says "use data-proto-field".
- **`data-proto-field`** names a key of the current item: the entry a list's item draws, or the chosen entry of a screen with `data-proto-source`. Inside a list on such a screen, the list's own entry wins. A field outside every item and every such screen is a finding, because it has no entry to read.

The check (`fixtureKeys` in `src/checks/integrity.ts`) and the viewer's filling (`viewer/fill.ts`) hold the same rule, because both look a key up with `fixtureValue` in `src/contract.ts`. `tests/checks.test.ts`, `tests/viewer/fill.test.ts`, and `tests/viewer/plumbing.test.ts` hold it. The fill is a pure module, so `tests/viewer/fill.test.ts` runs it with no browser.

### The format's version

A design names its format on `<html>`, with `data-proto-format`. `FORMAT` in `src/format.ts` is the newest format the tool reads. A newer one is `read.format`.

Three versions exist, each from one constant in `src/format.ts`:

| Constant | Versions | Changes when |
| --- | --- | --- |
| `FORMAT` | what a designer writes | a design must change to stay valid |
| `OUTPUT_VERSION` | every JSON the tool prints, and the page's settings block | a printed key is renamed, removed, or retyped |
| `ROUND_VERSION` | the round files a project keeps | a stored round must change to stay valid |

The rows run from what a person writes to what a project stores.

### One small complete example

This design has two screens, three states, a list that opens a detail screen, a title slot, and a back control. `tests/docs.test.ts` checks it and builds it.

```html
<!doctype html>
<html lang="en" data-proto-format="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="platforms" content="web ios">
<meta name="themes" content="light dark">
<title>Library loans</title>
<style data-proto-tokens>
:root { color-scheme: light dark; --space: 1rem; --target: 2.75rem; --surface: light-dark(#fafafb, #111317); --text: light-dark(#1c1e21, #dfe2e6); --edge: light-dark(#858b94, #6b717a); }
</style>
<style>
body { margin: 0; padding: var(--space); font: 1rem/1.5 system-ui, sans-serif; background: var(--surface); color: var(--text); }
button { font: inherit; min-height: var(--target); padding: 0 var(--space); border: 1px solid var(--edge); background: transparent; color: inherit; }
[hidden] { display: none !important; }
</style>
</head>
<body>
<button type="button" data-proto-back data-testid="app-back" hidden><span data-proto-slot="back-label" data-proto-text="back"></span></button>
<main><h1 data-proto-slot="title"></h1>
<section data-proto-screen="loans" data-proto-title="Your loans" data-proto-initial="ready">
  <div data-proto-state="ready" data-testid="loans-ready">
    <ul data-proto-list="loans"><template data-proto-item><li><button type="button" data-proto-go="loan" data-testid="loans-open" data-proto-field="title"></button></li></template></ul>
  </div>
  <div data-proto-state="empty" data-testid="loans-empty">
    <p data-proto-text="empty"></p>
  </div>
</section>
<section data-proto-screen="loan" data-proto-title="Loan" data-proto-parent="loans" data-proto-source="loans">
  <div data-proto-state="ready" data-testid="loan-ready">
    <h2 data-proto-field="title"></h2>
    <p data-proto-field="due"></p>
  </div>
</section></main>
<script type="application/json" data-proto-fixtures>
{ "product": "Library loans", "back": "Back", "empty": "You have no book on loan.",
  "loans": [{ "title": "The Dispossessed", "due": "Due back on 4 December" }, { "title": "Solaris", "due": "Due back on 11 December" }] }
</script>
</body>
</html>
```

Saved as `design/loans.html` in a project, `open-prototype check design/loans.html` prints `ok: 2 screens, 3 states, 5 test ids`, and `open-prototype build design/loans.html` writes `.prototype/views/design/loans.html`.

### Flows in separate files

Every design is an HTML file (`design/app.html`). As a design grows, it splits in place (`flow -> screen -> block`) without changing format:

| File | Holds |
| --- | --- |
| `<design>.html` | The main document: its `<style>`, `<nav>`, fixtures, and screens or `<div data-proto-flow="<id>" data-proto-title="..."></div>` placeholders. |
| `flows/<id>.html` | A fragment of a body: the screens of one flow, included by `data-proto-flow`. |
| `blocks/<name>.html` | A fragment: one reusable block, included by `data-proto-use`. |
| `rounds/<design name>/<N>/` | The design's review rounds. |

The rows run in the order the tool reads the files.

The tool joins them into one document before it walks it (`src/design/blocks.ts` and `src/design/flows.ts`):

1. It puts each block in place in the main file and in each included flow.
2. It writes each flow's screen ids again with the flow's id, so `detail` in the flow `items` is `items:detail`. It collects the flow's own screen ids first, with its blocks placed, and writes a `data-proto-go` or `data-proto-parent` again only when the flow holds the screen it names, by the part before any `/state`. A target the flow lacks stays as written and is looked up among the main file's screens, so a screen moved into a flow keeps its links to the screens left behind. A target that names a flow already stays too. A flow's screen therefore hides a main-file screen of the same id. A `data-proto-flow` inside a flow, or inside a block of one, is `flow.include` at its own file and line, since only the main file includes flows. A tag written again is one line, with a value's line break as `&#10;`, and the tag's own line breaks after it, so it keeps its line count.
3. It replaces each `<div data-proto-flow="<id>"></div>` with its flow's qualified markup.

Every line of the joined document keeps its file and line, so a finding names the file a person edits.

### The settings file

A project may keep `prototype.config.json` in its top folder. `SETTINGS` in `src/project.ts` owns its keys, and `loadProject` reads it strictly: an unknown key is refused. [The reference lists every key](reference.md#settings), with what it sets and its default, and an example file.

Each row of `SETTINGS` holds its key, what it sets, its default, and how it is read, so a new key is one row there, with its field in the `Project` type and its default in `loadProject`, both in `src/project.ts`. The rows are in alphabetical order, and the guide and the reference list them from the same table. The two folder flags of every command win over the file. A refused settings file is `request.settings`, exit 2. `guide` reads no settings, so a refused settings file never keeps a person from the guide and the reference that say how to fix it.

Two environment variables change what the tool does: `PROTOTYPE_OFFLINE=1` stops `serve` from starting, and `CHROME_BIN` names the browser for a capture. The settings file has no schema yet, which the product specification lists as [later work](product-spec.md#work-left-out-and-when-to-start-it).

## 4. Composition for a designer

A designer composes with five words (`flow`, `use`, `slot`, `list`, `tokens`). The guide's "Compose" paragraph prints each form.

### use: a block

`data-proto-use` puts the block of that name where the element stands. A block is `blocks/<name>.html` beside the design. `src/design/blocks.ts` places it before the walk.

- The block's one root element replaces the element that uses it. A block with more than one root is `compose.use`.
- `{{name}}` in the block's text or in an attribute's value takes the value of `data-proto-arg-<name>`, escaped as text. It can never add markup. A `{{name}}` with no argument is `compose.arg`. An argument no `{{name}}` of the block reads, a `{{name}}` in a nested use's argument among them, is `compose.unused-arg`, a note at the line of the element that uses the block, once for each use, since each use is its own fault.
- The element that uses a block is empty and closed, and holds no attribute but the use and its arguments. Each fault is `compose.use`. Nothing is merged, so nothing is lost in silence.
- A block may use another block. A cycle is `compose.cycle`.
- A block used twice takes its `id` through an argument, because each id is written once in a design.
- A block is never pasted into the file that uses it. So a block changed once changes everywhere.

A finding inside a block names the block's own file and line, and ends with "(used at `<file>:<line>`)". A block used in a block names each use out to the design's own file, such as "(used at `design/blocks/wrap.html:2`, itself used at `design/app.html:18`)", since a line of a block may be used many times. A fault of the block itself, such as a second root element or an argument's name, is told once, at its own line and its first use (`tell` in `src/design/blocks.ts`). A fault one use gives, such as a wrong argument, is told for that use. A repeated id or test id names the earlier one's own file, read at its column, since a line a block shares with the file that uses it holds both. `tests/controls.test.ts` holds each case.

### slot: where the tool puts content

`data-proto-slot` takes one of two names. Any other name is `structure.slot`.

| Slot | The tool puts there |
| --- | --- |
| `title` | the shown screen's title, from `data-proto-title`; a new screen and the skip link put focus there |
| `back-label` | the words of the back control |

The navigation is every `data-proto-go` inside `<nav>`. In each `<nav>`, the viewer marks the link to the shown screen, and only it, with `aria-current="page"`, and each link to a screen the shown one stands under (its parent, the parent's parent, and so on) with `data-proto-section`, so a design styles the section a person is in with one rule, the rule `nav [data-proto-section]`. When a `<nav>` holds no link to the shown screen, its link to the nearest screen above it also takes `aria-current="true"`: WAI-ARIA's `page` is the current page within a set of pages, which that link is not, and `true` the current item within a set, which it is. So a screen reader hears one current place in each navigation, and never two current pages. `markNavigation` in `viewer/frame.ts` does it, and `tests/viewer/fixes.test.ts`, "where a person is, in the design's navigation", holds it.

What shows at once is what stands outside every screen, one screen's own content, and one of its states. Among it, at most one `title` slot and one `back-label` slot may stand, and a second of either is `structure.slot`. So a back control that shows only in some states sits in each of those states. The message names the two places that show at once and where one may go. `slotRules` in `src/design/read.ts` holds the rule, and `tests/checks.test.ts` holds each case.

### list: one item over a list in the fixtures

`data-proto-list` names a list in the fixtures. Its one direct child is `<template data-proto-item>`, the item. `data-proto-field` fills a part of the item from its entry, and `data-proto-text` from the fixtures' top (section 3, "Example data"). `data-proto-limit` takes a whole number from 1. A wrong form is `structure.list`, and the viewer draws every entry of such a list (`tests/viewer/fill.test.ts`). A list names its key from the fixtures' top and its item reads one entry, so a list inside another list's item would have no key to name: it is `structure.list`, and no key inside it is checked.

A `data-proto-go` inside an item opens its screen for that entry: the viewer sets `data-proto-pick`, and the screen it opens names the list with `data-proto-source`. The viewer keeps the item template and draws the entries after it.

### tokens: one set of values for many designs

A tokens block is `<style data-proto-tokens>`. It is the one place where a colour or a depth value may be raw. Every other style reads a token with `var()`: a raw colour, in a style or an svg's attribute, is `paint.raw-color`, and a raw depth `paint.depth`.

A tokens file is a stylesheet inside the project. A design names its tokens files in `<meta name="tokens">`, or the settings name them for every design. The design's own list wins. The build places their text in one tokens block before the design's own styles. Nothing is copied into a design.

The project's design document comes first. `src/design/designmd.ts` reads its front matter, between two `---` lines that may end in spaces or tabs, as Jekyll and Hugo read them, and its `yaml` and `yml` blocks with `Bun.YAML.parse`, in the disk stage, with the line of each key; `src/design/system.ts` turns each token into a custom property by `SYSTEM_NAMES` in `src/format.ts`, holds each value to its form, and joins `colors.light` and `colors.dark` into one role, `light-dark()` of the two in a design that shows both themes. A colour only one of the two holds joins no role and is `system.theme` at its line, and a suggestion never names a member: a design that reads the role it would give is told to add the other, and the nearest name or the colour of a raw value names a member's role, never the member (`roleNames`). A reference to a member reads the member's role, so it follows the theme, but a member that names a member reads that member itself, so no role leads back to its own member. So the one tokens block holds, in order: the document's generated `:root` rule, then each tokens file, then the design's own tokens blocks follow in its styles. The document is the one source of each value: a value set again to another value in a rule that always applies is `system.override`, at that line, and a variant under a theme selector or inside `@media` is no override. `open-prototype project` prints each token's value as the page draws it after the token files (`src/project-facts.ts`): a `:root` rule's in both themes, and a rule of one theme's root in that theme. A name a token file sets in `@media` or under another selector prints `""`, because the tool does not follow that rule. A name of the document's prefixes that nothing sets is `system.unknown-token`. The forms are the format's own: `rounded`, a typography token's `fontSize` and `letterSpacing`, and a component's `rounded`, `padding`, `size`, `height`, and `width` take a Dimension, a number with `px`, `em`, or `rem`; `spacing` takes a number with a unit CSS has for a length or `%`, or a bare number, for a column count or a ratio, and a component's other properties take the same or a colour; the units are `LENGTH_UNITS` in `src/design/system.ts`, the absolute, font-relative, and viewport-relative units of CSS Values and Units Level 4, the small, large, and dynamic viewport units among them, read without regard to case, so `16foo` in `spacing` is `system.value` and in an unknown component property is left out; a bare `0` is a Dimension wherever one goes, written as `0`; a duration and a delay take `ms`. A reference takes the form of the token it names, so a padding that names a bare number of `spacing` is `system.reference`. A design declaration that reads a bare number of `spacing` as the whole of a box or size property, such as `padding`, `gap`, `inset`, `width`, `border-radius`, or `font-size`, or as a whole space-separated part of one, and not inside `calc()` or another function, is `system.unitless`, a note, since CSS drops it; a name the design or a tokens file sets itself is left to `system.override`. Every fault of the document is a `system` finding at its own line; none stops a page.

Each tokens file is checked as a tokens block, at its own file and line. A load from the network, and a `url()` or `@import` that names another file, outside an `@font-face`, is `integrity.load`, each with its own words. A `url()` of an `@font-face` in a tokens file is read from that file's folder, and one in a design from the design's folder, so a tokens file and its font files move together. A file that holds `</style`, `<template`, or a NUL character, or is larger than its limit, is `system.tokens-file`, and it stays out of the page. A tokens file the settings name that does not exist is a refused request. One the design names that does not exist is `system.tokens-file`.

## 5. Architecture

### The stages

The tool is a set of stages over plain data. Three stages read the disk: one for the settings, one for a design, and one for what the project holds. The stages after them are pure. Four more act on the world, and say so.

```text
Read the disk
  loadProject(root, flags) -> Project                 the settings file, the defaults, the device table
  readFiles(project, file) -> Files                   the one stage that reads the disk for a design
  projectFacts(project) -> facts, findings           what the project holds: its design document, token files, story index

Pure: the same input gives the same output
  load(files) -> Design                               flows and blocks placed, one walk, each line's place kept
  check(design, project) -> Finding[]                 every rule of the registry
  screensOf(facts), componentContract(facts)          what the design holds, as data
  shotList(facts, frames, request) -> Shot[]          the views to capture
  readRounds(roundFiles, name) -> rounds, findings    the earlier rounds
  page(input, viewer) -> text                         the built page

Act on the world
  writePage(project, design, text)                    writes the page into the output folder
  saveRound(folder, name, data, round, shown)         writes a new round, never over a file
  captureShots(pageText, shots, folder)               starts Chrome, writes pictures
  writeExample(project, kind)                         writes an example into the output folder
  serve(page, lan, port, say)                         listens until a signal
  listen(options) -> server, port                     listens until the server is closed: serve's own, for a composer
```

- `readFiles` (`src/design/files.ts`) reads the design's own file, its flows and blocks, each image its fixtures name, its tokens files, each font file an `@font-face` of its styles or its tokens files names, the project's design document, and its round files. A design named in another case than the disk spells it, such as `Design/A.html` for `design/a.html` on a disk that ignores case, is refused with the disk's spelling (`designPath`, held by `tests/paths.test.ts`, skipped on a disk that tells case apart): the design's id and its page's path follow its spelling, so the other spelling would open another round. Everything after it works on that data. The design document's YAML is parsed there, by `src/design/designmd.ts`, because no pure stage names `Bun.`.
- `projectFacts` (`src/project-facts.ts`) reads the design document with no design, for `open-prototype project`: a new project may hold no design for `readFiles` to read.
- `readStoryIndex` (`src/story-index.ts`) reads Storybook's index for `stories`, under the one path rule; `storiesOf` reads its stories, pure.
- `load`, `check`, `screensOf`, `componentContract`, `shotList`, `readRounds`, and `page` are pure: the same input gives the same output. `tests/layers.test.ts` follows every module they run and fails when one names the clock, the environment, the runtime's own, or chance: `Date`, `process`, `Bun`, `performance`, `globalThis`, `fetch`, a timer, `Math.random`, or a module of the runtime but `node:path` and `createHash` of `node:crypto`.
- `check` and `page` need the device table. They take it in the settings, as `project.devices`, which `loadProject` fills. So they read no file.
- No stage prints or exits. `src/cli.ts` composes the stages, prints, and exits. `tests/layers.test.ts` holds that too.

### The public entry

`src/index.ts` exports every stage and its types, so a test, a script, or another tool composes them without the command line. `package.json` exports it as the package itself, `"."`, so a project that installs the tool imports it by the name `open-prototype`, and the OpenCode plugin as `"./server"`; `tests/plugin.test.ts` imports both by name. `tests/stages.test.ts` runs a design through every stage through this entry alone. The command line runs every stage through it too. Its other imports are its own modules in `src/cli/`, where `src/cli/internal.ts` is its one internal door to the tool's helpers that are no stage, such as the path rule and the words of a count. `tests/layers.test.ts` holds both.

The values it exports:

<!-- generated:entry, by tools/tech-spec.ts: never edit by hand -->
`DEFAULT_PORT`, `EXAMPLE`, `EXAMPLE_FILE`, `EXIT`, `FORMAT`, `OUTPUT_VERSION`, `PROGRAM`, `READ_LIMITS`, `ROUND_LIMITS`, `ROUND_VERSION`, `RULES`, `Refusal`, `SYSTEM_NAMES`, `Unreadable`, `buildCommand`, `captureShots`, `check`, `componentContract`, `countsOf`, `exampleFolder`, `family`, `findingData`, `findingLine`, `guideData`, `guideText`, `levelOf`, `listen`, `load`, `loadProject`, `missingStories`, `newDesign`, `newDesignMd`, `outputFolder`, `page`, `pageConfig`, `pageStops`, `problemsOf`, `projectFacts`, `readFiles`, `readRounds`, `readSource`, `readStoryIndex`, `removePage`, `rulesOff`, `saveRound`, `screensOf`, `serve`, `settingsFor`, `shippedDevices`, `shotFrames`, `shotList`, `storiesOf`, `viewerAssets`, `writeExample`, `writePage`.
<!-- /generated:entry -->

A stage throws on purpose in two ways (`src/errors.ts`). `Refusal` is a refused request, and it carries the id of its `request.*` rule, which each refusal names: it has no default. `Unreadable` is a file that exists and cannot be read as text: it is not UTF-8, the system will not open it, or it is no plain file. Its message gives the reason and the step for that reason. Any other error is a fault of the tool.

`readText` in `src/fs.ts` reads each text of a design, the design document, a tokens file, a round file, and the settings file. It opens a file without waiting and reads it only when the system says it is a plain file, so a pipe or a device at one of those paths is told, never waited on. `readStoryIndex` opens Storybook's index the same way, through `readPlain`, which `readText` is built on, and refuses a pipe there as `request.file`. `project` counts a tokens file the settings name as there when anything is at its path, and reads it, with a design document or with none, so a pipe or a folder there is a `system.tokens-file` finding, never a file reported missing. `tests/errors.test.ts` holds each with a pipe at its path. `readFiles` drops one leading byte order mark from the design's main file, each flow, and each block, so a block saved with one is still one root element and none reaches the page; the mark stands before the first line, so no line moves (`tests/reader.test.ts`).

### The module rows

Each file of `src/` sits in one row, and a file imports only from rows above it, or from files before it in its own row. `src/modules.ts` owns the rows, and [the reference prints them](reference.md#modules). `tests/layers.test.ts` holds five rules over them. It reads every module with the TypeScript compiler (`tests/source.ts`), so a layout, a comment, or a string that looks like code reads as the language reads it, and each rule has a table of probes it must find:

1. Every file has a row, and imports only from above it. Every way a module names another counts: an import, an export from it, a side-effect import, a dynamic import, with or without the extension.
2. The pure stages, and every module they run, read no file, no clock, no environment, and nothing of the runtime's own.
3. Only `src/cli.ts` prints or exits.
4. `src/cli.ts` imports every stage from `src/index.ts`, and nothing else of the tool's but the modules of `src/cli/`. Its door, `src/cli/internal.ts`, holds only names.
5. No code decides by a finding's words, by any means. Code decides by the rule's id. A message is passed on, put into a text, or stored, and never compared, tested, looked up alone, read into, branched on, or destructured. A finding's whole identity may key a set that keeps each finding once.

### The data between stages

| Data | Made by | Read by | Its shape |
| --- | --- | --- | --- |
| `Project` | `loadProject` | every stage | the type in `src/project.ts`; no schema for the file yet |
| `Files` | `readFiles` | `load` | the type in `src/design/files.ts`: texts, images, font files, round files, and tokens files, each by its path, and the design document's YAML blocks with each key's line |
| `Design` | `load` | `check`, `page`, the manifests | the type in `src/design/load.ts`; `facts` is what the walk found, or null when the design cannot be read; `system` is the design document as tokens, or null |
| the project's facts | `projectFacts` | `open-prototype project`, an agent | `$defs.project` in `schemas/output.schema.json`, with the design document as `$defs.design_md`, the same shape the page's settings block holds |
| `Finding` | `check`, and the commands | the command line, the page | `$defs.finding` in `schemas/output.schema.json` |
| screens, components, shots | the manifests | an agent, a test, the capture | `$defs.screens`, `$defs.components`, `$defs.shots` in `schemas/output.schema.json` |
| the page's settings block | `page` | the viewer | `schemas/page-config.schema.json`, and the type `PageConfig` in `src/contract.ts` |
| round files | the viewer and `save-comments`, or a person | `readFiles`, `readRounds` | `schemas/round-comments.schema.json`, `schemas/round-changes.schema.json` |

The rows run in the order the data flows.

**Every output is an input.** The shot list that `shots` prints goes into `captureShots` as written. A finding's `file` is named from the project's top, so a person or an agent opens it from there. `tests/stages.test.ts` opens every file a finding names.

### The one walk

`walk` in `src/design/read.ts` reads the joined document once, over the tokenizer in `src/html/tokenizer.ts`. One pass gives every fact the later stages read (`Facts`, whose types are in `src/design/facts.ts`). It gives the document's head and body, and the screens with their states in drawn order. It gives the links, test ids, components, lists, slots, ids, the headings and main landmarks a person meets in each view, the page's `lang`, the text a person reads, and the style blocks. It also gives the structure problems and the markup the allow-list refuses. Each fact has its line in the joined text, and `load` maps that line to its file.

The tokenizer follows the HTML standard's tokenizer states for tags, comments, and raw-text elements. It reads a tag's attributes one character at a time, so a quote that opens a value after a name and `=` takes the rest of the text, as in a browser, and no pattern backtracks past it. It knows SVG and MathML content, where no element's text is raw, as a browser does. It builds no tree. Its cost is in proportion to the text. Each reader that keeps the open elements, the walk and the readers of blocks' and flows' hosts, keeps them in `OpenElements`, which closes elements as a browser does. A start tag first closes what the HTML standard's tree construction says it ends: an open `p` in button scope before a block such as `div`, `ul`, or a heading; an `li` before the next `li`, and a `dd` or `dt` before the next of either, unless a special element stands between; a cell, a row, a table section, a caption, or a column group before the table's next part; an `option` or an `optgroup` before the next, by the rules inside and outside a `select`, and before an `hr` in a `select`; an open `button` in scope, with every element inside it, before the next `button`, so two buttons never nest; and `rb`, `rp`, `rt`, and `rtc` inside a `ruby`. An end tag closes what the standard's rule for its tag closes: an element of the body's list, such as `div`, `section`, or `button`, a heading, a formatting element, `p`, `li`, `dd`, `dt`, or a table's part, only in its scope, so `</div>` beyond a table's cell closes nothing; and any other, such as `</span>`, the innermost element of its name, unless a special element stands inside it. A column group ends at any tag but a `col`. A template whose first start tag is a table's part reads as the part that holds it, so a list's item of rows reads as a `tbody` and one of cells as a row. Inside SVG or MathML a start tag closes nothing, and an end tag closes a foreign element of its name, or is read as HTML's. A `template`, a `noscript`, and a `select` bound every scope but the table's, so no tag inside one closes an element outside it, but a table's part closes a `select` in its cell.

The reader keeps no state of a browser's tree building beyond that: no list of formatting elements, no adoption agency, no moving out of a table, no dropped tag. Where a browser would build otherwise, `OpenElements` tells its reader a fault, the first at each tag or text, and the walk alone says it, as `structure.nesting`, a problem that does not stop the page, at the tag's or the text's own file and line, since it reads the joined text once, after blocks and flows are placed; the host readers tell none. The faults: a formatting element such as `b` or `a` closed by anything but its own end tag, at the end of the text aside; its end tag while a special element is open inside it; an `a` while an `a` is open; a `select` or an `input` inside a `select`; text or an element directly in a `table`, a section, a row, a column group, or a template read as one, but a table's part, a `template`, or a hidden `input`; a table's part where a table does not take it; `</p>`, `</table>`, or a section's end tag with nothing to close, and `</br>`; a heading's end tag while another heading is open; and `</option>` or `</optgroup>` past an element open inside it. After a fault the nesting is the reader's best guess. Some faults are stricter than a browser needs, which keeps the reader small: a `<b>` closed by `</td>`, or by a `</p>` with nothing after it, which a browser never opens again, and a stray `</table>` that it ignores; `tests/attacks.test.ts` keeps them in a table of their own, with Chrome reading each as the reader does. Nothing unsafe passes either way, since the allow-list reads every tag whatever its nesting, and markup that a browser moves out of SVG or MathML is already refused by it. So for every text the reader accepts with no `structure.nesting` and no finding that stops the page, its nesting of elements is Chrome's, but for the elements a browser adds that the text never wrote, a table's `tbody`, `tr`, and `colgroup`; no rule of the tool reads a table's rows by their parent. Each tag keeps where it is open and each element the innermost limit of each scope below it, so a lookup costs the same however deep the design, and an end tag that names no open element costs nothing. A host closed by a start tag, or by the end tag of an element around it, ends where that tag starts, and the tag stays in the design. `tests/attacks.test.ts` compares the tokenizer with the runtime's own HTML parser on a table of inputs, and holds the reader's nesting to a table of rows that a browser test holds to Chrome's own parser. It holds each fault to a row that a browser test shows Chrome builds otherwise, each strict fault to a row Chrome builds as the reader does, and the claim itself to a browser test that reads thousands of random texts from fixed seeds, made by `tests/nesting.ts` from the elements the allow-list takes, and compares each the reader accepts with Chrome's tree, element by element and word by word.

The CSS reader (`src/css/sheet.ts`, `cssSheet`) is the one model of a design's CSS. It finds each style element and each style attribute where the tokenizer reads one, so text that only looks like CSS, in a comment or in the words a person reads, holds none. It reads each by its braces, not with a tokenizer (section 15), with a comment read as a browser reads one, in a style element, a style attribute, and a tokens file alike (a `/*` in a string opens none, and one left open runs to the end of the CSS), a string and an unquoted `url()` kept whole, so the `;` of `url(data:image/png;base64,...)` ends nothing, and a custom property's `{ }` block read as its value, not as a rule. A declaration directly inside an at-rule nested in a rule, `.a { @media (x) { color: red } }`, is a rule of that selector under the at-rule, as CSS nesting reads it. A style attribute's text is read after its character references. It gives each rule with its selector text and the at-rules it stands in, each `@keyframes` block with its stops, and each declaration as written. The paint rules read the declarations as written, outside every tokens block; the `system` and `accessibility` rules read the rules and the keyframes.

### The shipped files

The tool ships its assets beside its code: the viewer, the device table, the starter, the design document's starter, and the example. `src/assets.ts` imports each one as a file, so the compiled binary carries it. A new shipped file needs its import there; `bun run check` and the release run the binary's commands that read these files from a folder outside the repository, so a file without its import fails there. `package.json`'s `files` names the six folders a package holds: `src`, `assets`, `schemas`, `skills`, `bin`, and `opencode`.

## 6. The page

### What a built page holds

A built page is `assets/viewer.html` with one design filled in. [The page contract](#the-page-contract), below, lists every part the tool fills and every part of the design the viewer reads. It is written by hand. `schemas/page-config.schema.json` is the exact shape of the settings block, and `tests/stages.test.ts` holds a built page to it.

`page` in `src/page.ts` fills the page in a fixed order:

1. The four text slots: the title, the subtitle, the line that says which command wrote the page (`{{written_by}}`), and `assets/viewer.css`.
2. The `fixtures` block, with each image read in as a `data:image` URI, then the `page-config` block right after it.
3. The page's policy, with the hash of the viewer's script and of each style block.
4. The design, into `<template id="product">`, last, so it can never move the page's own parts.

The design part is a tokens block with the design document's generated `:root` rule first, when the project has one, then the tokens files' text, then each `<style>` of the design's head, then the design's body with its fixtures block left out. In that part, `embedFonts` in `src/css/fonts.ts` writes each `url()` of an `@font-face` whose font file `readFiles` read as a `data:` URL of its media type, `font/woff2`, `font/woff`, `font/ttf`, or `font/otf`, so the font loads under the policy's `font-src data:`. Every other `url()` stays as written, and the policy blocks it. The page's settings block keeps each tokens file's text as written, for the System view. Also in that part, `inertLinks` rewrites the start tag of each `<a>` and `<area>` whose `href` or `xlink:href` names no place in its screen, so a value that does not start with `#`. That value becomes `about:blank`, and the address the design wrote goes in `data-proto-href`, as text. So the page holds no live address to another machine, and the link stays a link: a person can focus it, and the design's `a[href]` styles still match it. Chrome connects to a pressed link's address before the viewer cancels the press, as [what is not defended](#what-is-not-defended) says. A probe with Chrome 157 on 2026-11-19 showed that it never does so for `about:blank`. For `#` it connects to the page's own server under `serve`. The design file is never changed. The generated rule is the tool's own text around values held to their forms, and the rules that read a tokens file skip it, so no finding names a line of it.

### The page contract

The tool writes the parts below; the viewer reads them and nothing else of the tool's. The tool reads three things of the viewer: a view's link, which the shot list writes; the ready signal, `data-ready="true"` on the workspace, which the capture waits on; and the frame, by its id, which the capture pictures. `src/contract.ts` owns each of these names, the blocks' ids, and the link's keys and writer, `viewLink`, for both programs, and `PageConfig` there is the settings block's type in both.

#### Its data blocks

Each block is `<script type="application/json" id="...">`. Its JSON writes `<`, `>`, and `&` as `\u003c`, `\u003e`, and `\u0026`, so no value can close the block.

| Block | Holds | Shape |
| --- | --- | --- |
| `fixtures` | The design's example data, which `data-proto-text`, `data-proto-field`, `data-proto-list`, and `data-proto-image` read. Image fields hold `data:image/...;base64,` URIs; the build reads each file in. | One JSON object. `product`, when present, is a text. |
| `page-config` | The one settings block: who the design is, what to review, and the limits. It sits right after `fixtures`. | `schemas/page-config.schema.json` |

#### The settings block, field by field

The fields are in the order the page writes them, which the schema and `PageConfig` in `src/contract.ts` keep too. First comes the design's identity, then what it declares, then what the build placed, then its flows, and last its review.

| Field | Value |
| --- | --- |
| `schema_version` | `"1"`, the version of this block's shape. |
| `design_id` | 16 to 64 lower-case hex characters, from the project folder's own name and the design's path inside the project ([its state](#its-state)). The viewer keeps comments under `prototype-comments:<design_id>:round-<N>`. |
| `design` | The design's path inside the project, such as `design/app.html`. |
| `product` | The product's name for the header: one line of 1 to 60 characters. |
| `work_item` | The work item the design names, or `""`: 1 to 64 characters, no space, no control character. |
| `platforms` | The platforms the design declares, in its order, from `web`, `ios`, `android`, `desktop`. Default: `["web"]`. |
| `themes` | The product themes the design declares, in its order, from `light`, `dark`. Default: `["light"]`. |
| `html` | The design's own `<html>` attributes, `lang` and `dir` among them, less every `data-proto-` name: a frame's root takes them. |
| `body` | The design's own `<body>` attributes, less every `data-proto-` name: a frame's body takes them. |
| `tokens` | The tokens the build placed, each `{file, css}`, for the System view: the design document's generated block first, when the project has one, then each token file. |
| `design_md` | The project's design document, or `null`: `{file, version, tokens, components, sections}`. `tokens` holds each token the document places, then each colour role, as `{path, name, line, light, dark}`: its path in the document, its CSS name, its line, and its value in each theme with every reference followed (`""` for none), so the System view draws a role's swatch with no `var()` to follow. `components` holds each key of the document's `components` as `{name, line}`, and `sections` each `##` heading as `{heading, line}`. `open-prototype project` prints the same shape, with `exists`. |
| `frames` | The device frames, each `{id, name, platform, width, height, safe_area: {top, bottom}}`, in menu order. The first frame of each platform is that platform's default. |
| `flows` | The design's flows, each `{id, title}`, in included order; `[]` when the design includes no flow. |
| `rounds` | The earlier rounds, oldest first, each `{round, items}`. Each item is `{id, screen, state, testid, index, comment, type, by, done, shown_theme}`, whole: `id` is `r<round>-<n>`; `index` is which of the visible elements that share the test id the comment names, from 0, as the round file gives it, or 0 when it gives none, so Show outlines that element (`commentNodeOf` in `viewer/panels/pins.ts`); `type` one of `change`, `remove`, `add`, `question`; `by` is `""` for a person; `done` is true when a later round's changes answer it; `shown_theme` is `light`, `dark`, or `""`. A comment that a later round's change answers also has `answered_by: {round, summary}`: the round of the first change that names it, and that change's summary; an unanswered one has no such key. |
| `next_round` | The round a review opens in when its link names none: one more than the highest round beside the design that has a `comments.json`, readable or not, or 1 (`nextRound` in `src/checks/rounds.ts`). A broken file, a file of a newer version, and a round the limits leave out of `rounds` all count, so the viewer never opens in a round already saved. The viewer opens in the higher of it and one past each round `rounds` lists. |
| `rounds_path` | The folder of this design's rounds. |
| `findings` | The design's findings, each `{rule, level, file, line, message}`: `rule` is `<family>.<rule>`, `level` is `problem` or `note`, `file` is named from the project's top, as every finding the tool prints; `file` and `line` are null when the finding has no place. A round file that cannot be read is a `rounds.*` finding. |
| `limits` | `{comment_characters: 2000, comments_in_a_round: 200, rounds_shown: 20, characters_in_all_rounds: 200000}`. The viewer counts against the first two and disables Save over them; nothing is cut in silence. |

#### The slots the tool fills

| Slot | Filled with |
| --- | --- |
| `{{title}}` | The page's title: the design's `<title>`. HTML-escaped. |
| `{{subtitle}}` | The design's path. HTML-escaped. |
| `{{written_by}}` | One line inside an HTML comment that names the command that wrote the page. `--` is written `- -`. |
| `{{system}}` | `assets/viewer.css`. It may hold no `</style`. |
| `<meta http-equiv="Content-Security-Policy">` | The page's policy: the hash of the viewer's one script, and the hash of each style block of the viewer and of the design. |
| `<template id="product">` | The design for the frames, filled in last, as [what a built page holds](#what-a-built-page-holds) says: a `<style data-proto-tokens>` first, then the design's own styles and body. Every flow and block the design uses is already in place. |

#### What the viewer reads from the design

The design's names all start with `data-proto-`; `open-prototype guide` lists them, each with its meaning. The viewer reads: `screen`, `title`, `parent`, `initial`, `state` (a direct child of its screen, in the order the design draws them), `source`, `text`, `image`, `list`, `item` (the `<template>` that is a list's one direct child), `field`, `limit`, `go`, `back`, `toggle`, `panel`, `component`, `variant`, `slot` (`title`, `back-label`), and `data-testid`. At build, the tool sets `data-proto-href` on each link that leaves its screen, as text that holds the address the design wrote, and the viewer says that address when a person presses the link. The viewer sets, inside a frame and nowhere else: `platform`, `theme`, `pick`, `highlight`, `comment`, `commenting`, `section` on a navigation's link to a screen the shown one stands under, and the ordinary `hidden` on a panel and on its own back control, `aria-current` (`page` on the shown screen's link, or `true` on its nearest linked ancestor's in a navigation with no link of its own), `aria-expanded`, the back control's `aria-label`, and the root's two custom properties for a phone's system bars, top and bottom, which `SAFE_AREA` in `src/format.ts` names. A move to another view, a screen, a state, or a list's entry, gives each panel again the `hidden` the design writes, read the first time the panel shows, so a menu opened to move is closed on the screen it opens; the same view drawn again, for a theme or a frame, keeps what a person opened (`show` in `viewer/frame.ts`, held by `tests/viewer/fixes.test.ts`). A design never writes a name the tool or the viewer sets. The viewer never sets or removes `hidden` on a screen or a state: it takes the screens and states it does not show out of the frame's document, and puts each back when it shows it. The design's `<html>` and `<body>` hold no `hidden` and no `inert`.

### Where a page goes

`writePage` in `src/output.ts` writes a page at `<out-dir>/views/<the design's own path>`, the path from the project's top, so `build design/a.html --out-dir design` writes `design/views/design/a.html`. The example alone, a design below its folder `<out-dir>/example/` (`exampleFolder`), takes its path below that folder after `.example/`, so its page is `<out-dir>/views/.example/app.html`. A project never keeps a page: the tool writes it again from the viewer as it stands. When a design's findings stop its page, `removePage` removes its old page, under the same path rule as the write.

No two designs share a page, and no design takes the example's. The path rule lets no part of a design's path outside the output folder start with a dot, so its page never starts with `.example/`. A page of a design inside the output folder starts with the output folder's path, and `loadProject` refuses an output folder whose first part is `.example`, so that page never does either; a part named `.example` deeper in such a path, as in `design/.example/a.html`, changes nothing. Two designs in the example's folder differ as their paths below it do.

An output folder the tool makes, or finds empty, such as a `.prototype` made by hand, gets an ignore file at its top, so version control skips all it holds. One that already holds something, such as `design/` or `docs/` named by `--out-dir` or `out_dir`, is the person's, and gets none, so it hides none of their files; `outputFolder` tells them apart by whether its `mkdirSync` made the folder, or the folder is empty. A person who removes the ignore file keeps it removed. `shots --capture` makes the output folder only when its pictures go into it: with `--out` naming a folder outside it, such as a round's folder, it makes no output folder and no ignore file.

### What stops a page

Only a finding of a rule whose row says so stops a page (`stops` in the registry, read by `stopsPage` in `src/finding.ts`; [the reference](reference.md#rules) prints it for each rule). Each such rule is a problem, and the type of a row says so. Every other problem is shown in the page, in a banner. When a page is stopped, `build` removes the page an earlier build wrote. The limit on printed findings never cuts a finding that stops a page.

### The policy and the sandbox

Three layers guard a page. Each holds alone.

1. **The reader.** The allow-list refuses markup that could run or load something, so such a design gets no page.
2. **The policy.** `viewer/viewer.html` holds the page's `Content-Security-Policy`. It starts from `default-src 'none'`. `script-src` names one script, the viewer's, by its hash. `style-src-elem` names each style block by its hash: the viewer's, the frames', and the design's. Images and fonts are `data:` only. `base-uri` and `form-action` are `'none'`. Style attributes stay allowed, because a design's markup holds them and a hash cannot name one.
3. **The sandbox.** Each frame is an `<iframe sandbox="allow-same-origin">` with no `allow-scripts`. It is a `srcdoc` document, so it takes the page's policy too.

One more guard stands beside them. Outside its `<template>`, a design's markup would be the viewer's own page, where the policy cannot stop a redirect. So `staysInTemplate` in `src/page.ts` refuses any markup that ends inside a tag or a comment, or whose `<template` and `</template` are not real, balanced tags. The walk makes the same faults findings first.

A data block's escapes keep each value inside it ([its data blocks](#its-data-blocks)). The hash of a style block comes from the tokenizer's own `<style>` elements, outside SVG and MathML, so a style hidden in an SVG text is never named.

## 7. The viewer

The viewer is the browser program in the page: `viewer/`, TypeScript, no framework. It has its own type settings (`viewer/tsconfig.json`) and its own tests (`tests/viewer/`).

### Its modules, by kind

`tests/viewer/layers.test.ts` holds a table of every module and its kind. A pure module reads only its arguments and names nothing of the page. A page module touches the page and never imports `viewer/main.ts`. A new file gets a row there, in the kind that is true for it. A new view needs no row: a file of `viewer/views/` is a page module by its folder. It reads the viewer's source with the TypeScript compiler, as `tests/layers.test.ts` reads the tool's.

| Kind | Module | Holds |
| --- | --- | --- |
| pure | `viewer/comments.ts` | a round's comments as data, a stored record's comments read whole, the count of a comment's characters, the two texts a round is exported as |
| pure | `viewer/fill.ts` | a frame's document furnished, and a part of the design filled from its fixtures: each text, each field, each image, and each list's entries |
| pure | `viewer/geometry.ts` | sizes and positions: how a frame fits, where a pin sits |
| pure | `viewer/keys.ts` | the key table: which action a key press means |
| pure | `viewer/link.ts` | the deep link, read and written |
| pure | `viewer/names.ts` | every name the viewer reads in a design or sets in a frame, from `src/format.ts`, the facts of the page contract from `src/contract.ts`, and the frame's own rules |
| pure | `viewer/rounds.ts` | which comments of the earlier rounds are still open |
| pure | `viewer/seen.ts` | the places a review looks, and the next view not seen |
| pure | `viewer/tokens.ts` | a design's tokens, read for the System view outside comments and strings, with a value under the system's dark setting as the dark one; and the value a sample paints on each side, each `var()` read from the design's tokens and each `light-dark()` as its side (`paintOf`), so no sample reads the viewer's own custom properties |
| pure | `viewer/words.ts` | every text a person reads, each written once |
| page | `viewer/context.ts` | the state's types, and the actions the page modules may call |
| page | `viewer/design.ts` | the design as the page holds it: its markup in a document with no window, its fixtures, the settings block |
| page | `viewer/dom.ts` | the viewer's own elements, found by id and typed; the one helper that makes an element |
| page | `viewer/frame.ts` | a frame's document: built, filled from the fixtures, and set to one screen in one state, with its title and back control, and its navigation marked: the current page, and the section the screen stands under |
| page | `viewer/plumbing.ts` | the title slot, found by the format's own name |
| page | `viewer/store.ts` | the browser's storage |
| page | `viewer/panels/bars.ts` | the top bar, the display bar, the dock, the shortcut sheet, the banner, the toast, what is announced |
| page | `viewer/panels/comments.ts` | the Comments tab: pick an element, write a comment, and export the round |
| page | `viewer/panels/earlier-rounds.ts` | the earlier rounds' comments, each open or answered, below this round's |
| page | `viewer/panels/inspector.ts` | the side panel's two tabs, and Build details |
| page | `viewer/panels/pins.ts` | where a comment points in the frame: the elements a comment can name, and a numbered pin on each |
| page | `viewer/panels/rail.ts` | the Screens panel: the round, the views seen, every screen with its states |
| page | `viewer/views/board.ts` | the Board: a row for each screen, its name, then its own states in drawn order, each picture with its name under it; Fit, down to its floor (`FIT_FLOOR`), and the arrows between rows |
| page | `viewer/views/compare.ts` | Compare: a screenshot of the built interface beside the frame, or under it |
| page | `viewer/views/prototype.ts` | the Prototype view: the one frame a person clicks through, and full screen |
| page | `viewer/views/system.ts` | the System view: the tokens, and each component with a specimen of every variant |
| page | `viewer/views/table.ts` | the table of views |
| main | `viewer/main.ts` | the state, the one redraw, the key actions, and the wiring |

The rows run by kind, then by folder, then in alphabetical order.

A page module reads nothing of the page when it loads, outside a function, but what the layer test's `AT_LOAD` names: `viewer/design.ts` reads the design the tool wrote into the page, `viewer/dom.ts` takes two element types and the two media queries the bars follow, and `viewer/panels/rail.ts` the media query of the system's theme. No module writes the page when it loads, so the order the bundle runs the modules in cannot change what each reads.

Two rules of the layer test keep the viewer changeable. No module but `viewer/words.ts` holds a text a person reads. No module but `viewer/names.ts` holds a name of a design. The test reads a name built in pieces and a sentence in a template literal too.

### Its state

`viewer/main.ts` makes one context (`Ctx` in `viewer/context.ts`) with four parts:

- **The view:** what the page shows, kept in the address as a deep link, `#<screen>/<state>?theme=dark&frame=ios`. `LINK_KEYS` in `src/contract.ts` owns the keys a link may hold, and `viewLink` there writes every link, the viewer's and the shot list's, so a renamed key does not compile where a link is written or read, and each key it holds is one the viewer reads (`tests/viewer/modules.test.ts`). A flow's `:` is written plain, as `#items:list/populated`, since a `:` is legal in a fragment and no screen id or state holds `/` or `?`; the reader takes `%3A` the same. A link leaves out each value that is the default, and the frame this window opens in on its own: a frame the link named, or a person picked, is written, by the address and by Copy link alike (`linkBase` in `viewer/panels/bars.ts`). A move to another view adds a history entry, and a go to the view already shown adds none. The view's tab is the one tab the page shows, and only `setTab` changes it.
- **The interface state:** which panels are open, and whether the single-key shortcuts act.
- **The entry shown:** the entry of a list a screen with `data-proto-source` shows. A go inside a list's item sets it; any other go from the frame keeps it only from a screen of the same list, and else opens the first entry, as a link does (`onFrameClick` in `viewer/views/prototype.ts`).
- **The comments:** this round's comments, the views seen, and the comment form.

One function, `apply`, draws every part from the state, in one order. A change goes through `set`, `go`, or `setTab`, which checks the value against the design, draws, and writes the address. A page module never imports `viewer/main.ts`: it gets the context from its `wire...` function.

The viewer keeps a design's comments and the views seen in the browser's storage, under `prototype-comments:<design id>:round-<N>`. The design id is a hash of the project folder's own name, the last part of the project root's path, and the design's path inside the project (`designId` in `src/design/files.ts`, held by `tests/page.test.ts`). So it is the same on every machine that builds the project and in every checkout of one folder name, and it carries no hash of a home folder, since a built page travels to a reviewer; two projects of other names keep their comments apart. What still collides: two projects whose folders share a name and whose designs share a path share one id, and so one record. The record also keeps the design's version, a hash of its markup and of its fixtures, which hold its copy and its images (`version` in `viewer/design.ts`). Views seen on another version count as not seen, and the page says so; the same design built twice keeps one version (`tests/viewer/review.test.ts`). A stored record is untrusted, since any page opened from a file shares the storage and can write it. `commentsOf` in `viewer/comments.ts` keeps an item only when each field it holds has its type and its shape, as the comments schema takes it, and only the first item of an id; the Comments tab says how many it left out, and an item left out is not shown and not exported, so an export holds nothing the schema refuses (`tests/viewer/modules.test.ts`, `tests/viewer/fixes.test.ts`). Storage may be missing or refuse. Then the page holds the refused record in memory, and each later change, a round opened again, and a change in another tab start from it, so the older stored record never replaces a comment. The toast says once, with the outcome it follows, that the comments live in this tab alone, so a person downloads the round before the tab closes.

### Its build into one file

`bun run build:viewer` runs `tools/build-viewer.ts`. It bundles `viewer/main.ts` into one script inside one strict function, so no name of the viewer is left on the page, and writes two files, both committed:

- `assets/viewer.html`: `viewer/viewer.html` with the script, the chrome's styles (`viewer/styles/chrome.css`, `viewer/styles/devices.css`), and the frame's rules in place.
- `assets/viewer.css`: `viewer/styles/tokens.css` and `viewer/styles/components.css`, which the tool places in each page.

`tests/viewer/build.test.ts` fails when a shipped file is not what the sources build. The shipped script depends on the bundler's version, so run the build again after an upgrade of the runtime. The bundle is not minified, so a person can read the shipped script.

### Its views table

`VIEW_TABLE` in `viewer/views/table.ts` is the one place a view is named. A row is one of two kinds:

- **A view a tab opens:** Prototype, Board, System. Its row gives its tab's label, the panel it builds, its render function, the element whose `data-ready` says it is ready, and what it does when it opens.
- **A view shown beside another:** Compare, with the Prototype's frame: beside the frame, or under it when the frame is too wide for both. Its row gives its button's label, title, and icon, and its part.

The table builds each tab, each panel, and each button. `viewer/viewer.html` holds no tab, no panel, and no button of a view. `tests/viewer/views.test.ts` adds a view to a scratch copy by its own file and one row, and compares every other file of the copy with the repository's.

### Its keys and words

- **Keys.** `keyAction` in `viewer/keys.ts` is the key table: a key press and what is open give one action, or none. `viewer/main.ts` maps each action to what it does. The shortcut sheet, which `?` opens, lists the keys for a person. A person can switch the single-key shortcuts off. J and K step through the states in drawn order, on into the next screen; on the Board or the System view a step stays in that view, and in the Prototype a step into another screen adds a history entry (`stepState` in `viewer/panels/rail.ts`). A redraw that draws a focused control again, such as the next step under the frame or a row of Build details, focuses it again by its test id (`keepingFocus` in `viewer/dom.ts`, held by `tests/viewer/design-pass.test.ts`). A single key never acts while a person types: in a field, in an element of the design that is editable or inside one, or in one with `role="textbox"` (`typesText` in `viewer/main.ts`, held by `tests/viewer/fixes.test.ts`).
- **Words.** `viewer/words.ts` holds every label, sentence, toast, and announcement. A text that takes a value is a function.
- **One word for one thing.** "View" is the counted thing only. A tab is a tab: the link key is `tab`, and the tabs' test ids start with `proto-tab-`. The left panel is the Screens panel everywhere. `VIEW_TABLE` and `viewer/views/` keep "view" as the code's own word for a module that a tab opens.

### The Board

The Board (`viewer/views/board.ts`) is one row for each screen at every width: the screen's name, its count seen, and the screens it opens, then its own states left to right in the order the design draws them, each a picture of the frame with its name under it. A state another screen has leaves no empty cell, so the board is as wide as its longest row. With Every state off, a row keeps its first state. Wide, the names sit in a column to the left, where the arrows between screens join them (`drawFlows`); at phone width each name takes a line over its row, and the row scrolls on its own.

Wide, the board is a canvas in the artboard: a drag pans it, and the wheel, Fit, and 100% zoom it. The window never scrolls sideways; a long row is the artboard's to pan. Its own text keeps its size on screen, since it divides by the zoom, and the column of names keeps its width. Fit shows the whole width, but never below `FIT_FLOOR`, a zoom of 0.75, where a web frame's picture is 96 px wide and a phone's 75: smaller, one state no longer tells from the next. Past it the board scrolls. A name under a picture keeps its size down to that floor too, and breaks a word longer than the picture rather than spill past it. A zoom redraws the arrows, since a row's height follows its text. `tests/viewer/design-pass.test.ts` holds each row's states in drawn order, no cell that is not a state, no name cut, the floor, and a window that never scrolls sideways, on the example and on a screen of twelve states, at 1440, 1024, and 390 wide, in both themes, at Fit and at 100%.

### How it is tested

The browser tests start one headless Chrome through the tool's own pipe client, `DevTools` and `launch` in `src/capture.ts`. They run only with `PROTOTYPE_BROWSER_TESTS=1`. Section 13 lists each file. The three that hold the most:

- **The walk** (`tests/viewer/walk.test.ts`): a person's steps through both examples, by key and by pointer. After each step it compares the deep link, the focused control, the counts, and what was announced with `tests/viewer/walk.recorded.json`. It also holds the Tab order at two widths.
- **The ring probe** (`tests/viewer/rings.test.ts`): no control's focus ring crosses a sibling, its group's edge, the window's edge, or a scrolling parent. It runs at the narrowest and the widest width, in both themes, with each layer open, by keyboard and after a pointer click.
- **The probes** (`tests/viewer/fixes.test.ts`, `tests/viewer/design-pass.test.ts`, `tests/viewer/text-size.test.ts`): each visual and interaction rule as a number or a state read in the browser, never a look at a picture.

## 8. The checks

### The registry

`RULE_ROWS` in `src/finding.ts` holds a row for every rule and every outcome of a command, by its id, and `RULES` in `src/checks/rules.ts` gives each its check. `RuleId`, the type of every finding's and every refusal's rule, is derived from the table, so an id it lacks is a type error. A row holds the id's level; whether a finding of it stops the page; `means`, one line of what is wrong when it fires, in the words a person would search for; for a rule that answers to a success criterion of WCAG 2.2, `wcag`, the criteria as data, each a key of `WCAG` beside the table with its name and level; and, for an outcome, `outcome`, what ends the command it comes from. [The reference prints the rules](reference.md#rules) from these rows: each rule's id, level, whether it stops the page, its meaning, and its criteria, then, apart, each outcome with its meaning and its exit code. It prints a column for `since` only once some rule's `since` is above 1.

**A rule is a value:** `{ id, since, level, stops, outcome, check(design, project) -> Finding[] }`.

- **`id`** is `<family>.<rule>`. A script acts on a finding by its id, never by its words.
- **`since`** is the design format the rule arrived in. A rule is on for a design whose format is at least its `since`. Every rule's `since` is 1 today, because format 1 is the first.
- **`level`** is `problem` or `note`. A problem makes the exit code 1. A note never does.
- **`stops`** says a finding of the rule stops the page: the design cannot be read, its markup is unsafe, or the page would not be the design it shows. Only a problem stops a page: a row with `stops` and the level `note` is a type error.
- **`outcome`** says the id is an outcome of a command, not a rule a design is checked by: the seven `request.*` ids, `tool.failed`, and `integrity.more`, which counts what the findings limit cut. No reading of a design gives one, no setting turns one off, and each keeps its id, its family, and its place in the JSON. A pass that gives one is a fault of the tool.

### How a finding is found

Rules that one reading finds together share a pass. `PASSES` in `src/checks/rules.ts` lists the passes: the load's own findings, the walk's issues, the integrity checks, the control rules, the paint rules, the copy rules, the device rules, the flow rules, the images, the rounds, the system rules, and the accessibility rules. The design document's own findings sit beside the tokens files', named from the project's top. Each pass runs once for a design, and each rule takes its own findings from the result.

A pass that gives a rule id the registry lacks is a fault of the tool: `check` throws, and the command exits 3. So no finding is dropped in silence, and a test holds that every id the code gives has a row.

`check` then leaves out each rule that is off, drops a finding that repeats another, and sorts the rest by file, in reading order, then by line; a file outside the design's own, the design document, a tokens file, or a round file, comes after them, by its name, so the findings of one file stay together. Several elements of one text that give the same words on one line are one finding that says how many, "(2 on this line)", where another use of a block is told once. Past the findings limit it keeps every finding that stops the page, then fills the limit with problems, then with notes, and prints what it keeps in the same order. One last finding, `integrity.more`, a note, says how many problems and how many notes it cut. So a design with a problem always prints one and exits 1, and a design of notes alone exits 0.

### Families

A family is a topic: it groups rules by what they read, and says nothing of what a finding does. [The reference lists the families](reference.md#rules). What a finding does is its row's: whether it stops the page, as `structure.slot` and `compose.use` do beside `structure.name` and `compose.unused-arg`, which do not. Two families hold outcomes alone: `request`, a refused request, exit 2, whose findings come from a `Refusal`, never from a design; and `tool`, a fault of the tool, exit 3.

The family `compose` holds every fault of a block's use. A fault that breaks the page, such as a missing block, a `{{name}}` with no argument, a cycle, or too many uses, stops the page; an argument the block never reads, `compose.unused-arg`, leaves the page as it would be, so it is a note.

### How a project turns a rule off

The settings file names each rule to turn off, as `"rules": {"<id>": "off"}`. `rulesOff` in `src/checks/rules.ts` refuses a key that is no rule, a value other than `off`, a rule whose row says it stops the page, and an id whose findings no setting reaches, each with its reason: each outcome, by what ends its command (`integrity.more` counts what the limit cut, a `request.*` id is a refused request, `tool.failed` a fault of the tool), and `stories.missing`, the one finding of a command run only when asked. A key that is no id of the registry, an id renamed before the first release among them, gets the words every unknown rule gets, which name the reference. A merged rule is turned off whole. `check` leaves out each rule that is off, `projectFacts` (`src/project-facts.ts`) does the same for `project`, and `stories` reads its other findings from `check`. Each refusal is `request.settings`, exit 2, and names the rule. Each line `check` prints ends with its rule's id in square brackets, so a person finds the id to turn off without a second command.

### What each family reads

The list follows the order of the reference.

- **`read`, `unsafe`, `structure`, `compose`:** the walk, `src/design/read.ts`, with the allow-list in `src/design/allow.ts`, the blocks in `src/design/blocks.ts`, and the flows in `src/design/flows.ts`, whose faults of reading a flow are `flow.include`. `read.depth` is a design nested deeper than the reader's limit: the walk keeps no other finding of what it read, a fragment, so the rule stops the page, and no manifest is printed of it. `structure.nesting` is markup a browser nests otherwise than the reader reads it, such as a `<b>` closed by `</p>` or text directly in a `<table>`, from the faults `OpenElements` tells (section 5, "The one walk"); its words say what a browser does and how to write the markup. It is a problem that stops no page, since the allow-list reads every tag whatever its nesting, so nothing unsafe passes either way; as every `structure` problem but `structure.no-screen` and `structure.no-state`, which leave each other screen as it reads, it keeps `screens`, `components`, and `shots` from printing a manifest, as does every finding that stops the page (`readable` in `src/cli.ts`).
- **`integrity`:** `src/checks/integrity.ts`. Every link, parent, and first state names a thing the design has. No test id repeats on a screen. Every key the design reads is in its fixtures, and a text's or a field's key holds a string, a number, or a boolean in each entry that holds it, since the viewer writes a value with `String()` and null as nothing (`viewer/fill.ts`). The first screen reaches every other. Images are in `src/checks/images.ts`, and font files in `src/checks/fonts.ts`, over the `url()`s of each `@font-face` that `src/css/fonts.ts` finds by their braces. A control's test id and the ids `aria-labelledby` names are in `src/checks/controls.ts`, over the controls the walk records as facts, beside the three `accessibility` rules of controls: an image's alternative, a button's or a link's name, and a field's label. Text, a runtime fill, or an image's `alt` names the open buttons and links around it, unless an element with `hidden` stands between them, or the text is under `aria-hidden="true"`, as a browser names a control by none of its hidden content.
- **`flow`:** `src/checks/flows.ts`.
- **`paint`:** `src/checks/lint.ts`, over `src/css/sheet.ts` and `src/css/colors.ts`. A raw colour is read from a declaration's property and value as the CSS reader reads them (`rawColor`): the property in any case, the value with each string and `url()` cut out, so `url(#fade)` and `content: "red"` hold none; a property holds a colour when its name holds `color`, `background`, `border`, `fill`, `stroke`, `outline`, `shadow`, `mask`, `filter`, or is one of the shorthands `text-decoration`, `text-emphasis`, and `column-rule`. A style attribute is read after its character references, as a browser reads it, a reference to a line break as a space so each line keeps its number. A load is a `url()`, an `@import`'s string, or a string of an `image-set()`, read outside comments and other strings; each names its own address. An `@namespace`'s `url()` or string names a namespace and is no load. One that is a `data:` URI or a `#name` is clean. One from the network, or one that names a file, is `integrity.load`, an `integrity` rule since it is about what the page cannot load, with the words of each kind, once of each kind on a line; the page's policy loads an image only as a `data:` URI, so a file is one unless it is a `url()` of an `@font-face`, which the font rules read.
- **`copy`:** `src/checks/lint.ts`. It reads the text a person reads and each string value of the fixtures, read as JSON reads it, at the line it stands on (`fixtureCopy`), never a key of the fixtures, a `data:` URI, a class name, or an attribute. `TODO`, `FIXME`, and `TBD` count in capitals only. A `{{name}}` left in the copy is `copy.placeholder` too: blocks are filled before any check reads the design, so no rule passes a `{{` over, in a link, a key, an id, or a paint.
- **`system`:** the design document, read by `src/design/system.ts` at its own lines: `system.read`, `system.name`, `system.value`, `system.reference`, `system.empty`, and `system.version`. Then `src/checks/system.ts`, over a design that reads it: `system.unknown-token`, `system.override`, `system.extra-token`, `system.component`, `system.theme`, and `system.unitless`. An override reads only a rule that always applies to the root, a top-level rule whose selector list holds `:root` or `html`, such as `:root, .x`, outside every at-rule but `@layer`, and two values are the same when they are equal in each theme the design shows, every `var()` of the document followed. A value that stays unresolved gives no finding. No rule of the design document stops a page, because the document is not the design. `system.tokens-file`, a tokens file that cannot be read or holds what a tokens file may not, does: the file stays out of the page, so the page would not show the design's tokens.
- **`accessibility`:** `src/checks/accessibility.ts`, over the walk's headings, landmarks, and `lang`, the CSS reader's rules and keyframes, and an image's bytes in `src/checks/images.ts`. A view is what shows at once, as the slot rule reads it; an element under `hidden`, `aria-hidden="true"`, or `inert` is left out, and a dialog starts a heading order of its own. Each rule's level and its criteria of WCAG 2.2 are data in its row, which [the reference](reference.md#rules) prints. Three rules take another level than their criterion's, and their meanings say why. `accessibility.flash` (2.3.1, level A) is a note: the criterion's threshold reads the flash's area and its change of brightness, and a file shows only how often a value changes, so the rule is a heuristic. `accessibility.motion-reduce` (2.3.3, level AAA) is a problem: the file shows for sure that a motion has no answer under reduced motion, and one reduce rule fixes it. `accessibility.headings` is a note, since 1.3.1 asks for no single `h1`, and a skipped level can be meant. A motion animation moves, resizes, or reshapes, as WCAG's definition reads; a change of colour or opacity alone is none. Reduced motion answers it when the declaration stands under `no-preference`, a reduce block zeroes its duration token, or a reduce rule of the same selector, or of every element, sets `none` or a zero duration. A duration is read with each `var()` followed by `followVars` (`src/css/sheet.ts`), which matches a `var()` by its brackets, so a fallback that holds a `var()` or a `calc()` is followed; a duration that stays unknown, or that a math function such as `calc()` writes, is told as a motion. A `transition-duration` after a `transition` in the same rule sets each item's duration, as the cascade reads it. `accessibility.lang` holds `lang` to the form of a BCP 47 tag, a language then subtags after hyphens, and reads no table of languages, so `english language` is no tag and `english` passes. A flash counts the keyframes' changes of light or colour in the first second. A heading or a landmark message names a line in another file by its file. A label for each field, a control's name, and an image's alternative, `accessibility.label`, `accessibility.name`, and `accessibility.alt`, are read in `src/checks/controls.ts`, as the `integrity` bullet says.
- **`device`:** `src/checks/devices.ts`, against the device table.
- **`rounds`:** `src/checks/rounds.ts`.
- **`stories`:** `src/stories.ts`, from the `stories` command alone. `device.picture-height` comes from `shots --capture` alone, and each one's meaning says so.

Section 14 says how to add a rule.

## 9. Review rounds

### The files on disk

A review is files beside the design, one layout for both kinds of design:

```text
<design folder>/rounds/<design name>/<N>/comments.json    a round's comments
<design folder>/rounds/<design name>/<N>/changes.json     what round N changed, and the comments it answers
```

The design name is the file's stem. `N` is a whole number from 1 to 9999. So two designs in one folder keep their own rounds. `schemas/round-comments.schema.json` and `schemas/round-changes.schema.json` hold the two shapes, each with one example under `examples`. The guide's "Round files" part prints each field from them: required or optional, its allowed values, and its meaning, then the example (`roundLines` in `src/guide.ts`). `tests/stages.test.ts` holds the part to the schemas, and `tests/docs.test.ts` saves and checks both examples. Each file may name `schema_version`, which is `ROUND_VERSION`. A file with a newer version is left out whole, with the words "update the tool".

### The limits

<!-- generated:limits, by tools/tech-spec.ts: never edit by hand -->
| Limit | Value | Bounds | Owner |
| --- | --- | --- | --- |
| `depth` | 400 | levels of nested elements; a deeper design is not read | `READ_LIMITS` in `src/format.ts` |
| `uses` | 5,000 | blocks one flow, or one design, may place | `READ_LIMITS` in `src/format.ts` |
| `expansion` | 2,000,000 | characters the blocks may add to a whole design | `READ_LIMITS` in `src/format.ts` |
| `followed_value` | 65,536 | characters a custom property's value may reach with each `var()` in it followed; a longer one is a `read.var-limit` finding | `READ_LIMITS` in `src/format.ts` |
| `findings` | 200 | findings `check` prints before it says how many more; a finding that stops the page is never cut, and problems fill it before notes | `READ_LIMITS` in `src/format.ts` |
| `image` | 2,000,000 | bytes of one image a fixtures key names | `READ_LIMITS` in `src/format.ts` |
| `images` | 20,000,000 | bytes of all the images of one page | `READ_LIMITS` in `src/format.ts` |
| `font` | 2,000,000 | bytes of one font file an `@font-face` names; a larger one is an `integrity.font` finding, and the page carries none of it | `READ_LIMITS` in `src/format.ts` |
| `fonts` | 10,000,000 | bytes of all the font files of one page | `READ_LIMITS` in `src/format.ts` |
| `round_file` | 1,000,000 | bytes of a round file, or of the comments the save reads | `READ_LIMITS` in `src/format.ts` |
| `tokens_file` | 1,000,000 | bytes of a tokens file | `READ_LIMITS` in `src/format.ts` |
| `design_md` | 1,000,000 | bytes of the project's design document; a larger one is not read | `READ_LIMITS` in `src/format.ts` |
| `design_file` | 10,000,000 | bytes of one file of a design: the design, a flow, or a block; a larger one is not read | `READ_LIMITS` in `src/format.ts` |
| `picture_height` | 16,384 | pixels a captured picture runs below its frame's top; a taller view is pictured to here, with a `device.picture-height` note | `READ_LIMITS` in `src/format.ts` |
| `comment_characters` | 2,000 | characters of one comment, counted in code points | `limits` in `schemas/round-comments.schema.json` |
| `comments_in_a_round` | 200 | comments in one round | `limits` in `schemas/round-comments.schema.json` |
| `rounds_shown` | 20 | earlier rounds a page shows, newest first | `limits` in `schemas/round-comments.schema.json` |
| `characters_in_all_rounds` | 200,000 | characters of all the rounds a page shows; the newest round shows whole, past it | `limits` in `schemas/round-comments.schema.json` |
| `changes_in_a_round` | 500 | changes in one round's changes file | `maxItems` of `changes` in `schemas/round-changes.schema.json` |
<!-- /generated:limits -->

The rows are in the order the code lists them. The limits of a round are one table, in the comments schema. The viewer, the save, and the build all read it: the viewer through the page's settings block.

**Nothing is ever cut in silence.** The viewer's comment field has no length limit of its own. It shows a count, and past the limit it turns Save off and says why. A saved round and a full round turn Save off the same way, with their own reason. The form is checked again with every redraw of the comments, so opening a round, by the Round field or by a link, and a delete set Save and its reason before a key is pressed (`commentLimits` in `viewer/panels/comments.ts`, held by `tests/viewer/fixes.test.ts`). The page always shows the newest round it can read, whole, since that is the round being answered, then the rounds before it, newest first, while they fit `rounds_shown` and `characters_in_all_rounds`; the first that does not fit ends the list, so no older round shows past a gap (`parseRounds` in `src/checks/rounds.ts`). A round the page leaves out is the note `rounds.limit`, which names it and says where to read its comments. The viewer opens in `next_round` of the settings block, which counts a round left out too, so the next export never names a round already saved. `tests/rounds.test.ts` holds both.

### The life of a comment

1. **A reviewer writes it.** In the viewer, a person presses `C`, picks an element by its test id, and writes a comment. The viewer keeps it in the browser's storage. An agent that reviews writes the same file by hand.
2. **The viewer exports the round.** The last block of the comments copies the round as JSON or as a prompt, or downloads `comments.json`. Each comment's id is `r<round>-<n>`. Each names the theme it was made in, as `shown_theme`.
3. **`save-comments` saves it** as the design's next round. `saveRound` in `src/save.ts` holds every comment to the same rules `check` reads a round by, and keeps every comment whole or refuses the save and says why. It writes through a temporary file and a link to its name, so it can never write over a round, and no check can race the write.
4. **The designer answers it.** The next round's `changes.json` lists each change with a summary and the ids of the comments it answers.
5. **The next build shows it.** `readRounds` in `src/checks/rounds.ts` marks a comment done when a change of a later round names it, and gives the page that change's round and summary, as `answered_by`. The viewer shows each earlier comment as Answered, with the summary, or Open.

A saved round is closed. The viewer lists its comments with no Edit and no Delete, and opens in the round after the last saved one, `next_round`, whether or not the page shows that round. A link that names no round opens that round too, on a load and on every later change of the address: Back, Forward, the design's back control, and a typed link (`openingRound` in `resolveLink`, `viewer/link.ts`). Only a link that names a round opens a saved one. `tests/viewer/review.test.ts` holds it.

### What a round file may not hold

`itemProblems` in `src/checks/rounds.ts` is the one check of a comment, for the save and for the build. A whole round is checked twice, by the same rules: `commentsProblems` for the save, which refuses the round, and `parseRounds` for the build, which leaves out each comment that fails and shows the rest. So a change to a round's rules changes both. They refuse:

- an id that does not name the round of its file, written as its folder is, such as `r01-4` in round 1, and an id written twice;
- an empty `screen`, `state`, or `comment`, and an empty round;
- a `box` of anything but four whole numbers with no negative size, since the schema keeps whole CSS px; the save rounds the viewer's fractions of a pixel before it checks;
- a `by` with a space, and an empty one, whose words say a person's comment leaves `by` out;
- a control character other than a tab or a line feed;
- an unknown key;
- a comment past its limit, and a round past its limit.

The schemas hold the same rules, so a file an agent writes by hand from the guide's "Round files" part saves and checks as the schema says; `tests/rounds.test.ts` runs each case through both. A comments file on disk with no `round` is `rounds.field`, as the schema requires it; the save takes `--round` for one. A change's `screen` and `state` are notes for whoever reads the file: the page shows a change's summary beside each comment it answers, and nothing else of it.

An answer that names no comment of an earlier round is `rounds.answer`. A round file that is not JSON, too large, or a link is `rounds.file`, and so is a numbered folder that is no round's, such as `0` or `01`: a round's folder is its number, 1 to 9999, with no leading zero. A round file is held to the save's limits: an empty `items` list, or more comments than a round holds, is `rounds.field`, and the page shows the first ones the limit allows. `check` reads the round files, so a broken round is a finding before a build.

An open comment of a round the page shows that names a screen the design lacks, or a state its screen lacks, is the note `rounds.view` (`lostViews` in `src/checks/rounds.ts`), at its round file. The save does not refuse it: a designer may rename a screen after a round is saved, and an old round must stay readable, so the note says to answer the comment in a later round's `changes.json`, and a comment that is answered gives none. When `save-comments` finds the round saved already, its words name the next free round, one more than the highest round with a `comments.json`, as `next_round` counts it.

## 10. The command line

### Where the command comes from

The command is `open-prototype`, from `package.json`'s `bin`, from a release's single-file binary, or, in Claude Code and OpenCode, from the plugin. `bun add -g github:thaithienvanid/open-prototype` installs the package from the repository and puts its `bin` on the PATH, and `bunx` runs it once with nothing installed. The tool ships no shorter name, because `op` and `proto` are other tools' commands, so a person who wants one adds a shell alias, such as `alias opr=open-prototype`. [The install steps](../llms-install.md) give each way in order. The repository is a Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) with one plugin, `open-prototype`, whose source is the repository itself (`.claude-plugin/plugin.json`). Claude Code loads the skill from `skills/`, and puts the plugin's `bin/` on the PATH of its Bash tool. `bin/open-prototype` runs `bun` on the plugin's own `src/cli.ts`, found beside the script, never in the project or the current folder; run through a link, such as one a person puts in `~/.local/bin`, it follows the links one at a time with `readlink`, since a stock macOS has no `readlink -f`, and finds the source beside the script they lead to; with no Bun on the PATH, or one older than the floor `package.json`'s `engines` names, it exits 2 and says how to install or update it. The script is POSIX `sh`, and Claude Code on Windows runs its Bash tool through Git Bash, so the same script runs there. Claude Code takes the plugin's icon from `.claude-plugin/icon.png` by that name, with no field in `plugin.json`: a square PNG, 1024 px a side. `tests/plugin.test.ts` holds that the plugin's name and version are the package's, that the icon keeps the form Claude Code asks for, 512 to 2048 px a side and under 2 MB, and that the script runs.

Four more harnesses read the same skill, `skills/prototyping/`, and the repository holds no copy of it. In Antigravity, Codex, and Muse Code, the command comes from Bun or a release binary, as above; OpenCode's plugin brings it, as below. Whether Antigravity or Muse Code puts the plugin's `bin/` on the PATH is not tested.

- **Antigravity** loads a plugin from its own plugin store, where `agy plugin install` copies the repository, cloned from its address, or a folder that holds `.antigravity-plugin/plugin.json`, or from a folder under a project's `.agents/plugins/`. That file gives the package's name, version, and licence, and the logo `docs/images/icon.svg`. Antigravity loads each skill in the plugin's `skills/` folder. It takes a plugin's rules only from a `rules/` folder, so it never loads the repository's `AGENTS.md`, which is for work on the tool itself.
- **Codex** installs the plugin from the same marketplace as Claude Code, `.claude-plugin/marketplace.json`, with `codex plugin marketplace add`, and lists its skill to the model by its name and description. It also reads the skills in a project's `.agents/skills/` folder.
- **Muse Code** reads `.claude-plugin/plugin.json` as a Claude-compatible plugin with the one skill, so it needs no file of its own. Its validator warns about the manifest fields it does not import, and about the skill's `compatibility` field. It installs the plugin from the repository as a marketplace, and keeps it in Muse's own store in the person's home folder.
- **OpenCode**, from version 2, installs the repository as a plugin with `opencode plugin add github:thaithienvanid/open-prototype`. Its plugins are code packages, loaded from the package's `"./server"` export, `opencode/server.ts`. That file is a plain plugin object, with no import from OpenCode, because OpenCode's own `Plugin.define` returns its object unchanged. Its setup adds the one skill, read from `skills/prototyping/SKILL.md` in the plugin's folder, and puts the plugin's `bin/` first on the PATH of each shell OpenCode starts, through the shell's `create.before` hook. So OpenCode gets the skill and the command from the plugin, as Claude Code does. `package.json`'s `files` lists `skills`, `bin`, and `opencode`, so a packed copy holds every file the plugin reads. OpenCode also reads a copied skill from `~/.config/opencode/skills/` or a project's `.opencode/skills/`.

`tests/plugin.test.ts` holds that the Antigravity manifest has the package's name, version, and licence, and that its logo is in the repository. When a harness's binary is on the PATH, it also runs that harness's own check: Antigravity's plugin validator, Muse Code's plugin and skill validators, and Codex's print of what the model reads, for a project that holds the skill. OpenCode has no such check. [The install steps](../llms-install.md) give each harness's steps, and what one headless run of each showed.

### The grammar

`src/cli/arguments.ts` holds one table of commands, each with its arguments and flags. `node:util`'s `parseArgs` reads it.

- A flag may stand anywhere on the line. The command is the first word that is no flag and no value of a flag: each flag that takes a value, in any command, takes the next word with it. No flag is a switch in one command and takes a value in another.
- No flag is ever shortened.
- A flag that names more than one thing repeats, such as `--changed-screen` and `--frames`, and `--frames` also takes ids comma-separated. Any other flag written twice keeps its last value.
- `--version` is a flag of every command, as `--help` is: anywhere on the line it prints the version alone and exits 0, beside a command and its file too.
- A flag that has no effect without another is refused, `request.usage`: `--out` names the folder for `--capture`'s pictures, so `shots --out` with no `--capture` is refused.
- A mistake prints the usage line and one reason on stderr, and exits 2.
- A command that reads a design names its file.
- Every command runs in the project folder: the folder it is started in.

### Every command

[The reference lists every command with its flags](reference.md#commands), and `open-prototype <command> --help` prints each flag's meaning. The usage lines and the JSON keys below come from the command table and from `schemas/output.schema.json`:

<!-- generated:commands, by tools/tech-spec.ts: never edit by hand -->
| Command | Usage | Its own keys with `--json` |
| --- | --- | --- |
| `check` | `open-prototype check <file> [--json]` | `counts` |
| `build` | `open-prototype build <file> [--open] [--json]` | `page` |
| `screens` | `open-prototype screens <file> [--json]` | `screens` |
| `components` | `open-prototype components <file> [--json]` | `components` |
| `shots` | `open-prototype shots <file> [--capture] [--changed-component NAME]... [--changed-screen ID]... [--frames IDS]... [--out DIR] [--json]` | `shots`, `captured` |
| `stories` | `open-prototype stories <index.json> <file> [--json]` | `stories`, `missing` |
| `serve` | `open-prototype serve <file> [--lan] [--port PORT]` | prints no JSON |
| `project` | `open-prototype project [--json]` | `design_md`, `design_md_elsewhere`, `tokens`, `story_index` |
| `new-design` | `open-prototype new-design <file> [--title TITLE] [--json]` | `written` |
| `new-design-md` | `open-prototype new-design-md [--name NAME] [--json]` | `written` |
| `save-comments` | `open-prototype save-comments <source> <file> [--round N] [--json]` | `saved` |
| `example` | `open-prototype example [--open] [--json]` | `written`, `page` |
| `guide` | `open-prototype guide [--reference] [--json]` | `format`, `prefix`, `vocabulary`, `slots`, `head`, `platforms`, `themes`, `suggested_states`, `blocks_folder`, `flows_folder`, `token_names`, `reference` |
<!-- /generated:commands -->

The rows are in the order the help lists the commands.

What each command writes, and what it exits with:

| Command | Writes | Exits with, beside 2 for a refusal and 3 for a fault |
| --- | --- | --- |
| `check` | nothing | 0, or 1 when a finding is a problem |
| `build` | the page, and the ignore file of an output folder it makes or finds empty | 0, or 1 when a finding is a problem; the page is still written unless a finding stops it |
| `screens`, `components` | nothing | 0, or 1 when a finding that stops the page, or a `structure` problem but `structure.no-screen` and `structure.no-state`, stops the read |
| `shots` | nothing; with `--capture`, one picture for each view, in `<out-dir>/shots` or the `--out` folder, in place of a picture of the same name | 0; 1 when no state can be taken or a finding stops the page; a failed capture is 3 |
| `stories` | nothing | 0, or 1 when a component variant has no story |
| `serve` | nothing, on any request | 130 after Ctrl-C, 143 after a stop request |
| `project` | nothing: it prints the design document's tokens, component keys, and section headings with their lines, and no prose, the token files, and the story index it found, as JSON with or without `--json` | 0, or 1 when the design document has a `system` problem, or a tokens file the settings name is a `system.tokens-file` problem |
| `new-design` | one design file, never over a file; its tokens block keeps only the starter's names the project's design document does not give, and goes when the document gives them all. A document that cannot be read, such as a link, which is never followed and which `project` and `check` tell as a `system.read` problem, gives none | 0 |
| `new-design-md` | the design document at the path `design_md` names, from `assets/DESIGN.md`, never over a file; refused when `design_md` is null | 0 |
| `save-comments` | one `comments.json`, never over a file | 0 |
| `example` | the example's sources in `<out-dir>/example/`, and its page, built without the project's design document, tokens files, and rules, as every command reads a design in that folder; over its own earlier copy in an output folder the tool made, which holds the tool's ignore file, and over no file in one of the person's, where a file in the way is `request.exists` before any is written (`madeByTool` in `src/output.ts`) | 0, or 1 when a round beside the example has a problem; any other problem is a fault of the tool's files, 3 |
| `guide` | nothing | 0 |

The rows are in the order the help lists the commands.

### Output

- **Without `--json`,** a command prints lines a person reads. Each finding is one line: `<level>: <file>:<line>: <message> [<rule id>]`. `findingLine` in `src/finding.ts` is the one printer. `check` ends with one `ok:` line that counts the screens, states, and test ids, or with a line that counts the problems and names the files they are in. `screens`, `components`, `shots`, and `stories`, on a design that does not load, print the findings in the way, then one line that says to fix the design first. That last line sums up, as `check`'s does, so it is no finding: it has no `problem:` and no rule id, and every `problem:` line names its rule.
- **`screens`, `components`, `shots`, and `project`** print their JSON with or without the flag, because a person reads it as an agent does.
- **With `--json`,** every command that ends prints one object on stdout, in one envelope: `schema_version`, `ok`, `target`, and `findings`, then the command's own keys. `ok` is true when the exit code is 0. `target` is the design, or null. A command's own keys are null when a finding stopped it. `schemas/output.schema.json` holds each command's shape, and `tests/commands.test.ts` runs every command's output through it.
- **A refusal** is one line on stderr for each reason, such as each frame `--frames` names that the table lacks. A mistake in the command line prints the usage line first. With `--json` it is also the envelope on stdout, with `ok: false`, one `request.*` finding, and no key of the command's own. A fault of the tool prints the same with `tool.failed`.

### Exit codes

[The reference lists the exit codes](reference.md#exit-codes). `EXIT` in `src/errors.ts` is the one table. `run` has one catch:

- A `Refusal`, an `Unreadable`, or a file-system error with a known code (`SYSTEM_ERRORS` in `src/fs.ts`) is a refused request: one line with the path from the project's top, what the system said in words, and the next step, and exit 2. No refusal and no finding prints the system's own message, because it names the machine's full path.
- Anything else is a fault: "the tool failed", and exit 3. Its message keeps the system's reason and code, and names each path from the project's top (`faultMessage` in `src/fs.ts`).

So a fault never reads as a design problem. `tests/errors.test.ts` holds each case.

### The guide and the reference

The tool states its own facts, so no document has to.

- **The guide,** `open-prototype guide`, is for a designer: how to start, every name with one example, the frames, the five ways to compose, the shots, the round files, the review round, the settings, and the commands. `src/guide.ts` builds it from `src/format.ts`. A fact about using the tool belongs there, and the README and the skill point to it.
- **The reference,** `open-prototype guide --reference`, is for a maintainer and a script: every name, rule, command, exit code, and module row, as Markdown. `src/cli/reference.ts` builds it. `docs/reference.md` is its output, and `tests/stages.test.ts` fails while the two differ.
- **`open-prototype guide --json`** gives the vocabulary as data, and the reference as text.

## 11. The server and the capture

### The server

`serve` in `src/server.ts` runs only when a person starts it, and stops on a signal.

- It listens on `127.0.0.1`. With `--lan` it listens on every interface, and every path starts with a random token that the printed address carries. The token is compared in constant time.
- With no `--port`, it takes the first free port from 8765 to 8784, `portsToTry` in `src/server.ts`, and says so when 8765 was in use. A browser keeps the comments not yet downloaded for each address, port and all, so a short fixed list keeps a design's address from run to run, where any free port would change it each time. A port a person names with `--port`, from 1 to 65535, is used or refused, and `--port 0` takes any free one. A port below 1024 is tried as any other: the system decides whether a person may listen there.
- Its refusals are `Refusal`s, thrown before it listens and printed as every other refusal is, with the rule: a port out of range, a port that cannot be used, or every port of the list in use is `request.value`; the offline switch, `PROTOTYPE_OFFLINE=1`, is `request.settings`, a setting of the environment.
- `/` is the design's page, built in memory on each request. A request writes and removes nothing.
- Every other path is a 404, so the server shares no file. The page carries every file it shows: the build embeds each image, and Compare reads only the pictures a person picks.
- It answers `GET` and `HEAD` only. Any other method gets 405.
- It answers only a request addressed to it by name: the `Host` header must be its own address. So a web page that points a domain at `127.0.0.1` reads nothing. Under `--lan` its own addresses are each IPv4 address of its network interfaces, so a machine on two networks, or one whose route goes through a VPN, answers a phone on each; it prints the address its route picks first, and the others on a line of their own. On port 80 an address with no port is its own too, as a browser writes it there.
- A request that a browser marks as coming from another site gets 403.
- Every answer says: no caching, no sniffing, no referrer, never framed, and resources kept to this origin. The page also carries its policy as a header.
- When the page cannot be built, the answer is a 500 with one short line. The reason, with its file names, goes to the terminal that runs `serve` as a `problem:` line, never to the network: the findings that stop the page, a refusal, or a fault of the tool.

The server uses `node:http`, not the runtime's own server, because the runtime cleans some paths before a handler sees them, which would change which requests are refused.

### The capture

`captureShots` in `src/capture.ts` takes each shot of the list from a page's text.

1. It refuses to run as root, `request.browser`, because Chrome starts as root only with its sandbox off. It finds Chrome or Chromium: `CHROME_BIN`, then the `PATH`, then the usual installs. With none, the request is refused, `request.browser`.
2. It removes the profile folders that earlier captures left: only a plain folder it named itself, of this user, older than a minute, whose capture no longer runs, by the process id the capture wrote into it, and that no running Chrome holds by its lock. The id is read on every system; Chrome's lock, `SingletonLock`, is a link Windows does not have.
3. It makes a new throwaway profile folder, private to the user, writes its own process id into it as `capture.pid`, and writes the page into it.
4. It starts Chrome headless with `node:child_process`, and speaks Chrome's DevTools protocol over a pipe. No port is open, so no other program can drive that browser. No shell is used. `FLAGS` in `src/capture.ts` owns the flags, which also turn off Chrome's own network use.
5. For each shot it opens the view's link, waits until the viewer says it is ready, and takes the frame's box as a PNG, with the shot's theme and with reduced motion. A view taller than its frame is taken whole: the window grows, the frame grows to the design's height, and the picture is that tall, up to `READ_LIMITS.picture_height`. A taller view is pictured to that height, so Chrome's memory stays bounded, and a `device.picture-height` note names each view it cut. Two shots of one view are taken once, and the second is written as a new file, never through a link. Before Chrome starts, each shot's file is held to the path rule, so a link at a shot's name is a refused request, `request.path`.
6. However it ends, a guard stops Chrome and removes the profile: at the end, on exit, and on `SIGINT`, `SIGTERM`, and `SIGHUP`, after which the tool ends as the signal ends it. At the end it waits until Chrome has exited, then removes the profile with `removeProfile`. That tries again for up to 10 seconds while the system still holds a file in it, as Windows does until Chrome's helper processes end. A profile still held is left, and the next capture's first step removes it.

A Chrome that cannot start, a call that gets no answer in 30 seconds, or a message from Chrome that is no JSON is a fault: `tool.failed`, exit 3. `shots` tells it as every other fault is told: "the tool failed", and that it is no fault of the design, one line on stderr for each, and with `--json` the envelope on stdout, whose `shots` and `captured` keep the list and the pictures written before the fault. A message that is no JSON fails each waiting call, so it never crashes the process past the fault line.

`shotList` in `src/shots.ts` sizes the list to the change:

- **A whole design, or `--changed-screen`:** the full matrix of those screens: every state, at each frame, in each declared theme. Then two more shots for each screen, on its fullest state: text at 200% at the narrowest frame, and right to left at 1024 or else the first frame.
- **`--changed-component`:** each screen the component shows on, then each variant in each theme, then the narrowest frame, and text at 200% at it, where it first shows.

A picture's name joins its parts with `.`: `<screen>.<state>.<frame>.<theme>`, then `.text-200` and `.rtl` when the shot has them, then `.<component>.<variant>` for a variant's shot, then `.png`, such as `start.ready.320.light.text-200.png`. A flow's screen `<flow>:<screen>` is written `<flow>+<screen>`, since a colon is no part of a file name on Windows. No screen id, state, flow id, component, variant, or frame id can hold `.` or `+` (`SCREEN_ID`, `KEBAB`, and `FLOW_ID` in `src/format.ts`; `tests/commands.test.ts` holds the device table's ids), so two views never share a name, and a name reads back into its parts. Two screen ids that differ only by case would share a picture on a disk that ignores case, as macOS's and Windows's do, so that is the problem `integrity.screen-repeat`. The viewer's Compare matches a loaded screenshot of the built interface to a view by the same name, lowered, with the view's text size and direction; a name with no theme matches the view in either theme.

## 12. Safety

### The threat model

**What the tool protects:**

1. The person's machine: nothing a design holds runs, loads, or navigates.
2. The person's files: the tool reads and writes only inside the project, and only where it says. Two things sit outside the project by design: the comments file a person hands to `save-comments`, and the capture's throwaway profile in the system's temporary folder.
3. What leaves the machine: nothing. A page forced past the reader can still make Chrome open a connection on its own, in [what is not defended](#what-is-not-defended).
4. The truth of a review: the viewer shows the state it names, a comment is kept whole, and a saved round is never changed.

**What the tool treats as hostile input:**

- A design file, its flows and blocks, its tokens files, the project's design document `DESIGN.md`, its fixtures, its images, and its font files. A design may come from another person, or from an agent that read text it should not trust.
- A round file, and the comments file a person gives to `save-comments`.
- Storybook's index.
- Every path a command or a file names.
- Every request the server gets, and every web page open in the person's browser while it runs.
- Any other program on the machine that could reach a browser the tool starts.

**What the tool trusts:** the person who runs it, the project's settings file, the runtime, and Chrome.

### Each control, and the test that holds it

The rows run from the design, through the page and the viewer, to the files, the server, and the capture.

| Control | Where | Test |
| --- | --- | --- |
| An allow-list of elements and attributes, by place, over a tokenizer that reads SVG and MathML as a browser does, and open elements closed as a browser closes them; where a browser would nest them otherwise, the walk says so, as `structure.nesting`, so every design it reads with no such finding nests as in Chrome, and the markup a browser moves out of SVG or MathML is refused. A URL is read as a browser reads it. An attribute written twice, a text that ends inside a tag, and markup inside an SVG `title` or `desc` are refused. | `src/design/allow.ts`, `src/design/read.ts`, `src/html/tokenizer.ts` | `tests/attacks.test.ts` (the nesting rows, the fault rows, the refused rows, and the random texts against Chrome), `tests/checks.test.ts` |
| A block's argument is text, never markup. Blocks are limited in count and in the text they add, and a cycle stops the read. | `src/design/blocks.ts` | `tests/controls.test.ts`, `tests/stages.test.ts` |
| A tokens file is inside the project, within its size limit, holds nothing that ends its style block or the template, and is checked for network loads. | `src/design/files.ts`, `src/design/load.ts`, `src/checks/rules.ts` | `tests/controls.test.ts` |
| An image is a file inside the design's folder, reached through no link, within its size limit, and of an image type. | `src/design/files.ts`, `src/checks/images.ts` | `tests/controls.test.ts` |
| A font file is inside the project, reached through no link, within its size limits, and of a font type by its extension and its first bytes. It reaches the page only as a `data:` URL, and a file that fails is `integrity.font`, with none of it in the page. | `src/design/files.ts`, `src/css/fonts.ts`, `src/checks/fonts.ts` | `tests/fonts.test.ts` |
| The design document is read under the one path rule, through no link, within its size limit. No value of it reaches the page as written: each is held to its form, so no `;`, `{`, `}`, `<`, backslash, `url(`, or `var(` passes, and the CSS is the tool's own text. A key `__proto__`, `constructor`, or `prototype` is left out. The walk over its YAML stops at 10,000 values or 20 levels, so an alias that YAML shares costs no more than that. | `src/design/files.ts`, `src/design/designmd.ts`, `src/design/system.ts` | `tests/controls.test.ts`, `tests/system.test.ts` |
| The cost of a read is in proportion to the text. A design file's bytes, the depth, the blocks, the findings, and the length of a followed `var()` have limits. The tokenizer reads a text once, and an end tag that names no open element costs nothing. Each custom property is followed once at each step, and the design document's keys and headings are read in one pass of each line. | `src/format.ts`, `src/html/tokenizer.ts`, `src/text.ts`, `src/design/read.ts`, `src/design/blocks.ts`, `src/design/flows.ts`, `src/css/sheet.ts`, `src/page.ts`, `src/project-facts.ts`, `src/design/designmd.ts` | `tests/controls.test.ts`, `tests/reader.test.ts`, `tests/stages.test.ts`, `tests/system.test.ts`, `tests/commands.test.ts` |
| A finding of a rule whose row says it stops the page (`stops` in `RULE_ROWS`, read by `stopsPage`, never by the family) stops the page, removes the old one, and is never cut by the findings limit; each such rule is a problem, by the row's type. A project cannot turn such a rule off. | `src/checks/rules.ts`, `src/finding.ts`, `src/cli.ts` | `tests/stages.test.ts`; `tests/product.test.ts`, "rules a project turns off": "%s stops the page, so a setting that turns it off is refused" (revert run: with `stopsPage` reading the family again, it fails for each rule moved out of `read`, such as `compose.use`), "%s stops no page, so a project turns it off", and "every rule that stops the page is a problem, and a project turns off each rule but those, the outcomes, and stories.missing" |
| The page's policy names one script and each style block by hash, and loads nothing. | `viewer/viewer.html`, `src/page.ts` | `tests/page.test.ts`, `tests/browser.test.ts` |
| Every frame is sandboxed with no script: each is made through `el("iframe", ...)` with exactly `sandbox: "allow-same-origin"`, and no module names `sandbox` anywhere else. | `viewer/views/prototype.ts`, `viewer/views/board.ts`, `viewer/views/system.ts` | `tests/viewer/layers.test.ts`, `tests/page.test.ts`, `tests/browser.test.ts` |
| A design never leaves the page's template. | `staysInTemplate` in `src/page.ts`, and the walk | `tests/attacks.test.ts`, `tests/browser.test.ts` |
| Example data never reaches the HTML parser as markup, and a title is escaped. | `src/page.ts` | `tests/page.test.ts` |
| A page holds no address that leaves the machine: each link's address that names no place in its screen is `about:blank`, and the design's own is kept as text in `data-proto-href`. | `inertLinks` in `src/page.ts` | `tests/attacks.test.ts`, `tests/browser.test.ts` |
| What the viewer does not show is not in the frame. | `viewer/frame.ts` | `tests/viewer/boundary.test.ts`, `tests/viewer/plumbing.test.ts` |
| The viewer holds no live copy of a design outside a frame. | `viewer/design.ts` | `tests/viewer/boundary.test.ts` |
| A link of a design never navigates: the viewer cancels a click, a middle click, a modified click, and Enter, and says the address the design wrote. | `viewer/views/prototype.ts` | `tests/browser.test.ts`, `tests/viewer/review.test.ts` |
| The viewer writes every value of the page's settings as text: no module of `viewer/` writes markup through `innerHTML`, `outerHTML`, `insertAdjacentHTML`, a document's `write`, `DOMParser`, `createContextualFragment`, or a `srcdoc` that is not empty, in any form the compiler reads. | `viewer/dom.ts` | `tests/viewer/layers.test.ts`, `tests/viewer/design-pass.test.ts` |
| One path rule: every path stays below the project's root, and below the root no part of a path is a link, for a read, a write, and a removal. An old page is removed, a start written, and a shot written only under it. | `src/fs.ts`, `src/output.ts`, `src/scaffold.ts`, `src/capture.ts` | `tests/paths.test.ts`, `tests/commands.test.ts` |
| A write lands whole or not at all. A round, a new design, and a new design document are never written over a file: by a hard link, or on a disk with none by an exclusive create, and the example is written over no file of an output folder the tool did not make. | `src/fs.ts`, `src/save.ts`, `src/scaffold.ts`, `src/output.ts` | `tests/rounds.test.ts`, `tests/product.test.ts`, `tests/errors.test.ts`, `tests/commands.test.ts` |
| JSON is read strictly, and a key such as `__proto__` is data. | `src/json.ts` | `tests/reader.test.ts` |
| A round file's ids, characters, keys, limits, and version are checked the same way by the save and by the build. Nothing is cut. | `src/checks/rounds.ts`, `src/save.ts` | `tests/rounds.test.ts` |
| A value from a design that a message prints, a file's name among them, holds no control character and no direction mark, and a file in `flows/` or `blocks/` whose name the path rule refuses is a `read.file` finding, never read. | `src/text.ts`, `src/finding.ts`, `src/design/files.ts` | `tests/reader.test.ts`, `tests/errors.test.ts` |
| The server answers its own address only, `GET` and `HEAD` only, no other site, and only its page, at `/`: it shares no file, and writes nothing. | `src/server.ts` | `tests/server.test.ts` |
| The capture's Chrome is driven over a pipe, makes no network use of its own, runs in its sandbox, as a capture as root is refused, and is stopped with its profile removed however the capture ends. The sweep of earlier profiles keeps one whose capture still runs, by the process id the capture wrote into it, or that a running Chrome holds by its lock. A picture stops at `READ_LIMITS.picture_height`. | `src/capture.ts` | `tests/product.test.ts` |
| A fault of the tool never reads as a design problem. | `src/cli.ts` | `tests/errors.test.ts`, `tests/commands.test.ts` |
| The pure stages read no file, no clock, and no environment. | the module rows | `tests/layers.test.ts` |

`AGENTS.md` names the controls that a change must never weaken to pass a test.

### What is not defended

Read this list before you tell anyone the tool is safe for a use.

1. **A design file opened directly in a browser.** A design file has no policy of its own. A browser runs its scripts and loads what it names. `check` refuses such a file, but nothing stops a person from opening it. The guide, the README, and the skill say: never open a design file you did not write; look at it through `open-prototype build` or `open-prototype serve`.
2. **What a design draws inside its own frame.** A design's styles apply in its frame, and its style attributes are allowed. A design can draw anything there, including a false message. It cannot reach the viewer's own controls, and it cannot show a state the viewer does not show.
3. **A font file's tables.** The browser parses a font. The tool reads only a font file's type, from its extension and its first four bytes, and its size. Chrome runs each web font through its OpenType Sanitizer before it draws one, and drops a font that fails, so the text falls back. No test sends a hostile font to Chrome.
4. **Chrome's own connection to a frame's address in a page forced past the reader.** Chrome opens a connection to an `<iframe>`'s address when the page's policy blocks the frame, and the reader refuses every frame, so only a page built past the reader holds one. No policy, sandbox flag, or listener of the page stops it. Chrome looks up the host's name and opens a TCP connection to it, so the host can learn that the page is open. Over `http://` the connection carries no byte, so no path and nothing of the page. Over `https://` Chrome also starts TLS, so its first message reaches the host, with the host's name. `tests/browser.test.ts` holds that no request, and no byte of one, reaches a logger over `http://`. Chrome also connects to a link's address when a person presses the link, before the viewer cancels the press. A built page holds no such address, by the control of inert links above, and Chrome never connects to `about:blank`, so for a design that passes the reader this is closed. `tests/browser.test.ts` presses an `http://`, an `https://`, a `mailto:`, and a `tel:` link and holds that no connection reaches their address.
5. **Comments in a page opened as a file.** A browser keeps one storage for every `file://` page. Any other local HTML page a person opens can read the comments. For a review that must stay private, use `open-prototype serve`.
6. **The network under `serve --lan`.** The link is plain HTTP. Anyone who can watch that network can read the page and the token.
7. **A capture stopped by force.** When the tool is killed with no chance to clean up, the profile folder stays in the temporary folder, private to the user. It holds the page: the design, its findings, and its earlier rounds. The next capture removes it.
8. **Other programs of the same user.** They can read the project, the output folder, and the capture's profile.
9. **The settings file.** It is trusted. It is read under the path rule, so a settings file that is a link is refused. It can turn off any rule outside the two families that stop a page, and it names folders, each held to the path rule.
10. **A lie in real words.** The copy rules find filler text and an emoji used as an icon. They cannot tell a true sentence from a false one. A reviewer does.
11. **An attack no one has listed.** The attack table is a list of known forms. It proves that each listed form is refused, and no more.

### What no one has verified

- **A desktop on Linux or Windows.** The check runs there with no display, so the command that opens a page, `xdg-open` on Linux and `rundll32 url.dll,FileProtocolHandler <address>` on Windows, has not run.
- **Windows, for three changes no one has run there.** `--open` on Windows runs `rundll32 url.dll,FileProtocolHandler` with the page's address as one argument and no shell, in place of `cmd /c start`, which read `&` and `^` in a folder's name; `openerCommand` in `src/cli.ts` has a test of the command it builds, and none has opened a page on Windows. The capture's sweep keeps a profile whose capture, by the process id written into it, still runs, which is what guards a live profile on Windows, where Chrome's lock is no link; its test runs on macOS and Linux. `writeNew` falls back to an exclusive create when the disk has no hard links (`EPERM`, `ENOTSUP`, or `EXDEV`), as on exFAT or some network shares; its test forces the link's failure, and no such disk was tried.
- **Any browser but Chrome and Chromium.** Every browser run was Chrome or Chromium. The viewer was never opened in Firefox or Safari.
- **A phone over `serve --lan`.** The token and the `Host` rule have tests against a local request. No one has opened the page from a second device.
- **A real screen reader.** The tests read roles, names, and what is announced from the page, and so did the agents' look (section 13). No one has heard the viewer. The product specification keeps this pass as [later work](product-spec.md#work-left-out-and-when-to-start-it).
- **Touch.** Every pointer test is a mouse click.
- **Text at 200% by the browser's own font setting or by zoom, and a pixel ratio other than 1.** The probes double the root's text size at a ratio of 1.
- **Real full screen, and Compare with loaded pictures.**
- **What `build` and `serve` send.** Their code opens no connection out. A test watches the capture's Chrome for a socket off the machine, and no test watches the other commands.
- **The release workflow.** `.github/workflows/release.yml` has run once as a trial, on 2026-11-19, which built and ran the binaries and skipped the publish step. It has not run since it was changed to call the check first, to run the example, `build`, `new-design-md`, and the reference from each binary, to check that the tag's commit is on main, to attest `SHA256SUMS`, and to publish through a draft; nor has `check.yml` run as a called workflow, or with its `concurrency` group. Its publish step has never run, because no version is tagged. The workflow linter actionlint 1.7.12 read both workflows with 0 errors on 2026-11-19, before those changes, and has not read them since.
- **The OpenCode plugin on Windows, and its update.** The plugin ran with OpenCode 2.3.0 on macOS. On Windows, its `bin/open-prototype` is a POSIX `sh` script, which OpenCode's shell may not run there, and `opencode plugin update` has not run.
- **The CodeQL scan.** CodeQL 2.27.4's `security-extended` queries read the code and both workflows on 2026-11-19, run by hand, not in CI. The workflows had no alert. In the code, a `var()` pattern in `src/css/sheet.ts` took time in the square of a never-closed value's length, which a test in `tests/checks.test.ts` now bounds. The other alerts were left: three races between a file's size check and its read in `src/`, which only another program of the same user can win, as SECURITY.md's scope says, and four in tests, which read the tool's own output.
- **An accessibility scan in the tests.** Agents scanned every view once by hand (section 13). No scanner is installed in this repository, so no test runs one again.

## 13. Tests

### How to run them

| Command | Runs | Needs |
| --- | --- | --- |
| `bun test` | every test but the ones that start Chrome | nothing more |
| `PROTOTYPE_BROWSER_TESTS=1 bun test tests/viewer` | the viewer's browser tests alone | Chrome or Chromium |
| `bun run check` | Biome's lint and format check, the types of the tool, the types of the viewer, the viewer's drift check, every test with the browser tests on, the compiled binary, its help, and, from a folder outside the repository, `example`, `build` of the example, `new-design-md`, and `guide --reference` compared with `docs/reference.md` | `bun install` first, because it runs Biome and TypeScript from `node_modules` and never fetches them; Chrome or Chromium, and it fails when none is found |
| `sh tools/check-linux.sh` | `bun run check` on Linux, in a container with the pinned Bun image and Debian's Chromium | Podman or Docker, and the network for the image and the packages |

The rows run from the fastest to the fullest. `tools/check.ts` is `bun run check`. Run it before a change lands. On GitHub, `.github/workflows/check.yml` runs it on every push to `main` and every pull request, on macOS, Linux and Windows, each with the runner's Chrome, with Bun 1.4.4 and each action pinned by its commit, and the release calls it on a tag's commit. A newer push to a pull request cancels the run it replaces; a run on `main` is never cancelled. `.github/dependabot.yml` proposes, once a week, one pull request for the pinned actions and one for the three development dependencies; the Bun image of `tools/check-linux.sh` is raised by hand. Nothing runs on a schedule, and CodeQL runs by hand only. A pull request starts from `.github/pull_request_template.md`, which asks for what `CONTRIBUTING.md` requires, and a new issue offers a security report through the repository's advisories (`.github/ISSUE_TEMPLATE/config.yml`). Run one full suite at a time: the browser tests start one Chrome at a time, and two runs side by side can see each other's capture.

To try a change by hand, make an empty folder outside the repository, and run the tool from source in it: `bun <repository>/src/cli.ts <command>`.

Three switches change what a run does:

- `PROTOTYPE_BROWSER_TESTS=1` turns the browser tests on.
- `RECORD=1 bun test tests/cases.test.ts` records the cases' results again.
- `PROTOTYPE_RECORD=1`, with the browser tests on, records the walk again.

**A recorded result changes only on purpose,** in the commit that changes it, and the commit says so.

Every test makes its project folder under the system's temporary folder (`tests/helpers.ts`), and no test writes a tracked file. Each temporary folder a run makes, a browser's profile included, is made by `tempFolder` in `tests/temp.ts` and removed after the last test file, by a hook that `bunfig.toml` preloads (`tests/setup.ts`). That hook first stops the Chrome the browser tests share, so its profile goes once Chrome has quit. So a run leaves nothing behind.

### What each file holds

The tool's tests, in alphabetical order:

| File | Holds |
| --- | --- |
| `tests/attacks.test.ts` | the attack table: each hostile form gets no page, each ordinary form gets one; a design never ends its template early; each link's address that leaves its screen is inert in the page; the tokenizer against the runtime's parser; the open elements' nesting, held to Chrome's in a browser test; each fault of nesting, which Chrome builds otherwise; the strict faults, which Chrome builds as the reader does; the nesting the allow-list refuses; and, in a browser, random texts from fixed seeds, each the reader accepts nested as in Chrome |
| `tests/browser.test.ts` | in a browser: markup forced past the reader into a built page runs nothing, loads nothing, and never moves the top window; a pressed link of a built page opens no connection to its address |
| `tests/cases.test.ts` | every recorded case (`tests/cases.ts`) against `tests/recorded.json`: the exit code, the findings by rule, file, and line, and each entry of a printed manifest as one line of JSON, but the manifests `tests/golden/` holds |
| `tests/checks.test.ts` | each rule on a small design that passes and one that fails; hostile markup; the messages a stranger meets |
| `tests/cli.test.ts` | the command line as an agent uses it: flags anywhere, one JSON object, refusals on stderr, each line's rule id; the example it writes and its page, with each fact of the shipped example read from its files |
| `tests/commands.test.ts` | each command's output against `tests/golden/` and the shipped schemas; the one envelope; the exit codes; the same answer twice |
| `tests/controls.test.ts` | the controls that a change could take out unseen: each test fails when its control is removed |
| `tests/docs.test.ts` | this page, the product specification's links into it, the skill and its evals, the README, and the pages beside it (`llms.txt`, the install steps, `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md`, the CHANGELOG), held to the code |
| `tests/errors.test.ts` | one error path: a file system that says no is exit 2 in one line, and a fault is exit 3 |
| `tests/examples.test.ts` | every example the guide, the README, and the reference print works as written |
| `tests/fonts.test.ts` | each font file an `@font-face` names, from a design and from a tokens file, carried in the page with its media type; each one the page cannot carry, at its file and line; a font from the network; and, in a browser, text set in the test font drawn in it |
| `tests/layers.test.ts` | the module rows and the rules over them |
| `tests/opencode.test.ts` | the OpenCode plugin: its export, the skill it adds from the repository's `SKILL.md`, and the plugin's `bin/` first on a new shell's PATH, with Windows' `Path` kept |
| `tests/page.test.ts` | the page: one script by hash, each style block by hash, every frame sandboxed, the design last |
| `tests/paths.test.ts` | the one path rule |
| `tests/plugin.test.ts` | the Claude Code plugin: its name and version are the package's, and `bin/open-prototype` runs, or says how to get Bun |
| `tests/product.test.ts` | a design's start, flows and blocks in one design, rules turned off, a design of 201 screens and one of 2,000, and the capture |
| `tests/projects.test.ts` | the three test projects of `tests/projects/`, a new one, an existing one, and one whose document uses other names, started as an agent starts them: `project`, the starts, and each finding at its line; and the start with no document, a document with every name the starter reads, with some, and with none |
| `tests/reader.test.ts` | the tokenizer, character references, the strict JSON reader, and what a message prints |
| `tests/rounds.test.ts` | a round trip with nothing cut, the limits and rules of a round file, one rounds folder for each design |
| `tests/server.test.ts` | every route, every header, the `Host` rule, the token, and the refusals of `serve` |
| `tests/stages.test.ts` | the stages through the public entry; what stops a page; the limit of blocks; every finding's file; the reference's drift test |
| `tests/system.test.ts` | the design document: each group's CSS names row by row, light and dark roles, every finding at its line, the hostile forms; then the system rules over a design that reads it |

The viewer's tests, in alphabetical order. All but five need a browser: `build`, `fill`, `layers`, `modules`, and `tokens` run in `bun test`.

| File | Holds |
| --- | --- |
| `tests/viewer/boundary.test.ts` | what is not shown is not in the frame; no live copy of a design outside a frame |
| `tests/viewer/build.test.ts` | the shipped viewer is what its sources build |
| `tests/viewer/design-pass.test.ts` | probes of the viewer's look and behaviour at phone width and wide, each a number or a state read in the browser |
| `tests/viewer/examples.test.ts` | every screen of the shipped examples and of the starter shows, in each declared theme, narrow and wide; and the shipped example keeps the rules of the skill's `layout.md` that a number holds, in each web frame at three window widths: each column of a list at one edge in every row, no drawn box touching the one above it, the title's start edge at one place on every screen, the back control at one place on the screens that show it, the title's top at one place on those that do not, and no empty band above the title there: its top is the bar's own padding below the bar's top; and that it is drawn mobile first: no `max-width` query in its styles and each query's width written once, and at 320, in each theme, no state scrolling sideways or cutting its text at 100% and 200%, each state's title and main action (its primary control, or else its first) ending above 568 px, every target at least 44 by 44, and the body's, a paragraph's, and a field's text at least 16 px |
| `tests/viewer/fill.test.ts` | the furnishing of a frame and the fill, on a plain tree with no browser: each text, field, image, and list's entry |
| `tests/viewer/fixes.test.ts` | probes that hold each visual and interaction rule: groups, fields, the toast, the dock, roles, keys; and small things: the Board of a design with no screen is ready, Copy link writes a named frame, Compare keeps its pictures over a pick it cannot show, no history entry for the view shown, the entry a plain go shows, J and K on the Board; and where a person is in the design's navigation: one link the current page, and a link to a screen above it the section; and a panel of the design closed again as the design writes it on a move, and kept on a redraw |
| `tests/viewer/layers.test.ts` | the viewer's modules by kind, the one home of words, the one home of names, no markup written, and one sandbox on every frame |
| `tests/viewer/modules.test.ts` | the pure modules, each rule a row of a table |
| `tests/viewer/plumbing.test.ts` | a design with nothing of the viewer in it shows as written |
| `tests/viewer/review.test.ts` | a whole review round on a stranger's design, as the README gives it |
| `tests/viewer/rings.test.ts` | the ring probe |
| `tests/viewer/system.test.ts` | the System view on the existing test project: DESIGN.md's tokens and the token file's under their sources, in each theme, wide and at a phone's width with no sideways scroll; and the samples of a design's token forms: `light-dark()`, a value under the system's dark setting, and an alias of a name the viewer has too; a click on a link in a specimen, which leaves the specimen shown, and a spacing bar that stops short of its name |
| `tests/viewer/text-size.test.ts` | probes of the side panel and the System view at 200% text, and of Compare's fit, captions, and placeholder at each width |
| `tests/viewer/toast.test.ts` | the toast's place, taken when it shows: a copy whose clipboard settles late, Compare's toast at 200% text, and a full storage that loses no comment, its refusal shown and said once |
| `tests/viewer/tokens.test.ts` | the viewer's tokens: each contrast pair in both themes, no colour, size, layer, or shadow outside the tokens; and a design's tokens as `viewer/tokens.ts` reads them and paints each side |
| `tests/viewer/views.test.ts` | a view is its own file and one row of the table |
| `tests/viewer/walk.test.ts` | the walk, the Tab order, and the redraw and the Board of a design of 2,000 screens |

Files beside the tests that are no test, helpers first, then the tool a person runs by hand:

| File | Holds |
| --- | --- |
| `tests/helpers.ts` | a new project folder for a test, the command line run in the test's own process, and a small reader of the shipped schemas |
| `tests/setup.ts` | loaded before every test file by `bunfig.toml`: the one hook that, after the last file, stops the browser tests' Chrome and removes the run's temporary folders |
| `tests/temp.ts` | `tempFolder`, a temporary folder that the run removes when it ends |
| `tests/cases.ts` | the recorded cases: the starter the tool ships, a design of several flows with blocks, and small designs that pass or fail each rule |
| `tests/nesting.ts` | the random texts of the nesting test, from seeded numbers: messy ones of the elements the allow-list takes, and ones written in full; the reader's tree of a text and Chrome's, in one form |
| `tests/source.ts` | the source of `src/` and `viewer/` read by the TypeScript compiler, for the two layer tests: each text parsed, every node of its tree, and every module it names |
| `tests/fonts/` | the test font, `proof-wide.woff2`: every letter one box two em wide, a few hundred bytes, made from nothing by `proof-wide.py` beside it with fontTools, and in the public domain (CC0 1.0) |
| `tests/projects/` | three test projects: `new`, with nothing; `existing`, with a `DESIGN.md`, a token file, a story index, real copy, and one design; and `other`, with a `DESIGN.md` whose names are not the starter's |
| `tests/viewer/page.ts` | a headless Chrome for the browser tests: a tab, keys, clicks, an expression run in the page, a picture. One Chrome serves every test file that asks for the same flags, and each `Browser` is a browser context of its own in it, so no storage, cookie, or tab crosses between tests |
| `tests/viewer/pages.ts` | the pages the viewer's tests open, built once for a run by the tool's own command line |
| `tests/viewer/probes.ts` | functions that run in the page and measure what a person sees |
| `tests/viewer/surfaces.ts` | the layers of the viewer a probe must see, each with the clicks that open it |
| `tests/viewer/contrast.ts` | contrast, computed from colours |
| `tests/viewer/designs/` | four small designs the viewer's tests build |
| `tests/viewer/style-snapshot.ts` | a tool: every element's box and painted styles, so two runs can be compared line by line |

No test name and no comment in `src/`, `viewer/`, `tests/`, or `tools/` cites a review by an id or names a round of one, and `tests/docs.test.ts` holds that. The one kind of id they cite is a rule of the skill's review checklist, such as K8, in `skills/prototyping/references/review-checklist.md`.

### What agents checked by hand

Three checks were run once, by agents and not by a test, on a copy of the tool frozen for the purpose. The list runs from the viewer to the skill.

1. **An outside look at the viewer.** An agent opened both examples and the existing test project with `open-prototype serve`, in both themes, wide and at a phone's width. It went through every view, panel, and menu, and made, saved, and answered one comment. It drove Chrome with Playwright and measured every position in the browser.
2. **An accessibility scan.** The same agent ran axe-core 4.10.3, pinned, on every view, against WCAG 2.2 A and AA and the scanner's best practices: 133 scans. It read the accessibility tree of each view too. No person listened with a screen reader.
3. **The skill on a second request.** A fresh agent took the skill through a request on the existing test project. A second agent then reviewed the design it made by the review checklist, with its own scan of each view.

The fixes their findings led to are in the tool, most with a browser test or a docs test that fails without them. A pass with a real screen reader is [later work](product-spec.md#work-left-out-and-when-to-start-it).

### Waits, not sleeps

A browser test waits for a condition, with the helpers of `tests/viewer/page.ts`: `settled` for the viewer's ready signal, `calm` for every transition of the viewer done and two frames drawn, `tasksRun` for the tasks queued before now, and `until` for any other condition. Three tests keep a fixed wait, because they wait for something that must not happen and nothing marks its end: `tests/browser.test.ts` after an attack's clicks, `tests/viewer/boundary.test.ts` after a forced handler's frames load, and `tests/viewer/toast.test.ts` after a refused save, for a second saying of the refusal.

### Ceilings, not pins

No test pins a whole sentence. A test that a document states a fact, such as the rule to never open a design file, holds the fact's key words, so a sentence can be reworded and the test still holds the fact. No test pins a time either: a test of cost holds a ceiling, never an expected time, and no test times work in its own process. Each runs the work in a process of its own and stops it at a ceiling several times what the work takes, with `runsWithin` and `checksWithin` in `tests/reader.test.ts` for a command, or `answerWithin` in `tests/helpers.ts` for a script that calls a stage; the viewer's two hold a ratio of a large design's time to a small one's. These tests hold a ceiling on cost:

- `tests/reader.test.ts`: one line of 6 MB is read in under 20 seconds.
- `tests/reader.test.ts`: a design of 80,000 open elements and 80,000 stray end tags checks in under 8 seconds. So does a design with a flow of 120,000 links. Each end tag that searched every open element, or a flow written again for each link, took about 25 and 13 seconds.
- `tests/reader.test.ts`: a text that holds a run of 200,000 spaces checks in under 5 seconds. A pattern of spaces that must end the text tried each space as a start, and took about 14 seconds; `strip` in `src/text.ts` now cuts the end by index.
- `tests/reader.test.ts`: a file of 1,000,000 empty lines checks and passes in under 8 seconds. Its lines spread as the arguments of one call overflowed the call stack, exit 3; `Joined` in `src/design/blocks.ts` adds them one by one.
- `tests/reader.test.ts`: 160,000 rules that each set one custom property check in under 6 seconds. `tooLongVars` in `src/css/sheet.ts` copied the name's list of values for each set, and took about 13 seconds; it now adds to the one list.
- `tests/reader.test.ts`: a design of 80,000 links that leave the screen builds in under 6 seconds. `inertLinks` in `src/page.ts` wrote the page's text again whole for each link, and took about 4.5 seconds for half as many; it now collects the pieces in order.
- `tests/checks.test.ts`: a `var()` that never closes, with 400,000 spaces after its fallback's comma, is followed in under 4 seconds. A pattern that read those spaces two ways took seconds at half as many.
- `tests/checks.test.ts`: a custom property's value of 100,000 blocks after a run of 100,000 spaces is read in under 4 seconds. A reader that read the segment again at each `{` would take the square.
- `tests/system.test.ts`: an alias bomb of nine aliases at each of eight levels stops at the node limit in under 4 seconds, and places nothing.
- `tests/system.test.ts`: a design document's line of 1 MB, a key or a heading with a long run of space, is read in under 4 seconds. Each cost the square of the line, about 7 and 17 minutes.
- `tests/commands.test.ts`: `project` follows a token that names another ten times at each of seven steps in under 4 seconds, and gives the first long step as a finding.
- `tests/rounds.test.ts`: 400 rounds of 200 comments, answered by none of 399 changes files, are read in under 4 seconds. Each comment looked through each later round's answers, about 2.3 seconds for 200 rounds and four times that for 400; the answers gathered once take about 0.15.
- `tests/product.test.ts`: a design of 201 screens checks, builds, and lists its shots within the test's time limit, with a page under 600 KB. A design of 2,000 screens and 4,000 states checks and builds within 10 seconds each, in a process of its own; each took about half a second.
- `tests/viewer/walk.test.ts`: the viewer redraws that design of 2,000 screens on a key press in no more than 30 times the time of one of 200, the middle of seven presses. Each redraw looked a screen up by a search of the list, and took about 360 ms; with one map of the screens, built once, it takes about 90. A ceiling in milliseconds failed on a shared CI runner, and a ratio holds on a slow machine as on a fast one.
- `tests/viewer/walk.test.ts`: the Board of that design of 2,000 screens is ready in no more than 10 times the time of one of 200, the middle of three opens. Once ready, it holds every cell, and a frame only for the cells near the view. It made a frame for every cell, then read the place of every cell each time one loaded, and took about 3.6 s against 0.47 s. Now it makes a cell's frame when the cell comes near the view, and takes about 0.55 s against 0.13 s.

### The revert proofs

**A control is proved by taking it out.** For each control, remove it alone, run the tests, see the named test fail, and put the control back. A new control lands with its test and with that proof run. `tests/controls.test.ts` exists for the controls whose removal no other test noticed.

Every control in the table of section 12 had this proof run at least once, and so did each rule of the two layer tests, by a mutation of a module. The cost of a read has its proof too. Each ceiling test runs the check in a process of its own and stops it at its ceiling, because the runtime cannot end a test inside synchronous work. So with the slow form put back, the test fails at its ceiling and never hangs. Two things could not be proved this way. Know them before you trust a green run:

1. **The capture's network flags.** Taking them out would send real traffic. The test that watches the capture's sockets has no revert proof.
2. **The call that removes stale profiles at a capture's start.** The function has a test, and so does the process id the capture writes into its profile. The call itself has none.

The test of a signal in the middle of a capture gives the capture a temporary folder of its own. So it finds only its own profile and its own Chrome, and a second copy of the tests that captures beside it does not make it fail. It plants a profile in the shared temporary folder to stand for that copy.

## 14. How to

Each recipe ends with the same two steps: run `bun run check`, and prove a new control by a revert.

### Add a rule

1. Add its row to `RULE_ROWS` in `src/finding.ts`, among its family's rows, as `<family>.<rule>`: `stops(means)` for a problem that stops the page, `problem(means)` or `note(means)` for one that does not, with the WCAG criteria it answers to, and `means` one line of what is wrong when it fires. Give it a `since` in `SINCE` of `src/checks/rules.ts` when it arrives after format 1.
2. Give its finding in the check that can find it: the walk, or a module of `src/checks/`. Use the id. The type checker refuses an id the table lacks.
3. Write the message so it says what is wrong and what to do. End nothing with the rule's id: the printer adds it.
4. Add a row to `tests/checks.test.ts`: a small design that passes and one that fails, by rule id, file, and line.
5. Write the reference again: `bun src/cli.ts guide --reference > docs/reference.md`.
6. If the rule changes a recorded case, record again with `RECORD=1 bun test tests/cases.test.ts`, and list each changed result in the commit.

A new family also gets a line in `FAMILIES` in `src/finding.ts`; a family is a topic, so a rule joins the family of what it reads. Think twice before a rule stops the page: it stops every page that breaks it, and no project can turn it off. An outcome of a command, which no reading of a design gives, is `outcome(level, ends, means)`, and the reference lists it apart.

### Add a command, or a flag

1. Add the command, or the flag, to `COMMANDS` in `src/cli/arguments.ts`, with its help: the one place that says what each flag means.
2. Write the command's function in `src/cli.ts`, and add it to `DISPATCH`, whose type holds one function for each command of `COMMANDS`, so a command with none is a type error. It composes stages and returns its exit code, its JSON, and its lines. It never prints. It reads each flag by its name, without its `--`, and a name no command has is a type error. The guide lists the commands from `COMMANDS`.
3. A command that ends takes `--json`. Add its own keys to `$defs` in `schemas/output.schema.json`, under the command's name.
4. Add its rows to `tests/commands.test.ts`: the envelope against the schema, and each exit code.
5. Write the reference again, as above, and run `bun tools/tech-spec.ts` for section 10 of this page. The reference lists the commands, and the README copies no list of them.

A stage that the command needs goes into `src/`, in a row of `src/modules.ts`, and into `src/index.ts`.

### Add a name of the format

A new name changes what a designer may write. Decide first whether an old design stays valid. If it does not, the change is a new format: raise `FORMAT`, and give each rule that reads the name the new `since`.

1. Add the name to `VOCABULARY`, `MEANING`, and `ATTR` in `src/format.ts`, and nowhere else.
2. Add its example to `NAME_EXAMPLES` in `src/guide.ts`. `tests/examples.test.ts` checks it.
3. Read it in the walk, `src/design/read.ts`, and say on which element it may stand.
4. If the viewer reads or sets it, add it to `READ` or `SET` in `viewer/names.ts`, use the constant in the page module, and build the viewer again.
5. If the viewer reads it, add it to [what the viewer reads from the design](#what-the-viewer-reads-from-the-design).
6. Write the reference again.

A new slot, `<meta>` name, platform, or theme is one entry in `SLOTS`, `META`, `PLATFORMS`, or `THEMES` in `src/format.ts`. A new platform also needs a frame.

### Add a frame

`assets/devices.json` is the one device table. `shippedDevices` in `src/assets.ts` reads it. The frames today:

<!-- generated:frames, by tools/tech-spec.ts: never edit by hand -->
| Id | Name | Platform | Size, CSS px | System bars, CSS px |
| --- | --- | --- | --- | --- |
| `ios` | iPhone | ios | 390 by 844 | 47 top, 34 bottom |
| `android` | Android | android | 412 by 915 | 52 top, 24 bottom |
| `320` | Web | web | 320 by 568 | none |
| `768` | Web | web | 768 by 1024 | none |
| `1024` | Web | web | 1024 by 768 | none |
| `1440` | Web | web | 1440 by 900 | none |
| `desktop` | Desktop app | desktop | 1280 by 800 | none |
| `desktop-1440` | Desktop app | desktop | 1440 by 900 | none |

Frames a full pass of shots takes, for each declared platform: web: `320`, `1024`; ios: `ios`; android: `android`; desktop: `desktop`.
<!-- /generated:frames -->

The rows are in the order of the viewer's frame menu. The first frame of a platform is that platform's default.

1. Add the frame to `frames` in `assets/devices.json`: its id, name, platform, width, and height in CSS px, and a phone's `safe_area`. Each size in the table is a real device's, with the public source it was copied from and the day it was read. Keep that rule.
2. To make a full pass of shots take it, add its id to `shots` for its platform.
3. Run `bun tools/tech-spec.ts`. If the shot lists change, record the cases again. Then write each stored manifest of `tests/golden/` again: it is what the command in its name prints for the design in its name, the starter or the existing test project, as `tests/commands.test.ts` shows.

A project cannot add a frame of its own yet, which the product specification lists as [later work](product-spec.md#work-left-out-and-when-to-start-it).

### Add a view

1. Write the view's module in `viewer/views/`. It exports the panel it builds and one render function over the state.
2. Add one row to `VIEW_TABLE` in `viewer/views/table.ts`: its name, its label from `viewer/words.ts`, its panel, its render function, and what is ready. A row with no label fails the type check.
3. Put its words in `viewer/words.ts`, and any id it finds in the registry of `viewer/dom.ts`.
4. Run `bun run build:viewer`, and commit `assets/viewer.html` and `assets/viewer.css` with the source.
5. Add its steps to the walk, and record the walk again on purpose.

The markup, `viewer/viewer.html`, needs no change, and the layer table needs no row. Any other new viewer module gets a row in `tests/viewer/layers.test.ts` and a row in section 7 of this page.

### Change the page contract

The tool and the viewer meet in one place. Change `schemas/page-config.schema.json`, the type `PageConfig` in `src/contract.ts`, `pageConfig` in `src/page.ts`, the reader in `viewer/design.ts`, and [the page contract](#the-page-contract) in one commit. `pageConfig` returns a `PageConfig`, and the viewer reads the block by the keys of that type, so a key renamed on one side does not compile on the other. A retyped key does compile: the viewer reads each value as unknown and checks it with a guard of its own, so a value of the new type fails the old guard and the viewer falls back to its default, in silence. So change the guard in `viewer/design.ts` with the type, and open a built page to see the value in use. A renamed, removed, or retyped key raises `OUTPUT_VERSION`.

### Release a version

The version is written in `package.json`, and the two plugin manifests repeat it, held equal by a test. `--version` and the reference print it.

1. Run `bun run check` on a clean tree.
2. Raise the version in `package.json`, `.claude-plugin/plugin.json` and `.antigravity-plugin/plugin.json`; `tests/plugin.test.ts` fails while they differ, and Claude Code finds an update by the plugin's version. Write the reference again, because its first line names the version.
3. In `CHANGELOG.md`, name the `Unreleased` section by the version and the day, as `## <version> (<day>)`, because the release takes its text from the section that heading names. It says what changed for a person who uses the tool, in the order they meet it.
4. If a printed shape changed, say so there, and check that `OUTPUT_VERSION` rose when a key was renamed, removed, or retyped. If a design must change, check `FORMAT`. If a stored round must change, check `ROUND_VERSION`.
5. Run `bun run compile`, and run the binary's `--version` and one `build` from another folder.
6. Commit, and push the commit to main. Once the check passes on it, tag it as `v<version>`, and push the tag.

A pushed tag starts `.github/workflows/release.yml`. It first runs the check, `.github/workflows/check.yml` called as a reusable workflow, on the tag's commit, on macOS, Linux, and Windows; nothing is built until it passes, so no release holds a commit the check has not passed on. Then it builds the five binaries, for macOS on arm64 and x64, for Linux on x64 and arm64, and for Windows on x64, each on a GitHub machine of its own system, and runs each there, the macOS x64 one under Rosetta 2: it must print the package's version, start a design and check it, and, from a folder outside the clone, write and build the example, start a design document, and print a reference equal to `docs/reference.md`, so a shipped file the binary does not carry fails here. The release stops when the check or a binary fails, when a binary is missing, when the tag names another version than the package, or when the tag's commit is not on main. It writes `SHA256SUMS`, and signs a SLSA build provenance for each binary and for `SHA256SUMS` with `actions/attest`, which `gh attestation verify` checks, as [the install steps](../llms-install.md#with-no-bun-a-release-binary) show. It makes the GitHub release as a draft, with the version's section of the CHANGELOG as its text and without its heading, uploads the binaries and the sums to it, and only then publishes it; a run that stops between leaves a draft, which only the repository's writers see. The check and the build run with the right to read the repository only; the last job alone may write the release and the attestation.

To try a release before the tag, start the workflow by hand from the repository's Actions tab, or with `gh workflow run release.yml`. That run runs the check, and builds and runs the five binaries the same way, keeps each as an artifact of the run, named by its file, and publishes nothing. An artifact is a zip that a signed-in GitHub user downloads from the run's page, for 90 days; a person who installs the tool takes the binary from the release instead.

The package is private, so nothing is published to npm. The licence is Apache-2.0, in `LICENSE`. A release is a tagged commit, and its binaries are built from that commit.

## 15. Technical limits

This section keeps the limits only a maintainer meets. Later work a person would notice, and the decisions, are in the product specification's [Later](product-spec.md#5-later). Nothing here needs a part of the tool to be redone.

### Left in the code

| Item | Today | What it needs | Start it when |
| --- | --- | --- | --- |
| A reduce block matched to a rule by more than its selector text | `accessibility.motion-reduce` compares the selector's text | a selector reader | a false alarm or a false pass of the motion rule, reported in use |
| CSS read by a tokenizer | one reader by braces, with comments and strings read as a browser reads them; the tokens blocks' values for a suggestion are still read by a pattern | a CSS tokenizer in `src/css/sheet.ts`; no finding waits on it | the reader by braces causes a wrong finding |
| Open elements after the body | the nesting test reads texts inside the body: a tag after `</body>` or `</html>`, which a browser puts back into the body, is not held to Chrome | the random texts written around a document's own tags | a design with content after `</body>` is read at another place than a browser's |
| The runtime's own server | `node:http` | a proof that every refused path is still refused before the handler | `node:http` causes a fault |
| The list that keeps every Chrome the capture started | `started` in `src/capture.ts` keeps each one to the end, because a Bun older than 1.4.0 could close a pipe's file number twice, and the tool needs Bun 1.4.4 | the list taken out, and the test in `tests/product.test.ts` that holds it run on every system | a run without the list is proven |

The rows run from a design's rules to the runtime under them.

### Small things known and left

The list runs from the tool to the viewer.

- **A rule's `since`.** Every rule has `since` 1. The first format change is the first real use of it.
- **A finding's column in a flow.** The tool writes a flow's link targets again with the flow's id after it places the blocks. So on such a line a column can move by the few characters that adds. A block used in the middle of that line could then be named as the host. No test holds this case.
- **Unused exports.** No one has audited every `export` in `src/` for a reader.
- **Sub-pixel positions.** The last button of a group sits 0.1 to 0.3 px over its group's edge at some widths.
- **The dock's labels at 320 px with doubled text** wrap with the browser's own hyphenation, which depends on its word list.
