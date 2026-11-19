# The open-prototype reference

Version 0.1.0, design format 1. `open-prototype guide --reference` writes this page from the code; never edit it by hand.

## The vocabulary

Every name the tool reads in a design starts with `data-proto-`. A design never writes a name the tool sets.

| Attribute | Kind | Meaning |
| --- | --- | --- |
| `data-proto-format` | structure | on &lt;html>: the design format the file is written in |
| `data-proto-screen` | structure | on a &lt;section>: a screen, by its id |
| `data-proto-title` | structure | on a screen or a flow: its name, as data |
| `data-proto-parent` | structure | on a screen: the screen Back returns to |
| `data-proto-initial` | structure | on a screen: the state it opens in |
| `data-proto-state` | structure | on a direct child of a screen: one state of it |
| `data-proto-source` | structure | on a screen: the list in the fixtures whose chosen entry the screen's fields show |
| `data-proto-device` | structure | a frame the design draws itself, by its id in the device table |
| `data-proto-text` | content | fills the element's text from a key of the fixtures, from the top, wherever it stands |
| `data-proto-image` | content | on an &lt;img>: shows the image a fixtures key names |
| `data-proto-fixtures` | content | on &lt;script type="application/json">: the design's example data |
| `data-proto-tokens` | content | on a &lt;style>: a tokens block, where colours and depth may be raw values |
| `data-proto-list` | content | on a container: repeats its item over a list in the fixtures |
| `data-proto-item` | content | on the &lt;template> that is a list's one direct child: the item drawn for each entry |
| `data-proto-field` | content | fills the element's text from a key of the current item: its list's entry, or its screen's chosen entry |
| `data-proto-limit` | content | on a list: draws at most this many items |
| `data-proto-go` | behaviour | opens a screen, or a screen's state, as &lt;screen>/&lt;state>; inside an item, for that item |
| `data-proto-back` | behaviour | returns to the screen's parent |
| `data-proto-toggle` | behaviour | on a button: opens and closes the panel of that name |
| `data-proto-panel` | behaviour | a small disclosure a toggle opens and closes |
| `data-proto-component` | composition | a name shared with the built interface's component |
| `data-proto-variant` | composition | the component's variant |
| `data-proto-use` | composition | puts the block of that name here: the file blocks/&lt;name>.html replaces this element |
| `data-proto-arg-<name>` | composition | on a use: the value for {{name}} in the block |
| `data-proto-flow` | composition | puts the flow of that name here: the file flows/&lt;id>.html replaces this element, qualifying its screen ids as &lt;id>:&lt;screen> |
| `data-proto-slot` | composition | where the tool puts content: title or back-label |
| `data-proto-platform` | set by the tool | set by the tool on a frame's root: the platform shown |
| `data-proto-theme` | set by the tool | set by the tool on a frame's root: the theme shown |
| `data-proto-pick` | set by the tool | set by the tool: the item a go inside a list opened |
| `data-proto-highlight` | set by the tool | set by the tool: the element a comment points to |
| `data-proto-comment` | set by the tool | set by the tool: an element with a comment |
| `data-proto-commenting` | set by the tool | set by the tool on a frame's root: comments are on |
| `data-proto-href` | set by the tool | set by the tool on a link that leaves its screen: the address the design wrote, as text, since the link's href in the page is about:blank |
| `data-proto-section` | set by the tool | set by the tool on a navigation's link to a screen the shown one stands under (its parent, or the parent's parent): the section a person is in |

Slots: `title`, `back-label`. Head `<meta>` names: `platforms`, `themes`, `work-item`, `tokens`, `viewport`. Platforms: web, ios, android, desktop. Themes: light, dark.

## The allow-list

A design holds these elements and attributes, and nothing else: anything outside the list is `unsafe.markup`, and the page is not written.

