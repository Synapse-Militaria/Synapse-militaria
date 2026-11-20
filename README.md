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
| Crear cuenta | Formulario de registro (nombre, correo y contraseña) que crea una cuenta con rol Usuario e inicia la sesión. |
| Panel administrativo | Creación, edición y eliminación de armas, conflictos, países/facciones y referencias. Confirmación de guardado y ventana de confirmación al eliminar. |

En Consultas, el botón **Descargar CSV** exporta el reporte de armas por país que está en pantalla como listado cruzado (una fila por arma con el país, su total, año promedio y tipos), en modo online o local, con un nombre de archivo según los filtros aplicados.

La búsqueda ignora mayúsculas y tildes. Cuando no hay coincidencias, muestra un estado vacío con un botón para restablecer todos los filtros.

La navegación utiliza las rutas `/`, `/enciclopedia`, `/consultas`, `/arma/:id`, `/ingresar` (o `/admin/login`), `/registro` y `/admin`, sin recargar la página. Se pueden usar los botones Atrás y Adelante del navegador.

El menú principal adapta sus opciones según el rol de la sesión: sin sesión muestra **Iniciar sesión**; con sesión muestra el nombre y rol (`nombre · rol`) junto a **Cerrar sesión**, y habilita **Panel Admin** únicamente para cuentas con rol `Administrador` o `Administrador General`.

La pestaña Referencias edita las fuentes embebidas en las armas o los conflictos. La marca de fuente revisada se selecciona manualmente; no existe una verificación automática de su contenido.

## Exportación

**CSV:** descarga un archivo con los metadatos, especificaciones, eventos, multimedia y referencias de la ficha.

**PDF:** abre la impresión del navegador con los estilos de la ficha. El usuario selecciona **Guardar como PDF**. No es una descarga directa de un PDF generado por el servidor.

## Datos, sesión y simulaciones

Al iniciar, la página muestra 27 fichas locales, 12 conflictos y 8 países, y consulta la API. El catálogo abarca ocho categorías, desde armas blancas y artillería hasta vehículos blindados, con fotografías de archivo y fuentes enlazadas. El inicio presenta ocho armas destacadas y todos los conflictos en orden cronológico. Si responden los catálogos de armas, países y conflictos, utiliza esos datos, incluso cuando el catálogo está vacío. En ese modo, las operaciones del panel se envían a la API autenticada y se guardan en MongoDB.

Si la API no responde, se mantiene el modo de presentación. En ese modo el ingreso se realiza con el botón **Entrar en modo demostración** y los cambios del panel quedan en memoria: se pierden al recargar la página. El aviso permite reintentar la conexión; pide confirmación antes de reemplazar cambios locales y los conserva si la reconexión falla. Al reconectar, se requiere ingresar nuevamente para administrar MongoDB. En producción, la API se busca en `/api` del mismo dominio si no se define `VITE_API_URL`. El timeout predeterminado es de 15000 ms y puede configurarse con `VITE_API_TIMEOUT_MS` en `frontend/.env.local`.

La sesión del frontend está en memoria. Termina al recargar, al cerrar sesión, tras 15 minutos de inactividad o al vencer su duración máxima de 30 minutos.

La API ofrece consultas individuales en `GET /api/paises/:id` y `GET /api/conflictos/:id`. Su búsqueda de armas consulta nombre, designación, descripción, etiquetas, calibre, país y conflicto con expresiones regulares escapadas que toleran tildes. Las operaciones compuestas del catálogo usan transacciones y requieren el replica set configurado en Compose; la actualización de armas asociadas a un conflicto se escribe en un solo lote.

Las tipografías y las fotografías originales se sirven localmente desde `frontend/public/`. Las 18 fotografías de la ampliación se cargan desde Wikimedia Commons y requieren conexión a internet; no se descargaron porque la autorización de red no se completó. Los créditos de todas las fotos están en `frontend/public/images/CREDITOS.md` y las licencias de tipografías en `frontend/public/fonts/LICENCIAS.txt`. Las fuentes históricas se consultan desde los enlaces de cada ficha.

