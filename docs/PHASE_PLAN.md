BeHR CMS — Agentic Implementation Execution Brief

Version: 1.5
Execution Model: Phase-gated, deterministic, monolith-first
Deployment Target: Single VPS
Architecture Constraint: No distributed systems assumptions

────────

Global Execution Rules

These rules apply to every phase.

1. One phase at a time.
2. Do not implement future-phase behavior.
3. Do not create speculative abstractions.
4. Do not modify files outside the declared phase surface.
5. All schema and contract changes must be explicit.
6. All behavior must be testable.
7. All exits must be verifiable.
8. System must remain deployable on a single VPS.
9. Runtime behavior must remain request-driven and awaited. Do not introduce background workers, fire-and-forget operations, or distributed execution unless explicitly approved.
10. The system must remain monolithic with clean internal boundaries.
11. Unimplemented behavior must be documented. Do not represent it with future-work markers, fake readiness exports, stub functions, or speculative code.
12. Composition-root hygiene: Remove functions that only forward arguments, rename another call, or package already-available values unless they own distinct policy, validation, lifecycle, translation, reuse, or a necessary test seam.
13. Async UI identity: Any asynchronous UI state whose result belongs to a selectable resource must carry that resource’s authoritative ID. Late load or save completions must not update state belonging to a different current resource. Prefer functional/latest-state updates over mirrored refs or global state unless stronger coordination is actually required.
14. Cross-layer naming clarity: When similarly named operations exist at different boundaries, names must communicate the boundary when search, stack traces, or review would otherwise be ambiguous. Database mutations, HTTP requests, UI actions, and response translations must not use indistinguishable names when they perform materially different work.

────────

Phase Execution Order

A — Repository Spine
B — Environment and Persistence Bootstrap
C — Identity and Session Core
D — Tenant and Membership Core
E — Site Core
Decision Gate — Multi-user Identity and Membership (Phase F may proceed; must resolve before G)
F — Canonical Content Contracts
G — Page Persistence and Version Storage
H — Published Read Model and Public Renderer
I — Preview Surface
J — Publish Workflow
K — Editor Foundation
L — Asset Storage Core
M — Asset Integration
N — Theme Runtime Contract
O — Theme and Settings UI
P — UX Refinement
Q — Production Operations Lock

────────

Phase A — Repository Spine

Task

Initialize deterministic monorepo structure and build pipeline.

Objective

Establish a stable repository spine that builds successfully with status-only applications.

No business logic.

Guidelines

Must:

• Use Bun workspaces
• Support Bun 1.4.x
• Support TypeScript 7.0 or newer
• Maintain strict package boundaries
• Build all apps
• Provide CI skeleton
• Provide infra skeleton
• Provide a valid root index.html that documents the unimplemented landing experience

Must not:

• Implement auth
• Implement database schema
• Implement API behavior
• Implement content model

Files / Functions

Root

package.json
.bun-version
bunfig.toml
tsconfig.json
tsconfig.base.json
.gitignore
.env.example
index.html
README.md
docs/ARCHITECTURE.md
docs/PHASE_PLAN.md
docs/DOCUMENTATION.md

.github/workflows/ci.yml

Apps

apps/admin
apps/api
apps/web

Packages

packages/contracts
packages/db
packages/ui
packages/editor
packages/config

Infra

infra/nginx
infra/systemd
infra/scripts

Acceptance Criteria

All workspaces build.

bun install succeeds.
bun run typecheck succeeds using TypeScript 7.0.
bun run test succeeds.
bun run build succeeds.
API exposes GET /health.
Root index.html exists and describes the Phase A implementation status.

No business logic exists.
No fake readiness exports, stub functions, or future-work markers exist.

Output Format

Files created
Files modified
Commands executed
Verification results

────────

Phase B — Environment and Persistence Bootstrap

Task

Establish database connectivity and migration capability.

Objective

Create a functioning persistence layer without application tables.

Guidelines

Must:

• Configure PostgreSQL connection
• Configure migration tooling
• Validate environment variables
• Keep seed behavior deferred until a phase introduces real seedable tables

Must not:

• Create application domain tables
• Implement business logic
• Implement auth
• Create no-op seed behavior

Files / Functions

packages/db

client.ts
env.ts
check.ts
migrate.ts
drizzle.config.ts
migrations/

Root

.env.example

Acceptance Criteria

