import { useEffect, useRef, useState } from "react";
import GymForm from "./gym/GymForm";
import SessionsTable from "./gym/SessionsTable";
import SessionActionDialog from "./gym/SessionActionDialog";
import { listSessions } from "./gym/gym-client";
import type { GymSession } from "./gym/gym.types";
import "./App.css";

type Editor = { mode: "create" } | { mode: "edit"; session: GymSession };
function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [action, setAction] = useState<{
    session: GymSession;
    kind: "cancel" | "retire";
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    sessions: GymSession[];
    hasMore: boolean;
    error: string | null;
  } | null>(null);
  const newButton = useRef<HTMLButtonElement>(null),
    opener = useRef<HTMLButtonElement | null>(null);
  const key = `${page}:${revision}`,
    loading = result?.key !== key,
    busy = editor !== null || action !== null;
  const sessions = loading ? [] : result.sessions,
    error = loading ? null : result.error;
  useEffect(() => {
    const controller = new AbortController();
    listSessions(page, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ key, ...data, error: null });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            sessions: [],
            hasMore: false,
            error:
              cause instanceof Error
                ? cause.message
                : "No se pudieron cargar tus entrenamientos.",
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
        "Comprueba el entrenamiento en la lista antes de volver a intentarlo.",
      );
      refresh();
    }
    restoreFocus();
  }
  return (
    <div className="sport-shell">
      <a className="sport-skip-link" href="#main">
        Saltar al contenido
      </a>
      <aside className="sport-sidebar">
        <div className="sport-brand">
          <span className="sport-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <path
                d="M8 18v12m7-18v24m18-24v24m7-18v12M15 24h18"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div>
            <strong>Sport</strong>
            <span>Tu agenda deportiva</span>
          </div>
        </div>
        <nav className="sport-navigation" aria-label="Secciones">
          <a href="#sessions" aria-current="page">
            <span aria-hidden="true">↗</span> Gimnasio
          </a>
        </nav>
        <div className="sport-sidebar-note">
          <span className="sport-sidebar-line" />
          <p>
            Un espacio para planificar tus sesiones y llevar el ritmo a tu
            manera.
          </p>
        </div>
      </aside>
      <main className="sport-main" id="main">
        <header className="sport-heading">
          <div>
            <p className="sport-eyebrow">Agenda deportiva</p>
            <h1>Mis entrenamientos</h1>
            <p className="sport-description">
              Planifica tus sesiones, registra tus entrenamientos y organiza tu
              próxima visita al gimnasio.
            </p>
          </div>
          <button
            ref={newButton}
            className="sport-button"
            type="button"
            disabled={busy}
            aria-expanded={editor?.mode === "create"}
            aria-controls={editor?.mode === "create" ? "gym-editor" : undefined}
            onClick={() => {
              opener.current = newButton.current;
              setNotice(null);
              setEditor({ mode: "create" });
            }}
          >
            <span aria-hidden="true">＋</span> Nuevo entrenamiento
          </button>
        </header>
        {notice && (
          <p className="sport-notice" role="status">
            {notice}
          </p>
        )}
        {editor && (
          <GymForm
            key={editor.mode === "edit" ? editor.session.id : "new"}
            session={editor.mode === "edit" ? editor.session : undefined}
            onClose={close}
            onSaved={(changed) => {
              setEditor(null);
              setNotice(
                changed
                  ? editor.mode === "edit"
                    ? "Entrenamiento actualizado."
                    : "Entrenamiento creado."
                  : "No había cambios que guardar.",
              );
              if (changed) refresh();
              restoreFocus();
            }}
          />
        )}
        <section
          className="sport-panel"
          id="sessions"
          aria-labelledby="sessions-title"
          aria-busy={loading}
        >
          <div className="sport-panel-heading">
            <div>
              <h2 id="sessions-title">Tus sesiones de gimnasio</h2>
              <p className="sport-muted">
                Cada entrenamiento cuenta. Horarios de Madrid.
              </p>
            </div>
            <button
              className="sport-button sport-button-secondary sport-refresh"
              type="button"
              disabled={busy || loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              Actualizar
            </button>
          </div>
          {loading ? (
            <p className="sport-empty" role="status">
              Cargando entrenamientos…
            </p>
          ) : error ? (
            <div className="sport-empty">
              <p className="sport-error" role="alert">
                {error}
              </p>
              <button
                className="sport-button"
                type="button"
                disabled={busy}
                onClick={() => setRevision((value) => value + 1)}
              >
                Reintentar
              </button>
            </div>
          ) : sessions.length === 0 ? (
            <div className="sport-empty" role="status">
              <span className="sport-empty-mark" aria-hidden="true">
                ↗
              </span>
              <h3>
                {page
                  ? "No hay sesiones en esta página"
                  : "Tu próximo entrenamiento empieza aquí"}
              </h3>
              <p>
                {page
                  ? "Vuelve a la página anterior para consultar tus sesiones."
                  : "Añade una sesión con su modalidad, horario y duración."}
              </p>
              {!page && (
                <button
                  className="sport-button sport-button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={(event) => {
                    opener.current = event.currentTarget;
                    setNotice(null);
                    setEditor({ mode: "create" });
                  }}
                >
                  Crear mi primer entrenamiento
                </button>
              )}
            </div>
          ) : (
            <SessionsTable
              sessions={sessions}
              disabled={busy}
              onEdit={(session, button) => {
                opener.current = button;
                setNotice(null);
                setEditor({ mode: "edit", session });
              }}
              onAction={(session, kind, button) => {
                opener.current = button;
                setNotice(null);
                setAction({ session, kind });
              }}
            />
          )}
          {!loading && !error && (sessions.length > 0 || page > 0) && (
            <div
              className="sport-pagination"
              aria-label="Paginación de entrenamientos"
            >
              <button
                className="sport-button sport-button-secondary"
                type="button"
                disabled={busy || page === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                Anterior
              </button>
              <span>Página {page + 1}</span>
              <button
                className="sport-button sport-button-secondary"
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
        <SessionActionDialog
          key={`${action.kind}:${action.session.id}`}
          session={action.session}
          action={action.kind}
          onClose={close}
          onDone={() => {
            setAction(null);
            setNotice(
              action.kind === "retire"
                ? "Entrenamiento retirado."
                : "Entrenamiento cancelado.",
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