### Inicio de sesión con JWT

El inicio de sesión (`POST /api/auth/login`) busca la cuenta activa (`cuenta_activa = true`) en la tabla `usuarios` de PostgreSQL (Neon) mediante un `JOIN` con `roles`, compara la clave con `scrypt` (`timingSafeEqual`), actualiza `ultimo_acceso` y entrega un JWT. El frontend lo guarda solo en memoria y lo envía en cada solicitud protegida como `Authorization: Bearer <token>`. En cada ruta protegida, la API verifica la firma y vigencia del token y vuelve a consultar en PostgreSQL que la cuenta siga activa; `auth.autenticar` no revisa el rol. En las rutas que exigen un rol, `requerirRol` lo comprueba a continuación y responde 403 si la cuenta no lo tiene. Las colecciones `Administradores` y `Sesiones` de MongoDB ya no las usa el login; solo se leen en `npm.cmd run migrar:admin` para bases antiguas.

| Ruta | Autenticación | Rol requerido | Descripción |
| --- | --- | --- | --- |
| `POST /api/auth/login` | Sin token (con límite de intentos) | Ninguno | Valida credenciales en PostgreSQL, actualiza `ultimo_acceso` y emite el JWT. |
| `POST /api/auth/registro` | Sin token (con límite de intentos propio) | Ninguno | Crea una cuenta activa con el rol Usuario, guarda la clave con `scrypt` y emite el JWT. |
| `POST /api/auth/logout` | Requiere `Bearer <token>` | Cualquiera (cuenta activa) | Confirma el cierre de sesión para que el frontend descarte el token en memoria. |
| `POST /api/auth/recuperar` | Sin token (simulación) | Ninguno | Simulación académica de recuperación de contraseña. |
| `POST /api/armas`, `PUT /api/armas/:id`, `DELETE /api/armas/:id` | Requiere `Bearer <token>` | Administrador General o Administrador | Creación, edición y eliminación de armas. |
| `POST /api/paises`, `PUT /api/paises/:id`, `DELETE /api/paises/:id` | Requiere `Bearer <token>` | Administrador General o Administrador | Creación, edición y eliminación de países o facciones. |
| `POST /api/conflictos`, `PUT /api/conflictos/:id`, `DELETE /api/conflictos/:id` | Requiere `Bearer <token>` | Administrador General o Administrador | Creación, edición y eliminación de conflictos. |

Ejemplo de inicio de sesión en PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"email":"admin@ejemplo.cl","password":"clave-ficticia-de-prueba"}'
```

Ejemplo de respuesta (`{ success, data: { token, email, nombre, rol, expiresAt } }`):

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "email": "admin@ejemplo.cl",
    "nombre": "Administrador",
    "rol": "Administrador General",
    "expiresAt": 1763331600000
  }
}
```

**Contenido del token y roles:**
- El payload del JWT contiene `sub` (id del usuario), `email`, `rol` y `exp` (además de `iat`), firmado con `HS256` y una duración de 30 minutos. Nunca lleva la contraseña ni el hash (`password_hash`), y `expiresAt` se entrega en milisegundos.
- Solo los roles `'Administrador General'` y `'Administrador'` pueden modificar el catálogo. Cualquier otro rol recibe `403`.

| Código | Caso | Mensaje exacto del código |
| --- | --- | --- |
| `400` | Datos inválidos en el login (correo o contraseña ausentes, no texto o fuera de largo) | `Ingresa un correo y una contraseña válidos.` |
| `400` | Datos inválidos en recuperación de contraseña | `Ingresa un correo electrónico válido.` |
| `401` | Credenciales inválidas o cuenta inactiva en el login | `Credenciales inválidas. Acceso denegado.` |
| `401` | Sesión vencida, token inválido o cuenta desactivada en rutas protegidas | `La sesión venció. Inicia sesión nuevamente.` |
| `403` | Rol sin permiso para modificar el catálogo | `No tienes permiso para esta acción.` |
| `429` | Demasiados intentos de login (incluye el encabezado `Retry-After`) | `Demasiados intentos de ingreso. Inténtalo de nuevo en 15 minutos.` |
| `503` | PostgreSQL no disponible en el login o en rutas protegidas | `Servicio de autenticación no disponible temporalmente.` |