Database connection succeeds.

Migration validation succeeds.
Migration execution succeeds twice without pending work on the second run.

No application tables exist.

Seed behavior remains deferred until real seedable tables exist.

Output Format

Files created
Files modified
Commands executed
Migration status

────────

Phase C — Identity and Session Core

Task

Implement authentication and session resolution.

Objective

Establish secure user authentication.

Guidelines

Must:

• Implement the Better Auth identity, account, session, and verification tables
• Integrate Better Auth through the existing Bun SQL-backed Drizzle client
• Implement a one-time initial identity bootstrap command
• Implement login, logout, and authoritative session resolution
• Validate BETTER_AUTH_SECRET, BETTER_AUTH_URL, and ADMIN_ORIGIN
• Enforce a 12-character minimum password
• Enforce trusted origins on state-changing authentication requests
• Allow credentialed CORS only for the configured admin origin
• Implement typed authentication middleware
• Implement the minimal login and authenticated admin shell

Must not:

• Implement tenants
• Implement memberships
• Implement sites
• Implement RBAC roles
• Implement content
• Expose provider sign-up, password-reset, OAuth, MFA, or SSO user interfaces

Files / Functions

packages/db

schema/auth.ts
auth-persistence.ts

packages/contracts

auth.ts

apps/api

env.ts
bootstrap.ts
lib/auth.ts
lib/session.ts
middleware/auth.ts
routes/auth.ts
routes/index.ts

apps/admin

App.tsx
LoginPage.tsx
AuthGuard.tsx

Acceptance Criteria

User can authenticate.

Bootstrap creates the first identity once and refuses a second attempt.

Session resolves server-side.

Session responses include the database-backed expiry.

Unauthorized access is denied.

Logout invalidates the server session.

Expired and invalid sessions are rejected.

The admin app resolves session state, displays login when unauthenticated, and
displays only a minimal authenticated shell after login.

Only identity/authentication tables exist; no Phase D or later table exists.

Output Format

Files created
Files modified
Commands executed
Auth test results

────────

Phase D — Tenant and Membership Core

Task

Implement tenant ownership boundaries.

Objective

Establish multi-tenant isolation.

Guidelines

Must:

• Implement tenants table
• Implement memberships table
• Enforce tenant resolution
• Enforce membership validation

Must not:

• Implement sites
• Implement page content
• Implement rendering

Files / Functions

packages/db

schema/tenants.ts
schema/memberships.ts

apps/api

middleware/tenant.ts
routes/tenants.ts

Acceptance Criteria

Tenant context resolves correctly.

Cross-tenant access is denied.

Membership enforcement works.

Output Format

Files created
Files modified
Commands executed
Tenant isolation test results

────────

Phase E — Site Core

Task

Implement site ownership and domain mapping.

Objective

Allow tenants to create and manage sites.

Guidelines

Must:

• Implement sites table
• Implement domains table
• Implement site creation route
• Implement site listing route

Must not:

• Implement page editing
• Implement content model
• Implement publishing

Files / Functions

packages/db

schema/sites.ts
schema/domains.ts

apps/api

routes/sites.ts

apps/admin

SitesPage.tsx
SiteCreateForm.tsx

Acceptance Criteria

Authorized user can create site.

Unauthorized user cannot create site.

Site listing returns correct tenant sites.

Output Format

Files created
Files modified
Commands executed
Site tests

────────

Phase F — Canonical Content Contracts

Task

Define content schema and block system.

Objective

Establish deterministic content contract.

Guidelines

Must:

• Define PageDocument schema
• Define Section schema
• Define Block union
• Define Style token schema

Must not:

• Implement database tables
• Implement editor UI
• Implement renderer

Files / Functions

packages/contracts

page.ts
section.ts
block.ts
style.ts

Acceptance Criteria

Valid documents pass validation.

Invalid documents fail validation.

Document serialization round-trips correctly.

Output Format

Files created
Files modified
Commands executed
Validation results

────────

Decision Gate — Multi-user Identity and Membership

Purpose

Resolve the v1 operator model before page persistence and later admin workflows build on the current owner | member contract.

This is a product and sequencing gate, not an implementation phase by itself.

Phase F may complete independently. Phase G must not begin until this gate is explicitly resolved and all follow-up work required by the selected option is completed and verified.

Resolution

Resolved before Phase G.

Selected model: Option A — Multi-user tenants.

