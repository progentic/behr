# BeHR

<p align="center"><strong>A Modern CMS for Multi-Site Publishing</strong></p>

<p align="center">
  <a href="https://bun.sh/"><img alt="Bun" src="https://img.shields.io/badge/Bun-000000?style=flat-square&amp;logo=bun&amp;logoColor=white"></a>
  <a href="https://go.dev/"><img alt="Go" src="https://img.shields.io/badge/Go-00ADD8?style=flat-square&amp;logo=go&amp;logoColor=white"></a>
  <a href="https://hono.dev/"><img alt="Hono" src="https://img.shields.io/badge/Hono-E36002?style=flat-square&amp;logo=hono&amp;logoColor=white"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white"></a>
  <a href="https://www.postgresql.org/"><img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&amp;logo=postgresql&amp;logoColor=white"></a>
</p>

BeHR is a modern content management system for creating, managing, and
publishing multiple websites from one place. It gives content teams a focused
workspace for shaping pages, organizing media, and delivering polished digital
experiences across every site they manage.

Designed for organizations that value ownership and simplicity, BeHR brings
content, design, publishing, and site management together in one cohesive
platform. Its technology foundation combines Bun, Go, Hono, TypeScript, and
PostgreSQL to deliver a fast web experience, a dependable application core,
and durable content storage.

## How BeHR Works

```mermaid
flowchart TB
    Editors["Content teams"] --> Admin["BeHR workspace"]
    Admin --> Core["BeHR core<br/>Bun · Go · Hono · TypeScript"]
    Core --> Sites["Published websites"]
    Visitors["Site visitors"] --> Sites
    Core --> Database[("PostgreSQL")]
    Core --> Media["Media storage"]
```

Explore the [project documentation](docs/) for the product vision and system
design. BeHR is available under the [BSD 3-Clause License](LICENSE).
