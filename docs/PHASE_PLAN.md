BeHR CMS — Agentic Implementation Execution Brief

Version: 1.17
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
   Notification/resource-identity corollary: Any global or transient notification or feedback surface that reports an asynchronous operation is governed by the same authoritative resource-identity discipline as the state it reports. Context-bound feedback must be discarded when its completion is stale or no longer belongs to the user's current resource context. A completion for tenant, site, page, asset, or another resource A must not appear to belong to the user's current resource B. This corollary does not authorize a notification system. A later explicitly governed workflow may permit cross-context notification only when the notification retains and visibly identifies its originating resource identity, does not imply that the current resource was affected, and does not weaken stale-state discard.
14. Cross-layer naming clarity: When similarly named operations exist at different boundaries, names must communicate the boundary when search, stack traces, or review would otherwise be ambiguous. Database mutations, HTTP requests, UI actions, and response translations must not use indistinguishable names when they perform materially different work.
15. Error-boundary classification: When a boundary catches an exception from a platform, framework, database, filesystem, parser, authentication provider, network API, or other external/runtime dependency and translates it into an application error or HTTP result, translate only failures that the boundary explicitly owns. Prefer stable structured discriminators such as error codes, statuses, or specific error types over broad type checks or message fragments. When a materially adjacent non-owned failure exists and can be exercised without speculative production hooks, verification must prove both sides of the boundary: at least one owned failure is translated as intended and at least one adjacent unowned failure propagates to its upstream boundary. Exact message matching is acceptable only when the pinned runtime exposes no stable structured discriminator; such matching must be exact and covered by a version-specific regression test.
16. Human product acceptance: For a phase or bounded task that materially changes a user-facing interface or interaction, machine-verifiable correctness and human product acceptance are independent gates; neither substitutes for the other. The machine gate owns functional correctness, type safety, automated regressions, mechanically verifiable accessibility and responsive floors, async/resource identity, validation, and error/loading/state correctness. The human gate owns visual hierarchy, typography, text sizing, spacing, density, control sizing, comprehensibility, interaction and motion quality, feedback presentation, visual coherence, aesthetic quality, and whether the affected screen or workflow is acceptable to ship. A technically correct interface may pass the machine gate and fail the human gate because it is ugly, confusing, excessively dense, awkward, or unpleasant to use. Human product acceptance may be issued only by the project owner or another explicitly designated human reviewer. An agent may prepare screenshots, execute browser interactions, collect accessibility evidence, identify or critique design problems, and compare the result against the rubric, but it may not unilaterally satisfy the human gate. Applicable static visual review records the exact commit SHA, browser, viewport, screen/state, screenshot, named rubric, and explicit human PASS/FAIL. When interaction quality is material, also record the starting state, user actions, observed transitions/feedback, and human verdict; video is optional. A change directly proven to have no visual or interaction effect may report human product acceptance as NOT APPLICABLE with supporting evidence; diff size alone is not proof. Human-product failure may create a bounded corrective task, but it does not authorize database, contract, persistence, backend, authentication, Phase Q operational, or unrelated UI changes without separate governance at the owning boundary. Rule 15 remains specifically the error-boundary-classification rule.

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
Decision Gate — Failure Feedback and Error Reporting
Error Reporting Baseline
O — Theme and Settings UI
P — UX Refinement
Q — Production Operations Lock
R — Installation & First-Run Productization
S — Product Experience Completion / Beta Exit
T — Release Candidate, Compatibility & Recovery Validation
U — v1.0.0 Release Lock

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

Ownership Correction

High — Phase M ownership and asset-read authority gap: Version 1.8 requires canonical asset references, persistent usage, an admin asset picker, and asset-backed rendering without defining the contract, persistence, authorization, storage-read, UI, or renderer surfaces needed to implement them. In particular, usage history alone cannot become public asset authority because doing so would expose bytes referenced only by unpublished drafts. Version 1.9 defines separate current-publication and token-bound-preview asset authorities while preserving the existing draft-isolation invariant.

This correction does not reopen Phase L. No Phase L runtime correction is required, and Phase N remains unstarted.

Authority Flow

site asset
    ↓
canonical image block
    ↓
immutable page version
    ↓
immutable version→asset usage
    ↓
published-version OR preview-token authority
    ↓
asset bytes
    ↓
existing React renderer

page_version_assets records usage. It does not by itself grant public access.

Canonical Image Block

Add exactly one canonical asset-backed block:

{
  id: string;
  type: "image";
  assetId: string;
  alt: string;
}

Requirements:

• id remains a UUID
• assetId uses the existing assetIdSchema
• alt is a string
• Empty alt is permitted for a decorative image
• The block object is strict

Do not add URL, storage key, filename, MIME type, caption, width, height, crop, focal point, responsive variants, link target, or CSS class.

Canonical content stores stable asset identity, not delivery metadata.

Existing Blocks and Document Version

Preserve existing heading and paragraph contracts and semantics, including heading levels, text, alignment, section structure, and ordering.

Do not change the existing PageDocument schema version merely because the discriminated block union gains one backward-compatible member unless direct contract evidence proves a version change is required.

Renderable Asset Types

Phase M may render only these stored content-type values:

image/jpeg
image/png
image/gif
image/webp
image/avif

Do not publicly or privately preview-render image/svg+xml, text/html, application/pdf, application/octet-stream, or arbitrary uploaded types.

Phase L content type remains untrusted descriptive metadata. Phase M does not add MIME sniffing, image decoding, sanitization, or content inference.

Minimal Asset Picker

The authenticated admin picker may:

• Load renderable assets belonging to the current site
• Display original filename
• Select one asset
• Append an image block to the selected section

It does not upload, delete, rename, search, paginate, organize folders, display usage counts, generate thumbnails, implement drag-and-drop, or introduce a media-library modal/framework.

Keep the picker inline and functional. The Phase L POST route remains the only upload authority.

Authenticated Asset List Route

Extend the existing asset route module with exactly:

GET /tenants/:tenantId/sites/:siteId/assets

Authority:

authenticated session
    ↓
tenant membership
    ↓
valid site ID
    ↓
authoritative tenant/site relationship

Both owner and member may list site assets.

GET does not require trusted-origin middleware. Preserve the existing POST route's trusted-origin, 11 MiB body-limit, 10 MiB file-limit, exact multipart, narrow parser classification, exclusive-write, and compensation behavior unchanged.

Asset List Response

Add a strict response equivalent to:

{
  assets: [
    {
      id: string;
      originalFilename: string;
      contentType: string;
      byteSize: number;
      createdAt: string;
    }
  ];
}

Reuse existing asset metadata contracts where appropriate.

Return only assets whose stored content type is in the Phase M renderable-image allowlist. Order by created_at ascending, then id ascending.

Do not expose storageKey, physical path, siteId, tenantId, or usage count.

Asset List Persistence

Extend AssetPersistence with one focused operation equivalent to:

listSiteAssets(tenantId, siteId)

It must prove:

sites.id = siteId
AND sites.tenant_id = tenantId
AND assets.site_id = sites.id

Do not add generic asset CRUD, a repository class, an asset service, or search infrastructure.

Asset Picker Async Identity

Asset-list state belongs to a tenant/site pair. Per Global Rule 13, every asynchronous state and completion must carry at least tenantId and siteId.

A late result started for site A must not populate an editor currently displaying site B. Use component-local React state, normal effect cleanup, and latest-state checks only where needed.

Do not add a custom asset hook, reducer, context, store, generic request manager, global epoch/generation abstraction, or mirrored current-site ref. If effect cleanup plus tenant/site identity is sufficient, use it.

Editor Domain Operations

Extend packages/editor only with the pure operations required by the image block:

addImageBlock(document, sectionId, blockId, assetId)
updateImageAlt(document, blockId, alt)

addImageBlock appends:

{
  id: blockId,
  type: "image",
  assetId,
  alt: ""
}

updateImageAlt changes only the addressed image block. Existing text, heading-level, and alignment operations leave image blocks unchanged.

Wrong-section insertion remains a bounded no-op consistent with current editor semantics.

Do not add an asset service, editor state manager, generic block factory, or media domain layer.

Image Block Editor

Extend the existing BlockEditor for image blocks with:

• Selected asset identity or original filename when available from current-site asset state
• Alt-text input
• Existing Remove block action

The canonical block must not depend on original filename. Do not add resizing, alignment, captions, links, or media controls.

Asset Usage Table

Create exactly:

page_version_assets

Required columns:

page_version_id
asset_id

Primary key:

(page_version_id, asset_id)

Add an index on asset_id.

Do not add tenant_id, site_id, page_id, block_id, created_at, or usage_count. The immutable page version already identifies the document containing the reference.

Usage Foreign Keys

page_version_id:

FK → page_versions.id
ON DELETE CASCADE

asset_id:

FK → assets.id
ON DELETE NO ACTION

Asset deletion remains unimplemented. The non-cascading asset relationship prevents a future delete workflow from silently erasing evidence referenced by immutable historical versions.

Usage Extraction Ownership

For initial page creation and every draft-version save:

API validates canonical PageDocument
    ↓
API extracts unique image asset IDs
    ↓
PagePersistence receives document + assetIds
    ↓
persistence resolves authoritative site/page
    ↓
prove every referenced asset belongs to that site
    ↓
INSERT immutable page_version
    ↓
INSERT page_version_assets rows
    ↓
advance draft pointer

Initial page creation applies the same rules before establishing its first draft pointer.

Do not make @bher/db import canonical contracts or parse PageDocument to discover image blocks. Canonical parsing and asset-ID extraction remain API/contract boundary responsibilities.

Unique Usage Extraction

Multiple blocks using the same asset create exactly one page_version_assets row for that version/asset pair.

The document remains authoritative for block count, position, and order. Do not store block-level usage rows.

Same-Site Asset Reference Validation

Before inserting a page version, prove every referenced asset satisfies:

assets.id = requested assetId
AND assets.site_id = authoritative page site

A syntactically valid nonexistent or wrong-site asset is an invalid page request.

Return the existing bounded response:

400
{"error":"Page request is invalid."}

Do not disclose whether an asset exists elsewhere.

No page_versions row, page_version_assets row, or draft-pointer update may commit for an invalid reference.

Page-Version Transaction Boundary

For every initial or later version, the same existing page-persistence transaction owns:

• Authoritative site/page scope proof
• Same-site asset proof
• page_versions insert
• page_version_assets inserts
• Draft-pointer update

Initial creation retains page metadata creation in that transaction.

Usage must never commit without its immutable version, and a version containing image references must never commit without every required usage row.

Do not create another transaction coordinator.

Invalid Asset Reference Translation

Use one explicit persistence error/result for referenced assets that are invalid for the authoritative site. The page route translates only that owned condition to the existing HTTP 400 response.

Do not use a generic database exception as invalid-input authority.

Global Rule 15 applies:

owned same-site-reference failure
    → HTTP 400

adjacent generic persistence failure
    → propagate
    → generic HTTP 500

Where realistically exercisable through the existing focused route seam, prove both paths. Do not write catch-all translation, add a production failure endpoint, or create general error-classification infrastructure.

Historical Usage Semantics

Usage is immutable because page versions are immutable.

Saving version B does not mutate version A usage. Publishing and preview-token issuance do not create, rewrite, or delete usage.

Usage answers which assets an immutable version references. It does not answer whether an asset is currently public.

Draft Isolation

Saving an image-backed draft records page_version_assets but must not make its bytes anonymously accessible.

Required:

draft save
    ↓
page_version_assets row exists
    ↓
GET /public/assets/:assetId returns 404

unless another currently published version on the same site independently references that asset.

Preserve the invariant that draft content cannot be publicly exposed. Historical usage is never implicit public authority.

Published Asset Route

Add exactly:

GET /public/assets/:assetId

under the existing /public route boundary.

The response contains asset bytes, not JSON metadata.

Public authority requires the requested asset to be referenced by at least one currently published page version on the Host-resolved site.

Published Relational Proof

The public resolver must prove the complete relationship:

domains.hostname = actual Host
domains.site_id = sites.id
assets.id = requested assetId
assets.site_id = sites.id
pages.site_id = sites.id
page_versions.id = pages.published_version_id
page_versions.page_id = pages.id
page_version_assets.page_version_id = page_versions.id
page_version_assets.asset_id = assets.id

Do not trust any individual foreign key alone. This retains Phase H's same-page published-version proof and adds exact usage/asset/site ancestry.

Published Asset Results

Return one nondisclosing HTTP 404 for missing or invalid Host, malformed asset ID, unknown asset, wrong-site asset, draft-only asset, asset used only by an unpublished or historical non-current version, and unsupported content type.

If another currently published page on the same site references the asset, that current publication still authorizes it.

Preview Asset Route

Add exactly:

GET /preview/assets/:assetId

under the existing preview boundary. Require the existing X-BeHR-Preview-Token header and existing token format.

Preview Relational Proof

Preview authority must prove:

domains.hostname = actual Host
domains.site_id = sites.id
preview_tokens.token_hash = hash(header token)
preview_tokens.expires_at > now
preview_tokens.page_id = pages.id
preview_tokens.version_id = page_versions.id
page_versions.page_id = pages.id
pages.site_id = sites.id
page_version_assets.page_version_id = preview_tokens.version_id
page_version_assets.asset_id = assets.id
assets.id = requested assetId
assets.site_id = sites.id

The requested asset must be referenced by the exact immutable version bound to the currently valid preview credential. Same-site ownership alone is insufficient.

Preview Asset Results

Return one nondisclosing HTTP 404 for missing, malformed, expired, or rotated credentials; wrong Host; malformed asset ID; wrong-site asset; asset not used by the token-bound version; and unsupported content type.

Preview failure must never fall back to the public asset route.

Preview Credential Transport

Do not place raw preview credentials in an asset URL, query string, cookie, localStorage, or sessionStorage.

Reuse the existing browser-held preview token and X-BeHR-Preview-Token header.

Do not add signed URLs, asset-specific preview tokens, preview cookies, a new token table, or another credential service.

Published Renderer Behavior

For normal published rendering, an image block renders equivalent to:

<img
  src={`/public/assets/${block.assetId}`}
  alt={block.alt}
/>

React owns text escaping. Do not inject HTML or place storage keys or physical paths into markup.