Approved onboarding mechanism: existing identities may be added directly by normalized email; missing identities are created only through owner-issued, one-time tenant invitations. The bounded membership-administration and invite-registration implementation is complete and verified. This gate is resolved and no longer blocks Phase G or later phases.

Decision Required

Choose exactly one v1 model.

Option A — Multi-user tenants

Retain the existing owner | member membership model.

Before membership administration can be implemented, explicitly decide how identity #2 and later identities come into existence. Phase C intentionally provides only a one-time bootstrap for the first identity and refuses a second bootstrap attempt.

Select one bounded identity-onboarding mechanism:

• Authenticated/admin-driven identity creation
• Controlled/public signup
• Invitation-based onboarding

Add existing user by email is not a complete identity-onboarding mechanism by itself. It is valid only when another approved path already creates that user’s BeHR identity.

After choosing the identity-onboarding mechanism, define a bounded membership-administration phase before Phase G. That phase may add only the identity-onboarding and membership-management surfaces required by the selected model.

Do not infer or implement invitations, signup, email delivery, token lifecycle, or user administration until the selected mechanism explicitly requires them.

Option B — Single-operator tenants

Declare that v1 supports one operational owner identity per tenant.

This option requires corrective rework; it is not a no-op.

Before Phase G, reconcile accepted Phase D and Phase E behavior so unreachable member capability does not remain as product behavior. Review and, where required, remove or revise:

• owner | member public contract
• Membership database enum or constraints
• Generated migration state
• Membership authorization tests
• Member-read and owner-create site behavior
• Documentation describing multi-user tenant behavior

Do not retain unreachable member behavior merely because it already exists in tests or direct database setup.

Decision Record

Record the chosen option and rationale in docs/DOCUMENTATION.md.

The decision record must state:

• Selected v1 operator model
• If multi-user: the approved mechanism that creates identity #2
• If multi-user: the bounded membership-administration phase that must execute before Phase G
• If single-operator: the corrective Phase D/E surface that must be reconciled before Phase G
• Explicitly deferred identity or membership capabilities

Exit Criteria

This gate is resolved only when:

• One option is selected explicitly.
• The rationale is documented.
• Required corrective or membership-administration work is scoped.
• Any work required before Phase G is complete and verified.
• No ambiguous or unreachable membership capability remains undocumented.

────────

Phase G — Page Persistence and Version Storage

Task

Implement page storage and versioning.

Objective

Store draft versions safely.

Guidelines

Must:

• Implement pages table
• Implement page_versions table
• Implement draft pointer behavior

Must not:

• Implement preview
• Implement publish
• Implement renderer

Files / Functions

packages/db

schema/pages.ts
schema/page_versions.ts

apps/api

routes/pages.ts

Acceptance Criteria

Saving page creates version.

Draft pointer updates correctly.

Version records are immutable.

Output Format

Files created
Files modified
Commands executed
Persistence tests

────────

Phase H — Published Read Model and Public Renderer

Task

Render published pages.

Objective

Serve public content safely.

Guidelines

Must:

• Add nullable pages.published_version_id referencing an immutable page_versions record
• Treat published_version_id as published read state, not publish workflow state
• Keep new pages unpublished until later publish behavior explicitly sets the published pointer
• Keep draft saves independent; they must not modify published_version_id
• Resolve public requests by authoritative hostname and page slug
• Resolve the public document only through pages.published_version_id
• Never fall back to pages.draft_version_id
• Never infer publication from the latest page version
• Validate stored published content against the canonical PageDocument
• Expose the minimum API and database read boundary required by the static public web application
• Render supported canonical blocks deterministically

Must not:

• Mutate pages.published_version_id through production application behavior
• Implement publish routes or publish controls
• Implement page_publications or publication event/history behavior
• Implement preview behavior or preview tokens
• Fall back to draft content
• Implement editor behavior

Test Fixture Boundary

Phase H integration tests may set pages.published_version_id directly through test-only database fixture setup to establish known published read state. This is not production publishing behavior.

Do not create a production publishPage, setPublishedVersion, advancePublishedPointer, or markPublished helper in Phase H.

Files / Functions

packages/contracts

page.ts

packages/db

schema/pages.ts
public-page-persistence.ts
migrations/

apps/api

routes/public.ts

apps/web

router.ts
renderer.ts
main.tsx

