# The gleaned Learning Model

> Version 0.2 — methodology foundation before implementation.

---

## The Problem

Most note-taking apps treat learning like memo-writing: open a text field, paste something, save it. The result is a flat archive with no reflection, no context, no challenge. You wrote it down — but you didn't learn it. Worse: the ease of saving creates the illusion that you understood it.

Research consistently shows that *retrieval* and *generation* are what build durable memory — not storage. Copying a paragraph into Notion does almost nothing. Explaining it in your own words does a lot.

gleaned is built around this distinction.

---

## A Note on Friction

Investing in yourself is hard work. That is not a design problem to be solved.

Anyone can let time pass. Deciding to actively learn — to sit down, think, formulate, reflect — that takes effort. gleaned does not try to make learning feel effortless. It is not a productivity app optimized for engagement or streaks.

There are two completely different kinds of friction, and they need to be treated differently:

**Administrative friction** is the wrong kind: Where do I save this? Which field is which? How do I navigate back? This is bureaucratic overhead that has nothing to do with learning. It should be eliminated entirely.

**Cognitive friction** is the right kind: formulating in your own words, asking yourself why something matters, naming what you don't yet understand. This is hard because it requires actual thinking. It is not a usability problem — it is the mechanism. Removing it would break the tool.

gleaned is designed for someone who has already decided to do the work. The goal is not motivation — it is getting out of the way so the hard work can happen without interference.

---

## The Three Pillars

### 1. Capture — No Administrative Friction, Cognitive Friction Enforced

The bar to start an entry is intentionally low: one sentence, no required fields, no type selection up front. Administrative overhead is zero.

But there is one non-negotiable constraint: **you never copy**. Every entry must be written in your own words.

This is not aesthetic preference. Reformulating forces you to process meaning — you cannot rephrase something you don't understand. Where you can't find your own words, you don't actually know it yet. That friction is the point. It is the first moment of real learning.

This is what separates gleaned from a web clipper, a bookmark manager, or a read-it-later app.

### 2. Contextualize — Depth on Demand

A thought without context is hard to reconnect to later. Two optional fields anchor the entry to your life:

- **Source** — where did this come from? (URL, book, person, experience)
- **Why it matters** — one line: what changes for you now that you know this?

The second field is the more important one. Information without personal relevance gets pruned faster. Tying knowledge to a concrete situation — *"this explains why my animations were janky"* — gives the brain a hook.

Neither field is required. The default is still fast capture.

### 3. Confront — Spaced Reflection, Not Just Repetition

The review queue exists to challenge you, not quiz you. SM-2 (the algorithm behind the intervals) was originally designed for vocabulary flashcards — isolated facts. It works. But complex knowledge — insights, frameworks, personal observations — needs a different kind of revisit.

The goal is not "can you recall this?" but "does this still hold? can you connect it to something new?"

This is what we call **Spaced Reflection** instead of Spaced Repetition. The difference is in the review prompt, not the interval math.

---

## Entry Types

Not all knowledge is the same shape. The type determines how it gets reviewed.

| Type | What it is | Example |
|---|---|---|
| 💡 **Insight** | A principle, rule, or mental model | "Every non-trivial program has at least one bug" |
| 🔧 **Technique** | A method, trick, mnemonic, pattern | The P-U-I triangle for Ohm's law |
| 📐 **Framework** | A structured system with multiple components | CO-STAR prompt framework |
| 📖 **Fact** | Isolated information with no broader structure | Capital of New Zealand |
| 🔍 **Observation** | Something you noticed from experience, not from reading | "When I'm tired I write sloppy code" |

Type is optional on entry. It matters most at review time.

---

## The Gap Field

The most underused idea in personal knowledge management: **writing down what you don't know**.

The Gap field is for open questions, unresolved tensions, things that feel shaky. It is not a to-do list. It is a snapshot of the boundary of your understanding at the moment you wrote the entry.

Two concrete implications:

