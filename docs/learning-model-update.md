# The gleaned Learning Model

> Version 2.0 — methodology, grounded.
>
> **Internal document.** This is the target state — what gleaned is designed to become, not a description of what is currently built. Where the current implementation diverges from the methodology, the methodology is correct and the implementation is the debt. See *Implementation status* for the explicit map between vision and code.

---

## What this document is

This is the methodology. Not the product description, not the design philosophy, not the marketing. The question this document answers is narrow: *under what model of human learning is gleaned designed, and what evidence supports each design decision?*

Implementation details, UI questions, and product-level choices live elsewhere. If a sentence in this document cannot be tied back to a claim about how learning works, it does not belong here.

---

## The core claim

Durable understanding is built by three mechanisms, in this order:

1. **Effortful encoding** — turning external information into your own internal representation.
2. **Boundary mapping** — knowing precisely where your understanding ends.
3. **Spaced confrontation** — revisiting knowledge across time, not to remember it, but to test whether it still holds.

Most knowledge tools support step 1 weakly (capture without effort), ignore step 2 entirely, and treat step 3 as memorization. gleaned is built on the assumption that all three are necessary and that step 2 is the most neglected and the most leveraged.

---

## Friction — the working distinction

Two kinds of friction exist in any learning tool. They are not on a spectrum. They are different in kind.

**Administrative friction** is everything between the learner and the act of learning: choosing folders, filling required fields, navigating menus, deciding on a type before the thought is even formed. It produces no learning. It must be eliminated.

**Cognitive friction** is the work of learning itself: putting something in your own words, asking what it means for you, naming what you do not yet understand. It is not a usability problem. It is the mechanism by which understanding is built. Removing it removes the learning.

Every design decision in gleaned is checked against this distinction. If a feature reduces friction, it must be administrative friction. If a feature adds friction, it must be cognitive friction. A feature that does the opposite of either is wrong.

---

## The three pillars

### 1. Encode

The bar to start an entry is one sentence. No required fields, no type selection, no folder choice. The capture flow is the fastest path the technology allows.

The single non-negotiable rule: **the entry must be in your own words.** No paste of source text into the body. This is enforced by design — the input field is a thinking surface, not a clipboard.

The mechanism this exploits is well-documented:

- The **generation effect** (Slamecka & Graf, 1978; replicated extensively): self-produced content is retained substantially better than read content, even when the read content is more accurate.
- **Levels of processing** (Craik & Lockhart, 1972): semantic processing produces stronger memory traces than surface processing. Reformulation forces semantic processing.
- The **self-explanation effect** (Chi et al., 1989, 1994): explaining material to oneself reveals comprehension gaps that passive reading conceals. The first sentence of an entry is an enforced self-explanation.

If you cannot rephrase something, you do not yet understand it. That fact is information. The capture flow is designed to surface it immediately, not weeks later in a review.

### 2. Anchor

A thought without context decays into trivia. Two optional fields exist:

