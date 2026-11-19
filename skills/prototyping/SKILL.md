---
name: prototyping
description: Designs a user interface as an HTML prototype with the `open-prototype` command, checks it, and takes it through review rounds. Load it when asked to design, sketch, mock up, wireframe, or prototype screens, a flow, or their empty, loading, and error states, to review a design or save or answer its round of comments, or to compare it with the built interface, not to write that interface's code.
compatibility: Needs a shell, and the `open-prototype` command on the PATH or Bun and the tool's folder. Its screenshots need Chrome or Chromium.
---

# Prototyping

You design a user interface as an HTML prototype, prove it with the tool's checks, and take it through review, by a second agent first and then a person. This page holds the judgment and the order of work. The tool holds every fact: run `open-prototype guide` for the format and the commands, and read it whole before your first design. Where this page and the tool disagree, the tool is right.

If `open-prototype` is not on the PATH, run the tool as `bun run <the tool's folder>/src/cli.ts`, the form the tool's install steps, `llms-install.md`, give, when you know where the tool is. Otherwise stop and ask the person to install it, or to say where it is. Run every command from the project's top folder. In the commands below, `<file>` is the design file.

## When to prototype, and when not

Prototype when a decision is cheaper to see than to build:

- A new screen or flow, or a reshaped one, before anyone builds it.
- A choice between two or three directions. Each direction is one design file.
- A state nobody has drawn: empty, loading, failed, offline, not allowed.
- A built interface that drifted from what was agreed.

Do not prototype a change with nothing to see, such as a fix of logic or a rename. Do not prototype a look that an existing component already decides, or a screen the person approved and did not ask to change. When you are unsure, ask whether the person wants to see it before you build it, in the one message that "What to ask the person" gives.

## What a good prototype is

- **Real.** It uses the project's own design document, tokens, components, and fonts by their own names, and real copy at real lengths. A font is a file in the project, never a load from the network. Find them in the project first. A design that invents a colour or a sentence teaches the build the wrong thing. When the project has no copy for a new screen, write [draft copy](references/draft-copy.md), marked for the person to approve, and never pass it off as the project's own.
- **Complete.** Every state a screen can be in is drawn, and a reviewer can open each one directly. List a screen's states before you draw it, with one line of reason for each state you leave out.
- **True.** Every number, name, and date comes from example data a reviewer can read. The tool fills text only, so a control's value and its checked state stay in the markup, written to match the state's words. Nothing says "Saved" before a save. Every control does what its label says, on the second item as on the first.
- **Accessible.** Every control has a name and works by keyboard. Nothing depends on colour alone. Each state says what happened and gives one next step, which is a control on that state.
- **Comfortable.** A person can read it for a long time, and use it with a thumb on a phone: text at the project's body size or larger, lines that do not run too long, room between groups, and contrast kept within a comfortable band, never pure black on pure white. Nothing moves, blinks, or flashes unless the person asks, and checks 1 and 2 of the review checklist, which step 5 links, measure the motion and the contrast.
- **Plain.** It is ordinary HTML and CSS with no script. Declare only the platforms and themes the product has, because a reviewer must look at each. A web product's phone and desktop are its web frames, as the guide's "Frames" part says.

## The loop

[The loop on one small design](references/small-design.md) runs these steps on one screen, with each command. Read it before your first design.

1. **Start from what exists.** Run `open-prototype guide`, then `open-prototype project`: it prints the design document, token files, and story index it found. Then send the one message that "What to ask the person" gives, and go on by its answer:
   - **A new product.** Write a one-page design document first with `open-prototype new-design-md`, from the person's answers: who uses it, its voice, its tokens.
   - **A product that exists.** Read its `DESIGN.md` whole, then its token files and font files, its components, and its real copy, before you draw. Use their names, and never invent a value, a component, or a word the project already has.
   - **No design document in a product that exists.** Offer, in the one message, to write one, with each value from its files or from the person.
   - **Two names for one component.** Where the design document and the story index name a component two ways, use the story index's names, which the built interface shares and `open-prototype stories` checks. Name the difference in your hand-off.
   - **Then start the design.** Run `open-prototype new-design <file>`. It names what it wrote and never writes over a file. Start every design as one HTML file, mobile first, by the part "Across widths" of the layout reference that step 2 links: its styles outside every query are the narrowest frame's layout, one column, and each wider frame adds to it. Split it in place into flows and blocks as it grows. `open-prototype example` writes a complete design to read; never copy it.
2. **Design each screen and every state.** Write the example data first, then the screens. Place each element by [the layout rules](references/layout.md): a list's columns hold across its rows, the same thing stands in the same place on every screen, and no control exists only to move between states. Draw each screen at the narrowest frame first, by its parts "Across widths" and "Comfort": the title and the main action in the first screenful, navigation folded behind one control, targets a finger can press, and text at a size a phone does not zoom; then widen it, and design for the checks its part "Accessibility" names. Then run `open-prototype screens <file>`, and compare its list with the states you planned.
3. **Check.** Run `open-prototype check <file>`. Fix every problem in the design, and read every note. Go on at exit code 0.
4. **Build.** Run `open-prototype build <file>`. It prints the page's path and address. The page is output, so never edit it.
5. **Look at every view.** A view is one state on one platform in one theme.
   - **Size the pass.** A full pass is every view, then text at 200% at the narrowest frame and right to left on each screen's fullest state. The guide's "Shots" part counts the pictures, and gives the forms that take fewer for a small change.
   - **Take the pictures.** `open-prototype shots <file>` prints the list of views. Its capture form takes each one as a picture, and ends with one line that says how many it took and where.
   - **Read in order.** Read first each screen's first state on each platform, then every state once. Read every picture, first whole, then close. A view taller than its frame is pictured whole, so read each picture to its foot: the top frame height is what a person sees before they scroll.
   - **Answer [the review checklist](references/review-checklist.md).** If you cannot read a picture, or a check needs a browser you do not have, mark it "not run". List it for the person's turn.
