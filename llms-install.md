# Installing open-prototype, for an AI agent

Follow the first section that fits the harness you run in. Ask the person before you install anything on their machine, and say what it installs. The tool is tested on macOS, Linux and Windows.

## Claude Code

1. Ask the person to type, or with their yes run: `/plugin install open-prototype --marketplace thaithienvanid/open-prototype`. On a Claude Code older than 2.1.275, add the marketplace first with `/plugin marketplace add thaithienvanid/open-prototype`, then `/plugin install open-prototype@open-prototype`.
2. Run `open-prototype --version`. It prints the version. If it says that Bun is missing, ask the person whether to install Bun 1.4.4 or newer from https://bun.sh, then run it again.
3. The plugin also gives you the `prototyping` skill. Load it before you design.

The person installs the plugin once. A new version comes when Claude Code updates the marketplace: they turn on auto-update for `open-prototype` in `/plugin`, or run `/plugin marketplace update open-prototype`. Each `open-prototype` command asks their permission before it runs, as any shell command does. To let it run without asking, they allow it once in `/permissions` with the rule `Bash(open-prototype:*)`. That is their choice, and it allows only this command.

A headless `claude -p` run that loaded the plugin from a folder, with `--plugin-dir`, saw the skill as `open-prototype:prototyping`, and ran `open-prototype --version` from the plugin's own `bin/` (live, 19 November 2026).

