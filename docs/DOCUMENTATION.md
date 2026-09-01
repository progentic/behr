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

---

## Phase E — Site Core

### What this phase delivers

Authenticated tenant members can list sites, and tenant owners can create a
site with one globally unique normalized hostname. The exact route surface is:

```text
POST /tenants/:tenantId/sites
GET  /tenants/:tenantId/sites
```

Both routes reuse authoritative authentication and tenant-membership
resolution. Owners may create and list; members may list but receive HTTP 403
for creation. Invalid or inaccessible tenants retain the Phase D HTTP 404
boundary.

### Site and hostname persistence

Migration `0002_site_domain_core.sql` adds only:

* `sites`, containing a generated UUID, tenant foreign key, name, and
  timestamps.
* `domains`, containing a normalized hostname primary key, unique site foreign
  key, and creation timestamp.

`sites.tenant_id` is the sole tenant ownership link. Domain rows do not repeat
tenant identity. The hostname primary key prevents reuse across all tenants,
while the unique site foreign key limits each Phase E site to one hostname.
Creation inserts both rows in one Drizzle transaction. A conflict-aware domain
insert converts duplicate hostnames into HTTP 409 and rolls back the site row.

### Admin workflow

The authenticated admin loads memberships from `GET /tenants`, keeps the
selected tenant only in React component state, and loads that tenant's site
list. Users with multiple memberships receive a basic tenant selector. Owners
receive the site creation form; members receive only the list. Users without
memberships receive an honest empty state rather than tenant-creation UI.

The workflow uses the existing same-origin credentialed HTTP boundary and
parses successful responses with shared Zod contracts. It adds no router,
state library, form library, persistent tenant selection, or new dependency.

### Deferred work

Stored hostnames are not publicly resolved or served. Public `Host`-header
resolution remains Phase H work. Multiple domains, domain editing, deletion,
verification, redirects, DNS or TLS automation, site mutation, pages, content,
preview, publishing, and rendering remain unimplemented.

### Verification performed

