const { errorHTTP, crearHash } = require('./armaController');
const { consultar } = require('./usuarioController');
const { firmarToken } = require('../config/jwt');
const { validarCuenta, normalizarEmail } = require('../utils/validarCuenta');

// Registro público: siempre crea una cuenta activa con el rol Usuario y deja la sesión iniciada.
// Solo el Administrador General puede cambiar después el rol con PATCH /api/usuarios/:id.
const ROL_REGISTRO = 'Usuario';
const NO_DISPONIBLE = 'Servicio de cuentas no disponible temporalmente.';
const SQL_INSERTAR = 'INSERT INTO usuarios (nombre, email, password_hash, rol_id, cuenta_activa, ultimo_acceso) VALUES ($1, $2, $3, $4, true, now()) RETURNING id, nombre, email';

async function registrar(req, res) {
  // Solo se leen estos tres campos: rol, rol_id, cuenta_activa o cualquier otro se ignoran.
  const { nombre, email, password } = req.body || {};
  const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
  if (nombreLimpio.length < 2 || nombreLimpio.length > 100) {
    throw errorHTTP(400, 'El nombre debe tener entre 2 y 100 caracteres.');
  }
  const emailNormalizado = typeof email === 'string' ? normalizarEmail(email) : email;
  const problema = validarCuenta({ email: emailNormalizado, password });
  if (problema) throw errorHTTP(400, problema);

  const roles = await consultar('SELECT id FROM roles WHERE nombre = $1', [ROL_REGISTRO]);
  if (!roles.rows.length) throw errorHTTP(503, NO_DISPONIBLE);

  const passwordHash = await crearHash(password);
  // consultar convierte el 23505 (correo repetido) en 409 y cualquier otro fallo en 503 sin detalles.
  const resultado = await consultar(SQL_INSERTAR, [nombreLimpio, emailNormalizado, passwordHash, roles.rows[0].id]);
  const cuenta = resultado.rows[0];
  const { token, expiresAt } = firmarToken({ id: cuenta.id, email: cuenta.email, rol: ROL_REGISTRO });
  res.status(201).json({ success: true, data: { token, email: cuenta.email, nombre: cuenta.nombre, rol: ROL_REGISTRO, expiresAt } });
}

module.exports = { registrar };
