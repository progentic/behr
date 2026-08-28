import { Hono } from "hono";

const app = new Hono();

app.get("/health", (context) => {
  return context.json({ status: "ok" });
});

const port = Number(process.env.API_PORT ?? 3000);

if (import.meta.main) {
  console.log(`API listening on port ${port}`);
}

export default {
  port,
  fetch: app.fetch,
};

export { app };
