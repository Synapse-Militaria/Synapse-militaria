// Fotografías remotas de Commons: no se descargan ni se duplican en el repositorio.
// Los autores y las licencias están documentados en public/images/CREDITOS.md.
const commonsFile = title => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}?width=1280`

export const catalogImagesExtra = {
  'bayonet1907.jpg': { url: commonsFile('Bayonet, knife-sword (and scabbard) (AM 697055-6).jpg'), caption: 'Bayoneta Pattern 1907 con vaina, colección de Auckland Museum' },
  'piat.jpg': { url: commonsFile('PIAT white background.jpg'), caption: 'Lanzador PIAT; fotografía de Johan Fredriksson' },
  'mas36.jpg': { url: commonsFile('MAS Modèle 36 right side.jpg'), caption: 'MAS-36, vista lateral derecha de un ejemplar de Armémuseum' },
  'type99.jpg': { url: commonsFile('Type 99 Full View 1.JPG'), caption: 'Arisaka Type 99, fusil corto temprano; fotografía de Tom Loghrin' },
}
