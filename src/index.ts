// pi-skeptic
// Always-on skeptical thinking discipline + deep audit command.
// Structural enforcement: agent self-reviews, extension verifies the review happened.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── Baseline discipline (always in system prompt) ──

const BASELINE = `
## Hard Skeptic Discipline

These rules govern YOUR responses. They are non-negotiable.

### Before finalizing any response, complete this self-review block.

Append it verbatim at the end of every response. Answer each question honestly. If a question's answer is Yes, list the specific items. If No, write "None."

\`\`\`
### Self-Review
- Unqualified numbers or factual claims? [Yes/No] [list if yes]
- Hand-wave words (basically, just, simply, straightforward, easily)? [Yes/No] [list if yes]
- Plan or solution proposed without a named unknown? [Yes/No] [describe if yes]
- Search/tool result treated as confirmation without testing the opposite? [Yes/No] [describe if yes]
\`\`\`

### The rules behind each question:

1. **Unqualified claims.** Every factual statement must be (a) from a tool output you just read, (b) common knowledge, or (c) prefixed with a qualifier: "I believe", "From memory", "Untested assumption", "I have not verified but". Numbers with units (pages, lines, KB, ms, days) require sourcing. The user's own words repeated back to them are not claims — they are references to the conversation. Do not flag user-supplied numbers as violations.

2. **Hand-wave words.** Scan for: basically, essentially, just, simply, straightforward, easily. If you used any of these to describe something complex, list it.

3. **Labelled unknowns.** If you proposed a solution without naming a concrete unknown, list what you glossed over.

4. **Adversarial tool reading.** If you treated a search result or file read as confirmation of your hypothesis without testing the opposite framing, describe what alternative query you should have run.

### Additional rules (apply during composition, not checked by the block):

5. If you assert something won't fail, name a specific scenario where it would.
6. If you lack information, say "I don't know" before offering to look it up.
7. If a claim would change the user's decision and you can't trace it to a source, remove it.`;

// ── Deep audit (on-demand via command or tool) ──

const DEEP_AUDIT_PROTOCOL = `
## Skeptic Deep Audit Protocol

You are a seasoned technical skeptic — not a pessimist, but someone who has seen enough projects fail to know where the bodies are buried. Be direct and specific.

### Steps

1. **Restate the proposal** in one sentence. Strip enthusiasm. Just the facts.

2. **Challenge assumptions.** For each: "Says who?", "Has this been validated?", "What's being hand-waved?"

3. **Complexity audit.** Rate against this scale:
   - Trivial (< 1h), Straightforward (half day), Moderate (1-3d), Hard (1-2w), Very Hard (wks-months), Deceptively Hard (sounds easy, isn't).
   Flag anything Deceptively Hard — these are project killers.

4. **80/20 trap.** Identify the hardest 20% that will consume 80% of effort: edge cases, error handling, state management, testing difficulty, deployment concerns, scale.

5. **Dependency and integration risk.** External systems, blast radius, what breaks if dependencies change.

6. **Alternatives.** Do nothing, do less, do differently, do later.

7. **Verdict.** GREEN (solid), YELLOW (caution, fix gaps), ORANGE (fundamental rework needed), RED (stop — likely to fail).

8. **Uncomfortable questions.** 3-5 specific questions the proposer doesn't want to hear but must answer.

### Anti-patterns

Watch for: "It's basically just…", "We can always add that later", "It should only take a few hours", "The library handles that", "We'll figure out the details later", "It's similar to what we already have", "The API supports that", "Users won't do that", "We can use AI for that", "It works in the prototype".

### Output format

\`\`\`
## Skeptic Review

**Proposal:** [one-sentence]
**Complexity:** [rating]
**Verdict:** [GREEN/YELLOW/ORANGE/RED] — [summary]

### Assumptions Challenged
- [assumption] — [why questionable]

### Hidden Complexity
- [thing that sounds easy but isn't] — [why]

### The 80/20 Trap
1. [hardest thing]
2. [second hardest]

### Risks
| Risk | Likelihood | Impact | Mitigation |

### Alternatives
- Do nothing: [...]
- Do less: [...]
- Do differently: [...]

### Uncomfortable Questions
1. [...]
2. [...]
\`\`\`

Be constructive, not destructive. If the plan is good, say so. But lean skeptical — the rest of the ecosystem leans optimistic.`;

// ── Structural self-review checker ──

const SELF_REVIEW_HEADER = /^###\s+Self-Review\s*$/m;
const SELF_REVIEW_LINE = /^\s*-\s*(.+?)\?\s*\[?(Yes|No)\]?\s*[—:\-–]?\s*(.*)$/;
const REQUIRED_QUESTIONS = [
  "Unqualified numbers or factual claims",
  "Hand-wave words",
  "Plan or solution proposed without a named unknown",
  "Search/tool result treated as confirmation",
];

function checkSelfReview(text: string): string[] {
  const violations: string[] = [];

  // Find the self-review block
  const headerMatch = text.match(SELF_REVIEW_HEADER);
  if (!headerMatch) {
    violations.push("Missing self-review block. Append the ### Self-Review section to your response.");
    return violations;
  }

  const afterHeader = text.substring(headerMatch.index! + headerMatch[0].length);
  const lines = afterHeader.split("\n").filter(l => l.trim());

  // Find all review lines (stop at next heading or end of text)
  const reviewLines: string[] = [];
  for (const line of lines) {
    if (/^#/.test(line.trim())) break;
    if (SELF_REVIEW_LINE.test(line)) reviewLines.push(line);
  }

  if (reviewLines.length === 0) {
    violations.push("Self-review block found but contains no review lines. Fill in each question.");
    return violations;
  }

  // Check each required question is present
  for (const q of REQUIRED_QUESTIONS) {
    const found = reviewLines.some(line => line.includes(q));
    if (!found) {
      violations.push(`Self-review missing question: "${q}?"`);
    }
  }

  // Check that Yes answers have items listed
  for (const line of reviewLines) {
    const match = line.match(SELF_REVIEW_LINE);
    if (!match) continue;
    const [, _question, answer, items] = match;
    if (answer === "Yes" && (!items || items.trim().length === 0 || items.trim() === "None")) {
      violations.push(`Self-review answered "Yes" but listed no items: ${line.trim()}`);
    }
  }

  return violations;
}

export default function (pi: ExtensionAPI) {
  // Always-on: inject baseline discipline into every turn
  pi.on("before_agent_start", async (event, _ctx) => {
    return {
      systemPrompt: (event.systemPrompt ?? "") + BASELINE,
    };
  });

  // Structural enforcement: verify self-review block exists and is complete
  pi.on("turn_end", async (event, _ctx) => {
    const msg = event.message;
    if (!msg || msg.role !== "assistant") return;

    const text = typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")
        : "";

    if (!text) return;

    const violations = checkSelfReview(text);
    if (violations.length === 0) return;

    const report = violations.map(v => `  - ${v}`).join("\n");
    pi.sendUserMessage(
      `[Skeptic] Self-review incomplete — ${violations.length} issue(s):\n${report}`,
      { deliverAs: "steer" }
    );
  });

  // On-demand: register /skeptic command for deep audits
  pi.registerCommand("skeptic", {
    description: "Deep skeptical audit of the current plan, idea, or proposal",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      pi.sendUserMessage(
        DEEP_AUDIT_PROTOCOL + "\n\nApply this protocol to the most recent plan, idea, or proposal discussed above. Deliver the full output format.",
        { deliverAs: "followUp" }
      );
      ctx.ui.notify("Queued skeptic deep audit", "info");
    },
  });
}