Preview Renderer Behavior

Preview rendering must not place the preview token in the image source URL.

Use one small preview-image component local to the existing web renderer:

assetId + alt + existing preview token
    ↓
fetch /preview/assets/:assetId
with X-BeHR-Preview-Token
    ↓
Blob
    ↓
URL.createObjectURL()
    ↓
<img src=objectURL>

Cleanup must call URL.revokeObjectURL().

The component owns only this browser transport difference. Do not add a generic asset-source resolver, global asset cache/context, service worker, or media client service.

Preview Asset Async Identity

The preview byte request belongs to the exact assetId/previewToken pair. A late result for another pair must not replace the current source.

A React effect keyed by those values with cleanup is sufficient. Do not add epochs, request managers, reducers, stores, or global generation counters unless direct evidence proves normal cleanup insufficient.

Read-Persistence Ownership

Do not turn AssetPersistence into a generic authorization service.

AssetPersistence owns authenticated site asset management only:

resolveAssetSite
createAssetMetadata
listSiteAssets

PublicPagePersistence adds one focused operation equivalent to:

resolvePublishedAsset(hostname, assetId)

It owns current-publication asset authority.

PreviewPersistence adds one focused operation equivalent to:

resolvePreviewAsset(hostname, assetId, tokenHash, now)

It owns token-bound preview asset authority.

Do not add AssetReadService, AssetAuthorizationService, AssetRepository, or MediaService.

Asset Read Persistence Result

Published and preview asset resolution returns only internal delivery metadata needed by the byte boundary:

{
  storageKey: string;
  contentType: string;
}

Do not expose this object through a public JSON response.

Storage Read

Extend the existing AssetStorage with exactly:

readOriginal(storageKey) → Uint8Array

It must reuse existing storage-key parsing, UUID validation, and root confinement. Physical-path logic remains inside AssetStorage.

Do not add a blob-store/CDN abstraction, streaming framework, or file repository.

Missing Physical File

If authoritative database resolution succeeds but readOriginal fails because bytes are missing or unreadable, return the existing generic HTTP 500 response.

Do not translate that integrity/storage failure to HTTP 404, repair the row, or add cleanup behavior. Under Global Rule 15, broad filesystem-error-to-not-found translation is forbidden.

Content-Type Response Policy

Both GET /public/assets/:assetId and GET /preview/assets/:assetId must:

1. Resolve content type from authoritative stored metadata.
2. Require the exact metadata value to be in the Phase M renderable allowlist.
3. Set that exact allowlisted Content-Type.
4. Set X-Content-Type-Options: nosniff.

Do not reflect original filename into response headers, sniff content, or serve SVG.

No Media Pipeline

Do not add resizing, thumbnails, cropping, optimization, transcoding, format conversion, EXIF processing, derivatives, virus scanning, a worker, or a queue.

The reserved derivatives directory remains unused.

No Asset-Management Expansion

Do not add asset DELETE, UPDATE/PATCH, rename, folders, tags, search, pagination, usage-count endpoints, orphan cleanup, or garbage collection.

Phase M integrates references only.

Workspace Dependency Preflight

Before implementation inspect:

apps/admin/package.json
apps/web/package.json
packages/editor/package.json
packages/db/package.json

The accepted relationships are:

@bher/admin  → @bher/contracts
@bher/admin  → @bher/editor
@bher/editor → @bher/contracts
@bher/web    → @bher/contracts

No new workspace edge is expected. In particular, do not add @bher/db → @bher/contracts merely so persistence can inspect PageDocument; the API already owns canonical parsing.

If a required workspace dependency is genuinely missing, stop and request a separately approved micro-task. Do not bypass workspace ownership with relative imports.

Usage Extraction Boundary

A small API-side collectAssetIds(document) function is justified only if shared by page creation and draft saving or if the name materially clarifies the page-version persistence boundary.

Do not create a generic document walker. Use a short direct expression when clearer. Global Rule 12 remains authoritative.

Files / Functions

packages/contracts

src/asset.ts
src/asset.test.ts
src/block.ts
src/content.test.ts
src/index.ts
package.json only if existing test wiring genuinely requires it

packages/editor

src/index.ts
src/index.test.ts

packages/db

src/schema/page-version-assets.ts
src/schema/index.ts
src/page-persistence.ts
src/asset-persistence.ts
src/public-page-persistence.ts
src/preview-persistence.ts
src/index.ts
src/integration.test.ts
migrations/
migrations/meta/

apps/api

src/application.ts
src/lib/asset-storage.ts
src/lib/asset-storage.test.ts
src/routes/index.ts
src/routes/assets.ts
src/routes/assets.test.ts
src/routes/pages.ts
src/routes/pages.test.ts
src/routes/public.ts
src/routes/preview.ts
src/asset.integration.test.ts
src/page.integration.test.ts
src/public.integration.test.ts
src/preview.integration.test.ts

apps/admin

src/PageEditor.tsx
src/PageEditor.test.ts

apps/web

src/main.tsx
src/renderer.tsx
src/renderer.test.tsx

A focused additional web unit-test file is permitted only if preview-asset request lifecycle coverage cannot reasonably live in the existing web unit surface.

Repository / Documentation

package.json only if existing root test wiring must include a new focused test
.github/workflows/ci.yml only if an existing gate genuinely does not execute required tests
docs/ARCHITECTURE.md
docs/DOCUMENTATION.md

No unnamed support surface exists.

Files Outside Phase M

Do not modify unrelated authentication, tenant creation, membership invitation, site creation, publishing semantics, preview-token issuance semantics, theme packages, or infrastructure.

Do not modify Phase N behavior or add new applications/packages.

Migration

Generate the next normal Drizzle migration, expected equivalent to:

0009_page_version_assets.sql

The exact generated suffix follows repository tooling.

Exactly one new application table is expected: page_version_assets. No existing application table requires Phase M schema mutation.

Dependencies

No new external dependency is expected. Use existing Bun/Web and Node filesystem APIs, Hono, Zod, Drizzle, PostgreSQL, React, and accepted workspace packages.

bun.lock must remain unchanged unless a genuinely missing already-required workspace relationship requires an approved workspace-only metadata correction.

Do not add image libraries.

Verification Requirements

Contract tests must prove existing heading/paragraph blocks remain valid; one strict image block is accepted; malformed asset UUID and missing alt are rejected; empty alt is accepted; extra delivery fields are rejected; and asset-list responses are strict.

Editor tests must prove addImageBlock, updateImageAlt, unchanged text-transform behavior for image blocks, wrong-section no-op behavior, tenant/site-confined async list state, correct asset selection, and absence of media-management frameworks.

PostgreSQL usage tests must prove initial and later version/usage/pointer atomicity, duplicate-reference deduplication, and immutable historical usage.

Wrong-Site and Nonexistent Reference Controls

For a page in site A, reject an asset from site B and a valid UUID with no asset row using the same bounded HTTP 400 response.

Directly prove page-version delta = 0, usage delta = 0, and draft pointer unchanged. Do not infer transactional integrity from response status or disclose which invalid-reference condition occurred.

Rule 15 Classification Control

Where realistically exercisable through the existing route seam, prove an owned invalid-reference result translates to HTTP 400 while an adjacent generic persistence exception reaches generic HTTP 500.

Do not add a generalized error injector or production failure route.

Published Asset Verification

Create draft version A containing asset A without publishing it:

GET /public/assets/A → 404

Publish that exact version:

GET /public/assets/A → 200

Verify exact bytes, allowlisted Content-Type, and X-Content-Type-Options: nosniff.

Published-Version Transition and Reuse

After publishing version A using asset A, save and publish version B without A. If no other current published page on the site references A, public asset A returns 404 while historical usage remains.

If another current published page on the same site still references A, public asset A remains 200. The relational existence query—not usage counts—owns this proof.

Preview Asset Verification

Issue preview token T1 bound to immutable version A containing asset A. T1 authorizes A and no unused asset.

After saving version B containing asset B without rotating T1:

T1 + A → 200
T1 + B → 404

After rotating to token T2 bound to B:

old T1 + A → 404
old T1 + B → 404
new T2 + B → 200
new T2 + A → 404 unless B references A

Expired credentials return 404 with no public fallback or asset mutation.

Host, Site, MIME, and Integrity Controls

For public and preview routes prove wrong Host, another-site asset, malformed asset ID, and unsupported MIME return nondisclosing 404.

Preview additionally proves a credential for another page/site/version cannot authorize the asset.

If otherwise-authorized metadata and usage exist but the physical original is missing, both authorized delivery paths return generic HTTP 500 rather than 404.

Renderer Verification

Published image markup uses /public/assets/<assetId> and canonical alt text.

Preview rendering sends the existing token only through X-BeHR-Preview-Token, creates an object URL from the returned Blob, renders it, and revokes it during cleanup.

The token never appears in the asset URL, cookie, or browser storage. Preview failure never falls back to the public endpoint.

Do not add browser E2E infrastructure solely for Phase M.

Asset Route Regression

The existing POST asset route retains owner/member authorization, trusted origin, exact multipart policy, 10 MiB file and 11 MiB request limits, narrow malformed-parser classification, exclusive writes, and metadata compensation.

Adding GET must not alter POST behavior.

Public and Preview Page Regression

GET /public/page and GET /preview/page remain canonical-document JSON routes. They do not embed binary bytes and retain their existing authority rules except that the canonical document may contain a valid image block.

API Route Inventory

Phase M adds exactly:

GET /tenants/:tenantId/sites/:siteId/assets
GET /public/assets/:assetId
GET /preview/assets/:assetId

The Phase L POST upload route remains. No other route is expected.

Database and Storage Operation Inventories

The only new production database mutation is INSERT page_version_assets while creating an immutable page version.

Do not add UPDATE or explicit DELETE page_version_assets, asset UPDATE, or asset DELETE. Usage deletion occurs only through its declared page-version cascade.

Storage adds read original to existing exclusive write original and compensating remove. No derivative write or user-selected filesystem path is allowed.

Documentation

During implementation, update docs/ARCHITECTURE.md and docs/DOCUMENTATION.md to current state for the image block, immutable usage, authenticated listing, current-publication authority, token-bound preview authority, draft-byte isolation, MIME allowlist, nosniff, filesystem read, preview object URLs, and explicit absence of media pipelines/asset management.

Acceptance Criteria

1. Canonical content supports one strict image block containing only id, type, assetId, and alt.
2. Existing heading and paragraph documents remain valid.
3. Owner and member can list renderable assets belonging to the current site.
4. Asset-list responses expose no storage or path authority.
5. Late asset-list responses cannot cross tenant/site state.
6. Admin can select a site asset and append an image block.
7. Image alt text can be edited.
8. Valid same-site references persist in immutable page versions.
9. Usage rows commit transactionally with their page version.
10. Duplicate references produce one usage row per version/asset.
11. Missing and wrong-site references return nondisclosing HTTP 400 with no version, usage, or pointer mutation.
12. Generic persistence failures are not misclassified as invalid references.
13. Historical usage remains immutable.
14. Draft-only asset usage does not grant public access.
15. Public asset authority requires usage by a current published version on the Host-resolved site.
16. Full asset→usage→version→page→site ownership is proven.
17. Historical non-current publication usage alone does not preserve public access.
18. Preview asset authority requires the existing valid preview token.
19. The preview token must bind the exact immutable version whose usage authorizes the asset.
20. A preview token cannot read unused or another-version assets.
21. Preview credentials never enter asset URLs, cookies, or browser storage.
22. Preview rendering uses credentialed fetch and a temporary object URL.
23. Preview object URLs are revoked.
24. Preview failure never falls back to public asset delivery.
25. Public and preview delivery support only the explicit image MIME allowlist.
26. Successful byte responses include X-Content-Type-Options: nosniff.
27. Missing authoritative physical bytes fail through generic HTTP 500.
28. Existing asset upload behavior remains unchanged.
29. No media pipeline exists.
30. No asset-management expansion exists.
31. No new external dependency exists.
32. Phase N remains unstarted.

Required Negative Controls

• Wrong-site asset reference
• Nonexistent asset reference
• Adjacent generic persistence failure
• Duplicate usage reference
• Late cross-site asset-list completion
• Draft-only public asset
• Historical but non-current published asset
• Wrong-host public asset
• Wrong-site public asset
• Unsupported-MIME public asset
• Preview token for wrong version
• Expired preview token
• Rotated preview token
• Preview asset not used by bound version
• Preview failure public-fallback absence
• Missing physical file

Keep tests focused within existing unit/integration boundaries. Do not turn these controls into generalized frameworks or exhaustive browser automation.

Output Format

Files created
Files modified
Commands executed
Contract, editor, usage, public-authority, preview-authority, renderer, storage-read, isolation, and regression tests

────────

Phase N — Theme Runtime Contract

Task

Implement theme token system.

Objective

Control site appearance via tokens.

Ownership Correction

High — Phase N theme-runtime ownership gap: Version 1.9 requires theme persistence, runtime resolution, and renderer application without defining the token contract, site relationship, fallback behavior, read surfaces, or implementation files. Version 1.10 defines one bounded current token set per site and reuses the existing public/preview page responses and renderer without introducing a theme framework or Phase O management behavior.

This correction does not reopen Phase M. Phase O remains unstarted.

Minimal v1 Theme Model

A site has at most one persisted current theme-token row.

Authority:

site
  ↓
optional themes row
  ↓
current bounded token set

If no row exists, use DEFAULT_THEME_TOKENS. Existing sites therefore remain immediately renderable without migration backfill.

Do not introduce named theme collections, presets, inheritance, parent/child themes, an active-theme pointer, history, versioning, a marketplace/catalog, or a theme service.

Theme Token Contract

Define exactly:

{
  colorScheme: "light" | "dark";
  fontFamily: "sans" | "serif";
}

Define one shared default:

{
  colorScheme: "light",
  fontFamily: "sans"
}

The object is strict.

Do not add arbitrary colors, hex values, CSS strings, font URLs, spacing scales, border radii, shadows, component tokens, or custom CSS.

Existing content-level spacing, width, and alignment tokens remain unchanged.

Theme Persistence

Create exactly:

themes

Required columns:

site_id
color_scheme
font_family

