const { errorHTTP } = require('../controllers/armaController');

// Restringe una ruta a ciertos roles. Se usa después de auth.autenticar, que deja el rol en req.usuario.rol:
//   app.get('/api/usuarios', auth.autenticar, requerirRol('Administrador General'), ...)
// Se usa en las rutas GET y POST de /api/usuarios (backend/app.js) para exigir el rol Administrador General.
function requerirRol(...roles) {
  const permitidos = new Set(roles);
  return (req, res, next) => {
    if (permitidos.has(req.usuario?.rol)) return next();
    next(errorHTTP(403, 'No tienes permiso para esta acción.'));
  };
}

module.exports = { requerirRol };
