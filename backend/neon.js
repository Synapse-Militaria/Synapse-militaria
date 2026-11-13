const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.NEON_URI,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(() => console.log('Conectado a Neon PostgreSQL'))
  .catch(err => console.error('Error conectando a Neon', err.stack));

module.exports = pool;