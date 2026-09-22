# BeHR v1.0.0

Version: **1.0.0**. The release identity is the exact commit tagged by Phase U,
not a hard-coded candidate SHA in this file. Phase T must certify that commit
before release; version metadata is not a certification or publication event.

## Product

BeHR is a single-VPS, multi-tenant CMS with tenant/site/page management,
tenant-scoped owner/member collaboration, invitation onboarding, structured
page authoring, explicit manual draft saves, image upload and selection,
immutable saved-draft preview, owner-only publication, and public rendering.
Site settings provide bounded light/dark and sans/serif themes. The accepted
public dark canvas is Cocoa Spice `#191815` with `#f5f5f5` text.

The repository supplies a root-run interactive first-run installer, prepared-
host deployment, coordinated database/assets backup, and explicit destructive
restore. Internal workspace packages remain private; this is not an npm release.

## Release support and certification boundary

The support claim is limited to the following profile, contingent on successful
exact-SHA Phase T evidence and Phase U release authorization:

| Surface | v1.0.0 profile |
| --- | --- |
| Production host | Ubuntu Server 24.04 LTS, `aarch64` / Ubuntu `arm64` |
| Topology | One VPS, systemd, nginx as the only external HTTP service, one loopback Bun API process |
| Runtime | Bun 1.4.0 |
| First-run database | Local PostgreSQL 16 |
| Assets | Local filesystem using the existing fixed production paths |
| Browser | Desktop Microsoft Edge 153.0.4234.48 on macOS 27.0 |
| CSS viewports | 1440×900, 1024×768, 390×844, 320×844 |
| Text enlargement | Representative 200% root-text enlargement |

This does not claim certification of x86_64, another OS, external PostgreSQL,
another deployment topology, Chrome, Safari, Firefox, or native mobile browsers.
The install preflight admits more than one CPU architecture; admission alone
does not certify an architecture for this release. Historical Phase Q external
PostgreSQL flexibility is not a v1.0.0 external-database support claim.

## Installation source and operator prerequisites

Use a **clean Git checkout of the released tag**, including `.git`. After the
release is published:

```sh
git clone https://github.com/progentic/behr.git
cd behr
git checkout --detach v1.0.0
sudo ./infra/scripts/install.sh
```

GitHub-generated source ZIP/tarball archives and directories without Git identity
are not supported installer inputs. There is no remote bootstrap, `curl | bash`,
updater, or installer-owned Git revision change.

Before running the installer, the operator supplies DNS resolution and trusted
TLS certificate/full-chain and private-key files. The certificate must cover
the admin hostname and every tenant hostname served over HTTPS. The installer
validates supplied material; BeHR does not issue/renew certificates or automate
ACME or DNS. See [operator documentation](infra/scripts/README.md).

## Operations and recovery

Deployment is a maintenance-window operation, not zero downtime. Database
migrations and API restart remain explicit operations. No automatic database
rollback is promised.

`backup.sh` stops the sole API while capturing PostgreSQL and asset originals
as one coordinated set, then restores service. Backups are sensitive,
root-restricted operator artifacts; scheduling, retention and off-host custody
are operator-owned. BeHR supplies commands, not a backup scheduler.

`restore.sh --confirm-restore <archive>` is destructive. It validates the
archive before mutation and preserves uncertain asset trees after a destructive
failure. Restore residue blocks later operations until deliberate operator
recovery. There is no automatic reconciliation or guessed recovery authority.

The installer/deploy path starts `bhr-api.service` but leaves boot enablement
disabled. `Restart=on-failure` is not automatic startup after a host reboot.
After reboot, the operator verifies PostgreSQL/nginx availability, runs
`sudo systemctl start bhr-api.service`, and verifies loopback and HTTPS health.
Automatic API boot enablement is not part of the release claim.

## Compatibility

**Supported in-place predecessor: NONE.** No supported predecessor exists for
v1.0.0; in-place prior-release upgrade, upgrade-session continuity, and
interrupted prior-release upgrade recovery are **NOT APPLICABLE**. Historical
0.x commits and internal acceptance fixtures are not supported predecessors.
Current-candidate installation and backup/restore remain required certifications.

## Accessibility, security and accepted limitations

WCAG 2.2 AA is the target on tested BeHR-owned surfaces. Phase S exercised
keyboard/focus, semantics, names/descriptions, target geometry, contrast,
forced-colors emulation, responsive reflow and representative 200% text checks;
Phase T repeats the declared candidate regression boundary. This is not WCAG,
screen-reader, or full assistive-technology certification. Screen-reader testing
and true 400% browser zoom are not certified; 320 CSS-pixel reflow is not relabelled
as a 400% browser-zoom test.

Generic session-invalidated save wording can require reauthentication. Unsaved
content remains local; signing in again in another tab permits retrying the save.
No automatic session-expiry redirect is claimed. Invitation and preview credentials
remain transient; manual invitation transfer is the accepted v1 workflow.

Release-blocking security findings must be resolved before release. The audit,
CI, routing/TLS/logging, recovery-integrity and evidence-handling checks are bounded
verification, not formal security/penetration-test certification or a promise
of zero future vulnerabilities. Phase S beta acceptance does not substitute for
Phase T certification or Phase U release authorization.
