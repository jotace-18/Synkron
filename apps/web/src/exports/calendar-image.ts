import type { Activity } from "../activities/activity.types.ts";
import { getMadridDate, getMonthDays } from "../activities/calendar-utils.ts";
import {
  formatActivityType,
  getActivityFields,
  formatCalendarTitle,
  formatSchedule,
  formatStatus,
} from "../activities/activity-format.ts";
import {
  escapeMarkup,
  filterExportBlocks,
  blockForType,
  exportBlockLabels,
  type ExportBlock,
  exportPalette,
  groupExportDays,
  statusMark,
  type ExportRange,
} from "./export-data.ts";

export type TextMeasure = (text: string) => number;
export function wrapText(
  value: string,
  width: number,
  measure: TextMeasure,
): string[] {
  const words = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (measure(word) > width) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const { segment: char } of new Intl.Segmenter("es", {
        granularity: "grapheme",
      }).segment(word)) {
        if (line && measure(line + char) > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    } else if (!line || measure(`${line} ${word}`) <= width)
      line = line ? `${line} ${word}` : word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["Sin título"];
}
const hour = (value: string) =>
  new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
function timeLabel(activity: Activity, date: string): string {
  const schedule = activity.schedule;
  if (schedule.kind === "date") return "Sin hora";
  if (schedule.kind === "instant")
    return `${schedule.role === "deadline" ? "Vence " : ""}${hour(schedule.at)}`;
  const first = getMadridDate(new Date(schedule.at));
  const last = getMadridDate(new Date(Date.parse(schedule.end_at) - 1));
  const start = first === date ? hour(schedule.at) : "Continúa";
  const end =
    last === date
      ? getMadridDate(new Date(schedule.end_at)) === date
        ? hour(schedule.end_at)
        : "24:00"
      : "sigue mañana";
  return `${start} – ${end}`;
}
export interface CalendarImage {
  svg: string;
  width: number;
  height: number;
}
export function buildCalendarSvg(
  range: ExportRange,
  activities: Activity[],
  measure: TextMeasure = (text) => Array.from(text).length * 19,
  blocks: readonly ExportBlock[] = ["academic", "sport", "personal"],
): CalendarImage {
  if (range.kind !== "month")
    return buildAgendaSvg(range, activities, measure, blocks);
  const [year, month] = range.from.split("-").map(Number);
  const grouped = groupExportDays(
    range,
    filterExportBlocks(activities, blocks),
  );
  const byDay = new Map(grouped.map((day) => [day.date, day.activities]));
  const unique = new Set(
    grouped.flatMap((day) => day.activities.map((activity) => activity.id)),
  ).size;
  const days = getMonthDays(year, month - 1);
  while (days.length > 28 && days.slice(-7).every((day) => !day.inCurrentMonth))
    days.splice(-7);
  const width = 2240,
    padding = 48,
    column = (width - padding * 2) / 7;
  const cardWidth = column - 24,
    lineHeight = 23;
  const cards = days.map((day) =>
    (byDay.get(day.date) ?? []).map((activity) => {
      const title = wrapText(
        formatCalendarTitle(activity),
        cardWidth - 28,
        measure,
      );
      const info = wrapText(
        `${formatStatus(activity.status)} · ${timeLabel(activity, day.date)}`,
        cardWidth - 44,
        measure,
      );
      return {
        activity,
        title,
        info,
        height: 24 + title.length * lineHeight + info.length * lineHeight,
      };
    }),
  );
  const weekHeights = Array.from({ length: days.length / 7 }, (_, week) =>
    Math.max(
      128,
      ...cards
        .slice(week * 7, week * 7 + 7)
        .map(
          (dayCards) =>
            52 + dayCards.reduce((sum, card) => sum + card.height + 9, 0),
        ),
    ),
  );
  const gridTop = 226,
    weekdayHeight = 40;
  const height =
    gridTop + weekdayHeight + weekHeights.reduce((a, b) => a + b, 0) + 118;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escapeMarkup(range.label)} · Synkron</title><desc>Calendario mensual completo. Horarios de Madrid; actividades ordenadas por hora y sin hora al final.</desc><style>text{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:18px}</style><rect width="${width}" height="${height}" fill="#ffffff"/><rect x="${padding}" y="32" width="40" height="40" rx="11" fill="#176452"/><text x="${padding + 20}" y="60" text-anchor="middle" fill="white" style="font-size:26px;font-weight:700">S</text><text x="${padding + 54}" y="60" fill="#176452" style="font-size:23px;font-weight:700">Synkron</text><text x="${padding}" y="124" fill="#19372f" style="font-size:42px;font-weight:700">${escapeMarkup(range.label.charAt(0).toUpperCase() + range.label.slice(1))}</text><text x="${padding}" y="158" fill="#536b61">Horarios de Madrid · ${unique} actividades · ${escapeMarkup(exportBlockLabels(blocks))}</text>`,
  ];
  const legends = [
    ["academic.assignment", "Entregas"],
    ["academic.exam", "Exámenes"],
    ["sport.gym", "Gimnasio"],
    ["personal.event", "Otros"],
  ].filter(([type]) => blocks.includes(blockForType(type)));
  for (const [index, [type, label]] of legends.entries()) {
    const palette = exportPalette({
        type: type as Activity["type"],
        status: null,
      }),
      x = padding + index * 210;
    parts.push(
      `<rect x="${x}" y="181" width="184" height="30" rx="6" fill="${palette.background}" stroke="${palette.border}"/><text x="${x + 12}" y="202" fill="${palette.text}" style="font-size:16px;font-weight:600">${label}</text>`,
    );
  }
  const weekdays = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
  ];
  for (const [index, weekday] of weekdays.entries()) {
    parts.push(
      `<rect x="${padding + index * column}" y="${gridTop}" width="${column}" height="${weekdayHeight}" fill="#edf4ef"/><text x="${padding + index * column + 14}" y="${gridTop + 26}" fill="#36594c" style="font-size:17px;font-weight:650">${weekday}</text>`,
    );
  }
  let y = gridTop + weekdayHeight;
  for (let week = 0; week < weekHeights.length; week++) {
    for (let weekday = 0; weekday < 7; weekday++) {
      const index = week * 7 + weekday,
        day = days[index],
        x = padding + weekday * column;
      parts.push(
        `<rect x="${x}" y="${y}" width="${column}" height="${weekHeights[week]}" fill="${day.inCurrentMonth ? "#ffffff" : "#f5f7f6"}" stroke="#dce5dd"/><text x="${x + 14}" y="${y + 30}" fill="${day.inCurrentMonth ? "#19372f" : "#80908b"}" style="font-size:21px;font-weight:600">${day.day}</text>`,
      );
      let cardY = y + 43;
      for (const card of cards[index]) {
        const palette = exportPalette(card.activity),
          cardX = x + 12;
        const fill =
          card.activity.type === "academic.assignment" &&
          card.activity.details.mandatory === true &&
          card.activity.status !== "cancelled"
            ? "#dbeafe"
            : palette.background;
        parts.push(
          `<g><title>${escapeMarkup(`${formatCalendarTitle(card.activity)}. ${formatSchedule(card.activity.schedule)}. ${formatStatus(card.activity.status)}`)}</title><rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${card.height}" rx="7" fill="${fill}" stroke="${palette.border}"/><rect x="${cardX}" y="${cardY + 6}" width="4" height="${card.height - 12}" rx="2" fill="${palette.border}"/>`,
        );
        for (const [line, text] of card.title.entries()) {
          parts.push(
            `<text x="${cardX + 14}" y="${cardY + 24 + line * lineHeight}" fill="${palette.text}" style="font-weight:650${card.activity.status === "cancelled" ? ";text-decoration:line-through" : ""}">${escapeMarkup(text)}</text>`,
          );
        }
        const infoY = cardY + 26 + card.title.length * lineHeight;
        const status = card.activity.status;
        const done = status === "completed" || status === "submitted";
        const stateInk = done
          ? "#166534"
          : status === "pending"
            ? "#9f3434"
            : status === "in_progress"
              ? "#875107"
              : status === "scheduled"
                ? "#245f87"
                : "#526171";
        const stateFill = done
          ? "#d7f4df"
          : status === "pending"
            ? "#ffe3e3"
            : status === "in_progress"
              ? "#fff0c2"
              : status === "scheduled"
                ? "#e0f2fe"
                : "#e2e8f0";

        parts.push(
          `<circle cx="${cardX + 19}" cy="${infoY - 5}" r="10" fill="${stateFill}"/><text x="${cardX + 19}" y="${infoY + 1}" text-anchor="middle" fill="${stateInk}" style="font-size:17px;font-weight:700">${statusMark(card.activity.status)}</text>`,
        );
        for (const [line, text] of card.info.entries())
          parts.push(
            `<text x="${cardX + 36}" y="${infoY + line * lineHeight}" fill="${palette.text}" style="font-size:16px">${escapeMarkup(text)}</text>`,
          );
        parts.push("</g>");
        cardY += card.height + 9;
      }
    }
    y += weekHeights[week];
  }
  parts.push(
    `<text x="${padding}" y="${height - 68}" fill="#536b61" style="font-size:16px">○ Pendiente · ◷ Programado · ◐ En curso · ✓ Hecho · × Cancelado. Las entregas obligatorias tienen un fondo más intenso.</text><text x="${padding}" y="${height - 36}" fill="#536b61" style="font-size:16px">Exportado desde Synkron · Las actividades de varios días aparecen en cada día que abarcan. No incluye controles de la aplicación.</text></svg>`,
  );
  return { svg: parts.join(""), width, height };
}
// These are designed documents: weekly day cards and a daily agenda, rather
// than rasterized application UI. All measurements grow with the actual text.
function buildAgendaSvg(
  range: ExportRange,
  activities: Activity[],
  measure: TextMeasure,
  blocks: readonly ExportBlock[],
): CalendarImage {
  const daily = range.kind === "day";
  const width = daily ? 1200 : 1600;
  const margin = 48,
    gap = 24;
  const columnWidth = daily
    ? width - margin * 2
    : (width - margin * 2 - gap) / 2;
  const days = groupExportDays(range, filterExportBlocks(activities, blocks));
  const unique = [
    ...new Map(
      days.flatMap((day) =>
        day.activities.map((item) => [item.id, item] as const),
      ),
    ).values(),
  ];
  const completed = unique.filter(
    (item) => item.status === "completed" || item.status === "submitted",
  ).length;
  const timed = unique.filter((item) => item.schedule.kind !== "date").length;
  const text = (
    x: number,
    y: number,
    value: string,
    size = 18,
    color = "#19372f",
    weight = 400,
  ) =>
    `<text x="${x}" y="${y}" fill="${color}" style="font-size:${size}px;font-weight:${weight}">${escapeMarkup(value)}</text>`;
  const lines = (value: string, available: number, size = 18) =>
    wrapText(value, available, (value) => (measure(value) * size) / 18);
  const cards = days.map((day) => {
    const entries = day.activities.map((activity) => {
      const title = lines(formatCalendarTitle(activity), columnWidth - 88, 22);
      const meta = lines(
        `${formatActivityType(activity.type)} · ${statusMark(activity.status)} ${formatStatus(activity.status)}`,
        columnWidth - 88,
      );
      const time = lines(timeLabel(activity, day.date), columnWidth - 88);
      const fields = daily
        ? getActivityFields(activity).flatMap((field) =>
            lines(`${field.label}: ${field.value}`, columnWidth - 88),
          )
        : [];
      return {
        activity,
        title,
        meta,
        time,
        fields,
        height:
          46 +
          title.length * 29 +
          meta.length * 25 +
          time.length * 25 +
          (fields.length ? 16 + fields.length * 25 : 0),
      };
    });
    return {
      day,
      entries,
      height:
        92 +
        (entries.length
          ? entries.reduce((sum, entry) => sum + entry.height + 14, 0)
          : 86),
    };
  });
  const heading = lines(range.label, width - margin * 2, 38);
  const subtitleY = 130 + heading.length * 46;
  const gridTop = subtitleY + 164;
  const rowHeights = daily
    ? [cards[0].height]
    : Array.from({ length: 4 }, (_, row) =>
        Math.max(
          ...cards.slice(row * 2, row * 2 + 2).map((card) => card.height),
        ),
      );
  const height = gridTop + rowHeights.reduce((a, b) => a + b + gap, 0) + 104;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escapeMarkup(range.label)} · Synkron</title><desc>Agenda ${daily ? "diaria" : "semanal"}. Horarios de Madrid. Actividades sin hora al final.</desc><style>text{font-family:system-ui,-apple-system,'Segoe UI',sans-serif}</style><rect width="${width}" height="${height}" fill="#f3f6f3"/><rect width="${width}" height="${gridTop - 26}" fill="#173f36"/><circle cx="${width - 80}" cy="40" r="160" fill="#205347"/><circle cx="${width - 80}" cy="40" r="110" fill="#285d4f"/>`,
    `<rect x="48" y="36" width="42" height="42" rx="12" fill="#d8eee2"/>`,
    text(61, 66, "S", 28, "#173f36", 700),
    text(105, 65, "Synkron", 25, "#ffffff", 700),
    text(
      margin,
      113,
      daily ? "TU DÍA, DE UN VISTAZO" : "TU SEMANA, CON PERSPECTIVA",
      15,
      "#b8d8c8",
      650,
    ),
    ...heading.map((line, index) =>
      text(margin, 157 + index * 46, line, 38, "#ffffff", 700),
    ),
    text(
      margin,
      subtitleY + 25,
      `Horarios de Madrid · ${exportBlockLabels(blocks)}`,
      18,
      "#c2dbcf",
    ),
  ];
  const metrics = [
    [String(unique.length), "ACTIVIDADES"],
    [String(timed), "CON HORARIO"],
    [String(completed), "REALIZADAS"],
  ];
  metrics.forEach(([value, label], index) => {
    const x = margin + index * ((width - margin * 2) / 3);
    parts.push(
      text(x, subtitleY + 81, value, 32, "#ffffff", 700),
      text(x, subtitleY + 110, label, 13, "#b8d8c8", 600),
    );
  });
  let rowY = gridTop;
  for (let index = 0; index < cards.length; index++) {
    const card = cards[index];
    const row = daily ? 0 : Math.floor(index / 2);
    const x = margin + (daily ? 0 : index % 2) * (columnWidth + gap);
    const cardHeight = rowHeights[row];
    const dayNumber = Number(card.day.date.slice(-2));
    const weekday = new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(card.day.date));
    const shortDate = new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(card.day.date));
    parts.push(
      `<rect x="${x}" y="${rowY}" width="${columnWidth}" height="${cardHeight}" rx="20" fill="#ffffff" stroke="#dce6df"/><rect x="${x + 20}" y="${rowY + 20}" width="48" height="48" rx="14" fill="#e8f2eb"/>`,
      text(x + 29, rowY + 53, String(dayNumber), 25, "#176452", 700),
      text(
        x + 82,
        rowY + 40,
        weekday.charAt(0).toUpperCase() + weekday.slice(1),
        21,
        "#19372f",
        700,
      ),
      text(
        x + 82,
        rowY + 64,
        `${shortDate} · ${card.entries.length} actividades`,
        15,
        "#64786d",
      ),
    );
    let y = rowY + 88;
    if (!card.entries.length)
      parts.push(
        text(x + 24, y + 29, "Un espacio libre en tu agenda", 19, "#64786d"),
        text(
          x + 24,
          y + 56,
          "Sin actividades en los bloques seleccionados.",
          16,
          "#64786d",
        ),
      );
    for (const entry of card.entries) {
      const palette = exportPalette(entry.activity);
      parts.push(
        `<g><title>${escapeMarkup(formatSchedule(entry.activity.schedule))}</title><rect x="${x + 20}" y="${y}" width="${columnWidth - 40}" height="${entry.height}" rx="12" fill="${palette.background}"/><rect x="${x + 20}" y="${y + 14}" width="4" height="${entry.height - 28}" rx="2" fill="${palette.border}"/>`,
      );
      let baseline = y + 29;
      for (const line of entry.time) {
        parts.push(text(x + 40, baseline, line, 18, palette.text, 650));
        baseline += 25;
      }
      baseline += 5;
      for (const line of entry.title) {
        parts.push(
          `<text x="${x + 40}" y="${baseline}" fill="${palette.text}" style="font-size:22px;font-weight:700${entry.activity.status === "cancelled" ? ";text-decoration:line-through" : ""}">${escapeMarkup(line)}</text>`,
        );
        baseline += 29;
      }
      baseline += 4;
      for (const line of entry.meta) {
        parts.push(text(x + 40, baseline, line, 18, palette.text));
        baseline += 25;
      }
      if (entry.fields.length) baseline += 16;
      for (const line of entry.fields) {
        parts.push(text(x + 40, baseline, line, 18, "#53675d"));
        baseline += 25;
      }
      parts.push("</g>");
      y += entry.height + 14;
    }
    if (daily || index % 2 === 1 || index === cards.length - 1)
      rowY += cardHeight + gap;
  }
  parts.push(
    text(
      margin,
      height - 65,
      "Hecho para compartir · Exportado desde Synkron",
      17,
      "#365c4b",
      650,
    ),
    text(
      margin,
      height - 35,
      "Sin hora al final. Los eventos de varios días figuran en cada jornada que abarcan.",
      16,
      "#64786d",
    ),
    "</svg>",
  );
  return { svg: parts.join(""), width, height };
}

export function assertPngSize(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 16384 ||
    height > 16384 ||
    width * height > 32_000_000
  ) {
    throw new Error(
      "Esta exportación es demasiado grande para un PNG completo. Descarga el SVG: conserva todas las actividades y se amplía sin perder calidad.",
    );
  }
}
export async function calendarPng(
  image: CalendarImage,
  signal: AbortSignal,
): Promise<Blob> {
  assertPngSize(image.width, image.height);
  signal.throwIfAborted();
  const url = URL.createObjectURL(
    new Blob([image.svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  const canvas = document.createElement("canvas");
  try {
    const bitmap = new Image();
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        bitmap.src = "";
        reject(new DOMException("Exportación cancelada", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      bitmap.onload = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      bitmap.onerror = () => {
        signal.removeEventListener("abort", abort);
        reject(
          new Error("No se pudo generar el PNG. Puedes descargar el SVG."),
        );
      };
      bitmap.src = url;
    });
    signal.throwIfAborted();
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "Este navegador no permite generar PNG. Puedes descargar el SVG.",
      );
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, image.width, image.height);
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => {
        if (signal.aborted)
          reject(new DOMException("Exportación cancelada", "AbortError"));
        else if (blob) resolve(blob);
        else
          reject(
            new Error("No se pudo generar el PNG. Puedes descargar el SVG."),
          );
      }, "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}
