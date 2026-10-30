const mongoose = require('mongoose');

const armaSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    tipo_arma: String,
    epoca_creacion: String,
    pais_origen: {
        nombre: String,
        tipo_faccion: String
    },
    conflictos: [
        {
            nombre_conflicto: String,
            fecha_inicio: String
        }
    ]
});

module.exports = mongoose.model('Arma', armaSchema);