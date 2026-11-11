
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL
);

CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol_id INT NOT NULL REFERENCES roles(id),
  creado_en TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE favoritos (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  arma_id TEXT NOT NULL,          -- el _id del arma en MongoDB
  creado_en TIMESTAMPTZ DEFAULT now(),
  UNIQUE (usuario_id, arma_id)
);