Phase E verification uses Bun 1.4.0, TypeScript 7.0.2, and a fresh PostgreSQL
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
bun run test:site:integration
bun run build
bun audit
```

Final local results:

* Frozen install checked 64 installs across 106 packages with no changes.
* All eight workspaces type-checked and built.
* Unit tests passed: 38 tests with 83 assertions.
* Persistence integration passed with 13 assertions.
* Authentication integration passed with 51 assertions.
* Tenant isolation integration passed with 22 assertions.
* Site isolation integration passed with 29 assertions.
* Fresh and repeat migration runs passed.
* Owner browser acceptance passed from empty state through site creation,
  normalized list display, and logout on the one-origin development server.
* Test cleanup left zero site rows, domain rows, and application connections.
* Dependency audit reported no vulnerabilities across 96 packages.

---

## Pre-Phase G — Multi-user Identity and Membership Decision

### Selected v1 model

BeHR v1 supports multi-user tenants with the existing `owner | member` roles.
The Version 1.2 decision gate is resolved through two bounded onboarding paths:

* An authenticated tenant owner may add an existing BeHR identity directly by
  normalized email. The new membership always has the `member` role.
* When the normalized email has no identity, the owner creates or reissues a
  one-time tenant invitation. Possession of that invitation token authorizes
  creation of the email-bound identity and `member` access to the stored tenant.

There is no unrestricted public registration. BeHR does not send invitation
email; the owner must share the token through an appropriately secure external
channel. The raw token appears only in the successful owner response and
transient owner UI state. Reloading the page loses it, and reissue invalidates
the previous token.

### Security boundary and accepted tradeoff

BeHR v1 does not independently prove mailbox ownership. Invitation possession
is treated as a bearer authorization credential for the email and tenant
already stored with that invitation. This is not described as email
verification.

Invitation tokens contain 256 bits of cryptographically secure random material,
use a URL-safe representation, expire after seven days, and are stored only as
SHA-256 digests. Successful completion removes the invitation. The database
enforces globally unique token hashes and one current invitation per
tenant/email pair.

An invitation cannot reset or replace an existing identity or credential. If
the invitation email already exists, registration returns a generic conflict
and directs the user to sign in and have the owner add that account. A provider
existing-email race is reclassified only after authoritative database
re-resolution, and the losing request cannot attach membership.

The owner-only provisioning result intentionally discloses identity existence
through `member_added` versus `invitation_created`. This disclosure is accepted
because the authenticated tenant owner needs materially different next steps
and the raw token only in the missing-identity case. No unauthenticated route
receives that disclosure.

Identity creation and invitation completion are not represented as one
transaction because Better Auth owns identity creation separately. Invitation
claim and membership insertion are atomic. If completion fails after identity
creation, the identity is not destructively removed; a retry follows the
existing-account path and the owner can add it directly.

### Deliberately deferred

Role selection, ownership transfer, member removal, role mutation, general user
administration, password reset, invitation email delivery, mailbox
verification, unrestricted signup, OAuth, MFA, and SSO remain unimplemented.
This decision was completed before Phase G and introduces no page behavior by
itself.

### Verification performed

The final local verification used Bun 1.4.0, TypeScript 7.0.2, Better Auth
1.7.2, and a fresh PostgreSQL 18 database.

* Unit tests passed: 44 tests with 98 assertions.
* Persistence integration passed with 13 assertions.
* Authentication integration passed with 51 assertions.
* Tenant integration passed with 22 assertions.
* Site integration passed with 29 assertions.
* Membership onboarding integration passed with 44 assertions.
* Fresh and repeat migration runs passed.
* Manual one-origin acceptance passed direct identity addition, invitation
  issue/reissue, replaced-token rejection, invite registration without
  auto-login, normal invited-user sign-in, member authorization, tenant-keyed
  UI state, refresh token loss, logout, and absence of unrestricted signup.
* Dependency audit reported no vulnerabilities across 96 packages.

---

## Phase G — Page Persistence and Version Storage

### What this phase delivers

Phase G stores page metadata and canonical draft content without adding page
UI, rendering, preview, or publishing. Its authenticated API surface is:

```text
GET  /tenants/:tenantId/sites/:siteId/pages
POST /tenants/:tenantId/sites/:siteId/pages
GET  /tenants/:tenantId/sites/:siteId/pages/:pageId
POST /tenants/:tenantId/sites/:siteId/pages/:pageId/versions
```

Both `owner` and `member` may use these routes after authoritative session,
tenant-membership, site-scope, and page-scope resolution. This is an explicit
v1 product decision: `member` means content collaborator. Owner-only site
creation and membership administration remain unchanged.

### Metadata, slugs, and canonical content

Migration `0004_page_version_storage.sql` adds exactly `pages` and
`page_versions`. A page belongs to a site through `pages.site_id`; tenant
ownership is derived through the site and is not duplicated. Page titles are
trimmed. Slugs are trimmed, lowercased site-local keys containing lowercase
ASCII letters, digits, and internal hyphens. The empty slug represents a site's
root page. PostgreSQL's unique `(site_id, slug)` index is the concurrency-safe
authority, so one site cannot contain duplicate or multiple root slugs while
separate sites may reuse a slug.

The content body is the unchanged Phase F `PageDocument` and is stored as a
structured PostgreSQL JSONB value. The Bun SQL-specific Drizzle JSONB column
mapping passes the validated object to the native client without an extra JSON
stringification layer. No persistence metadata was added to the canonical
document and no second content schema exists.

### Immutable drafts and transaction behavior

Page creation inserts metadata, inserts the initial immutable version, and
assigns `pages.draft_version_id` in one transaction. A committed page therefore
always has a current draft. Saving inserts another `page_versions` row and
advances the page pointer in one transaction; normal application behavior
exposes no version update or delete operation. If pointer advancement fails,
the new version rolls back.

Concurrent valid saves use simple last-committed pointer semantics. Both saves
may create immutable history rows, and the transaction that commits its pointer
last becomes current. Optimistic locking, ETags, and collaboration coordination
remain intentionally absent.

### Isolation and fail-closed reads

Every page persistence operation is scoped by tenant ID and site ID, with page
ID added where applicable. The API never resolves a page by page ID alone.
Malformed IDs, inaccessible tenants, cross-tenant sites, cross-site page IDs,
and missing resources share the same nondisclosing HTTP 404 response.

Writes validate strict request contracts containing the canonical
`PageDocument`. Reads validate retrieved JSONB with `pageDocumentSchema` before
constructing a successful response. Invalid stored content is neither returned,
coerced, nor repaired; it reaches the existing generic HTTP 500 boundary
without exposing validation details or the stored value.

### Verification performed

Phase G verification uses Bun 1.4.0, TypeScript 7.0.2, Better Auth 1.7.2, and a
fresh PostgreSQL database. Contract coverage proves metadata normalization,
strict requests, and canonical-document rejection. PostgreSQL-backed coverage
proves creation atomicity, the draft foreign key, JSONB object storage,
database-authoritative slug uniqueness, owner/member collaboration,
tenant/site/page nondisclosure, immutable history, pointer advancement,
failed-save rollback, and malformed-content fail-closed behavior. Existing
authentication, tenant, site, and membership integration gates remain part of
the full regression sequence.

### Deferred work

Admin page lists and editing, public rendering, host-based resolution, preview,
preview tokens, publication pointers and history, publishing, autosave,
optimistic locking, page deletion, version-history APIs, assets, themes, and
all Phase H and later behavior remain unimplemented. Phase H has not started.

---

## Phase H — Published Read Model and Public Renderer

### Version 1.3 ownership correction

Version 1.3 separates published-state representation from publication
mutation. Phase H adds the nullable read-state pointer required to identify one
immutable public version. Phase J remains the first phase allowed to change
that pointer through production behavior and continues to own publication
history.

Migration `0005_published_page_read_state.sql` adds only
`pages.published_version_id`, referencing `page_versions.id` with `ON DELETE
SET NULL`. New pages remain unpublished, and Phase G draft saves continue to
update only `draft_version_id` and `updated_at`.

### Authoritative public read boundary

The single public API route is:

```text
GET /public/page?slug=<site-local-slug>
```

The request Host is normalized without percent-decoding and resolved through
`domains.hostname`. The query then proves the complete authority chain:

```text
Host → domain → site → page slug → published_version_id
     → same-page page_version → canonical PageDocument
