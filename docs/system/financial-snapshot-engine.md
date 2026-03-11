# Life CFO — Financial Snapshot Engine

Last updated: 2026-03-11

This document defines the Financial Snapshot Engine used by Life CFO.

The Financial Snapshot Engine converts household financial structure into a compact, current-state representation that can be used by the Ask system.

Its purpose is to make financial reasoning faster, more consistent, and more explainable.

---

# Purpose

The Ask system should not reason directly over raw transactions for most questions.

Instead, it should reason over a structured household financial snapshot.

This allows the system to answer questions such as:

- "Are we okay this month?"
- "Can we afford this?"
- "Why does money feel tight?"
- "What changes if we wait?"

with less prompt complexity and more consistent logic.

---

# Position in the Architecture

The Financial Snapshot Engine sits between the money reasoning layer and the Ask system.

The conceptual flow is:

provider data  
↓  
accounts and transactions  
↓  
financial structure  
↓  
financial signals  
↓  
financial snapshot  
↓  
Ask reasoning  
↓  
UI output  

---

# What a Financial Snapshot Is

A financial snapshot is a compact representation of the household’s current financial state.

It is not a ledger.

It is not a dashboard.

It is a reasoning-ready state object.

A snapshot should capture the parts of household finances that matter most for decision reasoning at a given moment.

---

# What the Snapshot Should Contain

A snapshot may include:

## Balances

Current household financial position, such as:

- available cash
- savings balances
- offset balances
- other liquid reserves

## Income Summary

Current income structure, such as:

- typical monthly household income
- primary income sources
- income cadence
- income stability indicators

## Commitments Summary

Known structural outflows, such as:

- rent or mortgage
- loan repayments
- insurance
- subscriptions
- school fees
- recurring essential obligations

## Discretionary Summary

Flexible outflows that may vary without breaking obligations, such as:

- dining
- shopping
- entertainment
- travel
- non-essential lifestyle spend

## Savings Position

The current saving and reserve posture of the household, such as:

- total saved
- short-term reserves
- longer-term savings posture
- buffer estimates

## Financial Pressure Signals

The key derived signals affecting current financial experience, such as:

- structural pressure
- discretionary drift
- timing mismatch
- stability risk

## Connection Health

The freshness and reliability of the underlying provider data, such as:

- last sync time
- stale provider state
- missing data confidence notes

---

# Snapshot Design Principles

The snapshot should be:

- compact
- household-scoped
- explainable
- deterministic where possible
- easy to recompute
- easy to inspect

The snapshot should avoid unnecessary detail.

Its purpose is to support reasoning, not to replace the transaction ledger.

---

# Why the Snapshot Matters

Without a snapshot, the Ask system must reconstruct the financial state from raw transactions every time.

That leads to:

- slower answers
- higher prompt complexity
- less consistency
- more room for reasoning drift

With a snapshot, the Ask system can reason over a stable financial state representation.

This improves:

- speed
- consistency
- explainability
- testability

---

# Example Snapshot Shape

A conceptual snapshot may include fields such as:

- balances
- income_summary
- commitments_summary
- discretionary_summary
- savings_position
- pressure_signals
- connection_health

The exact implementation may change over time.

The architectural rule is that Ask should reason over a stable state model rather than raw event streams whenever possible.

---

# Relationship to Raw Transactions

Raw transactions remain the source of truth.

The snapshot is derived from them.

Ask should use:

- snapshots for primary reasoning
- transactions for evidence, diagnosis, and drill-down

This means:

- most financial questions are answered from the snapshot
- transaction-level detail is available when needed

This preserves both simplicity and depth.

---

# Relationship to Ask Intents

Different Ask intents may use the snapshot differently.

Examples:

## Orientation

Uses the snapshot heavily.

Primary need:
- current state
- pressure
- stability
- near-term posture

## Affordability

Uses:
- current balances
- commitments
- savings posture
- pressure signals

## Diagnosis

Uses:
- snapshot first
- transactions second for evidence and explanation

## Comparison / Scenario

Uses:
- snapshot as baseline
- scenario assumptions layered on top

---

# Recalculation Model

Snapshots should be recalculated when materially relevant data changes.

Examples:

- new provider sync
- balance changes
- new transactions imported
- commitment model changes
- savings structure changes

Snapshots do not need to be continuously recomputed in an uncontrolled way.

They should be updated intentionally and predictably.

---

# Design Goal

The Financial Snapshot Engine should make Ask feel like it understands the household’s financial reality without forcing the model to re-read the entire financial history every time.

This is a core enabling layer for a true financial intelligence system.

---

# Long-Term Evolution

Future versions may add:

- richer baseline summaries
- period-specific snapshots
- scenario-adjusted snapshots
- confidence metadata
- decision-linked snapshots

The engine must always preserve:

- household boundaries
- explainability
- analytical framing
- calm output design