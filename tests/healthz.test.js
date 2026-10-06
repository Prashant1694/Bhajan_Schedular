const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { setupTestDb } = require("./setup");

test.before(async () => {
  await setupTestDb();
});

const { app } = require("../app");

test("GET /healthz returns 200 with healthy status and database status", async () => {
  const res = await request(app).get("/healthz");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, "healthy");
  assert.strictEqual(res.body.database, "connected");
  assert.ok(typeof res.body.uptimeSeconds === "number");
  assert.ok(res.body.memory && typeof res.body.memory.rssMb === "number");
});

test("GET /non-existent-route returns 404 with friendly custom HTML", async () => {
  const res = await request(app).get("/non-existent-route-xyz");
  assert.strictEqual(res.status, 404);
  assert.ok(res.text.includes("Page Not Found"));
  assert.ok(res.text.includes("404"));
});

test("GET /api/non-existent-endpoint returns 404 JSON", async () => {
  const res = await request(app)
    .get("/api/non-existent-endpoint-xyz")
    .set("Accept", "application/json");
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error, "Resource not found.");
});
