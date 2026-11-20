const { errorHTTP } = require('../controllers/armaController');

// Restringe una ruta a ciertos roles. Se usa después de auth.autenticar, que deja el rol en req.usuario.rol:
//   app.get('/api/usuarios', auth.autenticar, requerirRol('Administrador General'), ...)
// Se usa en backend/app.js en GET, POST, PATCH y DELETE de /api/usuarios (solo Administrador General)
// y en las escrituras del catálogo: POST, PUT y DELETE de armas, conflictos y países (Administrador General o Administrador).
function requerirRol(...roles) {
  const permitidos = new Set(roles);
  return (req, res, next) => {
    if (permitidos.has(req.usuario?.rol)) return next();
    next(errorHTTP(403, 'No tienes permiso para esta acción.'));
  };
}

module.exports = { requerirRol };
