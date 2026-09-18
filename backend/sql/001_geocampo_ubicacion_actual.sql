-- Ejecutar una única vez en la base de datos del entorno correspondiente.
-- Guarda la última posición que la app reporta mientras el gestor tiene jornada activa.
CREATE TABLE IF NOT EXISTS geocampo_ubicacion_actual (
  id_personal INT NOT NULL,
  latitud DECIMAL(10,7) NOT NULL,
  longitud DECIMAL(10,7) NOT NULL,
  precision_metros DECIMAL(8,2) NULL,
  jornada_activa TINYINT(1) NOT NULL DEFAULT 1,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_personal),
  INDEX idx_geocampo_ubicacion_actualizada (actualizado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
