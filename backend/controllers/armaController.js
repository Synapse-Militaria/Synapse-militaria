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
    },

    buscarArmas: async (req, res) => {
        try {
            const { termino } = req.query; 
            
            if (!termino) {
                return res.status(400).json({ success: false, message: "Debes ingresar un término de búsqueda" });
            }

            // Buscamos coincidencias
            const armasEncontradas = await Arma.find({ 
                nombre: new RegExp(termino, 'i') 
            });

            res.status(200).json({
                success: true,
                cantidad: armasEncontradas.length,
                data: armasEncontradas
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    createArma: async (req, res) => {
        try {
            const nuevaArma = new Arma(req.body);
            const armaGuardada = await nuevaArma.save();

            res.status(201).json({
                success: true,
                data: armaGuardada
            });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

};

module.exports = ArmaController;