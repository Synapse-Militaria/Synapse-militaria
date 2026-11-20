const neon = require('../neon');
const { errorHTTP, crearHash } = require('./armaController');
const { validarCuenta, normalizarEmail } = require('../utils/validarCuenta');

// Gestión de cuentas de administrador en PostgreSQL (Neon). Las rutas exigen auth.autenticar y requerirRol.
const ROLES_PERMITIDOS = ['Administrador General', 'Administrador'];
const NO_DISPONIBLE = 'Servicio de cuentas no disponible temporalmente.';

async function consultar(sql, params) {
  if (!neon.pool) throw errorHTTP(503, NO_DISPONIBLE);
  try {
    return await neon.query(sql, params);
  } catch (error) {
    // 23505: violación de UNIQUE. En usuarios, el único campo único que se inserta es el email.
    if (error.code === '23505') throw errorHTTP(409, 'Ya existe una cuenta con ese correo.');
    // No se exponen detalles internos, URIs ni mensajes del driver de Postgres.
    throw errorHTTP(503, NO_DISPONIBLE);
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

module.exports = { listar, crear };
