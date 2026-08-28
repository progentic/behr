# BHeR CMS — Build Documentation

This file is a running log, added to at the end of every phase. It records
what was built and, more importantly, *why*, so a new developer can pick
up the repository without having to reverse-engineer intent from code.

---

## Phase A — Repository Spine

### What this phase delivers

A monorepo that installs, tests, and builds, with no business logic anywhere.
Three apps (`admin`, `api`, `web`) and five internal packages (`contracts`,
`db`, `ui`, `editor`, `config`) exist as documented package boundaries that
compile and, for the apps, produce real build output. The default root
`index.html` exists because it is the first document requested at the base URL;
it states that the landing experience is not implemented in Phase A. The API exposes exactly one route,
`GET /health`, because the acceptance criteria for this phase require it
and nothing else.

Phase A uses Bun 1.4.x and TypeScript 7.0 or newer. Reproducible local and CI
verification pins Bun 1.4.0 and TypeScript 7.0.2. TypeScript 7 is a native
compiler, so Node.js is not required for type-checking.

### Why Bun workspaces instead of npm/pnpm/yarn + Turborepo

The architecture document commits to Bun as the runtime, and Bun ships its
own workspace support, its own bundler, and its own test runner. Adding a
second package manager or a build orchestrator (Turborepo, Nx) on top of
that would be introducing a tool to solve a problem Bun already solves,
which conflicts with the "no speculative abstractions" rule in the phase
plan. `bun run --filter '*' build` iterates every workspace with no extra
dependency. If the number of packages grows large enough that filtered,
dependency-aware task graphs become worth the complexity, that is a
deliberate future decision, not a default.

### Why the admin and web apps use Bun's HTML entry point instead of Vite

Bun can bundle an app directly from an `index.html` file that references a
`<script type="module" src="./src/main.tsx">` tag — no bundler config, no
plugin ecosystem, no separate dev server process. Vite is excellent, but
it is a second build tool with its own config surface layered on top of a
stack that already includes a build tool. Since Phase A's admin and web
apps have no behavior yet, this was the right moment to make the simpler
choice. If the admin app's needs outgrow Bun's built-in bundler (complex
code-splitting, a plugin only Vite's ecosystem has), that trade-off should
be revisited explicitly in a later phase — not pre-solved now.

### Why packages "build" by type-checking only

The five packages under `packages/` have no behavior yet. Each package has a
documentation-only `src/index.ts` that states when its implementation is
introduced. There are no fake readiness constants, stub functions, or
future-work markers. The packages will be consumed as TypeScript
source directly (Bun and the app bundlers both compile `.ts`/`.tsx` on the
fly), so there is nothing to bundle. Giving them a `build` script that
runs `tsc --noEmit` satisfies the Phase A acceptance criterion ("all
workspaces build") honestly: it proves the package's types are valid
without inventing a compiled-output step that nothing consumes yet. When
a package needs a real compiled artifact (for example, if something
outside this monorepo starts importing `@bher/contracts`), its `build`
script should change to actually emit output at that point.

### Why one shared `tsconfig.base.json`

Every app and package extends the same base config (`strict: true`,
`noUncheckedIndexedAccess: true`, ES2022 target). Duplicating compiler
options per workspace is a common source of drift — one package quietly
loses strict null checks and nobody notices until a bug ships. A single
base file means a stricter or looser setting is a one-line change that
applies everywhere at once. Each workspace's own `tsconfig.json` only
adds what's genuinely specific to it (DOM types and JSX for the two React
apps, the Bun global types for the API). Every workspace pins the same
TypeScript 7.0.2 compiler, preventing compiler-version drift.

### Why the API is Hono, not a hand-rolled router

The architecture document names Hono explicitly as part of the primary
stack. Hono's router is small enough not to count as a "deep abstraction"
— it is a thin wrapper over standard `Request`/`Response`, which is also
what `Bun.serve` expects, so the whole app is exported as a single object
with a `fetch` method. There's no framework magic to explain to a new
contributor beyond "routes are defined with `app.get(path, handler)`."

### What was deliberately left out

Per the phase plan's "must not" list, this phase does not touch: auth,
database schema, API business behavior, or the content model. Concretely
that means:

- No `packages/db` client or schema — that's Phase B.
- No `users` table or session handling — that's Phase C.
- No root landing behavior, admin behavior, or public rendering behavior.
  Their entry documents report that they are not implemented in Phase A.
- `infra/nginx`, `infra/systemd`, and `infra/scripts` are directories with
  a one-paragraph README each, explaining what will live there and in
  which phase. They exist (satisfying "provide infra skeleton") without
  containing configuration that would be fictional at this stage — a
  real nginx config for an API that doesn't do anything yet would just be
  something to delete and rewrite later.

### Verification performed

```
bun install          # succeeded with Bun 1.4.0; lockfile written
bun run typecheck    # all 8 workspaces (3 apps + 5 packages) passed
bun run test         # GET /health acceptance test passed
bun run build        # all 8 workspaces succeeded
bun audit            # no vulnerabilities found
```

Runtime check: started the built API and confirmed
`curl http://localhost:3000/health` returns `{"status":"ok"}`.

### Notes for continuing on macOS

Everything above was built and verified on Linux, but nothing in this
phase is platform-specific — Bun, Hono, and plain TypeScript all behave
the same on macOS. To pick this up locally:

```bash
brew install oven-sh/bun/bun    # or: curl -fsSL https://bun.sh/install | bash
bun install
bun run typecheck
bun run test
bun run build
```

The one thing to watch for later: Phase B introduces PostgreSQL. On macOS
that will most likely mean `brew install postgresql` or a Docker
container — that decision is deferred to Phase B, where it belongs.