**Configuración de `JWT_SECRET`:**
- En producción (`NODE_ENV=production` o Vercel) es obligatoria y debe tener 32 caracteres o más; si falta o tiene menos de 32 caracteres, el login falla.
- En local es opcional: sin ella se usa una clave temporal en memoria, se muestra una advertencia en consola y los tokens dejan de servir al reiniciar el backend.

**Limitaciones:**
- El logout no invalida el token en el servidor: sigue siendo válido hasta que vence (30 minutos) y el frontend lo descarta de la memoria al cerrar sesión.
- El límite de 5 intentos por IP cada 15 minutos cuenta todos los intentos, vive en memoria, se reinicia al reiniciar el backend (se desactiva con `NODE_ENV=test`) y en Vercel no se comparte entre instancias.
- La recuperación de contraseña sigue siendo una simulación: valida el formato del correo y muestra una confirmación, pero no guarda una solicitud, no genera tokens de recuperación, no envía correos y no cambia contraseñas.

## Cuentas y roles

Las cuentas están en las tablas `usuarios` y `roles` de PostgreSQL (Neon). Cualquier cuenta activa puede iniciar sesión; los permisos dependen de su rol:

| Rol | Qué puede hacer |
| --- | --- |
| Usuario | Iniciar y cerrar sesión. Consulta el catálogo como cualquier visitante; recibe 403 al intentar modificar el catálogo o gestionar cuentas. |
| Administrador | Lo mismo que un Usuario, más crear, editar y eliminar armas, conflictos y países/facciones. |
| Administrador General | Lo mismo que un Administrador, más gestionar cuentas en `/api/usuarios`: listarlas, crear administradores, activarlas o desactivarlas, cambiar su rol y eliminarlas. No puede modificar su propia cuenta y siempre debe quedar al menos un Administrador General activo. |

El registro público (`POST /api/auth/registro`, con `nombre`, `email` y `password`) siempre crea una cuenta activa con el rol **Usuario** e inicia la sesión con la misma respuesta que el login. Ignora cualquier `rol`, `rol_id` o `cuenta_activa` enviado en el body, aplica las mismas reglas de contraseña que el seed y tiene su propio límite de 5 intentos por IP cada 15 minutos, separado del login.

Solo el Administrador General puede ascender una cuenta a Administrador, con `PATCH /api/usuarios/:id` y el body `{"rol":"Administrador"}`. Con `{"rol":"Usuario"}` se le quita ese rol.

## Instalar y ejecutar desde otra copia

Requiere Node.js 22.12 o superior y Docker Desktop iniciado, o una instalación de MongoDB accesible. Los comandos siguientes son para PowerShell en Windows; en Linux o macOS se usa `npm` en lugar de `npm.cmd`.

Desde la raíz del repositorio, instalar las versiones de los archivos de bloqueo y crear la configuración local:

```powershell
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Definir `JWT_SECRET` en `.env` (mínimo 32 caracteres; opcional en local y obligatoria en producción, ver [Inicio de sesión con JWT](#inicio-de-sesión-con-jwt)) generando una clave con el comando de `.env.example`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
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

El seed carga en MongoDB las 27 armas, 8 países y 12 conflictos; conserva los documentos que ya existían. También añade las nuevas relaciones y referencias sin duplicarlas ni reemplazar las fichas editadas. Para ampliar una base existente, volver a ejecutar `npm.cmd run seed` y recargar la página. La cuenta de administrador se crea en PostgreSQL (Neon) solo si se definen `ADMIN_EMAIL` y `ADMIN_PASSWORD` (12 caracteres o más) en `.env`; no existe una contraseña por defecto, y el seed no cambia la contraseña de una cuenta que ya existe. Como todos usan la misma base de Neon, una cuenta creada en local también existe en la página publicada. La contraseña se almacena con scrypt y las credenciales no aparecen en el formulario de ingreso.

En una segunda terminal, desde la raíz:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Abrir http://localhost:5173. La API queda en http://localhost:3000; `GET /` debe indicar `Online`. Si Vite elige otro puerto, configurar ese origen en `FRONTEND_ORIGINS` del backend. Para una API en otra dirección, crear `frontend/.env.local` con `VITE_API_URL=http://servidor:3000/api` y reiniciar Vite. Después de cargar MongoDB o iniciar la API, recargar el frontend antes de editar y comprobar que el panel indique conexión con MongoDB.

