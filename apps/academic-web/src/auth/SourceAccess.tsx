import {
  useEffect,
  useState,
  type ReactNode,
  type CSSProperties,
  type SubmitEvent,
} from "react";
import {
  authRequest,
  isSourceUser,
  sourceFetch,
  type SourceUser,
} from "./source-auth-client";
import "./source-access.css";
interface TokenView {
  id: string;
  name: string;
  suffix: string;
  created_at: string;
  revoked_at: string | null;
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";
export default function SourceAccess({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SourceUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showTokens, setShowTokens] = useState(false);
  const [tokens, setTokens] = useState<TokenView[]>([]);
  const [tokenName, setTokenName] = useState("Mi cuenta de Synkron");
  const [revealed, setRevealed] = useState("");
  useEffect(() => {
    let active = true;
    sourceFetch("/api/v1/auth/session")
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("No se pudo consultar la sesión.");
        const value: unknown = await response.json();
        if (!isSourceUser(value))
          throw new Error("Respuesta de sesión no válida.");
        return value;
      })
      .then((value) => {
        if (active) {
          setUser(value);
          setLoading(false);
          setError("");
        }
      })
      .catch((cause) => {
        if (active) {
          setLoading(false);
          setError(message(cause));
        }
      });
    const onExpired = () => {
      setUser(null);
      setTokens([]);
      setRevealed("");
      setShowTokens(false);
    };
    window.addEventListener("source-session-expired", onExpired);
    return () => {
      active = false;
      window.removeEventListener("source-session-expired", onExpired);
    };
  }, [retry]);
  async function signIn(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (registering && password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const value = await authRequest(
        registering ? "register" : "login",
        "POST",
        { email, password },
      );
      if (!isSourceUser(value))
        throw new Error("Respuesta de cuenta no válida.");
      setPassword("");
      setConfirmation("");
      if (registering) {
        setRegistering(false);
        setNotice("Cuenta creada. Ya puedes iniciar sesión.");
      } else setUser(value);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await authRequest("logout", "POST");
      setUser(null);
      setTokens([]);
      setRevealed("");
      setShowTokens(false);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function loadTokens() {
    const data = await authRequest("tokens");
    if (!Array.isArray(data))
      throw new Error("No se pudieron consultar las credenciales.");
    setTokens(data as TokenView[]);
  }
  async function toggleTokens() {
    setError("");
    setRevealed("");
    if (showTokens) {
      setShowTokens(false);
      return;
    }
    setBusy(true);
    try {
      await loadTokens();
      setShowTokens(true);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function createToken(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setRevealed("");
    try {
      const data = await authRequest("tokens", "POST", { name: tokenName });
      if (
        !data ||
        typeof data !== "object" ||
        !("token" in data) ||
        typeof data.token !== "string"
      )
        throw new Error(
          "No se pudo leer la credencial. Actualiza la lista y revoca la que no puedas identificar.",
        );
      setRevealed(data.token);
      await loadTokens();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (
      !window.confirm(
        "Synkron dejará de poder leer con esta credencial. Sus datos ya sincronizados se conservarán. ¿Revocar?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await authRequest(`tokens/${encodeURIComponent(id)}`, "DELETE");
      setRevealed("");
      await loadTokens();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  const style = { "--source-accent": "#6251a8" } as CSSProperties;
  if (loading)
    return (
      <div className="source-access" style={style}>
        <p role="status">Consultando tu sesión…</p>
      </div>
    );
  if (!user)
    return (
      <main className="source-access source-access-login" style={style}>
        <section className="source-access-card">
          <p className="source-access-eyebrow">Campus · TU CUENTA</p>
          <h1>{registering ? "Crea tu cuenta" : "Bienvenido a Campus"}</h1>
          <p>
            Tus actividades estarán separadas de las de otras personas. La
            cuenta de Synkron se conecta después con una credencial.
          </p>
          {error && (
            <p role="alert" className="source-access-error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <form onSubmit={signIn}>
            <label>
              Correo
              <input
                type="email"
                required
                maxLength={254}
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                required
                minLength={registering ? 8 : 1}
                maxLength={128}
                autoComplete={registering ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            {registering && (
              <label>
                Repite la contraseña
                <input
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}
            <button disabled={busy}>
              {busy ? "Un momento…" : registering ? "Crear cuenta" : "Entrar"}
            </button>
          </form>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setRegistering(!registering);
              setError("");
              setNotice("");
              setPassword("");
              setConfirmation("");
            }}
          >
            {registering ? "Ya tengo cuenta" : "Crear una cuenta"}
          </button>
          {error && (
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Volver a consultar la sesión
            </button>
          )}
        </section>
      </main>
    );
  return (
    <div className="source-access" style={style}>
      <header className="source-account-bar">
        <strong>Campus</strong>
        <span>{user.email}</span>
        <button onClick={() => void toggleTokens()} disabled={busy}>
          {showTokens ? "Cerrar credenciales" : "Acceso de Synkron"}
        </button>
        <button onClick={() => void logout()} disabled={busy}>
          Cerrar sesión
        </button>
      </header>
      {error && (
        <p role="alert" className="source-access-error">
          {error}
        </p>
      )}
      {showTokens && (
        <section
          className="source-access-card source-connection-card"
          aria-label="Credenciales para Synkron"
        >
          <h2>Acceso de Synkron a tu cuenta</h2>
          <p>
            Crea una credencial de solo lectura y cópiala en Conectar fuente
            dentro de tu cuenta de Synkron. En Campus, una credencial permite
            leer entregas y exámenes. Revocarla detiene las próximas lecturas,
            sin borrar lo ya sincronizado.
          </p>
          <form onSubmit={createToken}>
            <label>
              Nombre de la credencial
              <input
                required
                maxLength={100}
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                disabled={busy}
              />
            </label>
            <button disabled={busy}>Crear credencial</button>
          </form>
          {revealed && (
            <div className="source-token-reveal">
              <strong>Guárdala ahora: solo se muestra una vez.</strong>
              <input
                aria-label="Nueva credencial"
                readOnly
                value={revealed}
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={() => {
                  void navigator.clipboard
                    .writeText(revealed)
                    .catch(() =>
                      setError("Selecciona y copia la credencial manualmente."),
                    );
                }}
              >
                Copiar
              </button>
              <button onClick={() => setRevealed("")}>Ocultar</button>
            </div>
          )}
          <button
            disabled={busy}
            onClick={() => {
              setError("");
              void loadTokens().catch((cause) => setError(message(cause)));
            }}
          >
            Actualizar lista
          </button>
          <ul className="source-token-list">
            {tokens.map((token) => (
              <li key={token.id}>
                <strong>{token.name}</strong>
                <span>
                  Terminada en {token.suffix} ·{" "}
                  {token.revoked_at ? "Revocada" : "Activa"}
                </span>
                {!token.revoked_at && (
                  <button disabled={busy} onClick={() => void revoke(token.id)}>
                    Revocar
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!tokens.length && <p>No has creado credenciales.</p>}
        </section>
      )}
      <div key={user.id}>{children}</div>
    </div>
  );
}
