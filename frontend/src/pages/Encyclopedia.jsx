import { useState, useMemo } from 'react';
import { Modal, WeaponImage } from '../components/Nav';
const CATEGORIES = [{
  value: '',
  label: 'Todos'
}, {
  value: 'rifle',
  label: 'Rifles'
}, {
  value: 'pistol',
  label: 'Pistolas'
}, {
  value: 'submachine-gun',
  label: 'Subfusiles'
}, {
  value: 'machine-gun',
  label: 'Ametralladoras'
}, {
  value: 'tank',
  label: 'Vehículos blindados'
}, {
  value: 'artillery',
  label: 'Artillería'
}, {
  value: 'melee',
  label: 'Arma blanca'
}, {
  value: 'launcher',
  label: 'Lanzadores'
}];
export default function Encyclopedia({
  navigate, weapons, conflicts, countries,
  initialSearch = '', initialCategory = '', initialConflict = '', initialYearFrom = '', initialYearTo = ''
}) {
  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [countryFilter, setCountryFilter] = useState('');
  const [conflictFilter, setConflictFilter] = useState(initialConflict);
  const [yearFrom, setYearFrom] = useState(initialYearFrom);
  const [yearTo, setYearTo] = useState(initialYearTo);
  const [sortBy, setSortBy] = useState('name');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const invalidYears = [yearFrom, yearTo].some(value => value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 1000 || Number(value) > 2100)) || (yearFrom !== '' && yearTo !== '' && Number(yearFrom) > Number(yearTo));
  const filtered = useMemo(() => {
    if (invalidYears) return [];
    let result = [...weapons];
    if (search) {
      const q = fold(search.trim());
      result = result.filter(w => fold([
        w.name, w.designation, w.description, w.tipo_arma, w.category,
        countries.find(c => c.id === w.countryId)?.name, w.pais_origen.nombre,
        ...Object.values(w.specs), ...w.tags,
        ...w.eventos.map(e => e.nombre_conflicto),
      ].join(' ')).includes(q));
    }
    if (categoryFilter) result = result.filter(w => w.category === categoryFilter);
    if (countryFilter) result = result.filter(w => w.countryId === countryFilter);
    if (conflictFilter) result = result.filter(w => w.conflicts.some(c => c.conflictId === conflictFilter));
    if (yearFrom !== '') result = result.filter(w => w.yearIntroduced != null && w.yearIntroduced >= Number(yearFrom));
    if (yearTo !== '') result = result.filter(w => w.yearIntroduced != null && w.yearIntroduced <= Number(yearTo));
    result.sort((a, b) => {
      if (sortBy === 'year') return a.yearIntroduced - b.yearIntroduced;
      if (sortBy === 'conflicts') return b.conflicts.length - a.conflicts.length;
      return a.name.localeCompare(b.name);
    });
    return result;
  }, [weapons, countries, search, categoryFilter, countryFilter, conflictFilter, yearFrom, yearTo, invalidYears, sortBy]);
  function resetFilters() {
    setSearch(''); setCategoryFilter(''); setCountryFilter(''); setConflictFilter(''); setYearFrom(''); setYearTo(''); setSortBy('name'); setSidebarOpen(false);
  }
  const sidebar = <aside aria-label="Filtros de búsqueda" className="w-full lg:w-52 flex-shrink-0 space-y-6">
      <div>
        <div className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-3 pb-2 border-b border-border">Año de creación</div>
        <label className="block font-mono text-xs text-secondary-foreground mb-3">Desde
          <input type="number" min="1000" max="2100" step="1" value={yearFrom} onChange={event => setYearFrom(event.target.value)} className="mt-2 w-full bg-background border border-border px-3 py-2 text-foreground focus:outline-none focus:border-primary" />
        </label>
        <label className="block font-mono text-xs text-secondary-foreground">Hasta
          <input type="number" min="1000" max="2100" step="1" value={yearTo} onChange={event => setYearTo(event.target.value)} className="mt-2 w-full bg-background border border-border px-3 py-2 text-foreground focus:outline-none focus:border-primary" />
        </label>
      </div>
      <div>
        <div className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-3 pb-2 border-b border-border">
          Categoría
        </div>
        <div className="space-y-0.5">
          {CATEGORIES.map(cat => <FilterLink key={cat.value} active={categoryFilter === cat.value} onClick={() => setCategoryFilter(cat.value)}>
              {cat.label}
            </FilterLink>)}
        </div>
      </div>
      <div>
        <div className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-3 pb-2 border-b border-border">
          País de Origen
        </div>
        <div className="space-y-0.5">
          <FilterLink active={countryFilter === ''} onClick={() => setCountryFilter('')}>
            Todos
          </FilterLink>
          {countries.map(c => <FilterLink key={c.id} active={countryFilter === c.id} onClick={() => setCountryFilter(c.id)}>
              {c.flag} {c.name}
            </FilterLink>)}
        </div>
      </div>
      <div>
        <div className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-3 pb-2 border-b border-border">
          Conflicto
        </div>
        <div className="space-y-0.5">
          <FilterLink active={conflictFilter === ''} onClick={() => setConflictFilter('')}>
            Todos
          </FilterLink>
          {conflicts.map(c => <FilterLink key={c.id} active={conflictFilter === c.id} onClick={() => setConflictFilter(c.id)}>
              {c.name}
            </FilterLink>)}
        </div>
      </div>
      <div>
        <div className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-3 pb-2 border-b border-border">
          Ordenar por
        </div>
        <div className="space-y-0.5">
          {[{
          v: 'name',
          l: 'Nombre'
        }, {
          v: 'year',
          l: 'Año'
        }, {
          v: 'conflicts',
          l: 'N.° Conflictos'
        }].map(opt => <FilterLink key={opt.v} active={sortBy === opt.v} onClick={() => setSortBy(opt.v)}>
              {opt.l}
            </FilterLink>)}
        </div>
      </div>
    </aside>;
  return <main className="min-h-screen bg-background pt-14 overflow-x-clip">
      <div className="bg-card border-b border-border sticky top-14 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <div className="flex w-full lg:w-auto lg:flex-1 min-w-0 gap-0">
            <input aria-label="Buscar armamento, calibre o país" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar armamento, calibre..." className="min-w-0 w-full flex-1 bg-background border border-border text-foreground font-mono text-sm px-4 py-2 placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" />
            {search && <button aria-label="Limpiar búsqueda" onClick={() => setSearch('')} className="bg-background border border-border border-l-0 px-3 text-muted-foreground hover:text-foreground transition-colors">
                ×
              </button>}
          </div>
          <span role="status" className="font-mono text-xs text-muted-foreground flex-1 lg:flex-none">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </span>
          <button onClick={() => setSidebarOpen(v => !v)} aria-expanded={sidebarOpen} className="lg:hidden shrink-0 border border-border text-muted-foreground hover:text-primary transition-colors px-3 py-2 font-mono text-xs uppercase tracking-wider">
            Filtros
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8">
        <div className="hidden lg:block">
          {sidebar}
        </div>
        {sidebarOpen && <Modal title="Filtros" onClose={() => setSidebarOpen(false)}>{sidebar}<button onClick={() => setSidebarOpen(false)} className="mt-6 w-full bg-primary text-primary-foreground py-3 font-mono text-xs uppercase">Ver {filtered.length} resultados</button></Modal>}
        <div className="flex-1 min-w-0">
          <h1 className="font-heading text-2xl uppercase mb-5 tracking-wide">Enciclopedia de armamento</h1>
          {invalidYears && <p role="alert" className="text-red-400 mb-5">Ingresa años enteros entre 1000 y 2100. El año inicial debe ser menor o igual al final.</p>}
          {(search || categoryFilter || countryFilter || conflictFilter || yearFrom || yearTo) && <button onClick={resetFilters} className="mb-5 text-primary font-mono text-xs underline">Limpiar todos los filtros</button>}
          {filtered.length === 0 ? <div role="status" className="border border-border bg-card text-center px-5 py-16">
              <div aria-hidden="true" className="text-4xl mb-5 text-primary">⌕</div>
              <h2 className="font-heading text-2xl uppercase mb-3">No se encontraron armas con estos filtros</h2>
              <p className="text-secondary-foreground mb-7">Prueba con otro nombre o restablece los parámetros para volver al catálogo.</p>
              <button onClick={resetFilters} className="bg-primary text-primary-foreground px-4 py-3 font-mono text-xs uppercase tracking-wide">Restablecer parámetros de búsqueda</button>
            </div> : <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(weapon => {
            const country = countries.find(c => c.id === weapon.countryId);
            return <button key={weapon.id} onClick={() => navigate({
              view: 'weapon',
              id: weapon.id
            })} className="group text-left bg-card border border-border hover:border-primary/50 transition-all overflow-hidden">
                    <div className="aspect-[16/9] overflow-hidden bg-muted relative">
                      <WeaponImage src={weapon.images[0]} alt={weapon.name} className="w-full h-full object-contain filter grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-500" />
                      <div className="absolute top-2 left-2">
                        <span className="bg-accent/80 text-accent-foreground font-mono text-xs px-2 py-0.5 uppercase tracking-wider">
                          {weapon.tipo_arma}
                        </span>
                      </div>
                      <div className="absolute top-2 right-2">
                        <span className="bg-background/80 text-primary font-mono text-xs px-2 py-0.5">
                          {weapon.yearIntroduced}
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <h3 className="font-heading text-lg font-semibold uppercase tracking-wide group-hover:text-primary transition-colors leading-tight">
                          {weapon.name}
                        </h3>
                        <span className="text-xl flex-shrink-0 mt-0.5">{country?.flag}</span>
                      </div>
                      <div className="font-mono text-xs text-muted-foreground mb-2">
                        {weapon.designation} · {weapon.manufacturer.split(',')[0]}
                      </div>
                      <p className="text-secondary-foreground text-xs leading-relaxed line-clamp-2">
                        {weapon.description}
                      </p>
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
                        <span className="font-mono text-xs text-muted-foreground">
                          {weapon.conflicts.length} conflictos
                        </span>
                        <span className="text-border">·</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {weapon.yearsInService}
                        </span>
                      </div>
                    </div>
                  </button>;
          })}
            </div>}
        </div>
      </div>
    </main>;
}

function fold(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function FilterLink({ active, onClick, children }) {
  return <button onClick={onClick} aria-pressed={active} className={`w-full text-left font-mono text-xs px-2 py-2 transition-colors ${active ? 'text-primary border-l border-primary bg-primary/10' : 'text-secondary-foreground hover:text-foreground'}`}>{children}</button>;
}