Para ver únicamente el modo de presentación, basta con ejecutar los tres comandos del frontend. Sus cambios no persisten y no sirven como prueba de la base de datos.

En las siguientes sesiones, iniciar MongoDB con el mismo método elegido, ejecutar `npm.cmd start` desde la raíz y `npm.cmd run dev` desde `frontend/`. Para detener el servicio creado con Compose conservando sus datos, usar `docker compose stop mongodb`.

### Usar MongoDB Atlas

Con Atlas no se necesita Docker; se omiten los comandos de `docker compose`.

1. Copiar `.env.example` a `.env` si aún no existe.
2. Reemplazar `MONGO_URI` por la URI de conexión de Atlas, con el formato del comentario de `.env.example`. La URI debe incluir `/synapse-militaria` antes del `?`; si se omite, los datos quedan en otra base. Si la clave contiene caracteres como `@`, `:`, `/`, `?` o `#`, escribirlos codificados (por ejemplo, `@` como `%40`).
3. Definir `ADMIN_PASSWORD` con una clave propia de 12 caracteres o más antes de cargar los datos. Para crear la cuenta también hace falta `NEON_URI` (ver [Usar Neon (PostgreSQL)](#usar-neon-postgresql)).
4. Ejecutar `npm.cmd run seed` una sola vez para crear el catálogo en MongoDB y la cuenta administrativa en PostgreSQL (Neon).
5. Iniciar la API con `npm.cmd start` y el frontend como se indicó arriba.

Si aparece el error `querySrv ECONNREFUSED`, ocurre cuando la red local no resuelve las consultas DNS de tipo SRV que usa la cadena `mongodb+srv://`. Se soluciona usando en `MONGO_URI` la cadena estándar (Atlas → Connect → Drivers → interruptor "Legacy URI String"), que empieza con `mongodb://` y trae las direcciones de los servidores escritas.

El archivo `.env` contiene la URI con la clave y está en `.gitignore`: nunca se sube al repositorio.

### Usar Neon (PostgreSQL)

El proyecto reparte la información entre dos motores:
- **PostgreSQL (Neon):** guarda las cuentas (usuarios y roles; la tabla `favoritos` está preparada).
- **MongoDB:** guarda el catálogo (armas, países y conflictos).

1. Crear el proyecto en [Neon](https://neon.tech) y colocar su cadena de conexión en `NEON_URI` del `.env`:
   ```text
   NEON_URI=postgresql://USUARIO:CLAVE@HOST/neondb?sslmode=require
   ```
   Si la clave contiene caracteres especiales (como `@`, `:`, `/`, `?` o `#`), deben escribirse codificados (por ejemplo, `@` como `%40`).

2. Aplicar `database/schema.sql` en el editor SQL de Neon. Se puede repetir sin riesgo (`IF NOT EXISTS` en tablas, columnas e índices, y `ON CONFLICT DO NOTHING` en los roles iniciales) y hay que repetirlo cada vez que el schema cambie.

3. Solo para bases creadas antes de que el seed creara la cuenta directamente en PostgreSQL: migrar la cuenta de administrador con:
   ```powershell
   npm.cmd run migrar:admin
   ```
   En una instalación nueva no hace falta, porque ahora `npm.cmd run seed` crea la cuenta directamente en PostgreSQL. Este comando copia las cuentas de administrador de MongoDB (colección `Administradores`) a la tabla `usuarios` de PostgreSQL (Neon), asignándoles su rol correspondiente (`Administrador General` o `Administrador`). Necesita `MONGO_URI` y `NEON_URI` en el `.env` (o en las variables de entorno). Las cuentas que ya existen (mismo email) no se tocan. Al terminar, muestra un resumen con las cuentas leídas en MongoDB, insertadas en PostgreSQL, ya existentes y omitidas (por email o hash inválido), y advierte si no hay ningún Administrador General activo.

4. Comprobar en `/api/estado` (en local en `http://localhost:3000/api/estado` y en el link de Vercel en `https://tu-proyecto.vercel.app/api/estado`) que las dos bases digan "conectada":
   ```json
   { "success": true, "bases": { "mongodb": "conectada", "postgresql": "conectada" } }
   ```

**Seguridad:**
- La conexión verifica el certificado SSL (`ssl: { rejectUnauthorized: true }`); la app ignora el `sslmode` de la URI.
- `NEON_URI` nunca se sube al repositorio (está en `.env`, excluido en `.gitignore`).
- Si la clave se expone, hay que cambiarla en Neon y actualizarla en cada `.env` y en Vercel.

## Respaldos diarios

Con MongoDB administrado por Compose y el catálogo cargado, ejecutar `docker compose up -d respaldos`. El servicio crea una copia completa comprimida de la base `synapse-militaria` al arrancar y después cada 24 horas mientras Docker y el equipo estén encendidos. Los archivos se guardan en `backups/`, excluido de Git. Después de completar un respaldo, elimina las copias terminadas de más de 15 días mediante `RETENTION_DAYS`; los archivos `.partial` se conservan para diagnosticar fallos. Los fallos se registran y se reintentan cada minuto; un archivo `.partial` no es un respaldo terminado.

La configuración queda incluida en el repositorio, pero su presencia no significa que el servicio esté activo. Comprobar `docker compose logs --tail 30 respaldos` y verificar que existan archivos completos `*.archive.gz` en `backups/`. La creación y restauración de una copia real todavía deben validarse.

## Comprobaciones realizadas

Desde `frontend/`: `npm.cmd test`, `npm.cmd run lint` y `npm.cmd run build`.

Las pruebas del frontend comprueban los datos, relaciones, fotografías locales, CSV, pantallas, reportes y filtros por años, categoría y conflicto. Las del backend comprueban modelos, autenticación, sincronización, ampliación del seed y el contrato HTTP del reporte con modelos simulados.

Desde la raíz: `npm.cmd test` comprueba la lógica del backend con modelos simulados y `npm.cmd run seed -- --check` valida los datos iniciales sin conectarse a MongoDB.

## Desplegar en Vercel

El proyecto está configurado para desplegarse en Vercel: `vercel.json` construye el frontend con Vite y publica la API como función serverless en `/api`.

### Requisitos

- Cuenta en [Vercel](https://vercel.com)
- Base de datos en [MongoDB Atlas](https://www.mongodb.com/atlas) (para el catálogo)
- Base de datos en [Neon](https://neon.tech) (PostgreSQL para cuentas y autenticación)

### Configuración en Vercel

1. Importar el repositorio en Vercel desde el dashboard.
2. En los ajustes del proyecto:
   - **Root Directory:** dejar la carpeta principal (la raíz del repositorio, no `frontend`), porque `vercel.json` construye el frontend con Vite (`cd frontend && npm ci && npm run build` hacia `frontend/dist`) y publica la API como función en `/api`.
   - **Framework Preset:** seleccionar **Other** (o `None`), permitiendo que `vercel.json` gestione la compilación y las rutas.
3. Configurar las **Environment Variables** en Vercel (Settings → Environment Variables), marcándolas para los entornos **Production** y **Preview**:

   | Variable | Valor |
   | --- | --- |
   | `MONGO_URI` | Cadena de conexión a MongoDB Atlas (sirve la cadena `mongodb+srv://...` o la estándar `mongodb://...`). |
   | `NEON_URI` | Cadena de conexión a Neon PostgreSQL (`postgresql://USUARIO:CLAVE@HOST/neondb?sslmode=require`). |
   | `JWT_SECRET` | Clave aleatoria para firmar los JWT (mínimo 32 caracteres). Para generarla en PowerShell:<br>`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `FRONTEND_ORIGINS` | *(Opcional)* No hace falta cuando el frontend y la API están en el mismo dominio (en Vercel las peticiones van a `/api` de forma relativa). Solo es necesaria si el frontend y la API se alojaran en dominios distintos. |

   *(Nota: `ADMIN_EMAIL` y `ADMIN_PASSWORD` no van en esta tabla, porque en producción el código no las usa; solo las utiliza el seed).*

4. Hacer el despliegue (Deploy).

### Flujo de despliegues y ramas

- Cada push a `main` actualiza la página oficial.
- Las otras ramas crean una versión de prueba (**Preview**) con otro link para validar cambios.
- Si se cambia o agrega una variable de entorno, hay que hacer **Redeploy**.
- Mantener el repositorio **público**, porque en el plan Hobby de Vercel los commits de otros integrantes se bloquean si el repositorio es privado.

### Seguridad

- Las variables de entorno se configuran **solo en el dashboard de Vercel**, nunca en el código ni en el repositorio.
- Los headers de seguridad (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) se aplican automáticamente mediante `vercel.json`.
- Los errores 500 en producción no exponen detalles internos ni stack traces.
- El archivo `.env` está en `.gitignore` y nunca se sube al repositorio.
- Las variables `VITE_*` del frontend se inyectan en build time y son públicas: no poner secretos en ellas.

### Ejecución del seed en producción

El seed no se ejecuta automáticamente en Vercel. Para cargar los datos iniciales en Atlas, ejecutar localmente apuntando a la URI de Atlas:

```powershell
$env:MONGO_URI="mongodb+srv://USUARIO:CLAVE@CLUSTER.mongodb.net/synapse-militaria?retryWrites=true&w=majority"
$env:NEON_URI="postgresql://USUARIO:CLAVE@HOST/neondb?sslmode=require"
$env:ADMIN_EMAIL="admin@tu-dominio.cl"
$env:ADMIN_PASSWORD="contraseña-segura-de-produccion"
npm.cmd run seed
```

> **Advertencia:** El seed ya no crea cuentas con contraseña por defecto. Si faltan `ADMIN_EMAIL`, `ADMIN_PASSWORD` o `NEON_URI`, o si la clave tiene menos de 12 caracteres, es `admin123` o contiene la parte del correo antes de la @, carga el catálogo pero no crea la cuenta y explica el motivo. Como la base de Neon es la misma en local y en producción, la cuenta que se cree queda activa en la página publicada.

Solo para bases creadas antes de que el seed creara la cuenta directamente en PostgreSQL: ejecutar la migración para copiar la cuenta de administrador de MongoDB a PostgreSQL en Neon (en una instalación nueva no hace falta):

```powershell
$env:NEON_URI="postgresql://USUARIO:CLAVE@HOST/neondb?sslmode=require"
npm.cmd run migrar:admin
```

Se conservan evidencias previas de 26 comprobaciones con MongoDB real y 34 en navegador, incluyendo formularios, persistencia tras reiniciar Express, modos online y presentación, sesión, exportaciones y vistas a 320 y 375 px. La creación, edición y eliminación se comprobaron entonces contra una base real; los registros temporales se retiraron al terminar. Estas evidencias no acreditan la ejecución real del nuevo reporte agregado, que todavía debe probarse con MongoDB conectado.

En esta prueba local, las 306 lecturas HTTP de la API quedaron bajo un segundo, con un máximo de 13,883 ms. En veinte cargas del build, el mayor tiempo hasta interfaz lista fue 486,2 ms. Son resultados de este equipo con nueve armas y un cliente; no garantizan el mismo rendimiento con otras redes, equipos o volúmenes de datos.

Las once capturas completas y móviles, los resultados detallados y ejemplos de CSV/PDF están en [evidencias/README.md](evidencias/README.md). La herramienta temporal de navegador se usó fuera de las dependencias del proyecto y se retiró al terminar.
