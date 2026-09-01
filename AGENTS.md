# AGENTS.md

## Role

This file is the bootstrapping and execution guide for coding agents.

Keep it short and stable. It is not the repository system of record and must
not duplicate repository governance, architecture, or implementation history.

Use the repository sources according to their actual ownership:

- `docs/PHASE_PLAN.md` defines normative global rules, approved sequencing,
  phase scope, authorized file surfaces, and acceptance criteria.
- `docs/ARCHITECTURE.md` defines implemented current-state structure,
  ownership boundaries, trust boundaries, and operational invariants.
- `docs/DOCUMENTATION.md` records what was built and why. It is historical
  context, not current scope authority.
- Code and tests are the executable description and verification of current
  behavior.

An assigned task may narrow `PHASE_PLAN.md`. It must not silently broaden,
override, or contradict it.

If the task, repository documents, and implementation disagree, stop and
report the mismatch. Do not silently choose one interpretation or expand scope
to reconcile them.

---

## Core Rule

Make the smallest coherent change that satisfies the requirement and preserves
every applicable invariant.

Additional complexity must correspond to at least one concrete need:

- Required behavior.
- A current invariant.
- A demonstrated failure mode.
- An established ownership boundary.
- A required security, integrity, accessibility, or operational control.

If none applies, do not add the complexity.

Smallest does not mean weakest. Do not remove or bypass a required protection
merely to reduce code.

---

## Understand Before Editing

Do not reason from filenames, search snippets, task summaries, or assumptions.

Before changing code:

1. Read the applicable `PHASE_PLAN.md` section and its authorized file surface.
2. Read the relevant `ARCHITECTURE.md` ownership and trust boundaries.
3. Locate and read the authoritative implementation directly.
4. Trace the affected request, persistence, UI, or runtime flow end to end.
5. Identify the lowest existing boundary that owns the behavior.
6. Identify the applicable requirement, invariant, and failure behavior.
7. Confirm the required files and dependencies are already authorized.
8. Only then choose the implementation.

Search locates code. The implementation explains behavior.

For a defect, identify the violated invariant or root cause. Do not patch only
the reported symptom.

Do not assume a helper owns policy merely because several callers use it.

---

## Implementation Search Ladder

Before creating code, evaluate these options in order.

Stop at the first option that fully satisfies the behavioral contract.

1. **No change**
   - Does the repository already satisfy the requirement?
   - Is the requested mechanism unnecessary once the actual flow is understood?

2. **Existing repository behavior**
   - Is there an existing operation, component, type, constraint, or boundary
     whose semantics already match?

3. **Standard library**
   - Does the language or runtime already provide the behavior?

4. **Native platform**
   - Can the browser, database, operating system, protocol, or framework
     enforce the requirement directly?

5. **Existing approved dependency**
   - Does a dependency already present provide the behavior at the correct
     ownership layer?

6. **Direct implementation**
   - Add the smallest locally understandable implementation that satisfies the
     contract.

Do not continue down the ladder merely because a custom solution appears more
flexible.

Do not force reuse when the existing behavior has different semantics.

---

## New Concept Test

Before adding a new:

- Helper.
- Interface.
- Class.
- Factory.
- Service.
- Repository.
- Manager.
- Store.
- Hook.
- Reducer.
- Registry.
- Framework.
- Configuration switch.
- Dependency.
- Test seam.

Answer all three questions:

1. What current requirement or invariant does this concept own?
2. Why does the existing repository or native platform not already own it?
3. Can the required behavior remain clear without introducing the concept?

If those questions do not have concrete answers, do not add the concept.

Do not remove an existing boundary merely because it has one implementation.
A boundary remains justified when it owns real policy, validation, lifecycle,
translation, security, or resource management.

---

## Directness

Optimize for fewer concepts, not merely fewer lines.

Prefer:

- Existing ownership over new ownership.
- Explicit local code over speculative generalization.
- Native constraints over duplicated enforcement where appropriate.
- Concrete types over future-facing generic types.
- Shallow control flow over indirection.
- Deletion over replacement when behavior is unnecessary.
- Clear code over clever compression.

A one-line expression is not automatically simpler than several obvious lines.

A smaller diff is preferable only when it remains correct at the proper
boundary.

Do not perform unrelated cleanup, renaming, reformatting, or future-proofing.

---

## Testing

Follow the behavioral and verification requirements in `PHASE_PLAN.md`.

When the governing task does not require broader coverage, default to:

- One main behavior path.
- One critical failure path.

Exceed that default only when the contract contains materially distinct
behavior, such as:

- Authentication or authorization.
- Trust-boundary parsing.
- Multiple error classifications.
- Transactions or compensation.
- Concurrency.
- Migrations.
- Resource identity or state transitions.
- Security or integrity negative controls.

Do not add tests merely to increase coverage.

Do not introduce new test infrastructure when the existing test system can
verify the behavior.

Do not extract production abstractions solely to make an otherwise unnecessary
unit test possible.

Verification must prove the contract. It must not merely inspect that code
appears to implement it.

---

## Dedicated Complexity Review

After correctness is established, perform a separate complexity review.

Do not mix this pass with initial implementation. First make the behavior
correct. Then ask what can be removed.

Classify each new concept using:

- **delete** — behavior or code is not required.
- **reuse** — existing repository behavior already owns it.
- **stdlib** — the standard library replaces it.
- **native** — the platform replaces it.
- **dependency** — an existing approved dependency replaces custom code.
- **yagni** — flexibility exists without a current requirement.
- **shrink** — the same behavior can be expressed more directly without
  reducing clarity.

For every addition ask:

> Can this be removed without violating a requirement, invariant, ownership
> boundary, or required failure behavior?

If yes, remove it.

The complexity review must not simplify away required correctness, security,
integrity, accessibility, or operational behavior.

---

## Documentation Discipline

Keep repository truth in the document that owns it.

- Normative scope and sequencing belong in `docs/PHASE_PLAN.md`.
- Implemented structure and authority belong in `docs/ARCHITECTURE.md`.
- Historical implementation rationale belongs in `docs/DOCUMENTATION.md`.
- Agent investigation and execution procedure belongs in `AGENTS.md`.

Do not copy detailed phase rules, current architecture, implementation status,
or historical records into `AGENTS.md`.

Do not place temporary task instructions or progress reporting into stable
repository documents.

When behavior and current-state documentation disagree, report the drift and
correct the owning artifact within the authorized task surface.

---

## Completion

Before declaring a task complete:

1. Confirm the requested behavior is implemented.
2. Confirm applicable invariants remain true.
3. Confirm the change lives at the correct ownership boundary.
4. Confirm only authorized files changed.
5. Run the focused verification required by the task.
6. Perform the dedicated complexity review.
7. Remove unjustified abstraction, dependency, configuration, and flexibility.
8. Report changed files and verification results accurately.

Use only verified results. Do not report an unexecuted check as passing.

Stop after the assigned task.

Do not build the next task early.