- **The head:** `<title>`, `<style>`, a `<meta>` with a charset, a policy, or one of the names above, and the fixtures block, `<script type="application/json" data-proto-fixtures>`.
- **The body:** `<a>`, `<abbr>`, `<address>`, `<article>`, `<aside>`, `<b>`, `<bdi>`, `<bdo>`, `<blockquote>`, `<br>`, `<button>`, `<caption>`, `<cite>`, `<code>`, `<col>`, `<colgroup>`, `<datalist>`, `<dd>`, `<del>`, `<details>`, `<dfn>`, `<dialog>`, `<div>`, `<dl>`, `<dt>`, `<em>`, `<fieldset>`, `<figcaption>`, `<figure>`, `<footer>`, `<h1>`, `<h2>`, `<h3>`, `<h4>`, `<h5>`, `<h6>`, `<header>`, `<hgroup>`, `<hr>`, `<i>`, `<img>`, `<input>`, `<ins>`, `<kbd>`, `<label>`, `<legend>`, `<li>`, `<main>`, `<mark>`, `<menu>`, `<meter>`, `<nav>`, `<ol>`, `<optgroup>`, `<option>`, `<output>`, `<p>`, `<pre>`, `<progress>`, `<q>`, `<s>`, `<samp>`, `<section>`, `<select>`, `<small>`, `<span>`, `<strong>`, `<style>`, `<sub>`, `<summary>`, `<sup>`, `<table>`, `<tbody>`, `<td>`, `<template>`, `<textarea>`, `<tfoot>`, `<th>`, `<thead>`, `<time>`, `<tr>`, `<u>`, `<ul>`, `<var>`, `<wbr>`, and `<svg>`. A `<style>` stands directly in the body, and a `<template>` is a list's item.
- **Inside `<svg>`:** `<circle>`, `<clippath>`, `<defs>`, `<desc>`, `<ellipse>`, `<g>`, `<line>`, `<lineargradient>`, `<mask>`, `<path>`, `<polygon>`, `<polyline>`, `<radialgradient>`, `<rect>`, `<stop>`, `<svg>`, `<symbol>`, `<text>`, `<title>`, `<tspan>`, `<use>`.
- **On every element:** `class`, `contenteditable`, `dir`, `hidden`, `id`, `inert`, `lang`, `popover`, `role`, `slot`, `style`, `tabindex`, `title`, and every `data-` and `aria-` attribute. No `on` attribute, which is an event handler.
- **On an HTML element:** `abbr`, `alt`, `autocomplete`, `checked`, `cols`, `colspan`, `datetime`, `disabled`, `for`, `headers`, `height`, `high`, `href`, `inputmode`, `label`, `list`, `low`, `max`, `maxlength`, `min`, `minlength`, `multiple`, `name`, `open`, `optimum`, `placeholder`, `readonly`, `rel`, `required`, `reversed`, `rows`, `rowspan`, `scope`, `selected`, `span`, `src`, `start`, `step`, `target`, `type`, `value`, `width`. An `href` on an `<a>` or a `<use>` goes to `#<id>`, and on an `<a>` to `https://` too; a `src` is a `data:image` URI on an `<img>`; a `<button>` is `type="button"`; and an `<input>` is of no type that sends or loads: `image`, `file`, `submit`, or `reset`.
- **On an element inside `<svg>`:** `clip-path`, `clip-rule`, `cx`, `cy`, `d`, `dominant-baseline`, `dx`, `dy`, `fill`, `fill-opacity`, `fill-rule`, `focusable`, `font-family`, `font-size`, `font-weight`, `gradienttransform`, `gradientunits`, `height`, `mask`, `offset`, `opacity`, `pathlength`, `points`, `preserveaspectratio`, `r`, `rx`, `ry`, `stop-color`, `stop-opacity`, `stroke`, `text-anchor`, `transform`, `vector-effect`, `viewbox`, `width`, `x`, `x1`, `x2`, `xmlns`, `y`, `y1`, `y2`, and every `stroke` attribute.
- **In a style:** a `url()` of an `@font-face` names a font file inside the project, through no link: `.otf`, `.ttf`, `.woff`, `.woff2`, up to 2 MB a file and 10 MB a page. A path in a design's `<style>` is read from the design's folder. A path in a tokens file is read from that file's folder. The build writes each file into the page as a `data:` URL, and a file it cannot carry is `integrity.font`. A font loaded from the network is `integrity.load`. Any other `url()`, an `@import`, or an `image-set()` loads only as a `data:` URI, or a `#<id>` of the page; one that names a file or the network is `integrity.load`.

## Rules

