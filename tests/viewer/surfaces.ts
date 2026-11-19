// The layers of the viewer a probe must see, each with the clicks that open it from a fresh page, on a wide and on a
// narrow window.
const id = (testid: string): string => `[data-testid="${testid}"]`;
/** Each layer of the viewer, and the steps that open it from a fresh page. */
export const LAYERS: Record<string, { wide?: string[]; narrow?: string[] }> = {
  "the Prototype": { wide: [], narrow: [] },
  "the Checks menu": { wide: ["#checks-toggle"], narrow: ["#checks-toggle"] },
  "the comment form": { wide: [id("proto-comments-toggle")], narrow: ["#inspect-toggle", id("proto-comments-toggle")] },
  "Build details": { wide: ["#itab-screen"], narrow: ["#build-toggle"] },
  "the Board": { wide: ["#tab-board"], narrow: ["#tab-board"] },
  "the System view": { wide: ["#tab-system"], narrow: ["#tab-system"] },
  "the shortcuts": { wide: ["#shortcuts-open"], narrow: ["#shortcuts-open"] },
  "the screen list as a drawer": { narrow: [id("proto-screens-toggle")] },
};
