const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { app } = require("../app");

test("GET /healthz returns 200 with healthy status and database status", async () => {
  const res = await request(app).get("/healthz");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, "healthy");
  assert.strictEqual(res.body.database, "connected");
  assert.ok(typeof res.body.uptimeSeconds === "number");
  assert.ok(res.body.memory && typeof res.body.memory.rssMb === "number");
});
