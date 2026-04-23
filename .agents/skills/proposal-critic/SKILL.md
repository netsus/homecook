---
name: proposal-critic
description: Use when the user suggests an architecture, schema, dependency, workflow, optimization, or implementation strategy. Before coding, compare the proposal to at least one alternative and recommend the best approach.
---

# Proposal Critic

Use this skill before implementation when the main question is whether the proposed approach is the right one.

## Extract

Identify:

- Goal
- User proposal
- Hard constraints

If one of these is missing and cannot be inferred from the request or codebase, ask a single focused question before comparing options.

## Generate Options

Produce 2-3 feasible approaches:

- The user's proposal
- One simpler or safer alternative
- One option that best fits the current codebase

If two of those collapse into the same option, keep the list to 2 and say why.

## Compare

Compare the approaches on:

- Simplicity
- Correctness
- Safety
- Reversibility
- Maintainability
- Cost
- Performance
- Consistency with the codebase

Keep the comparison concrete. Prefer codebase facts and current constraints over generic architecture opinions.

## Decide

- If one option is materially better, recommend it explicitly and explain why.
- If the user's proposal is already good enough, say so briefly and proceed without unnecessary debate.
- If the preferred option is still unclear, stop before coding and surface the exact tradeoff that still needs a decision.

## Guardrails

- Never silently substitute the user's proposal.
- Do not start coding until the preferred approach is clear.
- Avoid fake balance. If an option is clearly weaker, say so plainly.
- If the user's proposal is risky but viable, explain the conditions that would make it acceptable.

## Output Shape

Use this structure when helpful:

1. Goal
2. Proposal
3. Options
4. Recommendation
5. Next step
