import { useEffect, useState } from 'react'
import { Modal, WeaponImage } from '../components/Nav'
import { request, downloadCsv } from '../services/api'
import { normalizeConflict } from '../data/mockData'

export default function WeaponDetail({ id, navigate, weapons, countries, conflicts, mode }) {
  const weapon = weapons.find(w => w.id === id)
  const [remoteEvents, setRemoteEvents] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)

  useEffect(() => {
    if (mode !== 'online') return
    let active = true
    request(`/armas/${encodeURIComponent(id)}/conflictos`).then(events => {
      if (active && Array.isArray(events)) setRemoteEvents(events)
    }).catch(() => {}) // La ficha conserva los eventos embebidos si esta consulta falla.
    return () => { active = false }
  }, [id, mode])

  if (!weapon) return <main className="pt-32 px-6 text-center">
    <h1 className="font-heading text-3xl uppercase mb-4">Armamento no encontrado</h1>
    <p className="text-secondary-foreground mb-6">La ficha no existe o no está disponible en el catálogo.</p>
    <button onClick={() => navigate({ view: 'encyclopedia' })} className="font-mono text-sm text-primary underline">Volver a la enciclopedia</button>
  </main>

  const country = countries.find(c => c.id === weapon.countryId)
  const events = (remoteEvents || weapon.eventos).map(event => ({
    ...weapon.eventos.find(e => e.id_evento === event.id_evento), ...event,
  }))
  const timeline = events.map(event => ({ ...event, conflict: conflicts.find(c => c._id === event.id_evento) || normalizeConflict({ ...event, _id: event.id_evento }) }))
    .sort((a, b) => (a.conflict.startYear || 0) - (b.conflict.startYear || 0))

  return <main className="print-sheet min-h-screen bg-background pt-14">
    <header className="print-header relative min-h-72 sm:min-h-80 overflow-hidden bg-muted flex items-end">
      <WeaponImage src={weapon.images[0]} alt={weapon.name} className="absolute inset-0 w-full h-full object-cover grayscale brightness-40" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-transparent" />
      <div className="print-title relative w-full max-w-7xl mx-auto px-6 pb-8 pt-6">
        <nav aria-label="Ruta de la ficha" className="no-print font-mono text-xs text-muted-foreground mb-5 flex flex-wrap items-center gap-2">
          <button onClick={() => navigate({ view: 'home' })} className="hover:text-primary">INICIO</button><span>›</span>
          <button onClick={() => navigate({ view: 'encyclopedia' })} className="hover:text-primary">ENCICLOPEDIA</button><span>›</span><span>{weapon.name}</span>
        </nav>
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="bg-accent text-accent-foreground font-mono text-xs px-2 py-1 uppercase tracking-wide">{weapon.tipo_arma}</span>
              <span className="font-mono text-xs text-primary break-words">{weapon.designation}</span>
            </div>
            <h1 className="font-heading text-4xl sm:text-6xl font-bold uppercase tracking-tight leading-none">{weapon.name}</h1>
          </div>
          <div className="sm:text-right shrink-0">
            <div className="font-mono text-4xl sm:text-5xl font-bold text-primary tabular-nums">{weapon.yearIntroduced}</div>
            <p className="font-mono text-xs text-muted-foreground mt-2">{country?.flag} {country?.name || weapon.pais_origen.nombre}</p>
          </div>
        </div>
      </div>
    </header>

    <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
      <div className="lg:col-span-2 space-y-10 min-w-0">
        <section><SectionTitle>Descripción histórica</SectionTitle><p className="text-foreground/90 leading-relaxed whitespace-pre-line">{weapon.longDescription || 'No hay una descripción registrada.'}</p>
          <dl className="mt-5 grid sm:grid-cols-2 gap-3 font-mono text-xs text-secondary-foreground"><div><dt className="text-muted-foreground">Fabricante</dt><dd className="mt-1">{weapon.manufacturer || 'No registrado'}</dd></div><div><dt className="text-muted-foreground">Periodo de servicio</dt><dd className="mt-1">{weapon.yearsInService || 'No registrado'}</dd></div></dl>
        </section>
        <section><SectionTitle>Especificaciones técnicas</SectionTitle>
          {Object.keys(weapon.specs).length ? <dl className="border border-border">
            {Object.entries(weapon.specs).map(([key, value], index) => <div key={key} className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:grid-cols-[180px_1fr] px-4 py-3 gap-4 ${index % 2 === 0 ? 'bg-card' : 'bg-muted/30'}`}>
              <dt className="font-mono text-xs uppercase tracking-wide text-muted-foreground leading-5">{key}</dt><dd className="font-mono text-sm break-words">{value}</dd>
            </div>)}
          </dl> : <p className="text-secondary-foreground">No hay especificaciones registradas.</p>}
          <p className="mt-3 text-xs text-muted-foreground">Las medidas corresponden a la versión descrita y pueden variar según el fabricante. En vehículos, la capacidad indica la munición transportada.</p>
        </section>
        <section><SectionTitle>Galería multimedia</SectionTitle>
          {weapon.images.length ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {weapon.images.map((url, index) => <button key={`${url}-${index}`} onClick={() => setSelectedImage(index)} className="group aspect-[4/3] overflow-hidden bg-muted border border-border hover:border-primary" aria-label={`Ampliar imagen ${index + 1} de ${weapon.name}`}>
              <WeaponImage src={url} alt={weapon.multimedia.find(m => m.url_archivo === url)?.descripcion_imagen || `${weapon.name}, imagen ${index + 1}`} className="w-full h-full object-contain grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-500" />
            </button>)}
          </div> : <p className="text-secondary-foreground">No hay imágenes registradas.</p>}
          <p className="mt-3 text-xs text-muted-foreground">Imágenes de archivo. Consulta las fuentes y los créditos de cada ficha.</p>
        </section>
        <section><SectionTitle>Fuentes y referencias</SectionTitle>
          <ol className="space-y-4">
            {weapon.references.map((ref, index) => <li key={ref.id} className="flex items-start gap-3">
              <span className="font-mono text-primary text-xs shrink-0 mt-1">[{String(index + 1).padStart(2, '0')}]</span>
              <div className="min-w-0"><p className="text-sm leading-relaxed">{ref.title}{ref.year ? ` (${ref.year})` : ''}</p>
                {/^https?:\/\//.test(ref.url) && <a href={ref.url} target="_blank" rel="noreferrer" className="no-print inline-block mt-1 text-primary text-xs underline">Consultar fuente ↗</a>}
              </div>
            </li>)}
          </ol>
          {!weapon.references.length && <p className="text-secondary-foreground">No hay referencias registradas.</p>}
        </section>
      </div>

      <aside className="min-w-0"><SectionTitle>Trazabilidad histórica / Línea de tiempo</SectionTitle>
        {!timeline.length ? <p className="font-mono text-xs text-muted-foreground">No hay conflictos registrados.</p> : <>
          <div className="flex items-center justify-between font-mono text-xs text-muted-foreground mb-5 pb-3 border-b border-border"><span>{timeline[0].conflict.startYear}</span><span className="text-primary">{timeline.length} conflictos</span><span>{timeline.at(-1).conflict.endYear || 'presente'}</span></div>
          <ol className="border-l border-border ml-3 pl-6 space-y-4">
            {timeline.map((event, index) => <li key={event.id_evento || index} className="relative bg-card border border-border p-4">
              <span aria-hidden="true" className="absolute -left-[30px] top-4 w-2 h-2 bg-primary" />
              <p className="font-mono text-xs text-primary mb-2">{event.conflict.startYear}–{event.conflict.endYear || 'presente'}</p>
              <button onClick={() => navigate({ view: 'encyclopedia', conflict: event.id_evento })} className="font-heading text-base font-semibold uppercase tracking-wide text-left hover:text-primary">{event.conflict.name}</button>
              <p className="font-mono text-xs text-muted-foreground my-2">{event.conflict.theater}</p>
              {event.rol && <p className="text-xs text-secondary-foreground leading-relaxed mb-3"><span className="text-muted-foreground">Rol: </span>{event.rol}</p>}
              <div className="flex flex-wrap gap-1">{(event.facciones_usuarias || []).map(faction => <span key={faction} className="bg-secondary text-secondary-foreground font-mono text-xs px-2 py-1">{faction}</span>)}</div>
              {event.nota_historica && <p className="text-xs text-muted-foreground italic leading-relaxed mt-3">{event.nota_historica}</p>}
            </li>)}
          </ol>
        </>}
        <section className="no-print mt-8 border border-border bg-card p-4">
          <h2 className="font-heading text-lg uppercase mb-4">Exportar información (PDF / CSV)</h2>
          <div className="space-y-3"><button onClick={() => window.print()} className="w-full bg-primary text-primary-foreground font-mono text-xs py-3 uppercase tracking-wide">Descargar PDF</button><button onClick={() => downloadCsv(weapon)} className="w-full border border-primary text-primary font-mono text-xs py-3 uppercase tracking-wide hover:bg-primary hover:text-primary-foreground">Descargar CSV</button></div>
          <p className="mt-3 text-xs text-muted-foreground">Para el PDF, selecciona “Guardar como PDF” en la ventana de impresión.</p>
        </section>
        <button onClick={() => navigate({ view: 'encyclopedia' })} className="no-print mt-3 w-full border border-border text-muted-foreground hover:text-foreground font-mono text-xs py-3 uppercase tracking-widest">← Volver a la enciclopedia</button>
      </aside>
    </div>
    {selectedImage !== null && <Modal title={`${weapon.name} · Imagen ${selectedImage + 1}`} onClose={() => setSelectedImage(null)}>
      <WeaponImage key={weapon.images[selectedImage]} src={weapon.images[selectedImage]} alt={weapon.multimedia.find(m => m.url_archivo === weapon.images[selectedImage])?.descripcion_imagen || weapon.name} className="max-h-[60vh] w-full object-contain" />
      <div className="mt-5 flex justify-between gap-3"><button className="font-mono text-xs text-primary p-2" onClick={() => setSelectedImage((selectedImage - 1 + weapon.images.length) % weapon.images.length)}>← Anterior</button><button className="font-mono text-xs text-primary p-2" onClick={() => setSelectedImage((selectedImage + 1) % weapon.images.length)}>Siguiente →</button></div>
    </Modal>}
  </main>
}

function SectionTitle({ children }) {
  return <h2 className="font-heading text-xl font-semibold uppercase tracking-wide mb-4 pb-2 border-b border-border">{children}</h2>
}
