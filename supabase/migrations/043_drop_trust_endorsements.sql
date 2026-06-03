-- 043_drop_trust_endorsements.sql
-- B-6: Elimina la tabla zombi `trust_endorsements`.
-- El UI (TrustButton, EndorsementPopup) fue eliminado en sesión 2026-05-22
-- y reemplazado por el sistema de ratings (estrellas). La tabla tiene data
-- histórica sin valor funcional y policies RLS activas que nadie mantiene.
--
-- CASCADE elimina automáticamente policies y FK dependientes.
-- Hacer backup antes de aplicar si se quiere preservar data histórica:
--   SELECT * FROM trust_endorsements;

DROP TABLE IF EXISTS trust_endorsements CASCADE;
