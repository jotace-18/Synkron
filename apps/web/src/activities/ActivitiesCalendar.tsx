import { useEffect, useState } from 'react'
import {
  activityOccursOn,
  addCalendarDays,
  getMadridDate,
  getMonthDays,
  getMonthLabel,
} from './calendar-utils'
import { listActivitiesInPeriod, SessionExpiredError } from './activities-client'
import {
  formatActivityType, formatCalendarTitle, formatSchedule, formatSection, formatStatus,
} from './activity-format'
import type { Activity } from './activity.types'

const weekdays = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo',
]

const hourFormatter = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
})

function currentMonth(): Date {
  return new Date(`${getMadridDate().slice(0, 7)}-01T00:00:00Z`)
}

interface ActivitiesCalendarProps {
  onSessionExpired: () => void
  onSelect: (id: string) => void
}

interface CalendarResult {
  key: string
  activities: Activity[]
  error: string | null
}

export default function ActivitiesCalendar({
  onSessionExpired,
  onSelect,
}: ActivitiesCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(currentMonth)
  const [today, setToday] = useState(() => getMadridDate())
  const [result, setResult] = useState<CalendarResult | null>(null)
  const [retry, setRetry] = useState(0)

  const year = visibleMonth.getUTCFullYear()
  const month = visibleMonth.getUTCMonth()
  const days = getMonthDays(year, month)
  const label = getMonthLabel(year, month)
  const from = days[0].date
  const to = addCalendarDays(days[days.length - 1].date, 1)
  const requestKey = `${from}/${to}/${retry}`
  const loading = result?.key !== requestKey
  const activities = loading ? [] : result.activities
  const error = loading ? null : result.error

  useEffect(() => {
    const timer = window.setInterval(() => setToday(getMadridDate()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    listActivitiesInPeriod(from, to, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        setResult({ key: requestKey, activities: items, error: null })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof SessionExpiredError) {
          onSessionExpired()
          return
        }
        setResult({
          key: requestKey,
          activities: [],
          error: 'No se pudieron cargar las actividades del calendario.',
        })
      })

    return () => controller.abort()
  }, [from, to, requestKey, onSessionExpired])

  function changeMonth(direction: number) {
    setVisibleMonth((current) => new Date(Date.UTC(
      current.getUTCFullYear(), current.getUTCMonth() + direction, 1,
    )))
  }

  return (
    <section
      className="calendar-panel"
      aria-labelledby="calendar-title"
      aria-busy={loading}
    >
      <div className="calendar-toolbar">
        <h2 id="calendar-title" aria-live="polite">{label}</h2>
        <div className="calendar-navigation">
          <button
            className="secondary-button"
            type="button"
            aria-label="Mes anterior"
            onClick={() => changeMonth(-1)}
          >
            Anterior
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setVisibleMonth(currentMonth())}
          >
            Hoy
          </button>
          <button
            className="secondary-button"
            type="button"
            aria-label="Mes siguiente"
            onClick={() => changeMonth(1)}
          >
            Siguiente
          </button>
        </div>
      </div>

      <div className="calendar-feedback">
        {loading ? (
          <p role="status">Cargando actividades…</p>
        ) : error ? (
          <>
            <p className="form-error" role="alert">{error}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Reintentar
            </button>
          </>
        ) : (
          <p role="status">
            {activities.length === 0
              ? 'No hay actividades en este periodo.'
              : 'Horarios de Madrid · Verde: entregada · Ámbar: en curso · Rojo: pendiente'}
          </p>
        )}
      </div>

      <div className="calendar-scroll">
        <table className="calendar-table">
          <caption className="visually-hidden">
            Calendario de actividades: {label}
          </caption>
          <thead>
            <tr>
              {weekdays.map((day) => <th key={day} scope="col">{day}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, week) => (
              <tr key={week}>
                {days.slice(week * 7, week * 7 + 7).map((day) => (
                  <td
                    key={day.date}
                    className={[
                      !day.inCurrentMonth && 'calendar-outside',
                      day.date === today && 'calendar-today',
                    ].filter(Boolean).join(' ')}
                  >
                    <time
                      className="calendar-day-number"
                      dateTime={day.date}
                      aria-current={day.date === today ? 'date' : undefined}
                    >
                      {day.day}
                    </time>
                    <ul className="calendar-events">
                      {activities.filter((activity) => activityOccursOn(activity, day.date))
                        .map((activity) => (
                          <li key={activity.id}>
                            <button
                              type="button"
                              aria-haspopup="dialog"
                              className="calendar-event"
                              data-status={activity.status ?? 'unknown'}
                              data-mandatory={activity.details.mandatory === true}
                              onClick={() => onSelect(activity.id)}
                              title={`${formatCalendarTitle(activity)}. ${formatSchedule(activity.schedule)}. ${formatStatus(activity.status)}`}
                              aria-label={`Ver detalle: ${formatCalendarTitle(activity)}. ${formatStatus(activity.status)}`}
                            >
                            <span className="calendar-event-heading">
                              <span className="calendar-event-title">{activity.title}</span>
                              {typeof activity.details.course_abbreviation === 'string' && (
                                <span className="calendar-event-course">
                                  ({activity.details.course_abbreviation})
                                </span>
                              )}
                            </span>
                            <span className="calendar-event-meta">
                              <span className="calendar-event-kind">
                              {formatActivityType(activity.type)}
                              {activity.type === 'academic.assignment' && (
                                <> · {formatSection(activity.details.section)}</>
                              )}
                              {activity.schedule.at && (
                                <> · {hourFormatter.format(new Date(activity.schedule.at))}</>
                              )}
                              </span>
                              <span className="calendar-event-status">{formatStatus(activity.status)}</span>
                            </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
