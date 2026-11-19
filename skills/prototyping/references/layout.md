# Layout: where, when, at every width, and in comfort

Read this before you start a design and before you draw a screen, and again when you review one. Each rule is one you can check by measuring or by reading the source: open the page with `open-prototype serve`, and read each box with `getBoundingClientRect()` in the browser's console, at the narrowest and the widest frame, or read the design's styles. A design is aligned, responsive, and comfortable by these rules, never by luck.

## Alignment

1. **Every element shares an edge with a neighbour.** It shares a start or an end edge, a centre line, or a baseline. Nothing stands on an edge of its own.
2. **A list's columns hold across its rows.** Each column starts at the same place in every row, within half a pixel. The columns belong to the list, not to each row's content, so a longer value in one row moves nothing in another. Where a narrow frame stacks a row, its stacked parts share one start edge.
3. **Each kind of value has its side.** Text columns align at their start. Numbers, amounts, and times align at their end. In a list, a status or a tag has a column of its own, never the end of a name.
4. **A row reads on one line.** The texts of a row share the first line's baseline. A control or an icon is centred on the first line of the text beside it.

## Spacing

5. **Every gap is a spacing token.** A gap, a margin, and a padding each read a token, never a raw length.
6. **What belongs together stands closer.** The gap inside a group is smaller than the gap between groups.
7. **No block touches the block above it.** A box with a border or a background has a gap above it, but the rows of one list, which a rule divides.

## Where

8. **The same thing stands in the same place on every screen.** The title starts at the same distance from the start edge on every screen. A back control, on the screens that have one, stands at one place, above the title: a screen with one is taller by its row, and nothing else moves. A screen with none keeps no empty row for it. The view's main action and a notice each stand at the same position from screen to screen.
9. **A view has one main action, where the reading ends.** It stands after a form's last field, or at the end of a page's header row.
10. **A destructive action stands apart from the main one.** Put it in its own region, such as a danger zone, or a confirming dialog of its own.
11. **A row's actions stand at the row's end,** in the same column in every row.
12. **A notice about what just happened stands above what it is about,** below the title.

## When

13. **A control shows only where the product would show it.** None exists to move a reviewer from one state to another: the page reaches every state on its own.
14. **A state keeps the layout of the state it replaces.** A loading skeleton has the shape of what it loads: the same cards, bars, and rows, at their places. An empty or an error state fills the same region. Nothing jumps from one state to the next.
15. **The reading order is the source's order.** The order on the screen, and the order of focus, follow the markup.

## Across widths (mobile first)

16. **Draw the narrowest frame first.** It is one column, in reading order. The styles outside every query are the narrow layout, and each wider layout is added by a `min-width` query, a container query, or a grid that fits its own tracks, such as `repeat(auto-fit, minmax(min(100%, 16rem), 1fr))`. No `max-width` query undoes a wide layout.
17. **Every width shows the same content.** A wider layout moves and regroups what a narrow one shows, and hides nothing it shows, nor the reverse. Navigation folded behind one control, as rule 19 says, is still there.
18. **Nothing scrolls sideways, and no text is cut.** At the narrowest frame, and with the text at 200% there, the page is no wider than the frame, and no box that clips its content (`overflow: hidden`) is narrower than what it holds. A long word or address breaks (`overflow-wrap: anywhere`); a field's own value may scroll inside the field.
19. **The title and the main action stand in the first screenful.** At the narrowest frame, 320 by 568 CSS px, the screen's title and its main action end above 568 px, at rest, before any scroll. Navigation that would take that room folds behind one control: the format's own disclosure, a toggle and the panel it opens, which the guide shows. From the width where it fits, the same panel stands open, laid out by the styles, so its links are written once.
20. **A breakpoint stands where the content needs it,** such as where a line grows too long to read or a row no longer fits, never at a device's name. Each is written once: one query per width, which holds every rule that changes there, on a named container such as `@container content (min-width: 34rem)`.

## Comfort

21. **A target is big enough for a finger.** On a phone's frame, which is 320 wide on the web, every target a finger presses is at least 44 by 44 CSS px, or the platform's own size where that is larger; on every frame it is at least 24 by 24. Two targets side by side have a gap between them.
22. **A task's action stays within a thumb's reach.** On a phone's frame, when the screen is a task one action commits, such as a form, that action never leaves the lower part of the screen: while the task is taller than the screen, it sticks to the screen's foot, above the system bar (`position: sticky`, its bottom at the system bar's inset that the guide's "Frames" part names), and a scroll padding at the root's end keeps a focused field clear of it; a shorter task ends with it. A list's or a page's action may stay in its header.
23. **Text reads without effort.** On a phone's frame, body text and a paragraph are at least 16 CSS px, and so is a field's text, since a smaller one makes iOS zoom the page on focus. A line of prose holds at most 75 characters, about `max-width: 60ch`, and a paragraph's column holds at least 45 wherever the frame has room for 45; a short text in a card or a cell may be narrower. The line height of body text is at least 1.4.
24. **A form is one column on a narrow frame,** each label above its field.

## Accessibility, from the first screen

The review checklist owns these checks; design for them from the first screen, not at the review: contrast (check 2), a name for every control and a label for every field (check 1), focus that shows and is never covered (checks 6 and 7), a keyboard order that follows the reading order (check 6, and rule 15 above), text that grows to 200% (check 4, and rule 18 above), and motion that stops (check 1). One more rule:

25. **Meaning is never carried by colour alone.** A status, an error, a required field, or the current item also says so in words, a mark, or a shape, so it reads in grey and in forced colours.
