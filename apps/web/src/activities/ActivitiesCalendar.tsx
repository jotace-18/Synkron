import { Fragment, useEffect, useRef, useState } from 'react'
import {
  activityOccursOn,
  addCalendarDays,
  getMadridDate,
  getDayLabel,
  getMonthDays,
  getMonthLabel,
  getWeekDays,
  getWeekLabel,
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

interface ActivitiesCalendarProps {
  onSessionExpired: () => void
  onSelect: (id: string) => void
  refreshVersion?: number
}

interface CalendarResult {
  key: string
  activities: Activity[]
  error: string | null
}

export default function ActivitiesCalendar({
  onSessionExpired,
  onSelect,
  refreshVersion = 0,
}: ActivitiesCalendarProps) {
  const [referenceDate, setReferenceDate] = useState(() => getMadridDate())
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day'>('month')
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [today, setToday] = useState(() => getMadridDate())
  const [result, setResult] = useState<CalendarResult | null>(null)
  const [retry, setRetry] = useState(0)

  const reference = new Date(`${referenceDate}T00:00:00Z`)
  const year = reference.getUTCFullYear()
  const month = reference.getUTCMonth()
  const days = calendarView === 'month'
    ? getMonthDays(year, month)
    : calendarView === 'week'
      ? getWeekDays(referenceDate)
      : [{ date: referenceDate, day: reference.getUTCDate(), inCurrentMonth: true }]
  const label = calendarView === 'month'
    ? getMonthLabel(year, month)
    : calendarView === 'week'
      ? getWeekLabel(referenceDate)
      : getDayLabel(referenceDate)
  const periodName = { month: 'Mes', week: 'Semana', day: 'Día' }[calendarView]
  const viewName = { month: 'mensual', week: 'semanal', day: 'diario' }[calendarView]
  const columns = calendarView === 'day'
    ? [weekdays[(reference.getUTCDay() + 6) % 7]]
    : weekdays
  const from = days[0].date
  const to = addCalendarDays(days[days.length - 1].date, 1)
  const requestKey = `${from}/${to}/${retry}/${refreshVersion}`
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

  function changePeriod(direction: number) {
    setReferenceDate((current) => {
      if (calendarView === 'day') {
        return addCalendarDays(current, direction)
      }
      if (calendarView === 'week') {
        return addCalendarDays(current, direction * 7)
      }

      const date = new Date(`${current}T00:00:00Z`)
      const targetMonth = date.getUTCMonth() + direction
      const lastDay = new Date(
        Date.UTC(date.getUTCFullYear(), targetMonth + 1, 0),
      ).getUTCDate()

      return new Date(Date.UTC(
        date.getUTCFullYear(),
        targetMonth,
        Math.min(date.getUTCDate(), lastDay),
      )).toISOString().slice(0, 10)
    })
  }

  function openDay(date: string) {
    setReferenceDate(date)
    setCalendarView('day')
    window.requestAnimationFrame(() => titleRef.current?.focus())
  }

  return (
    <section
      className="calendar-panel"
      aria-labelledby="calendar-title"
      aria-busy={loading}
    >
      <div className="calendar-toolbar">
        <h2 ref={titleRef} id="calendar-title" tabIndex={-1} aria-live="polite">{label}</h2>
        <div className="view-switch" role="group" aria-label="Periodo del calendario">
          <button
            type="button"
            aria-pressed={calendarView === 'month'}
            onClick={() => setCalendarView('month')}
          >
            Mes
          </button>
          <button
            type="button"
            aria-pressed={calendarView === 'week'}
            onClick={() => setCalendarView('week')}
          >
            Semana
          </button>
          <button
            type="button"
            aria-pressed={calendarView === 'day'}
            onClick={() => setCalendarView('day')}
          >
            Día
          </button>
        </div>
        <div className="calendar-navigation">
          <button
            className="secondary-button"
            type="button"
            aria-label={`${periodName} anterior`}
            onClick={() => changePeriod(-1)}
          >
            Anterior
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setReferenceDate(getMadridDate())}
          >
            Hoy
          </button>
          <button
            className="secondary-button"
            type="button"
            aria-label={`${periodName} siguiente`}
            onClick={() => changePeriod(1)}
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
              ? calendarView === 'day' ? 'No hay actividades para este día.' : 'No hay actividades en este periodo.'
              : 'Horarios de Madrid · Verde: entregada/realizado · Ámbar: en curso · Rojo: pendiente · Violeta: examen programado · Naranja: gimnasio programado · Gris: cancelado'}
          </p>
        )}
      </div>

      <div className="calendar-scroll">
        <table className={`calendar-table calendar-${calendarView}`}>
          <caption className="visually-hidden">
            Calendario {viewName}: {label}
          </caption>
          <thead>
            <tr>
              {columns.map((day) => <th key={day} scope="col">{day}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: calendarView === 'month' ? 6 : 1 }, (_, week) => (
              <tr key={week}>
                {days.slice(week * 7, week * 7 + 7).map((day) => (
                  <td
                    key={day.date}
                    className={[
                      calendarView === 'month' && !day.inCurrentMonth && 'calendar-outside',
                      day.date === today && 'calendar-today',
                    ].filter(Boolean).join(' ')}
                  >
                    <button
                      className="calendar-day-button"
                      type="button"
                      aria-label={`Ver ${getDayLabel(day.date)}`}
                      onClick={() => openDay(day.date)}
                    >
                      <time
                        className="calendar-day-number"
                        dateTime={day.date}
                        aria-current={day.date === today ? 'date' : undefined}
                      >
                        {day.day}
                      </time>
                    </button>
                    <ul className="calendar-events">
                      {activities.filter((activity) => activityOccursOn(activity, day.date))
                        .sort((left, right) =>
                          Number(left.schedule.kind !== 'date') - Number(right.schedule.kind !== 'date'))
                        .map((activity, index, items) => (
                          <Fragment key={activity.id}>
                          {calendarView !== 'month' && (
                            index === 0 ||
                            (items[index - 1].schedule.kind === 'date') !== (activity.schedule.kind === 'date')
                          ) && (
                            <li className="calendar-section-label">
                              {activity.schedule.kind === 'date' ? 'Sin hora' : 'Con hora'}
                            </li>
                          )}
                          <li>
                            <button
                              type="button"
                              aria-haspopup="dialog"
                              className="calendar-event"
                              data-type={activity.type}
                              data-status={activity.status ?? 'unknown'}
                              data-mandatory={activity.details.mandatory === true}
                              onClick={() => onSelect(activity.id)}
                              title={`${formatCalendarTitle(activity)}. ${activity.type === 'academic.assignment' ? formatSection(activity.details.section) + '. ' : ''}${formatSchedule(activity.schedule)}. ${formatStatus(activity.status)}`}
                              aria-label={`Ver detalle: ${formatCalendarTitle(activity)}. ${activity.type === 'academic.assignment' ? formatSection(activity.details.section) + '. ' : ''}${formatSchedule(activity.schedule)}. ${formatStatus(activity.status)}`}
                            >
                            <span className="calendar-event-heading">
                              <span className="calendar-event-title">
                                {activity.title}
                              </span>
                              {typeof activity.details.course_abbreviation === 'string' && (
                                <span className="calendar-event-course">
                                  ({activity.details.course_abbreviation})
                                </span>
                              )}
                            </span>
                            {activity.schedule.at && (
                              <span className="calendar-event-time" aria-hidden="true">
                                {hourFormatter.format(new Date(activity.schedule.at))}
                              </span>
                            )}
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
                          </Fragment>
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
