BeHR CMS — Agentic Implementation Execution Brief

Version: 1.7
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

• Reuse the existing Phase G page list, creation, draft-read, and draft-save APIs without backend changes
• Permit both owner and member content collaborators to create, edit, and save pages
• Extend the admin workflow through selected tenant → selected site → page list → selected page → page editor
• Allow one accessible site to be selected within the current tenant
• Clear page selection and visible editor authority when tenant or site selection changes
• Load page lists using state keyed by authoritative tenantId and siteId
• Create pages with shared title/slug validation and the canonical empty PageDocument
• Select a newly created page only while its initiating tenant/site identity remains current
• Keep title and slug read-only after page creation
• Load one current draft using tenantId, siteId, pageId, and a bounded request-generation identity
• Reject late page-list, page-load, creation, and save completions that belong to obsolete selections or request epochs
• Add/remove sections using immutable editor-domain transformations
• Add/remove only canonical heading and paragraph blocks
• Edit heading and paragraph text
• Edit heading level 1 through 6
• Edit or clear bounded left/center/right text alignment
• Preserve existing section styles and untouched canonical values
• Validate local content with pageDocumentSchema before manual save
• Block invalid local content from reaching the API while preserving local edits
• Allow editing during an in-flight save without an older save response replacing newer local content
• Permit only one save request in flight per editor instance
• Persist manual saves through the existing immutable page-version route
• Activate packages/editor as the framework-free owner of pure PageDocument transformations
• Generate new section/block UUIDs in UI code and pass them explicitly to deterministic transformations

Must not:

• Implement drag-and-drop
• Implement autosave
• Add page metadata editing, rename/slug routes, or fake local metadata mutation
• Add editor-specific API routes, database tables, or mutable document storage
• Change immutable page-version behavior
• Make editor access owner-only or add an editor role/permission framework
• Implement section or block reordering
• Add publish controls, publication state/history UI, or rollback UI
• Add preview issuance, sharing, iframe, or preview-panel UI
• Add asset upload/picker, image/file blocks, or media behavior
• Add React Router, a global store, context solely for editor state, reducer framework, form library, drag/drop library, editor framework, or DOM-testing dependency
• Add autosave queues, debounce scheduling, optimistic synchronization, or save coordination frameworks
• Store sessions, drafts, or credentials in Web Storage
• Add unsaved-navigation guards, beforeunload interception, confirmation modals, or navigation blockers

Admin Workspace

selected tenant
    ↓
selected site
    ↓
PageList
    ↓
selected page ID
    ↓
PageEditor

SitesPage evolves from display-only site rows into the bounded tenant/site/page workspace. Ordinary component state owns selection; no routing or global navigation abstraction is introduced.

Existing Backend Authority

Phase K consumes only:

GET  /tenants/:tenantId/sites/:siteId/pages
POST /tenants/:tenantId/sites/:siteId/pages
GET  /tenants/:tenantId/sites/:siteId/pages/:pageId
POST /tenants/:tenantId/sites/:siteId/pages/:pageId/versions

No Phase K file under apps/api or packages/db is expected to change. If implementation evidence requires a backend change, stop and report the discrepancy rather than widening the phase.

Editing Authorization

Owner and member may both create, edit, and save pages. Publication remains separately owner-only under Phase J. Do not add a publisher or editor role.

Site and Page Selection

PageList receives authoritative tenantId and siteId from its parent. Selecting a new tenant clears or replaces the selected site with one from that tenant and clears page/editor selection. Selecting a new site clears page/editor selection immediately. A previous page list or editor document must never remain authoritative beneath a new tenant/site selection.

Page List State

Page-list states are bounded equivalents of:

idle
loading { tenantId, siteId }
loaded  { tenantId, siteId, pages }
error   { tenantId, siteId }

Responses and creation completions may update only a state whose tenant/site identity still matches the initiating request. Use functional/latest-state updates or an equivalent direct identity guard; do not reason from stale captured selection.

Page Creation

Creation validates with existing shared contracts and sends:

title
slug
document = { schemaVersion: 1, sections: [] }

Do not fabricate starter content. A matching successful result appends to the current site's list and becomes selected. A late result from another tenant/site is ignored. Conflicts/errors append and select nothing.

Page Metadata

Title and slug may be displayed but are read-only after creation. Phase K adds no metadata mutation API or local imitation of one.

Page Editor State

