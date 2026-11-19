// The System view: the design system, as the design holds it: its tokens by source (the design document, each token
// file, then the design's own tokens blocks), and the components its screens name, each with a specimen of every variant,
// beside the component keys of the design document.
import type { Ctx } from "../context.ts";
import { catalog, designDocument, fixtures, ownTokenCss, sampleOf, specimenOf, tokenFiles } from "../design.ts";
import { $, el } from "../dom.ts";
import { fields, images } from "../fill.ts";
import { mount, paint } from "../frame.ts";
import { testIdOf } from "../names.ts";
import { TOKEN_GROUPS, type Token, type TokenSource, tokenSources } from "../tokens.ts";
import * as W from "../words.ts";
import { frameSize, lookNow } from "./prototype.ts";

let ctx!: Ctx;
/** The inputs the view was last built for: it is built again only when they change. */
let builtFor = "";

function sources(): TokenSource[] {
  return tokenSources(tokenFiles, designDocument, ownTokenCss);
}

function tokenRow(group: string, token: Token, byName: Map<string, Token>, place?: TokenSource["paths"][string]): HTMLElement {
  const alias = /^var\((--[\w-]+)\)$/.exec(token.light);
  const shown = (alias && byName.get(alias[1] ?? "")) || token; // an alias shows the token it names
  const others = Object.entries(token.themes)
    .filter(([theme]) => theme !== "light")
    .map(([theme, value]) => W.inTheme(theme, value));
  const value = el("span", { class: "pv-value", text: W.tokenValue(alias ? W.aliasOf(alias[1] ?? "") : token.light, others) });
  let visual: HTMLElement;
  if (group === "color" || group === "illustration") {
    const light = el("i"),
      dark = el("i");
    visual = el("span", { class: "pv-swatch", title: W.LIGHT_AND_DARK }, light, dark);
    light.style.background = shown.light;
    dark.style.background = shown.dark || shown.light;
  } else if (group === "spacing") {
    visual = el("span", { class: "pv-bar-sample" });
    visual.style.width = token.light;
  } else if (group === "radius") {
    visual = el("span", { class: "pv-radius" });
    visual.style.borderTopLeftRadius = token.light;
  } else visual = el("span", { "aria-hidden": "true" });
  const row = el("div", { class: "pv-token" }, visual, el("code", { text: token.name }), value);
  if (place) row.append(el("span", { class: "pv-path", text: W.tokenPlace(place.path, place.line, place.joins) }));
  if (group === "typography" && /typography/.test(token.name)) {
    const sample = el("p", { class: "pv-sample", text: W.typeSample(fixtures.product) });
    sample.style.font = token.light;
    row.append(sample);
  }
  return row;
}

/** A specimen of one component, in a frame of its own, filled with the example data it would show. */
function specimen(node: Element, list: string, name: string): HTMLIFrameElement {
  const frame = el("iframe", { title: name, tabindex: "-1", sandbox: "allow-same-origin" });
  const data = sampleOf(node, list);
  mount(frame, specimenOf(node), (doc) => {
    paint(doc, frameSize(ctx.view.frame), lookNow());
    doc.body.style.minHeight = "0";
    fields(doc, data);
    images(doc, data);
    frame.style.height = `${Math.min(480, Math.max(48, doc.documentElement.scrollHeight))}px`;
  });
  return frame;
}