Authority Flow

HTTP Host
    ↓
domains.hostname
    ↓
site
    ↓
page slug
    ↓
pages.published_version_id
    ↓
page_versions
    ↓
canonical PageDocument
    ↓
deterministic renderer

Only pages.published_version_id authorizes public content. apps/web must use the public HTTP read boundary and must not access PostgreSQL directly. Phase H adds no second backend service.

Acceptance Criteria

Published page renders correctly.

Draft content is not accessible.

Rendering is deterministic.

Output Format

Files created
Files modified
Commands executed
Renderer tests

────────

Phase I — Preview Surface

Task

Implement preview capability.

Objective

Allow safe draft viewing.

Guidelines

Must:

• Treat preview tokens as bearer authorization credentials, separate from authentication sessions and membership invitations
• Generate 256 bits of cryptographically secure random material in a URL-safe representation
• Store only SHA-256 token digests and never persist or log the raw token
• Return the raw token only in the successful authenticated issuance response
• Use a 15-minute lifetime and enforce expiry synchronously during preview reads
• Allow token reuse during its lifetime so browser reloads continue to work
• Maintain at most one current preview-token row per page through a database-authoritative uniqueness constraint
• Rotate the credential atomically when a new token is issued for the same page, invalidating the previous raw token
• Bind each token to the immutable draft version current at issuance
• Keep an existing token bound to that immutable snapshot when a newer draft is saved
• Implement preview_tokens with UUID identity, page and version foreign keys, globally unique token hash, expiry, and timezone-aware creation timestamp
• Cascade page deletion to its preview token and allow bound-version deletion to remove the token
• Prove during preview resolution that the token page, requested page, and immutable version all belong to the same page
• Provide authenticated, trusted-origin token issuance at POST /tenants/:tenantId/sites/:siteId/pages/:pageId/preview-tokens
• Permit both owner and member content collaborators to issue a token for an authoritatively accessible tenant/site/page scope
• Require no issuance request body unless implementation evidence establishes a concrete need
• Return only the raw token and ISO expiration metadata from issuance
• Provide one unauthenticated bearer read at GET /preview/page?slug=<slug>
• Transport the raw preview credential only through the dedicated X-BeHR-Preview-Token request header
• Resolve preview authority from actual HTTP Host, validated slug, unexpired token digest, page binding, and same-page immutable version
• Validate previewed content against the canonical PageDocument before a successful response
• Return one nondisclosing HTTP 404 for missing, malformed, unknown, expired, rotated, wrong-host, wrong-slug, cross-page, or deleted preview authority
• Reuse the existing Phase H PageRenderer for canonical preview output
• Support a browser fragment equivalent to #preview=<token>; send the token to the API header, never the API URL
• Preserve the existing public read flow when no preview fragment exists
• Fail a malformed or rejected preview request without silently falling back to published content
• Enforce preview-token expiry at request time without background cleanup infrastructure

Must not:

• Mutate pages.published_version_id
• Implement publish authorization, publish routes, page_publications, publication events, or draft promotion
• Delete immutable page versions
• Follow the moving pages.draft_version_id after token issuance
• Accept preview tokens from a query parameter, request body, cookie, hostname, slug, or Authorization header
• Treat a token as tenant, site, page, or version authority independently of Host and slug
• Fall back to another draft version or published content after preview failure
• Expose token hashes, version IDs, draft or published pointers, tenant/site identity, user identity, or membership state
• Implement preview buttons, editor controls, autosave, page-edit forms, panels, or other Phase K UI
• Duplicate the Phase H renderer or add API-side HTML rendering
• Introduce a generic token framework, repository layer, service container, authorization framework, worker, queue, cron job, or fire-and-forget cleanup

Credential Flow

authenticated content collaborator
    ↓
issue short-lived preview credential
    ↓
credential binds one immutable draft version
    ↓
bearer preview request
    ↓
Host + slug + valid token
    ↓
same-page immutable version
    ↓
canonical PageDocument
    ↓
existing Phase H renderer

Preview Token Persistence

preview_tokens contains only:

id
page_id
version_id
token_hash
expires_at
created_at

The table must enforce a globally unique token hash and one current row per page. It must not duplicate tenant ID, site ID, hostname, slug, or raw token. Those relationships remain derived through authoritative ancestry.

Issuance Semantics

