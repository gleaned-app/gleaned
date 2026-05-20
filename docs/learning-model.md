# The gleaned Learning Model

> Draft — work in progress. This document defines the methodology behind how gleaned structures knowledge capture.

---

## The Problem

Most note-taking apps treat learning like memo-writing: open a text field, type something, save. The result is a flat archive of facts with no reflection, no context, no connection. You wrote it down — but you didn't learn it.

gleaned wants to capture the **learning moment**, not just the content.

---

## Core Principle

**Low friction by default. Depth on demand.**

The minimum viable entry is one sentence in your own words. Every additional field is optional and serves a specific purpose. Nobody should feel forced to write an essay just to save what they learned.

---

## The Model

Every entry has one required layer and two optional layers.

### Layer 0 — The Learning (required)

> Explain it in your own words. Short. Like you're telling a friend.

This is the Feynman principle: if you can't explain it simply, you don't understand it yet. The act of rephrasing forces clarity.

- No copying from Wikipedia or documentation
- No formal language required
- One paragraph is enough — often one sentence is better

### Layer 1 — Context (optional, quick)

> Where did this come from? Why did you bother writing it down?

| Field | Description | Example |
|---|---|---|
| **Source** | URL, book, person, experience, experiment | `https://...`, `Clean Code ch.3`, `Mentor call` |
| **Why it matters** | One line — what changes for you now that you know this | `Explains why my CSS animations were laggy` |

### Layer 2 — Depth (optional, for serious learners)

> What's still open? How does this connect?

| Field | Description |
|---|---|
| **Gap** | What you still don't understand. Open questions. The edge of your knowledge. |
| **Connection** | What does this remind you of? Links to other entries. |

---

## Entry Types

Not all knowledge is the same shape. A type tag helps filter and review.

| Type | Description | Example |
|---|---|---|
| 💡 **Insight** | A principle, rule, or mental model | "Every non-trivial program has at least one bug" |
| 🔧 **Technique** | A method, trick, mnemonic, pattern | The P-U-I triangle for Ohm's law |
| 📐 **Framework** | A structured system with multiple parts | CO-STAR prompt framework |
| 📖 **Fact** | Isolated information — no framework, no principle | Capital of New Zealand is Wellington |

Type is optional. It's a lens for later review, not a bureaucratic requirement.

---

## Integration with Spaced Repetition

Every entry — regardless of type or how many layers it has — enters the review queue. The review interval grows automatically (SM-2 algorithm). 

The entry type and depth can influence future review behavior:
- **Insights and Techniques** benefit most from active recall (can you still explain it?)
- **Frameworks** may want a checklist-style review (can you name all parts?)
- **Facts** are the most forgettable — shorter initial intervals make sense

This is an open design question for the next iteration.

---

## Influences

| Method | What we took from it |
|---|---|
| **Feynman Technique** | Layer 0 — explain in your own words |
| **Hansei (反省)** | Layer 1 "why" + Layer 2 "gap" — reflect, don't just record |
| **Zettelkasten** | Layer 2 "connection" — knowledge lives in links, not isolation |
| **What / So What / Now What** | Maps to: Layer 0 / Layer 1 why / Layer 2 gap+connection |
| **Techo culture** | Structure as invitation, not obligation — optional fields, not forms |

---

## Open Questions (to research)

- [ ] Should the review prompt differ by entry type? (Insight → "Explain it" vs. Framework → "List the parts")
- [ ] How does the Gap field feed back into the review queue? (Entry with open gaps should be reviewed sooner?)
- [ ] Is a 5th type needed — **Experience** (something you did / lived, not read)?
- [ ] Connection field: free text or actual links to entry IDs? How do we show the graph?
- [ ] Should source URL auto-fetch a page title / preview?

---

## What stays out

- No mandatory fields beyond the core text
- No scoring, streaks, or gamification (that's a different app)
- No AI-generated suggestions inside the entry (gleaned is your thinking, not the machine's)
