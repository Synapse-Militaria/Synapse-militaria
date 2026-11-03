# Synapse-Militaria

Enciclopedia de armamento histórico con React, Vite y Tailwind CSS. El frontend utiliza una API de Express y MongoDB o los datos locales de presentación.

## Funcionalidades del frontend

| Pantalla | Funciones implementadas |
| --- | --- |
| Inicio | Buscador, armas destacadas, contadores y accesos al catálogo por categoría o conflicto. |
| Enciclopedia | Búsqueda por nombre, designación, descripción, país, calibre y otros datos de la ficha. Filtros combinables por categoría, país, conflicto y rango de años. Ordenamiento por nombre, año o cantidad de conflictos. |
| Consultas | Reporte de armas por país con filtros de año, tipo y mínimo de armas; agregación real de MongoDB con JOIN y agrupación. |
| Ficha del arma | Descripción histórica, especificaciones, galería ampliable, fuentes enlazadas y línea de tiempo de conflictos. |
| Ingreso administrativo | Formulario de correo y contraseña, mensajes de error y acceso al panel. |
| Panel administrativo | Creación, edición y eliminación de armas, conflictos, países/facciones y referencias. Confirmación de guardado y ventana de confirmación al eliminar. |

La búsqueda ignora mayúsculas y tildes. Cuando no hay coincidencias, muestra un estado vacío con un botón para restablecer todos los filtros.

La navegación utiliza las rutas `/`, `/enciclopedia`, `/consultas`, `/arma/:id`, `/admin/login` y `/admin`, sin recargar la página. Se pueden usar los botones Atrás y Adelante del navegador.

La pestaña Referencias edita las fuentes embebidas en las armas o los conflictos. La marca de fuente revisada se selecciona manualmente; no existe una verificación automática de su contenido.

## Exportación

**CSV:** descarga un archivo con los metadatos, especificaciones, eventos, multimedia y referencias de la ficha.

**PDF:** abre la impresión del navegador con los estilos de la ficha. El usuario selecciona **Guardar como PDF**. No es una descarga directa de un PDF generado por el servidor.

## Datos, sesión y simulaciones

Al iniciar, la página muestra 27 fichas locales, 12 conflictos y 8 países, y consulta la API. El catálogo abarca ocho categorías, desde armas blancas y artillería hasta vehículos blindados, con fotografías de archivo y fuentes enlazadas. El inicio presenta ocho armas destacadas y todos los conflictos en orden cronológico. Si responden los catálogos de armas, países y conflictos, utiliza esos datos, incluso cuando el catálogo está vacío. En ese modo, las operaciones del panel se envían a la API autenticada y se guardan en MongoDB.

Si la API no responde, se mantiene el modo de presentación. En ese modo el ingreso es simulado y los cambios del panel quedan en memoria: se pierden al recargar la página. El aviso permite reintentar la conexión; pide confirmación antes de reemplazar cambios locales y los conserva si la reconexión falla. Al reconectar, se requiere ingresar nuevamente para administrar MongoDB. El timeout predeterminado es de 6000 ms y puede configurarse con `VITE_API_TIMEOUT_MS` en `frontend/.env.local`.

La sesión del frontend está en memoria. Termina al recargar, al cerrar sesión, tras 15 minutos de inactividad o al vencer su duración máxima de 30 minutos.

Las sesiones del backend se guardan en MongoDB con el hash del token y un índice TTL. La API comprueba el vencimiento y que el administrador siga activo antes de autorizar cambios. El login permite cinco intentos por IP cada quince minutos; el límite se desactiva con `NODE_ENV=test`. El almacenamiento de sesiones en memoria y la ejecución sin transacción se reservan a las pruebas sin soporte de MongoDB, no al servidor de producción.

La API ofrece consultas individuales en `GET /api/paises/:id` y `GET /api/conflictos/:id`. Su búsqueda de armas consulta nombre, designación, descripción, etiquetas, calibre, país y conflicto con expresiones regulares escapadas que toleran tildes. Las operaciones compuestas del catálogo usan transacciones y requieren el replica set configurado en Compose; la actualización de armas asociadas a un conflicto se escribe en un solo lote.

La recuperación de contraseña es una simulación: valida el formato del correo y muestra una confirmación. No guarda una solicitud, no genera tokens de recuperación, no envía correos y no cambia contraseñas.

Las tipografías y las fotografías originales se sirven localmente desde `frontend/public/`. Las 18 fotografías de la ampliación se cargan desde Wikimedia Commons y requieren conexión a internet; no se descargaron porque la autorización de red no se completó. Los créditos de todas las fotos están en `frontend/public/images/CREDITOS.md` y las licencias de tipografías en `frontend/public/fonts/LICENCIAS.txt`. Las fuentes históricas se consultan desde los enlaces de cada ficha.

## Instalar y ejecutar desde otra copia

Requiere Node.js 22.12 o superior y Docker Desktop iniciado, o una instalación de MongoDB accesible. Los comandos siguientes son para PowerShell en Windows; en Linux o macOS se usa `npm` en lugar de `npm.cmd`.

Desde la raíz del repositorio, instalar las versiones de los archivos de bloqueo y crear la configuración local:

