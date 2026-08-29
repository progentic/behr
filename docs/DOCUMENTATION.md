# BeHR CMS — Build Documentation

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

---

## Phase B — Environment and Persistence Bootstrap

### What this phase delivers

The database package now validates `DATABASE_URL`, constructs Bun's native SQL
client and a Drizzle database around that same client, verifies PostgreSQL
connectivity, applies migrations, and closes every connection pool explicitly.
The API remains independent of the database package, and no application schema
or business behavior was introduced.

Database-independent validation tests cover missing, empty, malformed, and
unsupported URLs; both PostgreSQL URL protocols; and credential redaction.
PostgreSQL integration testing separately proves connectivity, migration
idempotency, catalog cleanliness, and connection cleanup.

The technical `createDatabaseClient` constructor lives directly in
`packages/db/src/client.ts`. It owns Bun SQL and Drizzle construction and does
not sit behind a pass-through policy wrapper; higher-level policy remains in
the operations that validate configuration and own the client lifecycle.

### Dependency decisions

The implementation pins `drizzle-orm` 0.45.2 and `drizzle-kit` 0.31.10, the
current stable non-prerelease releases selected for Bun 1.4.0 and TypeScript
7.0.2. `@types/bun` remains pinned to 1.4.0 so the database package type-checks
against the deployed runtime contract.

`drizzle-orm/bun-sql` accepts an existing Bun `SQL` client, allowing BeHR to
construct one native pool and expose both the native and Drizzle interfaces
without `pg`, `postgres.js`, or a second database abstraction. Type-checking,
unit testing, and live PostgreSQL verification confirm this stable combination.

Drizzle Kit's deprecated transitive `@esbuild-kit/core-utils` dependency asks
for an esbuild release affected by GHSA-67mh-4wv8-2f99. Bun's top-level
override pins every esbuild consumer to stable 0.25.12, which is in Drizzle
Kit's supported `^0.25.4` line and includes the upstream fix. The frozen
install, migration-history validation, full build, and dependency audit verify
the override; the final audit reports no vulnerabilities across 74 packages.

### Migration design

Drizzle Kit validates the migration history and owns its journal format. The
stable Drizzle Kit migration CLI requires a separate PostgreSQL driver, so
execution uses Drizzle's Bun SQL migrator against the same native client used by
the application package. This preserves the required Bun-native connection
boundary without adding an otherwise unused driver.

The migration history contains only Drizzle's required version 7 journal with
an empty entry list. There is no SQL migration because Phase B has no domain
schema. On a clean database, migration execution creates only Drizzle's
`drizzle.__drizzle_migrations` metadata table, its sequence, and its primary-key
index. A second execution has nothing pending and leaves the catalog unchanged.

### Why seed behavior is deferred

Phase B has no application tables or legitimate seed data. A seed file or
command would therefore be a no-op scaffold, which conflicts with the project
rule against fake behavior. Seed support is deferred until a later phase
introduces tables with real, testable seed requirements.

### Verification performed

The final Phase B verification uses Bun 1.4.0, TypeScript 7.0.2, and the pinned
PostgreSQL 18 container image declared in CI. The required command sequence is:

```text
bun --version
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run db:check
bun run db:migration:check
bun run db:migrate
bun run db:migrate
bun run test:integration
bun run build
bun audit
```

Final results:

- `bun --version`: 1.4.0.
- Frozen install: no lockfile changes; 39 installs checked across 83 packages.
- Type-check: all eight workspaces passed with TypeScript 7.0.2.
- Unit tests: one API test and seven environment tests passed.
- Connectivity check: PostgreSQL connection verified.
- Migration validation: Drizzle Kit reported the history valid.
- Migration execution: both consecutive runs passed.
- Integration tests: one test with eleven assertions passed.
- Build: all eight workspaces passed.
- Dependency audit: no vulnerabilities across 74 packages.
- Runtime check: `GET /health` returned HTTP 200 with exactly
  `{"status":"ok"}`.
- Catalog inspection: only the Drizzle migration table, sequence, and index
  exist; no application table or leaked BeHR connection remains.

---

## Phase C — Identity and Session Core

### What this phase delivers

Phase C adds a complete identity and server-session boundary without entering
tenant or site scope. A BeHR user can be registered internally, authenticate
with email and password, receive a bounded opaque session cookie, resolve the
current identity through Hono middleware, and invalidate the session on logout.
The React admin application resolves the same server session on load, displays
the login surface when unauthenticated, and renders only a minimal authenticated
shell after login.

The public API surface is intentionally limited to:

```text
POST /auth/login
GET  /auth/session
POST /auth/logout
```

