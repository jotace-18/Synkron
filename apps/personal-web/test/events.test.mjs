import assert from "node:assert/strict";
import test from "node:test";
import {
  readEventForm,
  eventPatch,
  eventTimeLabel,
  eventDateLabel,
} from "../src/events/event-form.ts";
import { madridFields, madridInstant } from "../src/events/event-time.ts";
import {
  createEvent,
  updateEvent,
  retireEvent,
  listEvents,
  UnconfirmedEventError,
  EventUnavailableError,
} from "../src/events/event-client.ts";
const base = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Comprar",
  on_date: "2026-11-25",
  started_at: null,
  duration_minutes: null,
  end_at: null,
  people: [],
  status: "pending",
  created_at: "2026-11-23T10:00:00.000Z",
  updated_at: "2026-11-23T10:00:00.000Z",
  deleted_at: null,
};
function form(fields = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    title: "Comprar",
    date: "2026-11-25",
    time: "",
    duration_minutes: "",
    people: "",
    status: "pending",
    ...fields,
  }))
    data.set(key, value);
  return data;
}

test("forms keep days without an invented time, allow points and intervals, and clear the previous schedule atomically", () => {
  const day = readEventForm(form());
  assert.deepEqual(eventPatch(day, base), {});
  assert.equal(eventTimeLabel(day), "Sin hora");
  assert.match(eventDateLabel(day), /25/);
  const instant = readEventForm(form({ time: "10:00" }));
  assert.equal(instant.started_at, "2026-11-25T09:00:00.000Z");
  assert.equal(instant.on_date, null);
  assert.equal(instant.duration_minutes, null);
  assert.deepEqual(eventPatch(instant, base), {
    on_date: null,
    started_at: "2026-11-25T09:00:00.000Z",
  });
  const interval = readEventForm(
    form({ time: "23:30", duration_minutes: "90", people: " Ana \n\n Luis " }),
  );
  assert.deepEqual(interval.people, ["Ana", "Luis"]);
  assert.match(eventTimeLabel(interval), /26 nov/);
  const original = { ...base, ...interval, end_at: "2026-11-26T00:00:00.000Z" };
  assert.deepEqual(eventPatch(readEventForm(form(), original), original), {
    on_date: "2026-11-25",
    started_at: null,
    duration_minutes: null,
    people: [],
  });
  for (const fields of [
    { date: "2026-02-29" },
    { title: " " },
    { duration_minutes: "30" },
    { time: "10:00", duration_minutes: "0" },
    { people: Array(51).fill("Ana").join("\n") },
    { people: "x".repeat(101) },
  ])
    assert.throws(() => readEventForm(form(fields)));
});
test("Madrid clock changes are explicit and unrelated edits preserve an existing instant including subminute precision", () => {
  assert.throws(() => madridInstant("2026-03-29", "02:30"), /no existe/);
  assert.equal(
    madridInstant("2026-10-25", "02:30"),
    "2026-10-25T00:30:00.000Z",
  );
  const original = {
    ...base,
    on_date: null,
    started_at: "2026-10-25T01:30:45.123Z",
  };
  const values = madridFields(original.started_at);
  assert.deepEqual(
    eventPatch(readEventForm(form(values), original), original),
    {},
  );
  assert.deepEqual(
    eventPatch(
      readEventForm(form({ ...values, people: "Ana" }), original),
      original,
    ),
    { people: ["Ana"] },
  );
  assert.throws(
    () =>
      readEventForm(
        form({ date: "9999-12-31", time: "23:59", duration_minutes: "120" }),
      ),
    /fuera/,
  );
});
test("page lookahead validates all three time forms and detects malformed intervals", async (t) => {
  const rows = Array.from({ length: 21 }, (_, index) => ({
    ...base,
    id: String(index),
  }));
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json(rows);
  });
  const page = await listEvents(1);
  assert.equal(page.events.length, 20);
  assert.equal(page.hasMore, true);
  assert.match(calls[0].url, /limit=21&offset=20/);
  assert.equal(calls[0].options.credentials, "omit");
  rows[0] = {
    ...base,
    on_date: null,
    started_at: "2026-11-25T09:00:00.000Z",
    duration_minutes: null,
  };
  rows[1] = {
    ...rows[0],
    id: "interval",
    duration_minutes: 30,
    end_at: "2026-11-25T09:30:00.000Z",
  };
  await listEvents(0);
  rows[1] = { ...rows[1], end_at: "2026-11-25T09:45:00.000Z" };
  await assert.rejects(listEvents(0), /inesperada/);
});
test("writes omit credentials, avoid empty patches and do not automatically repeat uncertain operations", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) throw new TypeError("lost response");
    if (calls.length === 2) return new Response(null, { status: 404 });
    return new Response(null, { status: 204 });
  });
  await assert.rejects(
    createEvent(readEventForm(form())),
    UnconfirmedEventError,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  await updateEvent(base.id, {});
  assert.equal(calls.length, 1);
  await assert.rejects(
    updateEvent(base.id, { status: "cancelled" }),
    EventUnavailableError,
  );
  await retireEvent(base.id);
  assert.equal(calls[2].options.method, "DELETE");
});
