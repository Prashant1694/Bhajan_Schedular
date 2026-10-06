const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { app } = require("../app");

test("Singer PIN lockout: fails with dummy bcrypt for non-existent singer", async () => {
  const agent = request.agent(app);
  const getRes = await agent.get("/singer/login");
  const csrfMatch = getRes.text.match(/name="csrf-token" content="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  const res = await agent.post("/api/singer/login").set("X-CSRF-Token", csrfToken).send({
    singer_id: 9999999,
    pin: "9999"
  });

  assert.strictEqual(res.status, 404);
  assert.ok(res.body.error.includes("not found"));
});

test("Singer PIN lockout: rejects invalid pin format (not 4 digits)", async () => {
  const agent = request.agent(app);
  const getRes = await agent.get("/singer/login");
  const csrfMatch = getRes.text.match(/name="csrf-token" content="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  const res = await agent.post("/api/singer/login").set("X-CSRF-Token", csrfToken).send({
    singer_id: 1,
    pin: "abc"
  });

  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error.includes("4-digit"));
});
