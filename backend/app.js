const express = require('express');
const conectarDB = require('./config/database'); 
const armaController = require('./controllers/armaController');

const app = express();
const PORT = 3000;

// Conectar a MongoDB antes de iniciar el servidor
conectarDB();

// Middleware
app.use(express.json());

// Endpoints RESTful para la gestión de la enciclopedia
app.get('/api/armas', armaController.getArmas);
app.get('/api/armas/buscar', armaController.buscarArmas);
app.get('/api/armas/:id/conflictos', armaController.getConflictos);
app.post('/api/armas', armaController.createArma);

// Ruta para comprobación rápida
app.get('/', (req, res) => {
    res.json({ 
        mensaje: 'Bienvenido al Backend de Synapse-Militaria con MongoDB',
        arquitectura: 'Node.js + Express + Mongoose',
        estado: 'Online'
    });
});

// Levantar el servidor
app.listen(PORT, () => {
    console.log(`\nServidor backend corriendo en http://localhost:${PORT}`);
    console.log(`Catálogo de Armas disponible en: http://localhost:${PORT}/api/armas\n`);
});