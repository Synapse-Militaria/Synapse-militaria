// Reglas compartidas para crear o cambiar cuentas (seed y, más adelante, la gestión de cuentas).
const LARGO_MINIMO_CLAVE = 12;
const LARGO_MAXIMO_CLAVE = 128;
const LARGO_MAXIMO_EMAIL = 254;

function normalizarEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

// Recibe el correo ya normalizado. Devuelve null si la cuenta es válida o el motivo del rechazo.
function validarCuenta({ email, password }) {
  if (typeof email !== 'string' || email.length > LARGO_MAXIMO_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'El correo no tiene un formato válido.';
  }
  if (typeof password !== 'string') return `La contraseña debe tener entre ${LARGO_MINIMO_CLAVE} y ${LARGO_MAXIMO_CLAVE} caracteres.`;
  if (password.toLowerCase() === 'admin123') return 'La contraseña no puede ser admin123.';
  if (password.length < LARGO_MINIMO_CLAVE || password.length > LARGO_MAXIMO_CLAVE) {
    return `La contraseña debe tener entre ${LARGO_MINIMO_CLAVE} y ${LARGO_MAXIMO_CLAVE} caracteres.`;
  }
  const usuario = email.split('@')[0].toLowerCase();
  if (password.toLowerCase().includes(usuario)) return 'La contraseña no puede contener la parte del correo antes de la @.';
  return null;
}

module.exports = { validarCuenta, normalizarEmail, LARGO_MINIMO_CLAVE, LARGO_MAXIMO_CLAVE };