site_id:

• UUID
• Primary key
• Foreign key to sites.id
• ON DELETE CASCADE

color_scheme:

• TEXT
• NOT NULL

font_family:

• TEXT
• NOT NULL

The primary key enforces one current theme row per site.

Do not add id, name, tenant_id, is_active, version, created_by, active-theme selection, or theme history.

Why No Active Pointer

Resolve active theme means resolve the site's one optional current theme row. It does not mean select one record from a theme catalog.

A separate pointer would introduce bidirectional ownership, additional consistency checks, selection persistence, and Phase O behavior without a current requirement.

Phase O may later mutate the bounded values on the site's current row. Do not build that mutation surface in Phase N.

No Theme Mutation API

Phase N adds no POST, PUT, PATCH, or DELETE theme route and no site/tenant theme-management endpoint.

There is no production theme write operation in Phase N.

Runtime integration tests may insert or update theme rows directly through PostgreSQL fixtures to establish known read state. That fixture behavior is not a production API.

Public and Preview Theme Resolution

Extend the existing page-read records so both:

GET /public/page
GET /preview/page

resolve the current site's optional theme row.

The existing public page response becomes equivalent to:

{
  title: string;
  slug: string;
  document: PageDocument;
  theme: ThemeTokens;
}

When a valid row exists, theme contains its persisted tokens. When no row exists, theme is DEFAULT_THEME_TOKENS.

Do not add a separate theme-read HTTP request. One page response contains everything the renderer needs.

Theme Is Current Site State

Theme state does not belong to PageDocument, page_versions, page_version_assets, preview_tokens, or page_publications.

Publishing does not snapshot theme state. Preview-token issuance does not snapshot theme state. A later test-fixture or future Phase O theme update affects subsequent published and valid preview reads immediately.

Do not add theme history or couple themes to page-version/publication/preview identity.

Missing and Malformed Theme Behavior

If no theme row exists, use DEFAULT_THEME_TOKENS.

If a row exists but contains an unsupported token value, fail through the existing generic HTTP 500 boundary.

Do not silently repair, rewrite, strip, or replace malformed persisted values with defaults. Do not leak validation details.

Under Global Rule 15, do not broadly catch theme parsing failures and translate them to HTTP 404.

Renderer Application

Extend the existing shared PageRenderer with the resolved theme.

Use only hard-coded trusted mappings equivalent to:

light → trusted light background and text values
dark  → trusted dark background and text values
sans  → trusted system sans-serif stack
serif → trusted local serif stack

Apply the resulting style to one root wrapper around the rendered page.

Inline React style is acceptable and preferred over a CSS/theme framework.

Do not inject arbitrary CSS, build dynamic CSS variables from user strings, load remote fonts, create ThemeProvider/React context, or add a styling dependency.

Preserve Renderer Context

Phase M already passes document and previewToken to the shared renderer. Phase N adds only theme:

<PageRenderer
  document={page.document}
  previewToken={previewToken}
  theme={page.theme}
/>

Do not redesign published or preview asset rendering. Existing heading, paragraph, image, public-asset, and preview-asset behavior remains intact.

Public and Preview Persistence Ownership

Keep theme resolution in the existing page-read persistence boundaries.

PublicPagePersistence published-page resolution additionally left-joins the optional same-site theme row.

PreviewPersistence token-bound page resolution additionally left-joins the optional same-site theme row.

Relationship:

themes.site_id = sites.id

Do not create ThemePersistence, ThemeService, ThemeResolver, or ThemeRepository. Phase N requires no new production boundary.

Contract Ownership

Create:

packages/contracts/src/theme.ts

It owns:

themeColorSchemeSchema
themeFontFamilySchema
themeTokensSchema
DEFAULT_THEME_TOKENS
inferred token types

Extend publicPageResponseSchema to require theme.

Do not add theme fields to authenticated page drafts or canonical PageDocument.

Theme Storage Values

PostgreSQL stores only the token names:

light | dark
sans | serif

The database does not store color values, rgb/hex expressions, CSS font-family strings, or style objects.

Renderer CSS values remain trusted application constants.

Migration

Generate one normal Drizzle migration expected equivalent to:

0010_themes.sql

The exact generated suffix follows repository tooling.

Expected schema change:

+ themes

only.

Do not modify sites or add migration backfill.

Files / Functions

packages/contracts

package.json only to include the focused theme contract test
src/theme.ts
src/theme.test.ts
src/page.ts
src/content.test.ts
src/index.ts

packages/db

src/schema/themes.ts
src/schema/index.ts
src/public-page-persistence.ts
src/preview-persistence.ts
src/index.ts
src/integration.test.ts
migrations/
migrations/meta/

apps/api

src/routes/public.ts
src/routes/preview.ts
src/public.integration.test.ts
src/preview.integration.test.ts

apps/web

src/main.tsx
src/renderer.tsx
src/renderer.test.tsx

Documentation

docs/ARCHITECTURE.md
docs/DOCUMENTATION.md

No admin file belongs to Phase N. No application composition change is expected. No unnamed support surface exists.

Dependencies

No external dependency or workspace edge is expected. Use existing Zod, Drizzle, PostgreSQL, and React capabilities.

bun.lock must remain unchanged.

If an external theme or styling package appears necessary, stop and report the discrepancy rather than adding it.

Contract Verification

Future implementation must prove:

• Valid light/sans tokens
• Valid dark/serif tokens
• Unknown token rejected
• Extra field rejected
• DEFAULT_THEME_TOKENS equals light/sans
• Public page response requires a valid theme

Database Verification

Prove:

• Exactly one themes row per site
• Duplicate site row is database-rejected
• Site deletion cascades its theme row
• No existing table was modified

Public Page Verification

No theme row:

response.theme = DEFAULT_THEME_TOKENS

Persisted dark/serif row:

response.theme = { colorScheme: "dark", fontFamily: "serif" }

Malformed persisted token:

generic HTTP 500

Preview Page Verification

A valid preview credential uses the same current-site semantics:

• No theme row → default
• Valid row → persisted tokens
• Malformed row → generic HTTP 500

Do not repeat the full Phase I credential matrix.

Theme Change Verification

There is no production write API. To prove theme changes affect rendering, an integration test may:

1. Resolve a page without a theme row and observe defaults.
2. Insert or update the site's row directly in test PostgreSQL.
3. Resolve the same public and preview page again.
4. Observe the changed bounded tokens.
5. Render the response and confirm trusted style mapping changes.

Do not add a temporary runtime mutation route.

Renderer Verification

Prove light/sans and dark/serif produce different trusted root style values and that mappings contain only application-owned constants.

Existing heading, paragraph, image, public-asset, and preview-asset rendering must remain intact.

Explicit Exclusions

Phase N does not implement admin theme UI, site settings UI, theme mutation API, named themes, presets/catalogs, inheritance, history, theme previews, custom CSS, remote fonts, CSS injection, a theme package/framework, or any Phase O behavior.

Keep Phase N runtime-only and read-only.

Acceptance Criteria

1. Theme tokens are a strict bounded contract.
2. Default theme is light and sans.
3. Each site has at most one persisted current theme row.
4. Sites without a theme row render with defaults.
5. Persisted valid theme tokens appear in public page responses.
6. Persisted valid theme tokens appear in preview page responses.
7. Malformed persisted theme values fail through generic HTTP 500.
8. Theme state is current site state, not page-version state.
9. Theme changes affect subsequent public and preview reads.
10. Renderer maps tokens only to trusted hard-coded style values.
11. Published and preview asset rendering from Phase M remains unchanged.
12. No theme mutation API exists.
13. No theme admin UI exists.
14. No custom CSS or remote-font behavior exists.
15. No external dependency is added.
16. Phase O remains unstarted.

Output Format

Files created
Files modified
Commands executed
Contract, catalog, public/preview resolution, malformed-state, renderer mapping, and Phase M regression tests

────────

Decision Gate — Failure Feedback and Error Reporting

Problem

Unexpected API failures already return a client-safe generic HTTP 500 through Hono, and normal admin failures already use local component state. However, server failures have no operator log, admin feedback has no standing convention, failures escaping Hono have no explicit Bun-level safe response, and React render failures have no owning phase.

High — Cross-cutting failure-feedback and outer-server error-safety ownership gap: BeHR already fails closed for ordinary propagated Error instances and already surfaces normal admin failures through local component state, but the plan does not assign server-side error logging ownership, does not formalize the existing client feedback convention, does not explicitly govern failures that escape Hono's onError, and does not assign top-level React render-failure handling. Version 1.12 defines those boundaries without introducing a toast framework, logging dependency, telemetry system, or global state abstraction.

This decision does not reopen Phase N.

Decision A — Admin Feedback Convention

Preserve the existing inline feedback convention.

Use local role="alert" for persistent workflow failures including field/form validation, resource-load failure, save failure, mutation failure, and action failure where the initiating control remains visible.

Keep feedback near the form, editor, resource, or action that owns it. Do not replace local state with a shared error-state framework.

Use role="status" for loading, saving, successful completion, and non-error progress state.

Do not require a generic shared state type across components.

No Toast Framework

Do not add a toast provider, notification context, global reducer/store, event bus, portal framework, auto-dismiss framework, or third-party notification dependency.

A shared transient notification primitive is authorized only when a later concrete workflow cannot reasonably retain useful feedback near its initiating control. Do not build it prospectively or retrofit existing inline feedback merely for visual uniformity.

Phase O Feedback Rule

Phase O follows:

field/settings validation → inline alert
load failure              → inline alert
save failure              → inline alert
saving                    → inline status
successful save           → inline status

Phase O alone does not justify a toast system.

Decision B — Layered Server Failure Boundaries

Establish two distinct boundaries:

Request handler
    ↓
Hono application
    ↓
app.onError
    ↓
Bun server
    ↓
Bun server error handler

Hono app.onError owns:

propagated Error instance
    ↓
safe structured request-error log
    ↓
generic JSON HTTP 500

Bun server error owns:

failure that escapes Hono
    ↓
safe minimal server-error log
    ↓
generic JSON HTTP 500

Do not collapse these responsibilities into a logging framework.

Pinned Hono Behavior

Hono 4.13.5 routes thrown Error instances through configured app.onError and rethrows non-Error values outside Hono.

There is no requirement to normalize non-Error throws inside app.onError. Such a requirement is unreachable under the pinned behavior and must not be reintroduced.

Client-Safe Primary Invariant

Every request-handling failure reaching either governed boundary returns exactly:

500
{"error":"Internal server error."}

Logging is secondary to fail-closed response behavior. Logging failure must never be required for the response to remain safe.

Existing Integrity Error Paths

Malformed persisted draft:

resolvePageDraft
    ↓
toPageDraft
    ↓
pageDocumentSchema.parse
    ↓
Error propagates to app.onError

Malformed published page/theme:

resolvePublishedPage
    ↓
publicPageResponseSchema.parse
    ↓
Error propagates to app.onError

Missing authoritative asset bytes:

authorized asset metadata
    ↓
AssetStorage.readOriginal
    ↓
filesystem readFile
    ↓
Error propagates to app.onError

These are unhandled integrity failures, not routine locally translated responses, and are intentionally included in request-error logging.

The later baseline must re-read application.ts, pages.ts, public.ts, preview.ts, and asset-storage.ts before implementation. If any named path has changed to construct a local HTTP 500, stop and report it rather than adding route-level logging or relying on an inaccurate boundary model.

Decision C — React Render Failure Ownership

Top-level React render/lifecycle failure handling is required but belongs to Phase P, not the Error Reporting Baseline or Phase O.

Phase P must add separate top-level generic render-failure fallbacks for the admin application and the public/preview web application. Internal exception details must not be rendered.

Native React boundaries own render/lifecycle failures only. They do not claim to catch event-handler exceptions, arbitrary rejected promises, or server failures.

Do not require a third-party boundary package, global state, event bus, client logger, telemetry SDK, or shared boundary package. Admin and public web may use separate small native implementations.

Client Telemetry Exclusion

Server-side Hono/Bun handling observes server request failures only. Browser exception reporting would require separate governance for endpoint ownership, validation, privacy, redaction, rate limiting, and abuse resistance.

No client telemetry endpoint is authorized. Do not add POST /errors, POST /telemetry, or POST /client-logs.

Phase P error boundaries provide graceful degradation only.

Decision Outcome

The inline admin convention is selected. The Error Reporting Baseline must complete before Phase O. React render boundaries are assigned to Phase P. Client telemetry remains unauthorized.

────────

Error Reporting Baseline

Task

Establish safe server-side error reporting and an outer fail-closed Bun boundary.

Objective

Record unexpected server failures without exposing sensitive diagnostics to clients or logs.

Hono Request Error Logging

For each Error reaching app.onError, emit exactly one JSON record to stderr equivalent to:

{
  "timestamp": "2026-09-01T00:00:00.000Z",
  "level": "error",
  "event": "unhandled_request_error",
  "method": "GET",
  "pathname": "/public/page",
  "errorType": "ZodError"
}

Use one call equivalent to console.error(JSON.stringify(record)). Do not add a logging dependency.

The Hono record contains exactly timestamp, level, event, method, pathname, and bounded errorType.

pathname excludes query strings.

Bounded Error Type

Use an actual class/name only when it is a safe bounded identifier such as Error, ZodError, or PostgresError. Otherwise use Error.

Do not serialize arbitrary exception properties or create a classifier hierarchy.

Logging Redaction

Never log query strings, headers, cookies, authorization, bodies, response bodies, preview/invitation tokens, session IDs, passwords, multipart data, asset bytes, or physical storage paths.

Never log error.message, error.stack, or error.cause. Raw error text may contain paths, SQL details, user-controlled values, configuration values, or runtime internals.

The v1 baseline prioritizes guaranteed redaction over maximal diagnostics.

Bun Outer Error Boundary

Add an explicit Bun server-level error callback to the server options exported by ApiApplication.

ApiApplication.server may expand only to expose port, fetch, and error.

Failure escaping Hono:

Hono fetch rejects or throws
    ↓
Bun server error callback
    ↓
minimal structured stderr record
    ↓
generic JSON HTTP 500

Do not rely on Bun's implicit/default error page.

Development Server Safety

The integrated development Bun.serve({ development: true }) listener must receive the same application-owned outer error callback.