Reissuing a token for one page must resolve the current scoped page and immutable draft version, generate a new credential, atomically replace the existing row, bind the replacement to that current version, and invalidate the previous credential. A focused preview-token credential helper may own this concrete policy; do not generalize it into a reusable token framework.

Preview Read Authority

HTTP Host
    ↓
domain
    ↓
site
    ↓
page slug
    ↓
preview token for that page
    ↓
unexpired digest match
    ↓
bound same-page immutable version
    ↓
canonical PageDocument

Preview resolution must prove:

page_versions.id = preview_tokens.version_id
AND page_versions.page_id = preview_tokens.page_id
AND preview_tokens.page_id = pages.id

A cross-page token/version relationship must fail closed without triggers, composite circular foreign keys, or repair behavior.

Browser Semantics

No preview fragment uses the existing Phase H public read. A valid #preview=<token> fragment uses the preview read and sends the token in X-BeHR-Preview-Token. A malformed fragment or failed preview request must enter the bounded not-found/unavailable state and must not display published content as though preview succeeded. Unrelated fragments need not become preview state.

Files / Functions

packages/contracts

preview.ts
index.ts

packages/db

schema/preview-tokens.ts
preview-persistence.ts
migrations/
index.ts

apps/api

lib/preview-token.ts
routes/preview.ts
routes/pages.ts
routes/index.ts
application.ts

apps/web

src/main.tsx
src/router.ts
focused preview/router tests as required

Also permitted:

• Focused integration and unit tests
• Package script and CI gate wiring
• docs/ARCHITECTURE.md
• docs/DOCUMENTATION.md

No new dependency is expected. apps/web must continue using its accepted @bher/contracts workspace dependency.

Acceptance Criteria

1. Authenticated owner can issue a preview token for an accessible page.
2. Authenticated member can issue a preview token for an accessible page.
3. Outsider or inaccessible scope cannot issue one.
4. Issuance requires trusted origin.
5. Raw token is returned once and never stored.
6. Database stores only the token hash.
7. Token lifetime is bounded to 15 minutes and expiry is enforced.
8. One page has at most one current preview token.
9. Reissue rotates and invalidates the previous credential.
10. Token binds the immutable draft version current at issuance.
11. Saving a newer draft does not change what an existing token renders.
12. Reissuing after a new draft binds the replacement token to that newer version.
13. Valid bearer token renders its bound draft through the existing renderer.
14. Missing, invalid, expired, or rotated token is rejected with nondisclosing HTTP 404.
15. Wrong Host or slug is rejected.
16. Cross-page version binding fails closed.
17. Malformed persisted preview content fails closed with generic HTTP 500.
18. Preview API requires no authenticated session when a valid bearer token is supplied.
19. Existing Phase H public routes remain unchanged, including draft-only public HTTP 404 behavior.
20. Published pointer remains unchanged by issuance and preview reads.
21. No Phase J or editor behavior exists.

Required Negative Controls

• Issue token T1 for draft A, save draft B, prove T1 still renders A, reissue T2, prove T1 returns 404 and T2 renders B
• Observe pages.published_version_id before and after issuance and reads and prove it is unchanged
• Create a test-only cross-page token/version mismatch and prove preview returns 404
• Move a test token expiry into the past and prove preview returns 404
• Inspect the token row and prove token_hash differs from the raw token and no raw-token column exists
• Send ?token=<valid token> without X-BeHR-Preview-Token and prove the request remains not found

Malformed persisted preview content must return the generic HTTP 500 response without Zod details, malformed JSON, repair, another draft, or published fallback.

Output Format

Files created
Files modified
Commands executed
Preview lifecycle and security tests

────────

Phase J — Publish Workflow

Task

Implement publish behavior.

Objective

Switch public content safely.

Guidelines

Must:

