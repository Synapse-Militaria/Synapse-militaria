import { useEffect, useRef, useState } from 'react'
import { Modal } from '../components/Nav'

const inputClass = 'w-full min-w-0 border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'
const primaryButton = 'bg-primary px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-50'
const secondaryButton = 'border border-border px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-secondary-foreground hover:text-foreground disabled:opacity-50'
const names = { weapons: 'Armamento', conflicts: 'Conflicto', countries: 'País / Facción', references: 'Referencia' }
const specFields = [
  ['calibre', 'Calibre', 'text'],
  ['longitud_total_mm', 'Longitud total (mm)', 'number'],
  ['longitud_canon_mm', 'Longitud del cañón (mm)', 'number'],
  ['peso_cargado_kg', 'Peso cargado (kg)', 'number'],
  ['peso_sin_cargar_kg', 'Peso sin cargar (kg)', 'number'],
  ['capacidad_cargador', 'Capacidad del cargador', 'number'],
  ['accion', 'Acción', 'text'],
  ['modos_de_fuego', 'Modos de fuego', 'text'],
  ['cadencia_tiro', 'Cadencia de tiro', 'text'],
  ['alcance_efectivo', 'Alcance efectivo', 'text'],
]

function objectId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('')
}

function dateValue(value) {
  return value ? String(value).slice(0, 10) : ''
}

function flagForIso(code) {
  if (code === 'SU') return 'SU'
  if (!/^[A-Z]{2}$/.test(code)) return '◈'
  return [...code].map(letter => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join('')
}

function Field({ label, name, type = 'text', value = '', required = false, ...props }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}{required ? ' *' : ''}</span>
      <input name={name} type={type} defaultValue={value ?? ''} required={required} className={inputClass} {...props} />
    </label>
  )
}

function TextArea({ label, name, value = '', required = false, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}{required ? ' *' : ''}</span>
      <textarea name={name} defaultValue={value} required={required} rows={3} className={`${inputClass} resize-y`} {...props} />
    </label>
  )
}

function Select({ label, name, value = '', children, required = false, ...props }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}{required ? ' *' : ''}</span>
      <select name={name} defaultValue={value} required={required} className={inputClass} {...props}>{children}</select>
    </label>
  )
}

function CheckBox({ label, name, checked = false }) {
  return (
    <label className="flex items-center gap-2 text-sm text-secondary-foreground">
      <input type="checkbox" name={name} defaultChecked={checked} className="accent-primary" />{label}
    </label>
  )
}

function FormActions({ busy, onClose, label = 'Guardar' }) {
  return (
    <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-border pt-5">
      <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>Cancelar</button>
      <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Guardando…' : label}</button>
    </div>
  )
}

function Th({ children }) {
  return <th scope="col" className="border-b border-border bg-muted px-4 py-3 text-left font-mono text-xs font-normal uppercase tracking-widest text-muted-foreground">{children}</th>
}

function Actions({ name, onEdit, onDelete, onView }) {
  return (
    <div className="flex items-center gap-3 whitespace-nowrap font-mono text-xs uppercase">
      {onView && <button onClick={onView} aria-label={`Ver ${name}`} className="text-primary hover:underline">Ver</button>}
      <button onClick={onEdit} aria-label={`Editar ${name}`} className="text-secondary-foreground hover:text-foreground hover:underline">Editar</button>
      <button onClick={onDelete} aria-label={`Eliminar ${name}`} className="text-accent-foreground hover:text-red-400 hover:underline">Eliminar</button>
    </div>
  )
}

