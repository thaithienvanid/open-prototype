# open-prototype: product specification

This page says what the tool is for and why: who uses it, the jobs it does, the principles it keeps, its scope, what it leaves out, and what comes later. It is for a person who decides what the tool should do, and for anyone who changes it.

The [technical specification](tech-spec.md) says how the tool works. Each statement here links to the section there that makes it true. One fact has one owner: this page never says how, and the technical specification never says what or why.

This page is living. A change to what a person can do with the tool changes this page in the same commit, and the CHANGELOG says when.

## 1. Who it is for

### The problem

A team that builds a user interface needs one thing every role can point at before code exists. A picture is not enough, because it shows one state on one device. A coded prototype is too much, because it has its own bugs and its own stack. So a state nobody drew becomes a state the developer invents, and a comment such as "the button on the second screen" is one nobody finds again.

The tool answers with a design that is markup and example data only. It checks the design, shows every state of it in one page, keeps the review as files, and gives the developer the design as data ([section 1 of the technical specification](tech-spec.md#1-what-the-tool-is-for)).

### The people

| Person | What they do with the tool | What they need from it |
| --- | --- | --- |
| A designer, a person | writes the design, runs the checks, and answers comments | plain messages with a file and a line, and no build system ([output](tech-spec.md#output)) |
| A designer, an AI agent | does the same from a command line, with no browser by default | JSON it can parse, exit codes, and a skill that holds the order of work ([exit codes](tech-spec.md#exit-codes)) |
| A reviewer | opens the page, looks at every view, and comments | a page that opens from a file and counts what is left to see ([the viewer](tech-spec.md#7-the-viewer)) |
| A developer | builds the real interface from the agreed design | the screens, the components, the test ids, and the pictures to match ([the command line](tech-spec.md#10-the-command-line)) |

The rows run in the order each person first meets a design. An agent may review too. It writes a round file by hand and names itself in each comment ([the life of a comment](tech-spec.md#the-life-of-a-comment)). The skill has a second agent review first, for three rounds at most, and then gives the person the page.

### The jobs

| When | I want to | So that |
| --- | --- | --- |
| I start a product or a screen | begin from a starter that already passes the check | I draw screens at once, not plumbing ([every command](tech-spec.md#every-command)) |
| I draw a screen | name each state it can be in, with real copy from example data | nobody invents a state later ([screens and states](tech-spec.md#screens-and-states)) |
| I think the design is done | have the tool check it | a broken link, an unnamed control, a raw colour, or filler text never reaches a reviewer ([the checks](tech-spec.md#8-the-checks)) |
| I need pictures | list and take each view a change touches, with a fixed name | a review and a test use the same pictures ([the capture](tech-spec.md#the-capture)) |
| I review | see every state on each platform and theme, and know what I have not seen | my yes covers the whole design ([its state](tech-spec.md#its-state)) |
| I review on a phone, or in private | open the page from a server on my machine | a phone on my network can open it, and no other local page reads my comments ([the server](tech-spec.md#the-server)) |
| I disagree with something | pin a comment to the exact element | the designer finds it with no guessing ([the life of a comment](tech-spec.md#the-life-of-a-comment)) |
| I answer comments | name the comments each change answers | no comment is lost between rounds ([review rounds](tech-spec.md#9-review-rounds)) |
| I build the real interface | read the design as data, and check my stories against it | my components and test ids match it by name ([every command](tech-spec.md#every-command)) |

The rows run in the order of the work, from the first step to the last.

## 2. The principles

The principles run from the design's file, through the page, to the review and the tool's own words.

1. **The boundary rule.** A design holds only the designer's content. The tool reads it through one small set of names that start with `data-proto-`, and adds everything else when it builds. It never writes its own parts into a designer's file ([the boundary rule](tech-spec.md#2-the-boundary-rule)).

   The why: a design stays an ordinary HTML file that any editor and any person can read, with nothing of the tool's to maintain. The tool writes each page from the viewer as it stands, so every design gets every fix to the viewer, and an approved design is never rewritten ([where a page goes](tech-spec.md#where-a-page-goes)). Because every name of the tool's has one prefix, a wrong name is a finding, never a silent mistake ([how the code holds it](tech-spec.md#how-the-code-holds-it)).
2. **A design runs nothing.** A design holds no script, no event handler, no form that submits, and no load from the network. The viewer is the one program in a page ([the policy and the sandbox](tech-spec.md#the-policy-and-the-sandbox)).
3. **Nothing leaves the machine.** No command opens a connection to another machine, and only `serve` listens, when a person runs it ([the threat model](tech-spec.md#the-threat-model)).
4. **A person's files are never written over.** The tool keeps to the project, with the two exceptions [the threat model](tech-spec.md#the-threat-model) names. A round, a new design, and a design document are never written over, and `example` writes over no file of an output folder of yours ([each control](tech-spec.md#each-control-and-the-test-that-holds-it)).
5. **Nothing is cut in silence.** Past a limit the tool says so, and it keeps each comment whole or refuses the save ([the limits](tech-spec.md#the-limits)).
6. **A person decides.** Agents may review a design and answer its rounds, and only a person decides that it is done. Once every view is seen, the page says so, and the person tells their agent in their own words. The tool records no approval ([the life of a comment](tech-spec.md#the-life-of-a-comment)).
7. **Every finding names its next step.** A finding names its file, its line, what to do, and its rule's id. A script acts on the id, never on the words ([output](tech-spec.md#output)).
8. **The tool states its own facts.** The guide and the reference are written from the code, so no document has to copy them ([the guide and the reference](tech-spec.md#the-guide-and-the-reference)).

## 3. Scope

### What the tool covers

- Interactive prototypes of user interfaces: screens, flows, and every state, on each platform and theme ([the format](tech-spec.md#3-the-format)).
- One design format, version 1: every design is an HTML file that grows in place with flows and blocks ([the format](tech-spec.md#3-the-format)).
- A project's own fonts, a Google Font among them, kept as files in the project and carried in the page, so no font loads from the network ([what a built page holds](tech-spec.md#what-a-built-page-holds)).
- A command line, and one public entry for code, so a script or another tool can run each stage itself ([the public entry](tech-spec.md#the-public-entry)).
- A viewer that runs from a file, with no server and no network ([the page](tech-spec.md#6-the-page)).
- A local server, for a phone on the same network and for a review that must stay private ([the server](tech-spec.md#the-server)).
- Screenshots of each view, taken with headless Chrome or Chromium ([the capture](tech-spec.md#the-capture)).
- A check of Storybook's `index.json` against the design's components ([every command](tech-spec.md#every-command)).

The list runs from what a designer writes to what the built interface is held to.

### What the tool deliberately does not do

The list runs from what keeps a person safe, to what a review leaves to a person, to what the tool leaves to other tools.

- **It does not run a design.** A design holds no script and no load from the network ([the policy and the sandbox](tech-spec.md#the-policy-and-the-sandbox)).
- **It does not send anything.** No command opens a connection to another machine ([the threat model](tech-spec.md#the-threat-model)).
- **It does not write into a design.** Three commands write a file a project keeps: `new-design`, `new-design-md`, and `save-comments`. None writes over a file. A fourth, `shots --capture --out`, writes its pictures to the folder a person names, such as a round's, and replaces a picture of the same name there. Every other write goes to the output folder ([every command](tech-spec.md#every-command)).
- **It does not approve.** The page has no approve control and asks no approval question. A person decides in their own chat or review tool, never in the page ([the life of a comment](tech-spec.md#the-life-of-a-comment)).
- **It does not judge a design's look.** Its rules read what a design file shows with no browser: its language, each control's name, its headings, one main landmark, and motion that stops. It has no contrast, target-size, reflow, or focus check, and no accessibility scan ([what each family reads](tech-spec.md#what-each-family-reads)). Section 5 says what each would need. Where and when an element stands, and how a design is drawn mobile first, such as a list's columns holding across its rows, the title and the main action in a phone's first screenful, and targets a finger can press, are rules of the skill (`skills/prototyping/references/layout.md`) that a maker and a reviewer measure in a browser, and the shipped example keeps them ([what each file holds](tech-spec.md#what-each-file-holds)).
- **It does not compare a design with the built interface by itself.** It lists the screenshots to take and shows two pictures together. A person or an agent compares them ([its views table](tech-spec.md#its-views-table)).
- **It does not know a framework.** It reads Storybook's index and nothing else of a built interface ([every command](tech-spec.md#every-command)).
- **It does not make other kinds of design.** Brand artwork, slide decks, and video are not interfaces, and other tools make them well. The format, its rules, and its states are built for interfaces, and a broader format would blur what the checks can hold. A design can still be shown as a walkthrough later (section 5).
- **It does not migrate.** Format 1 is the first format, and a newer format is refused with the words "update the tool" ([the format's version](tech-spec.md#the-formats-version)).

## 4. What the first release does

Each paragraph says what you can do, in the order you meet it.

**Start.** You start a design from a starter, or the project's design document, `DESIGN.md`. `open-prototype project` first tells you what the project already holds. A starter in a project with its own `DESIGN.md` reads the document's tokens, and keeps its own only for the names the document lacks, so it passes the check whatever the document names. No start writes over a file ([every command](tech-spec.md#every-command)).

**Draw.** You write each screen as a `<section>`, and each state it can be in as a child of it. You declare the platforms and themes the product has. Every number, name, and date a person reads, and every row of a list, comes from one block of example data; the interface's own words, such as a button's label or a heading, may stand in the markup ([example data](tech-spec.md#example-data)). In a navigation, the tool marks the shown screen's link as the current page, and a link to a screen it stands under as the section you are in, so one style rule draws each ([slot: where the tool puts content](tech-spec.md#slot-where-the-tool-puts-content)).

**Compose.** Every design follows `flow -> screen -> block`: you put a reusable block in `blocks/` and use it by name, split a multi-flow design into `flows/`, fill a list from the example data, and read every colour from the tokens ([composition for a designer](tech-spec.md#4-composition-for-a-designer), [flows in separate files](tech-spec.md#flows-in-separate-files)).

**Check.** `open-prototype check` names each problem with its rule, its file, and its line, and says what to do. A note is advice, and only a problem makes the exit code 1. Past 200 findings it prints problems before notes and says how many of each it left out, so no problem hides behind notes ([how a finding is found](tech-spec.md#how-a-finding-is-found)). You turn off a rule your project does not want, except the rules that stop the page, which the reference marks, and the few that no setting reaches, which the settings refuse with the reason ([the checks](tech-spec.md#8-the-checks), [how a project turns a rule off](tech-spec.md#how-a-project-turns-a-rule-off)). The reference says in one line what each rule means, whether it stops the page, and the WCAG criterion each accessibility rule answers to, and lists apart the outcomes of a command, such as a refused request, with their exit codes ([the registry](tech-spec.md#the-registry)).

**Look.** `open-prototype build` writes one page that opens from a file. Prototype lets you click through the design in a device frame; a move to another screen closes a menu the design opened, as the product would. Board shows every screen as a row of its own states, and System shows the tokens and components. The Screens panel counts the views you have seen, and every view has its own link ([the viewer](tech-spec.md#7-the-viewer)).

**Capture.** `open-prototype shots` lists the views a change needs: every view of a design, or only the screens or the component that changed. With `--capture` it takes each one as a picture, named by its view, such as `start.ready.320.light.png`, so no two views share a name and Compare finds a screenshot of the built interface named the same way ([the capture](tech-spec.md#the-capture)).

**Review.** You pin a comment to an element, export the round, and save it beside the design with `open-prototype save-comments`. Whoever changes the design names the comments each change answers. The next build shows each earlier comment as Answered or Open, the newest round always whole, and opens in the round after the last one saved ([the life of a comment](tech-spec.md#the-life-of-a-comment), [the limits](tech-spec.md#the-limits)).

**Review in private, or on a phone.** `open-prototype serve` shows the page from this machine alone. With `--lan`, a phone on the same network opens it by an address with a secret token ([the server](tech-spec.md#the-server)).

**Build against it.** `open-prototype screens` and `open-prototype components` give the developer the design as data. `open-prototype stories` checks the built interface's stories against the design. Compare puts a screenshot of the built interface beside the frame ([every command](tech-spec.md#every-command), [its views table](tech-spec.md#its-views-table)).

**Work with an agent.** Every command but `serve` prints one JSON object with `--json`, and the exit code says what to do next. The skill in `skills/prototyping/` teaches an agent the order of work and the judgment the tool cannot hold ([output](tech-spec.md#output), [exit codes](tech-spec.md#exit-codes)).

**Where it runs.** The tool is tested on macOS, Linux and Windows. With Bun, one command installs it from GitHub; in Claude Code and OpenCode, the plugin does, and in Antigravity, Codex, and Muse Code, the plugin brings the skill; with no Bun, a release's single file does, on macOS, Linux, or Windows. It is not on npm, and has no other runtime dependency ([what it runs on](tech-spec.md#what-it-runs-on), [where it has run](tech-spec.md#where-it-has-run)).

## 5. Later

Each item was left out on purpose. Nothing here needs a part of the tool to be redone. The limits only a maintainer meets are in [section 15 of the technical specification](tech-spec.md#15-technical-limits).

### Work left out, and when to start it

| Item | Today | What it needs | Start it when |
| --- | --- | --- | --- |
| A list's item that opens its screen in a state of its own, such as an overdue loan in the state `overdue` | a go inside an item opens its screen in the state the go names, the same for every entry | a key of the entry that names the state, read the same way by the viewer and by `shots` | the first real design that needs it; both agents of the skill's cold run met this limit |
| A schema for the settings file | read strictly by code, with a message for each mistake | one schema file, and a test that holds the code's keys to it | the first mistake in one that the messages did not explain |
| A project's own device frames | one shipped table; the settings key `devices` is kept free for this | a `devices` key in the settings, merged in `loadProject`, and the citation rule decided for a project's frames | the first project that asks |
| Rules a project writes itself | the registry is closed | a way to load a rule; the shape of a rule already allows it | the first project that asks |
| Checks of contrast, colour vision, and target size, and an accessibility scan | none | new rule families that read a rendered page, so they need a browser, and a scanner as a development dependency | a scan of a real design finds what no rule names; the agents' scan by hand ([what agents checked by hand](tech-spec.md#what-agents-checked-by-hand)) found nothing in the design it read |
| A comparison with the built interface | Compare shows two pictures; a person compares | a picture difference, and a decision on what counts as different | the first project that builds from a prototype |
| A walkthrough of a flow | the viewer shows one view at a time, and a full-screen mode with no chrome | next and back through a flow's screens and states in order, full screen, with an optional note for each step | the first person who demos a prototype to a team or a client |
| A walkthrough rendered to video | none | an optional step that hands the walkthrough's pages to an installed HTML-to-video renderer, such as HyperFrames (emerging; Apache-2.0, as this tool is), never a runtime dependency. Not Remotion: its company licence would bind the tool's users | the walkthrough exists, and someone asks for a video of it |
| A Node build, published to npm, so npx runs the tool with no Bun | the tool runs on Bun, and uses Bun's own `Bun.YAML` for the design document, `Bun.which`, `Bun.spawnSync`, `Bun.sleep`, and `Bun.version`, and its bundler's file imports for the assets the binary carries | one JavaScript file that Bun's bundler builds for Node, with a vetted YAML parser bundled in, so it keeps no runtime dependency; built and tested in the release workflow, and published to npm, which reverses the decision to stay off npm for that one file | users report Bun as the reason they cannot use the tool |
| A reader for each story tool | Storybook's `index.json` only | one reader for each tool, behind `storiesOf` in `src/stories.ts` | the first project that uses another tool |
| Saving a round through the server | a person downloads the file and runs `save-comments` | a write route; today a request writes nothing, and that is a control ([safety](tech-spec.md#12-safety)) | downloading and running a command is the friction people report; rounds are shared through the repository until then ([decisions](#decisions)) |
| JSON from `serve` | `serve` prints lines and takes no `--json` | a reason: it runs until it is stopped, so it has no one result | a script needs one result from it |
| A theme switch for the viewer itself | the viewer follows the system's theme | a choice kept in storage, and both themes of the token test already pass | the first request |
| Attributes merged from the element that uses a block; slots inside a block | refused, so nothing is lost in silence | a merge rule for each attribute, written into the format | the first block that needs either |
| A raw length outside the tokens, such as `padding: 13px`, as a finding | a raw colour is `paint.raw-color`; a raw length is no finding | an allow list a project writes, since a length rule with none fights a stranger's project | a project asks, with its allow list |
| Tailwind classes in a design, through the project's own compiled CSS file | the design document's tokens already use Tailwind v4's names, so a design's styles read them with `var()` | the tool reads a local compiled stylesheet as it reads a tokens file, with its checks decided at that time | the first project that designs with Tailwind classes |
| Media queries for the design document's breakpoint groups | `typography.sm.headline-lg` is a plain path, named as any other | a rule for which frame takes which breakpoint | the first design that needs the document's breakpoints to switch by frame |
| Lint of the design document's prose and its sections | none: the format's own command, `npx @google/design.md lint DESIGN.md`, is the person's to run | nothing in the tool; it fetches a package, and the tool sends nothing | never, while the tool sends nothing |
| The design document's `@`-references to component files, resolved | none: the tool does not follow them | a reader of each file one names, under the path rule | the format makes them normative, or a design must draw from a sticker sheet (the decision on real components, below) |
| Themes beyond light and dark in the design document | `colors.light` and `colors.dark` only | the format to define modes | the format defines modes |
| A design's id that no other project shares | a page keeps its comments in the browser by a hash of the project folder's name and the design's path, so two projects whose folders share a name and whose designs share a path share their comments ([its state](tech-spec.md#its-state)) | a `name` key in the settings, hashed in place of the folder's name | the first report of two projects that share comments |
| A comment kept while it is typed | a reload loses a draft that was not saved | the draft kept in the browser's storage, as the round's comments are ([its state](tech-spec.md#its-state)) | the first reviewer loses one |
| An earlier comment's own link | Show opens an earlier comment's screen, state, and theme; the viewer reads a `link` when a page holds one, and the tool does not write it yet | the tool writes each earlier comment's `link` into the page | with the draft kept across a reload |
| A pass with a real screen reader | the browser tests read each control's role and name, and what is announced, from the browser, and press the viewer's keys; agents ran an accessibility scan of each view once ([what agents checked by hand](tech-spec.md#what-agents-checked-by-hand)); no one has listened | a person with VoiceOver or NVDA, or an automated screen-reader driver such as Guidepup run on a macOS CI runner (emerging: not tried here) | a user reports a screen-reader problem, or before the tool is offered as an accessibility aid |
| A name on focus for each icon button | each icon button names itself by a native title only | a tooltip that shows on focus, so a keyboard user sees the name too | with the pass with a real screen reader |

The rows run from what a user would notice first to what only the owner decides.

### Decisions

Each was an open question, and the owner decided it. The list runs from the format to the review.

- **Windows: a system the tool claims, held as macOS and Linux are.** The check workflow runs `bun run check` on `windows-latest` for every change, and a failure there blocks the change as it does on the other two, because the tool claims a system only where its full check passes. The plugin's command stays one POSIX `sh` script, which Claude Code on Windows runs through Git Bash, so no second script must be kept in step ([where it has run](tech-spec.md#where-it-has-run), [where the command comes from](tech-spec.md#where-the-command-comes-from)).
- **Real components: no.** A design stays drawn in plain HTML, which works with any framework, runs no script, and is quick to write. The real interface comes in only through Compare's screenshots and the check of component names against the story index, `open-prototype stories`.
- **Many reviewers: shared through the repository's files.** Each reviewer, a person or an agent, writes a round, and committing `rounds/` to Git shares it with its history. Live shared commenting in one viewer is a later hosted feature, kept as a business option and not built into the free tool.
- **A recorded approval: no.** A person's "done" lives where the team already decides, such as a pull request's approval. The tool records which comments each change answered, and never an approval.

## 6. How success is judged

The measures run from one design, to a release of the tool, to the tool's use.

**A design is done** when it passes the check with exit code 0, a reviewer has seen every view, each comment of the last round is answered, and a person approves it in their own words. The page shows each of these but the last ([exit codes](tech-spec.md#exit-codes), [the life of a comment](tech-spec.md#the-life-of-a-comment)).

**A release of the tool is ready** when:

- `bun run check` passes on macOS, Linux and Windows ([how to run them](tech-spec.md#how-to-run-them), [where it has run](tech-spec.md#where-it-has-run));
- every recorded case and the viewer's walk give their recorded results, and each control has had its revert proof ([the revert proofs](tech-spec.md#the-revert-proofs));
- a large design still checks and builds within each test's ceiling ([ceilings, not pins](tech-spec.md#ceilings-not-pins)).

**The tool earns its place** when, in use, a team stops inventing states during a build, a designer finds each comment's element with no guessing, and a reviewer's yes covers every view. No test measures these. The owner judges them from use, and a row of section 5 starts when its trigger shows a gap.
