import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the ATLAS production dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>ATLAS Quant Lab/);
  assert.match(html, /ATLAS QUANT LAB/);
  assert.match(html, /SIMULATED PORTFOLIO/);
  assert.match(html, /SIMULATION ONLY/);
  assert.match(html, /美股行情/);
  assert.match(html, />港股<\/button>/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("dashboard source consumes the quant API contract", async () => {
  const [page, layout, sample] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../backend/sample_quant_result.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /\/api\/v1\/dashboard\/latest/);
  assert.match(page, /useEffect/);
  assert.match(layout, /ATLAS Quant Lab/);

  const payload = JSON.parse(sample);
  assert.equal(payload.schema_version, "1.0");
  assert.equal(payload.portfolio.currency, "USD");
  assert.ok(payload.positions.length > 0);
  assert.ok(payload.market_snapshot.every((quote) => ["US", "HK"].includes(quote.market)));
});
