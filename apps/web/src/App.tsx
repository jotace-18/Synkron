import './App.css'

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand-mark" aria-hidden="true">
          S
        </span>
        <span className="brand-name">Synkron</span>
      </header>

      <main className="welcome">
        <p className="eyebrow">Tu agenda personal</p>

        <h1>Tus actividades, en un solo lugar.</h1>

        <p className="welcome-description">
          Una vista conjunta de tus entregas, entrenamientos y planes.
        </p>

        <ul className="activity-categories" aria-label="Tipos de actividad">
          <li className="category-academic">Académico</li>
          <li className="category-sport">Deporte</li>
          <li className="category-social">Planes</li>
        </ul>

        <section className="access-panel" aria-labelledby="access-title">
          <h2 id="access-title">Accede a tu agenda</h2>
          <p>Inicia sesión para consultar tus actividades.</p>
        </section>
      </main>
    </div>
  )
}

export default App