# Life CFO — Financial Pressure Signals

Last updated: 2026-03-11

This document defines the Financial Pressure Signals used by Life CFO.

Financial pressure signals are derived indicators that help explain why a household feels financially steady, stretched, or unstable at a given moment.

These signals support Ask reasoning, especially for questions such as:

- "Are we okay?"
- "Why does money feel tight?"
- "What is putting pressure on us?"
- "Can we absorb this?"

---

# Purpose

Raw transactions do not explain financial pressure by themselves.

The purpose of financial pressure signals is to convert financial structure into meaningful indicators that support financial reasoning.

These signals help the system move from:

"What happened?"  
to  
"What does this mean for the household right now?"

---

# Core Design Principle

Financial pressure signals should be:

- explainable
- grounded in real financial structure
- analytically useful
- calm in presentation
- non-judgmental

They are not labels about the user.

They are indicators about the household financial system.

---

# Core Pressure Signals

Life CFO currently defines four primary pressure signals.

## 1. Structural Pressure

Structural pressure reflects how much of household income is already committed before discretionary spending begins.

It is driven by obligations such as:

- rent or mortgage
- debt repayments
- insurance
- subscriptions
- recurring essential costs

High structural pressure means the household has less flexibility before day-to-day spending begins.

Typical question supported:

- "Why does money feel tight even though income is decent?"

---

## 2. Discretionary Drift

Discretionary drift reflects whether flexible spending is rising beyond the household’s usual pattern.

It is driven by categories such as:

- dining
- shopping
- entertainment
- lifestyle spending
- non-essential purchases

This signal helps distinguish:

- structural pressure
from
- behaviourally flexible pressure

Typical question supported:

- "Has something changed in how we’re spending?"

---

## 3. Timing Mismatch

Timing mismatch reflects when money arrives too late relative to when obligations are due.

A household may have enough income overall but still feel pressure because timing is misaligned.

Examples:

- salary arrives after rent is due
- large bills cluster before main income
- irregular income lands after commitments

Typical question supported:

- "Why does this month feel stressful even though total income is enough?"

---

## 4. Stability Risk

Stability risk reflects how reliable and predictable the household’s income and financial rhythm are.

Examples of higher stability risk:

- irregular freelance income
- uneven business revenue
- volatile variable earnings
- stale or incomplete account data

Examples of lower stability risk:

- consistent salary income
- predictable recurring inflows
- stable data freshness

Typical question supported:

- "How much uncertainty is built into our current position?"

---

# What These Signals Are Used For

These signals are used to support:

- orientation answers
- affordability reasoning
- diagnosis explanations
- planning and scenario analysis

They help the system explain financial position in a way that feels like understanding, not transaction listing.

---

# What These Signals Are Not

These signals are not:

- moral judgments
- behavioural scores
- permanent labels
- hidden profiling
- user identity claims

Life CFO should never frame them as:

- "you are bad with money"
- "you overspend"
- "you always leave things late"

The system should describe financial conditions, not character.

---

# Relationship to the Money Reasoning Layer

Financial pressure signals are derived from the money reasoning layer.

That means they depend on:

- financial flows
- commitments
- discretionary spending
- income rhythm
- balance position
- provider freshness where relevant

Signals are not computed from isolated single transactions.

They emerge from the structured financial model.

---

# Relationship to the Financial Snapshot Engine

Pressure signals should be included in the financial snapshot.

This allows Ask to reason quickly over the household’s current financial posture.

Examples:

- structural pressure: medium
- discretionary drift: low
- timing mismatch: present
- stability risk: moderate

The exact representation may evolve over time.

The architectural rule is that Ask should be able to reason over current financial pressure without reconstructing the whole ledger from scratch.

---

# Explainability Requirement

Every pressure signal should be explainable in plain language.

Examples:

Structural pressure:
- a large share of household income is already committed

Discretionary drift:
- flexible spending is above the usual recent pattern

Timing mismatch:
- key bills are due before expected income arrives

Stability risk:
- income or data freshness is less predictable right now

The system should always be able to answer:

- why this signal exists
- what data contributed to it
- what would change it

---

# Output Framing

Signals should influence reasoning and explanation, but should be surfaced calmly.

Preferred style:

- "A large share of income is already committed."
- "Flexible spending has been running higher than usual."
- "Several obligations land before the next expected income."
- "Income timing is less predictable right now."

Avoid:

- alarming language
- blame
- urgency unless truly necessary
- over-technical jargon

---

# Long-Term Evolution

Future versions may add:

- confidence levels
- pressure trend direction
- scenario sensitivity
- signal combinations
- pressure decomposition by flow

The signal system must always preserve:

- explainability
- calm analytical framing
- household-scoped reasoning
- non-directive language