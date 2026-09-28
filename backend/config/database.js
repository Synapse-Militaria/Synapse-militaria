const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Apuntamos al archivo físico de la base de datos
const dbPath = path.resolve(__dirname, '../../database/synapse.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err.message);
    } else {
        console.log('Conexión exitosa a la base de datos SQLite');
    }
});

module.exports = db;