const { Pool } = require('pg');

const neonUri = process.env.NEON_URI;

const pool = neonUri
  ? new Pool({
      connectionString: neonUri,
      ssl: { rejectUnauthorized: false }
    })
  : null;

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
