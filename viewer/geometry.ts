// Sizes and positions the viewer works out. Pure: each function reads only its arguments.

type Box = { x: number; y: number; width: number; height: number };
type Edges = { left: number; top: number; right: number; bottom: number };

export type Fit = {
  zoom: "fit" | "actual";
  fill: boolean;
  phone: boolean;
  stacked: boolean;
  present: boolean;
  room: { w: number; h: number };
  placeholder: number;
  width: number;
  frameHeight: number;
};

/**
 * The scale Fit shows a frame at. Every frame has a fixed height, so Fit shows it whole. On a phone-width window (stacked)
 * a whole frame would be too small to read, so it fits by its width there. Full screen, a web page is the window itself.
 */
export function fitScale(fit: Fit): number {
  const whole = fit.phone ? !fit.stacked || fit.present : !fit.stacked && !fit.present;
  const byHeight = whole ? Math.max(0.25, fit.room.h / fit.frameHeight) : 1;
  return fit.zoom === "fit" && !fit.fill ? Math.min(1, (fit.room.w - fit.placeholder) / fit.width, byHeight) : 1;
}

type Size = { w: number; h: number };
/** Compare's picture and the frame, in the device's px, and the picture's caption and its gap above, in the window's px. */
export type Beside = { room: Size; shell: Size; picture: Size; gap: number; caption: number };

/**
 * The scale of a frame with Compare's picture: beside the frame, both whole, or under it when the pair is too wide for the
 * artboard and that shows both larger, as a wide frame beside its picture would be half the artboard's width. Under it, the frame shows whole and the artboard
 * scrolls to the picture, as on a phone-width window. The caption keeps its size at any scale, so it is room taken, never
 * scaled. The size is the device's on screen, the caption included, so the caption under the device clears it.
 */
export function besideFit(fit: Beside): { scale: number; stack: boolean; width: number; height: number } {
  const { room, shell, picture, gap, caption } = fit;
  const byHeight = (value: number) => Math.max(0.25, value);
  const byWidth = room.w / (shell.w + gap + picture.w);
  const side = Math.min(1, byWidth, byHeight(Math.min(room.h / shell.h, (room.h - caption) / picture.h)));
  const under = Math.min(1, room.w / Math.max(shell.w, picture.w), byHeight(room.h / shell.h));
  // The pair goes under each other only when it is too wide for the artboard: a pair the height limits stays side by side.
  if (side === byWidth && under > side)
    return { scale: under, stack: true, width: under * Math.max(shell.w, picture.w), height: under * (shell.h + gap + picture.h) + caption };
  return { scale: side, stack: false, width: side * (shell.w + gap + picture.w), height: Math.max(side * shell.h, side * picture.h + caption) };
}

/** Compare's placeholder, which says which screenshot is missing or how to load one: the frame in the device's px, the placeholder in the window's px. */
export type Placeholder = { room: Size; shell: Size; placeholder: Size; gap: number };

/**
 * The scale of a frame with Compare's placeholder. The placeholder keeps the viewer's size at any scale, so beside the frame it is room
 * taken from the artboard's width, never scaled. It goes under the frame when that shows the frame larger, as it does when
 * the placeholder's width would leave the frame little room: under it, the frame fits as it does alone, and the artboard scrolls
 * to the placeholder. A pair the height limits stays side by side.
 */
export function placeholderFit(fit: Placeholder): { scale: number; stack: boolean; width: number; height: number } {
  const { room, shell, placeholder, gap } = fit;
  const byHeight = Math.max(0.25, room.h / shell.h);
  const side = Math.min(1, (room.w - placeholder.w) / (shell.w + gap), byHeight);
  const under = Math.min(1, room.w / shell.w, byHeight);
  if (under > side) return { scale: under, stack: true, width: Math.max(under * shell.w, placeholder.w), height: under * (shell.h + gap) + placeholder.h };
  return { scale: side, stack: false, width: side * (shell.w + gap) + placeholder.w, height: Math.max(side * shell.h, placeholder.h) };
}

/**
 * Where a comment's pin goes: after the element's right end, at its top; else before its left end; else above or below
 * its left end. A spot is used when it is inside the frame and covers no text and no icon; else the first that covers
 * no text; else above its top-left corner. A pin is the same size on screen at any scale, so its distances in the frame
 * divide by the scale.
 */
export function pinSpot(box: Box, rects: { text: readonly Edges[]; icons: readonly Edges[] }, scale: number, width: number, height: number): [number, number] {
  const r = 14 / scale,
    gap = 16 / scale;
  const inside = (x: number, y: number) => x >= r && x <= width - r && y >= r && y <= height - r;
  const tol = 1.5 / scale; // a text box's edge is not its glyphs: a pin may graze it by a pixel or two
  const clear = (list: readonly Edges[], x: number, y: number) =>
    list.every((t) => x + r <= t.left + tol || x - r >= t.right - tol || y + r <= t.top + tol || y - r >= t.bottom - tol);
  const spots: [number, number][] = [
    [box.x + box.width + gap, box.y],
    [box.x - gap, box.y],
    [box.x + r, box.y - gap],
    [box.x + r, box.y + box.height + gap],
  ];
  const found =
    spots.find(([x, y]) => inside(x, y) && clear(rects.text, x, y) && clear(rects.icons, x, y)) ??
    spots.find(([x, y]) => inside(x, y) && clear(rects.text, x, y));
  const [x, y] = found ?? [box.x, box.y - gap];
  return [Math.min(Math.max(x, r), Math.max(r, width - r)), Math.min(Math.max(y, r), Math.max(r, height - r))];
}
