# Security

## Report a vulnerability

Report it privately, through GitHub's private vulnerability reporting: open [a new report](https://github.com/thaithienvanid/open-prototype/security/advisories/new) on the project's Security tab. Never put the fault in a public issue.

That page takes a report only once the repository's owner has switched on private vulnerability reporting, under Settings, then Code security. If the page says it is off, open an issue titled "A private security report" that holds no detail of the fault. The maintainer then opens a draft security advisory and adds you to it, so you send the details there, in private.

Say which version you ran (`open-prototype --version`), on which system, the command, and the smallest design or file that shows the fault. You get an answer in the report's thread.

## What is in scope

The tool treats a design and every file beside it as hostile input, because a design may come from another person or from an agent. Section 12 of [the technical specification](docs/tech-spec.md#12-safety) holds the threat model and each control with its test. A report is in scope when it breaks one of these parts:

- **The reader:** markup that passes the allow-list and could run, load, or navigate, or a path that reads or writes outside the project or through a link.
- **The page:** a built page that runs a design's script, loads from the network, or lets a design leave its sandboxed frame or reach the viewer's controls. Each link that leaves its screen points to `about:blank` in the page, with the address the design wrote kept as text in `data-proto-href`, so a press that opens a connection to that address is in scope too.
- **The server:** `open-prototype serve` answering another address, another site, or another method, or sharing a file or writing one. Under `--lan`, a way past the secret token.
- **The capture:** Chrome reached by another program, Chrome's own network use, its sandbox turned off, or its profile left behind on a normal end.

## What is out of scope

The specification's list of what is not defended is out of scope. It holds a design file opened directly in a browser, what a design draws inside its own frame, a font file's tables, which the browser's own sanitizer reads, the connection Chrome opens on its own to a frame's address in a page forced past the reader, comments in a page opened as a file, the plain HTTP of `serve --lan`, a capture stopped by force, other programs of the same user, and the settings file, which is trusted.
