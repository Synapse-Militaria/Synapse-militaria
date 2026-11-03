// Fotografías remotas de Wikimedia Commons. Las fuentes y licencias están en
// public/images/CREDITOS.md. Special:FilePath conserva el nombre del archivo
// original y deja a Wikimedia resolver la miniatura vigente.
const commons = title => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}?width=960`

export const catalogImages = {
  'smle.jpg': { url: commons('Lee-Enfield Mk III (No 1 Mk 3) - AM.032056 (LHS).jpg'), caption: 'Lee-Enfield SMLE Mk III, colección de Armémuseum, vista lateral izquierda' },
  'sten.jpg': { url: commons('Sten Mk II Mikkeli.JPG'), caption: 'Sten Mk II conservado en el Museo de Infantería de Mikkeli; fotografía de MKFI' },
  'thompson.jpg': { url: commons('ThompsonM1A1VWM.jpg'), caption: 'Thompson M1A1 del Virginia War Museum; fotografía de Mytwocents' },
  'm1carbine.jpg': { url: commons('M1 Carbine Mk I - USA - Armémuseum.jpg'), caption: 'Carabina M1 de culata fija, colección de Armémuseum' },
  'm16a1.jpg': { url: commons('M16A1 rifle.jpg'), caption: 'M16A1 del National Museum of the Marine Corps; Sgt. James Stanfield, USMC' },
  'm60.jpg': { url: commons('Machine Gun, M60.jpg'), caption: 'Ametralladora M60; fotografía del Departamento del Ejército de Estados Unidos, 1970' },
  'bren.jpg': { url: commons('Bren1.jpg'), caption: 'Bren fabricada en John Inglis, Toronto, en mayo de 1941; National Film Board of Canada' },
  'browning-m2.jpg': { url: commons("M2 Browning, Musée de l'Armée.jpg"), caption: 'Browning M2 HB del Musée de l’Armée; fotografía de Rama, CC BY-SA 3.0 Francia' },
  'ppsh41.jpg': { url: commons('PPSh-41 from soviet.jpg'), caption: 'PPSh-41 con cargador de tambor; fotografía de Lposka, CC BY-SA 3.0' },
  'fnfal.jpg': { url: commons('FN FAL rifle.JPG'), caption: 'Fusil FN FAL; fotografía de Atirador, recorte de Hohum, CC BY-SA 3.0' },
  'uzi.jpg': { url: commons('Uzi of the israeli armed forces.jpg'), caption: 'Subfusil Uzi de tamaño completo; fotografía de Uziel Galishto, CC BY-SA 3.0' },
  'canon75.jpg': { url: commons("0 Canon de 75 mm modèle 1897 - Musée de l'armée à Paris.JPG"), caption: 'Cañón de 75 mm modelo 1897 del Musée de l’Armée; Jean-Pol GRANDMONT, CC BY 4.0' },
  'luger.jpg': { url: commons('Luger P08 (6971793777).jpg'), caption: 'Pistola Luger P08; fotografía de Askild Antonsen, CC BY 2.0' },
  'webley.jpg': { url: commons('Webley-Mk-VI-p1030100.jpg'), caption: 'Revólver Webley Mk VI calibre .455; fotografía de Rama, CC BY-SA 2.0 Francia' },
}
