const { Pool } = require('pg');

// Quita sslmode y uselibpqcompat de la URI para que el SSL quede definido solo por
// la opción ssl del Pool (y pg no muestre su advertencia sobre sslmode).
function limpiarUri(uri) {
  const url = new URL(uri);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

function crearPool(uri) {
  if (!uri) return null;
  let connectionString;
  try {
    connectionString = limpiarUri(uri);
  } catch {
    // No se imprime la dirección: puede contener usuario y contraseña.
    console.error('Error: NEON_URI no tiene un formato de URL válido. Revisa la variable de entorno.');
    return null;
  }
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: true },
    // Límites bajos: en Vercel cada función serverless abre su propio pool.
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
}

const pool = crearPool(process.env.NEON_URI);

async function conectarNeon() {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    console.log('Conectado a Neon PostgreSQL');
    return true;
  } catch (err) {
    console.error('Error conectando a Neon:', err.message);
    return false;
  }
}

// Conectar automáticamente si hay URI configurada y no estamos en entorno de test
if (pool && process.env.NODE_ENV !== 'test' && !process.env.NODE_TEST_CONTEXT) {
  conectarNeon();
}

module.exports = {
  pool,
  conectarNeon,
  query: (text, params) => {
    if (!pool) throw new Error('No hay conexión a Neon PostgreSQL configurada (falta NEON_URI).');
    return pool.query(text, params);
  }
};