- **Source** — where this came from.
- **Stake** — what changes for you now that you know this. *(Renamed from "Why it matters" to make the field's job concrete: name what is at stake in your life because of this knowledge.)*

The Stake field is the more important one. It is **elaborative interrogation** (Pressley et al., 1987) made explicit — generating a personal "why" anchors the new knowledge to existing memory structures. Dunlosky's 2013 review of learning techniques rated elaborative interrogation in the top tier of effective strategies, alongside practice testing and self-explanation.

A second mechanism is also at work: **encoding specificity** (Tulving & Thomson, 1973). Memory is recalled best when retrieval cues match encoding cues. Writing the personal stake at encoding time creates a retrieval cue that will fire when a similar life situation occurs — which is exactly when the knowledge is needed.

Neither field is required. The default remains fast capture. But entries with a Stake field are flagged in the data model, and over time the system can show the learner which entries have stakes and which are floating — a soft signal, not a guilt mechanic.

### 3. Confront

The review queue does not ask *do you remember this?* It asks *does this still hold?*

This is a deliberate departure from flashcard-style review. Memorization is one possible mode of learning, appropriate for facts. For everything else — insights, frameworks, observations, techniques — the more useful question is whether the knowledge is still true, still relevant, still complete.

Three things happen at review time:

1. The entry is shown with type-appropriate prompts (see *Review modes* below).
2. The learner can mark the entry as **still holds**, **needs revision**, or **superseded**.
3. If the entry has an open Gap (see next section), the review prompt shifts entirely to that gap.

The interval after review is determined by an algorithm (see *Scheduling* below), not by a fixed quality scale.

---

## The Gap field — the central mechanism

This is the most important section of this document.

The Gap field captures what the learner does not yet understand about an entry at the moment of writing. It is not a to-do list. It is a metacognitive snapshot: *here is the boundary of my understanding right now*.

The cognitive science behind this is **metacognitive monitoring** (Nelson & Narens, 1990; Dunlosky & Metcalfe, 2009). Accurate self-assessment of one's own knowledge is what separates effective learners from ineffective ones. It is also the specific cognitive failure described by the Dunning-Kruger effect: low performers cannot accurately evaluate their own competence.

The Gap field operationalizes monitoring. It does not ask the learner to be confident or modest. It asks them to be **specific** about what is unclear.

Three consequences for the system:

**1. Gap-bearing entries get scheduling priority.** An entry with an open gap is unstable knowledge. The scheduler treats it as such — shorter intervals, higher priority in mixed queues. This is not arbitrary; it follows directly from the **region of proximal learning** principle (Metcalfe, 2009): learning is most efficient at the boundary between what is known and what is not. Gaps mark that boundary.

**2. Gap reviews are different from regular reviews.** When a gap is open, the review prompt is not "does this still hold?" but "you flagged something unresolved here. Has it resolved?" The learner can:
- Resolve it (the gap closes, becomes part of the entry's history)
- Mark it still open (no penalty, the gap stays alive)
- Decide it is no longer worth resolving (the gap is consciously archived)

**3. Closed-gap entries decay faster than open-gap entries in priority.** A complete entry without ongoing tension does not need frequent revisits. An entry with an active gap is doing live cognitive work. The scheduler reflects this.

The Gap field is the difference between a static knowledge archive and a living model of what one understands.

---

## Entry types — a pragmatic schema

The five entry types are a **product schema**, not a cognitive science taxonomy. They exist because different shapes of knowledge benefit from different review prompts. They are not derived from the literature.

| Type | What it is | Encoding focus | Review focus |
|---|---|---|---|
| **Insight** | A principle or model | Why is this true? | Is this still true for who you are now? |
| **Technique** | A method or procedure | What are the steps? | Can you walk through it without looking? |
| **Framework** | A structured system | What are the parts? | Can you reconstruct the structure? |
| **Fact** | Isolated information | The fact itself | Active recall — title shown, body hidden |
| **Observation** | Something you noticed | What did you see? | Has this changed? Have you seen the opposite? |

Type is optional at capture. If the user does not specify, the system can either default to the most common type for that user or leave it untyped. An untyped entry receives a generic prompt.

The schema may evolve. It is not load-bearing for the methodology. The methodology is: **review prompts should match knowledge shape**.

---

## Scheduling

This section names the algorithmic question explicitly because the previous version of this document did not.

The scheduling problem is: given a learner, an entry, and a review history, when should the entry next appear?

SM-2 (1985) is the standard answer in flashcard systems. It is well-understood, deterministic, and implementable in a few hundred lines of code. It is also, by 2026, dated. Its weaknesses are documented:

- It treats item difficulty as a per-item parameter that only changes through user-rated quality, with no model of the learner.
- Its quality scale (0–5) requires the learner to make a fine-grained self-assessment that research suggests is unreliable.
- It was designed for atomic facts. Its assumptions break down for the kinds of entries that gleaned is built around.

A more honest design uses one of the following:

**Option A — FSRS.** Free Spaced Repetition Scheduler (2022, refined 2024). Models forgetting probability per learner-item pair. Better empirical performance than SM-2 in controlled comparisons. Open source. Now standard in modern Anki.

**Option B — Type-stratified intervals.** Different entry types use different scheduling functions. Facts use FSRS. Insights use a slower, longer-tailed schedule because they do not "fail" the way facts do — they evolve. Observations use a faster initial cadence because experiential memory fades quickly in the first week.

**Option C — A two-axis model unique to gleaned.** Schedule by *forgetting risk* (FSRS-style) on one axis and *gap pressure* (open gaps shorten intervals) on the other. Combine multiplicatively. This is the option most aligned with the methodology, and the one with the least precedent — which means it would need empirical validation against itself over time.

The recommended path is C, because it is the only one that treats the Gap field as a first-class scheduling input. The methodology is built around the Gap field; the scheduler should be too.

The simple, dishonest answer is to keep SM-2. The methodologically consistent answer is to build the scheduler that the methodology actually demands.

---

## Mixing — interleaving as a feature

Review queues should not be sorted by recency, type, or alphabet. They should **interleave**.

**Interleaved practice** (Rohrer & Taylor, 2007; Kornell & Bjork, 2008) produces stronger long-term retention and better discrimination between similar concepts than blocked practice. The cost is short-term: interleaving feels harder and produces a sense of less progress in the moment. The benefit is that the harder retrieval is what builds the durable trace. This is a clean instance of a desirable difficulty (Bjork, 1994).

The implementation rule: a review session of N entries should sample across types and across recency, with weighted randomness rather than strict sequencing. A session of five Insights followed by five Facts is structurally weaker than a session that mixes them.

This is a deliberate design choice that the learner should be told about, not hidden behind. Interleaving feels worse and works better. Naming it removes the temptation to "fix" the apparent inefficiency.

---

## Confrontation, not repetition

The previous version of this document used the term *Spaced Reflection* to distinguish gleaned's review model from spaced repetition. The term promised more than it delivered, because the difference was only in the prompts.

The honest framing: gleaned's reviews are **confrontations**. The intervals are governed by an explicit forgetting model. The prompts are governed by entry type and gap state. There is no separate philosophical layer between these two — the prompts and the schedule are one system.

The reason for the term *confrontation*: the review is a deliberate encounter between the past self who wrote the entry and the present self who reads it. For facts, the question is alignment of memory. For insights, the question is alignment of belief. For observations, the question is alignment of experience. In all three, the entry is something the learner must answer to, not just something they must remember.

This is the operational difference between an archive and a journal-as-instrument.

---

## What we know decays — and so does what we believe

A specific assumption of this model: knowledge is not a static asset.

For facts, decay is measurable as forgetting and is the subject of all classical spaced repetition research. For insights and observations, decay is harder to measure but real: a model of the world that worked in your life two years ago may not match your current circumstances. An observation about how you behave under stress may have been overtaken by changes in how you handle stress.

The review system treats this directly. The "still holds / needs revision / superseded" choice at review is an admission that learning is not just maintenance of memory, but maintenance of a self-model that the world keeps moving underneath.

This is not a borrowed philosophical claim. It is an empirical observation about long-term knowledge work: people who keep journals over many years find that earlier entries become unrecognizable not because memory failed but because the writer changed. The system should make that visible, not hide it.

---

## The anti-Dunning-Kruger property

Used seriously, gleaned will produce, in the learner, a feeling of knowing less than they did before they started. This is the correct epistemic outcome, and the system should not soften it.

The mechanism: each pillar surfaces a specific kind of unknown. Encode reveals what cannot be put in words. Anchor reveals what has no personal stake. Confront reveals what has stopped being true. The Gap field makes the boundary explicit. After enough entries, the learner has a high-resolution map of the difference between what they actually understand and what they previously assumed they understood.

That map is the goal.

The Dunning-Kruger effect describes failure of metacognitive monitoring at the low-knowledge end of the curve. gleaned trains monitoring directly. The expected outcome, sustained over time, is a learner whose self-assessment of their own knowledge becomes increasingly accurate — which feels, from the inside, like becoming less confident, but is in fact becoming more calibrated.

The history view is the necessary counterweight: a record of every actual entry, in the learner's own words, dated. The feeling of "I know less than I thought" is real and useful. The objective record of "and here is what I have actually built" is what keeps the feeling from becoming corrosive.

---

## The negative space

A methodology is defined as much by what it rejects as by what it includes. The following are deliberately excluded:

- **Verbatim capture of source material.** This bypasses the encoding pillar. Any feature that lets the learner save someone else's words without reformulating defeats the system.
- **AI synthesis of the learner's own entries.** The point is the learner's own synthesis. Outsourcing it produces an artifact that looks like understanding without producing it.
- **Social features.** The journal models a private mind. Sharing changes the writing — entries become performances rather than honest snapshots. This is not a value judgment about social tools; it is an observation about how writing changes when it has an audience.
- **Engagement-driven mechanics.** Notifications, badges, and other retention features serve the product, not the learner. The single exception is the streak counter, addressed below.

---

## On streaks

A single number tracks consecutive days with at least one entry. A second number tracks the longest such streak ever. The current streak resets after a missed day. The longest streak does not.

The streak is not an engagement mechanic because it tracks a behavior that is intrinsically the goal — daily encoding — rather than a proxy behavior designed to retain users. It does not reward quantity, frequency within a day, or review completion. A streak of one entry per day is identical to a streak of ten. The distinction from engagement mechanics is that the metric cannot be gamed without doing the actual thing.

---

## Scientific grounding — explicit

| Design element | Mechanism | Source |
|---|---|---|
| Reformulation rule | Generation effect | Slamecka & Graf (1978) |
| Reformulation rule | Levels of processing | Craik & Lockhart (1972) |
| Reformulation rule | Self-explanation effect | Chi et al. (1989, 1994) |
| Stake field | Elaborative interrogation | Pressley et al. (1987); Dunlosky et al. (2013) |
| Stake field | Encoding specificity | Tulving & Thomson (1973) |
| Gap field | Metacognitive monitoring | Nelson & Narens (1990); Dunlosky & Metcalfe (2009) |
| Gap-prioritized review | Region of proximal learning | Metcalfe (2009) |
| Confront-style review | Testing effect | Roediger & Karpicke (2006) |
| Reformulation as friction | Desirable difficulties | Bjork (1994) |
| Mixed-type review queue | Interleaved practice | Rohrer & Taylor (2007); Kornell & Bjork (2008) |
| Scheduling (chosen path) | Modern forgetting models | FSRS (2022, refined 2024) |

Where the design exceeds the literature — the Gap field as a scheduling input, the two-axis scheduler, the confrontation framing for insights — the document says so. Those are claims to be tested, not borrowed.

---

## Open methodological questions

These are the questions whose answers would change the methodology, not the UI.

1. **Gap resolution as a separate event from review.** Should resolving a gap be a distinct user action with its own data record, or is it just a state change on the entry?
2. **Insight decay rate.** Is there empirical justification for treating Insights with a longer-tailed schedule than Facts, or is that assumption based only on intuition?
3. **Observation half-life.** Do experiential observations fade faster in the first week than fact-based knowledge? If so, the initial review cadence for Observations should be aggressive.
4. **Calibration feedback.** If the system tracks how often a learner's "still holds" judgments match later reality (entries they themselves later mark as superseded), can that be used to give the learner a calibration score over time? This would be a direct measurement of metacognitive accuracy.
5. **Connection between entries.** Free-text mention vs. structured entry-ID links. Free text is lower friction but does nothing for the model. Structured links are higher friction but allow the system to surface forgotten neighbors at review time. The methodological question is whether enforced connection is worth the friction cost — i.e., whether linking is administrative or cognitive friction. This is genuinely unsettled.

---

## Implementation status

The table below maps every methodological element in this document to its current state in the codebase. The three states are:

- **✓ built** — exists and works as described
- **~ partial** — exists in a simplified or incomplete form
- **○ not built** — planned; implementation is future work

| Element | Status | Notes |
|---|---|---|
| Entry writing (own words, one sentence bar) | ✓ built | No required fields, fast capture |
| Tags | ✓ built | Optional, multi-tag |
| Streak counter (current + longest) | ✓ built | Both numbers tracked |
| Basic spaced repetition (review queue, intervals) | ~ partial | Interval doubles on success, resets to 1 on failure. No quality scale, no forgetting model. Effectively simplified SM-2 without ratings. |
| Review queue (scheduled + backfill) | ~ partial | Works. Not interleaved — no mixing across types or recency. |
| **Gap field** | **○ not built** | The central mechanism. Not in the data model yet. |
| Source field | ○ not built | — |
| Stake / Anchor field | ○ not built | Elaborative interrogation mechanic |
| Entry types (Insight / Technique / Framework / Fact / Observation) | ○ not built | Not in data model. All entries are untyped. |
| Type-specific review prompts | ○ not built | Depends on entry types |
| Gap-based scheduling priority | ○ not built | Depends on Gap field |
| FSRS or Option C scheduler | ○ not built | Current interval logic is a placeholder |
| Interleaved review queue | ○ not built | Current queue is date-sorted |
| "Still holds / needs revision / superseded" review states | ○ not built | Current review is binary (Again / Got it) |
| Calibration score (open question 4) | ○ not built | Would be derivable from review history once richer states exist |

**The current implementation covers the encode pillar well and the confront pillar at a basic functional level. The anchor pillar (Source, Stake) and the full Gap mechanism do not exist yet. The scheduling layer is a placeholder that works but does not reflect the methodology.**

The priority order implied by the methodology: Gap field → entry types → type-specific prompts → FSRS/Option C → interleaving → calibration. Each depends on the one before it.

---

## What this document does not cover

UI patterns, color choices, navigation structure, sync behavior, encryption decisions, and platform-specific behaviors are not methodology. They live in design and architecture documents. If a question can be answered without changing what the system claims about how learning works, it does not belong here.