Development mode does not authorize returning contextual stack/error pages. The explicit callback must continue returning the exact generic JSON 500.

Bun Outer Log

An escaped failure emits exactly one record equivalent to:

{
  "timestamp": "2026-09-01T00:00:00.000Z",
  "level": "error",
  "event": "unhandled_server_error",
  "errorType": "Error"
}

The Bun callback does not own request context. Do not invent method, path, hostname, tenant, or user fields, and do not add global mutable request context.

Use only a safe bounded type if available; otherwise Error. Do not log message, stack, cause, or raw thrown value.

Handled and Unhandled Matrix

Required executed evidence:

Failure          Hono log                    Bun outer log               Client
Handled 404      none                        none                        existing 404
Propagated Error exactly one request event   none                        generic JSON 500
Escaped non-Error none                       exactly one server event    generic JSON 500

Do not report this matrix from source inspection alone.

Propagated Error Control

Register a test-only route on the test application equivalent to:

GET /__test/unhandled-error
throw new Error("Synthetic diagnostic that must not be logged.")

Capture stderr and prove generic JSON 500, exactly one unhandled_request_error, zero server events, method/pathname/bounded type present, and raw message/query absent.

Handled-Failure Negative Control

Exercise an existing handled failure such as GET /preview/page?slug=about without X-BeHR-Preview-Token.

Prove HTTP 404 and zero request/server error events. This Rule 15 exclusion control is mandatory.

Non-Error Throw Control

Register a test-only route only on the test application equivalent to:

GET /__test/non-error
throw "SENSITIVE_NON_ERROR_VALUE"

Do not add it to production composition.

First prove the value escapes Hono and does not invoke app.onError.

Then start an actual temporary Bun.serve listener using the application's real fetch and error server options. Request:

GET /__test/non-error?secret=DO_NOT_EXPOSE

Expected:

HTTP 500
Content-Type: application/json
{"error":"Internal server error."}

application.app.request is insufficient for this acceptance criterion because the behavior belongs outside Hono.

Prove the response contains none of SENSITIVE_NON_ERROR_VALUE, DO_NOT_EXPOSE, stack traces, or Bun contextual error output. Prove the stderr record contains neither sensitive value and uses unhandled_server_error rather than unhandled_request_error.

Repeat the actual temporary listener control with development: true and prove the same safe generic JSON response rather than Bun's development error page.

Existing Integrity Runtime Evidence

Re-run existing integration coverage for malformed persisted draft/public state and missing authorized asset bytes where those cases already exist. Confirm they produce the Hono unhandled_request_error event.

Do not duplicate integrity scenarios solely for logging. If a named scenario lacks existing allowed coverage, report that specific logging observation as NOT RUN after directly verifying source propagation.

Error Reporting Surface

apps/api/src/application.ts
apps/api/src/index.test.ts
apps/api/src/development.ts
docs/ARCHITECTURE.md
docs/DOCUMENTATION.md

development.ts is required so the integrated listener uses the explicit outer handler.

Do not add a logging module, test-only production file, dependency, package script, or lockfile change.

Local Policy Functions

Small functions in application.ts are justified only when they own actual policy, such as creating the internal response or writing the bounded request/server records.

Do not create Logger, LoggingService, ErrorManager, ErrorReporter, ObservabilityProvider, or another application/composition layer.

Operational Sink

The v1 sink is process stderr only.

Do not add application log files, rotation, syslog client, OpenTelemetry, Sentry, Datadog, ELK, remote collection, or a worker. Phase Q may later own service/journal collection and request logging.

Acceptance Criteria

1. Existing integrity Error paths are confirmed to propagate to Hono app.onError.
2. Propagated Error instances produce exactly one unhandled_request_error record.
3. Propagated Error instances return generic JSON 500.
4. Ordinary handled failures produce no error log.
5. Hono non-Error bypass is explicitly documented.
6. No requirement claims non-Error values are normalized inside app.onError.
7. An explicit Bun server error callback owns failures escaping Hono.
8. A real HTTP request proving a non-Error throw returns generic JSON 500.
9. The same behavior is proven with Bun development mode enabled.
10. Non-Error response/logs expose neither raw value nor query data.
11. Escaped failures produce exactly one unhandled_server_error record.
12. Hono logs contain only timestamp, level, event, method, pathname, and bounded error type.
13. Bun outer logs contain only timestamp, level, event, and bounded error type.
14. Raw message, stack, cause, bodies, headers, cookies, credentials, tokens, session IDs, physical paths, and query strings are not logged.
15. No route-level unexpected-error logging is added.
16. No production test endpoint is added.
17. No logging dependency is added.
18. Generic JSON HTTP 500 remains exactly {"error":"Internal server error."}.

Output Format

Files modified
Commands executed
Handled, propagated Error, escaped non-Error, redaction, development-mode, and integrity-path evidence

────────

Phase O — Theme and Settings UI

Task

Implement theme and settings management.

Objective

Expose controlled customization.

Ownership Correction

High — Phase O settings-mutation ownership gap: Version 1.12 requires theme selection and site settings management without defining the editable settings, authorization boundary, API contract, persistence operation, or implementation surface. Version 1.13 defines one minimal owner-controlled settings resource consisting only of the existing site name and Phase N theme tokens. Hostname remains read-only and domain administration remains out of scope.

High — Phase O route-composition test surface omission: Phase O widens SitePersistence with resolveSiteSettings and updateSiteSettings, while the existing apps/api/src/routes/index.test.ts CORS regression constructs a structural SitePersistence fake. The widened interface therefore produces TypeScript TS2739 until that existing fake includes the two required members. Version 1.14 adds only this existing test file to the Phase O surface for structural compatibility. It does not expand Phase O behavior, route composition, or test coverage.

This correction does not reopen Phase N or the Error Reporting Baseline. Phase P remains unstarted.

Settings Resource Model

Phase O exposes exactly:

{
  name: string;
  theme: {
    colorScheme: "light" | "dark";
    fontFamily: "sans" | "serif";
  };
}

The site name is the existing sites.name value. Theme tokens remain exactly the Phase N ThemeTokens contract.

Do not add another configurable setting.

Hostname and Domain Boundary

The current hostname belongs to the separate domains relation and is already present in SiteSummary.

Phase O may display hostname only as read-only context.

Do not implement hostname editing, domain replacement, additional domains, aliases, redirects, DNS verification, or TLS/domain configuration. Do not modify the domains table.

Theme Selection

Theme selection means choosing only:

color scheme → light | dark
font family  → sans | serif

The existing one-row-per-site themes row remains the sole persisted theme state.

Do not add theme IDs, names, presets, catalogs, an active-theme pointer, history, duplication, or preview records.

Authorization

Settings read and mutation are owner-only.

Required role:

tenantAccess.role === "owner"

A tenant member does not receive the settings editor and cannot use the settings API. Do not introduce a site-level role model.

Reuse createRequireAuthentication, createRequireTenantMembership, and createRequireTrustedOrigin.

GET settings:

authenticated
    ↓
tenant membership
    ↓
owner
    ↓
valid same-tenant site

PUT settings:

authenticated
    ↓
tenant membership
    ↓
owner
    ↓
trusted origin
    ↓
valid same-tenant site

Do not introduce new authentication or authorization middleware.

HTTP Resource

Add exactly:

GET /tenants/:tenantId/sites/:siteId/settings
PUT /tenants/:tenantId/sites/:siteId/settings

Implement both within apps/api/src/routes/sites.ts. The site router is already mounted at /tenants/:tenantId/sites, so no route-composition change is required.

Do not create routes/settings.ts or routes/themes.ts.

Site Settings Contract

Define one strict response equivalent to:

{
  site: {
    id: string;
    name: string;
    hostname: string;
  };
  theme: {
    colorScheme: "light" | "dark";
    fontFamily: "sans" | "serif";
  };
}

Use siteSettingsResponseSchema and reuse siteSummarySchema and themeTokensSchema rather than duplicating validation.

Define one strict update request equivalent to:

{
  name: string;
  theme: ThemeTokens;
}

Use updateSiteSettingsRequestSchema. The name uses the same trimming and length limits as site creation. Extract and reuse siteNameSchema within packages/contracts/src/site.ts rather than duplicating or changing the established name rule.

HTTP Outcomes

Successful GET:

200
SiteSettingsResponse

Successful PUT:

200
SiteSettingsResponse

Invalid siteId or a site outside the authoritative tenant:

404
{"error":"Site not found."}

Member settings access:

403
{"error":"Site settings are not allowed."}

Invalid update body:

400
{"error":"Site settings request is invalid."}

Unexpected persistence or validation failures continue through the Error Reporting Baseline and generic HTTP 500. Do not add an error framework.

Persistence Ownership

Extend the existing SitePersistence with only focused operations equivalent to:

resolveSiteSettings(tenantId, siteId)
updateSiteSettings(tenantId, siteId, name, theme)

Do not create ThemePersistence, SettingsPersistence, SiteSettingsRepository, ThemeService, or SettingsService.

Settings are current site-owned state and belong in the existing site persistence boundary.

Resolve Settings

resolveSiteSettings joins:

sites
  INNER JOIN domains
  LEFT JOIN themes

scoped by:

sites.tenant_id = tenantId
sites.id = siteId

Return persisted theme values as nullable raw data. The API applies DEFAULT_THEME_TOKENS only when no themes row exists.

If a themes row exists with unsupported values, siteSettingsResponseSchema.parse throws, the existing Hono boundary emits unhandled_request_error, and the client receives generic HTTP 500.

Do not silently replace a malformed persisted theme with defaults. Only row absence receives the default.

Atomic Settings Update

updateSiteSettings must update:

sites.name
themes.color_scheme
themes.font_family

within one database transaction.

Required invariant:

site name write succeeds
AND
theme write succeeds
OR
neither persists

Do not split the writes across independent requests or transactions.

Use the existing one-row-per-site theme authority:

INSERT themes (...)
ON CONFLICT (site_id)
DO UPDATE

The first save creates the row when absent. Later saves update that same row. Selecting light/sans may remain explicitly persisted; do not delete the row solely because it equals DEFAULT_THEME_TOKENS.

The transaction must not update domains.hostname or another domain field.

Schema Boundary

Phase O uses the existing sites, themes, and domains tables.

No table, column, schema file, migration, or migration-metadata change is required. If implementation appears to require one, stop and report the discrepancy.

Admin Settings Editor

Create one focused component:

apps/admin/src/SiteSettings.tsx

It owns loading current settings, editing the site name, selecting color scheme and font family, saving the complete settings resource, and local validation/error/status feedback.

Render exactly the necessary controls:

Site name       → text input
Hostname        → read-only text
Color scheme    → Light / Dark select
Font family     → Sans / Serif select
Save settings   → button

Do not add a settings framework, live-preview framework, CSS editor, or arbitrary theme-token input.

Owner-Only Rendering

SitesPage renders SiteSettings only when the selected tenant role is owner and the selected site exists in current tenant-keyed loaded site state.

Members retain the existing site/page workflow. Do not add a settings navigation framework.

Async Settings Identity

SiteSettings is keyed by tenantId and siteId. Its asynchronous state carries those authoritative identifiers.

A late load or save for site A must not update settings or site-list state now owned by site B.

Use resource-keyed local state, effect cleanup for late loads, functional parent updates, and identity checks before applying asynchronous results.

Do not add a global store, React context, settings reducer, mirrored current-resource ref, or generic request manager.

Updating Existing Site State

A successful save returns the updated SiteSummary within SiteSettingsResponse.

SitesPage updates the matching site name in its existing tenant-keyed SiteState through a functional updater only when:

• Current state is loaded
• Current tenantId equals the initiating tenantId
• The matching siteId exists

Hostname remains unchanged. Do not reload the complete site list solely to display the new name.

Feedback Convention

Field/settings validation, load failure, save failure, and action failure remain near their initiating control and use role="alert".

Settings loading, saving, and successful completion use role="status". The save control may also be disabled while saving.

Phase O does not add a toast provider, notification context/store, event bus, or shared error-state framework.

Contract Verification

Extend apps/api/src/site-contract.test.ts. Do not create another contract test file.

Prove:

• Existing site-name trimming remains unchanged
• Valid light/sans and dark/serif updates are accepted
• Blank or overlong names are rejected
• Unsupported theme tokens are rejected
• Extra request fields are rejected
• Settings responses require valid themes and reject extra fields

Keep coverage focused rather than building a combinatorial matrix.

API Integration

Extend apps/api/src/site.integration.test.ts with one focused sequential settings lifecycle.

Prove:

1. Owner GET without a themes row returns the existing SiteSummary and DEFAULT_THEME_TOKENS.
2. Member settings access returns nondisclosing HTTP 403.
3. Invalid update returns HTTP 400 with no mutation.
4. Owner PUT atomically changes the site name and theme to dark/serif.
5. Hostname remains unchanged.
6. Exactly one themes row exists.
7. The existing site list reflects the renamed site.
8. A second PUT updates the same themes row rather than inserting another.
9. Cross-tenant and nonexistent sites return nondisclosing HTTP 404.
10. PUT without trusted origin is rejected with no mutation.

Do not duplicate the complete Phase E site-creation matrix.

Renderer Acceptance

Phase N already proves that the current themes row flows through public/preview responses into PageRenderer's trusted style mapping.

Phase O proves only that its mutation writes the same authoritative themes row. Existing Phase N public, preview, and renderer regressions remain the rendering proof and must remain green in exact-commit CI.

Do not create another renderer or cross-layer end-to-end suite solely to repeat Phase N.

Admin Verification

Create apps/admin/src/SiteSettings.test.ts and add it to the existing apps/admin/package.json test script.

Without adding DOM infrastructure, prove:

• GET uses the expected tenant/site settings path
• PUT uses the same path with credentials: "include"
• PUT contains only normalized name and bounded theme values
• Successful responses are parsed through the shared contract
• Invalid local input is rejected before request creation
• A tenant/site identity guard does not apply a late result to another tenant

Files / Functions

packages/contracts

src/site.ts
src/index.ts

packages/db

src/site-persistence.ts

apps/api

src/routes/sites.ts
src/routes/index.test.ts
src/site-contract.test.ts
src/site.integration.test.ts

