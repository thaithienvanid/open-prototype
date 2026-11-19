// The rules of the integrity family over the controls a design draws: an image's alternative, a control's test id, a
// button's or a link's name, a field's label, and the ids `aria-labelledby` names. The walk records each control as a
// fact (`Controls` in `design/read.ts`), and this module judges them. A design read too deep has its one finding, so
// none of these is judged.
import type { Facts, Issue } from "../design/facts.ts";
import { ATTR } from "../format.ts";
import { quoted, words } from "../text.ts";

/** The control rules' issues, in the order of the design's lines. */
export function controlIssues(facts: Facts | null): Issue[] {
  if (!facts || facts.tooDeep) return [];
  const { images, interactive, buttons, fields, labelTargets, labelledby, ids } = facts.controls;
  const issues: Issue[] = [];
  for (const image of images)
    if (!image.alt && image.role !== "presentation" && image.role !== "none")
      issues.push({
        rule: "accessibility.alt",
        line: image.line,
        at: image.at,
        message: '<img> has no alt; describe the image, or write alt="" if it only decorates',
      });
  for (const control of interactive)
    if (!control.testid)
      issues.push({
        rule: "integrity.testid",
        line: control.line,
        at: control.at,
        message: `<${control.tag}> has no ${ATTR.testid}; add one a test can select, such as ${ATTR.testid}="<screen>-<what-it-does>"`,
      });
  for (const button of buttons)
    if (!button.named)
      issues.push({
        rule: "accessibility.name",
        line: button.line,
        at: button.at,
        message: `<${button.tag}> has no name; put text inside it, or add an aria-label`,
      });
  for (const field of fields)
    if (!field.named && !labelTargets.has(field.id))
      issues.push({
        rule: "accessibility.label",
        line: field.line,
        message: `<${field.tag}> has no label; add <label for="..."> with its id, or an aria-label`,
      });
  for (const { line, value } of labelledby)
    for (const ref of words(value))
      if (!ids.has(ref))
        issues.push({
          rule: "integrity.labelledby",
          line,
          message: `aria-labelledby="${quoted(value)}" names missing id \`${quoted(ref)}\`; add an element with id="${quoted(ref)}" or remove it`,
        });
  return issues.sort((a, b) => a.line - b.line);
}