```powershell
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Para crear MongoDB con la configuración incluida:

```powershell
docker compose up -d mongodb
docker compose ps
```

Esperar a que el servicio aparezca como `healthy`. MongoDB 8.0 queda disponible solo en `127.0.0.1:27017`, con el volumen persistente `synapse_militaria_mongo`. Compose inicia automáticamente el replica set de un nodo `rs0` y espera a que sea primario para permitir las transacciones de la API. Si este equipo tiene el contenedor anterior `synapse-militaria-mongo`, detenerlo con `docker stop synapse-militaria-mongo` antes de iniciar Compose; ambos usan el mismo puerto y volumen, y el arranque anterior no habilita el replica set. También se puede usar una instalación propia con soporte de transacciones y configurar su dirección en `MONGO_URI` de `.env`. Si `.env` ya existía, revisar su URI contra `.env.example`; este archivo no se reemplaza automáticamente.

Cargar el catálogo inicial e iniciar la API:

```powershell
npm.cmd run seed
npm.cmd start
```

El seed incorpora las 27 armas, 8 países, 12 conflictos y la cuenta administrativa; conserva los documentos que ya existían. También añade las nuevas relaciones y referencias sin duplicarlas ni reemplazar las fichas editadas. Para ampliar una base existente, volver a ejecutar `npm.cmd run seed` y recargar la página. La cuenta local de demostración es `admin@synapse-militaria.cl` / `admin123`. Se puede elegir otra cuenta mediante `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env` antes de la primera carga; el seed no cambia la contraseña de una cuenta existente. La contraseña se almacena con scrypt y las credenciales no aparecen en el formulario de ingreso.

En una segunda terminal, desde la raíz:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Abrir http://localhost:5173. La API queda en http://localhost:3000; `GET /` debe indicar `Online`. Si Vite elige otro puerto, configurar ese origen en `FRONTEND_ORIGINS` del backend. Para una API en otra dirección, crear `frontend/.env.local` con `VITE_API_URL=http://servidor:3000/api` y reiniciar Vite. Después de cargar MongoDB o iniciar la API, recargar el frontend antes de editar y comprobar que el panel indique conexión con MongoDB.

Para ver únicamente el modo de presentación, basta con ejecutar los tres comandos del frontend. Sus cambios no persisten y no sirven como prueba de la base de datos.

En las siguientes sesiones, iniciar MongoDB con el mismo método elegido, ejecutar `npm.cmd start` desde la raíz y `npm.cmd run dev` desde `frontend/`. Para detener el servicio creado con Compose conservando sus datos, usar `docker compose stop mongodb`.

## Respaldos diarios

Con MongoDB administrado por Compose y el catálogo cargado, ejecutar `docker compose up -d respaldos`. El servicio crea una copia completa comprimida de la base `synapse-militaria` al arrancar y después cada 24 horas mientras Docker y el equipo estén encendidos. Los archivos se guardan en `backups/`, excluido de Git. Después de completar un respaldo, elimina las copias terminadas de más de 15 días mediante `RETENTION_DAYS`; los archivos `.partial` se conservan para diagnosticar fallos. Los fallos se registran y se reintentan cada minuto; un archivo `.partial` no es un respaldo terminado.

La configuración queda incluida en el repositorio, pero su presencia no significa que el servicio esté activo. Comprobar `docker compose logs --tail 30 respaldos` y verificar que existan archivos completos `*.archive.gz` en `backups/`. La creación y restauración de una copia real todavía deben validarse.

## Comprobaciones realizadas

Desde `frontend/`: `npm.cmd test`, `npm.cmd run lint` y `npm.cmd run build`.

Las pruebas del frontend comprueban los datos, relaciones, fotografías locales, CSV, pantallas, reportes y filtros por años, categoría y conflicto. Las del backend comprueban modelos, autenticación, sincronización, ampliación del seed y el contrato HTTP del reporte con modelos simulados.

Desde la raíz: `npm.cmd test` comprueba la lógica del backend con modelos simulados y `npm.cmd run seed -- --check` valida los datos iniciales sin conectarse a MongoDB.

Se conservan evidencias previas de 26 comprobaciones con MongoDB real y 34 en navegador, incluyendo formularios, persistencia tras reiniciar Express, modos online y presentación, sesión, exportaciones y vistas a 320 y 375 px. La creación, edición y eliminación se comprobaron entonces contra una base real; los registros temporales se retiraron al terminar. Estas evidencias no acreditan la ejecución real del nuevo reporte agregado, que todavía debe probarse con MongoDB conectado.

En esta prueba local, las 306 lecturas HTTP de la API quedaron bajo un segundo, con un máximo de 13,883 ms. En veinte cargas del build, el mayor tiempo hasta interfaz lista fue 486,2 ms. Son resultados de este equipo con nueve armas y un cliente; no garantizan el mismo rendimiento con otras redes, equipos o volúmenes de datos.

Las once capturas completas y móviles, los resultados detallados y ejemplos de CSV/PDF están en [evidencias/README.md](evidencias/README.md). La herramienta temporal de navegador se usó fuera de las dependencias del proyecto y se retiró al terminar.
