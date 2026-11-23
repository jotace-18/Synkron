import { eventDateLabel, eventTimeLabel } from "./event-form";
import { STATUS_LABELS, type PersonalEvent } from "./event.types";
export default function EventsTable({
  events,
  disabled,
  onEdit,
  onAction,
}: {
  events: PersonalEvent[];
  disabled: boolean;
  onEdit: (event: PersonalEvent, button: HTMLButtonElement) => void;
  onAction: (
    event: PersonalEvent,
    action: "cancel" | "retire",
    button: HTMLButtonElement,
  ) => void;
}) {
  return (
    <div
      className="personal-table-wrap"
      role="region"
      aria-label="Compromisos personales"
      tabIndex={0}
    >
      <table className="personal-table">
        <caption className="visually-hidden">
          Compromisos personales. Horarios de Madrid.
        </caption>
        <thead>
          <tr>
            <th scope="col">Asunto</th>
            <th scope="col">Cuándo</th>
            <th scope="col">Personas</th>
            <th scope="col">Estado</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr
              key={event.id}
              data-cancelled={event.status === "cancelled" || undefined}
            >
              <td>
                <strong>{event.title}</strong>
                <span className="personal-cell-detail">
                  {event.started_at
                    ? event.duration_minutes === null
                      ? "Hora puntual"
                      : "Con duración"
                    : "Día sin hora"}
                </span>
              </td>
              <td>
                <time dateTime={event.on_date ?? event.started_at!}>
                  {eventDateLabel(event)}
                </time>
                <span className="personal-cell-detail">
                  {eventTimeLabel(event)}
                </span>
              </td>
              <td className="personal-people-cell">
                {event.people.length ? (
                  event.people.join(", ")
                ) : (
                  <span className="personal-muted">Sin personas indicadas</span>
                )}
              </td>
              <td>
                <span className="personal-badge" data-status={event.status}>
                  {STATUS_LABELS[event.status]}
                </span>
              </td>
              <td>
                <div className="personal-row-actions">
                  <button
                    type="button"
                    disabled={disabled}
                    className="personal-row-action"
                    aria-label={`Editar ${event.title}`}
                    onClick={(e) => onEdit(event, e.currentTarget)}
                  >
                    Editar
                  </button>
                  {event.status === "pending" && (
                    <button
                      type="button"
                      disabled={disabled}
                      className="personal-row-action"
                      aria-label={`Cancelar ${event.title}`}
                      onClick={(e) =>
                        onAction(event, "cancel", e.currentTarget)
                      }
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={disabled}
                    className="personal-row-action personal-row-action-danger"
                    aria-label={`Retirar ${event.title}`}
                    onClick={(e) => onAction(event, "retire", e.currentTarget)}
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