apps/api/src/routes/index.test.ts is authorized only to add fail-fast unused resolveSiteSettings and updateSiteSettings members to its existing SitePersistence fake. This compatibility-only edit exists because the Phase O interface expansion makes that structural fake incomplete. It does not authorize new settings or CORS coverage, assertions, route-composition changes, test refactoring, mock helpers, fixture infrastructure, or changes to another persistence fake. If either added method is invoked or another incompatibility appears, stop and report the newly reached behavior rather than making the fake operational.

apps/admin

package.json
src/SitesPage.tsx
src/SiteSettings.tsx
src/SiteSettings.test.ts

Documentation

docs/ARCHITECTURE.md
docs/DOCUMENTATION.md

No unnamed support surface exists.

Do not modify schema files, migration files or metadata, apps/api/src/application.ts, apps/api/src/routes/index.ts, apps/web, packages/editor, packages/ui, or bun.lock.

Dependencies

Use existing Zod, Drizzle, Hono, React, and requestApi boundaries.

No external dependency, workspace edge, or bun.lock change is expected.

Do not add a form, settings, theme, state, toast, or CSS framework.

Explicit Exclusions

Phase O does not implement domain administration, hostname mutation, named themes, theme presets/catalog, history/versioning, custom colors, arbitrary CSS, remote fonts, a live-preview framework, publish or preview-token controls, asset-management changes, a generic settings table/API, toast system, global state, React error boundaries, client telemetry, or Phase P behavior.

Acceptance Criteria

1. Owner can load settings for the selected same-tenant site.
2. Missing theme row resolves to Phase N defaults.
3. Owner can update site name and bounded theme together.
4. Site name and theme update atomically.
5. First save creates the site's single themes row when absent.
6. Later saves update the same row.
7. Hostname is displayed but cannot be changed.
8. Member cannot access settings management.
9. Invalid input causes no mutation.
10. Cross-tenant or nonexistent site remains nondisclosing.
11. PUT requires trusted origin.
12. Malformed persisted theme fails through the existing generic HTTP 500 boundary.
13. Existing public/preview rendering observes saved theme through Phase N semantics.
14. Admin async state cannot apply a late result to another tenant/site.
15. Load, validation, save, and action failures use local alert semantics.
16. Loading, saving, and successful completion use local status semantics.
17. No schema or migration changes occur.
18. No new dependency or lockfile change occurs.
19. No toast, global-state, settings, or theme framework is added.
20. Phase P remains unstarted.

Output Format

Files created
Files modified
Commands executed
Contract, authorization, atomic persistence, admin identity, feedback, scope, and regression evidence

────────

Phase P — UX Refinement

Task

Improve usability.

Objective

Enhance workflow efficiency.

Ownership Correction

High — Phase P UX ownership and verification gap: Version 1.14 names validation refinement, drag-and-drop, and top-level React failure handling without defining their exact behavior, ownership boundaries, implementation files, or verification. Version 1.15 makes native drag-and-drop required for existing editor ordering, confines validation refinement to current page-authoring contracts, and assigns two local native React error boundaries without introducing backend changes, toast infrastructure, a drag/drop dependency, or a client telemetry system.

This correction does not reopen Phase O. Phase Q remains unstarted.

Required Behavior

Phase P must:

• Improve validation UX only for PageCreateForm and PageEditor
• Add native drag-and-drop ordering for existing page sections and blocks
• Add equivalent Move Up and Move Down controls
• Add a top-level render error fallback for the admin application
• Add a top-level render error fallback for the shared public/preview web application

Phase P must not change the content contract, persistence model, HTTP contracts, or Phase O settings/theme mutation semantics.

Reordering Scope

Support exactly:

section reorder
block reorder within its current section

A block cannot move to another section. Do not add nested section moves, cross-page drag, asset-picker drag, file-upload drag/drop, page ordering, or site ordering.

Reordering changes only array order within the existing PageDocument. It must preserve schemaVersion, section and block IDs, block types and content, styles, asset IDs, and alternative text.

No content-contract or persistence-model change is authorized.

Editor Domain Ownership

The existing framework-free packages/editor boundary owns exactly two focused immutable operations equivalent to:

moveSection(document, sectionId, targetIndex)
moveBlock(document, sectionId, blockId, targetIndex)

Do not add a drag service, reorder manager, command/action system, reducer, operation registry, or generic patch API.

moveSection Semantics

moveSection resolves one section by ID and moves the complete section to a target index within the existing section-array range.

It preserves complete section values and relative order of unaffected sections. It returns a new document only when order changes.

Return the original document when the section is missing, the target index is invalid, or the source already occupies the target index. Never mutate the input document or arrays.

moveBlock Semantics

moveBlock resolves the containing section and block by ID and moves the complete block only within that same section.

It preserves complete block values, relative order of unaffected blocks, and every other section. It returns the original document for a missing section/block, invalid target, or no-op destination.

The operation accepts no destination section ID. Cross-section movement is therefore unavailable through the Phase P editor API.

Native Browser Dragging

Use native HTML drag-and-drop. Do not add dnd-kit, react-dnd, sortablejs, or another drag/drop dependency.

PageEditor may hold one component-local active descriptor equivalent to:

{ kind: "section"; sectionId: string }
or
{ kind: "block"; sectionId: string; blockId: string }

This state exists only while dragging. Do not add drag context, a global store, reducer, registry, or generic event manager.

DataTransfer may be used only to initiate native browser dragging. It is not document authority. The component-local descriptor identifies the BeHR resource; external, absent, or mismatched drag payloads are ignored.

Dropping a section at position N invokes moveSection. Dropping a block at position N invokes moveBlock only when the dragged and target section IDs match. A block from section A dropped on section B must not move.

Dropping changes only current local editor state. It does not autosave. The existing explicit Save draft action remains the only persistence trigger.

Accessible Reordering

Every reorderable section and block also exposes Move Up and Move Down controls using the same moveSection and moveBlock operations.

Disable or omit impossible movement at the first and last positions. These controls provide keyboard and touch/mobile operation without another reorder system.

Do not use deprecated aria-grabbed or aria-dropeffect.

Validation Scope and Authority

Validation refinement applies only to PageCreateForm and PageEditor. Do not retrofit login, invitation registration, member provisioning, site creation, or site settings.

Immediate client feedback derives from existing shared Zod contracts. Server validation remains authoritative.

Do not add a validation service/context, form framework, duplicated schema, or new HTTP field-error contract.

Page Creation Validation

PageCreateForm refines only title and slug behavior using createPageRequestSchema and the existing pageTitleSchema/pageSlugSchema semantics. Do not change those contracts.

Field errors appear only after the relevant field has been interacted with, such as blur, or after explicit submit. Initial render has no validation error.

Invalid title or slug controls use aria-invalid and aria-describedby linked to their inline field message.

An invalid explicit submit sends no request, exposes all relevant field errors, and focuses the first invalid field where practical.

The existing page-creation HTTP 409 specifically represents a duplicate site-local slug and may map to the slug field with feedback equivalent to:

That slug already exists in this site.

Do not generalize other 409 responses into field errors. Other request failures remain form-level feedback equivalent to:

The page could not be created.

Do not expose response bodies, Zod issues, SQL, or internal errors.

Page Editor Validation

Editor field-level errors originate only from pageDocumentSchema.safeParse of the current local document.

Map currently actionable empty heading.text and paragraph.text issues to their existing text controls using the Zod issue path and the corresponding current block ID.

Do not build a generic schema-path framework. Unknown or unmapped document errors remain generic form-level validation feedback.

Empty Image Alternative Text

Preserve image alt as z.string(), including alt = "". Empty alternative text represents a decorative image and remains valid.

It does not produce a field error or disable saving. Do not add a decorative-image toggle.

Phase P may add a non-blocking hint associated through aria-describedby equivalent to:

Empty alternative text marks this image as decorative. Leave it empty only when the image is purely decorative.

Explicit Save Validation

Before draft-save HTTP submission, parse the current document with pageDocumentSchema.safeParse.

When invalid:

1. Send no request.
2. Preserve all local edits.
3. Populate client-derived inline field errors.
4. Show a form-level summary equivalent to "Fix the highlighted page content before saving."
5. Focus the first mapped invalid block input where practical.

Manual save remains explicit. Do not autosave when content becomes valid.

A small PageEditor-local preparation result is permitted when it owns current save validation, equivalent to:

{
  request: SavePageDraftRequest | null;
  fieldErrors: Readonly<Record<string, string>>;
  formError: string | null;
}

fieldErrors is keyed by existing block/field identity. Do not create a generic validation-result package.

When a user edits a field with an inline error, clear or refresh that stale field error. Revalidate on blur or the next explicit save rather than emitting validation alerts on every keystroke.

Server Save Failures

The existing draft-save HTTP 400 intentionally combines invalid request and invalid asset reference into:

400
{"error":"Page request is invalid."}

It cannot identify a block, asset, or missing/wrong-site condition and therefore remains form-level generic save feedback. Do not add server-supplied fieldErrors or map this response to a field.

Normal draft save has no optimistic-lock or stale-save HTTP 409. Do not introduce "Draft changed elsewhere" behavior. Publication has separate stale-candidate semantics, but Phase P adds no publish UI.

Any non-success draft-save result not already prevented through client validation remains bounded form-level feedback equivalent to:

The draft could not be saved.

Do not expose internal errors, Zod details, database values, asset-scope detail, or theme corruption.

No Toast System

Phase P adds no Toast, ToastProvider, ToastContext, notification queue/timer, portal, or global notification state.

All current validation and outcome feedback remains beside its initiating control. Do not add toast-ready infrastructure prospectively.

Admin React Failure Boundary

Add one small native React class error boundary directly in apps/admin/src/main.tsx around App at the application mount.

On a React render/lifecycle failure beneath it, render generic fallback UI equivalent to:

BeHR admin is unavailable.
Reload the page to try again.

Do not render error messages, stacks, component stacks, internal types, user/session data, or send the error elsewhere.

Public and Preview React Failure Boundary

Add a separate small native React class error boundary directly in apps/web/src/main.tsx around the existing web App.

The one boundary covers both published and preview modes because they share the same web application.

Render generic fallback UI equivalent to:

Page unavailable.
Reload the page to try again.

Do not expose exceptions or preview credentials.

Failure-Boundary Limits

The boundaries own React render/lifecycle failures beneath their mounted roots only. They do not claim to catch event-handler exceptions, arbitrary rejected promises, server/API failures, or errors before the React root mounts.

Do not add window error or unhandledrejection handlers.

No client telemetry is authorized. Do not add POST /errors, POST /telemetry, POST /client-logs, Sentry, OpenTelemetry, a browser logger, or componentDidCatch reporting. getDerivedStateFromError plus local failed state is sufficient.

Theme Ownership

Phase O owns the one production site-theme mutation surface. Phase P adds no new theme writer and does not modify Phase O site-settings mutation semantics.

Do not modify theme persistence, site settings APIs, theme contracts, or renderer theme mapping.

Backend and Contract Boundary

Phase P changes nothing under apps/api, packages/db, or packages/contracts.

Add no route, HTTP response field, persistence operation, schema, table, migration, or migration metadata.

Files / Functions

packages/editor

src/index.ts
src/index.test.ts

apps/admin

src/PageCreateForm.tsx
src/PageList.test.ts
src/PageEditor.tsx
src/PageEditor.test.ts
src/main.tsx

apps/web

src/main.tsx

Documentation

docs/ARCHITECTURE.md
docs/DOCUMENTATION.md

Do not modify package manifests, App.tsx, SitesPage.tsx, SiteSettings.tsx, an API/database/contracts file, or another documentation file. No unnamed support surface exists.

Dependencies

Use existing React, @bher/contracts, @bher/editor, and native browser drag/drop.

No dependency, workspace edge, package-manifest, or bun.lock change is expected.

Verification

Editor-domain tests must prove focused immutable section and same-section block movement in both directions, complete value/style preservation, unaffected relative order, other-section preservation, and original identity for missing, no-op, or invalid moves.

PageList.test.ts must prove valid title/slug input, isolated title and slug errors, and distinct slug-conflict classification without a server field-error payload.

PageEditor.test.ts must prove empty heading and paragraph field errors, valid empty image alt, form-level handling for unmapped invalid state, no request for client-invalid content, valid canonical request preparation, and preservation of existing edit-during-save and late-save guards.

Pure transforms are the automated authority for ordering. Do not add DOM testing infrastructure solely for native drag events.

Manual Browser Acceptance

Where browser execution is available, verify section and same-section block drag, Move Up/Down equivalence, cross-section rejection, explicit save/reload persistence, page-creation field accessibility, editor inline validation, decorative-alt guidance, no autosave, and the admin/web generic render-failure fallbacks through temporary local render throws removed before final diff.

Do not add a production failure route, query flag, environment flag, or committed fault. If a manual control is not executed, report it as NOT RUN rather than inferring it from transform tests.

Regression Boundaries

Preserve explicit manual draft save, tenant/site/page load identity, save operation identity, same-page request epochs, asset-list identity, asset picker ownership, image asset identity, and Phase O settings semantics.

Do not add autosave, debounce, save-on-drop, save-on-blur, a save queue, background write, optimistic remote synchronization, file drag/upload, or a requirement for non-empty image alt.

Acceptance Criteria

1. Sections can be reordered through native drag-and-drop.
2. Blocks can be reordered through native drag-and-drop within their existing section.
3. Blocks cannot move between sections.
4. Move Up/Down controls provide an equivalent non-drag ordering mechanism.
5. Reorder operations are pure and immutable in @bher/editor.
6. Reorder no-ops preserve original document identity.
7. Reordering does not change the PageDocument contract.
8. Reordering never autosaves.
9. Explicit save persists reordered array order through the existing API.
10. Page-creation title/slug validation is inline and contract-derived.
11. Existing slug conflict maps to the slug field.
12. Page-editor heading/paragraph text validation is inline and contract-derived.
13. Empty image alt remains valid.
14. Decorative-alt guidance is non-blocking.
15. Client-invalid page content sends no save request.
16. Generic server HTTP 400 remains form-level and exposes no field-error payload.
17. No draft-save stale HTTP 409 behavior is introduced.
18. No API, content, or persistence contract changes occur.
19. Admin has a top-level generic React render-failure fallback.
20. Public/preview web has one top-level generic React render-failure fallback.
21. Internal exception details and preview credentials are not rendered.
22. Error boundaries claim only React render/lifecycle coverage.
23. No browser exception telemetry endpoint or global handler exists.
24. No toast system is added.
25. Existing inline feedback elsewhere remains valid and is not retrofitted.
26. Phase P adds no additional theme writer.
27. No external dependency or lockfile change occurs.
28. Phase Q remains unstarted.

