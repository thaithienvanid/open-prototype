# The review checklist: eleven checks

Run these eleven checks on a design before you say it is ready, and on a built interface before you say it matches. They stand alone: you need no other document.

## How to answer

- Answer each check yes or no, for each screen and state it applies to, in each theme the design declares.
- A "no" is a finding. Give its proof: the check, the screen, the state, the theme, the width, and the measured value or the line of the source.
- A check you could not run is a "no", marked "not run", with the reason. Never count it as a pass. In a round, a reviewer lists it in the hand-back, never as a comment.
- A position is measured, never judged from a picture. To measure, run `open-prototype serve`, open the address it prints in a browser, and read each box with `getBoundingClientRect()` in the browser's console. If the session has no browser to measure in, mark that check "not run".
- Report three kinds of point: **Fix**, for a failed check; **Keep**, for a pass that a later change could lose; **Quick win**, for a small improvement nobody asked for. Give no score. The checklist passes when the Fix list is empty. Only a person decides that a design is done.
- Judge a prototype as the product it stands for.

## The eleven checks

Run them in this order. The first ones are cheap and need no browser.

| No. | Check | Yes means | How, with the tool alone |
| --- | --- | --- | --- |
| 1 | Static checks | The design's own checks pass: every control has a name, every image an alternative, every colour and depth value comes from a token, no filler text is left, and nothing plays by itself or flashes more than three times a second. | `open-prototype check` exits with code 0, and you have read every note. |
| 2 | Contrast | Every pair of colours the screens draw meets 4.5:1 for text, and 3:1 for an edge, an icon, a focus indicator, or a fill, in each theme. Every text is a solid colour at full opacity, disabled text too. Two colours that tell things apart keep 3:1 between them. | Compute each ratio from the tokens' values: `open-prototype project` prints each value of the design document as the page draws it, or read them from the design's own tokens block. List the pairs, so a reader sees none was left out. |
| 3 | Scan | An automated accessibility scan of each state, in each theme, reports nothing, with no rule switched off and no state skipped. | Run the project's scanner on the built page if it has one. With none, "not run". |
| 4 | Narrow and large | At 320 CSS px wide, and with the text at 200%, no state scrolls sideways, and no text is cut without an ellipsis. | Read the narrow pictures and the 200% pictures that `open-prototype shots` lists: it takes 200% at the narrowest frame, so one picture holds both. |
| 5 | Targets and layers | Every target is at least 24 by 24 CSS px, or the platform's own size. Every menu, popover, and toast opens inside the window, and covers neither what it reports on nor the control that opened it. | Read each control's size from the styles and tokens. Read each layer in its picture. |
| 6 | Keyboard | Each flow completes by keyboard alone, with no trap. The focused control is never covered or clipped, and its focus ring covers no neighbour (rule K8 below). | Read the source: every step of the flow is a real control, in the order the eye reads. Read each focus style. |
| 7 | States of a control | Rest, hover, focus, selected, and disabled never look alike. Two states differ by more than a colour value: a width, an offset, a new fill, a weight, or a mark. A disabled control looks disabled by a solid colour, never by opacity. | Read each state's rule in the styles, for each variant, in each theme. |
| 8 | Position | Each icon sits within 0.5 px of its control's centre. Opposite paddings are equal. The items of a row share an edge, a centre line, or a baseline. | Measure in a browser, and write each offset as a number. With no browser, "not run". |
| 9 | Forced colours | With forced colours on, every layer and control keeps an edge, and every chosen mark stays visible. Nothing a person needs is lost. | Read the styles: an edge is a real border or outline, and no state is told by a background alone. |
| 10 | Truth and copy | Every number, name, and date traces to the example data. Each control does what its label says, on the second and the last item as on the first. Each state says what happened and gives one next step, which is a control on that state. No state claims an outcome that has not happened. A count matches the rows drawn. | Read each state's copy aloud after the screen's title. Open the example data beside it. |
| 11 | Every task finishes | From every state, a person can finish the task the screen is for, such as saving the choice they make in the empty state. Each control a person can change has a way to commit it on that state, and the state it leads to shows the outcome. | Start from each state in turn, change what it lets you change, and follow its controls to the outcome. A state with a change and no way to commit it is a "no". |

Then read every picture, first at the size a person sees it, then close. A close-up that looks right can still be too weak to find on the screen.

## A control in a group

Checks 6 and 7 measure one control alone. These four rules measure it where it sits: in a segmented control, a field joined to buttons, a tab row, a list of rows, or a menu. Most faults that a check of one control passes are here.

| Rule | It says | Level |
| --- | --- | --- |
| K8 | A member of a group shows focus, hover, and selection inside its own cell, the same way as its siblings. No indicator crosses a sibling, the group's edge, the window's edge, or a scrolling parent, and its corners follow its cell's corners. Where neighbours sit closer than the ring reaches, the ring is drawn inside. Check it after a key press and after a pointer click, at the narrowest and the widest width. | must |
| K9 | A group draws one border and one radius. Its members draw dividers only, their inner corners are square, and they share one height, one text size, and one weight. | must |
| K10 | A control that the browser marks as focused after a pointer click, such as a select or a text field, shows a quiet field look, never the keyboard ring. | should |
| K11 | Two states at once still read as two: pressed with focus, pressed with hover, and disabled inside a group. | should |

The rows are in the order of the rules. A "must" that fails is a Fix. A "should" may be left when the project's design document says what it does instead, and why.

## Size the review to the change

| What changed | Run |
| --- | --- |
| A new or reshaped screen or flow | All eleven checks on those screens: every state, narrow and wide, in each theme; then 200% text and right to left on each screen's fullest state. |
| A component's look or its states | Each screen it shows on, once; then checks 2, 6, and 7 on each variant in each theme; then the narrowest width and 200% text. |
| Anything smaller, such as copy | Checks 1, 10, and 11 on the changed screens and states, in each theme. |

The rows run from the largest change to the smallest. Some things never scale down: real copy, each declared theme for what changed, and every picture read.
