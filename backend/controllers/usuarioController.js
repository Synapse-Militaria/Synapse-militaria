const neon = require('../neon');
const { errorHTTP, crearHash } = require('./armaController');
const { validarCuenta, normalizarEmail } = require('../utils/validarCuenta');

// Gestión de cuentas de administrador en PostgreSQL (Neon). Las rutas exigen auth.autenticar y requerirRol.
const ROLES_PERMITIDOS = ['Administrador General', 'Administrador'];
// Se acepta 'Usuario' para que el Administrador General pueda ascender a un usuario registrado a administrador, o quitarle ese rol a alguien.
const ROLES_ACTUALIZABLES = [...ROLES_PERMITIDOS, 'Usuario'];
const NO_DISPONIBLE = 'Servicio de cuentas no disponible temporalmente.';
const ERROR_PROPIA_CUENTA = 'No puedes desactivar, cambiar el rol ni eliminar tu propia cuenta.';
const ERROR_ULTIMO_GENERAL = 'Debe quedar al menos un Administrador General activo.';
// usuarios.id es SERIAL (INTEGER de 32 bits con signo en PostgreSQL).
const MAX_ID_USUARIO = 2147483647;

const SQL_BLOQUEAR_GENERALES = "SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.nombre = 'Administrador General' AND u.cuenta_activa FOR UPDATE OF u";

const SQL_ACTUALIZAR = `UPDATE usuarios u
SET cuenta_activa = COALESCE($2, u.cuenta_activa),
    rol_id = COALESCE($3, u.rol_id)
FROM roles r
WHERE u.id = $1
  AND r.id = COALESCE($3, u.rol_id)
  AND (
    NOT (u.cuenta_activa = true AND u.rol_id = (SELECT id FROM roles WHERE nombre = 'Administrador General'))
    OR (COALESCE($2, u.cuenta_activa) = true AND r.nombre = 'Administrador General')
    OR EXISTS (
      SELECT 1 FROM usuarios otro
      JOIN roles ro ON ro.id = otro.rol_id
      WHERE otro.id <> u.id AND otro.cuenta_activa = true AND ro.nombre = 'Administrador General'
    )
  )
RETURNING u.id, u.nombre, u.email, r.nombre AS rol, u.cuenta_activa, u.ultimo_acceso, u.creado_en`;

const SQL_ELIMINAR = `DELETE FROM usuarios u
WHERE u.id = $1
  AND (
    NOT (u.cuenta_activa = true AND u.rol_id = (SELECT id FROM roles WHERE nombre = 'Administrador General'))
    OR EXISTS (
      SELECT 1 FROM usuarios otro
      JOIN roles ro ON ro.id = otro.rol_id
      WHERE otro.id <> u.id AND otro.cuenta_activa = true AND ro.nombre = 'Administrador General'
    )
  )
RETURNING u.id`;

async function consultar(sql, params, cliente = neon) {
  if (!neon.pool) throw errorHTTP(503, NO_DISPONIBLE);
  try {
    return await cliente.query(sql, params);
  } catch (error) {
    // 23505: violación de UNIQUE. En usuarios, el único campo único que se inserta es el email.
    if (error.code === '23505') throw errorHTTP(409, 'Ya existe una cuenta con ese correo.');
    // No se exponen detalles internos, URIs ni mensajes del driver de Postgres.
    throw errorHTTP(503, NO_DISPONIBLE);
  }
}

async function ejecutarEnTransaccion(operacion) {
  if (typeof neon.pool?.connect !== 'function') throw errorHTTP(503, NO_DISPONIBLE);
  let client;
  try {
    client = await neon.pool.connect();
  } catch {
    throw errorHTTP(503, NO_DISPONIBLE);
  }
  try {
    await consultar('BEGIN', undefined, client);
    // Bloquea las filas de Administradores Generales activos para serializar cambios concurrentes en READ COMMITTED.
    await consultar(SQL_BLOQUEAR_GENERALES, undefined, client);
    const resultado = await operacion(client);
    await consultar('COMMIT', undefined, client);
    return resultado;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Si la conexión falló, se preserva el error original.
    }
    throw error;
  } finally {
    client.release();
  }
}

// Se copian solo los campos públicos: password_hash nunca sale del servidor.
const cuentaPublica = fila => ({
  id: fila.id,
  nombre: fila.nombre,
  email: fila.email,
  rol: fila.rol,
  cuenta_activa: fila.cuenta_activa,
  ultimo_acceso: fila.ultimo_acceso,
  creado_en: fila.creado_en,
});