Output Format

Files modified
Commands executed
Reorder, validation, accessibility, error-boundary, regression, dependency, scope, and manual-browser evidence

────────

Phase Q — Production Operations Lock

Task

Finalize operational readiness.

Objective

Make system deployable and recoverable.

Ownership Correction

High — Phase Q production-operations ownership and recoverability gap: Version 1.15 requires deployment, nginx, systemd, backup, restore, and health integration without defining the production network boundary, host routing, TLS ownership, filesystem layout, backup consistency, restore safety, deployment lifecycle, or verification surface. Version 1.16 defines one single-VPS Linux deployment with nginx as the only externally exposed service, a loopback-only Bun API, operator-managed TLS, maintenance-window database-plus-asset backups, bounded destructive restore semantics, and one deterministic deployment workflow without adding business behavior, distributed infrastructure, or an operations framework.

This correction does not reopen Phase P.

Supported Production Model

Phase Q targets one Linux VPS:

nginx
    ↓
one Bun API process
    ↓
PostgreSQL
local asset filesystem

PostgreSQL may be local to the VPS or externally hosted when operationally justified. The API remains one process.

Do not add Docker, Kubernetes, containers as deployment authority, load balancers, multiple API processes, workers, queues, Redis, object storage, or service discovery.

Required Host Capabilities

The operator-provisioned host supplies Linux, systemd, nginx, Bash 5+, Bun 1.4.0, git, curl, tar, gzip, sha256sum, flock, openssl, and PostgreSQL client tools psql, pg_dump, and pg_restore.

Package installation is outside BeHR scripts. Do not add apt, yum, or other host-package automation.

Production Filesystem Layout

Use exactly:

Application          /opt/bhr-cms
Environment          /etc/bhr-cms/bhr-api.env
Asset originals      /var/lib/bhr-cms/uploads
Backups              /var/backups/bhr-cms
TLS certificate      /etc/bhr-cms/tls/fullchain.pem
TLS private key      /etc/bhr-cms/tls/privkey.pem
systemd service      bhr-api.service
service user/group   bhr-cms:bhr-cms

User creation and initial directory provisioning are operator responsibilities. Deployment validates these prerequisites rather than creating a new host-security model.

Required production permissions are equivalent to:

/etc/bhr-cms/bhr-api.env      root:root       0600
/var/lib/bhr-cms/uploads      bhr-cms:bhr-cms 0750
/var/backups/bhr-cms          root:root       0700
/etc/bhr-cms/tls/privkey.pem  root-only readable

Never print environment-file or private-key contents.

API Network Boundary

The production Bun API listens only on 127.0.0.1. nginx is the sole externally listening HTTP service.

Extend ApiApplication.server with hostname: "127.0.0.1" or an equivalent fixed loopback value. This is an operational binding correction, not product behavior.

Do not add API_HOST, API_BIND_ADDRESS, LISTEN_INTERFACE, a host configuration object, or a network-service abstraction. The integrated development server retains its existing explicit development hostname.

Production verification must use a real built API and Linux socket inspection such as ss to prove 127.0.0.1:<API_PORT> is listening while 0.0.0.0:<API_PORT> and [::]:<API_PORT> are not. Source inspection alone is insufficient.

Production Environment Contract

/etc/bhr-cms/bhr-api.env contains the existing runtime variables as shell-compatible KEY=value assignments, quoted where necessary. Phase Q adds no application secret format or secret manager. Deploy, backup, and restore may source this root-owned file without printing it.

Deployment validates:

• NODE_ENV=production
• ADMIN_ORIGIN uses HTTPS
• BETTER_AUTH_URL uses HTTPS
• ADMIN_ORIGIN equals BETTER_AUTH_URL
• Neither origin contains a non-default explicit port
• API_PORT is a valid TCP port
• ASSET_STORAGE_ROOT=/var/lib/bhr-cms/uploads
• DATABASE_URL is present
• BETTER_AUTH_SECRET is present

The same-origin rule preserves the current relative admin HTTP model. Do not duplicate these checks in application contracts.

Derive the admin hostname from ADMIN_ORIGIN. Do not add BHR_ADMIN_HOST. The deploy script may use the installed Bun runtime for URL parsing instead of ad hoc shell parsing.

The admin hostname is reserved and cannot also be a tenant public domain. Deployment queries PostgreSQL and rejects when domains.hostname equals the production admin hostname. This is an operational preflight, not a new database constraint or domain API.

TLS Ownership

nginx uses:

/etc/bhr-cms/tls/fullchain.pem
/etc/bhr-cms/tls/privkey.pem

Certificate provisioning and renewal are external operator responsibilities. Do not implement Certbot, ACME, DNS automation, certificate workers/daemons, TLS tables, or domain verification.

The installed operator-managed certificate must cover every tenant hostname intended to be reachable over HTTPS, through a suitable wildcard, SAN, or other certificate. A stored hostname not covered by the installed certificate remains unavailable with a valid HTTPS identity until the operator updates it. Do not change the domain model to solve certificate lifecycle.

nginx Configuration Ownership

Create one bounded template:

infra/nginx/bhr-cms.conf

It accepts only:

__BHR_ADMIN_HOST__
__BHR_API_PORT__

deploy.sh renders these validated substitutions without a templating engine.

nginx listens publicly on ports 80 and 443. Port 80 only redirects to HTTPS; it serves no production application content.

Admin HTTPS Server

The exact admin hostname uses:

server_name <ADMIN_ORIGIN hostname>
root /opt/bhr-cms/apps/admin/dist

It serves built admin static files and proxies existing API routes without inventing /api.

The admin host proxies:

