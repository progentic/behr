# systemd

`bhr-api.service` runs the built API as the unprivileged `bhr-cms:bhr-cms`
identity from `/opt/bhr-cms`. The root-owned mode-0600 environment file is read
by systemd and injected into the process environment; the service identity does
not need direct read access to that file.

The application tree is protected read-only by the service sandbox. Only
`/var/lib/bhr-cms/uploads` is writable. `NoNewPrivileges`, private temporary
storage, protected home/system paths, and umask 0027 provide the bounded native
hardening model without blocking a local or remote PostgreSQL connection.

The service restarts on process failure and sends stdout/stderr to journald.
Inspect structured API errors with:

```bash
journalctl -u bhr-api.service
```

The unit never installs dependencies, builds, migrates, bootstraps identities,
backs up, or restores. Those are explicit root-owned operational actions.