async function listar(req, res) {
  const resultado = await consultar(
    'SELECT u.id, u.nombre, u.email, r.nombre AS rol, u.cuenta_activa, u.ultimo_acceso, u.creado_en FROM usuarios u JOIN roles r ON r.id = u.rol_id ORDER BY u.creado_en, u.id'
  );
  res.json({ success: true, data: resultado.rows.map(cuentaPublica) });
}

async function crear(req, res) {
  const { nombre, email, password, rol } = req.body || {};
  const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
  if (nombreLimpio.length < 2 || nombreLimpio.length > 100) {
    throw errorHTTP(400, 'El nombre debe tener entre 2 y 100 caracteres.');
  }
  const emailNormalizado = typeof email === 'string' ? normalizarEmail(email) : email;
  const problema = validarCuenta({ email: emailNormalizado, password });
  if (problema) throw errorHTTP(400, problema);
  if (!ROLES_PERMITIDOS.includes(rol)) {
    throw errorHTTP(400, `El rol debe ser ${ROLES_PERMITIDOS.join(' o ')}.`);
  }

  const roles = await consultar('SELECT id FROM roles WHERE nombre = $1', [rol]);
  // Sin el rol en la tabla, el esquema de Neon está incompleto: se informa como servicio no disponible.
  if (!roles.rows.length) throw errorHTTP(503, NO_DISPONIBLE);

  const passwordHash = await crearHash(password);
  const resultado = await consultar(
    'INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, cuenta_activa, creado_en',
    [nombreLimpio, emailNormalizado, passwordHash, roles.rows[0].id]
  );
  const fila = resultado.rows[0];
  res.status(201).json({
    success: true,
    data: { id: fila.id, nombre: fila.nombre, email: fila.email, rol, cuenta_activa: fila.cuenta_activa, creado_en: fila.creado_en },
  });
}

function leerIdUsuario(valor) {
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) {
    throw errorHTTP(400, 'El identificador de la cuenta debe ser un entero positivo.');
  }
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0 || id > MAX_ID_USUARIO) {
    throw errorHTTP(400, 'El identificador de la cuenta debe ser un entero positivo.');
  }
  return id;
}

async function verificarCuentaNoModificada(id, client) {
  const existe = await consultar('SELECT id FROM usuarios WHERE id = $1', [id], client);
  if (!existe.rows.length) throw errorHTTP(404, 'Cuenta no encontrada.');
  throw errorHTTP(409, ERROR_ULTIMO_GENERAL);
}

async function actualizar(req, res) {
  const id = leerIdUsuario(req.params.id);
  const { cuenta_activa, rol } = req.body || {};
  if (cuenta_activa === undefined && rol === undefined) {
    throw errorHTTP(400, 'Debes indicar cuenta_activa o rol para actualizar la cuenta.');
  }
  if (cuenta_activa !== undefined && typeof cuenta_activa !== 'boolean') {
    throw errorHTTP(400, 'El campo cuenta_activa debe ser booleano.');
  }
  if (rol !== undefined && !ROLES_ACTUALIZABLES.includes(rol)) {
    throw errorHTTP(400, 'El rol debe ser Administrador General, Administrador o Usuario.');
  }
  // Se normaliza req.usuario.id con Number() por si el driver devuelve BIGINT como string.
  if (id === Number(req.usuario?.id)) {
    throw errorHTTP(400, ERROR_PROPIA_CUENTA);
  }

  const fila = await ejecutarEnTransaccion(async client => {
    let rolId = null;
    if (rol !== undefined) {
      const roles = await consultar('SELECT id FROM roles WHERE nombre = $1', [rol], client);
      if (!roles.rows.length) throw errorHTTP(503, NO_DISPONIBLE);
      rolId = roles.rows[0].id;
    }

    const resultado = await consultar(SQL_ACTUALIZAR, [id, cuenta_activa ?? null, rolId], client);
    if (!resultado.rows.length) await verificarCuentaNoModificada(id, client);
    return resultado.rows[0];
  });

  res.json({ success: true, data: cuentaPublica(fila) });
}

async function eliminar(req, res) {
  const id = leerIdUsuario(req.params.id);
  if (id === Number(req.usuario?.id)) {
    throw errorHTTP(400, ERROR_PROPIA_CUENTA);
  }

  const fila = await ejecutarEnTransaccion(async client => {
    // Sus favoritos se borran solos en PostgreSQL por el ON DELETE CASCADE de favoritos(usuario_id).
    const resultado = await consultar(SQL_ELIMINAR, [id], client);
    if (!resultado.rows.length) await verificarCuentaNoModificada(id, client);
    return resultado.rows[0];
  });

  res.json({ success: true, data: { id: fila.id } });
}

module.exports = { listar, crear, actualizar, eliminar };
