# A run with no person

A run may have no person to answer, such as a headless run, or a request that says no one answers. The skill's steps still hold. The agent rounds run, and the steps that need a person wait for one.

1. **Write the questions.** Write the one message of questions the skill's "What to ask the person" gives, each with the answer you assumed. Design by those answers.
2. **Write down each stop that has a safe answer.** Where the skill says stop and ask, write the question with the answer you assumed, and go on. Where no answer is safe, as with a missing tool, exit code 3, or turning a rule off, hand back.
3. **Go through step 5.** Design, check, build, and look at every view. Use [draft copy](draft-copy.md) where the project has none.
4. **Take the agent rounds of step 6.** A fresh second agent reviews each round and saves it, naming itself in it, and you answer each one by step 7. Stop when the reviewer finds no fault, saves nothing, and hands back that its round brings no comment, or after three agent rounds. With no second agent, say so, and take no round of your own as a second reader's.
5. **Stop before the person's turn, and hand back.** A person's round and the decision that a design is done are a person's, so never take either for them. A round an agent wrote is an agent's, and never stands for a person's.
6. **Say what waits for a person:** how many agent rounds ran, what they changed, and each comment still open; each question with the answer you assumed; each key of draft copy; each check marked "not run"; the person's round; and the decision.
