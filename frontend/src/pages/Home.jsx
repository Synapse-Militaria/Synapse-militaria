import { useState } from 'react';
import { WeaponImage } from '../components/Nav';
export default function Home({
  navigate, weapons, conflicts, countries
}) {
  const [searchQuery, setSearchQuery] = useState('');
  function handleSearch(e) {
    e.preventDefault();
    navigate({
      view: 'encyclopedia',
      search: searchQuery
    });
  }
  const featured = weapons.slice(0, 4);
  const categoryStats = [{
    cat: 'rifle',
    label: 'RIFLES'
  }, {
    cat: 'submachine-gun',
    label: 'SUBFUSILES'
  }, {
    cat: 'machine-gun',
    label: 'AMETRALLADORAS'
  }, {
    cat: 'pistol',
    label: 'PISTOLAS'
  }];
  return <main>
      <section className="relative min-h-screen flex items-center bg-grid overflow-hidden">
        <div className="absolute inset-0 bg-center bg-cover opacity-10" style={{
        backgroundImage: weapons[0]?.images[0] ? `url('${weapons[0].images[0]}')` : 'none'
      }} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />

        <div className="relative max-w-7xl mx-auto px-6 pt-24 pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 border border-primary/30 text-primary font-mono text-xs sm:text-xs tracking-wide sm:tracking-widest px-3 py-1 mb-8 uppercase">
              <span className="w-1.5 h-1.5 shrink-0 bg-primary" />
              Enciclopedia Interactiva Histórico-Militar
            </div>

            <h1 className="font-heading text-6xl sm:text-8xl lg:text-[108px] font-bold tracking-tight leading-none uppercase mb-4">
              SYNAPSE
              <br />
              <span className="text-primary">MILITARIA</span>
            </h1>

            <p className="text-secondary-foreground text-base sm:text-lg leading-relaxed mb-10 max-w-xl">
              Explora fichas de armamento histórico, conflictos bélicos
              y su trazabilidad a través del tiempo.
            </p>
            <form onSubmit={handleSearch} className="flex max-w-lg">
              <input aria-label="Buscar en la enciclopedia" type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar arma, conflicto, país..." className="min-w-0 w-full flex-1 bg-card border border-border border-r-0 text-foreground font-mono text-xs sm:text-sm px-3 sm:px-4 py-3 placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" />
              <button type="submit" className="bg-primary text-primary-foreground font-mono text-xs font-semibold px-5 py-3 hover:bg-primary/90 transition-colors uppercase tracking-widest flex-shrink-0">
                Buscar
              </button>
            </form>
            <div className="flex gap-6 sm:gap-10 mt-10">
              {[{
              label: 'Armamentos',
              value: String(weapons.length).padStart(3, '0')
            }, {
              label: 'Conflictos',
              value: String(conflicts.length).padStart(3, '0')
            }, {
              label: 'Países',
              value: String(countries.length).padStart(3, '0')
            }].map(s => <div key={s.label}>
                  <div className="font-mono text-3xl font-bold text-primary tabular-nums">{s.value}</div>
                  <div className="font-mono text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
                    {s.label}
                  </div>
                </div>)}
            </div>
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <div className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-1">
              Catálogo
            </div>
            <h2 className="font-heading text-3xl font-semibold uppercase tracking-wide">
              Armamento Destacado
            </h2>
          </div>
          <button onClick={() => navigate({
          view: 'encyclopedia'
        })} className="font-mono text-xs text-primary border border-primary/30 hover:bg-primary hover:text-primary-foreground px-4 py-2 transition-colors uppercase tracking-widest">
            Ver todo
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {featured.map(weapon => {
          const country = countries.find(c => c.id === weapon.countryId);
          return <button key={weapon.id} onClick={() => navigate({
            view: 'weapon',
            id: weapon.id
          })} className="group text-left bg-card border border-border hover:border-primary/50 transition-all overflow-hidden">
                <div className="aspect-[4/3] overflow-hidden bg-muted relative">
                  <WeaponImage src={weapon.images[0]} alt={weapon.name} className="w-full h-full object-contain filter grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-xs text-primary uppercase tracking-wider">
                      {weapon.tipo_arma}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{weapon.yearIntroduced}</span>
                  </div>
                  <h3 className="font-heading text-lg font-semibold uppercase tracking-wide group-hover:text-primary transition-colors leading-tight">
                    {weapon.name}
                  </h3>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5 mb-2">
                    {country?.flag} {country?.name}
                  </p>
                  <p className="text-secondary-foreground text-xs leading-relaxed line-clamp-2">
                    {weapon.description}
                  </p>
                  <div className="mt-3 pt-3 border-t border-border font-mono text-xs text-muted-foreground">
                    {weapon.conflicts.length} conflictos documentados
                  </div>
                </div>
              </button>;
        })}
        </div>
      </section>
      <section className="border-t border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="font-mono text-xs text-muted-foreground tracking-widest uppercase text-center mb-8">
            Categorías de armamento
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
            {categoryStats.map(item => {
            const count = weapons.filter(w => w.category === item.cat).length;
            return <button key={item.cat} onClick={() => navigate({
              view: 'encyclopedia',
              category: item.cat
            })} className="bg-background hover:bg-muted/60 p-8 text-center group transition-colors">
                  <div className="font-mono text-4xl font-bold text-primary group-hover:scale-110 transition-transform inline-block">
                    {String(count).padStart(2, '0')}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground tracking-widest mt-2">
                    {item.label}
                  </div>
                </button>;
          })}
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-1">
              Base de datos
            </div>
            <h2 className="font-heading text-3xl font-semibold uppercase tracking-wide">
              Conflictos Registrados
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {conflicts.slice(0, 4).map(conflict => <button key={conflict.id} onClick={() => navigate({ view: 'encyclopedia', conflict: conflict.id })} className="text-left bg-card border border-border hover:border-primary/50 p-5 relative overflow-hidden group">
              <div className="absolute inset-0 opacity-10 bg-center bg-cover group-hover:opacity-20 transition-opacity" style={{
            backgroundImage: `url('${conflict.image}')`
          }} />
              <div className="relative">
                <div className="font-mono text-xs text-primary mb-2">
                  {conflict.startYear}–{conflict.endYear ?? 'presente'}
                </div>
                <h3 className="font-heading text-base font-semibold uppercase tracking-wide mb-1 leading-tight">
                  {conflict.name}
                </h3>
                <p className="font-mono text-xs text-muted-foreground mb-3">{conflict.theater}</p>
                <p className="text-xs text-secondary-foreground leading-relaxed line-clamp-2">
                  {conflict.description}
                </p>
              </div>
            </button>)}
        </div>
      </section>
      <footer className="border-t border-border bg-muted/20">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-heading text-sm tracking-widest text-muted-foreground uppercase">
            Synapse-Militaria
          </div>
          <div className="font-mono text-xs text-muted-foreground text-center sm:text-right">
            Proyecto académico · Ingeniería Civil Informática · Universidad de Valparaíso
            <a href="/images/CREDITOS.md" target="_blank" rel="noreferrer" className="block mt-2 text-primary underline">Créditos de imágenes y fuentes</a>
          </div>
        </div>
      </footer>
    </main>;
}