```

The same-page join is required because foreign-key existence alone does not
prove version ownership. Null pointers, mismatched pointers, invalid authority,
and missing relationships all return a nondisclosing HTTP 404. No draft or
latest-version fallback exists. Authority-shaped query parameters other than
the single `slug` value are ignored.

Published JSONB is validated with `pageDocumentSchema` before a successful
response. Malformed stored content reaches the existing generic HTTP 500
boundary without being exposed, repaired, or replaced with another version.

### Static public application

The static `apps/web` application maps `/` to the root slug and one decoded
pathname segment such as `/about-us` to its Phase G slug. Decoding occurs
exactly once; malformed encoding, encoded slashes, nested paths, and trailing
slashes are rejected. The browser requests `/public/page` on its current origin
without credentials and parses successful responses through
`@bher/contracts`.

The deterministic renderer preserves section and block order, maps heading
levels to `h1` through `h6`, renders paragraphs as `p`, and uses canonical UUIDs
only as React keys. Existing bounded style tokens map to code-owned class names.
Content text uses normal escaped React nodes; arbitrary HTML, CSS, and class
names are not accepted.

### Fixture and production-write boundary

Phase H integration tests assign `published_version_id` directly in test-only
SQL to establish known read state, verify draft isolation, and construct the
cross-page mismatch negative control. No production route or persistence
operation writes the pointer, and no reusable production publishing helper
exists.

### Verification and deferred behavior

PostgreSQL-backed coverage verifies hostname/slug authority, root pages,
draft-only nondisclosure, same-slug host isolation, immutable published reads
across newer draft saves, mismatched-pointer rejection, malformed-content
failure, and inert non-authoritative query parameters. Router and renderer
coverage verifies one-time decoding, deterministic order, semantic headings,
paragraphs, bounded style output, and React text escaping.

Preview, preview tokens, publish authorization, publish routes, production
published-pointer mutation, `page_publications`, publication history, editor
behavior, theme runtime, assets, nginx routing, and all Phase I/Phase J behavior
remain unimplemented.

---

## Phase I — Preview Surface

### Version 1.4 lifecycle ownership

Version 1.4 makes Phase I responsible for the complete bounded preview
credential lifecycle rather than token validation alone. Authenticated owners
and members may issue a credential for an authoritatively scoped page through:

```text
POST /tenants/:tenantId/sites/:siteId/pages/:pageId/preview-tokens
```

The unauthenticated preview read is:

```text
GET /preview/page?slug=<site-local-slug>
X-BeHR-Preview-Token: <preview credential>
```

Both JSON boundaries use `Cache-Control: no-store`.

### Credential and persistence policy

Preview credentials contain 32 cryptographically random bytes encoded as 43
unpadded base64url characters. They expire after 15 minutes and are reusable
until expiry or rotation. PostgreSQL stores only the SHA-256 hexadecimal digest
in `preview_tokens`; the raw token exists only in memory, the successful
issuance response, a browser fragment, and the dedicated request header.

Migration `0006_preview_tokens.sql` adds exactly `preview_tokens` with generated
UUID identity, page and immutable-version foreign keys, token hash, expiry, and
creation timestamp. Database constraints enforce one current row per page and
globally unique token hashes. Page or bound-version deletion cascades to the
row. Expired rows may remain until rotation or cascade cleanup; no worker,
timer, queue, or startup sweep exists.

Issuance resolves tenant, site, page, and the same-page current draft version
inside one transaction. Reissue upserts the page's single row, rotates the
digest, refreshes expiry/creation time, and binds the replacement credential to
the immutable draft then current. It does not retain token history.

### Immutable preview authority

An issued credential is a snapshot grant. If token T1 binds version A and a
later save advances the draft to version B, T1 continues to render A. Reissuing
T2 binds B and immediately invalidates T1.

Preview resolution proves:

```text
Host → domain → site → page slug → page token
     → unexpired digest → same-page immutable version
     → canonical PageDocument
```

Wrong Host or slug, missing/malformed/unknown/expired/rotated credentials, and
cross-page version state all return the same HTTP 404. Malformed persisted
content reaches the existing generic HTTP 500 boundary without repair or
fallback. Preview never follows the current draft at read time and never falls
back to published content.

### Static browser and renderer reuse

The static browser recognizes exactly `#preview=<token>`. The fragment is not
sent with the initial request and is not percent-decoded or persisted in browser
storage. A valid fragment sends the credential only in
`X-BeHR-Preview-Token`; empty or malformed preview fragments fail without
loading the public page. Unrelated fragments preserve the Phase H public flow.

Preview content is parsed through the existing renderable page contract and
uses the existing `PageRenderer`. No preview renderer, API-side HTML, alternate
content model, editor UI, or state-management framework was introduced.