/** The System view, built again when what a specimen is painted with changes: the frame, the theme, the text size, or the direction. */
export function renderSystem(): void {
  const key = [ctx.view.frame, ctx.view.theme, ctx.view.text, ctx.view.dir].join("|");
  if (builtFor === key) return;
  builtFor = key;
  const all = sources();
  const byName = new Map(all.flatMap((source) => source.tokens).map((token) => [token.name, token]));
  $.systemTokens.replaceChildren(
    ...(all.some((source) => source.tokens.length)
      ? all.map((source) => {
          const groups = TOKEN_GROUPS.map(([group, test], at) => {
            const mine = source.tokens.filter((token) => test.test(token.name) && !TOKEN_GROUPS.slice(0, at).some(([, earlier]) => earlier.test(token.name)));
            return mine.length
              ? el(
                  "div",
                  {},
                  el("h4", { text: W.tokenGroupHead(group, mine.length) }),
                  el("div", { class: "pv-tokens" }, ...mine.map((token) => tokenRow(group, token, byName, source.paths[token.name]))),
                )
              : null;
          }).filter((group): group is HTMLDivElement => group !== null);
          return el(
            "div",
            { class: "pv-source" },
            el("h3", { text: W.sourceHead(source.kind, source.file, source.version) }),
            el("p", { class: "pv-hint", text: W.SOURCE_HINT[source.kind] ?? "" }),
            ...groups,
          );
        })
      : [el("p", { class: "pv-empty", text: W.NO_TOKENS })]),
  );
  const parts = catalog(W.DEFAULT_VARIANT);
  $.systemComponents.replaceChildren(
    ...(parts.length
      ? parts.map((part) => {
          const used = [...part.used].filter(Boolean);
          const on: HTMLElement[] = used.map((id) => {
            const chip = el("button", { type: "button", class: "pv-chip", text: id });
            chip.dataset.pvGo = id;
            chip.dataset.testid = testIdOf("used", part.name, id);
            return chip;
          });
          if (part.used.has("")) on.unshift(el("span", { class: "pv-chip", text: W.EVERY_SCREEN }));
          return el(
            "article",
            { class: "pv-component", id: `component-${part.name}` },
            el(
              "div",
              { class: "pv-component-facts" },
              el("h3", { text: part.name }),
              el("p", { class: "pv-hint", text: W.variantsLine(part.variants.size, used.length) }),
              el("div", { class: "pv-chips" }, ...[...part.variants.keys()].map((name) => el("span", { class: "pv-chip", text: name }))),
              el("div", { class: "pv-chips" }, ...on),
            ),
            el(
              "div",
              { class: "pv-specimens" },
              ...[...part.variants].map(([name, node]) =>
                el("div", { class: "pv-specimen" }, el("span", { text: name }), specimen(node, part.list, W.specimenFrame(part.name, name))),
              ),
            ),
          );
        })
      : [el("p", { class: "pv-empty", text: W.NO_COMPONENTS })]),
  );
  // The design document's component keys: a key the design draws links to its specimen; one it does not is said so.
  if (designDocument?.components.length) {
    const drawn = parts.map((part) => part.name);
    const rows = designDocument.components.map((key) => {
      const part = drawn.find((name) => key.name === name || key.name.startsWith(`${name}-`));
      if (!part) return el("li", {}, el("code", { text: key.name }), " ", el("span", { class: "pv-hint", text: W.NOT_DRAWN }));
      const show = el("button", { type: "button", class: "pv-chip", text: key.name, "aria-label": W.showSpecimen(part) });
      show.addEventListener("click", () => document.getElementById(`component-${part}`)?.scrollIntoView({ block: "nearest" }));
      return el("li", {}, show);
    });
    $.systemComponents.append(
      el("div", { class: "pv-panel pv-document-components" }, el("h3", { text: W.DESIGN_MD_COMPONENTS_HEAD }), el("ul", { class: "pv-chips" }, ...rows)),
    );
  }
}

/** The System view's panel: its tokens and its components, each a section with its lede. */
export function systemPanel(): HTMLElement {
  const section = (head: string, id: string, kind: string) =>
    el("section", {}, el("h2", { text: head }), el("p", { class: "pv-lede", id: `${id}-lede` }), el("div", { class: kind, id }));
  return el(
    "div",
    {},
    el("div", { class: "pv-system" }, section(W.TOKENS_HEAD, "system-tokens", "pv-panel"), section(W.COMPONENTS_HEAD, "system-components", "pv-components")),
  );
}

/** The System view's ledes, which name parts of the design's format. */
export function wireSystem(c: Ctx): void {
  ctx = c;
  $.systemTokensLede.textContent = W.TOKENS_LEDE;
  $.systemComponentsLede.textContent = W.COMPONENTS_LEDE;
}