• Authorize only an authenticated tenant owner to publish in v1
• Return HTTP 403 when an authenticated member with valid tenant access attempts publication
• Preserve nondisclosing resource behavior for outsider or inaccessible tenant/site/page scope
• Expose exactly POST /tenants/:tenantId/sites/:siteId/pages/:pageId/publish
• Require authentication, tenant membership, owner role, valid site/page IDs, and trusted origin
• Require no publish request body
• Select only the page's authoritative current immutable draft version
• Accept no caller-selected version, draft pointer, published pointer, or actor identity
• Prove tenant → site → page → current draft → same-page immutable version ancestry
• Validate the selected immutable PageDocument canonically before publication
• Conditionally commit only the exact validated candidate while it remains the current draft
• Reject a stale validated candidate with HTTP 409 and no pointer or history mutation
• Treat publication of an already-public current draft as an idempotent successful no-op
• Prevent concurrent duplicate publication attempts from recording duplicate transition events
• Perform the first production application mutation of pages.published_version_id
• Update the published pointer and insert one page_publications transition event atomically
• Record the authoritative authenticated session user as the publisher
• Preserve the draft pointer and all immutable page versions
• Make the newly published version immediately visible through the existing Phase H public read
• Preserve Phase I preview-token binding, rotation, and expiry behavior

Must not:

• Permit a member to publish
• Add a publisher role, permission table, generic RBAC framework, per-page ACL, or approval workflow
• Accept versionId, draftVersionId, publishedVersionId, userId, actorId, or publishedByUserId as request authority
• Publish a stale candidate after the draft pointer advances
• Silently substitute an unvalidated newer draft for the validated candidate
• Modify pages.draft_version_id
• Update or delete page_versions
• Update or delete page_publications through normal production operations
• Create duplicate history for an idempotent or concurrent duplicate request
• Mutate, rotate, delete, rebind, or extend preview credentials
• Modify Phase H public rendering or Phase I preview authorization
• Implement editor UI, publish controls, autosave, or other Phase K behavior
• Introduce a workflow engine, event bus, queue, outbox, worker, generic transaction manager, repository class, or idempotency service

Phase H represents and reads what is published. Phase J changes what is published and records that change.

Publication Authority

authenticated tenant owner
    ↓
authoritative tenant/site/page scope
    ↓
current same-page immutable draft
    ↓
canonical PageDocument validation
    ↓
conditional atomic publication transition
    ├── pages.published_version_id
    └── append-only page_publications event
    ↓
existing Phase H public read

Publish Authorization Policy

In v1, owner may publish and member may not publish. Members remain content collaborators for drafting and preview, while publication changes externally visible production state. No separate publisher role exists.

Version Selection

The only publication candidate is pages.draft_version_id resolved through the authoritative tenant/site/page path and joined to a page_versions row belonging to that same page. The request cannot select a historical version or provide a version identifier through body, query, or headers.

Candidate Validation and Consistency

Publication uses a bounded resolve/validate/commit sequence:

resolve current candidate A
    ↓
validate A with pageDocumentSchema
    ↓
conditionally commit A

The commit may succeed only if the authoritatively scoped page still has pages.draft_version_id = A and A still belongs to that page. It must receive the exact validated candidate ID and must not reread and substitute another draft.

If the draft advances from A to B between candidate resolution and commit, publication of A is stale. The result is HTTP 409, draft remains B, published state remains unchanged, and no publication event is inserted. Retrying resolves and validates B.

Concurrent duplicate publication of the same unchanged candidate is distinct from stale-candidate rejection. At most one request may perform the actual transition and insert an event. Another request may resolve as unchanged once it observes that the same candidate is already public.

Idempotency

If draft_version_id already equals published_version_id, return status unchanged. Do not update pointers, create versions, or insert another history event. page_publications records actual public-state transitions rather than publish requests.

Publication History

page_publications contains only:

id
page_id
version_id
published_by_user_id
published_at

id is a database-generated UUID. page_id and version_id are required foreign keys. published_by_user_id is required text referencing the existing Better Auth user ID without cascading history merely because identity relationships change. published_at is a timezone-aware timestamp defaulting to the database current time.

Do not duplicate tenant ID, site ID, hostname, slug, role, draft/published pointers, or document content. Production code may insert transition events but exposes no event update or delete operation.

Same-Page Integrity

The publication transition must prove page_versions.page_id = pages.id for the validated candidate. A foreign key proving version existence alone is insufficient. Page A must never point to or record an event for Page B's version.

Atomic Transition

A real state change commits both or neither:

pages.published_version_id = validated current draft version
AND one page_publications row for the same page/version/actor

If pointer mutation or event insertion fails, both roll back. There must be no updated public pointer without history and no history event without matching public state.

Publisher Authority

published_by_user_id comes only from authenticatedSession.user.id. Do not accept actor identity from the request and do not duplicate email or display name in history.

Response Contract

Return one strict response:

{ status: "published" | "unchanged" }

