import {
  GYM_STATUSES,
  TRAINING_MODES,
  type GymInput,
  type GymSession,
} from "./gym.types.ts";
import { madridFields, madridInstant, sessionEnd } from "./gym-time.ts";

export function readGymForm(data: FormData, original?: GymSession): GymInput {
  const text = (name: string) => String(data.get(name) ?? "").trim();
  const date = text("date"),
    time = text("time");
  const duration = Number(text("duration_minutes"));
  if (!Number.isInteger(duration) || duration < 1 || duration > 2_147_483_647)
    throw new Error("Indica una duración en minutos enteros positivos.");
  const mode = TRAINING_MODES.find((value) => value === text("training_mode"));
  const status = GYM_STATUSES.find((value) => value === text("status"));
  if (!mode || !status)
    throw new Error("Selecciona una modalidad y un estado válidos.");
  const company = text("company");
  if (!["solo", "accompanied"].includes(company))
    throw new Error("Indica si entrenas solo o acompañado.");
  const previous = original ? madridFields(original.started_at) : null;
  const start =
    original && previous?.date === date && previous.time === time
      ? original.started_at
      : madridInstant(date, time);
  sessionEnd(start, duration);
  return {
    started_at: start,
    duration_minutes: duration,
    training_mode: mode,
    accompanied: company === "accompanied",
    status,
  };
}
export function gymPatch(
  input: GymInput,
  original: GymSession,
): Partial<GymInput> {
  const patch: Partial<GymInput> = {};
  for (const field of Object.keys(input) as (keyof GymInput)[]) {
    if (input[field] !== original[field])
      Object.assign(patch, { [field]: input[field] });
  }
  return patch;
}
