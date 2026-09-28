const express = require('express');
const armaController = require('./controllers/armaController');

const app = express();
const PORT = 3000;

// Middleware yaaaa
app.use(express.json());

// Endpoints RESTful para la gestión de la enciclopedia
app.get('/api/armas', armaController.getArmas);
app.get('/api/armas/:id/conflictos', armaController.getConflictos);

// Ruta para comprobación rápida
app.get('/', (req, res) => {
    res.json({ 
        mensaje: 'Bienvenido al Backend de Synapse-Militaria',
        arquitectura: 'Node.js + Express (Totalmente Asíncrono)',
        estado: 'Online'
    });
});

// Levantar el servidor
app.listen(PORT, () => {
    console.log(`\nServidor backend asíncrono corriendo en http://localhost:${PORT}`);
    console.log(`Catálogo de Armas disponible en: http://localhost:${PORT}/api/armas`);
    console.log(`Ver conflictos del AK-47 en: http://localhost:${PORT}/api/armas/1/conflictos\n`);
});