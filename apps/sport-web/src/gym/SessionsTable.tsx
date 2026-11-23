import { dateLabel, timeLabel, durationLabel, madridFields } from "./gym-time";
import { STATUS_LABELS, type GymSession } from "./gym.types";

export default function SessionsTable({
  sessions,
  disabled,
  onEdit,
  onAction,
}: {
  sessions: GymSession[];
  disabled: boolean;
  onEdit: (session: GymSession, button: HTMLButtonElement) => void;
  onAction: (
    session: GymSession,
    action: "cancel" | "retire",
    button: HTMLButtonElement,
  ) => void;
}) {
  return (
    <div
      className="sport-table-wrap"
      role="region"
      aria-label="Entrenamientos de gimnasio"
      tabIndex={0}
    >
      <table className="sport-table">
        <caption className="visually-hidden">
          Sesiones de gimnasio. Todos los horarios se muestran en Madrid.
        </caption>
        <thead>
          <tr>
            <th scope="col">Entrenamiento</th>
            <th scope="col">Fecha y hora</th>
            <th scope="col">Duración</th>
            <th scope="col">Compañía</th>
            <th scope="col">Estado</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.id}
              data-cancelled={session.status === "cancelled" || undefined}
            >
              <td>
                <strong>{session.title}</strong>
                <span className="sport-cell-detail">Gimnasio</span>
              </td>
              <td>
                <time dateTime={session.started_at}>
                  {dateLabel(session.started_at)}
                </time>
                <span className="sport-cell-detail">
                  {timeLabel(session.started_at)} – {timeLabel(session.end_at)}
                  {madridFields(session.started_at).date !==
                  madridFields(session.end_at).date
                    ? ` · ${dateLabel(session.end_at)}`
                    : ""}
                </span>
              </td>
              <td>{durationLabel(session.duration_minutes)}</td>
              <td>{session.accompanied ? "Acompañado" : "Solo"}</td>
              <td>
                <span className="sport-badge" data-status={session.status}>
                  {STATUS_LABELS[session.status]}
                </span>
              </td>
              <td>
                <div className="sport-row-actions">
                  <button
                    type="button"
                    disabled={disabled}
                    className="sport-row-action"
                    aria-label={`Editar ${session.title} del ${dateLabel(session.started_at)}`}
                    onClick={(event) => onEdit(session, event.currentTarget)}
                  >
                    Editar
                  </button>
                  {session.status === "scheduled" && (
                    <button
                      type="button"
                      disabled={disabled}
                      className="sport-row-action"
                      aria-label={`Cancelar ${session.title} del ${dateLabel(session.started_at)}`}
                      onClick={(event) =>
                        onAction(session, "cancel", event.currentTarget)
                      }
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={disabled}
                    className="sport-row-action sport-row-action-danger"
                    aria-label={`Retirar ${session.title} del ${dateLabel(session.started_at)}`}
                    onClick={(event) =>
                      onAction(session, "retire", event.currentTarget)
                    }
                  >
                    Retirar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