PageEditor receives tenantId, siteId, and pageId. Its loaded state carries that authoritative identity, the local PageDocument, and a bounded request epoch. Loading a different page immediately makes previous content non-authoritative.

Every page-load completion must match the current page and current request epoch. In the A → B → A sequence, the first A request cannot overwrite the later A request merely because page IDs match.

Manual Save

Save draft validates the current local document with pageDocumentSchema before sending. Invalid content remains local and displays a concise bounded error without exposing Zod issue structures.

The save request captures the document snapshot current when Save is invoked. While it is in flight, Save is disabled but editing remains available. Completion may update only save-status metadata for the same current page/request epoch and must not replace the local document, so edits made after Save remain intact.

Late save completion for an obsolete page or prior re-entry epoch cannot mark the current editor saved/failed, replace its document, or clear its validation state.

Save states remain bounded equivalents of idle, saving, saved, and error. Do not create a global notification or save-state service.

Unsaved Navigation

Selecting another page, site, or tenant may discard unsaved local edits in Phase K. This limitation is explicit. No navigation guard or confirmation behavior is implemented.

Editor Package Ownership

packages/editor is framework-free and owns pure immutable PageDocument transformations. It must not import React, perform HTTP, resolve authentication or resources, manage save state, access browser storage, or access the database.

Editor Domain Flow

PageEditor
    ↓
@bher/editor pure transformations
    ↓
PageDocument

HTTP Flow

PageList/PageEditor
    ↓
existing requestApi
    ↓
existing Phase G routes

Editor Transformations

Expose focused immutable operations equivalent to:

createEmptyPageDocument
addSection / removeSection
addHeadingBlock / addParagraphBlock / removeBlock
updateBlockText
updateHeadingLevel
updateTextAlignment

Do not add a generic reducer, arbitrary patch API, command bus, operation registry, plugin framework, or undo/redo system.

New IDs are supplied by the UI. Adding a section appends `{ id, blocks: [] }`. Adding a heading appends a valid level-2 `New heading`; adding a paragraph appends `New paragraph`. Removing a target preserves remaining order and does not automatically remove empty sections.

Heading controls edit text, level, and optional alignment. Paragraph controls edit text and optional alignment. Existing spacing/width section styles are preserved without Phase K design controls. Empty local block text may temporarily be invalid, but cannot be saved.

Transformations do not mutate input documents or nested arrays/objects. Changed operations return new document identity and preserve untouched values/order. Missing targets consistently return the unchanged document.

No Reordering

New sections and blocks append in stored order. Phase K includes no drag/drop, sorting, or up/down controls.

Dependency Edges

Phase K adds only:

@bher/editor → @bher/contracts at workspace:0.1.0
@bher/admin  → @bher/editor at workspace:0.1.0

These are the first required runtime edges for the editor foundation. Bun lockfile changes are limited to workspace metadata. No external dependency or package-version change is expected; stop if Bun produces unrelated resolution churn.

Files / Functions

packages/editor

package.json
src/index.ts
focused editor-domain source files
focused tests

apps/admin

package.json
src/App.tsx as needed
src/SitesPage.tsx
src/PageList.tsx
src/PageEditor.tsx
optional src/PageCreateForm.tsx only if it owns a clear component boundary
src/lib/api.ts only if directly required
focused tests

Root/support

package.json
bun.lock
.github/workflows/ci.yml only if test wiring requires it
docs/ARCHITECTURE.md
docs/DOCUMENTATION.md

No backend application or database file belongs to Phase K.

Acceptance Criteria

1. Owner can select an accessible site and list its pages.
2. Member can select an accessible site and list its pages.
3. Page-list async state is scoped to tenant/site identity.
4. User can create a page with valid title, slug, and canonical empty document.
5. Late creation completion cannot mutate another selected site.
6. User can select a page and load its current draft.
7. Late page-load completion cannot replace another selected page.
8. Same-page re-entry rejects obsolete load completions.
9. User can add/remove sections.
10. User can add/remove heading and paragraph blocks.
11. User can edit block text.
12. User can edit heading level.
13. User can edit or clear bounded text alignment.
14. Existing section styles survive editor operations.
15. No drag/drop or reordering exists.
16. Save validates the canonical document before request.
17. Invalid local content cannot be saved.
18. Manual save persists a new immutable draft version through the existing API.
19. Editing during an in-flight save is not overwritten by the older response.
20. Late save completion cannot mutate another page's visible state.
21. Only one save request is in flight per editor instance.
22. Reloading after save returns the persisted document.
23. Page title and slug remain read-only after creation.
24. No autosave exists.
25. No publish or preview UI exists.
26. No backend/editor-specific API or schema is added.
27. packages/editor remains framework-free and pure.
28. Only the approved workspace dependency edges are added.
29. Phase L remains unstarted.

