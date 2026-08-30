BeHR CMS — Agentic Implementation Execution Brief

Version: 1.3
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

• Implement preview_tokens table usage
• Validate preview tokens
• Allow draft rendering via token

Must not:

• Modify published content
• Bypass token validation

Files / Functions

packages/db

schema/preview_tokens.ts

apps/api

routes/preview.ts

Acceptance Criteria

Valid preview token renders draft.

Invalid token is rejected.

Public routes remain protected.

Output Format

Files created
Files modified
Commands executed
Preview tests

────────

Phase J — Publish Workflow

Task

Implement publish behavior.

Objective

Switch public content safely.

Guidelines

Must:

• Implement publish authorization
• Implement publish route
• Select the immutable version to publish according to the approved workflow
• Perform the first production application mutation of pages.published_version_id
• Update the existing published pointer
• Record publication history or event data through page_publications
• Preserve previous immutable versions

Must not:

• Modify draft version
• Delete previous versions
• Implement public rendering

Phase H represents and reads what is published. Phase J changes what is published and records that change.

Files / Functions

packages/db

schema/page_publications.ts

apps/api

routes/publish.ts

Acceptance Criteria

Publish switches public version.

Previous versions remain intact.

Audit event recorded.

Output Format

Files created
Files modified
Commands executed
Publish tests

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