**1. Algorithmic priority.** An entry with an open gap is unstable knowledge. It should surface in the review queue sooner and more often than a closed entry — until the gap is resolved or consciously accepted as open.

**2. Review mode change.** An entry with a gap does not get a standard "do you still remember this?" review. It gets a prompt: *"You had an open question here. Do you have an answer now?"*

This turns gaps into active research prompts rather than passive annotations.

---

## Review Behavior by Type

SM-2 handles the *when*. The entry type handles the *how*.

| Type | Review prompt |
|---|---|
| **Fact** | Title/tag shown, content hidden — active recall before revealing |
| **Technique** | "Can you still walk through this step by step?" |
| **Insight** | "Do you still agree with this? Can you connect it to another entry?" |
| **Framework** | "Can you name all the components without looking?" |
| **Observation** | "Has this changed? Have you seen the opposite?" |

This is an approximation for v1. The exact prompts are an implementation decision.

---

## On Streaks and Human Nature

We are all only human. Time passes regardless of what we do with it. The question is whether we use it to grow or let it run out unnoticed.

Knowledge is one of the few things that compounds — the more you have, the better you can acquire more. And unlike most resources, nobody can take it from you. Investing in understanding is not a productivity hack. It is one of the more serious things a person can do.

Given that, a streak counter is not a gimmick. It is an acknowledgment that motivation is complicated. Most people do not start learning out of pure intrinsic drive — they start because it feels good to see a number grow. Over time, if the tool is honest and the learning is real, that extrinsic motivation quietly becomes intrinsic. The streak becomes irrelevant because the habit is already there.

The streak in gleaned exists to serve this transition. It belongs to you — it is not reported anywhere, nobody else sees it, and you can technically break it without consequence because there is no authority watching. That is by design. A streak that creates anxiety or guilt has failed. A streak that quietly marks your consistency has done its job.

What we draw the line at is **manipulative** gamification — mechanics that exist to serve the app's retention metrics rather than your growth:

- No push notifications designed to guilt you back into the app
- No points, badges, or leaderboards
- No streak "freezes" you can buy

The difference is simple: does this feature serve the user's learning, or does it serve the product's engagement numbers? Streaks serve learning. Everything else on that list does not.

---

## What gleaned Will Never Do

Defining the edges of a methodology is as important as defining the center.

- **No web clipper that saves full articles.** Capturing someone else's words verbatim bypasses the only mechanism that actually produces understanding.
- **No AI-generated summaries of your entries.** gleaned is your thinking. Outsourcing the synthesis defeats the point.
- **No social or sharing features.** The journal is private by design.
- **No manipulative gamification** — guilt-driven notifications, points, leaderboards, or mechanics that serve retention over learning. A streak counter is the exception: it is a simple, honest marker of consistency that belongs entirely to the user.

---

## Scientific Grounding (Brief)

Three concepts from learning research directly inform the model — mentioned here to ground design decisions, not to sound academic:

**Desirable Difficulties (Bjork)** — Learning that requires effort produces more durable memory than learning that feels easy. The constraint of writing in your own words is a desirable difficulty. It should be framed as a feature, not a friction.

**The Self-Explanation Effect** — Explaining something to yourself (or out loud) reveals gaps in understanding that passive reading hides. Layer 0 is an enforced self-explanation.

**Region of Proximal Learning (Metcalfe)** — We learn most effectively at the boundary between what we know and what we don't. The Gap field is designed to make that boundary explicit and actionable.

SM-2's limitation for complex knowledge (it was designed for facts) is a known tradeoff. The type-specific review prompts are our mitigation.

---

## Open Questions

- [ ] Gap entries: flag in review UI, or separate "open gaps" view?
- [ ] Connection field: free text for now, or links to entry IDs?
- [ ] Should Observation type have a shorter initial review interval? (Experiences fade differently than facts)
- [ ] How do we handle an entry where the Gap gets resolved — mark it closed, or create a new entry?