function WeaponForm({ record = {}, countries, conflicts, busy, onSubmit, onClose }) {
  const [selectedEvents, setSelectedEvents] = useState((record.eventos || []).map(event => String(event.id_evento)))
  const existingTypes = ['Rifle', 'Subfusil', 'Pistola', 'Ametralladora', 'Artillería', 'Vehículo blindado', 'Arma blanca', 'Lanzador']
  const types = [...new Set([...existingTypes, record.tipo_arma].filter(Boolean))]

  function toggleEvent(id) {
    setSelectedEvents(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="mb-5 text-sm text-secondary-foreground">Complete los datos históricos de la ficha. Los campos con * son obligatorios.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="nombre" value={record.nombre} required maxLength={120} placeholder="Ej. M1 Garand" />
        <Field label="Designación oficial" name="designacion_oficial" value={record.designacion_oficial} required maxLength={200} />
        <Select label="Tipo de arma" name="tipo_arma" value={record.tipo_arma || 'Rifle'} required>{types.map(type => <option key={type}>{type}</option>)}</Select>
        <Select label="País de origen" name="id_pais" value={record.pais_origen?.id_pais || ''} required>
          <option value="">Seleccione un país</option>
          {countries.map(country => <option key={country._id} value={country._id}>{country.nombre}</option>)}
        </Select>
        <Field label="Año de creación" name="anio_creacion" type="number" value={record.anio_creacion} required min={1000} max={new Date().getFullYear()} step={1} />
        <Field label="Época de creación" name="epoca_creacion" value={record.epoca_creacion} required maxLength={200} />
        <Field label="Fabricante" name="fabricante" value={record.fabricante || record.manufacturer} maxLength={200} />
        <Field label="Años en servicio" name="periodo_servicio" value={record.periodo_servicio || record.yearsInService} maxLength={120} placeholder="Ej. 1936–1957" />
      </div>
      <div className="mt-4"><TextArea label="Descripción histórica" name="descripcion" value={record.descripcion} required minLength={20} maxLength={12000} rows={5} /></div>
      <fieldset className="mt-6 border-t border-border pt-4">
        <legend className="pr-3 font-heading text-lg uppercase tracking-wide">Especificaciones técnicas</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {specFields.map(([key, label, type]) => <Field key={key} label={label} name={`spec_${key}`} type={type} value={Array.isArray(record.especificaciones_tecnicas?.[key]) ? record.especificaciones_tecnicas[key].join(', ') : record.especificaciones_tecnicas?.[key]} {...(type === 'number' ? { min: 0, step: key.startsWith('peso_') ? '0.01' : '1' } : { maxLength: 200 })} />)}
        </div>
      </fieldset>
      <fieldset className="mt-6 border-t border-border pt-4">
        <legend className="pr-3 font-heading text-lg uppercase tracking-wide">Conflictos relacionados</legend>
        {conflicts.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {conflicts.map(conflict => (
              <label key={conflict._id} className="flex items-center gap-2 text-sm text-secondary-foreground">
                <input type="checkbox" name="eventIds" value={conflict._id} checked={selectedEvents.includes(conflict._id)} onChange={() => toggleEvent(conflict._id)} className="accent-primary" />{conflict.nombre_conflicto}
              </label>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Agregue primero un conflicto desde su pestaña.</p>}
        {conflicts.filter(conflict => selectedEvents.includes(conflict._id)).map(conflict => {
          const event = record.eventos?.find(item => String(item.id_evento) === conflict._id)
          return (
            <div key={conflict._id} className="mt-4 space-y-3 border-l border-primary/40 pl-4">
              <h3 className="font-mono text-xs text-primary">{conflict.nombre_conflicto}</h3>
              <Field label="Rol del arma" name={`rol_${conflict._id}`} value={event?.rol} maxLength={1000} />
              <Field label="Facciones usuarias (separadas por comas)" name={`facciones_${conflict._id}`} value={(event?.facciones_usuarias || []).join(', ')} maxLength={1000} />
              <TextArea label="Nota histórica" name={`nota_${conflict._id}`} value={event?.nota_historica} maxLength={3000} />
            </div>
          )
        })}
      </fieldset>
      <div className="mt-6 space-y-4">
        <TextArea label="Imágenes (una dirección por línea; la primera será la portada)" name="imagenes" value={(record.multimedia || []).map(image => image.url_archivo).join('\n')} placeholder="https://…" maxLength={12000} />
        <CheckBox label="Visible en el catálogo público" name="activo_en_catalogo" checked={record.activo_en_catalogo ?? true} />
      </div>
      <FormActions busy={busy} onClose={onClose} label="Guardar armamento" />
    </form>
  )
}

function ConflictForm({ record = {}, weapons, busy, onSubmit, onClose }) {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del conflicto" name="nombre_conflicto" value={record.nombre_conflicto} required maxLength={200} />
        <Field label="Teatro de operaciones" name="teatro_operaciones" value={record.teatro_operaciones} required maxLength={250} />
        <Field label="Fecha de inicio" name="fecha_inicio" type="date" value={dateValue(record.fecha_inicio)} required />
        <Field label="Fecha de fin" name="fecha_fin" type="date" value={dateValue(record.fecha_fin)} />
      </div>
      <div className="mt-4 space-y-4">
        <CheckBox label="Conflicto finalizado" name="conflicto_finalizado" checked={record.conflicto_finalizado ?? Boolean(record.fecha_fin)} />
        <TextArea label="Descripción" name="descripcion" value={record.descripcion} maxLength={6000} />
        <TextArea label="Facciones (una por línea)" name="facciones" value={(record.facciones || []).join('\n')} maxLength={3000} />
        <fieldset className="border-t border-border pt-4">
          <legend className="pr-3 font-heading text-lg uppercase tracking-wide">Armamentos involucrados</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {weapons.map(weapon => (
              <label key={weapon._id} className="flex items-center gap-2 text-sm text-secondary-foreground">
                <input type="checkbox" name="weaponIds" value={weapon._id} defaultChecked={(record.armas_involucradas || []).map(String).includes(weapon._id)} className="accent-primary" />{weapon.nombre}
              </label>
            ))}
          </div>
          {!weapons.length && <p className="text-sm text-muted-foreground">Todavía no hay armamentos registrados.</p>}
        </fieldset>
      </div>
      <FormActions busy={busy} onClose={onClose} label="Guardar conflicto" />
    </form>
  )
}

function CountryForm({ record = {}, busy, onSubmit, onClose }) {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="nombre" value={record.nombre} required maxLength={200} />
        <Select label="Tipo de facción" name="tipo_faccion" value={record.tipo_faccion || 'Estado'} required>
          {['Estado', 'Imperio', 'Alianza Militar'].map(type => <option key={type}>{type}</option>)}
        </Select>
        <Field label="Código ISO" name="codigo_iso" value={record.codigo_iso} required pattern="[A-Za-z]{2,3}" maxLength={3} title="Use dos o tres letras, por ejemplo US o SU." placeholder="US" />
        <Field label="Año de fundación" name="anio_fundacion" type="number" value={record.anio_fundacion} required min={1} max={new Date().getFullYear()} step={1} />
        <Field label="Región" name="region" value={record.region} maxLength={200} placeholder="Ej. América del Sur" />
      </div>
      <div className="mt-4"><CheckBox label="Existe actualmente" name="existe_actualmente" checked={record.existe_actualmente ?? true} /></div>
      <FormActions busy={busy} onClose={onClose} label="Guardar país / facción" />
    </form>
  )
}

function ReferenceForm({ entry, weapons, conflicts, busy, onSubmit, onClose }) {
  const reference = entry?.reference || {}
  const targets = [...weapons.map(record => ({ record, collection: 'weapons', label: 'Arma' })), ...conflicts.map(record => ({ record, collection: 'conflicts', label: 'Conflicto' }))]
  const target = entry ? `${entry.collection}:${entry.parent._id}` : ''
  return (
    <form onSubmit={onSubmit}>
      <p className="mb-4 text-sm text-secondary-foreground">La referencia se guarda dentro de la ficha del arma o del conflicto que documenta.</p>
      <Select label="Ficha relacionada" name="target" value={target} required disabled={Boolean(entry)}>
        <option value="">Seleccione una ficha</option>
        {targets.map(({ record, collection, label }) => <option key={`${collection}:${record._id}`} value={`${collection}:${record._id}`}>{label}: {record.nombre || record.nombre_conflicto}</option>)}
      </Select>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Código de cita" name="codigo_cita" value={reference.codigo_cita} required maxLength={40} placeholder="Ej. GAR-01" />
        <Field label="Año de publicación" name="anio_publicacion" type="number" value={reference.anio_publicacion} min={1} max={new Date().getFullYear()} step={1} />
      </div>
      <div className="mt-4 space-y-4">
        <TextArea label="Detalle bibliográfico" name="detalle_cita" value={reference.detalle_cita} required maxLength={4000} />
        <Field label="Enlace a la fuente" name="url_enlace" type="url" value={reference.url_enlace} required maxLength={2000} placeholder="https://…" />
        <CheckBox label="Fuente revisada" name="verificada" checked={reference.verificada} />
      </div>
      <FormActions busy={busy} onClose={onClose} label="Guardar referencia" />
    </form>
  )
}

export default function AdminDashboard({ navigate, onLogout, weapons = [], countries = [], conflicts = [], onSave, onDelete, mode }) {
  const [tab, setTab] = useState('weapons')
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const errorMessage = useRef(null)

  useEffect(() => {
    if (error) errorMessage.current?.focus()
  }, [error])
  const references = [...weapons.map(parent => ({ parent, collection: 'weapons' })), ...conflicts.map(parent => ({ parent, collection: 'conflicts' }))]
    .flatMap(({ parent, collection }) => (parent.referencias || []).map((reference, index) => ({ reference, parent, collection, index })))
  const tabs = [
    ['weapons', 'Armamentos', weapons.length],
    ['conflicts', 'Conflictos', conflicts.length],
    ['countries', 'Países / Facciones', countries.length],
    ['references', 'Referencias', references.length],
  ]
  const titles = { weapons: 'Gestión de Armamentos', conflicts: 'Gestión de Conflictos Bélicos', countries: 'Gestión de Países y Facciones', references: 'Fuentes y Referencias Bibliográficas' }

  function openModal(action, record) {
    setError('')
    setModal({ action, record, collection: tab })
  }

  function closeModal() {
    if (!busy) { setModal(null); setError('') }
  }

  async function save(event) {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const value = name => String(data.get(name) || '').trim()
    const number = name => value(name) === '' ? null : Number(value(name))
    const record = modal.record || {}
    let collection = modal.collection
    let result
    try {
      if (collection === 'weapons') {
        const country = countries.find(item => item._id === value('id_pais'))
        if (!country) throw new Error('Seleccione un país de origen válido.')
        const specs = { ...record.especificaciones_tecnicas }
        specFields.forEach(([key, , type]) => { specs[key] = type === 'number' ? number(`spec_${key}`) : value(`spec_${key}`) })
        const images = value('imagenes').split(/\r?\n/).map(url => url.trim()).filter(Boolean)
        if (images.some(url => !url.startsWith('/images/') && !/^https?:\/\/\S+$/i.test(url))) throw new Error('Use direcciones http o https para las imágenes, o rutas de /images/.')
        result = {
          ...record,
          nombre: value('nombre'), designacion_oficial: value('designacion_oficial'), tipo_arma: value('tipo_arma'),
          anio_creacion: number('anio_creacion'), epoca_creacion: value('epoca_creacion'), descripcion: value('descripcion'),
          fabricante: value('fabricante'), periodo_servicio: value('periodo_servicio'), activo_en_catalogo: data.has('activo_en_catalogo'),
          especificaciones_tecnicas: specs,
          pais_origen: { ...record.pais_origen, id_pais: country._id, nombre: country.nombre, tipo_faccion: country.tipo_faccion, codigo_iso: country.codigo_iso },
          eventos: data.getAll('eventIds').map(id => {
            const conflict = conflicts.find(item => item._id === id)
            const oldEvent = record.eventos?.find(item => String(item.id_evento) === id)
            return { ...oldEvent, id_evento: id, nombre_conflicto: conflict.nombre_conflicto, fecha_inicio: conflict.fecha_inicio, fecha_fin: conflict.fecha_fin, teatro_operaciones: conflict.teatro_operaciones, rol: value(`rol_${id}`), facciones_usuarias: value(`facciones_${id}`).split(',').map(item => item.trim()).filter(Boolean), nota_historica: value(`nota_${id}`) }
          }),
          multimedia: images.map((url, index) => ({ ...(record.multimedia?.find(image => image.url_archivo === url) || { _id: objectId(), descripcion_imagen: value('nombre'), tipo_archivo: 'imagen' }), url_archivo: url, es_portada: index === 0 })),
          referencias: record.referencias || [],
        }
      } else if (collection === 'conflicts') {
        const start = value('fecha_inicio')
        const end = value('fecha_fin')
        if (end && end < start) throw new Error('La fecha de fin no puede ser anterior a la de inicio.')
        if (data.has('conflicto_finalizado') && !end) throw new Error('Indique la fecha de fin del conflicto finalizado.')
        result = { ...record, nombre_conflicto: value('nombre_conflicto'), fecha_inicio: start, fecha_fin: end || null, teatro_operaciones: value('teatro_operaciones'), conflicto_finalizado: data.has('conflicto_finalizado'), descripcion: value('descripcion'), facciones: value('facciones').split(/\r?\n/).map(item => item.trim()).filter(Boolean), armas_involucradas: data.getAll('weaponIds'), referencias: record.referencias || [] }
      } else if (collection === 'countries') {
        const code = value('codigo_iso').toUpperCase()
        const bandera = code !== record.codigo_iso ? flagForIso(code) : record.bandera || flagForIso(code)
        result = { ...record, nombre: value('nombre'), tipo_faccion: value('tipo_faccion'), codigo_iso: code, bandera, region: value('region'), anio_fundacion: number('anio_fundacion'), existe_actualmente: data.has('existe_actualmente') }
      } else {
        const entry = modal.record
        const [targetCollection, targetId] = entry ? [entry.collection, entry.parent._id] : value('target').split(':')
        const parent = (targetCollection === 'weapons' ? weapons : conflicts).find(item => item._id === targetId)
        if (!parent) throw new Error('Seleccione la ficha que respalda esta referencia.')
        const url = value('url_enlace')
        if (!/^https?:\/\//i.test(url)) throw new Error('El enlace de la fuente debe comenzar con http o https.')
        const reference = { ...entry?.reference, _id: entry?.reference._id || objectId(), codigo_cita: value('codigo_cita'), detalle_cita: value('detalle_cita'), url_enlace: url, anio_publicacion: number('anio_publicacion'), verificada: data.has('verificada') }
        const refs = [...(parent.referencias || [])]
        if (entry) refs[entry.index] = reference
        else refs.push(reference)
        collection = targetCollection
        result = { ...parent, referencias: refs }
      }
      setBusy(true)
      setError('')
      await onSave(collection, result)
      setNotice(modal.action === 'edit' ? '✓ Ficha actualizada correctamente' : '✓ Ficha creada correctamente')
      setModal(null)
    } catch (failure) {
      setError(failure.message || 'No se pudo guardar la ficha. Inténtelo nuevamente.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (modal.collection === 'references') {
        const { collection, parent, index } = modal.record
        await onSave(collection, { ...parent, referencias: parent.referencias.filter((_, itemIndex) => itemIndex !== index) })
      } else await onDelete(modal.collection, modal.record._id)
      setNotice('✓ Registro eliminado correctamente')
      setModal(null)
    } catch (failure) {
      setError(failure.message || 'No se pudo eliminar el registro.')
    } finally {
      setBusy(false)
    }
  }

  const deleting = modal?.action === 'delete'
  const modalName = modal?.collection === 'references' ? modal.record?.reference.detalle_cita : modal?.record?.nombre || modal?.record?.nombre_conflicto

  return (
    <div className="min-h-screen bg-background pt-14">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="mb-0.5 font-mono text-xs uppercase tracking-widest text-primary">Panel de Administración</p>
            <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide">Gestión de Contenido</h1>
          </div>
          <button onClick={onLogout} className="border border-accent/50 px-3 py-2 font-mono text-xs uppercase tracking-wider text-accent-foreground hover:bg-accent/20">Cerrar sesión</button>
        </div>
        <div className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
          <div className="flex min-w-max" aria-label="Colecciones del catálogo">
            {tabs.map(([id, label, count]) => <button key={id} onClick={() => { setTab(id); setNotice('') }} aria-current={tab === id ? 'page' : undefined} className={`whitespace-nowrap border-b-2 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors sm:px-5 ${tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label} <span className="ml-1">({count})</span></button>)}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {mode === 'demo' && <p className="mb-5 border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-secondary-foreground">Modo de presentación: los cambios quedan en memoria y se pierden al recargar. Para guardar en MongoDB, conecte el backend y vuelva a cargar antes de editar.</p>}
        {notice && <div role="status" className="mb-6 flex items-center justify-between gap-4 border border-[#166534] bg-[#052e16] px-4 py-3 text-sm text-[#4ade80]"><span>{notice}</span><button aria-label="Cerrar confirmación" onClick={() => setNotice('')} className="px-2 text-xl">×</button></div>}
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h2 className="font-heading text-xl font-semibold uppercase tracking-wide">{titles[tab]}</h2>
          <button onClick={() => openModal('create')} className={primaryButton}>+ {tab === 'references' ? 'Nueva Referencia' : `Nuevo ${names[tab]}`}</button>
        </div>

        {tab === 'weapons' && <div className="overflow-x-auto"><table className="w-full border border-border"><thead><tr>{['Nombre', 'Categoría', 'País', 'Año', 'Conflictos', 'Acciones'].map(title => <Th key={title}>{title}</Th>)}</tr></thead><tbody>
          {weapons.map((weapon, index) => <tr key={weapon._id} className={`border-b border-border hover:bg-muted/30 ${index % 2 ? 'bg-muted/10' : ''}`}>
            <td className="px-4 py-3"><div className="font-heading text-sm font-semibold uppercase tracking-wide">{weapon.nombre}</div><div className="font-mono text-xs text-muted-foreground">{weapon.designacion_oficial}</div>{weapon.activo_en_catalogo === false && <span className="font-mono text-xs text-accent-foreground">Oculta del catálogo</span>}</td>
            <td className="px-4 py-3"><span className="bg-accent/20 px-2 py-0.5 font-mono text-xs uppercase text-accent-foreground">{weapon.tipo_arma}</span></td>
            <td className="px-4 py-3 font-mono text-xs text-secondary-foreground">{weapon.pais_origen?.nombre || 'Sin país'}</td>
            <td className="px-4 py-3 font-mono text-sm text-primary">{weapon.anio_creacion}</td>
            <td className="px-4 py-3 text-center font-mono text-sm text-secondary-foreground">{weapon.eventos?.length || 0}</td>
            <td className="px-4 py-3"><Actions name={weapon.nombre} onView={() => navigate({ view: 'weapon', id: weapon._id })} onEdit={() => openModal('edit', weapon)} onDelete={() => openModal('delete', weapon)} /></td>
          </tr>)}
        </tbody></table>{!weapons.length && <EmptyList />}</div>}

        {tab === 'conflicts' && <div className="overflow-x-auto"><table className="w-full border border-border"><thead><tr>{['Conflicto', 'Período', 'Teatro', 'Armamentos', 'Acciones'].map(title => <Th key={title}>{title}</Th>)}</tr></thead><tbody>
          {conflicts.map((conflict, index) => <tr key={conflict._id} className={`border-b border-border hover:bg-muted/30 ${index % 2 ? 'bg-muted/10' : ''}`}>
            <td className="px-4 py-3 font-heading text-sm font-semibold uppercase tracking-wide">{conflict.nombre_conflicto}</td>
            <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-primary">{dateValue(conflict.fecha_inicio).slice(0, 4)}–{dateValue(conflict.fecha_fin).slice(0, 4) || 'presente'}</td>
            <td className="px-4 py-3 font-mono text-xs text-secondary-foreground">{conflict.teatro_operaciones}</td>
            <td className="px-4 py-3 text-center font-mono text-sm text-secondary-foreground">{conflict.armas_involucradas?.length || 0}</td>
            <td className="px-4 py-3"><Actions name={conflict.nombre_conflicto} onEdit={() => openModal('edit', conflict)} onDelete={() => openModal('delete', conflict)} /></td>
          </tr>)}
        </tbody></table>{!conflicts.length && <EmptyList />}</div>}

        {tab === 'countries' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map(country => <div key={country._id} className="flex flex-wrap items-center justify-between gap-4 border border-border bg-card px-5 py-4">
            <div className="flex min-w-0 items-center gap-3"><span className="font-mono text-lg text-primary">{country.codigo_iso}</span><div><h3 className="font-heading text-sm font-semibold uppercase tracking-wide">{country.nombre}</h3><p className="font-mono text-xs text-muted-foreground">{country.tipo_faccion} · {country.anio_fundacion}</p></div></div>
            <Actions name={country.nombre} onEdit={() => openModal('edit', country)} onDelete={() => openModal('delete', country)} />
          </div>)}
          {!countries.length && <EmptyList />}
        </div>}

        {tab === 'references' && <div className="overflow-x-auto"><table className="w-full border border-border"><thead><tr>{['Código', 'Fuente bibliográfica', 'Ficha relacionada', 'Año', 'Acciones'].map(title => <Th key={title}>{title}</Th>)}</tr></thead><tbody>
          {references.map((entry, index) => <tr key={`${entry.collection}-${entry.parent._id}-${entry.reference._id || entry.index}`} className={`border-b border-border hover:bg-muted/30 ${index % 2 ? 'bg-muted/10' : ''}`}>
            <td className="px-4 py-3 font-mono text-xs text-primary">{entry.reference.codigo_cita || `[${index + 1}]`}</td>
            <td className="max-w-sm px-4 py-3 text-sm"><p className="line-clamp-2">{entry.reference.detalle_cita}</p><span className="font-mono text-xs text-muted-foreground">{entry.reference.verificada ? 'Revisada' : 'Pendiente de revisión'}</span></td>
            <td className="px-4 py-3 font-mono text-xs text-secondary-foreground">{entry.parent.nombre || entry.parent.nombre_conflicto}</td>
            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{entry.reference.anio_publicacion || '—'}</td>
            <td className="px-4 py-3"><Actions name={entry.reference.codigo_cita || entry.reference.detalle_cita} onEdit={() => openModal('edit', entry)} onDelete={() => openModal('delete', entry)} /></td>
          </tr>)}
        </tbody></table>{!references.length && <EmptyList />}</div>}
      </div>

      {modal && <Modal title={`${deleting ? 'Eliminar' : modal.action === 'edit' ? 'Editar' : modal.collection === 'references' ? 'Nueva' : 'Nuevo'} ${names[modal.collection]}`} onClose={closeModal}>
        {error && <p ref={errorMessage} role="alert" tabIndex={-1} className="mb-5 border border-accent bg-accent/20 px-4 py-3 text-sm text-accent-foreground">{error}</p>}
        {deleting ? <div><p className="break-words text-sm text-secondary-foreground">¿Eliminar «{modalName}»? Esta acción no se puede deshacer.</p><div className="mt-6 flex flex-wrap justify-end gap-3"><button onClick={closeModal} disabled={busy} className={secondaryButton}>Cancelar</button><button onClick={remove} disabled={busy} className="border border-accent bg-accent/30 px-4 py-2.5 font-mono text-xs uppercase text-accent-foreground disabled:opacity-50">{busy ? 'Eliminando…' : 'Confirmar eliminación'}</button></div></div> : <>
          {modal.collection === 'weapons' && <WeaponForm record={modal.record} countries={countries} conflicts={conflicts} busy={busy} onSubmit={save} onClose={closeModal} />}
          {modal.collection === 'conflicts' && <ConflictForm record={modal.record} weapons={weapons} busy={busy} onSubmit={save} onClose={closeModal} />}
          {modal.collection === 'countries' && <CountryForm record={modal.record} busy={busy} onSubmit={save} onClose={closeModal} />}
          {modal.collection === 'references' && <ReferenceForm entry={modal.record} weapons={weapons} conflicts={conflicts} busy={busy} onSubmit={save} onClose={closeModal} />}
        </>}
      </Modal>}
    </div>
  )
}

function EmptyList() {
  return <p className="border border-t-0 border-border px-4 py-8 text-center text-sm text-muted-foreground">No hay registros en esta sección. Puede agregar uno con el botón superior.</p>
}
