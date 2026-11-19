# Guide for an agent working on the tool

This file is for changing the tool itself. To use the tool on a design, load the skill in `skills/prototyping/`, or run `open-prototype guide`.

Read `docs/product-spec.md` and `docs/tech-spec.md` before a change. The product specification says what the tool is for and what a person can do with it. The technical specification says how: what each part does, which rule it keeps, and which test holds that rule. Its section 14 has the steps to add a rule, a command, a name of the format, a frame, or a view, and to release a version.

## Keep the two specifications living

Both specifications are living, and each fact has one owner. A change to what a person can do updates `docs/product-spec.md` in the same commit. A change to how the tool works updates `docs/tech-spec.md`. The CHANGELOG says when. A statement of the product specification links to the section of the technical specification that makes it true, and `tests/docs.test.ts` fails on a link to a heading that is gone.

## Run the checks

- `bun test` runs every test in a few seconds; it skips the tests that start Chrome.
- `bun run lint` shows what Biome's lint finds. `bun run format` formats the source and sorts its imports; the settings are in `biome.jsonc`.
- `bun run check` runs Biome's lint and format check, the type checks, the viewer's drift check, the tests with the browser tests on, and the compiled binary: its help, and, from a folder outside the repository, `example`, `build` of the example, `new-design-md`, and `guide --reference` against `docs/reference.md`, so a shipped file `src/assets.ts` does not embed fails. It fails when no Chrome is found. Run it before a change lands, and run one full suite at a time.
- `sh tools/check-linux.sh` runs `bun run check` on Linux, in a container, with Podman or Docker. Run it after a change to the viewer's layout, the capture, or a path, under the same rule of one full suite at a time.
- `RECORD=1 bun test tests/cases.test.ts` records the cases' results again. Do it only for a change you mean, and list each changed result in the commit message.
- `bun src/cli.ts guide --reference > docs/reference.md` writes the reference again after a change to a rule, a command, a flag, a setting, or a name of the format; a test fails while it differs.
- `bun tools/tech-spec.ts` writes the generated parts of the technical specification again. Run it after a change to a command, a flag, a limit, a device frame, or an export of the entry; a test fails while one is stale.
- `bun run build:viewer` writes `assets/viewer.html` and `assets/viewer.css` again after a change under `viewer/`; a test fails while they differ.

## The layers

`src/modules.ts` holds the module rows, and `tests/layers.test.ts` holds the rules over them. A file imports only from rows above it, or from files before it in its own row. That holds however it names a module: an import, an export from it, a dynamic import, with or without the extension. Only `cli.ts` prints or exits. No code decides by a finding's words, by any means. A new file gets a row there.

The stages: `readFiles` (in `design/files.ts`) is the one stage that reads the disk for a design. `load`, `check`, the manifests, and `page` are pure: a test follows every module they run and holds that none names the clock, the environment, the runtime's own, or chance, such as `Date`, `process`, `Bun`, `Math.random`, or `node:fs`. The two layer tests read the source with the TypeScript compiler, through `tests/source.ts`. `check` and `page` take the device table in the settings, `project.devices`, which `loadProject` fills, and read no file. `captureShots` and `serve` act on the world. `src/index.ts` exports every stage, and the command line runs each through it; its one other door is `src/cli/internal.ts`, for the helpers that are no stage.

## Where a change goes

- **A name of the format:** `format.ts`, and nowhere else: the vocabulary, the slots, the head's names, the platforms, the themes. The guide and the reference list what it holds.
- **A rule:** one row in `RULE_ROWS` (`finding.ts`) with its id `<family>.<rule>`, its level, whether it stops the page, its meaning, and its WCAG criteria if it has any, its `since` in `SINCE` (`checks/rules.ts`) when it arrives after format 1, and its finding in the check that finds it. `RuleId` is derived from the table, so a finding or a refusal whose rule has no row is a type error.
- **A command or a flag:** the table in `cli/arguments.ts`, and its function in `cli.ts`. Every command that ends takes `--json` and prints one object, in the envelope of `schemas/output.schema.json`, which holds each command's own keys.
- **A device frame, or the frames a platform's shots take:** `assets/devices.json`.
- **The limits of a round:** `limits` in `schemas/round-comments.schema.json`.
- **A view of the viewer:** its own file in `viewer/views/`, and one row of the table in `viewer/views/table.ts`.
- **A harness:** its manifest, `.claude-plugin/` or `.antigravity-plugin/`, or for OpenCode the plugin `opencode/server.ts`, whose test is `tests/opencode.test.ts`. Every harness reads the one skill in `skills/prototyping/`, and the install steps, `llms-install.md`, give its lines.
- **A fact about using the tool:** the guide (`guide.ts`), so the tool prints it. The skill and the README point to the guide, and state no fact twice.

## Hard stops

- Never weaken a check of the allow-list, the policy, the sandbox, the `</template` count, or the path rule to pass a test. Each has a test that fails when it is taken out; keep it so.
- Never add a runtime dependency. The development dependencies are `typescript`, `@types/bun`, and `@biomejs/biome`.
- A recorded result changes only on purpose, in the commit that changes it, and the commit says so.
- A new control lands with a test that fails when the control is taken out. Run that revert once, and say so in the commit.
- The viewer's source, `viewer/`, has its own type settings and its own tests; the page contract between the two is `schemas/page-config.schema.json`, and its prose is in section 6 of `docs/tech-spec.md`. A fact both programs read, the type `PageConfig` among them, is written once in `src/contract.ts` or `src/format.ts`, and the viewer imports it through `viewer/names.ts` alone.
- Never edit a generated file or a generated part by hand: `docs/reference.md`, the marked parts of `docs/tech-spec.md`, `assets/viewer.html`, and `assets/viewer.css`.
