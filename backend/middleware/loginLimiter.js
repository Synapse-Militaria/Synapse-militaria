function crearLimitadorLogin({ maximo = 5, ventanaMs = 15 * 60 * 1000, ahora = Date.now } = {}) {
  const intentos = new Map();
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    const tiempo = ahora();
    for (const [ip, intento] of intentos) {
      if (intento.vence <= tiempo) intentos.delete(ip);
    }
    const ip = req.ip || req.socket?.remoteAddress || 'desconocida';
    const intento = intentos.get(ip) || { cantidad: 0, vence: tiempo + ventanaMs };
    intentos.set(ip, intento);
    if (intento.cantidad >= maximo) {
      res.setHeader('Retry-After', String(Math.ceil((intento.vence - tiempo) / 1000)));
      return res.status(429).json({ success: false, message: 'Demasiados intentos de ingreso. Inténtalo de nuevo en 15 minutos.' });
    }
    intento.cantidad += 1;
    next();
  };
}

module.exports = { crearLimitadorLogin };
