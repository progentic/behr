# nginx

`bhr-cms.conf` is the production template for the single-VPS external HTTP
boundary. `deploy.sh` replaces exactly:

- `__BHR_ADMIN_HOST__` with the hostname derived from `ADMIN_ORIGIN`.
- `__BHR_API_PORT__` with the validated loopback API port.

nginx is the only externally listening HTTP service. Port 80 redirects to
HTTPS. The exact admin host serves `apps/admin/dist` and proxies the existing
admin/API routes. The default tenant host serves `apps/web/dist`, proxies only
health/public/preview routes, preserves the actual Host header, and rejects
auth/tenant administration paths.

TLS material is operator-managed at `/etc/bhr-cms/tls`. The installed
certificate must cover the admin hostname and every tenant hostname intended
for service. BeHR does not issue, renew, or verify certificates.

The access-log format uses `$uri`, not the query-bearing request target. It does
not log cookies, authorization, preview/invitation credentials, bodies, or
session IDs. POST login and registration receive the bounded client-IP rate
limit; non-POST requests use an empty limit key. Admin responses receive the
HTTP frame restriction deferred from the document CSP.
