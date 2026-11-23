import assert from "node:assert/strict";
import test from "node:test";
import { readGymForm, gymPatch } from "../src/gym/gym-form.ts";
import {
  madridFields,
  madridInstant,
  sessionEnd,
} from "../src/gym/gym-time.ts";
import {
  createSession,
  updateSession,
  retireSession,
  listSessions,
  UnconfirmedGymError,
  GymUnavailableError,
} from "../src/gym/gym-client.ts";

const input = {
  started_at: "2026-11-24T17:00:00.000Z",
  duration_minutes: 60,
  training_mode: "push",
  accompanied: false,
  status: "scheduled",
};
const original = {
  ...input,
  id: "11111111-1111-4111-8111-111111111111",
  title: "Gimnasio · Push",
  end_at: "2026-11-24T18:00:00.000Z",
  created_at: "2026-11-01T12:00:00.000Z",
  updated_at: "2026-11-01T12:00:00.000Z",
  deleted_at: null,
};
function form(overrides = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    date: "2026-11-24",
    time: "18:00",
    duration_minutes: "60",
    training_mode: "push",
    company: "solo",
    status: "scheduled",
    ...overrides,
  }))
    data.set(key, value);
  return data;
}

test("Madrid time conversion handles both clock changes and preserves an existing repeated-hour instant on edit", () => {
  assert.equal(madridInstant("2026-11-24", "18:00"), input.started_at);
  assert.equal(
    madridInstant("2026-06-24", "18:00"),
    "2026-06-24T16:00:00.000Z",
  );
  assert.throws(
    () => madridInstant("2026-03-29", "02:30"),
    /no existe en Madrid/,
  );
  assert.equal(
    madridInstant("2026-10-25", "02:30"),
    "2026-10-25T00:30:00.000Z",
  );
  assert.throws(() => madridInstant("2026-02-30", "18:00"), /fecha/);
  const source = { ...original, started_at: "2026-10-25T01:30:45.123Z" };
  const fields = madridFields(source.started_at);
  assert.deepEqual(fields, { date: "2026-10-25", time: "02:30" });
  assert.deepEqual(gymPatch(readGymForm(form(fields), source), source), {});
  assert.deepEqual(
    gymPatch(
      readGymForm(
        form({ ...fields, company: "accompanied", duration_minutes: "90" }),
        source,
      ),
      source,
    ),
    { duration_minutes: 90, accompanied: true },
  );
});

test("form sends only source fields, validates choices and duration, and derives an end across midnight", () => {
  assert.deepEqual(readGymForm(form()), input);
  assert.equal(
    sessionEnd("2026-11-24T22:30:00.000Z", 90),
    "2026-11-25T00:00:00.000Z",
  );
  for (const values of [
    { duration_minutes: "" },
    { duration_minutes: "0" },
    { duration_minutes: "1.5" },
    { duration_minutes: "nope" },
    { training_mode: "legs" },
    { company: "false" },
    { status: "done" },
    { time: "" },
  ])
    assert.throws(() => readGymForm(form(values)));
  assert.throws(() => sessionEnd("9999-12-31T23:30:00.000Z", 60), /fuera/);
});

test("client creates, patches, cancels and retires without browser credentials and never retries an uncertain write", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 5) throw new TypeError("Connection lost");
    if (calls.length === 6) return new Response(null, { status: 404 });
    return new Response(null, {
      status: [201, 200, 200, 204][calls.length - 1],
    });
  });
  await createSession(input);
  await updateSession(original.id, { accompanied: true });
  await updateSession(original.id, { status: "cancelled" });
  await retireSession(original.id);
  await assert.rejects(createSession(input), UnconfirmedGymError);
  await assert.rejects(
    updateSession(original.id, { status: "completed" }),
    GymUnavailableError,
  );
  await updateSession(original.id, {});
  assert.equal(calls.length, 6);
  assert.deepEqual(
    calls.slice(0, 4).map((call) => call.options.method),
    ["POST", "PATCH", "PATCH", "DELETE"],
  );
  assert.deepEqual(JSON.parse(calls[2].options.body), { status: "cancelled" });
  assert.equal(calls[3].options.body, undefined);
  assert.ok(
    calls.every(
      (call) =>
        call.options.credentials === "omit" &&
        !new Headers(call.options.headers).has("Authorization"),
    ),
  );
});

test("list uses one-record lookahead for paging and rejects malformed responses", async (t) => {
  const records = Array.from({ length: 21 }, (_, index) => ({
    ...original,
    id: `id-${index}`,
  }));
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json(
      calls.length === 1
        ? records
        : calls.length === 2
          ? [original]
          : [{ title: "broken" }],
    );
  });
  const first = await listSessions(0);
  assert.equal(first.sessions.length, 20);
  assert.equal(first.hasMore, true);
  const second = await listSessions(1);
  assert.equal(second.sessions.length, 1);
  assert.equal(second.hasMore, false);
  assert.equal(calls[0].url, "/api/v1/gym-sessions?limit=21&offset=0");
  assert.equal(calls[1].url, "/api/v1/gym-sessions?limit=21&offset=20");
  await assert.rejects(listSessions(2), /respuesta inesperada/);
});
