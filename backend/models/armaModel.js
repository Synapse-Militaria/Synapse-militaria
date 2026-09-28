const db = require('../config/database');

const ArmaModel = {
    // Obtener todas las armas 
    getAll: () => {
        return new Promise((resolve, reject) => {
            const query = "SELECT id_arma, nombre, tipo_arma, epoca_creacion FROM ARMA";
            db.all(query, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // Obtener en qué guerras participó un arma
    getConflictosPorArma: (id) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT a.nombre AS Arma, e.nombre_conflicto AS Guerra, e.fecha_inicio
                FROM ARMA a 
                JOIN ARMA_EVENTO ae ON a.id_arma = ae.id_arma 
                JOIN EVENTO_CONFLICTO e ON ae.id_evento = e.id_evento 
                WHERE a.id_arma = ?`;
            db.all(query, [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};

module.exports = ArmaModel;