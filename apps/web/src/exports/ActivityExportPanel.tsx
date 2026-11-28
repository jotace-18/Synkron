import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { getMadridDate } from "../activities/calendar-utils";
import {
  listActivitiesInPeriod,
  SessionExpiredError,
} from "../activities/activities-client";
import {
  buildListHtml,
  getExportRange,
  groupExportDays,
  filterExportBlocks,
  EXPORT_BLOCKS,
  type ExportBlock,
  type ExportPeriod,
  type ExportRange,
} from "./export-data";
import {
  buildCalendarSvg,
  calendarPng,
  type CalendarImage,
} from "./calendar-image";
import "./exports.css";

interface PreparedExport {
  key: string;
  range: ExportRange;
  count: number;
  list?: { url: string; preview: string };
  calendar?: { url: string; image: CalendarImage };
}
export default function ActivityExportPanel({
  onSessionExpired,
  refreshVersion = 0,
}: {
  onSessionExpired: () => void;
  refreshVersion?: number;
}) {
  const [format, setFormat] = useState<"list" | "calendar">("calendar");
  const [period, setPeriod] = useState<ExportPeriod>("month");
  const [month, setMonth] = useState(() => getMadridDate().slice(0, 7));
  const [date, setDate] = useState(() => getMadridDate());
  const [blocks, setBlocks] = useState<ExportBlock[]>([
    "academic",
    "sport",
    "personal",
  ]);
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedExport | null>(null);
  const request = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  const effectivePeriod = period;
  const value = effectivePeriod === "month" ? month : date;
  const key = JSON.stringify([
    format,
    effectivePeriod,
    value,
    details,
    blocks,
    refreshVersion,
  ]);
  let range: ExportRange | null = null;
  try {
    range = getExportRange(effectivePeriod, value);
  } catch {
    /* Partial date input is validated before preparing. */
  }
  const ready = prepared?.key === key ? prepared : null;
  useEffect(
    () => () => {
      request.current?.abort();
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  function storeUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  }
  async function prepare(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!range || !blocks.length || request.current) return;
    const selectedRange = range,
      selectedKey = key;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    setNotice(null);
    setPrepared(null);
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current = [];
    try {
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(60000),
      ]);
      const activities = filterExportBlocks(
        await listActivitiesInPeriod(
          selectedRange.from,
          selectedRange.to,
          signal,
        ),
        blocks,
      );
      signal.throwIfAborted();
      const days = groupExportDays(selectedRange, activities);
      const count = new Set(
        days.flatMap((day) => day.activities.map((activity) => activity.id)),
      ).size;
      if (format === "list") {
        const html = buildListHtml(selectedRange, days, details, true, blocks);
        const url = storeUrl(
          new Blob([html], { type: "text/html;charset=utf-8" }),
        );
        setPrepared({
          key: selectedKey,
          range: selectedRange,
          count,
          list: {
            url,
            preview: buildListHtml(selectedRange, days, details, false, blocks),
          },
        });
      } else {
        const context = document.createElement("canvas").getContext("2d");
        if (context)
          context.font =
            '650 18px system-ui, -apple-system, "Segoe UI", sans-serif';
        const image = buildCalendarSvg(
          selectedRange,
          activities,
          context ? (text) => context.measureText(text).width : undefined,
          blocks,
        );
        signal.throwIfAborted();
        const url = storeUrl(
          new Blob([image.svg], { type: "image/svg+xml;charset=utf-8" }),
        );
        setPrepared({
          key: selectedKey,
          range: selectedRange,
          count,
          calendar: { url, image },
        });
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof SessionExpiredError) {
        onSessionExpired();
        return;
      }
      setError(
        cause instanceof Error &&
          !(cause instanceof DOMException) &&
          !(cause instanceof TypeError)
          ? cause.message
          : "No se pudo preparar la exportación completa. Revisa la conexión y vuelve a intentarlo.",
      );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  async function downloadPng() {
    if (!ready?.calendar || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const blob = await calendarPng(ready.calendar.image, controller.signal);
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${ready.range.filename}.png`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("PNG preparado. Comprueba la descarga de tu navegador.");
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo generar el PNG. Puedes descargar el SVG.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  function cancel() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setNotice("Exportación cancelada.");
  }
  return (
    <details className="activity-export-panel">
      <summary>
        <span aria-hidden="true">↓</span> Exportar agenda y calendario
      </summary>
      <div className="activity-export-body">
        <div className="activity-export-heading">
          <p className="eyebrow">Tu agenda, para llevar</p>
          <h2>Prepara tu exportación</h2>
          <p>
            Elige mes, semana o día y guarda una imagen lista para compartir.
            También puedes preparar una lista para imprimir o guardar como PDF.
          </p>
        </div>
        <form className="activity-export-form" onSubmit={prepare}>
          <label>
            Qué exportar
            <select
              value={format}
              disabled={busy}
              onChange={(event) => {
                setFormat(event.target.value as "list" | "calendar");
                setError(null);
                setNotice(null);
              }}
            >
              <option value="calendar">Imagen · PNG / SVG</option>
              <option value="list">Lista para imprimir / PDF</option>
            </select>
          </label>
          <label>
            Periodo
            <select
              value={period}
              disabled={busy}
              onChange={(event) => {
                setPeriod(event.target.value as ExportPeriod);
                setError(null);
                setNotice(null);
              }}
            >
              <option value="month">Mes</option>
              <option value="week">Semana</option>
              <option value="day">Día</option>
            </select>
          </label>
          {effectivePeriod === "month" ? (
            <label>
              Mes
              <input
                type="month"
                required
                min="0100-01"
                max="9998-12"
                placeholder="2026-11"
                value={month}
                disabled={busy}
                onChange={(event) => {
                  setMonth(event.target.value);
                  setError(null);
                  setNotice(null);
                }}
              />
            </label>
          ) : (
            <label>
              {effectivePeriod === "week" ? "Un día de la semana" : "Día"}
              <input
                type="date"
                required
                min="0100-01-01"
                max="9998-12-31"
                value={date}
                disabled={busy}
                onChange={(event) => {
                  setDate(event.target.value);
                  setError(null);
                  setNotice(null);
                }}
              />
            </label>
          )}
          {format === "list" && (
            <label className="activity-export-checkbox">
              <input
                type="checkbox"
                checked={details}
                disabled={busy}
                onChange={(event) => setDetails(event.target.checked)}
              />{" "}
              Añadir detalles de las actividades
            </label>
          )}
          <fieldset className="activity-export-blocks" disabled={busy}>
            <legend>Bloques a incluir</legend>
            {EXPORT_BLOCKS.map((block) => (
              <label key={block.id}>
                <input
                  type="checkbox"
                  checked={blocks.includes(block.id)}
                  onChange={(event) => {
                    setBlocks((previous) =>
                      event.target.checked
                        ? [...previous, block.id]
                        : previous.filter((value) => value !== block.id),
                    );
                    setError(null);
                    setNotice(null);
                  }}
                />
                {block.label}
              </label>
            ))}
          </fieldset>
          <div className="activity-export-submit">
            <button
              type="submit"
              className="primary-button"
              disabled={busy || !range || !blocks.length}
            >
              {busy
                ? "Preparando…"
                : format === "calendar"
                  ? "Crear imagen"
                  : "Preparar lista / PDF"}
            </button>
            {busy && (
              <button
                type="button"
                className="secondary-button"
                onClick={cancel}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
        <p className="activity-export-period">
          {range ? range.label : "Selecciona un periodo válido."}
          {effectivePeriod === "week" ? " · Semana de lunes a domingo" : ""}
        </p>
        <p className="activity-export-note">
          Incluye las actividades sincronizadas de los bloques seleccionados,
          realizadas y canceladas incluidas. Los filtros de la agenda no limitan
          la exportación.
        </p>
        {!blocks.length && (
          <p className="activity-export-note">
            Selecciona al menos un bloque para preparar la exportación.
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {ready && (
          <section
            className="activity-export-result"
            aria-label="Vista previa de la exportación"
          >
            <div className="activity-export-actions">
              <p role="status">
                <strong>{ready.count}</strong> actividades · {ready.range.label}
              </p>
              {ready.list && (
                <>
                  <a
                    className="primary-button"
                    href={ready.list.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir lista / Guardar PDF
                  </a>
                  <a
                    className="secondary-button"
                    href={ready.list.url}
                    download={`${ready.range.filename}.html`}
                  >
                    Descargar HTML
                  </a>
                </>
              )}
              {ready.calendar && (
                <>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void downloadPng()}
                  >
                    Descargar PNG
                  </button>
                  <a
                    className="secondary-button"
                    href={ready.calendar.url}
                    download={`${ready.range.filename}.svg`}
                  >
                    Descargar SVG
                  </a>
                </>
              )}
            </div>
            {ready.list ? (
              <>
                <p className="activity-export-note">
                  Abre la lista y pulsa Imprimir / Guardar como PDF. En el
                  diálogo del navegador elige Guardar como PDF; el documento usa
                  tamaño A4.
                </p>
                <iframe
                  className="activity-export-list-preview"
                  title={`Lista de actividades: ${ready.range.label}`}
                  sandbox=""
                  srcDoc={ready.list.preview}
                />
              </>
            ) : (
              ready.calendar && (
                <>
                  <p className="activity-export-note">
                    PNG completo a {ready.calendar.image.width} ×{" "}
                    {ready.calendar.image.height} píxeles. SVG mantiene la
                    nitidez al ampliar. El diseño se adapta al periodo y crece
                    para mostrar todas las actividades sin recortarlas.
                  </p>
                  <div className="activity-export-image-preview">
                    <img
                      src={ready.calendar.url}
                      alt={`Vista previa del calendario completo de ${ready.range.label}`}
                      width={ready.calendar.image.width}
                      height={ready.calendar.image.height}
                    />
                  </div>
                </>
              )
            )}
          </section>
        )}
      </div>
    </details>
  );
}
