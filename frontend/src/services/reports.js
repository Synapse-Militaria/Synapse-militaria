// Equivalente local exclusivamente para la presentación sin conexión.
// El modo online solicita la agregación al backend; no utiliza esta función.
function roundYear(value) {
  // MongoDB $round resuelve los empates hacia el dígito par más cercano.
  const scaled = value * 10
  const lower = Math.floor(scaled)
  if (Math.abs(scaled - lower - 0.5) < Number.EPSILON * Math.abs(scaled) * 2) return (lower % 2 === 0 ? lower : lower + 1) / 10
  return Math.round(scaled) / 10
}

export function demoCountryReport(weapons, countries, { anio_desde, minimo, tipo }) {
  const groups = new Map()
  for (const weapon of weapons) {
    if (weapon.activo_en_catalogo !== true || weapon.anio_creacion == null || weapon.anio_creacion < Number(anio_desde) || (tipo && weapon.tipo_arma !== tipo)) continue
    const country = countries.find(item => item._id === weapon.pais_origen?.id_pais)
    const key = country?._id || null
    const group = groups.get(key) || { id_pais: key, pais: country?.nombre || 'Sin país asociado', total_armas: 0, anio_promedio: 0, tipos: [], armas: [] }
    group.total_armas += 1
    group.anio_promedio += weapon.anio_creacion
    if (!group.tipos.includes(weapon.tipo_arma)) group.tipos.push(weapon.tipo_arma)
    group.armas.push({ id: weapon._id, nombre: weapon.nombre, anio_creacion: weapon.anio_creacion })
    groups.set(key, group)
  }
  return [...groups.values()].filter(group => group.total_armas >= Number(minimo))
    .map(group => ({ ...group, anio_promedio: roundYear(group.anio_promedio / group.total_armas) }))
    .sort((a, b) => b.total_armas - a.total_armas || a.pais.localeCompare(b.pais))
}