### Isolation and deferred behavior

Issuance and preview reads do not modify `draft_version_id` or
`published_version_id`. A draft-only page remains HTTP 404 from `/public/page`
even when a valid preview credential can read it through `/preview/page`.
Phase J remains the first production writer of published state.

PostgreSQL-backed verification covers owner/member issuance, trusted-origin and
outsider rejection, credential format/lifetime, independent hash verification,
database uniqueness, immutable snapshot binding, rotation, expiry, Host/slug
binding, transport rejection, cross-page mismatch, malformed content, and
published-state isolation. Preview controls or sharing UI, editor behavior,
publishing, `page_publications`, background cleanup, and all Phase J/K behavior
remain unimplemented.

---

## Phase J — Publish Workflow

### Owner-only publication policy

Phase J makes publication an explicit owner-only action. Members remain content
collaborators for drafting and preview, but receive HTTP 403 when attempting to
change public production state. Outsiders and inaccessible resource paths retain
nondisclosing behavior.

The single route is:

```text
POST /tenants/:tenantId/sites/:siteId/pages/:pageId/publish
```

It reuses the existing page authentication, tenant-membership, ID-validation,
and trusted-origin chain. It accepts no publication body and ignores
authority-shaped body/query values. Candidate identity comes only from the
database current-draft pointer, and publisher identity comes only from the
authenticated session.

### Candidate validation and consistency

Publication resolves the authoritatively scoped current immutable draft and
validates its stored JSON with `pageDocumentSchema` before mutation. The commit
then locks the scoped page and may publish only that exact candidate while it
remains the same-page current draft.

If draft A is validated and a later save makes B current before commit, the A
attempt returns HTTP 409. It neither publishes stale A nor substitutes
unvalidated B. The draft remains B, the published pointer remains unchanged,
and no event is recorded. The caller may retry to resolve and validate B.

### Atomic transition history

Migration `0007_page_publications.sql` adds exactly `page_publications` with a
generated UUID, page/version references, authenticated publisher reference, and
timezone-aware publication timestamp. The table contains no copied content or
tenant/site/slug metadata and has no production update/delete operation.

A real transition atomically:

```text
updates pages.published_version_id
inserts one page_publications event
```

Both changes commit or roll back together. Actor-FK failure testing proves the
pointer cannot commit independently of history. Foreign keys use non-cascade
deletion so identity changes do not silently erase provenance.

### Idempotency and concurrent publication

Publishing an already-public current draft returns:

```json
{"status":"unchanged"}
```

and records no event. Two concurrent owner requests for the same candidate are
serialized by the page row; exactly one returns `published`, the other returns
`unchanged`, and only one transition event exists. This duplicate-request rule
is separate from stale-candidate rejection caused by a changing draft.

### Public, draft, and preview isolation

Successful publication immediately affects the existing `/public/page` read
without changing its algorithm. Publishing A leaves draft A unchanged. Saving B
later produces draft B while public content remains A until the owner publishes
B explicitly. Existing immutable versions and prior publication events remain
unchanged.

Publishing never rotates, deletes, rebinds, or extends preview credentials. A
preview token bound to A continues previewing A even if another version becomes
public.

### Verification and deferred behavior

PostgreSQL-backed coverage proves owner/member/outsider policy, trusted-origin
protection, current-draft selection, canonical validation, authoritative actor,
same-page history, initial and later publication, public switching, draft
isolation, idempotency, duplicate concurrency, deterministic stale rejection,
malformed-candidate failure, atomic rollback, immutable history, and preview
isolation.

No publisher role, generic RBAC, page ACL, approval workflow, historical-version
publication, rollback UI, publish button, editor behavior, event bus, queue,
outbox, worker, or Phase K functionality was introduced.

---

## Phase K — Editor Foundation

### Admin authoring workspace

The authenticated admin now continues from tenant selection into one selected
site, its page list, page creation/selection, current-draft loading, structured
local editing, and explicit manual save. Both owner and member roles receive the
page workspace because both are established content collaborators. Existing
site creation and membership administration remain owner-only.

Page creation validates shared title/slug rules and starts with exactly:

```json
{"schemaVersion":1,"sections":[]}
```

After creation, title and slug are displayed as read-only metadata. No rename or
slug mutation behavior exists.

### Editor-domain ownership

`packages/editor` is now the framework-free owner of pure immutable
`PageDocument` transformations. It depends only on `@bher/contracts`; the admin
consumes it through the declared `@bher/editor` workspace edge.

Supported operations append/remove sections, append/remove heading and
paragraph blocks, edit block text, change heading levels 1–6, and set or clear
bounded text alignment. New IDs are generated by the UI and supplied explicitly
to deterministic transformations. Existing section styles and stored order are
preserved. Missing targets are bounded no-ops returning the original document.

There is no generic reducer, command system, plugin architecture, undo/redo, or
hidden randomness in the editor package.

### Manual save and local validity

Block text may temporarily be empty in local controlled inputs, but the
canonical contract remains unchanged. Save validates with `pageDocumentSchema`
and `savePageDraftRequestSchema`; invalid content remains local and no request
is sent.