published means one public-state transition and event committed. unchanged means the current draft was already public and no event was inserted. Do not expose version IDs, pointers, actor identity, history rows, or resource ownership metadata.

Malformed Candidate

Malformed persisted current-draft content fails through the generic HTTP 500 boundary. The published pointer and event count remain unchanged; content and Zod details are not returned, repaired, or replaced by another version.

Public, Draft, and Preview Isolation

After a successful transition, the existing GET /public/page immediately reads the new pointer. Publishing leaves draft_version_id unchanged. A later draft save advances only the draft and does not auto-publish. Existing preview tokens remain bound to their own immutable versions and are neither rotated nor extended by publication.

Files / Functions

packages/contracts

publish.ts
index.ts

packages/db

schema/page-publications.ts
publish-persistence.ts
migrations/
index.ts

apps/api

routes/pages.ts
routes/publish.ts
routes/index.ts
application.ts

Also permitted:

• Focused unit and integration tests
• Package script and CI gate updates
• docs/ARCHITECTURE.md
• docs/DOCUMENTATION.md

Existing PagePersistence may be consumed to resolve and validate the candidate without rewriting Phase G persistence. No dependency change is expected.

Page Route Ownership

Mount POST /:pageId/publish through the existing createPageRoutes surface so publication reuses its authentication, membership, site/page-ID, and trusted-origin policy chain. routes/publish.ts may own publish-specific authorization, handling, and translation only when those responsibilities justify a separate module. Do not create another router or forwarding-only file merely because an earlier stub named it.

Composition

Preserve createApiApplication → createHttpApplication → createApiRoutes. Compose one focused PublishPersistence through that hierarchy. Do not add a publication application root, service container, or generic workflow layer.

Publish Persistence Boundary

One focused publication boundary may expose resolvePublishCandidate and commitPublication when required to validate outside the database package while preventing stale publication.

resolvePublishCandidate proves tenant/site/page/current draft/same-page version ancestry and returns the immutable candidate content.

commitPublication receives the exact validated candidate ID and authoritative actor ID and transactionally distinguishes:

published — candidate remains current, public state changed, one event inserted
unchanged — candidate remains current and is already public, no event inserted
stale — current draft no longer equals candidate, no mutation or event
not-found — authoritative tenant/site/page/candidate relationship cannot be proven

These outcomes are bounded publication semantics, not a generic state machine.

HTTP Semantics

Unauthenticated requests return 401. Authenticated members with valid tenant access return bounded HTTP 403. Invalid or inaccessible scope retains nondisclosing resource behavior. Stale candidates return bounded HTTP 409 without IDs or pointer details. Malformed candidates return generic HTTP 500.

Trusted Origin

Use the existing createRequireTrustedOrigin(auth) policy. Missing or untrusted origin must change neither pointer nor history.

Acceptance Criteria

1. Authenticated owner can publish an accessible page.
2. Authenticated member receives HTTP 403 and cannot publish.
3. Outsider or inaccessible scope cannot publish.
4. Trusted origin is required.
5. Current same-page immutable draft is the only publication candidate.
6. Caller cannot select arbitrary version or publisher identity.
7. Candidate content is canonically validated before publication.
8. Initial publish sets published_version_id.
9. Initial publish records exactly one publication event.
10. Event records page, version, authoritative actor, and timestamp.
11. Pointer update and event insertion are atomic.
12. Existing immutable versions remain unchanged.
13. Draft pointer remains unchanged.
14. Existing public route renders the newly published version.
15. Saving a later draft does not change public content.
16. Publishing the later draft switches public content.
17. Repeating publish without a draft change returns unchanged.
18. Idempotent no-op creates no duplicate history.
19. Stale validated candidate A is rejected with HTTP 409 if the draft advances to B; pointer and event count remain unchanged until a retry selects and validates B.
20. Two concurrent owner requests for the same unchanged candidate create at most one transition event.
21. Malformed persisted draft cannot become published.
22. Preview-token lifecycle remains unchanged.
23. No Phase K editor UI exists.

Required Negative Controls