Better Auth's larger provider handler is not mounted. Provider sign-up is used
only behind the one-time `bun run auth:bootstrap` command; no registration,
password reset, OAuth, MFA, SSO, tenant, site, or content UI is exposed.

### Initial identity bootstrap

The bootstrap command requires `BOOTSTRAP_NAME`, `BOOTSTRAP_EMAIL`, and
`BOOTSTRAP_PASSWORD` with no defaults. It connects through the existing BeHR
database client, refuses to run when any identity exists, calls Better Auth's
supported server API, prints no identity or credential material, and closes the
client on success or failure. A second attempt cannot rename, reset, or replace
the initial identity.

### Authentication integration decision

BeHR pins `better-auth` 1.7.2 and `@better-auth/drizzle-adapter` 1.7.2. The
published adapter accepts an existing Drizzle database, declares compatibility
with Drizzle ORM 0.45.2, and explicitly supports Bun SQL's result shape. The
adapter receives the Drizzle instance constructed by BeHR's existing database
boundary, so no `pg`, `postgres.js`, Kysely PostgreSQL dialect, or second Bun SQL
client was added.

Application request contracts use `zod` 4.5.2. Login parsing is strict, so a
client-supplied user ID or unknown field is rejected before the provider is
called. Provider session tokens never appear in BeHR JSON responses.

### Identity schema and migration

The cohesive `packages/db/src/schema/auth.ts` contract was reviewed against
Better Auth's generated Drizzle schema. Migration
`0000_identity_session_core.sql` creates only the four Better Auth
models reconciled with BeHR's identity needs:

* `user` owns stable IDs, normalized email, display name, verification state,
  optional image, and creation/update timestamps.
* `account` owns password hashes and provider account material, avoiding a
  duplicate credential authority on `user`.
* `session` owns unique opaque tokens, bounded expiry, request metadata, and the
  user foreign key.
* `verification` owns provider verification records.

Drizzle Kit generated the SQL, journal entry, and snapshot. A fresh migration
and a repeat migration both succeed, and catalog inspection rejects any table
outside these four models and Drizzle migration metadata.

### Session and cookie security

`BETTER_AUTH_SECRET` is mandatory, never defaulted, must contain at least 32
non-padded characters, and is not included in errors. `BETTER_AUTH_URL` and
`ADMIN_ORIGIN` must be HTTP(S) origins without credentials, paths, queries, or
fragments; production configuration requires HTTPS for both.

Sessions use:

* HttpOnly cookies
* SameSite Lax
* Secure cookies in production or whenever the public origin is HTTPS
* host-only scope with no cross-subdomain sharing
* a seven-day absolute expiration with refresh disabled
* no cookie session cache, forcing server-state resolution on every request
* explicit database deletion and cookie expiry on logout

State-changing authentication routes require the exact configured origin, and
login parses a strict JSON contract. Credentialed CORS responses name only
`ADMIN_ORIGIN`; wildcard credentialed CORS is never used. Better Auth's
CSRF/origin checks remain enabled, telemetry is disabled, and only error-level
provider logs are emitted.

### Admin security boundary

The admin app sends credentials only to fixed same-origin paths with
`credentials: include`. It stores no token or session identifier in Web
Storage. React renders identity data through normal escaped JSX. The static
entry document applies a restrictive same-origin meta CSP; clickjacking headers
remain assigned to the nginx response boundary in Phase Q because
`frame-ancestors` cannot be enforced through a meta CSP.

### One-origin local development

The normal local workflow is the root command `bun run dev`. It starts one Bun
listener at `http://localhost:3000`, registers `apps/admin/index.html` at `/`,
serves Bun's generated frontend assets, and delegates every unmatched request
to the existing Hono application. The admin's relative `/auth/*` requests
therefore reach the API without a proxy, a browser-specific base URL, or a
second port.

Prepare a local environment and start the application with:

```bash
cp .env.example .env
# Set DATABASE_URL and generate a private BETTER_AUTH_SECRET in .env.
# Set BOOTSTRAP_NAME, BOOTSTRAP_EMAIL, and BOOTSTRAP_PASSWORD only when
# creating the first local identity.
bun install --frozen-lockfile
bun run db:migrate
bun run auth:bootstrap # first identity only
bun run dev
```

Open `http://localhost:3000/`. The example values intentionally make
`BETTER_AUTH_URL` and `ADMIN_ORIGIN` the same origin: the former is Better
Auth's public API origin, while the latter is the browser origin trusted for
credentialed authentication requests.

`bun run dev:api-only` and `bun run dev:admin-only` remain isolated diagnostic
commands. Each uses port 3000 by default and they must not be run together; they
are not the normal application workflow. Production nginx routing remains
deferred to Phase Q.

### Deferred work