/health
/auth/*
/tenants
/tenants/*
/public/*
/preview/*

to http://127.0.0.1:<API_PORT>.

Every proxy preserves Host, X-Forwarded-Proto, X-Forwarded-For, and X-Real-IP. proxy_set_header Host $host is required because public and preview authority already depends on the actual request host.

Use client_max_body_size 11m on the admin proxy. Existing Hono 11 MiB request and 10 MiB file limits remain authoritative.

Authentication Rate Limiting

Define one client-IP request-rate zone for exactly POST /auth/login and POST /auth/register with a bounded policy equivalent to ten requests per minute, burst ten, and HTTP 429 when exceeded.

Do not add application rate-limit storage or rate-limit every authenticated mutation prospectively.

Public/Tenant HTTPS Server

Use one default catch-all tenant server:

server_name _
root /opt/bhr-cms/apps/web/dist

Actual content authority remains in Host-resolved API queries. nginx does not query PostgreSQL.

Tenant hosts proxy only /health, /public/*, and /preview/* to the loopback API while preserving Host.

Tenant hosts return nginx HTTP 404 directly for /auth, /auth/*, /tenants, and /tenants/*. They never expose the admin static application.

All other tenant-host requests serve apps/web/dist with the built index.html fallback for client pathname routing. Do not introduce SSR.

Reverse Proxy Security Headers

The admin HTTPS response delivers frame protection equivalent to Content-Security-Policy: frame-ancestors 'none'. X-Frame-Options: DENY may also be included. This completes the Phase C deferred clickjacking boundary without modifying admin HTML CSP.

Both HTTPS servers use bounded headers equivalent to:

Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff

Do not use includeSubDomains because tenant/domain hierarchy is not globally owned by BeHR. Do not build a security-header framework.

Request Logging and Sinks

nginx owns production access logging. Define one concise format containing remote address, timestamp, method, $uri path, HTTP version, status, response bytes, host, and request duration.

Use $uri rather than a request target containing query strings. Do not log query strings, cookies, Authorization, preview credentials, invitation tokens, bodies, or session IDs.

Use normal nginx access/error logs and the systemd journal for Bun stdout/stderr. Existing API structured error logs remain unchanged. Do not add a log shipper, ELK agent, OpenTelemetry, Sentry, Datadog, or remote collector.

systemd Ownership

Create infra/systemd/bhr-api.service with equivalent core settings:

User=bhr-cms
Group=bhr-cms
WorkingDirectory=/opt/bhr-cms
EnvironmentFile=/etc/bhr-cms/bhr-api.env
ExecStart=/usr/local/bin/bun /opt/bhr-cms/apps/api/dist/index.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM

The unit runs the built API, not the development server.

Use bounded native hardening equivalent to:

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/bhr-cms/uploads
UMask=0027

Do not add speculative quotas, namespace frameworks, or outbound network restrictions that assume PostgreSQL is local.

stdout/stderr flow to journald and remain available through journalctl -u bhr-api. Do not add application log files.

ExecStart never runs install, build, migration, bootstrap, backup, or restore. Those remain explicit operations.

Deployment Workflow

Create infra/scripts/deploy.sh for the checkout already selected at /opt/bhr-cms.

It must not run git pull, fetch, checkout, or reset. Revision selection belongs to the operator or CI.

Before service mutation, validate:

• Effective root privileges
• Repository path exactly /opt/bhr-cms
• Clean tracked Git state
• Required host commands
• Bun 1.4.0
• Private environment file
• All Phase Q production environment rules
• Existing asset directory writable by bhr-cms
• TLS files readable by nginx
• Admin hostname absent from domains.hostname
• Valid migration history
• PostgreSQL connectivity

Do not expose secrets in failures.

Deployment then runs:

bun install --frozen-lockfile
bun run typecheck
bun run build
bun run db:migration:check
bun run db:check

before changing the running service. Do not run the full integration matrix during production deployment; exact-commit CI owns normal regressions.

Configuration installation:

1. Render the validated nginx template.
2. Install it under /etc/nginx/conf.d/.
3. Install bhr-api.service under /etc/systemd/system/.
4. Run nginx -t.
5. Run systemctl daemon-reload.

nginx syntax failure occurs before reloading the existing configuration.

After build and configuration validation, stop bhr-api if running, run bun run db:migrate, then start/restart bhr-api. This is a maintenance-window deployment; do not claim zero downtime or add blue/green releases, release symlinks, or multiple API versions.

After starting, poll http://127.0.0.1:<API_PORT>/health for at most a bounded period such as 30 seconds. Require HTTP 200 with exactly {"status":"ok"}.

After internal health succeeds, reload nginx and verify the admin health route through local TLS/SNI using curl --resolve with the installed certificate. Do not use -k.

If deployment fails after migration or service replacement, report the stage and leave diagnostics intact. Do not guess a database downgrade or build an automatic rollback manager. Recovery uses an explicitly selected code revision and/or verified backup.

Deployment never invokes auth:bootstrap.

Operations Lock

backup.sh, restore.sh, and deploy.sh serialize through one host-local flock:

/run/lock/bhr-cms-ops.lock

Another operation refuses rather than queues. Do not add a lock daemon or database operations-lock table.

Backup Ownership and Consistency

Create infra/scripts/backup.sh to produce one coordinated PostgreSQL-plus-asset backup.

Because PostgreSQL and the local filesystem cannot share a transaction, v1 backup uses a short maintenance window:

validate prerequisites
    ↓
acquire operations lock
    ↓
stop bhr-api
    ↓
dump PostgreSQL
    ↓
archive asset originals
    ↓
finalize backup archive
    ↓
restart bhr-api
    ↓
verify health

Stopping the sole API prevents BeHR mutations during both captures. Do not claim online cross-store consistency.

Once the API has stopped, bounded trap/cleanup behavior attempts a restart if backup creation fails and reports a restart failure separately.

Create database.dump using pg_dump custom format with --no-owner and --no-acl. Pass database authority through environment/libpq behavior rather than a command-line URI that exposes credentials. Never echo DATABASE_URL.

Create assets.tar from exactly the contents beneath /var/lib/bhr-cms/uploads, preserving <siteId>/<assetId>. Do not include unrelated /var/lib/bhr-cms data.

Backup Archive Format

Use temporary staging and atomic final rename to create:

/var/backups/bhr-cms/bhr-cms-<UTC timestamp>.tar.gz

The archive contains exactly:

database.dump
assets.tar
manifest.txt
SHA256SUMS

manifest.txt contains only non-secret format version, UTC creation timestamp, and Git commit SHA. Never record DATABASE_URL, BETTER_AUTH_SECRET, tokens, TLS keys, or environment content.

SHA256SUMS covers database.dump, assets.tar, and manifest.txt. Restore verifies these before destructive action.

The final archive is root-owned mode 0600 in a root-owned 0700 backup directory. It is never web-readable.

Do not include the checkout, node_modules, dist output, environment files, TLS keys, nginx/journal logs, or temporary files. The manifest Git SHA is code provenance.

Restore Ownership and Confirmation

Create infra/scripts/restore.sh accepting one explicit backup archive path. Restore is destructive maintenance.

Require an explicit --confirm-restore acknowledgement. Without it, refuse before service stop, database mutation, or asset mutation. An interactive prompt is not sufficient as the only guard.

Validate Before Mutation

Before stopping the API:

1. Validate archive existence/type.
2. Reject outer members outside database.dump, assets.tar, manifest.txt, and SHA256SUMS.
3. Extract to a temporary directory.
4. Verify SHA256SUMS.
5. Validate all required components.
6. Reject absolute, traversal, or .. asset members.
7. Verify database.dump is readable by pg_restore.

Do not extract an unvalidated root-owned archive over production paths.

Extract assets into a temporary sibling/staging directory. Do not extract directly into the live upload root.

Database and Asset Restore

With bhr-api stopped, restore into the existing target database using:

pg_restore
--clean
--if-exists
--no-owner
--no-acl
--single-transaction

Do not create or drop the database; database/role provisioning is operator-owned.

After database restore succeeds:

1. Preserve the current upload root under a temporary pre-restore sibling name.
2. Rename the staged restored root into /var/lib/bhr-cms/uploads on the same filesystem.
3. Restore bhr-cms ownership and required permissions.
4. Keep pre-restore assets until final health succeeds.

Do not copy individual files into live state while the service runs.

Then run bun run db:migrate so an older valid backup advances to the deployed code schema. Migrations never run before archive validation.

Start bhr-api and verify loopback /health. On success, remove the pre-restore asset root and report success.

Restore Failure Policy

If restore fails after destructive work begins, do not serve known or uncertain partial state. Leave or return bhr-api to stopped state, preserve available pre-restore assets, report the failed stage, and require explicit operator recovery.

Do not attempt database rollback beyond pg_restore --single-transaction and do not silently restart after an uncertain restore.

Health and Local Observability

Phase Q uses only GET /health. Do not add readiness, liveness, metrics, or status routes.

The endpoint proves the Bun/Hono process is serving requests. It does not become a database or filesystem deep-health check.

Database health remains bun run db:check. Asset availability and free space remain filesystem inspection. Document local signals using curl, bun run db:check, df, journalctl, and nginx log inspection without installing a monitoring agent.

Production Route Topology

Admin host:

https://admin-host/              → admin static application
https://admin-host/auth/*        → Bun API
https://admin-host/tenants*      → Bun API
https://admin-host/health        → Bun API

Tenant host:

https://tenant-host/             → public web application
https://tenant-host/<slug>       → public web application
https://tenant-host/public/*     → Bun API with Host preserved
https://tenant-host/preview/*    → Bun API with Host preserved
https://tenant-host/health       → Bun API with Host preserved
tenant /auth* and /tenants*      → nginx HTTP 404

Explicit Exclusions

Phase Q adds no business/API behavior, content contract, schema, migration, domain administration, automated DNS/TLS, Certbot/ACME, firewall or OS-package management, database/service-user provisioning, containerization, worker/queue, object storage/CDN, remote monitoring/log shipping, metrics backend, backup scheduler/timer/cron, zero-downtime deployment, automatic migration rollback, release/symlink framework, secret manager, or multiple API processes.

Backup scheduling remains operator responsibility.

Files / Functions

apps/api

src/application.ts
src/index.test.ts

Only the fixed loopback server option and focused verification are authorized. Do not change routes or business behavior.

infra/scripts

backup.sh
restore.sh
deploy.sh
README.md

infra/nginx

bhr-cms.conf
README.md

infra/systemd

bhr-api.service
README.md

.github/workflows/ci.yml

CI may add only shell syntax checks equivalent to:

bash -n infra/scripts/backup.sh
bash -n infra/scripts/restore.sh
bash -n infra/scripts/deploy.sh

Ordinary CI does not install nginx, systemd, or PostgreSQL operational packages.

Documentation

docs/ARCHITECTURE.md
docs/DOCUMENTATION.md

No unnamed support surface exists.

Dependencies

Use host-native operational tools. No package.json, workspace edge, Bun operations package, or bun.lock change is expected.

Repository Verification

Extend the existing API unit surface to prove application.server.hostname equals 127.0.0.1 while port, fetch, error, and existing behavior remain intact.

Run bash -n for all three operational scripts.

Where nginx exists on Linux, render the committed template with a valid test admin hostname/API port, prove no unresolved token remains, and run nginx syntax validation. If nginx is unavailable, report NOT RUN; source inspection is not syntax execution.

Where systemd tooling exists, run systemd-analyze verify or equivalent. Otherwise report NOT RUN.

Run normal repository gates:

bun --version
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
bun audit

Run bun run db:migration:check when PostgreSQL tooling/environment permits. No schema or migration generation is expected. Do not locally rerun every business integration solely because infrastructure changed; exact-commit CI owns the normal complete matrix.

Real Linux/VPS Acceptance

Production acceptance is a distinct required gate on a disposable Linux VPS/VM or equivalent with systemd, nginx, PostgreSQL clients, a real filesystem, TLS test certificate, and the real built Bun production process.

If unavailable, report overall Phase Q operational acceptance as INCONCLUSIVE. Do not represent syntax or unit tests as a successful deployment.

The Linux gate must execute and prove:

• Bun listens on loopback only; nginx listens publicly on 80/443
• Admin static, health, and unauthenticated session routing
• Tenant static/public/preview routing with real Host/SNI preservation
• Tenant /auth* and /tenants* return nginx 404
• Excess login/register requests receive HTTP 429
• Admin HTTPS response includes frame protection
• nginx access logging omits query strings and credentials
• systemd runs the API as bhr-cms with declared hardening and journal output

Backup acceptance populates a disposable database marker and known asset bytes, runs backup.sh, verifies API health afterward, and proves the final restrictive archive contains exactly database.dump, assets.tar, manifest.txt, and SHA256SUMS with valid checksums, Git provenance, and no environment/TLS material.

Restore negative controls prove missing --confirm-restore refuses without mutation, checksum corruption fails before service/database/assets mutation, and an absolute/traversal asset entry is rejected before production mutation or outside-file creation.

Positive restore mutates the disposable marker/assets, restores a valid backup, migrates forward, restarts the API, and proves the original database marker, asset bytes, and health.

Deployment acceptance executes validated production environment, frozen install, typecheck, build, migration-history and DB checks, nginx render/test, systemd install/verify, migration, API restart, loopback health, nginx reload, and TLS/admin health.

A dirty tracked checkout control proves deploy refuses before migration, service restart, or nginx reload.

An operations-lock control holds /run/lock/bhr-cms-ops.lock and proves backup, restore, and deploy each refuse rather than queue or overlap.

Documentation During Implementation

Update current-state architecture with nginx external ownership, loopback API, admin/public routing, TLS responsibility and limitation, systemd/journald lifecycle, production paths, backup downtime/consistency, restore safety, health semantics, and explicit absence of automated TLS/DNS/scheduling/rollback.

Record implementation rationale and actual evidence in DOCUMENTATION.md, including why backup stops the API, DB/assets form one set, restore validates before mutation, pg_restore is transactional, deploy never changes Git revision or auto-rolls back, TLS remains operator-managed, and no monitoring/logging framework was added.

Acceptance Criteria

1. nginx is the only externally listening HTTP service.
2. Bun API binds only to loopback.
3. Production admin and API use one HTTPS origin.
4. Admin and tenant host routing are distinct.
5. Tenant hosts cannot reach admin API paths through nginx.
6. Actual Host is preserved to public and preview reads.
7. HTTP redirects to HTTPS.
8. Operator-managed TLS is configured and TLS automation is absent.
9. The installed certificate limitation for tenant hosts is documented.
10. Admin frame protection is delivered as an HTTP header.
11. Login/register receive bounded nginx rate limiting.
12. Access logs omit query strings and credentials.
13. Bun stdout/stderr reaches journald.
14. systemd runs Bun as unprivileged bhr-cms with bounded filesystem access.
15. Service restarts on process failure.
16. Deploy uses frozen dependencies and builds before service mutation.
17. Deploy validates migration history, database connectivity, environment, TLS, paths, and reserved admin host.
18. Deploy never changes Git revision or invokes bootstrap.
19. Deploy runs migrations only in an explicit maintenance window.
20. Deploy verifies loopback and nginx/TLS health.
21. Deployment has no automatic rollback or zero-downtime framework.
22. Backup contains PostgreSQL and asset originals as one coordinated set.
23. Backup stops the sole API during cross-store capture.
24. Backup failure attempts service restart.
25. Backup excludes environment secrets and TLS keys.
26. Backup records commit provenance and checksums with restrictive permissions.
27. Restore requires explicit destructive confirmation.
28. Restore validates members, checksums, database dump, and asset paths before stopping the service.
29. Restore rejects traversal and unknown members.
30. Database restore uses pg_restore --single-transaction.
31. Assets restore through staging and same-filesystem swap.
32. Restored database migrates forward to current code.
33. Successful restore returns API health and only then removes pre-restore assets.
34. Failed uncertain restore does not serve partial state.
35. Backup, restore, and deploy cannot run concurrently.
36. Existing /health semantics remain process-only and unchanged.
37. Required local operational signals are documented without an agent.
38. No new API, content, persistence, schema, or migration behavior exists.
39. No package dependency or lockfile change exists.
40. No worker, queue, container, monitoring service, TLS daemon, or backup scheduler exists.
41. Shell syntax and focused API binding verification pass.
42. Linux/VPS deployment, routing, backup, restore, and lock acceptance are actually executed before production-ready PASS; otherwise operational acceptance is INCONCLUSIVE.

Output Format

Files created
Files modified
Commands executed
API binding, shell, nginx, systemd, routing, TLS, rate-limit, logging, deploy, backup, restore, health, dependency, scope, regression, and Linux/VPS acceptance evidence

────────

Post-Q Release Governance

Purpose

Phases A–Q established a substantial, architecturally coherent, functionally broad, and operationally certifiable CMS. They did not by themselves establish turnkey first installation, product-wide visual quality, independent human usability acceptance, release-candidate compatibility and recovery obligations, or a final exact-SHA v1.0.0 lock.

This is a plan-scope gap, not evidence that A–Q failed. Those phases correctly optimized for bounded functional correctness within their governed ownership.

The post-Q release questions are distinct:

Q asks: Can BeHR be deployed and operated safely on the prepared-host production model?

R asks: Can a new operator establish BeHR through the supported first-run path?

S asks: Is the complete BeHR-owned product experience acceptable to ship?

T asks: Does one frozen release candidate satisfy every declared release obligation?

U asks: Is this exact certified SHA ready to be tagged and released as v1.0.0?

Authoritative and Revisable Governance

Global Rules 1–16, the Rule 13 notification/resource-identity corollary, the R → S → T → U order, each phase's ownership question, and each explicit exclusion are authoritative until deliberately revised. Phase boundaries must not be crossed silently. A named later capability is never permission to implement it early, and backend, persistence, contract, security, and operational changes remain governed by their owning boundaries. Phase U remains a zero-repository-content release lock.

Future implementation detail is evidence-driven and versionable. Initial targets, expected decompositions, supported-model language, and acceptance details are subject to pre-phase reconciliation when the then-current repository or prior-phase evidence demonstrates that an assumption is false or inadequate. Such evidence requires a separately reviewed, versioned plan revision before implementation. Implementation difficulty alone is not permission to rewrite governance.

Future-Phase Reconciliation

Before the first implementation or acceptance task of each of Phases R, S, T, and U is generated, re-read the then-current repository, previous-phase evidence, applicable architecture, applicable contracts and invariants, and that phase's current plan text.

If completed work makes an assumption false or inadequate:

stop
    ↓
revise governance deliberately
    ↓
version the plan
    ↓
implement

Do not force outdated roadmap detail merely because Version 1.17 predicted it. Do not weaken current invariants by treating all future detail as aspirational.

Execution and Certification Order

Implementation order is:

Q → R → S → T → U

R proves first-run installation against the product state that exists during R. S then reconstructs and completes the product experience. T re-verifies the final frozen candidate across the distinct applicable installation, operational, product, compatibility, recovery, browser, and release paths. T prevents stale exact-SHA evidence from R or S from being carried silently to the final candidate. U releases only the exact T-certified SHA.

T's joint certification responsibility does not make R and S unordered.

────────

Phase R — Installation & First-Run Productization

Task

Productize the first-run host installation boundary.

Objective

A new operator starts from the supported host baseline, runs one BeHR first-run entrypoint from an exact clean source checkout, supplies required external inputs securely, and reaches a functioning trusted HTTPS administration URL without manually reconstructing the Phase Q host, service, database, filesystem, and bootstrap model.

R's acceptance bar is functional installation correctness. Final product-wide aesthetic quality belongs to Phase S.

Why Phase Q Does Not Already Own R

Phase Q deploy.sh, backup.sh, and restore.sh intentionally operate against an already prepared host. They require the service user/group, fixed filesystem roots, protected environment file, host packages, TLS material, and PostgreSQL authority to exist before deployment.

That is a valid prepared-host operations model. A first-run installer is a separate privilege, secret, package, filesystem, database, identity, and lifecycle boundary. Do not rewrite deploy.sh into an installer.

Adopted Initial v1 Installer Model

Supported Host

The initial supported installer platform is Ubuntu Server 24.04 LTS with systemd on one VPS.

Installer implementation must avoid unnecessary CPU-architecture assumptions. Version 1.17 does not convert the Phase Q Ubuntu/aarch64 acceptance into a general architecture promise. Only architectures actually accepted during R and the final T candidate may be represented as release-supported. Do not create a multi-distribution provisioning abstraction.

PostgreSQL Topology

The initial first-run installer provisions one local PostgreSQL 16 server, database, and login role on the supported VPS. It generates the database credential and writes the resulting local authority into the protected BeHR environment.

Phase Q may continue to support operator-provisioned external PostgreSQL for advanced manual deployments. The initial R installer does not support both topologies; do not double its configuration and error surface prospectively.

DNS Ownership

DNS remains external operator authority. The installer collects the intended admin hostname, validates its syntax, and verifies the bounded DNS prerequisite required by the selected first-run flow. It does not call DNS-provider APIs, create DNS records, or introduce generic DNS automation.

TLS Ownership

The initial installer uses operator-supplied trusted certificate and private-key files. Certificate acquisition and renewal remain external prerequisites.

The installer owns secure placement into:

/etc/bhr-cms/tls/fullchain.pem
/etc/bhr-cms/tls/privkey.pem

It validates certificate parsing, the configured admin hostname, required file identity and permission boundaries, and normal trusted HTTPS through the existing Phase Q deployment health gate. It must not print key material or overwrite unknown/conflicting installed TLS state.

R adds no ACME client, Certbot, renewal timer, external account state, certificate daemon, DNS challenge automation, or silent certificate-lifecycle promise. Tenant hostnames remain usable over HTTPS only when the operator-supplied certificate covers them.

Configuration and Secret Collection

The initial v1 first-run entrypoint is root-run and interactive. It collects non-secret configuration such as the admin hostname and operator-supplied TLS source paths through a bounded prompt flow. Initial administrator password input is read without echo from an attached terminal. An unattended installer interface is not part of the initial model unless later evidence requires a separately governed revision.

Secret values are never accepted through command-line arguments, echoed, or logged. The installer generates BETTER_AUTH_SECRET and the local PostgreSQL role password with cryptographically secure randomness. It creates `/etc/bhr-cms/bhr-api.env` itself as root:root mode 0600 with the existing Phase Q production variables. It does not require the operator to construct that file and does not create a secret-manager abstraction.

Initial Identity

A successful first run establishes the first usable BeHR administrator through the existing one-time `auth:bootstrap` authority. The installer collects administrator name, email, and password transiently, invokes the existing bootstrap command only after PostgreSQL and the BeHR schema are ready, and never stores bootstrap credentials in `bhr-api.env`.

Do not add a second identity-creation path for installation. Existing-identity or bootstrap-refusal behavior must remain authoritative and participate in interrupted/re-entry classification.

Source and Artifact Acquisition

The installer executes from an operator-obtained exact, clean BeHR checkout or release source. It verifies the expected repository/release identity and clean tracked state before privileged mutation.

It does not perform Git fetch, pull, checkout, reset, or generic updating and does not use `curl | bash` or unverified arbitrary code execution. T and U later own final release identity; downloading or updating BeHR releases is outside the initial installer.

Host Package Ownership

On Ubuntu 24.04 LTS, R may use native apt package management directly to install the host tools required by the accepted Phase Q model, including nginx, PostgreSQL 16 server/client capability, and required shell utilities.

Do not add Ansible, Puppet, Chef, Salt, a host package-manager abstraction, or multi-distribution branches.

Bun acquisition is pinned to 1.4.0 and must be verified before installation or use. The first bounded R task may finalize the exact official artifact and checksum mechanism after inspecting current upstream artifact availability and supported target architecture. It must not accept an arbitrary latest runtime.

Interrupted Installation and Re-entry

Apply this classification at every installer-owned boundary:

installer-owned state absent
    → establish it

installer-owned state already correct
    → preserve and reuse it

unsupported or conflicting state
    → fail clearly

unexpected establishment failure
    → propagate and fail

ambiguous partial prior installation
    → refuse unless the correct reconciliation is deterministic and explicitly owned

The installer must not delete ambiguous state, overwrite unknown configuration, treat arbitrary failure as a missing prerequisite, or introduce a generic rollback manager.

Concrete already-correct state includes only state whose identity, values, permissions, and relationships can be validated authoritatively. An existing unknown environment file, TLS destination, database/role relationship, service identity, or partial bootstrap is not implicitly reusable. A failed first run leaves bounded stage diagnostics and sufficient preserved state for safe retry or deliberate operator reconciliation.

R Scope Boundary

R may establish only the host prerequisites Phase Q intentionally assumed: supported packages, service identity, fixed directories and permissions, local PostgreSQL authority, protected production configuration, operator-supplied TLS placement, initial identity, and orchestration into the existing deploy.sh.

R reuses the accepted Phase Q artifacts as the target installed model. It must not silently change backup, restore, nginx routing, systemd runtime, API contracts, database schema, or application features.

If R evidence demonstrates that a certified Phase Q surface is insufficient:

stop
    ↓
govern that owning change separately
    ↓
determine applicable recertification

Do not hide the change inside installer work.

Expected Decomposition

R is too large for one implementation task. Its expected bounded concerns are:

R0 — Installer contract, source identity, and preflight
R1 — Ubuntu package, service identity, and filesystem provisioning
R2 — Local PostgreSQL and secure configuration/secrets
R3 — Operator-supplied TLS placement and validation
R4 — Existing bootstrap integration and first-run orchestration
R5 — Interrupted-run and deterministic re-entry controls
R6 — Fresh-host installation acceptance

This decomposition is an initial target subject to pre-phase reconciliation. Generate the exact subtask split from the adopted decisions and actual repository state; do not invent all future file surfaces in this governance task.

Acceptance Direction

R requires real fresh-host Ubuntu 24.04 LTS acceptance. CI or source inspection cannot substitute for privilege behavior, package installation, filesystem permissions, service identity, PostgreSQL setup, TLS trust, bootstrap, interruption/re-entry, or integration with the accepted Phase Q deployment.

R acceptance must distinguish installer correctness from the applicable Phase Q operational behavior it invokes and must bind evidence to one exact candidate SHA.

Explicit Exclusions

Phase R adds no final visual redesign, product-wide component system, global notification system, multi-distribution framework, dual local/external database installer, DNS automation, ACME/renewal lifecycle, generic updater, release channel, backup/restore redesign, application feature, contract/schema change, or post-R behavior without separate governance.

Output Format

Files created
Files modified
Commands executed
Installer contract, privilege, package, filesystem, PostgreSQL, secret, TLS, bootstrap, re-entry, Phase Q integration, and fresh-host evidence

────────

Phase S — Product Experience Completion / Beta Exit

Task

Reconstruct BeHR's user-facing experience against an intentional visual and interaction system and apply Global Rule 16.

Objective

The BeHR-owned admin and default public experience must be functionally correct, accessible, understandable, responsive, visually coherent, aesthetically pleasurable, and acceptable for v1.0.0. Technically works is insufficient.

Design Direction

Use Apple Human Interface Guidelines-inspired clarity, legibility, consistency, restraint, comfortable interaction targets, clear hierarchy, and generous spacing, adapted to a web CMS. Do not imitate macOS chrome merely to appear Apple-like.

Why Earlier UX Phases Do Not Already Own S

Phases K, M, N, O, and P correctly implemented bounded authoring, asset, theme, settings, validation, ordering, accessibility, and render-failure behavior against their stated criteria. They did not establish a product-wide visual system or independent human aesthetic acceptance gate.

This is a planning-scope gap, not retroactive evidence that those phases were implemented incorrectly.

Expected Decomposition

S0 — Product UX inventory and usability baseline
S1 — Visual foundations
S2 — Shared UI primitives
S3 — Application shell
S4 — Forms and feedback model
S5 — Core workflow reconstruction
S6 — Editor and publishing experience
S7 — Responsive and accessibility completion
S8 — Integrated usability and beta-exit acceptance

This is an expected decomposition. S0 may propose a better bounded split only through an explicit documented governance decision before affected implementation.

Independent Acceptance Gates

Every materially user-facing S subtask requires both the applicable machine-verifiable gate and explicit human product acceptance under Global Rule 16. A machine PASS cannot close a required human gate, and an attractive screen cannot substitute for functional or accessibility correctness.

Human acceptance must come from the project owner or another explicitly designated human reviewer. Agents prepare evidence and critique; they do not approve their own human gate.

Continuous Human Review

Human aesthetic review begins during S1. Do not defer screenshots and judgment until S8. S8 is the integrated cross-screen and cross-workflow review of the final S candidate.

Visual and Product Rubric

S0 must finalize and name a rubric covering at minimum:

• Clarity
• Hierarchy
• Typography
• Comfortable text sizes
• Restrained type scale
• Spacing rhythm
• Information density
• Button and control sizing
• Focus, hover, pressed, disabled, and loading states
• Validation and error presentation
• Progress and success feedback
• Motion and transition quality
• Visual consistency
• Responsive behavior
• Accessibility
• Overall aesthetic quality

The initial accessibility target is WCAG 2.2 AA for BeHR-owned UI surfaces.

The initial interaction-target goal is approximately 44 CSS pixels for primary touch/click targets where practical, with explicit justified exceptions.

S0 may refine these initial targets only through an explicit documented decision. They must not be weakened silently.

Reproducible Review Evidence

Applicable static reviews record exact SHA, browser, viewport, screen/state, screenshot, named rubric, and explicit human PASS/FAIL. Material interaction reviews additionally record starting state, actions, observed transitions or feedback, and the human verdict. Video may supplement but is not required as permanent infrastructure.

Shared UI Ownership

Phase S may activate `packages/ui` because repeated BeHR-owned surfaces now exist. S2 may create shared primitives only when S0 demonstrates actual reuse and the primitive owns concrete visual, accessibility, interaction, or feedback policy.

Do not create a hypothetical component catalog, generic design framework, or abstraction for a future screen.

Notification Decision

S4 must evaluate concrete workflows including:

• Save or publish completion after navigation
• Asset completion after resource switching
• Session expiry during editing
• Destructive actions whose initiating control disappears
• Membership or invitation actions that change the visible resource list

Do not assume toasts everywhere or toasts never.

If a transient or global notification primitive is justified, it must obey the Rule 13 notification/resource-identity corollary. Field-level validation remains field-proximate where appropriate. Existing inline alert/status feedback must not be retrofitted merely to enforce one visual mechanism.

Public Experience Boundary

S owns the BeHR admin UI and BeHR-owned default public/theme rendering. It does not own or guarantee the aesthetic quality of arbitrary user-authored text, images, layout choices, or content.

Backend Boundary

S must not silently redesign backend, persistence, authentication, or contracts because a UI review exposes a limitation. A demonstrated need outside the S-owned interface becomes a separately governed correction at its owning boundary.

Stopping Rule

For each material human-product finding:

same material finding fails
    ↓
bounded remediation 1
    ↓
human re-review
    ↓
same material finding still fails
    ↓
bounded remediation 2
    ↓
human re-review
    ↓
same material finding remains unacceptable
    ↓
stop automatic iteration
    ↓
explicitly redesign, descope from v1.0.0, or knowingly accept with rationale

The remediation budget applies per material finding, not per complete journey.

Explicit Exclusions

Phase S does not authorize silent API, schema, persistence, authentication, Phase Q operational, installer, release, arbitrary user-content, speculative component-catalog, or client-telemetry changes.

Output Format

Files created
Files modified
Machine-verifiable evidence
Screenshots and interaction evidence
Explicit human product verdicts

────────

Phase T — Release Candidate, Compatibility & Recovery Validation

Task

Freeze and validate one release candidate against every release obligation BeHR explicitly claims to support.

Objective

Produce one exact repository SHA whose release claims are evidenced rather than inferred from earlier phase completion.

Distinct Prior Evidence

Phase Q proved the prepared-host production-operations model. Phase R proves the supported first-run installation path. Phase S proves the product-experience bar. T must not conflate these gates or carry their evidence automatically to a changed final candidate.

Initial Supported-Predecessor Policy

The initial v1.0.0 target has no supported in-place predecessor. Do not manufacture an upgrade promise from arbitrary historical main commits, internal phase commits, or unversioned acceptance fixtures.

If an RC, beta, or prior release is later declared upgrade-supported, identify its exact version and SHA through a separately reviewed governance revision before T certification. That revision must define and test data/content integrity, session survival or intentional invalidation, failed/interrupted upgrade recovery, and the selected recovery authority. Forward migrations are not presumed reversible; a verified pre-upgrade backup may be the recovery authority.

Absent an explicitly supported predecessor, upgrade-session and interrupted-upgrade gates are NOT APPLICABLE rather than silently passed.

Certification Paths

T uses one evidence-efficient structure equivalent to:

Fresh supported host
    → Phase R installer
    → frozen candidate installed
    → one applicable Phase Q operational matrix

Declared supported prior state, if one exists
    → upgrade to candidate
    → integrity and selected session-policy checks
    → interrupted-upgrade recovery
    → final reconciliation

Supported browsers and viewports
    → Phase S product-experience matrix

Candidate repository
    → exact CI
    → dependency and security review
    → release metadata and documentation verification
    → release rehearsal

Do not rerun the same destructive Phase Q matrix twice when both historical R and Q references ask the same question. Installation evidence and operational/recovery evidence remain distinct within the one frozen-candidate flow.

Preview Credential Sequencing

When T's integrated workflow uses short-lived credentials such as the 15-minute preview token, sequence or refresh acceptance fixtures so final reconciliation can exercise the intended capability without weakening its TTL. Do not extend product credential lifetime to make a long matrix convenient.

Browser and Product Matrix

T executes the browser/viewport set declared by the final Phase S governance and release metadata. Machine and human product gates remain independent. A prior human verdict does not certify a changed release candidate with user-visible differences.

Security Review

The frozen candidate must have no unresolved release-blocking security finding. Non-blocking findings require explicit disposition and rationale. Do not impose the unrealistic rule that every dependency or security tool must report zero findings of every severity forever.

Candidate Freeze

Before T certification begins, the repository content intended to ship must already contain final version metadata, final repository release notes, and reconciled documentation.

Once T freezes the candidate SHA:

any repository-content change
    → new candidate SHA
    → applicable T evidence resets

Acceptance Direction

T must identify every claimed supported host architecture, browser, viewport, predecessor, installation path, operational/recovery path, and security/release obligation before execution. Unsupported or unclaimed variants are not silently implied.

Output Format

Frozen candidate SHA
Declared support matrix
Installation, operational, compatibility, recovery, browser, human-product, security, metadata, and rehearsal evidence
Release recommendation

────────

Phase U — v1.0.0 Release Lock

Task

Make the final explicit go/no-go decision and release the exact T-certified SHA.

Objective

The SHA tagged as v1.0.0 must be exactly the SHA certified by Phase T.

Zero Repository-Content Changes

Phase U permits zero repository-content changes.

Phase U may:

• Verify T evidence
• Verify repository and release metadata already match
• Record GO or NO-GO externally as appropriate
• Tag the exact T-certified SHA
• Publish a release that references that exact SHA

Phase U may not:

• Fix code
• Modify documentation
• Change version metadata
• Modify repository release notes
• Clean formatting
• Add a tiny final fix

If Phase U finds a repository problem:

NO-GO
    ↓
bounded correction or preparation
    ↓
new candidate SHA
    ↓
applicable Phase T recertification
    ↓
Phase U again

No behavior, documentation, release-note, or metadata commit occurs inside Phase U.

Acceptance Criteria

1. T evidence is complete and belongs to one exact SHA.
2. Repository version metadata and release notes already identify v1.0.0.
3. The release tag targets exactly the T-certified SHA.
4. No repository-content change occurs during U.
5. Any discovered repository problem produces NO-GO rather than a release-time fix.

Output Format

GO or NO-GO
Certified SHA
Tag and release identity
Zero-content-change verification

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

For Phases R–U, before a phase's first task begins, reconcile its current plan assumptions against the then-current repository and prior-phase evidence. If evidence requires a governance change, revise and version the plan before implementation. Future-phase detail is not permission to implement it early.

This preserves the monolithic architecture, deterministic content contracts, and single-VPS operational model defined for the system.
