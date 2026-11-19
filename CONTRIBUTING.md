# Contributing

Thank you for helping. This page says how to run the checks and what a pull request holds. [`AGENTS.md`](AGENTS.md) holds the full rules, for a person and for an agent, and the two specifications in `docs/` say what the tool does and how.

## Set up

You need Bun 1.4.4, and Chrome or Chromium for the browser tests. In a clone, `bun install` installs the three development tools: TypeScript, Bun's types, and Biome.

## Run the checks

- `bun test` runs every test but the ones that start Chrome, in a few seconds. Run it between steps.
- `bun run check` runs Biome's lint and format check, both type checks, the viewer's drift check, every test with the browser tests on, and the compiled binary's help. It must pass before a change lands.
- `sh tools/check-linux.sh` runs `bun run check` on Linux, in a container, with Podman or Docker. Run it after a change to the viewer's layout, the capture, or a path.
- Run one full check at a time, because two side by side can see each other's browser.

## The rules, in short

- Read `docs/product-spec.md` and `docs/tech-spec.md` before a change. A change to what a person can do updates the product specification, and a change to how the tool works updates the technical one, in the same commit. The CHANGELOG says when.
- A file imports only from the rows above it in `src/modules.ts`. Only `src/cli.ts` prints or exits. No code decides by a finding's words.
- Add no runtime dependency.
- Never weaken a control of the allow-list, the policy, the sandbox, the `</template` count, or the path rule to pass a test.
- Never edit a generated file by hand. `AGENTS.md` lists each one and the command that writes it again.
- A recorded result changes only on purpose, and the commit says so.

## Diagrams

A Mermaid diagram in these pages takes its classes from this one block, so one `classDef` reads on GitHub's white page and on its dark one. A test holds every diagram to these lines.

```text
classDef default fill:#7a787433,stroke:#7a7874,stroke-width:1px
classDef group fill:#7a787414,stroke:#7a7874
classDef boundary fill:#7a787414,stroke:#7a7874,stroke-dasharray:6 4
classDef focus fill:#3373ef26,stroke:#3373ef,stroke-width:4px
classDef human fill:#4d4b47,stroke:#7a7874,stroke-width:2px,color:#fafaf9
classDef added fill:#27895b26,stroke:#27895b,stroke-width:2px
classDef changed fill:#7f7d7833,stroke:#7f7d78,stroke-width:3px
classDef removed fill:#d23e5826,stroke:#d23e58,stroke-width:2px,stroke-dasharray:6 4
```

- Each class is a tint, not a fill, and sets no text colour. `human` is the one opaque class.
- Copy `default` and each class you use, unchanged.
- Give `focus` to the one or two parts the diagram is about.
- Give `human` to a person, or a point where a person decides, drawn as a stadium or a hexagon.
- Give `group` or `boundary` to a subgraph, `boundary` when it is a trust, ownership, or runtime boundary.
- Lines, edge labels, and subgraph titles keep the theme's own colours.

## A pull request

- Make one change in each pull request.
- A fix comes with a test that fails when the fix is reverted. Revert the fix once, watch the test fail, and say so in the pull request.
- Say what the change does for a person who uses the tool, and paste the end of `bun run check`.

## Report a bug or an idea

Open an issue with the bug or the idea form. Report a vulnerability privately, as [`SECURITY.md`](SECURITY.md) says.