• Member publish returns 403 with unchanged pointer and event count
• Missing trusted origin returns 403 with unchanged pointer and event count
• Body/query version and actor fields cannot select another version or impersonate another publisher
• Initial publish transitions null → A, records one authoritative event, and makes public GET return A
• Saving B leaves published A and public GET A until explicit publication
• Publishing B transitions A → B, records one event, and public GET returns B
• Repeating B returns unchanged with no event-count change
• Deterministically resolve and validate A, advance draft to B through normal save, then commit A through production persistence and prove stale; HTTP translation is 409 with no pointer/event mutation
• Independently exercise two concurrent owner attempts for the same candidate and prove one transition and one event
• Corrupt the current draft in test setup and prove HTTP 500, unchanged pointer/event count, and unrepaired content
• Construct event-insertion failure in test-only conditions where practical and prove pointer rollback without production failure hooks
• Inspect each real transition event directly for page, same-page version, authenticated actor, timestamp, and exact event-count delta

Stale-candidate consistency and concurrent duplicate publication are separate contracts and require independent evidence.

Output Format

Files created
Files modified
Commands executed
Publication authorization, consistency, transaction, and history tests

────────

Phase K — Editor Foundation

Task

Implement basic page editor.

Objective

Allow structured page authoring.

Guidelines

Must:

• Add/remove sections
• Add/remove blocks
• Edit block properties
• Save draft
• Key asynchronous page load and save state by page ID. A completion belonging to page A must never mutate page B’s visible editor state.

Must not:

• Implement drag-and-drop
• Implement autosave

Files / Functions

apps/admin

PageList.tsx
PageEditor.tsx

Acceptance Criteria

User can create valid page.

Document validates successfully.

Saved document persists.

Output Format

Files created
Files modified
Commands executed
Editor tests

────────

Phase L — Asset Storage Core

Task

Implement file storage system.

Objective

Store assets reliably.

Guidelines

Must:

• Implement upload endpoint
• Store files on disk
• Record metadata

Must not:

• Implement editor asset picker
• Implement image processing pipeline

Files / Functions

packages/db

schema/assets.ts

apps/api

routes/assets.ts

Acceptance Criteria

File uploads succeed.

File metadata recorded.

Files persist on disk.

Output Format

Files created
Files modified
Commands executed
Upload tests

────────

Phase M — Asset Integration

Task

Integrate assets into content.

Objective

Allow blocks to reference assets.

Guidelines

Must:

• Implement asset picker
• Record asset usage
• Render asset-backed blocks

Must not:

• Implement media pipelines

Acceptance Criteria

Asset references persist.

Renderer displays asset correctly.

Asset usage recorded.

────────

Phase N — Theme Runtime Contract

Task

Implement theme token system.

Objective

Control site appearance via tokens.

Guidelines

Must:

• Implement themes table
• Resolve active theme
• Apply tokens in renderer

Must not:

• Implement theme editor UI

Acceptance Criteria

Theme changes affect rendering.

Tokens apply consistently.

────────

Phase O — Theme and Settings UI

Task

Implement theme and settings management.

Objective

Expose controlled customization.

Guidelines

Must:

• Implement theme selection
• Implement site settings editor

Must not:

• Allow arbitrary CSS injection

Acceptance Criteria

User can change theme.

Renderer reflects theme.

────────

Phase P — UX Refinement

Task

Improve usability.

Objective

Enhance workflow efficiency.

Guidelines

Must:

• Improve validation UX
• Add optional drag-and-drop

Must not:

• Change persistence model
• Change content contract

Acceptance Criteria

UX improvements function correctly.

No schema changes occur.

────────

Phase Q — Production Operations Lock

Task

Finalize operational readiness.

Objective

Make system deployable and recoverable.

Guidelines

Must:

• Implement backup script
• Implement restore script
• Integrate the existing health endpoint with deployment monitoring
• Configure nginx
• Configure systemd

Must not:

• Introduce new runtime behavior

Files / Functions

infra/scripts

backup.sh
restore.sh
deploy.sh

infra/nginx

bhr-cms.conf

infra/systemd

bhr-api.service

Acceptance Criteria

Deployment succeeds.

Backup executes successfully.

Restore executes successfully.

Health endpoint responds.

────────

Final Agent Execution Directive

The agent must stop after completing the assigned phase.

The agent must not:

• Implement future-phase behavior
• Modify unrelated files
• Introduce architecture changes
• Expand scope beyond the defined phase

Each phase must be verified before the next begins.

Any explicit decision gate must be resolved before the dependent phase identified by that gate begins.

This preserves the monolithic architecture, deterministic content contracts, and single-VPS operational model defined for the system.
