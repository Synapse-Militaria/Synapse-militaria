const express = require('express');
const mongoose = require('mongoose');
const conectarDB = require('./config/database');
const { armas, reportes, catalogoController, auth, errorHTTP, responderError } = require('./controllers/armaController');

const app = express();
const origenes = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173').split(',').map(value => value.trim());

app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origenes.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb' }));

function validarId(req, res, next) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return next(errorHTTP(400, 'El identificador debe ser un ObjectId de MongoDB válido.'));
  next();
}

app.get('/', (req, res) => {
  const conectado = mongoose.connection.readyState === 1;
  res.status(conectado ? 200 : 503).json({ success: conectado, mensaje: 'Synapse-Militaria — Express y MongoDB', estado: conectado ? 'Online' : 'Sin conexión a MongoDB' });
});

app.post('/api/auth/login', auth.login);
app.post('/api/auth/logout', auth.autenticar, auth.logout);
app.post('/api/auth/recuperar', auth.recuperar);
app.get('/api/reportes/armas-por-pais', reportes.armasPorPais);

app.get('/api/armas', armas.getArmas);
app.get('/api/armas/buscar', armas.buscarArmas);
app.get('/api/armas/:id/conflictos', validarId, armas.getConflictos);
app.get('/api/armas/:id', validarId, armas.getArma);
app.post('/api/armas', auth.autenticar, armas.createArma);
app.put('/api/armas/:id', auth.autenticar, validarId, armas.updateArma);
app.delete('/api/armas/:id', auth.autenticar, validarId, armas.deleteArma);

for (const tipo of ['conflictos', 'paises']) {
  const controller = catalogoController(tipo);
  app.get(`/api/${tipo}`, controller.listar);
  app.post(`/api/${tipo}`, auth.autenticar, controller.crear);
  app.put(`/api/${tipo}/:id`, auth.autenticar, validarId, controller.actualizar);
  app.delete(`/api/${tipo}/:id`, auth.autenticar, validarId, controller.eliminar);
}

app.use((req, res, next) => next(errorHTTP(404, 'Ruta no encontrada.')));
app.use(responderError);

async function iniciar() {
  await conectarDB();
  const port = Number(process.env.PORT) || 3000;
  return app.listen(port, () => console.log(`Backend disponible en http://localhost:${port}`));
}

if (require.main === module) {
  iniciar().catch(error => {
    console.error('No se pudo iniciar el backend. Comprueba MONGO_URI y que MongoDB esté encendido.');
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, iniciar };
