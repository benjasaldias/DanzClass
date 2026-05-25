-- Día del mes en que se realiza el cobro mensual de entrenamientos.
-- Default 1, válido entre 1 y 27 (evita problemas con meses cortos).
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS billing_day SMALLINT DEFAULT 1
    CHECK (billing_day BETWEEN 1 AND 27);
