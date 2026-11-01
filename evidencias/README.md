# Evidencias de Synapse-Militaria

Revisión técnica realizada el 1 de noviembre de 2026. Esta carpeta contiene material para incorporar al informe; el Word y los diagramas no se modificaron.

## Capturas

Son capturas de la aplicación ejecutándose. Las páginas completas incluyen su contenido de desplazamiento; las vistas móviles muestran el área visible a 375 × 812 px.

| Archivo | Qué muestra |
| --- | --- |
| [01-inicio-escritorio.png](capturas/01-inicio-escritorio.png) | Inicio completo, buscador, catálogo destacado, categorías y conflictos. |
| [02-inicio-movil-375.png](capturas/02-inicio-movil-375.png) | Inicio móvil completo. |
| [03-catalogo-con-filtros.png](capturas/03-catalogo-con-filtros.png) | Filtros de rifle, Estados Unidos y Segunda Guerra Mundial combinados. |
| [04-busqueda-vacia.png](capturas/04-busqueda-vacia.png) | Búsqueda sin coincidencias y botón de restablecimiento. |
| [05-ficha-tecnica-completa.png](capturas/05-ficha-tecnica-completa.png) | Ficha completa del M1 Garand con especificaciones, galería, referencias y timeline. |
| [06-catalogo-movil-375.png](capturas/06-catalogo-movil-375.png) | Catálogo móvil con filtro de pistolas aplicado. |
| [07-ficha-movil-375.png](capturas/07-ficha-movil-375.png) | Ficha móvil completa. |
| [08-login-error.png](capturas/08-login-error.png) | Error de credenciales incorrectas. El correo fue ingresado durante la prueba, no es una pista del formulario. |
| [09-panel-confirmacion-verde.png](capturas/09-panel-confirmacion-verde.png) | Panel y confirmación verde después de crear Chile mediante el formulario. |
| [10-inicio-movil-375-vista.png](capturas/10-inicio-movil-375-vista.png) | Vista móvil del inicio: logo, menú y buscador. |
| [11-catalogo-movil-375-vista.png](capturas/11-catalogo-movil-375-vista.png) | Vista móvil del buscador, contador y botón de filtros, sin desbordamiento horizontal. |

Chile y las referencias añadidas durante las pruebas fueron retirados al terminar. La base final conserva nueve armas, cuatro países y cinco conflictos. Las copias temporales de fichas usadas para comprobar los formularios también fueron retiradas.

## Resultados

| Comprobación | Resultado y alcance |
| --- | --- |
| Pruebas del proyecto | 19 aprobadas: 9 backend y 10 frontend. |
| MongoDB real | 26 comprobaciones aprobadas: login, CRUD, referencias embebidas, relaciones, bloqueos de borrado, cierre de sesión y persistencia después de reiniciar Express. |
| Navegador | 34 comprobaciones aprobadas: búsquedas, filtros, ordenamiento, galería, formularios, exportaciones, sesión y vistas móviles. Sin errores JavaScript no controlados. |
| Móvil | Inicio, catálogo, ficha, panel y formulario sin desbordamiento horizontal a 320 y 375 px. Logo y menú sin colisión. |
| API | 306 lecturas HTTP secuenciales; máximo global de 13,883 ms contando primeras lecturas. |
| Build en navegador | 20 cargas en contextos nuevos; máximo de 486,2 ms hasta el contenido esperado, API y fuentes listas y dos cuadros de renderizado. |
| Calidad del código | ESLint y build aprobados. |

Entorno: Windows, Node 24.16.0, MongoDB 8.0.34 en Docker y Chrome 156.0.8078.74. Las mediciones son locales, con nueve armas y un cliente secuencial; no son una prueba de carga ni una garantía para cualquier equipo o red.

Los casos de API vacía y fallo de red se controlaron desde el navegador. La comprobación de quince minutos de inactividad adelantó su reloj de prueba; no se esperaron quince minutos reales. El resto del flujo online utilizó Express y MongoDB reales.

Los detalles están en [pruebas-api.json](pruebas-api.json) y [pruebas-frontend.json](pruebas-frontend.json). No contienen contraseñas, hashes ni tokens de autenticación.

## Exportaciones comprobadas

- [CSV del M1 Garand](exportaciones/m1-garand.csv): archivo descargado desde el botón de la ficha.
- [PDF del M1 Garand](exportaciones/m1-garand.pdf): salida de la vista de impresión, con dos páginas rasterizadas e inspeccionadas visualmente.

El botón PDF abre la impresión del navegador; no genera una descarga directa desde el servidor. La recuperación de contraseña sigue siendo una simulación explícita: no envía correos, genera enlaces ni modifica contraseñas.
