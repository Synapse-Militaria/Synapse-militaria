import { useState } from 'react'
import { Modal } from '../components/Nav'
import { request } from '../services/api'

const inputClass = 'w-full bg-background border border-border text-foreground font-mono text-sm px-3 py-2.5 placeholder:text-muted-foreground focus:outline-none focus:border-primary'

export default function AdminLogin({ navigate, onLogin, mode, message }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recovering, setRecovering] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try { await onLogin(email.trim().toLowerCase(), password) }
    catch (error) { setError(error.message) }
    finally { setLoading(false) }
  }

  return <main className="min-h-screen bg-background bg-grid flex items-center justify-center px-4 pt-24 pb-12">
    <div className="w-full max-w-sm">
      <div className="border border-accent bg-accent/15 text-accent-foreground font-mono text-xs text-center py-3 mb-6 tracking-widest uppercase">Acceso restringido — Solo personal autorizado</div>
      <div className="text-center mb-8">
        <button onClick={() => navigate({ view: 'home' })} className="font-heading text-2xl font-bold uppercase tracking-widest text-primary mb-1">SYNAPSE-MILITARIA</button>
        <h1 className="font-mono text-xs text-muted-foreground tracking-widest uppercase">Panel de administración</h1>
      </div>
      {message && <p role="status" className="border border-primary/40 text-primary p-3 mb-4 text-sm">{message}</p>}
      <form onSubmit={handleSubmit} className="bg-card border border-border p-6 space-y-4">
        <label className="block">
          <span className="font-mono text-xs text-muted-foreground tracking-widest uppercase block mb-1.5">Correo electrónico</span>
          <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" className={inputClass} required maxLength={254} />
        </label>
        <label className="block">
          <span className="font-mono text-xs text-muted-foreground tracking-widest uppercase block mb-1.5">Contraseña</span>
          <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" className={inputClass} required maxLength={128} />
        </label>
        {error && <p role="alert" className="border border-accent bg-accent/15 text-accent-foreground font-mono text-xs px-3 py-3">{error}</p>}
        <button type="submit" disabled={loading || mode === 'loading'} className="w-full bg-primary text-primary-foreground font-mono text-xs font-semibold py-3 uppercase tracking-widest hover:bg-primary/90">{loading ? 'Verificando…' : mode === 'loading' ? 'Comprobando conexión…' : 'Acceder al sistema'}</button>
        <div className="text-center pt-1"><button type="button" onClick={() => setRecovering(true)} className="font-mono text-xs text-muted-foreground hover:text-primary">¿Olvidó su contraseña?</button></div>
      </form>
      {mode === 'demo' && <p className="mt-4 font-mono text-xs text-muted-foreground leading-relaxed text-center">Modo de presentación. No se pudo conectar con el servidor. Los cambios quedan en memoria hasta recargar la página.</p>}
      <div className="text-center mt-5"><button onClick={() => navigate({ view: 'home' })} className="font-mono text-xs text-muted-foreground hover:text-primary uppercase tracking-widest">← Volver al inicio</button></div>
    </div>
    {recovering && <RecoveryModal mode={mode} initialEmail={email} onClose={() => setRecovering(false)} />}
  </main>
}

function RecoveryModal({ mode, initialEmail, onClose }) {
  const [email, setEmail] = useState(initialEmail)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'online') await request('/auth/recuperar', { method: 'POST', body: { email: email.trim().toLowerCase() } })
      setSent(true)
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <Modal title="Recuperación de contraseña" onClose={onClose}>
    {sent ? <div role="status" className="space-y-4">
      <p className="border border-green-800 bg-green-950 p-4 text-green-400">Simulación de recuperación completada.</p>
      <p className="text-secondary-foreground">Se mostró el flujo de recuperación para {email}. No se guardó una solicitud ni se generó o envió un enlace. La contraseña no cambió.</p>
      <button onClick={onClose} className="bg-primary text-primary-foreground px-4 py-2 font-mono text-xs uppercase">Volver al ingreso</button>
    </div> : <form onSubmit={submit} className="space-y-5">
      <p className="text-secondary-foreground">Ingresa tu correo para ver la simulación de recuperación. Este formulario no envía correos ni modifica contraseñas.</p>
      <label className="block"><span className="block mb-2 font-mono text-xs text-muted-foreground">Correo de recuperación</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required maxLength={254} className={inputClass} /></label>
      {error && <p role="alert" className="text-accent-foreground">{error}</p>}
      <button disabled={busy} className="bg-primary text-primary-foreground px-4 py-3 font-mono text-xs uppercase">{busy ? 'Procesando…' : 'Simular recuperación'}</button>
    </form>}
  </Modal>
}
