import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { SessionExpiredError } from '../activities/activities-client'
import { connectSource } from './sync-client'
import { SOURCE_PRESETS, type SourcePreset } from './source-presets'

export default function ConnectSourceForm({
  onConnected,
  onSessionExpired,
}: {
  onConnected: () => void
  onSessionExpired: () => void
}) {
  const [preset, setPreset] = useState<SourcePreset>('personal')
  const [name, setName] = useState<string>(SOURCE_PRESETS.personal.name)
  const [url, setUrl] = useState<string>(SOURCE_PRESETS.personal.url)
  const [connector, setConnector] = useState('standard.activities')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (controller.current) return
    const request = new AbortController()
    controller.current = request
    setSaving(true)
    setMessage(null)
    try {
      await connectSource(
        { name: name.trim(), base_url: url.trim(), connector, token },
        request.signal,
      )
      if (request.signal.aborted) return
      setToken('')
      setMessage('Fuente conectada. Ya puedes sincronizarla.')
      onConnected()
    } catch (cause) {
      if (request.signal.aborted) return
      if (cause instanceof SessionExpiredError) return onSessionExpired()
      setMessage(
        cause instanceof Error &&
          !(cause instanceof TypeError) &&
          !(cause instanceof DOMException)
          ? cause.message
          : 'No se pudo confirmar la conexión. Puedes reintentar sin duplicarla.',
      )
    } finally {
      controller.current = null
      if (!request.signal.aborted) setSaving(false)
    }
  }
  return (
    <details className="source-connection">
      <summary>Conectar una fuente externa</summary>
      <p>
        {SOURCE_PRESETS[preset].hint} La credencial se guarda cifrada y
        vinculada a tu cuenta de Synkron.
      </p>
      <form className="source-form" onSubmit={save}>
        <label>
          Fuente
          <select
            value={preset}
            disabled={saving}
            onChange={(event) => {
              const value = event.target.value as SourcePreset
              const source = SOURCE_PRESETS[value]
              setPreset(value)
              setName(source.name)
              setUrl(source.url)
              setConnector(source.connector)
              setToken('')
              setMessage(null)
            }}
          >
            {Object.entries(SOURCE_PRESETS).map(([value, source]) => (
              <option key={value} value={value}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nombre
          <input
            required
            maxLength={100}
            value={name}
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Formato de la fuente
          <select
            value={connector}
            disabled={saving}
            onChange={(e) => setConnector(e.target.value)}
          >
            <option value="standard.activities">
              Actividades estándar (Otros, gimnasio y otras fuentes)
            </option>
            <option value="academic.assignments">Entregas académicas</option>
            <option value="academic.exams">Exámenes académicos</option>
          </select>
        </label>
        <label>
          URL de exportación
          <input
            required
            type="url"
            maxLength={2048}
            value={url}
            disabled={saving}
            onChange={(e) => {
              setUrl(e.target.value)
              setPreset('custom')
              setToken('')
              setMessage(null)
            }}
          />
        </label>
        <label>
          Credencial Bearer
          <input
            required
            type="password"
            maxLength={4096}
            autoComplete="off"
            value={token}
            disabled={saving}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <button className="secondary-button" disabled={saving}>
          {saving ? 'Conectando…' : 'Conectar fuente'}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  )
}
