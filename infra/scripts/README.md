# scripts

`install-preflight.sh` implements the Phase R0 non-mutating admission boundary
for the initial root-run, interactive-only first-run path. It derives the source
root from its own physical location and validates Ubuntu 24.04, systemd host
eligibility, Bash and CPU architecture bounds, Git top-level identity, the
current source SHA, and clean tracked state. It can run from a caller working
directory outside the checkout and reports only bounded non-secret evidence.

This preflight is not a complete or unattended installer. It does not download
or update BeHR, provision packages, install or verify Bun releases, create a
service user or production filesystem, provision PostgreSQL, create environment
or secret material, install TLS, bootstrap an identity, invoke deployment, or
implement installer re-entry state.

The Phase Q operational scripts require root, Bash 5+, the host-native tools
listed in the Phase Plan, and the root-owned mode-0600 environment file at
`/etc/bhr-cms/bhr-api.env`. They serialize through the nonblocking
`/run/lock/bhr-cms-ops.lock`; operations refuse rather than queue.

`deploy.sh` validates the exact `/opt/bhr-cms` checkout, clean tracked state,
production environment, paths/permissions, TLS, database connectivity,
migration history, and reserved admin hostname. It performs a frozen install,
type-check, build, configuration syntax validation, maintenance migration,
service restart, loopback health, nginx reload, and TLS admin health. It never
changes Git revision or invokes identity bootstrap.

`backup.sh` requires a healthy service, then stops the sole API during the
PostgreSQL-plus-assets capture. A final mode-0600 archive under
`/var/backups/bhr-cms` contains exactly `database.dump`, `assets.tar`,
`manifest.txt`, and `SHA256SUMS`. Failure after service stop attempts restart
and health verification. Backup scheduling remains an operator responsibility.

`restore.sh --confirm-restore <archive>` is a destructive maintenance action.
It validates outer members, checksums, manifest, database dump, and canonical
UUID asset paths/types before stopping the API. Assets extract first into
`/var/lib/bhr-cms/uploads.staging`; device IDs must match the live asset
filesystem. After transactional database restore, the script performs two
same-device renames through `uploads.pre-restore`, migrates forward, starts the
service, and removes the preserved tree only after exact health succeeds.

Any existing `uploads.staging` or `uploads.pre-restore` blocks deploy, backup,
and restore. These paths are durable evidence of an interrupted restore. No
script guesses which tree is authoritative, deletes residue, or automatically
reconciles it. Operators must inspect database and filesystem state, recover
explicitly, and only then remove or rename residue.