In Antigravity, Codex, and Muse Code, below, the plugin brings the skill and not the command. First install the command there, as steps 1 and 2 of [Any other agent](#any-other-agent) say. OpenCode's plugin brings both, as Claude Code's does. Ask the person before each install, because it adds the plugin to their harness for every project.

## Antigravity

1. Install the plugin from the repository: `agy plugin install https://github.com/thaithienvanid/open-prototype`. Antigravity clones it, copies it into its own plugin store, reads `.antigravity-plugin/plugin.json`, and loads the `prototyping` skill in every project.
2. To update it, run the same line again, which replaces the installed copy.

Antigravity 1.5.12 installed the plugin from the repository's address with its one skill, `agy plugin list` listed it, the same line again replaced it, and `agy plugin uninstall` removed it (19 November 2026). An earlier `agy -p` run, with the plugin in a project's `.agents/plugins/`, named the skill's file and ran the command (live). In print mode, Antigravity runs a shell command only when an allow rule under `permissions.allow` names it.

## Codex

1. Add the repository as a marketplace, then install the plugin: `codex plugin marketplace add thaithienvanid/open-prototype && codex plugin add open-prototype@open-prototype`. Codex reads the same `.claude-plugin/marketplace.json` as Claude Code.
2. To update it, run `codex plugin marketplace upgrade open-prototype && codex plugin add open-prototype@open-prototype`.

Codex 0.169.0 installed, updated, and removed the plugin from GitHub, and `codex debug prompt-input` listed the skill to the model as `open-prototype:prototyping` (19 November 2026). An earlier `codex exec` run, with the skill in a project's `.agents/skills/`, in a read-only sandbox, said the skill is there and ran the command (live). For one project only, copy `skills/prototyping/` into that project's `.agents/skills/` instead.

## Muse Code

1. Add the repository as a marketplace, then install the plugin: `muse plugins marketplace add open-prototype https://github.com/thaithienvanid/open-prototype && muse plugins install open-prototype@open-prototype`. Muse reads `.claude-plugin/plugin.json` as a Claude-compatible plugin with the one skill, and warns that it does not import the manifest's display fields, such as `author`. The plugin has no hooks, so it needs no `muse plugins approve`.
2. To update it, run `muse plugins marketplace update open-prototype && muse plugins update open-prototype`.

Muse 1.4.24 installed, updated, and removed the plugin from GitHub (19 November 2026). It keeps the plugin in its own store in the person's home folder, so every project lists it. An earlier `muse exec` run, with writes off, said the skill is there and ran the command (live).

## OpenCode

1. Ask the person, then install the plugin from the repository: `opencode plugin add github:thaithienvanid/open-prototype`. OpenCode 2 or later loads it in every project. The plugin adds the `prototyping` skill, and puts its own `bin/` first on the PATH of each shell OpenCode starts, so `open-prototype` runs from the plugin's copy, with no install of the command.
2. To update it, run `opencode plugin update open-prototype`. OpenCode checks a plugin from Git for a new version when its server starts, as its docs say, but installs the new version only with this line. The update line is not tested.

`opencode plugin add github:thaithienvanid/open-prototype` of OpenCode 2.3.0 installed the plugin as a package of 4.4 MB, and `opencode plugin remove`, given the same address, removed it. `opencode serve`, with Claude Code's plugins taken off the PATH, listed the installed plugin as active and the skill as `prototyping`, and a shell it started found the plugin's `bin/open-prototype` and printed its version (19 November 2026). OpenCode still reads a copy of `skills/prototyping/` from `~/.config/opencode/skills/` or a project's `.opencode/skills/`, for a person who wants the skill without the plugin.

## Any other agent

1. Bun 1.4.4 or newer must be on the PATH: `bun --version`. If it is not, ask the person to install it from https://bun.sh, or use a release binary, below.
2. Install the command from GitHub: `bun add -g github:thaithienvanid/open-prototype`. It puts `open-prototype` on the PATH, and the same command again updates it. For one run with nothing installed, use `bunx github:thaithienvanid/open-prototype <command>`. Once a release is tagged, add `#v<version>` to pin it, such as `#v0.1.0`.
3. Or clone the repository into a folder outside the person's project: `git clone https://github.com/thaithienvanid/open-prototype`. In that folder, run `bun install`, then `bun run compile`, which writes the single-file command `dist/open-prototype` for the machine you are on. Put it on the PATH, or run the tool as `bun run <the folder>/src/cli.ts`.
4. Copy the folder `skills/prototyping/` into the folder where you load skills. It is in the open Agent Skills format: a `SKILL.md` file with its name and its description in its front matter.

## With no Bun: a release binary

The binaries come with the first release. Each release on [the project's releases page](https://github.com/thaithienvanid/open-prototype/releases) holds one file for each system below, with a `SHA256SUMS` file to check it. The file holds the tool, its runtime, and every file it ships, so it needs no Bun:

| System | File |
| --- | --- |
| macOS on Apple silicon | `open-prototype-darwin-arm64` |
| macOS on Intel | `open-prototype-darwin-x64` |
| Linux on x64 | `open-prototype-linux-x64` |
| Linux on arm64 | `open-prototype-linux-arm64` |
| Windows on x64 | `open-prototype-windows-x64.exe` |

Download the file for the system and the sums, check the file, and put it under the name `open-prototype` in a folder on the PATH, here `~/.local/bin`. For a Mac with Apple silicon:

```sh
curl -fLO https://github.com/thaithienvanid/open-prototype/releases/latest/download/open-prototype-darwin-arm64
curl -fLO https://github.com/thaithienvanid/open-prototype/releases/latest/download/SHA256SUMS
shasum -a 256 -c SHA256SUMS --ignore-missing
chmod +x open-prototype-darwin-arm64
mkdir -p ~/.local/bin
mv open-prototype-darwin-arm64 ~/.local/bin/open-prototype
```

On Linux, `sha256sum -c SHA256SUMS --ignore-missing` checks the file. On Windows, in PowerShell, download it and compare its sum with the file's line in `SHA256SUMS`, then put it in a folder on the PATH:

```powershell
curl.exe -fLO https://github.com/thaithienvanid/open-prototype/releases/latest/download/open-prototype-windows-x64.exe
curl.exe -fLO https://github.com/thaithienvanid/open-prototype/releases/latest/download/SHA256SUMS
(Get-FileHash open-prototype-windows-x64.exe -Algorithm SHA256).Hash.ToLower()
Select-String open-prototype-windows-x64.exe SHA256SUMS
```

Rename it to `open-prototype.exe` so the command is `open-prototype`. The binary is not signed, so on macOS download it with `curl`, as above: macOS's Gatekeeper holds a file that a browser downloads.

The sums show that the file matches the release. To check that this repository's release workflow built it, from the tagged commit, use the file's signed build provenance with GitHub's CLI, on any system:

```sh
gh attestation verify open-prototype-darwin-arm64 --repo thaithienvanid/open-prototype
```

## Update and uninstall

Ask the person before you update or remove anything.

**Updates.** A new version is a new tag, `v<version>`, with the same version in `package.json` and in both plugin manifests.
- Claude Code updates the plugin by itself only when the person has turned on auto-update for the `open-prototype` marketplace in `/plugin`. Otherwise, run `/plugin marketplace update open-prototype`, or `claude plugin update open-prototype@open-prototype` from a shell.
- Antigravity: `agy plugin install https://github.com/thaithienvanid/open-prototype` again, which replaces the installed copy.
- Codex: `codex plugin marketplace upgrade open-prototype`, then `codex plugin add open-prototype@open-prototype`.
- Muse Code: `muse plugins marketplace update open-prototype`, then `muse plugins update open-prototype`.
- OpenCode: `opencode plugin update open-prototype`.
- `bun add -g github:thaithienvanid/open-prototype` again installs the newest `main`. Add `#v<version>` to stay on one release.
- A release binary: download the new release's file and its `SHA256SUMS`, and check it as above.

**Uninstall.**
- Claude Code: `/plugin uninstall open-prototype@open-prototype`, then `/plugin marketplace remove open-prototype`.
- Antigravity: `agy plugin uninstall open-prototype`.
- Codex: `codex plugin remove open-prototype@open-prototype`, then `codex plugin marketplace remove open-prototype`.
- Muse Code: `muse plugins remove open-prototype --delete-data`, then `muse plugins marketplace remove open-prototype`.
- OpenCode: `opencode plugin remove github:thaithienvanid/open-prototype`, the address the plugin was added by.
- Bun: `bun remove -g open-prototype`. A `bunx` run installs nothing to remove; `bun pm cache rm` clears Bun's download cache.
- A release binary: delete the file from the PATH.

**What stays in a project.** The tool writes only inside the project, and keeps nothing in the person's home folder.
- `.prototype/` holds the pages and pictures it built. Deleting it loses nothing that a build cannot write again.
- The designs, `prototype.config.json`, and each design's `rounds/` folder are the person's. Never delete them without the person's yes.
- Comments not yet saved as a round live in the browser's storage for the page, under keys that start with `prototype-comments:`. Download the round from the viewer first. Then the browser's "clear site data" for that page removes them.

## Check that it works

In a new, empty folder, run `open-prototype example`, then `open-prototype check .prototype/example/app.html`. It exits 0. Then run `open-prototype guide` once, and read it.

## What the tool does to the machine

It reads and writes inside the project, but for the two things that [section 12 of the technical specification](docs/tech-spec.md#12-safety) names. It sends nothing off the machine, and records no approval: a person approves a design in their own words. Section 12 also holds the threat model and each control.