Exactly one manual save may be in flight per editor instance. Editing remains
enabled while saving. A save submits the snapshot current when clicked, and its
response updates only matching save-status metadata—it never replaces the local
document. If newer edits exist when an older snapshot finishes, those edits
remain and the editor does not label them saved.

### Asynchronous resource identity

Page-list and creation completions carry tenant/site identity. Draft-load state
carries tenant, site, page, and a request epoch. Save completion additionally
carries a save-operation identity and submitted local revision. Functional
state guards discard completions whose current resource or epoch no longer
matches.

This covers tenant/site switches, page switches, and same-page A → B → A
re-entry: an obsolete first A load cannot replace the later A request merely
because the page ID matches.

### Explicit limitations

Switching page, site, or tenant may discard unsaved local edits; Phase K adds no
navigation warning or `beforeunload` guard. It also adds no autosave, debounce,
save queue, reordering, drag/drop, publish UI, preview UI, assets, uploads,
router, store, reducer framework, Web Storage, or editor-specific backend.

Focused editor-domain and admin policy tests cover immutable transformations,
canonical creation, request paths, tenant/site creation confinement, page-load
epochs, save-operation identity, invalid-save blocking, and edit-during-save
preservation. Existing Phase G integration remains the persistence authority.

---

## Phase L — Asset Storage Core

### Site-scoped original storage

Phase L adds one authenticated upload surface:

```text
POST /tenants/:tenantId/sites/:siteId/assets
```

Both owners and members may upload because both are established content
collaborators. Authentication, authoritative tenant membership, valid site
identity, trusted origin, and the site's tenant ancestry are resolved before
multipart parsing or file allocation. Invalid or inaccessible tenant/site
scope remains nondisclosing HTTP 404.

Assets belong to sites through `assets.site_id`; tenant authority continues
through `sites.tenant_id`. The asset row does not duplicate tenant, page, user,
hostname, slug, filesystem path, or public URL data.

### Bounded multipart and metadata policy

The request must be `multipart/form-data` with exactly one `file` entry whose
value is a `File`. Missing, duplicate, string-valued, or additional fields are
HTTP 400. Hono's upload-local body limiter caps the total request at 11 MiB;
accepted files contain 1 byte through 10 MiB inclusive.

Original filenames are bounded display metadata: 1–255 characters with no
NUL, ASCII control, slash, or backslash characters. They never participate in
the storage path. `File.type` is also untrusted descriptive metadata. Empty,
overlong, control-bearing, or otherwise unusable values become
`application/octet-stream`; Phase L performs no MIME sniffing or allowlisting.

The server generates a UUID and logical storage key:

```text
<siteId>/<assetId>
```

Request fields, query values, headers, filenames, and MIME metadata have no
authority over that identity, site ownership, or physical destination.

### Filesystem and database boundaries

Production requires an explicit absolute `ASSET_STORAGE_ROOT`, targeting
`/var/lib/bhr-cms/uploads`. Development defaults to the gitignored,
repository-relative `.data/uploads` resolved from the API module location, not
the process working directory. Upload integration tests use temporary absolute
roots.

`AssetStorage` is the only production boundary constructing physical asset
paths. It creates the site directory, opens `<root>/<siteId>/<assetId>` with
exclusive semantics, writes exact bytes, removes a partial file created by a
failed invocation, and supports request-level compensating removal. A failed
exclusive open never removes or truncates the pre-existing collision target.

Migration `0008_assets.sql` adds exactly `assets` with UUID primary key,
non-cascading indexed site foreign key, globally unique storage key, original
filename, content type, byte size, and timezone-aware creation timestamp.
`AssetPersistence` exposes only authoritative site-scope resolution and asset
metadata insertion. Metadata insertion revalidates and locks the tenant/site
relationship before inserting.

### Cross-store consistency and response confinement

The request sequence is:

```text
authenticate and authorize
→ validate tenant/site scope
→ validate bounded multipart metadata and size
→ generate ID/key
→ exclusively write original bytes
→ revalidate scope and insert metadata
→ return strict response
```

If metadata insertion fails or scope disappears after the precheck, the route
removes the just-written file before returning an error. This is not a
filesystem/PostgreSQL transaction. A hard process crash after file write and
before metadata commit may leave an inert orphan file with no `assets` row;
Phase L intentionally adds no worker, queue, outbox, startup reconciliation, or
cleanup daemon.

Successful responses contain exactly:

```text
id
originalFilename
contentType
byteSize
createdAt
```

They never expose a storage key, root, physical path, tenant ID, site ID, or
database internals.

### Verification and deferred behavior

Focused coverage proves strict contracts, storage-root configuration,
exclusive-write collision safety, partial-write cleanup, metadata-failure and
scope-loss compensation, owner/member upload, authorization rejection,
multipart shape, exact size boundaries, filename traversal rejection,
content-type fallback, server-controlled path confinement, metadata accuracy,
response confinement, migration/catalog state, and existing regressions.

