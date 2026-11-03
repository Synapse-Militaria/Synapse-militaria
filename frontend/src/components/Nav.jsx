import { useEffect, useId, useRef, useState } from 'react';
export default function Nav({
  page,
  navigate,
  isAdmin,
  onLogout
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <nav aria-label="Navegación principal" className="no-print fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <button onClick={() => navigate({
        view: 'home'
      })} className="font-heading whitespace-nowrap shrink-0 text-sm sm:text-lg lg:text-xl font-semibold tracking-wide lg:tracking-widest text-primary uppercase">
          SYNAPSE<span className="text-muted-foreground mx-0.5">—</span>MILITARIA
        </button>
        <div className="hidden md:flex items-center gap-5">
          <button onClick={() => navigate({
          view: 'encyclopedia'
        })} className={`font-mono text-xs tracking-wider uppercase transition-colors ${page.view === 'encyclopedia' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            Enciclopedia
          </button>
          <button onClick={() => navigate({ view: 'queries' })} className={`font-mono text-xs tracking-wider uppercase transition-colors ${page.view === 'queries' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>Consultas</button>
          {isAdmin ? <>
              <button onClick={() => navigate({
            view: 'admin'
          })} className={`font-mono text-xs tracking-wider uppercase transition-colors ${page.view === 'admin' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                Panel Admin
              </button>
              <button onClick={onLogout} className="font-mono text-xs text-accent-foreground hover:text-red-400 transition-colors uppercase tracking-wider">
                Cerrar sesión
              </button>
            </> : <button onClick={() => navigate({
          view: 'admin-login'
        })} className="border border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground font-mono text-xs px-3 py-1.5 transition-colors uppercase tracking-wider">
              Admin
            </button>}
        </div>
        <button className="md:hidden shrink-0 text-muted-foreground p-2" onClick={() => setMobileOpen(v => !v)} aria-label="Menú" aria-expanded={mobileOpen} aria-controls="menu-movil">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileOpen ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>
      {mobileOpen && <div id="menu-movil" className="md:hidden bg-card border-b border-border px-6 py-4 flex flex-col gap-4">
          <button onClick={() => {
        navigate({
          view: 'encyclopedia'
        });
        setMobileOpen(false);
      }} className="font-mono text-xs tracking-wider text-left text-foreground uppercase">
            Enciclopedia
          </button>
          <button onClick={() => { navigate({ view: 'queries' }); setMobileOpen(false); }} className="font-mono text-xs tracking-wider text-left text-foreground uppercase">Consultas</button>
          {isAdmin ? <>
              <button onClick={() => {
          navigate({
            view: 'admin'
          });
          setMobileOpen(false);
        }} className="font-mono text-xs tracking-wider text-left text-foreground uppercase">
                Panel Admin
              </button>
              <button onClick={() => {
          onLogout();
          setMobileOpen(false);
        }} className="font-mono text-xs text-accent-foreground text-left uppercase">
                Cerrar sesión
              </button>
            </> : <button onClick={() => {
        navigate({
          view: 'admin-login'
        });
        setMobileOpen(false);
      }} className="font-mono text-xs text-primary text-left uppercase">
              Acceso Admin
            </button>}
        </div>}
    </nav>;
}

export function Modal({ title, onClose, children }) {
  const dialog = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const element = dialog.current
    const previousOverflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      element.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === dialog.current) onClose() }}
      className="m-auto max-h-[90dvh] max-w-3xl overflow-y-auto border border-border bg-card p-0 text-foreground backdrop:bg-background/85 backdrop:backdrop-blur-sm"
      style={{ width: 'calc(100% - 2rem)' }}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-card px-5 py-4 sm:px-6">
        <h2 id={titleId} className="font-heading text-lg font-semibold uppercase tracking-wide">{title}</h2>
        <button type="button" aria-label="Cerrar ventana" onClick={onClose} className="px-2 text-2xl leading-none text-muted-foreground hover:text-foreground">×</button>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </dialog>
  )
}

export function WeaponImage({ src, alt, ...props }) {
  const [failedSrc, setFailedSrc] = useState(null)
  return failedSrc === src || !src ? <div {...props} role="img" aria-label={`${alt}. Imagen no disponible`} style={{ display: 'grid', placeItems: 'center', minHeight: '120px' }}><span className="px-4 text-center font-mono text-xs text-muted-foreground">{alt}<br />Imagen no disponible</span></div>
    : <img src={src} alt={alt} onError={() => setFailedSrc(src)} loading="lazy" {...props} />
}
