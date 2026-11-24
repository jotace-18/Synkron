import assert from "node:assert/strict";
import test from "node:test";
import { sourceFetch, authRequest } from "../src/auth/source-auth-client.ts";
test("browser writes use a fresh session-bound CSRF token without exposing a Bearer", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return url.endsWith("/csrf")
      ? Response.json({ csrf_token: `csrf-${calls.length}` })
      : new Response(null, { status: 204 });
  });
  await sourceFetch("/api/v1/events/id", { method: "DELETE" });
  await sourceFetch("/api/v1/events/id", { method: "DELETE" });
  const writes = calls.filter((call) => call.options.method === "DELETE");
  assert.equal(writes.length, 2);
  assert.deepEqual(
    writes.map((call) => call.options.headers.get("X-CSRF-Token")),
    ["csrf-1", "csrf-3"],
  );
  assert.ok(
    writes.every(
      (call) =>
        call.options.credentials === "same-origin" &&
        !call.options.headers.has("Authorization"),
    ),
  );
});
test("an unavailable CSRF response prevents the write; account conflicts and rejected login are not retried", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    count++;
    if (count === 1) return Response.json({});
    return url.endsWith("/csrf")
      ? Response.json({ csrf_token: "valid" })
      : new Response(null, { status: url.endsWith("/login") ? 401 : 409 });
  });
  await assert.rejects(
    sourceFetch("/api/v1/events", { method: "POST" }),
    /sesión no válida/,
  );
  assert.equal(count, 1);
  await assert.rejects(
    authRequest("register", "POST", {
      email: "owner@example.test",
      password: "Some long password",
    }),
    /ya tiene cuenta/,
  );
  assert.equal(count, 3);
  await assert.rejects(
    authRequest("login", "POST", {
      email: "owner@example.test",
      password: "wrong",
    }),
    /no válidos/,
  );
  assert.equal(count, 5);
});
