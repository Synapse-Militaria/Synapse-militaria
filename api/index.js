// Wrapper serverless para Vercel — exporta la app Express como función.
// Las variables de entorno se configuran en el dashboard de Vercel;
// este archivo no lee ni expone archivos .env.
const { app, iniciar } = require('../backend/app');
const conectarDB = require('../backend/config/database');

let conexionLista = false;

module.exports = async (req, res) => {
  if (!conexionLista) {
    await conectarDB();
    conexionLista = true;
  }
  return app(req, res);
};