Phase L exposes no public asset delivery, GET/list/update/delete route, static
mount, admin upload control, editor picker, asset-backed block, PageDocument
change, derivative generation, image processing, or Phase M integration.

---

## Phase M — Asset Integration

### Canonical image identity and site picker

Canonical content now supports one strict image block containing only `id`,
`type: "image"`, `assetId`, and `alt`. It stores stable identity rather than a
URL, storage key, filename, MIME type, dimensions, or presentation controls.
The PageDocument schema remains version 1 and existing heading/paragraph
documents remain valid.

Owners and members may list renderable assets through:

```text
GET /tenants/:tenantId/sites/:siteId/assets
```

The response contains only public-safe metadata and filters to JPEG, PNG, GIF,
WebP, and AVIF. Admin asset-list state carries tenant/site identity, rejects
late cross-site completions, and provides one inline selection control per
section. Selection appends an image block; the image editor exposes alt text
and the existing remove action. It adds no upload, search, deletion, folders,
thumbnails, or media-library framework.

### Immutable version usage

Migration `0009_page_version_assets.sql` adds exactly
`page_version_assets(page_version_id, asset_id)` with a composite primary key,
asset index, cascading version reference, and non-cascading asset reference.

The API extracts unique image asset IDs after canonical parsing. Page
persistence then proves every asset belongs to the authoritative page site and
commits the immutable version, deduplicated usage rows, and draft pointer in the
existing transaction. Wrong-site and nonexistent references receive the same
bounded HTTP 400 with no version, usage, or pointer mutation. Generic
persistence failures retain generic HTTP 500 behavior.

Usage belongs to immutable versions and is never rewritten by later saves,
publication, or preview-token issuance. It answers what a version references;
it does not grant delivery authority.

### Current-publication byte authority

Public bytes are available only through:

```text
GET /public/assets/:assetId
```

The resolver proves actual Host → domain/site, same-site asset, page on that
site, current published pointer, same-page immutable version, and the exact
version/asset usage row. A draft-only or historical non-current usage returns
404. Another currently published page on the same site may independently keep
the shared asset public.

### Token-bound preview byte authority

Preview bytes use:

```text
GET /preview/assets/:assetId
X-BeHR-Preview-Token: <existing credential>
```

The resolver proves the unexpired token hash, its page, its exact immutable
version, same-site ancestry, and usage of the requested asset by that bound
version. It never follows the current draft and never falls back to public
delivery. Rotation and expiry retain the existing preview lifecycle.

### Byte delivery and renderer behavior

Both byte routes allow only the explicit image MIME list, return the exact
stored bytes with the allowlisted `Content-Type`, and set
`X-Content-Type-Options: nosniff`. Missing bytes after authoritative resolution
are an internal integrity failure and reach generic HTTP 500 rather than being
misclassified as not found.

Published image blocks use `/public/assets/:assetId` directly. Preview images
send the existing token only through its header, convert the response Blob to
a component-local object URL, and revoke that URL during effect cleanup. The
token is never placed in an asset URL, query, cookie, log, localStorage, or
sessionStorage.

### Explicit limitations

Phase M adds no asset update/delete/rename/search, usage-count endpoint,
signed URL, MIME sniffing, SVG delivery, resizing, thumbnails, derivatives,
transcoding, media cache, service worker, worker, queue, or Phase N theme
behavior.

---

## Phase N — Theme Runtime Contract

### Minimal current site theme

Each site may have one current `themes` row with only:

```text
site_id
color_scheme: light | dark
font_family: sans | serif
```

`site_id` is both the primary key and a cascading foreign key to the site. No
active pointer, name, history, inheritance, preset, or version exists. Sites
without a row use the shared `{colorScheme: "light", fontFamily: "sans"}`
default, so no migration backfill is required.

### Current-state read semantics

The existing `/public/page` and `/preview/page` responses now require a strict
`theme` object. Public content remains authorized by the current published
version. Preview content remains authorized by the existing token-bound
immutable version. The optional theme join is supplemental and cannot authorize
a page.

Theme is current site state rather than immutable page content. Publishing does
not snapshot it, and preview-token issuance does not bind it. A valid preview
token continues to reference the same immutable document while subsequent
reads immediately observe a changed current site theme.

Missing rows receive the shared default at the API response boundary. A stored
unsupported token is treated as malformed persisted state: complete response
validation fails through generic HTTP 500 without repair, fallback, token
disclosure, or validation details.

### Trusted renderer mapping

The shared `PageRenderer` receives `document`, `previewToken`, and `theme`.
One root wrapper maps the bounded tokens to application-owned background, text,
and local font-family constants. Existing heading, paragraph, public-image, and
preview-image behavior remains unchanged.

No arbitrary CSS, dynamic user CSS variables, remote fonts, ThemeProvider,
React context, styling dependency, or separate theme request exists.

### Read-only Phase N boundary

Phase N has no production theme insert/update/delete operation and exposes no
theme or settings route. Integration fixtures write rows directly only to prove
read semantics. Phase O remains responsible for future authorized theme and
settings management UI.

---

