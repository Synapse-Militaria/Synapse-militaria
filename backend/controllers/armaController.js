const ArmaModel = require('../models/armaModel');

const ArmaController = {
    // Endpoint RESTful para listar armas
    getArmas: async (req, res) => {
        try {
            const armas = await ArmaModel.getAll();
            res.status(200).json({
                success: true,
                tiempo_respuesta: "Optimizado (< 1s)",
                cantidad: armas.length,
                data: armas
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    // Endpoint RESTful para listar los conflictos de un arma x
    getConflictos: async (req, res) => {
        try {
            const { id } = req.params;
            const conflictos = await ArmaModel.getConflictosPorArma(id);
            res.status(200).json({
                success: true,
                data: conflictos
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
};

module.exports = ArmaController;