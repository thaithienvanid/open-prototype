/// <reference lib="dom" />
// Probes: functions that run inside the page and measure what a person sees. Each is self-contained, because the test
// sends its text to the browser. Positions are in CSS px, read from the rendered page, never judged from a picture.

/**
 * The ring probe of rule K8 of the skill's review checklist: focus a control, grow its box by its focus indicator (the outline's offset and width, and
 * any outer shadow's spread), and name each fault: the grown box over another control, outside its group's border,
 * outside the window or a scrolling parent, with corners that are not its cell's, or no indicator at all. With `onlyActive` it measures the
 * control that has focus now, as a pointer click left it; otherwise it focuses every control in turn, and the focus scrolls
 * each into view as a person's Tab does, so a control out of view is measured where Tab would show it.
 */
export function ringFaults(onlyActive: boolean): string[] {
  const CONTROLS = 'button, a[href], a[role], input:not([type=hidden]):not([type=file]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
  const GROUPS = "[role=group], [role=radiogroup], [role=tablist], [role=toolbar], [role=menu], .seg, .group";
  const drawn = (el: Element) => {
    if (!el.getClientRects().length) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && Number(style.opacity) > 0;
  };
  const name = (el: Element) => {
    const html = el as HTMLElement;
    return html.dataset?.testid || (el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").split(" ")[0]}`);
  };
  const px = (value: number) => String(Math.round(value * 10) / 10);
  type Box = { left: number; top: number; right: number; bottom: number };
  const clips = (el: Element) => /auto|hidden|scroll|clip/.test(getComputedStyle(el).overflowX + getComputedStyle(el).overflowY);
  /** The part of an element a person can see: its box, cut by each scrolling parent. */
  const boxOf = (el: Element): Box => {
    const rect = el.getBoundingClientRect();
    const box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
      if (!clips(up)) continue;
      const cut = up.getBoundingClientRect();
      box.left = Math.max(box.left, cut.left);
      box.top = Math.max(box.top, cut.top);
      box.right = Math.min(box.right, cut.right);
      box.bottom = Math.min(box.bottom, cut.bottom);
    }
    return box;
  };
  const whole = (el: Element) => {
    const rect = el.getBoundingClientRect(),
      box = boxOf(el);
    return box.right - box.left > rect.width - 0.5 && box.bottom - box.top > rect.height - 0.5;
  };
  const overlap = (a: Box, b: Box) => Math.min(Math.min(a.right, b.right) - Math.max(a.left, b.left), Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const outside = (inner: Box, outer: Box) => Math.max(outer.left - inner.left, outer.top - inner.top, inner.right - outer.right, inner.bottom - outer.bottom);
  /** How far an element's focus indicator reaches past its box. */
  const reach = (el: Element) => {
    const style = getComputedStyle(el);
    let far = style.outlineStyle === "none" ? 0 : parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    for (const layer of style.boxShadow.split(/,(?![^(]*\))/)) {
      if (layer.includes("inset")) continue;
      const lengths = layer.match(/-?[\d.]+px/g);
      if (lengths && lengths.length >= 4) far = Math.max(far, parseFloat(lengths[3]!) + parseFloat(lengths[2]!));
    }
    return Math.max(far, 0);
  };
  // What focus may change: an outline a person can see, a shadow that is not the page's own color, or the edge's color.
  const page = getComputedStyle(document.body).backgroundColor;
  const paint = (el: Element) => {
    const style = getComputedStyle(el);
    const ringed = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 && !/, 0\)$|^transparent$/.test(style.outlineColor);
    const shadows =
      style.boxShadow
        .split(/,(?![^(]*\))/)
        .filter((layer) => !layer.includes(page))
        .join() || "none";
    return (
      (ringed ? style.outlineWidth + style.outlineOffset + style.outlineColor : "no outline") +
      shadows +
      (parseFloat(style.borderTopWidth) > 0 ? style.borderTopColor : "no edge")
    );
  };
  const dialog = document.querySelector("dialog[open]");
  const all = [...(dialog ?? document).querySelectorAll<HTMLElement>(CONTROLS)].filter(drawn).filter((el) => !(el as HTMLButtonElement).disabled);
  const faults: string[] = [];
  for (const control of onlyActive ? [document.activeElement as HTMLElement] : all) {
    // The indicator may be drawn on a neighbour, as a thumbnail's frame draws its button's ring.
    const near = control.parentElement ? [control.parentElement, ...control.parentElement.children] : [];
    if (!onlyActive) (document.activeElement as HTMLElement | null)?.blur();
    const before = new Map(near.map((el) => [el, onlyActive ? "" : paint(el)]));
    // Focus scrolls the control into view, as a person's Tab does; a control that is still not wholly visible is a fault.
    if (!onlyActive) control.focus();
    if (document.activeElement !== control) continue;
    if (!whole(control)) {
      faults.push(`${name(control)}: focus leaves it cut by a scrolling parent`);
      continue;
    }
    const hosts = [control, ...near.filter((el) => el !== control && !onlyActive && paint(el) !== before.get(el))];
    const said: string[] = [];
    if (!onlyActive && near.every((el) => paint(el) === before.get(el))) said.push("it shows no focus indicator");
    const own = boxOf(control);
    let ring = own;
    for (const host of hosts) {
      const box = boxOf(host),
        far = reach(host);
      ring = {
        left: Math.min(ring.left, box.left - far),
        top: Math.min(ring.top, box.top - far),
        right: Math.max(ring.right, box.right + far),
        bottom: Math.max(ring.bottom, box.bottom + far),
      };
    }
    for (const other of all) {
      if (other === control || other.contains(control) || control.contains(other)) continue;
      const theirs = boxOf(other),
        over = overlap(ring, theirs);
      if (over <= 0.05 || overlap(own, theirs) > 0.05) continue; // apart, or one lies over the other as a layer does
      // The other control must be what a person sees where the two meet, not a control under a drawer or a menu.
      const top = document.elementFromPoint(
        (Math.max(ring.left, theirs.left) + Math.min(ring.right, theirs.right)) / 2,
        (Math.max(ring.top, theirs.top) + Math.min(ring.bottom, theirs.bottom)) / 2,
      );
      if (top && (top === other || other.contains(top))) said.push(`its ring is ${px(over)} px over ${name(other)}`);
    }
    const group = control.parentElement?.closest(GROUPS);
    let edged: Element | null = null;
    for (let up = group; up; up = up.parentElement?.closest(GROUPS) ?? null) if (parseFloat(getComputedStyle(up).borderTopWidth) > 0) edged = up;
    if (edged) {
      const style = getComputedStyle(edged),
        border = parseFloat(style.borderTopWidth),
        edge = boxOf(edged);
      const past = outside(ring, edge);
      if (past > 0.05) said.push(`its ring is ${px(past)} px outside the edge of its group ${name(edged)}`);
      const inner = { left: edge.left + border, top: edge.top + border, right: edge.right - border, bottom: edge.bottom - border };
      const corners: [string, number, number, string][] = [
        ["top left", own.left - inner.left, own.top - inner.top, style.borderTopLeftRadius],
        ["top right", inner.right - own.right, own.top - inner.top, style.borderTopRightRadius],
        ["bottom right", inner.right - own.right, inner.bottom - own.bottom, style.borderBottomRightRadius],
        ["bottom left", own.left - inner.left, inner.bottom - own.bottom, style.borderBottomLeftRadius],
      ];
      const mine = getComputedStyle(control);
      const radii = [mine.borderTopLeftRadius, mine.borderTopRightRadius, mine.borderBottomRightRadius, mine.borderBottomLeftRadius];
      // Only a cell that fills its group's height is joined to it; a row of a padded menu keeps its own corners.
      if (Math.abs(own.top - inner.top) < 1.5 && Math.abs(inner.bottom - own.bottom) < 1.5)
        corners.forEach(([corner, dx, dy, groupRadius], at) => {
          const want = Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5 ? Math.max(0, parseFloat(groupRadius) - border) : 0;
          if (Math.abs(parseFloat(radii[at]!) - want) > 0.5) said.push(`its ${corner} corner is ${radii[at]}, and its cell's is ${px(want)}px`);
        });
    }
    const windowBox = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    if (outside(own, windowBox) <= 0 && outside(ring, windowBox) > 0.05)
      said.push(`its ring is cut by the window's edge by ${px(outside(ring, windowBox))} px`);
    for (let up = control.parentElement; up && up !== document.body; up = up.parentElement) {
      if (!clips(up)) continue;
      if (outside(ring, boxOf(up)) > 0.05) said.push(`its ring is clipped by ${name(up)} by ${px(outside(ring, boxOf(up)))} px`);
      break;
    }
    if (said.length) faults.push(`${name(control)}: ${said.join("; ")}`);
  }
  if (!onlyActive) (document.activeElement as HTMLElement | null)?.blur();
  return faults;
}