A finding is a problem or a note: a problem must be fixed, and a note is advice. Each finding names its rule's id in brackets at the end of its line, such as `[paint.raw-color]`.

The tool has 79 rules in 13 families, and 9 outcomes of a command, listed apart below. A rule that stops the page is a problem, and its page is not written. The settings file turns a rule off with `"rules": {"<id>": "off"}`; a rule that stops the page stays on, and so does `stories.missing`, the one finding of a command run only when asked. A setting that names one, or an outcome, is refused. `check`, `project`, and `stories` leave out every rule that is off.

The rules read the design file and draw nothing. So none checks contrast, target size, reflow, or focus, and none runs an accessibility scan: those need a person, or a review in a browser. A criterion is a success criterion of WCAG 2.2, with its level.

| Family | Means |
| --- | --- |
| `read` | the design's files, its document, its format, and its example data can be read, within the reader's limits |
| `unsafe` | the design holds no markup that could load or run something |
| `structure` | the design's screens, states, slots, lists, and names |
| `compose` | the blocks a design uses, and their arguments |
| `integrity` | links, ids, test ids, the example data, and the files a page loads agree with the design |
| `flow` | the flows a design includes |
| `paint` | colours and depth come from the tokens |
| `copy` | the words a person reads are real copy |
| `system` | the project's design document, DESIGN.md, and the tokens files and tokens a design reads: it is the one source of each value |
| `accessibility` | what a design file shows of accessibility with no browser: its language, labels, names, alternatives, headings, landmarks, and motion |
| `device` | the platforms, themes, and frames a design declares |
| `rounds` | the review rounds beside a design |
| `stories` | the built interface's stories cover the design's components |
| `request` | outcomes: the request itself was refused, and the next step is in its message |
| `tool` | outcomes: the tool failed, a fault of the tool, or a capture that cannot start or times out |

