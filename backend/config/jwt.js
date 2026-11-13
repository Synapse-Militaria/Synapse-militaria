const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const ALGORITMO = 'HS256';
const DURACION_TOKEN_SEGUNDOS = 30 * 60; // igual que DURACION_SESION en armaController
const LARGO_MINIMO_CLAVE = 32;

// Misma condición que entornoPruebas() en backend/controllers/armaController.js.
const entornoPruebas = () => process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT);
const entornoProduccion = () => process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

let claveTemporal = null;
let advertenciaMostrada = false;

function obtenerClaveTemporal() {
  if (!claveTemporal) claveTemporal = crypto.randomBytes(48).toString('hex');
  return claveTemporal;
}

function obtenerClave() {
  const clave = process.env.JWT_SECRET;
  const claveValida = typeof clave === 'string' && clave.length >= LARGO_MINIMO_CLAVE;

  if (entornoProduccion()) {
    if (claveValida) return clave;
    throw new Error(
      `JWT_SECRET no está configurada o tiene menos de ${LARGO_MINIMO_CLAVE} caracteres. ` +
      'Hay que configurarla en las variables de entorno (en Vercel: Settings > Environment Variables). ' +
      'Para generarla: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  if (claveValida) return clave;
  if (entornoPruebas()) return obtenerClaveTemporal();

  if (!advertenciaMostrada) {
    advertenciaMostrada = true;
    console.warn(
      `Advertencia: JWT_SECRET no está configurada o tiene menos de ${LARGO_MINIMO_CLAVE} caracteres. ` +
      'Se usará una clave temporal; los tokens dejarán de ser válidos al reiniciar el backend.'
    );
  }
  return obtenerClaveTemporal();
}

function firmarToken(usuario) {
  const { id, email, rol } = usuario || {};
  if (id === undefined || id === null || String(id) === '') throw new Error('firmarToken requiere el id del usuario.');

  // Solo se copian campos permitidos: nunca contraseñas ni hashes.
  const token = jwt.sign({ email, rol }, obtenerClave(), {
    algorithm: ALGORITMO,
    subject: String(id),
    expiresIn: DURACION_TOKEN_SEGUNDOS,
  });
  const { exp } = jwt.decode(token);
  return { token, expiresAt: exp * 1000 };
}

function verificarToken(token) {
  return jwt.verify(token, obtenerClave(), { algorithms: [ALGORITMO] });
}

module.exports = { firmarToken, verificarToken };
