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

Slots: `title`, `back-label`. Head `<meta>` names: `platforms`, `themes`, `work-item`, `tokens`, `viewport`. Platforms: web, ios, android, desktop. Themes: light, dark.

## The allow-list

A design holds these elements and attributes, and nothing else: anything outside the list is `unsafe.markup`, and the page is not written.

- **The head:** `<title>`, `<style>`, a `<meta>` with a charset, a policy, or one of the names above, and the fixtures block, `<script type="application/json" data-proto-fixtures>`.
- **The body:** `<a>`, `<abbr>`, `<address>`, `<article>`, `<aside>`, `<b>`, `<bdi>`, `<bdo>`, `<blockquote>`, `<br>`, `<button>`, `<caption>`, `<cite>`, `<code>`, `<col>`, `<colgroup>`, `<datalist>`, `<dd>`, `<del>`, `<details>`, `<dfn>`, `<dialog>`, `<div>`, `<dl>`, `<dt>`, `<em>`, `<fieldset>`, `<figcaption>`, `<figure>`, `<footer>`, `<h1>`, `<h2>`, `<h3>`, `<h4>`, `<h5>`, `<h6>`, `<header>`, `<hgroup>`, `<hr>`, `<i>`, `<img>`, `<input>`, `<ins>`, `<kbd>`, `<label>`, `<legend>`, `<li>`, `<main>`, `<mark>`, `<menu>`, `<meter>`, `<nav>`, `<ol>`, `<optgroup>`, `<option>`, `<output>`, `<p>`, `<pre>`, `<progress>`, `<q>`, `<s>`, `<samp>`, `<section>`, `<select>`, `<small>`, `<span>`, `<strong>`, `<style>`, `<sub>`, `<summary>`, `<sup>`, `<table>`, `<tbody>`, `<td>`, `<template>`, `<textarea>`, `<tfoot>`, `<th>`, `<thead>`, `<time>`, `<tr>`, `<u>`, `<ul>`, `<var>`, `<wbr>`, and `<svg>`. A `<style>` stands directly in the body, and a `<template>` is a list's item.
- **Inside `<svg>`:** `<circle>`, `<clippath>`, `<defs>`, `<desc>`, `<ellipse>`, `<g>`, `<line>`, `<lineargradient>`, `<mask>`, `<path>`, `<polygon>`, `<polyline>`, `<radialgradient>`, `<rect>`, `<stop>`, `<svg>`, `<symbol>`, `<text>`, `<title>`, `<tspan>`, `<use>`.
- **On every element:** `class`, `contenteditable`, `dir`, `hidden`, `id`, `inert`, `lang`, `popover`, `role`, `slot`, `style`, `tabindex`, `title`, and every `data-` and `aria-` attribute. No `on` attribute, which is an event handler.
- **On an HTML element:** `abbr`, `alt`, `autocomplete`, `checked`, `cols`, `colspan`, `datetime`, `disabled`, `for`, `headers`, `height`, `high`, `href`, `inputmode`, `label`, `list`, `low`, `max`, `maxlength`, `min`, `minlength`, `multiple`, `name`, `open`, `optimum`, `placeholder`, `readonly`, `rel`, `required`, `reversed`, `rows`, `rowspan`, `scope`, `selected`, `span`, `src`, `start`, `step`, `target`, `type`, `value`, `width`. An `href` on an `<a>` or a `<use>` goes to `#<id>`, and on an `<a>` to `https://` too; a `src` is a `data:image` URI on an `<img>`; a `<button>` is `type="button"`; and an `<input>` is of no type that sends or loads: `image`, `file`, `submit`, or `reset`.
- **On an element inside `<svg>`:** `clip-path`, `clip-rule`, `cx`, `cy`, `d`, `dominant-baseline`, `dx`, `dy`, `fill`, `fill-opacity`, `fill-rule`, `focusable`, `font-family`, `font-size`, `font-weight`, `gradienttransform`, `gradientunits`, `height`, `mask`, `offset`, `opacity`, `pathlength`, `points`, `preserveaspectratio`, `r`, `rx`, `ry`, `stop-color`, `stop-opacity`, `stroke`, `text-anchor`, `transform`, `vector-effect`, `viewbox`, `width`, `x`, `x1`, `x2`, `xmlns`, `y`, `y1`, `y2`, and every `stroke` attribute.
- **In a style:** a `url()` of an `@font-face` names a font file inside the project, through no link: `.otf`, `.ttf`, `.woff`, `.woff2`, up to 2 MB a file and 10 MB a page. A path in a design's `<style>` is read from the design's folder. A path in a tokens file is read from that file's folder. The build writes each file into the page as a `data:` URL, and a file it cannot carry is `integrity.font`. A font loaded from the network is `paint.network`.

## Rules

A finding is a problem or a note: a problem must be fixed, and a note is advice. Each finding names its rule's id in brackets at the end of its line, such as `[paint.raw-color]`.

A rule is on for a design whose format is at least its `since`. The settings file turns one off with `"rules": {"<id>": "off"}`; a `read` or `unsafe` rule stays on, and a setting that names one is refused.

The rules read the design file and draw nothing. So none checks contrast, target size, reflow, or focus, and none runs an accessibility scan: those need a person, or a review in a browser.

