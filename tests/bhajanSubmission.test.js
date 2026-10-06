const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { setupTestDb } = require("./setup");

test.before(async () => {
  await setupTestDb();
});

const { app } = require("../app");
const {
  validateSubmitForm,
  validateCopySession,
  validateUpdatePermission,
  validateReorder
} = require("../services/validators");

test("Validator: reject unexpected body keys in submitForm", () => {
  const result = validateSubmitForm({
    title: "Ganesha Sharanam",
    singer_name: "Test Singer",
    deity: "Ganesha",
    session_date: "2026-10-15",
    malicious_injected_field: "attack"
  });

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Unexpected fields not allowed")));
});

test("Validator: accept valid bhajan submission", () => {
  const result = validateSubmitForm({
    title: "Ganesha Sharanam",
    singer_name: "Test Singer",
    deity: "Ganesha",
    session_date: "2026-10-15",
    speed: "Medium",
    scale: "5.5"
  });

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.data.title, "Ganesha Sharanam");
});

test("Validator: validateCopySession rejects same source and target date", () => {
  const result = validateCopySession({
    source_date: "2026-10-15",
    target_date: "2026-10-15"
  });

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("different")));
});

test("Validator: validateUpdatePermission validates valid types", () => {
  const valid = validateUpdatePermission({
    date: "2026-10-15",
    type: "festival",
    description: "Navaratri Session"
  });
  // 'festival' is invalid type, valid are open, restricted, closed, clear
  assert.strictEqual(valid.valid, false);

  const validClear = validateUpdatePermission({
    date: "2026-10-15",
    type: "clear"
  });
  assert.strictEqual(validClear.valid, true);
});

test("Validator: validateReorder ensures orderData is an array of valid IDs", () => {
  const invalid = validateReorder({ orderData: "not-an-array" });
  assert.strictEqual(invalid.valid, false);

  const valid = validateReorder({
    orderData: [
      { id: 1, order: 0 },
      { id: 2, order: 1 }
    ]
  });
  assert.strictEqual(valid.valid, true);
});

test("POST /submit-form without authenticated singer redirects to singer login", async () => {
  const agent = request.agent(app);
  const getRes = await agent.get("/singer/login");
  const csrfMatch = getRes.text.match(/name="csrf-token" content="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  const res = await agent.post("/submit-form").set("X-CSRF-Token", csrfToken).send({
    title: "Ganesha Sharanam",
    singer_name: "Unauthenticated Devotee",
    deity: "Ganesha",
    session_date: "2026-10-15"
  });

  assert.strictEqual(res.status, 302);
  assert.ok(res.headers.location.includes("/singer/login"));
});