Required Negative Controls

• Begin a page-list load for tenant/site A, switch to B, complete A, and prove B state is unchanged
• Begin creation for site A, switch site/tenant, complete A, and prove no append or selection in the current site
• Begin page A load, select B, complete A, and prove A content is not visible
• Execute A1 → B → A2, complete A1, and prove the newer A2/current state is not replaced
• Save A, select B, complete A save, and prove B document/save state is unchanged
• Save snapshot 1, edit locally to snapshot 2, complete save, and prove local snapshot 2 remains
• Clear required block text and prove no save request is issued
• Audit Phase K changes and prove no apps/api or packages/db modification
• Audit feature scope and prove no autosave, reordering, publish/preview UI, assets, Web Storage, or new router/store/reducer framework

Output Format

Files created
Files modified
Commands executed
Editor-domain, admin async-identity, creation, and manual-save tests

────────

Phase L — Asset Storage Core

Task

Implement file storage system.

Objective

Store assets reliably.

Ownership Correction

High — Phase L asset-storage ownership and phase-surface gap: Version 1.6 required persistent uploads across PostgreSQL and the local filesystem but declared only one schema and one route file, with no asset scope, upload-security policy, storage-root ownership, metadata contract, or cross-store consistency semantics. Version 1.7 defines a bounded site-scoped storage core without pulling Phase M asset integration forward.

This correction does not reopen Phase K. Phase K remains complete, and Phase M remains unstarted.

Authority Flow

authenticated tenant member
        ↓
authoritative tenant/site scope
        ↓
bounded multipart upload
        ↓
system-generated asset identity/storage key
        ↓
local filesystem original
        ↓
PostgreSQL asset metadata

Asset Ownership

Assets are site-scoped.

Authority follows:

tenant
  ↓
site
  ↓
asset

The site UUID is the asset ownership relationship. Tenant ancestry must be proven through sites.tenant_id.

Do not make assets globally unscoped, page-owned, user-owned, or tenant-owned independently of sites.

Do not duplicate tenant ownership on the asset row.

Phase M may later record which pages or blocks reference a site asset.

Upload Authorization

Both existing content-collaborator roles may upload:

owner  → allowed
member → allowed

This matches the existing page-authoring authority.

Do not add an asset role, media-manager role, permission table, or per-asset ACL.

Upload Route

Phase L owns exactly:

POST /tenants/:tenantId/sites/:siteId/assets

The route requires:

• Authenticated session
• Tenant membership
• Valid site ID
• Authoritative proof that the site belongs to the tenant
• Trusted origin
• Bounded request body
• multipart/form-data

Do not add another upload route.

No Asset Read, List, Delete, or Public Delivery

Phase L does not expose:

GET /assets
GET /assets/:id
DELETE /assets/:id
PUT /assets/:id
PATCH /assets/:id

Phase L does not expose a public file-serving route or public URL.