Tenant identity, memberships, active tenant selection, roles, RBAC, sites,
domains, content, customer portal behavior, account registration UX, password
reset UX, email-verification UX, OAuth, MFA, passkeys, and SSO remain deferred.
Phase C does not create any table, route, contract, or navigation for them.

### Verification performed

Phase C verification after the one-origin correction used Bun 1.4.0,
TypeScript 7.0.2, and a fresh PostgreSQL 18 database from the immutable CI
image digest.

```text
bun --version
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run db:check
bun run db:migration:check
bun run db:migrate
bun run db:migrate
bun run test:integration
bun run test:auth:integration
bun run build
bun audit
```

Final results:

- Frozen install: no lockfile changes; 64 installs checked across 106 packages.
- Type-check: all eight workspaces passed.
- Unit tests: 34 tests with 62 assertions passed.
- Persistence integration: one PostgreSQL test with 13 assertions passed.
- Authentication integration: one PostgreSQL test with 51 assertions passed.
- Connectivity and migration-history checks passed.
- Fresh and repeat migration runs passed.
- Valid and invalid login, authoritative session resolution, missing/invalid/
  expired session rejection, forged identity rejection, logout invalidation,
  and connection cleanup passed through Better Auth and PostgreSQL.
- All eight workspaces built, including the authenticated admin application.
- Dependency audit: no vulnerabilities across 96 packages.
- The focused development test loaded `/`, fetched Bun's generated assets,
  reached `/health` and all three `/auth/*` routes, preserved API 404 behavior,
  and rebound the listener port immediately after shutdown.
- Bundled API runtime: `GET /health` returned HTTP 200 with exactly
  `{"status":"ok"}`; unauthenticated `GET /auth/session` returned HTTP 401.
- Browser acceptance: `bun run dev` served the admin and API at
  `http://localhost:3000`; a provider-created HttpOnly session entered the
  authenticated shell and logout returned to the login surface on that same
  origin.
- Catalog inspection found only Drizzle migration metadata and the four Phase C
  identity/authentication tables. No BeHR database connection remained open.

---

## Phase D — Tenant and Membership Core

### What this phase delivers

Authenticated users can create tenants and list only tenants where they hold a
membership. Tenant-scoped requests resolve the tenant ID from the URL and the
user ID from the authoritative server session. A missing membership returns the
same HTTP 404 response whether the tenant exists or not.

The public Phase D route surface is exactly:

```text
POST /tenants
GET  /tenants
GET  /tenants/:tenantId
```

All three routes require authentication. Tenant creation additionally requires
the configured trusted origin. There are no invitation, membership mutation,
tenant update, tenant deletion, owner-transfer, active-tenant, site, or admin UI
routes.

### Tenant persistence contract

Migration `0001_tenant_membership_core.sql` adds only:

* `tenants`, with a database-generated UUID, name, and creation/update
  timestamps.
* `memberships`, with tenant ID, user ID, `owner | member` role, and creation
  timestamp.

The membership table uses tenant ID and user ID as its composite primary key;
it has no surrogate ID. Both foreign keys cascade on deletion, and user ID is
indexed for accessible-tenant listing. Tenant creation inserts the tenant and
creator's `owner` membership in one Drizzle transaction through the existing
Bun SQL-backed client.

### Membership authority

The route layer never accepts a user ID as tenant authority. Authentication
middleware resolves the current session, and tenant middleware queries the
membership using that server-resolved user ID together with the `tenantId` path
parameter. A custom user or tenant header cannot override either value.

The `owner | member` role is deliberately descriptive at this phase. No
permission registry, role inheritance, configurable role model, or general
RBAC framework exists. Membership administration, invitations, active-tenant
selection, sites, domains, content, and billing remain unimplemented.

### Verification performed

Phase D verification used Bun 1.4.0, TypeScript 7.0.2, and a fresh PostgreSQL
18 database from the immutable CI image digest.

```text
bun --version
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run db:check
bun run db:migration:check
bun run db:migrate
bun run db:migrate
bun run test:integration
bun run test:auth:integration
bun run test:tenant:integration
bun run build
bun audit
```

Final local results:

* Frozen install checked 64 installs across 106 packages with no changes.
* All eight workspaces type-checked and built.
* Unit tests passed: 36 tests with 70 assertions.
* Persistence integration passed with 13 assertions.
* Authentication integration passed with 51 assertions.
* Tenant isolation integration passed with 22 assertions.
* Fresh and repeat migration runs passed.
* PostgreSQL contained only the four authentication tables plus `tenants` and
  `memberships`; tenant test records and application connections were zero
  after cleanup.
* Dependency audit reported no vulnerabilities across 96 packages.