| Rule | Level | Stops the page | Means | Criterion |
| --- | --- | --- | --- | --- |
| `read.file` | problem | yes | a file of the design, a flow, or a block cannot be read, or has a name the tool does not read | - |
| `read.document` | problem | yes | the design has no &lt;body>, or its &lt;html> or &lt;body> holds an attribute that would blank every frame | - |
| `read.format` | problem | yes | the design names a version of the format this tool does not read | - |
| `read.fixtures` | problem | yes | the example data, the fixtures block, is not JSON, holds no object, or is written twice or outside the main file | - |
| `read.depth` | problem | yes | the design nests elements deeper than the tool reads, so what it read is a fragment of the design | - |
| `read.var-limit` | problem | yes | a custom property, with each var() in it followed, is too long for any check to follow | - |
| `unsafe.markup` | problem | yes | the design holds markup outside the allow-list, or markup that could load or run something | - |
| `structure.name` | problem | no | a screen's id, a state's name, or a component's or a variant's name is not in the form a link or code can name | - |
| `structure.state-place` | problem | no | a state is not a direct child of its screen | - |
| `structure.screen-unclosed` | problem | no | a screen has no &lt;/section>, so the next screen would be drawn inside it | - |
| `structure.view-link` | problem | no | a link goes to another view by an href, where the format links views by screen and state | - |
| `structure.slot` | problem | yes | a slot is no slot of the format, or two of one slot show at once | - |
| `structure.tool-name` | problem | yes | the design writes a name that only the tool sets inside a frame | - |
| `structure.list` | problem | no | a list, its item, or its limit is written wrong, or a list stands inside another list's item | - |
| `structure.nesting` | problem | no | markup a browser nests otherwise than it is written, such as a &lt;b> closed by &lt;/p> | - |
| `structure.vocabulary` | problem | no | a name with the format's prefix is no name of the format, or stands where it does not belong | - |
| `structure.no-screen` | problem | no | the design draws no screen | - |
| `structure.no-state` | problem | no | a screen has no state | - |
| `structure.work-item` | problem | no | the work item the head names is no work item: 1 to 64 characters with no space | - |
| `structure.product-name` | problem | no | the product's name in the example data is more than one short line | - |
| `structure.state-near-core` | note | no | a state's name is near a usual one, such as sucess for success; a screen's own state is fine | - |
| `compose.use` | problem | yes | a block the design uses is missing or misnamed, or its use holds what the block would drop | - |
| `compose.arg` | problem | yes | a block reads an argument its use does not give, or an argument's name is malformed | - |
| `compose.cycle` | problem | yes | a block uses itself, at once or through another block | - |
| `compose.limit` | problem | yes | the blocks are used too many times, or add too much text, for the tool to read | - |
| `compose.unused-arg` | note | no | a use gives an argument the block never reads; the page is as it would be | - |
| `integrity.labelledby` | problem | no | aria-labelledby names an id the design lacks | - |
| `integrity.testid` | problem | no | a control has no test id | - |
| `integrity.id-repeat` | problem | no | two elements share an id | - |
| `integrity.screen-repeat` | problem | no | two screens share an id, or their ids differ only by case, so they would share one picture | - |
| `integrity.initial` | problem | no | a screen's first state names no state of it | - |
| `integrity.parent` | problem | no | a screen's parent names no screen | - |
| `integrity.link` | problem | no | a link names a screen, or a state of a screen, that the design lacks | - |
| `integrity.fixture-key` | problem | no | the design reads a key the example data lacks, or one whose value cannot be shown | - |
| `integrity.testid-repeat` | problem | no | two elements of one screen share a test id | - |
| `integrity.unreached` | problem | no | no link reaches a screen from the first screen | - |
| `integrity.image` | problem | no | an image the example data names cannot be carried into the page | - |
| `integrity.font` | problem | no | a font file a style names cannot be carried into the page | - |
| `integrity.load` | problem | no | a style loads a file or from the network, which the page's policy blocks: an image loads only as a data: URI | - |
| `flow.include` | problem | yes | a flow the design includes is missing, misnamed, or holds what a flow may not | - |
| `flow.empty` | problem | no | a flow holds no screen | - |
| `flow.unreached` | problem | no | no screen or navigation reaches a flow | - |
| `paint.raw-color` | problem | no | a colour is written raw, in a style or an svg's attribute, where it should read a token | - |
| `paint.depth` | problem | no | a shadow or a layer's depth is written outside the tokens block, where it should read a token | - |
| `copy.placeholder` | problem | no | the copy holds placeholder text, such as lorem ipsum, TODO, or a {{name}} left unfilled | - |
| `copy.emoji` | problem | no | the copy draws an icon as an emoji | - |
| `system.tokens-file` | problem | yes | a tokens file the settings name cannot be read, or holds what a tokens file may not | - |
| `system.read` | problem | no | the design document's front matter is not YAML, holds no map, or is nested too deep | - |
| `system.name` | problem | no | a key of the design document is a name the tool never reads, or one a CSS name cannot take | - |
| `system.value` | problem | no | a value of the design document is not of the kind its key takes | - |
| `system.reference` | problem | no | a reference in the design document names no token, a token of another kind, or a loop | - |
| `system.empty` | note | no | the design document holds no tokens | - |
| `system.version` | note | no | the design document is written for another version of DESIGN.md, so the tool reads the keys it knows | - |
| `system.theme` | note | no | the design shows a theme the design document has no colours for, or a colour has no twin in the other theme | - |
| `system.override` | problem | no | a design or a tokens file sets a token of the design document to another value | - |
| `system.unknown-token` | problem | no | the design reads a token the design document does not give | - |
| `system.extra-token` | note | no | a design or a tokens file adds a token the design document does not give | - |
| `system.unitless` | note | no | the design reads a bare number where CSS needs a length, so CSS drops the declaration | - |
| `system.component` | note | no | a component or a variant the design names is in no key of the design document's components | - |
| `accessibility.lang` | problem | no | the page names no language, or no well-formed language tag | 3.1.1 Language of Page (A) |
| `accessibility.label` | problem | no | a form field has no label | 4.1.2 Name, Role, Value (A) |
| `accessibility.name` | problem | no | a button or a link has no name a screen reader can say | 4.1.2 Name, Role, Value (A); 2.4.4 Link Purpose (In Context) (A) |
| `accessibility.alt` | problem | no | an image has no alternative text | 1.1.1 Non-text Content (A) |
| `accessibility.headings` | note | no | a view shows no level-1 heading or more than one, or skips a heading level; a note, since the criterion asks for no single h1 and a design may skip on purpose | 1.3.1 Info and Relationships (A) |
| `accessibility.main` | note | no | a view shows no &lt;main> landmark, or more than one | 1.3.1 Info and Relationships (A); 2.4.1 Bypass Blocks (A) |
| `accessibility.motion-reduce` | problem | no | an animation or a transition still moves, resizes, or reshapes under reduced motion; a problem though the criterion is AAA, since the file shows it for sure and one reduce rule fixes it | 2.3.3 Animation from Interactions (AAA) |
| `accessibility.motion-endless` | note | no | an animation plays for ever, and reduced motion does not stop it | 2.2.2 Pause, Stop, Hide (A) |
| `accessibility.flash` | note | no | an animation changes light or colour more than three times a second; a note, since a file shows how often a value changes, and not the flash's size or brightness, which the criterion's threshold reads | 2.3.1 Three Flashes or Below Threshold (A) |
| `accessibility.image-motion` | problem | no | an animated image plays for ever | 2.2.2 Pause, Stop, Hide (A) |
| `device.declared` | problem | no | the head declares a platform or a theme the format does not have | - |
| `device.frame` | problem | no | a drawn device frame names no frame of the device table | - |
| `device.frame-style` | problem | no | a drawn device frame lacks the table's width or height, or does not scroll inside | - |
| `device.picture-height` | note | no | from shots --capture: a view is taller than a picture takes, so its picture stops there | - |
| `rounds.file` | problem | no | a round's file is not a JSON object, so it is left out | - |
| `rounds.field` | problem | no | a round's file lacks a field, writes one wrong, or holds a key it has no place for | - |
| `rounds.answer` | problem | no | a change answers a comment no earlier round holds | - |
| `rounds.limit` | note | no | a round is left out of the page, which shows the rounds while they fit | - |
| `rounds.view` | note | no | a comment names a view the design no longer has | - |
| `stories.missing` | problem | no | from stories: a component or a variant of the design has no story in the built interface | - |