Do not mount the upload root as static files, return a file URL or physical path, add nginx rules, add /public/assets/*, or modify the public renderer.

Stored bytes remain outside public HTTP authority.

Upload Transport

Use multipart/form-data with exactly one field named file.

Requirements:

• Exactly one file entry
• The entry must be a File
• No additional multipart fields
• No duplicate file parts

Malformed multipart, a missing file, a duplicate file, a non-File file field, or any extra field returns HTTP 400.

Do not accept filesystem path strings, base64 JSON payloads, remote URLs, client-selected asset IDs, or caller-selected storage keys.

File and Request Size Policy

The v1 maximum original asset size is:

10 MiB
10 × 1024 × 1024
10,485,760 bytes

Valid files contain 1 byte through 10 MiB inclusive.

Empty files return HTTP 400.

Files larger than 10 MiB return HTTP 413.

Protect multipart parsing with Hono's existing body-limit capability. The total upload request-body ceiling is 11 MiB, allowing bounded multipart framing overhead while preventing unbounded buffering before the file-size rule is evaluated.

Apply the 11 MiB body limit only to the upload route or asset route surface. Do not change unrelated JSON route limits.

Do not add a custom stream-size framework or a new upload package.

Filename Policy

The client-provided original filename is metadata only and must never affect the filesystem path.

Accept only a display filename with these constraints:

• Length 1 through 255 characters
• No NUL
• No ASCII control characters
• No /
• No backslash character

Reject path-bearing or malformed names with HTTP 400. A name such as ../../outside.txt or ..\outside.txt must not be normalized into an accepted path-shaped name.

Do not preserve client directory structure or join the original filename into the storage destination.

Content-Type Policy

Multipart File.type is untrusted descriptive metadata.

If the supplied content type is empty or unusable, persist application/octet-stream.

Bound stored content-type metadata to at most 255 characters.

Do not use declared MIME type as authorization, execution policy, a file extension, or filesystem authority.

Phase L performs no MIME sniffing, MIME allowlisting, image decoding, SVG sanitization, PDF parsing, virus-scanning framework, media transcoding, or image-processing pipeline.

Because Phase L exposes no public file-serving route, otherwise valid bounded bytes remain inert stored data. Phase M must make its own safe rendering decision before embedding an asset.

Storage Root Configuration

Phase L adds this API-runtime configuration value:

ASSET_STORAGE_ROOT

Production

When NODE_ENV=production, ASSET_STORAGE_ROOT must be explicitly configured and absolute.

The production deployment target is:

ASSET_STORAGE_ROOT=/var/lib/bhr-cms/uploads

Do not silently write production uploads into the source tree.

Development and Test

For non-production environments, an explicit ASSET_STORAGE_ROOT override must be absolute.

When it is absent or empty, use one stable repository-local default:

.data/uploads

Derive that default from the API module/package location rather than process.cwd(), so bun run dev, bun run dev:api-only, and tests do not resolve different roots because of --cwd.

Add .data/ to .gitignore.

Tests that upload files must use an explicit temporary absolute directory.

Add .env.example documentation equivalent to:

# Optional local override for original asset storage.
# Development defaults to the repository .data/uploads directory.
# Production must set an absolute path; target: /var/lib/bhr-cms/uploads.
ASSET_STORAGE_ROOT=

The reserved derivative root /var/lib/bhr-cms/derivatives remains future work. Do not add derivative configuration, create derivatives, generate thumbnails, or transform images.

System-Generated Asset Identity

Generate assetId as a UUID inside the application using platform cryptography.

Do not accept an asset ID from the request.

Use the same generated ID as filesystem and metadata identity.

Storage Key

Use an internal logical storage key equivalent to:

<siteId>/<assetId>

Both components are validated or system-generated UUIDs. The key contains no extension, original filename, or arbitrary path fragment.

Persist the logical key in PostgreSQL.

The physical destination derives only from:

configured storage root
        +
system-generated storage key

Equivalent physical path:

ASSET_STORAGE_ROOT/<siteId>/<assetId>

Do not expose the physical path to the HTTP caller or store an absolute physical path in PostgreSQL.

Exclusive Creation and Partial-Write Cleanup

Filesystem creation must be exclusive. A storage-key collision must fail without truncating, replacing, or otherwise modifying existing bytes.

If a write fails after creating a partial file:

• Close the file
• Attempt to remove the incomplete file
• Persist no asset metadata

Asset Metadata Table

Phase L creates exactly one application table:

assets

Required columns:

id
site_id
storage_key
original_filename
content_type
byte_size
created_at

id

• UUID primary key
• Generated by the application/system
• A database UUID default may remain when consistent with repository conventions, but upload uses the same application-generated ID embedded in the storage key

site_id

• UUID
• NOT NULL
• References sites.id
• Indexed
• Non-cascading

The non-cascading relationship prevents a future site deletion from silently deleting metadata while filesystem bytes remain. Phase L does not add site deletion.

storage_key

• NOT NULL
• Globally unique

original_filename

• Validated display metadata only
• Not unique
• Not a path or public URL

content_type

• Normalized untrusted metadata or application/octet-stream

byte_size

• Actual accepted byte count from the received File
• Equal to bytes written to disk
• Never accepted from a caller-supplied size field

created_at

• Timezone-aware
• NOT NULL
• Database-default current timestamp

Do not add tenant_id, page_id, user_id, hostname, slug, filesystem_path, public_url, or speculative metadata to assets.

Upload Response Contract

Add a strict shared response equivalent to:

{
  id: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

Do not expose storageKey, physical path, filesystem root, siteId, tenantId, or database internals.

Phase L may add shared contracts for asset ID, original filename, content-type metadata, byte size, and the upload response.

Do not add an asset block or content-reference contract. Phase M owns content integration.

Asset Persistence Boundary

Create one focused database boundary equivalent to AssetPersistence with only the operations required by upload, including:

resolveAssetSite(tenantId, siteId)
createAssetMetadata(tenantId, siteId, metadata)

resolveAssetSite proves:

sites.id = siteId
AND sites.tenant_id = tenantId

before bytes are written.

createAssetMetadata must prove the same relationship again while inserting. If the site relationship was removed or changed after precheck, metadata creation fails closed.

Do not add generic asset CRUD, repository classes, asset services, or a generic unit-of-work abstraction.

Filesystem Boundary

Create one focused API-runtime boundary equivalent to AssetStorage.

It owns only:

• Storage-root resolution
• Exclusive original-byte write
• Internal storage-key-to-path translation
• Compensating removal

It does not own authentication, tenant/site authorization, database writes, multipart parsing, or public URLs.

Do not create a general filesystem framework.

Cross-Store Ordering

The filesystem and PostgreSQL cannot form one real transaction. Do not claim otherwise.

Use this bounded request flow:

1. Authenticate and authorize tenant membership.
2. Validate authoritative tenant/site scope.
3. Validate multipart shape, file metadata, and file size.
4. Generate the asset ID and storage key.
5. Write bytes successfully under the exclusive key.
6. Insert matching PostgreSQL metadata after revalidating site scope.
7. Return the strict response.

Metadata Failure Compensation

If metadata insertion fails after a successful filesystem write, remove the just-written file and return through the existing error or nondisclosure boundary.

A handled metadata failure must not leave a final asset file behind.

Scope-Race Compensation

If initial site validation succeeds but the authoritative site relationship no longer exists when metadata insertion rechecks it:

• Remove the just-written file
• Return nondisclosing HTTP 404
• Commit no metadata

Handled Failure Guarantee

No committed assets row may point to a failed or missing write. A failed metadata insert triggers filesystem compensation.

Process-Crash Limitation

A process crash after a successful filesystem write but before metadata commit may leave an orphan file with no database row. This is preferable to committing metadata that points to missing bytes.

Document this limitation explicitly. Phase L does not add a cleanup daemon, background orphan scanner, queue, two-phase commit, outbox, startup reconciliation framework, or worker. A future operational phase may address orphan reconciliation if required.

Route Policy Chain

Reuse the existing authentication, tenant-membership, and trusted-origin middleware:

createRequireAuthentication
createRequireTenantMembership
createRequireTrustedOrigin

Validate the site ID through the existing siteIdSchema.

Do not copy session logic, introduce another tenant-authority model, or create configurable asset authorization middleware.

HTTP Semantics

• Unauthenticated → 401
• Outsider or inaccessible tenant/site → 404
• Invalid site ID → nondisclosing 404
• Untrusted or missing origin → 403
• Malformed multipart, missing/duplicate file, non-File file field, or extra fields → 400
• Empty file → 400
• File larger than 10 MiB or request body larger than 11 MiB → 413
• Internal filesystem or database failure → existing generic 500

Do not expose physical paths, storage roots, SQL, constraint names, or database details.

No Caller Storage Authority

Request fields, headers, query parameters, and original filename have zero authority over assetId, storageKey, or physical path.

No Editor or Content Integration

Do not modify apps/admin or packages/editor in Phase L.

Do not add an upload button, asset browser, asset picker, image block, file block, media library, or page picker.

Do not modify PageDocument. Existing heading and paragraph blocks remain unchanged. Asset-backed blocks belong to Phase M.

Files / Functions

packages/contracts

package.json only if the existing test script must include the new focused test
src/asset.ts
src/asset.test.ts
src/index.ts

packages/db

src/schema/assets.ts
src/asset-persistence.ts
src/schema/index.ts
src/index.ts
migrations/
migrations/meta/
src/integration.test.ts
package.json only if test wiring requires it

apps/api

src/env.ts
src/env.test.ts
src/application.ts
src/lib/asset-storage.ts
src/routes/assets.ts
src/routes/index.ts
src/asset.integration.test.ts
package.json

Narrowly justified asset route or storage unit tests may be added inside the existing API test surface.

Root / Repository

.env.example
.gitignore
package.json
.github/workflows/ci.yml
docs/ARCHITECTURE.md
docs/DOCUMENTATION.md

No unnamed support surface exists.

Files Outside Phase L

Do not modify:

apps/admin/
apps/web/
packages/editor/

Do not modify page, public-read, preview, publish, or editor runtime behavior. If implementation evidence reveals a direct contradiction, stop for review rather than expanding scope.

Composition

Preserve:

createApiApplication
    ↓
createHttpApplication
    ↓
createApiRoutes

Compose createAssetPersistence(database) and createAssetStorage(assetConfig) through the existing composition root.

Mount createAssetRoutes(...) at /tenants/:tenantId/sites/:siteId/assets through createApiRoutes.

Do not add another application root, dependency-injection layer, storage service container, or forwarding-only factory.

Configuration Ownership

Extend the existing API configuration with an assets sibling responsibility equivalent to:

ApiConfig {
  port
  auth
  assets: {
    storageRoot
  }
}

Keep authentication configuration cohesive. Do not put filesystem configuration in @bher/db or create a second environment parser.

Dependencies

Use the existing Bun/Web File APIs, Node-compatible filesystem/path APIs available under Bun, Hono body-limit capability, Zod contracts, and Drizzle/PostgreSQL stack.

No new package dependency is expected. bun.lock must remain unchanged.

If an external upload or storage package appears necessary, stop and report the evidence instead of silently adding it.

Migration

Generate the next normal Drizzle migration, expected equivalent to 0008_assets.sql. The exact generated suffix follows repository tooling.

Exactly one new application table is expected: assets.

No existing application table requires Phase L schema mutation.

Testing

Contract Tests

Verify:

• Valid strict asset upload response
• Unknown response fields rejected
• Filename length and path-separator boundaries
• UUID asset ID
• Positive bounded byte size
• Content-type fallback and normalization

Do not implement multipart parsing in the contracts package.

Storage Unit Tests

Use a temporary absolute root to prove:

1. Correct bytes are written.
2. Physical path derives only from storage key.
3. Original filename is absent from the destination path.
4. The site directory is created as required.
5. An existing destination cannot be overwritten.
6. Failed or partial writes leave no accepted storage authority.
7. Compensating removal deletes a just-written file.

Do not use the production /var/lib directory in tests.

Asset Integration Gate

Add apps/api/src/asset.integration.test.ts and one test:asset:integration command to the API, root scripts, and CI.

Use real PostgreSQL, the real Hono application, and a real temporary filesystem directory. Do not mock the primary upload lifecycle.

Authorization and Multipart Controls

Prove:

• owner upload → 201
• member upload → 201
• unauthenticated → 401
• outsider → 404
• invalid site → 404
• untrusted origin → 403
• missing file → 400
• duplicate file parts → 400
• extra form field → 400
• non-File file field → 400

For every rejected request, asset row delta and final file delta must both remain zero.

Size Controls

Directly prove:

• Empty file → 400
• Exactly 10 MiB → accepted
• 10 MiB + 1 byte → 413
• Request body larger than 11 MiB → 413

Do not infer enforcement solely from constants.

Filename Traversal Control

Submit a path-bearing filename such as ../../outside.txt or ..\outside.txt and prove HTTP 400, no asset row, no final file, and no file outside the storage root.

Storage-Key Confinement

For a successful upload, inspect assets.storage_key and the physical path. Prove the key contains only server-controlled UUID identity, the original filename is absent, the physical file remains under the configured root, and the response exposes neither key nor physical path.

Metadata Accuracy

Prove direct equality among actual bytes written, assets.byte_size, and response byteSize.

Verify original_filename, content_type, created_at, and site_id against authoritative observed values.

Content-Type Control

Upload a valid file with no usable declared MIME type and prove stored and returned application/octet-stream. Do not infer type from extension or content.

Site-Scope Control

Create sites A and B, upload to A, and prove assets.site_id = A. Caller-supplied query or body metadata cannot redirect the asset to B. No tenant ID is stored on the asset row.

Exclusive-Write Control

Attempt two writes to the same test storage key through the real storage boundary. The first bytes remain intact, the second write is rejected, and no truncation or overwrite occurs.

Database Failure Compensation

Exercise the production-used orchestration with a successful filesystem write followed by metadata failure. Prove the file is removed and no row commits.

A narrow persistence-failure test seam is acceptable only if a real constraint failure cannot be triggered without distorting production design. Do not add a production failure endpoint.

Scope-Race Compensation

Where practical, invalidate site scope between the initial check and metadata insertion and prove nondisclosing not-found, file removal, and no metadata.

Do not add site-deletion production behavior merely for this test. If the race cannot be reproduced safely, report this specific negative control as NOT RUN rather than fabricating PASS.

Response Confinement

The only successful response keys are id, originalFilename, contentType, byteSize, and createdAt.

The response must not contain storageKey, storage root, physical path, tenant ID, site ID, or database internals. The strict shared schema enforces this boundary.

Configuration Tests

Development:

• No configured root → stable repository-local .data/uploads
• Explicit absolute override → accepted
• Relative explicit override → rejected

Production:

• Missing or empty root → configuration error
• Relative root → configuration error
• Absolute root → accepted

Do not expose path contents in unrelated error messages.

Catalog Verification

Verify exactly one new table, assets, including:

• UUID primary key
• Non-cascading site foreign key
• Globally unique storage key
• Site index
• Original filename
• Content type
• Byte size
• Timezone-aware created timestamp

Do not weaken existing catalog assertions.

Operation Inventories

Enumerate new production operations.

Filesystem operations are limited to creating/writing an original and compensating removal.

Database operations are limited to authoritative site-scope read and asset metadata insert.

There must be no production asset update, asset-delete API, public asset read, or derivative write.

Enumerate every production location where a physical asset path is constructed. There should be one bounded storage boundary, and no route or persistence code may concatenate caller filename/path data.

Regression and Runtime Smoke

Preserve authentication, tenant, site, membership, page, public-read, preview, publish, and editor behavior.

Verify normal startup using the development storage default:

• Admin root → 200
• Health → 200
• Unauthenticated session → 401
• Unauthenticated upload → 401
• Clean shutdown

Do not require the production /var/lib directory for local smoke.

Documentation

Update docs/ARCHITECTURE.md and docs/DOCUMENTATION.md to reflect implemented current state only.

Document site-scoped assets, owner/member upload, 10 MiB file and 11 MiB request limits, server-generated storage keys, filename and MIME metadata boundaries, production and development roots, metadata schema, handled-request compensation, crash-orphan limitation, and explicit absence of public serving, listing, deletion, editor picking, and derivatives.

Acceptance Criteria

1. Owner can upload to an accessible site.
2. Member can upload to an accessible site.
3. Outsider or inaccessible scope cannot upload.
4. Trusted origin is required.
5. Upload accepts exactly one multipart file field.
6. Empty files are rejected.
7. The maximum accepted file is exactly 10 MiB.
8. Oversized file or request body receives HTTP 413.
9. Original filename cannot control filesystem path.
10. Asset ID and storage key are system-generated.
11. Successful bytes persist under the configured root.
12. An existing file cannot be overwritten by key collision.
13. Asset metadata persists with the correct site, filename, content type, byte size, and timestamp.
14. Storage key is globally unique.
15. The asset row does not duplicate tenant or page ownership.
16. Content type remains untrusted metadata.
17. Empty or unusable content type falls back to application/octet-stream.
18. The upload response is strict and exposes no storage or path authority.
19. A handled filesystem failure creates no metadata.
20. A handled metadata failure removes the just-written file.
21. A site-scope race fails closed and compensates where safely testable.
22. Development storage has a stable gitignored default.
23. Production requires an explicit absolute storage root.
24. No public asset serving exists.
25. No asset list or delete API exists.
26. No editor asset picker exists.
27. No PageDocument asset integration exists.
28. No derivative or image-processing behavior exists.
29. No external dependency is added.
30. Phase M remains unstarted.

Required Negative Controls

• Unauthenticated upload
• Outsider upload
• Untrusted-origin upload
• Invalid site
• Missing file
• Duplicate file
• Extra multipart field
• Empty file
• 10 MiB + 1 byte file
• Request larger than 11 MiB
• Path-bearing original filename
• Exclusive-write collision
• Metadata failure after a successful file write
• Upload-response storage/path leakage

Where site deletion or race behavior cannot be safely reproduced without introducing future behavior, report it honestly as NOT RUN.

Output Format

Files created
Files modified
Commands executed
Asset authorization, upload-boundary, filesystem, metadata, compensation, and persistence tests

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