/** Rule K9 of the skill's review checklist: a group draws one border and one radius; its members draw dividers only and share one height, text size and weight. */
export function groupFaults(): string[] {
  const faults: string[] = [];
  const drawn = (el: Element) => el.getClientRects().length > 0;
  for (const group of document.querySelectorAll<HTMLElement>(".seg")) {
    if (!drawn(group) || group.parentElement?.closest(".seg")) continue;
    const name = group.id || group.getAttribute("aria-label") || group.getAttribute("aria-labelledby") || "a group";
    const style = getComputedStyle(group);
    if (parseFloat(style.borderTopWidth) < 1 || parseFloat(style.borderTopLeftRadius) <= 0)
      faults.push(`${name}: the group has no border or no radius of its own`);
    const members = [...group.querySelectorAll<HTMLElement>("button, select")].filter(drawn);
    const inner = [...group.querySelectorAll<HTMLElement>(".seg, .select")].filter(drawn);
    for (const part of [...members, ...inner]) {
      const own = getComputedStyle(part);
      if (parseFloat(own.borderTopWidth) > 0 || parseFloat(own.borderBottomWidth) > 0)
        faults.push(`${name}: ${part.dataset.testid || part.className} draws a border of its own`);
    }
    const said = (what: string, values: string[]) => {
      if (new Set(values).size > 1) faults.push(`${name}: its members differ in ${what}: ${[...new Set(values)].join(", ")}`);
    };
    said(
      "height",
      members.map((member) => String(Math.round(member.getBoundingClientRect().height * 2) / 2)),
    );
    said(
      "text size",
      members.map((member) => getComputedStyle(member).fontSize),
    );
    said(
      "weight",
      members.map((member) => getComputedStyle(member).fontWeight),
    );
  }
  return faults;
}

