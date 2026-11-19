// What a design holds beside its screens: a product name that fits the header, and flows that draw screens and are reached.
import { isProductName, PRODUCT_NAME_LIMIT } from "../contract.ts";
import { type Design, placeOf } from "../design/load.ts";
import { type Finding, finding } from "../finding.ts";
import { ATTR } from "../format.ts";
import { isObject } from "../json.ts";
import { quoted, shown } from "../text.ts";

/** The product's name is one line of `PRODUCT_NAME_LIMIT` characters or fewer, because the viewer shows it in its header. */
export function productNameProblem(name: unknown): string {
  if (typeof name === "string" && name !== "" && !isProductName(name)) {
    return `the product's name ${shown(name)} is more than one short line: hold it to one line of ${PRODUCT_NAME_LIMIT} characters or fewer, because the viewer shows it in its header`;
  }
  return "";
}

/** The product's name: the fixtures' `product`. */
export function nameFindings(design: Design): Finding[] {
  const name = productNameProblem(isObject(design.fixtures) ? design.fixtures.product : undefined);
  return name ? [finding("structure.product-name", name, design.files[0] ?? design.name)] : [];
}

/** The flows a design includes: each draws a screen, and each is reached from the opening flow, a link outside flows, or another flow. */
export function flowFindings(design: Design): Finding[] {
  const facts = design.facts;
  const findings: Finding[] = [];
  if (!facts || !design.flows.length) return findings;
  const drawn = new Set(facts.screens.map((screen) => placeOf(design, screen.line).flow));
  for (const flow of design.flows) {
    if (!drawn.has(flow.id))
      findings.push(
        finding(
          "flow.empty",
          `holds no screen: each is a <section ${ATTR.screen}="<id>" ${ATTR.title}="...">; link between them with <button type="button" ${ATTR.go}="...">`,
          flow.file,
        ),
      );
  }
  const reached = new Set<string>();
  const opening = facts.screens[0] ? placeOf(design, facts.screens[0].line).flow : "";
  if (opening) reached.add(opening);
  const links = new Map<string, Set<string>>();
  for (const link of facts.links) {
    const target = link.value.split(":")[0] ?? "";
    const from = placeOf(design, link.line).flow;
    // A go outside any flow, such as the design's navigation bar, is on every screen: it reaches its flow.
    if (!from) reached.add(target);
    else links.set(from, (links.get(from) ?? new Set()).add(target));
  }
  const todo = [...reached];
  while (todo.length) {
    for (const next of links.get(todo.pop() ?? "") ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        todo.push(next);
      }
    }
  }
  const main = design.files[0] ?? design.name;
  for (const flow of design.flows) {
    if (drawn.has(flow.id) && !reached.has(flow.id))
      findings.push(
        finding(
          "flow.unreached",
          `flow \`${quoted(flow.id)}\` is not reached from any screen or navigation: link to it with ${ATTR.go}="${flow.id}:<screen>"`,
          main,
          flow.line,
        ),
      );
  }
  return findings;
}
