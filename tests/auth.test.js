const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { app } = require("../app");

test("GET /admin-login returns 200 with login form", async () => {
  const res = await request(app).get("/admin-login");
  assert.strictEqual(res.status, 200);
  assert.ok(res.text.includes("Admin Login"));
});

test("GET /admin without session redirects to login", async () => {
  const res = await request(app).get("/admin");
  assert.strictEqual(res.status, 302);
  assert.ok(res.headers.location.includes("/admin-login"));
});

test("GET /admin/danger-reset-history without session redirects to login", async () => {
  const res = await request(app).get("/admin/danger-reset-history");
  assert.strictEqual(res.status, 302);
  assert.ok(res.headers.location.includes("/admin-login"));
});

test("POST /logout clears session and redirects via script", async () => {
  const agent = request.agent(app);
  const getRes = await agent.get("/admin-login");
  const csrfMatch = getRes.text.match(/name="csrf-token" content="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  const res = await agent.post("/logout").set("X-CSRF-Token", csrfToken);

  assert.strictEqual(res.status, 200);
  assert.ok(res.text.includes("Logging out..."));
});

test("POST /admin-login with invalid credentials fails", async () => {
  const agent = request.agent(app);
  const getRes = await agent.get("/admin-login");
  const csrfMatch = getRes.text.match(/name="csrf-token" content="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  const res = await agent.post("/admin-login").set("X-CSRF-Token", csrfToken).send({
    username: "nonexistent_admin_test",
    password: "wrong_password_123"
  });

  assert.strictEqual(res.status, 401);
  assert.ok(res.text.includes("Invalid username or password"));
});
