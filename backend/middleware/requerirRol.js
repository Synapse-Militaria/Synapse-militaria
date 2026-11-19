const { errorHTTP } = require('../controllers/armaController');

// Restringe una ruta a ciertos roles. Se usa después de auth.autenticar, que deja el rol en req.admin.rol:
//   router.post('/cuentas', auth.autenticar, requerirRol('Administrador General'), ...)
// Todavía no está conectado a ninguna ruta; queda listo para la gestión de cuentas.
function requerirRol(...roles) {
  const permitidos = new Set(roles);
  return (req, res, next) => {
    if (permitidos.has(req.admin?.rol)) return next();
    next(errorHTTP(403, 'No tienes permiso para esta acción.'));
  };
}

module.exports = { requerirRol };
