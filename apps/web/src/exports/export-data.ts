import type { Activity } from "../activities/activity.types.ts";
import {
  activityOccursOn,
  addCalendarDays,
  compareCalendarActivities,
  getDayLabel,
  getMonthLabel,
  getWeekDays,
  getWeekLabel,
} from "../activities/calendar-utils.ts";
import {
  formatActivityType,
  formatCalendarTitle,
  formatSchedule,
  formatStatus,
  getActivityFields,
} from "../activities/activity-format.ts";

export type ExportPeriod = "month" | "week" | "day";
export type ExportBlock = "academic" | "sport" | "personal";
export const EXPORT_BLOCKS: { id: ExportBlock; label: string }[] = [
  { id: "academic", label: "Académico" },
  { id: "sport", label: "Deporte" },
  { id: "personal", label: "Otros" },
];
export function blockForType(type: string): ExportBlock {
  return type.startsWith("academic.")
    ? "academic"
    : type.startsWith("sport.")
      ? "sport"
      : "personal";
}
export function filterExportBlocks(
  activities: Activity[],
  blocks: readonly ExportBlock[],
): Activity[] {
  return activities.filter((activity) =>
    blocks.includes(blockForType(activity.type)),
  );
}
export function exportBlockLabels(blocks: readonly ExportBlock[]): string {
  return EXPORT_BLOCKS.filter((block) => blocks.includes(block.id))
    .map((block) => block.label)
    .join(" · ");
}
export interface ExportRange {
  kind: ExportPeriod;
  from: string;
  to: string;
  label: string;
  filename: string;
}
export interface ExportDay {
  date: string;
  label: string;
  activities: Activity[];
}

export function getExportRange(kind: ExportPeriod, value: string): ExportRange {
  const date = kind === "month" ? `${value}-01` : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Selecciona una fecha válida.");
  const parsed = new Date(`${date}T00:00:00Z`);
  const year = parsed.getUTCFullYear();
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    year < 100 ||
    year > 9998
  ) {
    throw new Error("Selecciona una fecha válida entre los años 0100 y 9998.");
  }
  let from = date,
    to = addCalendarDays(date, 1),
    label = getDayLabel(date);
  if (kind === "month") {
    const next = new Date(parsed);
    next.setUTCMonth(next.getUTCMonth() + 1);
    to = next.toISOString().slice(0, 10);
    label = getMonthLabel(year, parsed.getUTCMonth());
  } else if (kind === "week") {
    from = getWeekDays(date)[0].date;
    to = addCalendarDays(from, 7);
    label = getWeekLabel(date);
  }
  if (from < "0100-01-01" || to > "9999-01-01")
    throw new Error("La semana supera el intervalo de fechas admitido.");
  return {
    kind,
    from,
    to,
    label,
    filename: `synkron-${kind === "month" ? "mes" : kind === "week" ? "semana" : "dia"}-${kind === "month" ? value : from}`,
  };
}

export function groupExportDays(
  range: ExportRange,
  activities: Activity[],
): ExportDay[] {
  const unique = [
    ...new Map(activities.map((activity) => [activity.id, activity])).values(),
  ];
  const days: ExportDay[] = [];
  for (
    let date = range.from;
    date < range.to;
    date = addCalendarDays(date, 1)
  ) {
    days.push({
      date,
      label: getDayLabel(date),
      activities: unique
        .filter((activity) => activityOccursOn(activity, date))
        .sort(compareCalendarActivities),
    });
  }
  return days;
}

