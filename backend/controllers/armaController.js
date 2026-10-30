const Arma = require('../models/armaModel');

const ArmaController = {
    // Listar todas las armas
    getArmas: async (req, res) => {
        try {
            const armas = await Arma.find();
            res.status(200).json({
                success: true,
                cantidad: armas.length,
                data: armas
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    // Obtener los conflictos de un arma específica
    getConflictos: async (req, res) => {
        try {
            const { id } = req.params;
            const arma = await Arma.findById(id);

            if (!arma) {
                return res.status(404).json({ success: false, message: "Arma no encontrada" });
            }

            res.status(200).json({
                success: true,
                data: arma.conflictos
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
};

module.exports = ArmaController;