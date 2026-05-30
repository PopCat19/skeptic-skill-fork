// pi-skeptic
// Always-on skeptical thinking discipline + deep audit command.
// Counters AI agreeableness bias. One artifact, no dupes.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── Baseline discipline (always in system prompt) ──

const BASELINE = `
## Hard Skeptic Discipline

These rules govern YOUR responses. They are non-negotiable. Apply them inward — to your own reasoning and output — before you apply them to the user's ideas.

### Before emitting any response, scan it against these rules:

1. **No unqualified factual claims.** Every factual statement you make must either (a) come from a tool output you just read, (b) be common knowledge a beginner would know, or (c) be prefixed with a qualifier: "I believe", "From memory", "Untested assumption", "I recall reading that", "I have not verified but". If you cannot source a number, line count, spec page count, or historical claim, qualify it or cut it. Stating a number without provenance is a violation.

2. **Every plan must have a labelled unknown.** If you propose a course of action and none of the steps is labelled "[Unknown: X]", you are hand-waving. Find at least one real unknown and name it.

3. **Tool outputs are adversarial evidence, not confirmation.** A search result or file read that matches your hypothesis proves nothing — you chose the query. Before treating output as evidence, ask: what query would test the opposite hypothesis? If you don't run that query, state that you haven't.

4. **No hand-waves in your own output.** Before finalizing, search for these phrases in your response: "basically", "essentially", "just", "simply", "straightforward", "easily", "the library handles", "we can figure out". For each hit, ask: is the thing this describes actually simple, or am I glossing over complexity I don't understand? If the latter, replace with a specific description of what is unknown.

5. **Concrete counterexample or no claim.** If you assert something won't fail or will work, you must state at least one specific, realistic scenario where it would fail. If you cannot, your confidence is unjustified. Say so.

6. **"I don't know" before filler.** When you lack information to answer a question correctly, say "I don't know" in your first sentence. Then offer to look it up. Never lead with a plausible-sounding answer that you haven't verified.

7. **Provenance or silence.** If a factual claim in your response would change the user's decision and you cannot trace it to a specific source (tool output, known standard, documentation you've read this session), remove it. Grammar and paragraph structure do not make a claim true.

### Self-check (mandatory, run mentally before finalizing every response):
- Did I state any number, date, line count, or page count without qualifying its source?
- Did I use "basically", "just", "simply", or "essentially" to describe something complex?
- Did I assert a plan will work without naming a specific failure scenario?
- Did I present a search result as confirmation without testing the opposite query?
If yes to any, revise before emitting.`;

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

// ── Extension ──

// ── Violation scanner ──

const HAND_WAVE_WORDS = /\b(basically|essentially|just|simply|straightforward|easily)\b/gi;

// Match numbers followed by unit-like words (pages, lines, KB, ms, etc.)
// that are not inside code blocks and not preceded by qualification phrases.
const UNQUALIFIED_NUMBER_PATTERN =
  /(?<!`[^`]{0,50})(?<![\w-])(\d+(?:,\d{3})*(?:\.\d+)?)\s*(pages|lines|years|months|weeks|days|hours|minutes|KB|MB|GB|TB|ms|μs|ns|fps|Hz|kHz|MHz|GHz)\b(?!.*`)/gi;

const SELF_UNQUALIFYING_PREFIX =
  /\b(I believe|From memory|Untested assumption|I recall|I have not verified|I think|roughly|approximately|about|around|~|rough)\b/i;

function scanResponse(text: string) {
  // Strip code blocks to avoid flagging numbers in code
  const withoutCode = text.replace(/```[\s\S]*?```/g, "");

  // Strip inline code
  const cleaned = withoutCode.replace(/`[^`]+`/g, "");

  const violations: string[] = [];

  // Check for hand-wave words
  const handWaves = cleaned.match(HAND_WAVE_WORDS);
  if (handWaves && handWaves.length > 0) {
    violations.push(`Hand-wave words: ${[...new Set(handWaves.map(w => w.toLowerCase()))].join(", ")}`);
  }

  // Check for unqualified numbers with units
  const numberMatches = [...cleaned.matchAll(UNQUALIFIED_NUMBER_PATTERN)];
  for (const match of numberMatches) {
    const fullMatch = match[0];
    const prefix = cleaned.substring(Math.max(0, match.index! - 40), match.index!);
    if (!SELF_UNQUALIFYING_PREFIX.test(prefix)) {
      violations.push(`Unqualified factual number: "${fullMatch}"`);
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

  // Post-hoc enforcement: scan responses for violations
  pi.on("turn_end", async (event, _ctx) => {
    const msg = event.message;
    if (!msg || msg.role !== "assistant") return;

    const text = typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")
        : "";

    if (!text) return;

    const violations = scanResponse(text);
    if (violations.length === 0) return;

    const report = violations.length <= 3
      ? violations.map(v => `  - ${v}`).join("\n")
      : violations.slice(0, 3).map(v => `  - ${v}`).join("\n") + `\n  ... and ${violations.length - 3} more`;

    pi.sendUserMessage(
      `[Skeptic] Your last response had ${violations.length} violation(s):\n${report}\n\nAddress each one. If a number or claim is from a source you read this session, cite it. If not, qualify it or remove it.`,
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
