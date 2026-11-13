-- Esquema relacional en PostgreSQL (Neon)
-- Compatible con cuentas de administradores y usuarios del sistema

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL DEFAULT 'Administrador',
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol_id INT NOT NULL REFERENCES roles(id),
  cuenta_activa BOOLEAN NOT NULL DEFAULT true,
  ultimo_acceso TIMESTAMPTZ,
  creado_en TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS favoritos (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  arma_id TEXT NOT NULL,          -- el _id del arma en MongoDB
  creado_en TIMESTAMPTZ DEFAULT now(),
  UNIQUE (usuario_id, arma_id)
);

-- Roles iniciales para administradores y usuarios
INSERT INTO roles (nombre) VALUES
  ('Administrador General'),
  ('Administrador'),
  ('Usuario')
ON CONFLICT (nombre) DO NOTHING;

-- Índices para optimizar búsquedas por email y favoritos
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_favoritos_usuario ON favoritos(usuario_id);