| Family | Means |
| --- | --- |
| `read` | the design cannot be read: the page is not written |
| `unsafe` | the design holds markup that could load or run something: the page is not written |
| `structure` | the design's screens, states, and names |
| `compose` | the blocks a design uses |
| `integrity` | links, labels, test ids, and the example data agree with the design |
| `flow` | the flows a design includes agree |
| `paint` | colors and depth come from the tokens |
| `copy` | the words a person reads are real copy |
| `system` | the project's design document, DESIGN.md, and the tokens a design reads from it: it is the one source of each value |
| `accessibility` | what a design file shows of accessibility with no browser: its language, headings, landmarks, and motion |
| `device` | the platforms and frames a design declares |
| `rounds` | the review rounds beside a design |
| `stories` | the built interface's stories cover the design's components |
| `request` | the request itself was refused: the next step is in its message |
| `tool` | the tool failed: a fault of the tool, or a capture that cannot start or times out |

| Rule | Family | Level | Since |
| --- | --- | --- | --- |
| `read.file` | read | problem | 1 |
| `read.document` | read | problem | 1 |
| `read.format` | read | problem | 1 |
| `read.fixtures` | read | problem | 1 |
| `read.flow` | read | problem | 1 |
| `read.tokens` | read | problem | 1 |
| `read.use` | read | problem | 1 |
| `read.use-arg` | read | problem | 1 |
| `read.use-cycle` | read | problem | 1 |
| `read.use-limit` | read | problem | 1 |
| `read.var-limit` | read | problem | 1 |
| `read.slot` | read | problem | 1 |
| `read.tool-name` | read | problem | 1 |
| `unsafe.markup` | unsafe | problem | 1 |
| `structure.screen-id` | structure | problem | 1 |
| `structure.name` | structure | problem | 1 |
| `structure.state-name` | structure | problem | 1 |
| `structure.state-place` | structure | problem | 1 |
| `structure.screen-unclosed` | structure | problem | 1 |
| `structure.view-link` | structure | problem | 1 |
| `structure.list` | structure | problem | 1 |
| `structure.list-nested` | structure | problem | 1 |
| `structure.vocabulary` | structure | problem | 1 |
| `structure.work-item` | structure | problem | 1 |
| `structure.product-name` | structure | problem | 1 |
| `structure.state-near-core` | structure | note | 1 |
| `integrity.label` | integrity | problem | 1 |
| `integrity.labelledby` | integrity | problem | 1 |
| `integrity.depth` | integrity | problem | 1 |
| `integrity.alt` | integrity | problem | 1 |
| `integrity.testid` | integrity | problem | 1 |
| `integrity.name` | integrity | problem | 1 |
| `integrity.id-repeat` | integrity | problem | 1 |
| `integrity.screen-repeat` | integrity | problem | 1 |
| `integrity.no-state` | integrity | problem | 1 |
| `integrity.initial` | integrity | problem | 1 |
| `integrity.no-screen` | integrity | problem | 1 |
| `integrity.parent` | integrity | problem | 1 |
| `integrity.link-screen` | integrity | problem | 1 |
| `integrity.link-state` | integrity | problem | 1 |
| `integrity.fixture-key` | integrity | problem | 1 |
| `integrity.testid-repeat` | integrity | problem | 1 |
| `integrity.unreached` | integrity | problem | 1 |
| `integrity.image` | integrity | problem | 1 |
| `integrity.font` | integrity | problem | 1 |
| `integrity.more` | integrity | problem | 1 |
| `flow.empty` | flow | problem | 1 |
| `flow.unreached` | flow | problem | 1 |
| `paint.raw-color` | paint | problem | 1 |
| `paint.svg-color` | paint | problem | 1 |
| `paint.depth` | paint | problem | 1 |
| `paint.network` | paint | problem | 1 |
| `copy.placeholder` | copy | problem | 1 |
| `copy.emoji` | copy | problem | 1 |
| `system.read` | system | problem | 1 |
| `system.name` | system | problem | 1 |
| `system.value` | system | problem | 1 |
| `system.reference` | system | problem | 1 |
| `system.empty` | system | note | 1 |
| `system.version` | system | note | 1 |
| `system.theme` | system | note | 1 |
| `system.override` | system | problem | 1 |
| `system.unknown-token` | system | problem | 1 |
| `system.extra-token` | system | note | 1 |
| `system.component` | system | note | 1 |
| `accessibility.lang` | accessibility | problem | 1 |
| `accessibility.heading-top` | accessibility | note | 1 |
| `accessibility.heading-skip` | accessibility | note | 1 |
| `accessibility.main` | accessibility | note | 1 |
| `accessibility.motion-reduce` | accessibility | problem | 1 |
| `accessibility.motion-endless` | accessibility | note | 1 |
| `accessibility.flash` | accessibility | note | 1 |
| `accessibility.image-motion` | accessibility | problem | 1 |
| `device.platform` | device | problem | 1 |
| `device.theme` | device | problem | 1 |
| `device.unknown` | device | problem | 1 |
| `device.height` | device | problem | 1 |
| `device.width` | device | problem | 1 |
| `device.size` | device | problem | 1 |
| `device.scroll` | device | problem | 1 |
| `device.picture-height` | device | note | 1 |
| `rounds.file` | rounds | problem | 1 |
| `rounds.key` | rounds | problem | 1 |
| `rounds.field` | rounds | problem | 1 |
| `rounds.answer` | rounds | problem | 1 |
| `rounds.limit` | rounds | note | 1 |
| `stories.missing` | stories | problem | 1 |
| `request.usage` | request | problem | 1 |
| `request.no-design` | request | problem | 1 |
| `request.path` | request | problem | 1 |
| `request.file` | request | problem | 1 |
| `request.settings` | request | problem | 1 |
| `request.value` | request | problem | 1 |
| `request.exists` | request | problem | 1 |
| `request.browser` | request | problem | 1 |
| `tool.failed` | tool | problem | 1 |

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

No command writes over a design, a design document, or a saved round. The one exception is `example`, which writes its own files in `<out-dir>/example/` again each time, so keep no edits there.

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
| `out_dir` | the output folder | `.prototype` |
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