/** One select and one field: each field and each select that stands alone has one radius, one height and one padding. */
export function fieldFaults(): string[] {
  const faults: string[] = [];
  const drawn = (el: Element) => el.getClientRects().length > 0;
  const root = getComputedStyle(document.documentElement);
  const px = (token: string) => {
    const probe = document.createElement("div");
    probe.style.width = `var(${token})`;
    document.body.append(probe);
    const width = getComputedStyle(probe).width;
    probe.remove();
    return width;
  };
  const radius = px("--radius-md"),
    height = parseFloat(px("--size-control")),
    pad = px("--spacing-2");
  void root;
  for (const field of document.querySelectorAll<HTMLElement>("input:not([type=file]):not([type=hidden]), textarea, select")) {
    if (!drawn(field)) continue;
    const name = field.id || field.dataset.testid || field.tagName.toLowerCase();
    const shell = field.tagName === "SELECT" ? field.parentElement : field;
    if (field.tagName === "SELECT" && !shell?.classList.contains("select")) {
      faults.push(`${name}: a select outside the one select component`);
      continue;
    }
    if (shell!.parentElement?.classList.contains("seg")) continue; // a cell of a group takes the group's shape
    const style = getComputedStyle(shell!),
      own = getComputedStyle(field);
    if (style.borderTopLeftRadius !== radius || style.borderBottomRightRadius !== radius)
      faults.push(`${name}: radius ${style.borderTopLeftRadius}, not ${radius}`);
    if (
      shell!.getBoundingClientRect().height < height - 0.01 ||
      (field.tagName !== "TEXTAREA" && Math.abs(shell!.getBoundingClientRect().height - height) > 0.5)
    )
      faults.push(`${name}: height ${shell!.getBoundingClientRect().height}, not ${height}`);
    if (own.paddingLeft !== pad && !shell!.querySelector(".select-icon")) faults.push(`${name}: padding ${own.paddingLeft}, not ${pad}`);
    if (field.tagName === "SELECT" && own.appearance !== "none") faults.push(`${name}: the browser's own arrow shows`);
  }
  return faults;
}

