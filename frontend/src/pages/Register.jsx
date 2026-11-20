import { useState } from 'react'

const inputClass = 'w-full bg-background border border-border text-foreground font-mono text-sm px-3 py-2.5 placeholder:text-muted-foreground focus:outline-none focus:border-primary'

export default function Register({ navigate, onRegister, mode }) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const cleanName = nombre.trim()
    if (cleanName.length < 2 || cleanName.length > 100) {
      setError('El nombre debe tener entre 2 y 100 caracteres.')
      return
    }
    if (password.length < 12 || password.length > 128) {
      setError('La contraseña debe tener entre 12 y 128 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true)
    try { await onRegister(cleanName, email.trim().toLowerCase(), password) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return <main className="min-h-screen bg-background bg-grid flex items-center justify-center px-4 pt-24 pb-12">
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <button onClick={() => navigate({ view: 'home' })} className="font-heading text-2xl font-bold uppercase tracking-widest text-primary mb-1">SYNAPSE-MILITARIA</button>
        <h1 className="font-mono text-xs text-muted-foreground tracking-widest uppercase">Crear cuenta</h1>
      </div>
      {mode === 'demo' ? <div className="bg-card border border-border p-6 space-y-4">
        <p className="font-mono text-xs text-secondary-foreground leading-relaxed">Para crear una cuenta se necesita conexión con el servidor.</p>
      </div> : <form onSubmit={handleSubmit} className="bg-card border border-border p-6 space-y-4">
        <label className="block">
          <span className="font-mono text-xs text-muted-foreground tracking-widest uppercase block mb-1.5">Nombre</span>
          <input type="text" value={nombre} onChange={event => setNombre(event.target.value)} autoComplete="name" className={inputClass} required maxLength={100} />
        </label>
        <label className="block">
          <span className="font-mono text-xs text-muted-foreground tracking-widest uppercase block mb-1.5">Correo electrónico</span>
          <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" className={inputClass} required maxLength={254} />
        </label>
        <label className="block">
          <span className="font-mono text-xs text-muted-foreground tracking-widest uppercase block mb-1.5">Contraseña</span>
          <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" className={inputClass} required maxLength={128} />
          <span className="block mt-1.5 font-mono text-xs text-muted-foreground leading-relaxed">Mínimo 12 caracteres y que no contenga la parte del correo antes de la @.</span>
        </label>
        <label className="block">
          <span className="font-mono text-xs text-muted-foreground tracking-widest uppercase block mb-1.5">Confirmar contraseña</span>
          <input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" className={inputClass} required maxLength={128} />
        </label>
        {error && <p role="alert" className="border border-accent bg-accent/15 text-accent-foreground font-mono text-xs px-3 py-3">{error}</p>}
        <button type="submit" disabled={loading || mode === 'loading'} className="w-full bg-primary text-primary-foreground font-mono text-xs font-semibold py-3 uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50">{loading ? 'Creando cuenta…' : mode === 'loading' ? 'Comprobando conexión…' : 'Crear cuenta'}</button>
      </form>}
      <div className="text-center mt-5 space-y-3">
        <div><button type="button" onClick={() => navigate({ view: 'login' })} className="font-mono text-xs text-muted-foreground hover:text-primary">¿Ya tienes cuenta? Iniciar sesión</button></div>
        <div><button type="button" onClick={() => navigate({ view: 'home' })} className="font-mono text-xs text-muted-foreground hover:text-primary uppercase tracking-widest">← Volver al inicio</button></div>
      </div>
    </div>
  </main>
}