## Error Reporting Baseline — Safe Server Failure Reporting

### Nested fail-closed boundaries

The Hono application continues to return exactly:

```json
{"error":"Internal server error."}
```

for propagated `Error` instances. It now also writes one structured
`unhandled_request_error` record to stderr with only timestamp, level, event,
HTTP method, pathname without query, and a bounded error type.

Pinned Hono 4.13.5 does not pass non-Error throws to `app.onError`. The exported
Bun server options therefore include an explicit outer `error` callback. It
records one `unhandled_server_error` with no request context and returns the
same generic JSON 500. The normal production export and the integrated
`development: true` listener share this callback.

### Redaction and sink policy

Neither boundary logs error messages, stacks, causes, query strings, headers,
cookies, request/response bodies, credentials, preview or invitation tokens,
session IDs, asset bytes, SQL, or physical paths. Error names survive only when
they match the bounded identifier rule; otherwise the type is `Error`.

The sink is one best-effort `console.error(JSON.stringify(record))` call.
Logging exceptions are suppressed so the client-safe response remains
authoritative. There is no logger interface, dependency, retry, file sink,
remote collector, telemetry endpoint, or route-level error logging.

### Executed boundary matrix

Focused application-composition tests prove:

```text
handled 404       → no request/server log → existing 404
propagated Error  → one request log       → generic JSON 500
escaped non-Error → one Bun server log    → generic JSON 500
```

The non-Error cases use real temporary Bun listeners in both normal and
development modes. Sensitive thrown/query values and contextual error output
are absent from responses and logs. Existing malformed persisted public/theme,
missing authorized file, and malformed draft integrations remain the
authoritative integrity-failure paths feeding Hono's global boundary.

This baseline reports server request failures only. Browser render-failure
fallbacks remain assigned to Phase P, and no client telemetry is authorized.

---

## Phase O — Theme and Site Settings UI

### One bounded owner-controlled resource

Phase O adds exactly:

```text
GET /tenants/:tenantId/sites/:siteId/settings
PUT /tenants/:tenantId/sites/:siteId/settings
```

Both routes require an authenticated tenant owner. PUT also retains the
existing trusted-origin mutation boundary. The strict resource contains the
existing site summary and the existing Phase N theme tokens; update input
contains only normalized site name plus light/dark and sans/serif selections.

Hostname remains read-only because domain identity belongs to the separate
`domains` relation. No hostname value is accepted in update input, and the
settings transaction never changes domain persistence.

### Existing persistence ownership and atomicity

`SitePersistence` resolves settings through tenant-scoped `sites`, the site's
required domain, and its optional current `themes` row. Absence remains distinct
from malformed storage: an absent row receives `DEFAULT_THEME_TOKENS` at the API
boundary, while unsupported persisted tokens fail strict response validation
through the existing generic HTTP 500 boundary.

One transaction updates `sites.name` and upserts the site's single theme row.
The first save creates that row and later saves update it, including an explicit
light/sans selection. PostgreSQL rollback coverage proves a rejected theme
write cannot leave the site-name write committed.

### Admin ownership and feedback

The owner-only `SiteSettings` component is keyed by tenant and site. It loads
and saves through the existing credentialed `requestApi` boundary, retains all
form state locally, disables editable controls during the one permitted
in-flight save, and reports failures with local alert semantics and progress or
success with local status semantics.

On success, `SitesPage` uses a functional state update that applies the returned
site only to the matching currently loaded tenant and existing site ID. This
updates the visible name without reloading the complete site list and prevents
a late result from crossing tenant-owned state.

### Verification and exclusions

Focused contract, admin, and PostgreSQL integration coverage verifies strict
request/response confinement, owner/member and trusted-origin behavior,
default read-without-write semantics, theme upsert, hostname preservation,
nondisclosing site scope, transactional rollback, malformed-theme failure, and
tenant-keyed parent-state protection.

Phase O adds no schema or migration, dependency, domain administration, custom
CSS, named themes, theme catalog/framework, live preview, toast system, global
state, React error boundary, or Phase P behavior.

---

## Phase P — UX Refinement

### Immutable ordering with native interaction

`@bher/editor` now owns `moveSection` and `moveBlock` as pure immutable
`PageDocument` transforms. Section moves preserve complete section values;
block moves preserve complete heading, paragraph, or image values and accept no
destination section, making cross-section relocation unavailable by design.

`PageEditor` uses one component-local drag descriptor with native HTML
drag-and-drop. `DataTransfer` receives only a fixed initiation marker and is
never document authority. Matching Move Up/Down buttons call the same domain
operations, providing keyboard and touch/mobile ordering without a drag library
or second reorder implementation.

All ordering flows through the existing local edit/revision path. Drag, drop,
and move controls never call the API or save automatically. The established
explicit `Save draft` request remains the sole persistence action, including
for reordered arrays.

### Contract-derived page-authoring validation

Page creation now prepares its normalized request and title/slug errors through
the existing shared request schema. Touched invalid fields receive connected
`aria-invalid` and `aria-describedby` feedback. The existing HTTP 409 remains
the only slug-conflict authority; other server failures stay form-level and no
server field-error payload was added.

