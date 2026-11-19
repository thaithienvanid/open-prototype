# The review round

A round is one pass of a reviewer's comments on a design, and your answer to it. A reviewer is a second agent, which never made the design, or a person. The agent rounds come first, then the person's turn, as the skill's step 6 says. The tool keeps each round as files beside the design, so a later reader sees every comment and what answered it. The guide's "Review" part says how the page works. Its "Round files" part gives the shape of both files: each field, which are required, the allowed values, and an example. Run `open-prototype guide` and read both parts before your first round.

The paths below use [the small design](small-design.md), `design/items.html`.

## The steps, when you made the design

Steps 1 to 4 take a person's round. A second agent saves its own round, so for an agent's round start at step 5.

1. **Build, and hand over the page.** Run `open-prototype build`, and give the person the address it prints. For a review that must stay private, or one on a phone, run `open-prototype serve` and give them the address it prints. Its help names the form for a phone. Never ask a person to open the design file itself.
2. **Wait for the person.** They look at each view in the page and pin comments to it. The page counts the views they have seen. Do not answer for them, and do not guess what they would say.
3. **Take the comments as they give them:** a file they downloaded from the page, or a text they pasted from it. A pasted text holds the round as JSON after its lines. Use that JSON as it is, and never retype a comment.
4. **Save the round.** Run `open-prototype save-comments` with the file, or with the JSON on the standard input, and the design. Its help gives both forms. It prints the path of the round it wrote. It never writes over a round. If it refuses, it lists each reason. A comment is a person's words, so never change one to make it save. Tell the person the reason, and ask.
5. **Read every comment.** Each names its screen, its state, the element it points at, and its type: `change`, `remove`, `add`, or `question`. Answer a question in the chat, or with a change that makes the answer plain. If two comments pull apart, stop and ask.
6. **Change the design.** One change may answer several comments. A comment you do not act on stays open, and you say why.
7. **Take the shots of the views you changed** into the next round's folder, as the guide's "Review" part says, so they stay beside its files. For the first round of `design/items.html`, that folder is `design/rounds/items/2/`. The page's copied prompt names the same command.
8. **Write the next round's changes file,** beside the saved round, in the folder of the next round, in the shape the guide's "Round files" part gives. Each change has a summary, in a sentence a person reads, and the ids of the comments it answers. For the first round of `design/items.html`, that file is `design/rounds/items/2/changes.json`.
9. **Check, then build.** `open-prototype check` reads the round files too. An answer that names no comment of an earlier round is a problem. After the build, the page shows each earlier comment as answered, with your summary, or as open.
10. **Report.** Say which comments you answered and how, which are open and why, and what you could not verify. After an agent's round, ask a fresh second agent for the next round, and give it only the design's path and the skill, never your notes or your view. Never write or save a round for it. Stop when a reviewer hands back that its round brings no comment, or after three agent rounds at most. After a person's round, give the person the new page, and start agent rounds again only when the person asks. Only a person decides that a design is done.

## When you are the reviewer

You may be asked to review a design that someone else made. You start fresh, with only the design's path and the skill, and never the maker's notes or view. Never review a design you made as its second reader. You cannot click in the page, so you review from the pictures and write the comments file yourself.

1. Never open the design file in a browser. Run `open-prototype check` and `open-prototype build` on it first. If it gets no page, report the findings and stop.
2. Run `open-prototype screens` and `open-prototype shots` to learn every view. Take the pictures, and read each one.
3. Answer [the review checklist](review-checklist.md). Each "no" with its proof is one comment. A check you could not run is never a comment: list it in your hand-back, with the reason. The tool has no contrast command, so compute each ratio from the values `open-prototype project` prints, as the page draws them, or from the design's own tokens block. Without a way to compute each ratio, mark the contrast check "not run".
4. Write one comment for each fault, on the screen and state where it shows. Point at the element by its test id when it has one. Say what is wrong and what to do, in one or two sentences. Write the file in the shape the guide's "Round files" part gives, and name yourself in `by`, so a reader knows that no person wrote it. Set `round` to one more than the highest round saved beside the design, or 1 when none is, and number each id `r<round>-<n>`, from 1. With no fault, write no file, save nothing, and go to step 6.
5. Save it with `open-prototype save-comments`, as a person's round is saved. The save checks every comment and names each fault of the file.
6. Hand back the round's path and how many comments it holds, or, with no fault, that the round brings no comment. List each check you could not run, with the reason. The maker answers the round, never you. Never say the design is done, because that is the person's decision.

## What never to do in a round

- Never edit or delete a saved round. It is the record.
- Never mark a comment answered that you did not act on.
- Never cut a comment short, and never merge two people's comments into one.
- Never say a person looked when only you did.