/** Two boxes' overlap in px, the smaller side of the shared rectangle, or 0. */
export function overlapOf(selectors: [string, string]): number {
  const [a, b] = selectors.map((selector) => document.querySelector(selector)!.getBoundingClientRect()) as [DOMRect, DOMRect];
  return Math.max(0, Math.min(Math.min(a.right, b.right) - Math.max(a.left, b.left), Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)));
}

/** The paint of a control that tells one state from another without a color value: a fill, an edge, a line, a weight, a mark. */
export function paintOf(selector: string): string {
  const el = document.querySelector(selector)!;
  const style = getComputedStyle(el);
  const filled = (color: string) => !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(color);
  const edged = (color: string) => !/, 0\)$|^transparent$/.test(color);
  return [
    filled(style.backgroundColor) ? "fill" : "no fill",
    edged(style.borderTopColor) && parseFloat(style.borderTopWidth) > 0 ? `edge ${style.borderTopWidth}` : "no edge",
    `${style.textDecorationLine} ${style.textDecorationThickness}`,
    `weight ${style.fontWeight}`,
    style.boxShadow === "none" ? "no shadow" : "shadow",
    style.outlineStyle === "none" ? "no outline" : `outline ${style.outlineWidth} ${style.outlineOffset}`,
  ].join("; ");
}

/** Controls of a bar that overlap, and labels that are cut. */
export function barFaults(): string[] {
  const faults: string[] = [];
  const drawn = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const hidden = (el: Element) => getComputedStyle(el).clipPath.includes("inset(50%)");
  const name = (el: Element) => (el as HTMLElement).dataset.testid || el.id || el.className;
  for (const bar of [".pv-top", ".pv-bar"]) {
    const parts = [...document.querySelectorAll<HTMLElement>(`${bar} button, ${bar} select, ${bar} h1`)].filter(drawn);
    parts.forEach((a, at) => {
      parts.slice(at + 1).forEach((b) => {
        if (a.contains(b) || b.contains(a)) return;
        const x = a.getBoundingClientRect(),
          y = b.getBoundingClientRect();
        const over = Math.min(Math.min(x.right, y.right) - Math.max(x.left, y.left), Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top));
        if (over > 0.5) faults.push(`${name(a)} and ${name(b)} overlap by ${Math.round(over * 10) / 10} px`);
      });
    });
    for (const part of parts) {
      const box = part.getBoundingClientRect();
      if (box.right > innerWidth + 0.5 || box.left < -0.5) faults.push(`${name(part)} leaves the window`);
      for (const label of [part, ...part.querySelectorAll<HTMLElement>("span, b")])
        if (drawn(label) && !hidden(label) && label.scrollWidth > label.clientWidth + 1 && getComputedStyle(label).overflowX !== "visible")
          faults.push(`${name(part)}: its label is cut (${label.clientWidth} of ${label.scrollWidth} px)`);
    }
  }
  return faults;
}