Draft preparation parses the current document through `pageDocumentSchema` and
maps only current heading/paragraph text issue paths to existing block IDs.
Unmapped invalid content remains form-level. Invalid local content produces no
save request, preserves edits, and focuses the first mapped field where
practical. Generic server HTTP 400 remains form-level because it does not reveal
whether request shape or asset scope failed.

Image alternative text remains `z.string()`, including the empty decorative
case. The editor adds only associated explanatory guidance; it adds no blocking
rule or decorative-image state.

### Local React failure boundaries

The admin and public/preview application mounts each use their own small native
React class boundary. Generic fallbacks contain no exception, stack, session,
document, or preview-token detail. Separate local ownership avoids a shared
boundary package for two application roots.

The boundaries cover descendant React render/lifecycle failures only. They do
not claim event-handler, promise, API, server, pre-root, or global browser
coverage. No telemetry transport, window error listener, logger, toast system,
notification state, drag/drop dependency, validation framework, backend change,
schema change, or new theme writer was added.

### Verification

Focused editor tests cover immutable movement and identity-preserving no-ops.
Admin tests cover normalized creation input, isolated field errors, conflict
classification, mapped and unmapped draft validation, valid empty alt, save
request order, and existing edit-during-save and late-save protection. Full
type-check, unit, build, audit, runtime-smoke, scope, dependency, and manual
browser controls are recorded in the Phase P delivery report.

---

## Phase Q — Production Operations Lock

### External and process authority

Production server options now bind Bun to IPv4 loopback. nginx is the only
external HTTP boundary: the exact admin host serves the admin build and complete
API surface, while the default tenant server serves the public build and proxies
only health/public/preview paths with the actual Host preserved. Tenant hosts
receive direct nginx 404 responses for auth and tenant-administration paths.

The operator supplies certificate material covering every served hostname.
BeHR adds no ACME, DNS, renewal, or certificate state. nginx also owns the
POST-only login/register limit, HTTP-to-HTTPS redirect, frame restriction,
bounded common headers, and `$uri`-based query-redacted access log.

systemd runs the built API as `bhr-cms:bhr-cms`. The root-owned environment file
is read by systemd and injected into the process, so Bun needs no direct read
permission to deployment secrets. Native sandboxing makes the application tree
read-only and grants application writes only under the upload root. Runtime
stdout/stderr remains in journald.

### Deterministic deploy ownership

`deploy.sh` operates only on the already selected `/opt/bhr-cms` checkout. It
does not fetch, switch, reset, or bootstrap. Root preflight validates tracked
cleanliness, host tools, Bun version, production environment, filesystem and
TLS permissions, database connectivity/migration history, and admin-host
reservation before service mutation.

Frozen install, type-check, build, migration history, and DB connectivity run
before the maintenance window. The script installs and syntax-checks nginx and
systemd configuration, stops the API only for migration, verifies exact
loopback health, then reloads nginx and verifies TLS/SNI health. Failure is
reported by stage; there is no automatic database downgrade or rollback
manager.

### Coordinated backup

PostgreSQL and local asset originals cannot share a transaction, so
`backup.sh` requires a previously healthy service and stops the sole mutation
process during both captures. It uses libpq environment authority so database
credentials do not appear in command arguments. A finalized root-only archive
contains exactly `database.dump`, `assets.tar`, `manifest.txt`, and
`SHA256SUMS`. Failure after stop attempts service restart and preserves any
already finalized archive.

### Validated destructive restore

`restore.sh` requires `--confirm-restore`. Before service stop it rejects
unexpected/duplicate/non-regular outer members, invalid checksums or manifest,
unreadable database dumps, unsafe/special asset tar members, and paths outside
the canonical UUID/UUID storage shape. Asset extraction occurs in a restrictive
staging sibling, and Linux `st_dev` identity—not mountpoint text—proves that the
live and staged roots support same-filesystem rename.

PostgreSQL restore uses `pg_restore --single-transaction` before any asset
rename. Only after database success does the script rename live assets to
`uploads.pre-restore` and staging to live, migrate forward, start the service,
and verify health. The preserved tree is removed only after health succeeds.

Existing staging or pre-restore paths block deploy, backup, and restore. Those
paths are durable crash evidence; normal shell flags are not. After destructive
failure, the service remains stopped and all available trees remain for manual
operator recovery. No marker protocol, recovery journal, `renameat2` exchange,
or automatic reconciliation was added.

### Verification status boundary

Repository verification includes focused API binding, Bash syntax, ShellCheck,
type-check, unit, build, audit, migration-history, scope, dependency, and exact
CI gates. No separate `test-permissions.sh` or operations framework was added.

nginx syntax, systemd effective properties, real service identity/socket
exposure, TLS routing, rate limiting, log redaction, DAC/sandbox permissions,
and positive/negative backup/restore/deploy controls require a disposable Linux
VPS/VM. Until that distinct gate executes, repository implementation may pass
while production operational acceptance and Phase Q closure remain
inconclusive.
