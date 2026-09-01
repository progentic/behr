# scripts

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