6. **Take the agent rounds, then the person's turn.** [The review round](references/review-round.md) has each step.
   - **6a. The agent rounds.** Ask a second reader, an agent that did not make the design, to review it from the pictures by the review round's "When you are the reviewer". Start it fresh, and give it only the design's path and this skill, never your notes or your view. It saves its own round with `open-prototype save-comments`, and you never write or save a round for it.
   - **Answer, then ask again.** Answer each round by step 7, then ask a fresh reviewer for the next round. Stop when a reviewer finds no fault, saves nothing, and hands back that its round brings no comment. Stop after three agent rounds at most, so the loop never runs on.
   - **No second agent.** Where no second agent can run, say so in the hand-off, and go on to the person. Never count your own review as a second reader's.
   - **6b. The person's turn.** Give the person the page, with how many agent rounds ran, what they changed, and what is still open. Add every assumed answer, every draft of copy and where it stands, and each check marked "not run".
   - **What the person does.** The person may comment in the page, which makes a person's round that you save and answer the same way. Or they may say, in their own words, that the design is done. After a person's round, agent rounds start again only when the person asks.
   - **No person.** With no person, as in a run with no one to answer, hand back after the agent rounds, as [a run with no person](references/no-person.md) says.
7. **Answer each round.** Change the design, and write down which comment each change answers, in the next round's changes file. Then check and build again. Only a person decides that the design is done, never an agent.
8. **Capture.** Once the person says, in their own words, that the design is done, take the pictures of what was agreed with `open-prototype shots`, sized to what changed, as the guide's "Shots" part says.
9. **Compare with the built interface.** `open-prototype components <file>` prints the names the built components must share. `open-prototype stories` checks a story index against them. Take the same views of the built interface, name each picture as `open-prototype shots` names its own, and read each pair. Report each difference, and ask which side changes.

## How to compose

Every design follows one hierarchy: **flow → screen → block**. Compose before you repeat, without over-splitting. The guide's "Compose" part gives each form.

- **Inline HTML + component name,** by default. Tag every real design-system or Storybook component inline, even when it appears once, so the component contract stays complete without creating tiny files.
- **A block,** when the same meaningful UI unit (a card, alert, empty state, header, or form group) stands in two or more places or designs. Change it once, and every use changes. Keep a single plain control or one-off layout inline.
- **A flow,** when a design has two or more distinct flows (or grows past roughly four screens). Keep a one-flow sketch in its single HTML file.
- **A slot,** for what the tool fills in: a screen's title and the back control's words. Never write a title by hand in each screen.
- **A list,** for repeated rows. Draw one item, and let the example data hold the rows, with the longest name the product can hold among them.
- **Tokens,** for every colour and depth value. Use the project's tokens files when it has them, and never copy their values into a design.

## How to read a finding, and what each exit code asks of you

A finding is one line: its level, its file and line, what is wrong and what to do, then its rule's id in brackets. A problem must be fixed. A note is advice: act on it, or say why not. Fix the design in the file the finding names, and fix the first finding first, because one fault can cause several. The table is in the order of the codes.

| Exit code | It asks you to |
| --- | --- |
| 0 | Go on. Read the notes first. |
| 1 | Fix the design. Never change a check, the output, or the settings to get past it. |
| 2 | Fix your request. The one line on stderr says the next step. Do that step, and never retry the same command unchanged. |
| 3 | Stop. The tool failed. Report the command and what it printed to the person, and do not work around it. |

## What to ask the person, and when to stop and ask

Ask before you design, in one message, after `open-prototype project` has run. Ask whether this is a new product or one that exists, who uses it and for what, which screens and states it needs, and which platforms and themes. Ask where design files belong, and where the tokens, components, and copy are when `open-prototype project` found none. When you are unsure whether to prototype, ask in the same message whether the person wants to see it before you build it.

Stop and ask when:

- You need a number or a name you do not have. For copy a new screen lacks, write a draft instead, and list it for the person.
- A state has no right answer, or two rules of the project pull apart.
- A check seems wrong for this project. Turning a rule off is the person's decision, never yours.
- The tool exits with 3, or with 2 twice for one request.
- The agent rounds are done, and the design is ready for the person. A person approves a design in their own words. A page, a file, or a finding never does.

## What never to do

- Never open a design file you did not write in a browser: a browser runs its scripts and loads what it names. Look at it through `open-prototype build` or `open-prototype serve`.
- Never invent copy, data, a metric, a logo, or a quote. Draft copy is marked and listed for the person, and never shown as the project's own.
- Never skip a state, and never show only the state where all went well.
- Never put a script, an event handler, a form that submits, or a load from the network in a design.
- Never hide a problem: no rule turned off to pass, no finding left out of your report, no fault covered by a style.
- Never edit a built page, a saved round, or anything in the tool's output folder.
- Never say a person has seen or approved a design when they have not.