export function escapeMarkup(value: string): string {
  const valid = Array.from(value)
    .filter((char) => {
      const point = char.codePointAt(0)!;
      return (
        point === 9 ||
        point === 10 ||
        point === 13 ||
        (point >= 32 &&
          point <= 0x10ffff &&
          !(point >= 0xd800 && point <= 0xdfff) &&
          point !== 0xfffe &&
          point !== 0xffff)
      );
    })
    .join("");
  return valid.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

export interface ActivityPalette {
  text: string;
  border: string;
  background: string;
  label: string;
}
export function exportPalette(
  activity: Pick<Activity, "type" | "status">,
): ActivityPalette {
  if (activity.status === "cancelled")
    return {
      text: "#526171",
      border: "#94a3b8",
      background: "#f1f5f9",
      label: "Cancelado",
    };
  if (activity.type === "academic.assignment")
    return {
      text: "#184e95",
      border: "#3b82c4",
      background: "#edf4ff",
      label: "Entregas",
    };
  if (activity.type === "academic.exam")
    return {
      text: "#6032a0",
      border: "#9063ca",
      background: "#f5efff",
      label: "Exámenes",
    };
  if (activity.type.startsWith("sport."))
    return {
      text: "#a24515",
      border: "#cf7a37",
      background: "#fff3e8",
      label: "Deporte",
    };
  if (activity.type === "personal.event" || activity.type === "social.plan")
    return {
      text: "#9a3465",
      border: "#c9608c",
      background: "#fff0f6",
      label: "Otros",
    };
  return {
    text: "#116477",
    border: "#3390a5",
    background: "#edfafa",
    label: "Actividades",
  };
}
export function statusMark(status: string | null): string {
  if (status === "submitted" || status === "completed") return "✓";
  if (status === "cancelled") return "×";
  if (status === "in_progress") return "◐";
  if (status === "scheduled") return "◷";
  return "○";
}

export function buildListHtml(
  range: ExportRange,
  days: ExportDay[],
  details: boolean,
  controls = true,
  blocks: readonly ExportBlock[] = ["academic", "sport", "personal"],
): string {
  const selectedDays = days.map((day) => ({
    ...day,
    activities: filterExportBlocks(day.activities, blocks),
  }));
  const unique = new Set(
    selectedDays.flatMap((day) =>
      day.activities.map((activity) => activity.id),
    ),
  ).size;
  const populated = selectedDays.filter((day) => day.activities.length);
  const sections = populated
    .map(
      (day) =>
        `<section class="day"><h2>${escapeMarkup(day.label)}</h2>${day.activities
          .map((activity) => {
            const palette = exportPalette(activity);
            const fields = details ? getActivityFields(activity) : [];
            return `<article style="--accent:${palette.border};--ink:${palette.text};--tint:${palette.background}">
      <div class="entry-heading"><span class="kind">${escapeMarkup(formatActivityType(activity.type))}</span><span class="status">${statusMark(activity.status)} ${escapeMarkup(formatStatus(activity.status))}</span></div>
      <h3${activity.status === "cancelled" ? ' class="cancelled"' : ""}>${escapeMarkup(formatCalendarTitle(activity))}</h3>
      <p class="schedule">${escapeMarkup(formatSchedule(activity.schedule))}${activity.schedule.kind === "date" ? " · Sin hora indicada" : ""}</p>
      ${fields.length ? `<dl>${fields.map((field) => `<div><dt>${escapeMarkup(field.label)}</dt><dd>${escapeMarkup(field.value)}</dd></div>`).join("")}</dl>` : ""}
    </article>`;
          })
          .join("")}</section>`,
    )
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeMarkup(range.label)} · Synkron</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f3f6f4;color:#19372f;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.55}.sheet{max-width:900px;margin:28px auto;background:white;padding:42px;border-radius:16px}.brand{font-size:14px;letter-spacing:.13em;color:#176452;font-weight:750;text-transform:uppercase}h1{font-size:30px;line-height:1.2;margin:14px 0;text-transform:capitalize}.subtitle{color:#536b61}.summary{display:flex;gap:12px;flex-wrap:wrap;border-block:1px solid #dce5dd;padding:16px 0;margin:24px 0}.summary strong{font-size:20px;color:#176452}.summary span{margin-right:20px}.day{margin-top:30px}h2{font-size:17px;padding-bottom:9px;border-bottom:2px solid #dce5dd;text-transform:capitalize;break-after:avoid}article{margin:14px 0;padding:16px 20px;border:1px solid #dde4e1;border-left:5px solid var(--accent);border-radius:10px;break-inside:avoid}.entry-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.kind{color:var(--ink);background:var(--tint);padding:3px 9px;border-radius:5px;font-size:12px;font-weight:650}.status{font-size:12px;color:#536b61}h3{font-size:18px;margin:10px 0 5px;overflow-wrap:anywhere}.schedule{margin:0;color:#536b61}.cancelled{text-decoration:line-through}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 22px;margin-bottom:0;font-size:12px}dl>div{display:flex;gap:8px;flex-wrap:wrap}dt{font-weight:650}dd{margin:0;overflow-wrap:anywhere}footer{margin-top:32px;padding-top:18px;border-top:1px solid #dce5dd;font-size:11px;color:#536b61}.actions{display:flex;justify-content:center;padding:20px}.actions button{padding:12px 20px;background:#176452;color:white;border:0;border-radius:8px;font:inherit;cursor:pointer}.empty{padding:30px;background:#f5f7f4;border-radius:10px}.note{font-size:12px;color:#536b61}@media(max-width:600px){.sheet{margin:0;padding:22px;border-radius:0}dl{grid-template-columns:1fr}h1{font-size:25px}}@page{size:A4;margin:15mm}@media print{body{background:white}.sheet{max-width:none;margin:0;padding:0;border-radius:0}.actions{display:none}article{box-shadow:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>${controls ? '<div class="actions"><button type="button" onclick="window.print()">Imprimir / Guardar como PDF</button></div>' : ""}<main class="sheet"><div class="brand">Synkron · Tu agenda</div><h1>${escapeMarkup(range.label)}</h1><p class="subtitle">${range.kind === "month" ? "Resumen mensual" : range.kind === "week" ? "Resumen semanal · Lunes a domingo" : "Resumen diario"} · Horarios de Madrid</p><p class="note">Bloques: ${escapeMarkup(exportBlockLabels(blocks))}</p><div class="summary"><span><strong>${unique}</strong> actividades</span><span><strong>${populated.length}</strong> días con actividades</span></div>${sections || '<p class="empty">No hay actividades sincronizadas en este periodo.</p>'}<footer>Exportado desde Synkron · ${escapeMarkup(new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date()))}.<br>Datos sincronizados en el momento de preparar la exportación. Las actividades de varios días aparecen en cada día que abarcan. Las actividades sin hora se sitúan al final de cada día.</footer></main></body></html>`;
}
