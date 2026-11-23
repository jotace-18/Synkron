import { useEffect, useRef, useState } from "react";
import EventForm from "./events/EventForm";
import EventsTable from "./events/EventsTable";
import EventActionDialog from "./events/EventActionDialog";
import { listEvents } from "./events/event-client";
import type { PersonalEvent } from "./events/event.types";
import "./App.css";

type Editor = { mode: "create" } | { mode: "edit"; event: PersonalEvent };
function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [action, setAction] = useState<{
    event: PersonalEvent;
    kind: "cancel" | "retire";
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    events: PersonalEvent[];
    hasMore: boolean;
    error: string | null;
  } | null>(null);
  const newButton = useRef<HTMLButtonElement>(null),
    opener = useRef<HTMLButtonElement | null>(null);
  const key = `${page}:${revision}`,
    loading = result?.key !== key,
    busy = editor !== null || action !== null;
  const events = loading ? [] : result.events,
    error = loading ? null : result.error;
  useEffect(() => {
    const controller = new AbortController();
    listEvents(page, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ key, ...data, error: null });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            events: [],
            hasMore: false,
            error:
              cause instanceof Error
                ? cause.message
                : "No se pudieron cargar tus compromisos.",
          });
      });
    return () => controller.abort();
  }, [page, key]);
  function refresh() {
    setPage(0);
    setRevision((value) => value + 1);
  }
  function restoreFocus() {
    window.requestAnimationFrame(() =>
      (opener.current?.isConnected
        ? opener.current
        : newButton.current
      )?.focus(),
    );
  }
  function close(checkList: boolean) {
    setEditor(null);
    setAction(null);
    if (checkList) {
      setNotice(
        "Comprueba el compromiso en la lista antes de volver a intentarlo.",
      );
      refresh();
    }
    restoreFocus();
  }
  return (
    <div className="personal-shell">
      <a className="personal-skip-link" href="#main">
        Saltar al contenido
      </a>
      <aside className="personal-sidebar">
        <div className="personal-brand">
          <span className="personal-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <path
                d="M13 10h22v30H13zM19 6h10v8H19zM19 23h10m-10 8h10"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div>
            <strong>Otros</strong>
            <span>Tu agenda personal</span>
          </div>
        </div>
        <nav className="personal-navigation" aria-label="Secciones">
          <a href="#events" aria-current="page">
            <span aria-hidden="true">↗</span> Compromisos
          </a>
        </nav>
        <div className="personal-sidebar-note">
          <span className="personal-sidebar-line" />
          <p>
            Un espacio para tus recados, tus citas y los planes que compartes.
          </p>
        </div>
      </aside>
      <main className="personal-main" id="main">
        <header className="personal-heading">
          <div>
            <p className="personal-eyebrow">Organización personal</p>
            <h1>Mis compromisos</h1>
            <p className="personal-description">
              Organiza tus recados, reserva tus citas y guarda los planes con
              las personas que te acompañan.
            </p>
          </div>
          <button
            ref={newButton}
            className="personal-button"
            type="button"
            disabled={busy}
            aria-expanded={editor?.mode === "create"}
            aria-controls={
              editor?.mode === "create" ? "event-editor" : undefined
            }
            onClick={() => {
              opener.current = newButton.current;
              setNotice(null);
              setEditor({ mode: "create" });
            }}
          >
            <span aria-hidden="true">＋</span> Nuevo compromiso
          </button>
        </header>
        {notice && (
          <p className="personal-notice" role="status">
            {notice}
          </p>
        )}
        {editor && (
          <EventForm
            key={editor.mode === "edit" ? editor.event.id : "new"}
            event={editor.mode === "edit" ? editor.event : undefined}
            onClose={close}
            onSaved={(changed) => {
              setEditor(null);
              setNotice(
                changed
                  ? editor.mode === "edit"
                    ? "Compromiso actualizado."
                    : "Compromiso creado."
                  : "No había cambios que guardar.",
              );
              if (changed) refresh();
              restoreFocus();
            }}
          />
        )}
        <section
          className="personal-panel"
          id="events"
          aria-labelledby="events-title"
          aria-busy={loading}
        >
          <div className="personal-panel-heading">
            <div>
              <h2 id="events-title">Tus compromisos</h2>
              <p className="personal-muted">
                Recados, citas y quedadas. Horarios de Madrid.
              </p>
            </div>
            <button
              className="personal-button personal-button-secondary personal-refresh"
              type="button"
              disabled={busy || loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              Actualizar
            </button>
          </div>
          {loading ? (
            <p className="personal-empty" role="status">
              Cargando compromisos…
            </p>
          ) : error ? (
            <div className="personal-empty">
              <p className="personal-error" role="alert">
                {error}
              </p>
              <button
                className="personal-button"
                type="button"
                disabled={busy}
                onClick={() => setRevision((value) => value + 1)}
              >
                Reintentar
              </button>
            </div>
          ) : events.length === 0 ? (
            <div className="personal-empty" role="status">
              <span className="personal-empty-mark" aria-hidden="true">
                ↗
              </span>
              <h3>
                {page
                  ? "No hay compromisos en esta página"
                  : "Tus próximos planes empiezan aquí"}
              </h3>
              <p>
                {page
                  ? "Vuelve a la página anterior para consultar tus compromisos."
                  : "Añade un asunto y un día. La hora, duración y personas son opcionales."}
              </p>
              {!page && (
                <button
                  className="personal-button personal-button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={(event) => {
                    opener.current = event.currentTarget;
                    setNotice(null);
                    setEditor({ mode: "create" });
                  }}
                >
                  Crear mi primer compromiso
                </button>
              )}
            </div>
          ) : (
            <EventsTable
              events={events}
              disabled={busy}
              onEdit={(event, button) => {
                opener.current = button;
                setNotice(null);
                setEditor({ mode: "edit", event });
              }}
              onAction={(event, kind, button) => {
                opener.current = button;
                setNotice(null);
                setAction({ event, kind });
              }}
            />
          )}
          {!loading && !error && (events.length > 0 || page > 0) && (
            <div
              className="personal-pagination"
              aria-label="Paginación de compromisos"
            >
              <button
                className="personal-button personal-button-secondary"
                type="button"
                disabled={busy || page === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                Anterior
              </button>
              <span>Página {page + 1}</span>
              <button
                className="personal-button personal-button-secondary"
                type="button"
                disabled={busy || !result?.hasMore}
                onClick={() => setPage((value) => value + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </section>
      </main>
      {action && (
        <EventActionDialog
          key={`${action.kind}:${action.event.id}`}
          event={action.event}
          action={action.kind}
          onClose={close}
          onDone={() => {
            setAction(null);
            setNotice(
              action.kind === "retire"
                ? "Compromiso retirado."
                : "Compromiso cancelado.",
            );
            refresh();
            restoreFocus();
          }}
        />
      )}
    </div>
  );
}
export default App;