### Outcomes of a command

An outcome is no rule a design is checked by: a command gives it, never a reading of a design, and no setting turns it off. Each still names its id in brackets, and the JSON a command prints holds it as a finding.

| Outcome | Level | Means | Exit code |
| --- | --- | --- | --- |
| `integrity.more` | note | from check: the last line past the findings limit, which counts the problems and the notes the limit cut | 1 when a problem is kept, else 0 |
| `request.usage` | problem | the command line is not one the tool reads: an unknown command or flag, or a flag the command does not take | 2 |
| `request.path` | problem | a path is outside the project, or the file system refused it | 2 |
| `request.file` | problem | a file the command names cannot be read | 2 |
| `request.settings` | problem | the settings file is not one the tool reads, or turns off a rule that stays on | 2 |
| `request.value` | problem | a flag's value is malformed, or names what the design or the device table lacks | 2 |
| `request.exists` | problem | a file the command would write is there, and the tool writes over no file of yours | 2 |
| `request.browser` | problem | no Chrome was found to capture with, or the capture was refused | 2 |
| `tool.failed` | problem | the tool failed: a fault of its own, or a capture that cannot start or times out | 3 |

## Commands

| Command | Arguments | Flags | Does |
| --- | --- | --- | --- |
| `check` | &lt;file> | --json | check the design and write nothing: every finding with its file and line; exit 1 on a problem |
| `build` | &lt;file> | --open, --json | write the design's page in the viewer, and print its findings |
| `screens` | &lt;file> | --json | print the design's screens: each one's id, title, parent, first state, and states in drawn order |
| `components` | &lt;file> | --json | print the design's component contract |
| `shots` | &lt;file> | --capture, --changed-component, --changed-screen, --frames, --out, --json | print the views to capture, sized to the change, and take them with --capture |
| `stories` | &lt;index.json> &lt;file> | --json | check Storybook's index.json against the component contract: exit 1 on a missing story |
| `serve` | &lt;file> | --lan, --port | serve the page on 127.0.0.1 until Ctrl-C, built again on each reload (a link that changes only after # does not reload: reload the page), with --lan for a phone |
| `project` |  | --json | print what the project holds for a design: its design document's tokens, components, and section headings with their lines, its token files, and its story index |
| `new-design` | &lt;file> | --title, --json | start a design file from the starter |
| `new-design-md` |  | --name, --json | start the project's design document, DESIGN.md, with its tokens and sections to fill in |
| `save-comments` | &lt;source> &lt;file> | --round, --json | save the comments the viewer gave as the design's next round |
| `example` |  | --open, --json | write the tool's example into &lt;out-dir>/example/, a complete design with flows and blocks, and build it |
| `guide` |  | --reference, --json | print the guide: the format's whole vocabulary, composition, the review round, and the commands |

Every command also takes `--out-dir DIR`, the folder for pages and screenshots (default: .prototype), anywhere on the line, and `--version` prints the version. `open-prototype <command> --help` says what each flag of a command means.

No command writes over a design, a design document, or a saved round. The one exception is `example`, which writes its own files in `<out-dir>/example/` again each time in an output folder the tool made, so keep no edits there; in a folder of yours, such as `--out-dir design`, it writes over none of your files, and a file in its way refuses it.

## Settings

A project may keep `prototype.config.json` in its top folder. The tool reads it strictly, so a key it does not know is refused. The flag `--out-dir` wins over the file. For example:

```json
{
  "tokens": ["design/tokens.css"],
  "frames": ["320", "1024", "1440"],
  "rules": { "copy.emoji": "off" }
}
```

The keys, in alphabetical order:

| Key | Sets | Default |
| --- | --- | --- |
| `design_md` | the project's design document, by its path inside the project; `null` reads none, and a path the settings name that does not exist is refused | `DESIGN.md`, read only when it exists |
| `frames` | the frames `shots` takes when a command names none, by their ids in the device table | each declared platform's own |
| `out_dir` | the output folder; one the tool makes, or finds empty, gets an ignore file, so git skips it, and one that already holds files gets none | `.prototype` |
| `rules` | rules turned off, each as `"<id>": "off"`, such as `{"copy.emoji": "off"}` | none |
| `tokens` | the tokens files the build places before each design's styles | none |

## Exit codes

| Code | Means | Do this |
| --- | --- | --- |
| 0 | done; notes alone are still 0 | read the notes, then go on |
| 1 | the design has a problem | fix the design in the file the finding names |
| 2 | the request was refused: bad usage, the file system said no, a busy port, no Chrome found; each with the next step | fix the request, as the one line on stderr says |
| 3 | the tool failed: a fault of the tool, or a capture that cannot start or times out | report the command and what it printed |
| 130, 143 | stopped by a signal: Ctrl-C, or a stop request | nothing: `serve` ends so when you stop it |

## Modules

Each file of `src/` sits in one row; a file imports only from rows above it, or from files before it in its own row.

0. text, names, data, errors, and files: `modules.ts`, `text.ts`, `format.ts`, `contract.ts`, `json.ts`, `finding.ts`, `errors.ts`, `fs.ts`
1. readers: `html/unescape.ts`, `html/tokenizer.ts`, `css/sheet.ts`, `css/colors.ts`, `css/fonts.ts`
2. shipped files and settings: `assets.ts`, `project.ts`
3. the design: `design/allow.ts`, `design/facts.ts`, `design/read.ts`, `design/blocks.ts`, `design/flows.ts`, `design/designmd.ts`, `design/system.ts`, `design/files.ts`, `design/load.ts`
4. the checks: `checks/names.ts`, `checks/devices.ts`, `checks/controls.ts`, `checks/integrity.ts`, `checks/lint.ts`, `checks/flows.ts`, `checks/images.ts`, `checks/fonts.ts`, `checks/system.ts`, `checks/accessibility.ts`, `checks/rounds.ts`, `checks/rules.ts`
5. outputs and the world: `manifest.ts`, `shots.ts`, `stories.ts`, `story-index.ts`, `page.ts`, `output.ts`, `save.ts`, `scaffold.ts`, `guide.ts`, `server.ts`, `capture.ts`, `project-facts.ts`
6. the entry and the command line: `index.ts`, `cli/internal.ts`, `cli/arguments.ts`, `cli/reference.ts`, `cli.ts`

