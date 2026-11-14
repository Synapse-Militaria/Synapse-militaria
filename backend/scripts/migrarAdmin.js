// Copia las cuentas de administrador de MongoDB (colección Administradores) a la
// tabla usuarios de PostgreSQL (Neon). Es seguro ejecutarlo más de una vez:
// las cuentas que ya existen (mismo email) no se tocan.
// Solo sirve para bases creadas antes de que el seed creara la cuenta directamente en
// PostgreSQL: el modelo Administrador ya no existe, así que se lee la colección tal cual.
const mongoose = require('mongoose');
const conectarDB = require('../config/database');
const neon = require('../neon');

const ROL_GENERAL = 'Administrador General';
const ROL_ADMIN = 'Administrador';

// Mismo formato que acepta verificarPassword en armaController: scrypt:<salt>:<128 hex>.
function hashValido(hash) {
  const partes = String(hash || '').split(':');
  return partes.length === 3 && partes[0] === 'scrypt' && partes[1].length > 0 && /^[a-f0-9]{128}$/i.test(partes[2]);
}

class RolesFaltantesError extends Error {
  constructor(faltantes) {
    super(`Faltan roles en la tabla roles (${faltantes.join(', ')}). Primero hay que aplicar database/schema.sql en Neon.`);
    this.name = 'RolesFaltantesError';
  }
}

async function migrarAdministradores() {
  const roles = await neon.query('SELECT id, nombre FROM roles WHERE nombre = ANY($1::text[])', [[ROL_GENERAL, ROL_ADMIN]]);
  const idRol = new Map(roles.rows.map(fila => [fila.nombre, fila.id]));
  const faltantes = [ROL_GENERAL, ROL_ADMIN].filter(nombre => !idRol.has(nombre));
  if (faltantes.length) throw new RolesFaltantesError(faltantes);

  // Sin el modelo, find() devuelve todos los campos, incluido password_hash.
  const cuentas = await mongoose.connection.collection('Administradores').find({}).toArray();
  const resumen = { leidas: cuentas.length, insertadas: 0, existentes: 0, omitidas: 0, hayAdminGeneralActivo: false };

  for (const cuenta of cuentas) {
    const email = String(cuenta.email || '').trim().toLowerCase();
    if (!email || !hashValido(cuenta.password_hash)) {
      resumen.omitidas += 1;
      continue;
    }
    const rol = cuenta.rol === ROL_GENERAL ? ROL_GENERAL : ROL_ADMIN;
    const resultado = await neon.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol_id, cuenta_activa, ultimo_acceso)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [
        'Administrador',
        email,
        cuenta.password_hash, // se copia tal cual, sin volver a hashear
        idRol.get(rol),
        typeof cuenta.cuenta_activa === 'boolean' ? cuenta.cuenta_activa : true,
        cuenta.ultimo_acceso ? new Date(cuenta.ultimo_acceso) : null,
      ]
    );
    if (resultado.rows.length) resumen.insertadas += 1;
    else resumen.existentes += 1;
  }

  const generales = await neon.query(
    `SELECT count(*)::int AS total FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE r.nombre = $1 AND u.cuenta_activa = true`,
    [ROL_GENERAL]
  );
  resumen.hayAdminGeneralActivo = Number(generales.rows[0]?.total) > 0;
  return resumen;
}

async function main() {
  const faltan = ['MONGO_URI', 'NEON_URI'].filter(nombre => !process.env[nombre]);
  if (faltan.length) {
    console.error(`Falta configurar ${faltan.join(' y ')} en el .env (o en las variables de entorno).`);
    process.exitCode = 1;
    return;
  }
  if (!neon.pool) {
    console.error('No se pudo preparar la conexión a Neon. Revisa el formato de NEON_URI.');
    process.exitCode = 1;
    return;
  }

  try {
    await conectarDB();
    const resumen = await migrarAdministradores();
    console.log('Migración de administradores terminada:');
    console.log(`  Cuentas leídas en MongoDB:  ${resumen.leidas}`);
    console.log(`  Insertadas en PostgreSQL:   ${resumen.insertadas}`);
    console.log(`  Ya existían (mismo email):  ${resumen.existentes}`);
    console.log(`  Omitidas (hash o email inválido): ${resumen.omitidas}`);
    if (!resumen.hayAdminGeneralActivo) {
      console.warn(`Advertencia: no hay ninguna cuenta activa con rol '${ROL_GENERAL}' en usuarios.`);
    }
  } catch (error) {
    process.exitCode = 1;
    if (error instanceof RolesFaltantesError) console.error(error.message);
    else console.error('La migración falló. Revisa la conexión a MongoDB y a Neon e inténtalo de nuevo.');
  } finally {
    await mongoose.disconnect().catch(() => {});
    await neon.pool.end().catch(() => {});
  }
}

if (require.main === module) main();

module.exports = { migrarAdministradores, main };
