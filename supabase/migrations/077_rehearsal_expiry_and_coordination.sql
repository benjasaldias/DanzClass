-- ============================================================
-- 077_rehearsal_expiry_and_coordination.sql
-- ------------------------------------------------------------
-- Tres problemas de la feature de Ensayos, en una migración porque los tres
-- giran sobre la misma pregunta sin responder: ¿cuándo es este ensayo?
--
-- (1) UN ENSAYO NUNCA CADUCA. `rehearsals` no tiene ninguna noción de "ya pasó":
--     el feed (web y mobile), la agenda y "Mis clases" filtran sólo por
--     `status = 'active'`, así que un ensayo del año pasado sigue apareciendo
--     como si fuera de mañana. Es peor en `date_mode='coordinate'`: ese ensayo
--     no tiene NINGUNA fecha, así que ni mirándolo a mano se puede decir si
--     venció. Y arrastra un efecto lateral en el cron: la limpieza de chats a
--     las 48h calcula `lastDate` y para un coordinate sin fecha le queda NULL,
--     así que el chat grupal de un ensayo coordinado no se borra jamás.
--
--     Reglas (decididas con el usuario):
--       * fecha fija conocida → caduca 2 h después de que TERMINA
--         (inicio + duration_minutes + 2 h). Aplica a `single` y también al
--         `coordinate` que ya fijó fecha por votación.
--       * `custom` (varias fechas) → misma regla sobre la ÚLTIMA fecha. Como
--         ese modo no captura hora en ningún formulario, se toma fin del día.
--       * `coordinate` sin fecha fijada → caduca al terminar
--         `coordinate_month`, sin gracia: el mes para coordinar se acabó.
--       * cualquier otro caso (un `single` guardado sin fecha — hoy posible,
--         el modal no la exige) → `expires_at = NULL` = NO caduca. Preferimos
--         un ensayo colgado a borrar a ciegas por datos incompletos.
--
--     `expires_at` es una columna DERIVADA que mantiene un trigger, no un dato
--     que el cliente escriba (patrón `pending_since` de 066): sin eso, un
--     creador la empuja al futuro con un PATCH y se queda en el feed para
--     siempre. No hay excepción para nadie, tampoco service role.
--
--     No es columna generada (`GENERATED ALWAYS AS`) porque la expresión
--     necesita `AT TIME ZONE 'America/Santiago'` para que "2 h después de que
--     termina" sea 2 h en hora de Chile, y ese cast es STABLE, no IMMUTABLE.
--
-- (2) NO HAY FORMA DE FIJAR LA FECHA de un ensayo coordinado. El calendario de
--     coordinación (023 + su fix de recursión en 072) sólo MUESTRA
--     disponibilidad: se ve el mes pintado y ahí termina: no existe ninguna
--     acción que convierta esa vista en una fecha. Un ensayo `coordinate`
--     estaba condenado a quedarse coordinando para siempre — que es también
--     por qué (1) le pega tan fuerte.
--
--     Se agregan las dos mitades:
--       * `rehearsal_discards` — un integrante descarta un día completo
--         (`hour IS NULL`) o horas puntuales de un día. Es negativo a
--         propósito: la disponibilidad ya se DERIVA de sueño + bloques
--         ocupados + clases, así que lo que falta es la excepción explícita
--         ("ese día no puedo"), no volver a declarar lo que el sistema sabe.
--       * `rehearsal_proposals` + `rehearsal_proposal_votes` — el creador
--         propone un rango horario (minutos libres: 12:30–13:35 es válido) y
--         cuántas confirmaciones hacen falta; al alcanzarlas, la fecha del
--         ensayo se fija sola y se avisa a TODOS, hayan votado o no.
--
--     UNA sola votación abierta por ensayo (índice único parcial más abajo):
--     con dos abiertas que alcanzan el umbral a la vez no hay regla que diga
--     cuál gana, y "la fecha del ensayo" es un solo campo.
--
-- (3) LA DISPONIBILIDAD PARCIAL NO SE VE. `/api/rehearsal/group-availability`
--     devuelve sólo las horas en que están libres TODOS y un `available_count`
--     agregado. Si falta uno, la UI dice "no hay horario en que coincidan
--     todos" y no cuenta nada más: el creador no puede saber si el que falta es
--     imprescindible o no. Esto no necesita SQL nuevo — se resuelve ampliando
--     la ruta y la UI —, pero sí necesita las tablas de arriba, porque un
--     descarte pesa más que un bloque derivado y tiene que restar
--     disponibilidad.
--
-- WRITE GUARDS, criterio de 065/073. Las dos tablas nuevas se defienden
-- distinto y a propósito:
--   * `rehearsal_discards` las escribe el CLIENTE (marca propia, reversible,
--     sin consecuencias para nadie más: el patrón de `post_likes` en 076). La
--     policy expresa la regla completa: es mi fila Y soy parte del ensayo.
--   * `rehearsal_proposals` y `rehearsal_proposal_votes` NO aceptan escrituras
--     del cliente (patrón `payments`/`ratings` desde 065). Contar los votos,
--     compararlos contra el umbral, fijar la fecha del ensayo y notificar es
--     una decisión de servidor: RLS no puede expresarla y un cliente que la
--     ejecute puede mentir sobre el conteo. Van por
--     /api/rehearsal/proposal/*.
--
-- Ninguna función acá subconsulta la tabla que su policy protege, ni una tabla
-- cuya policy vuelva a ésta: la pertenencia se resuelve con
-- `is_rehearsal_participant()` SECURITY DEFINER, que salta RLS y corta el ciclo
-- (patrón `is_chat_participant` de 059 / `is_rehearsal_invitee` de 072). Es la
-- cuarta vez que esta familia de bugs aparece en el repo; no la reintroduzcamos.
--
-- Aditiva e idempotente. TOCA DATOS en un solo punto, documentado: marca
-- `status='expired'` los ensayos activos ya vencidos (el objetivo del
-- problema (1)). Es reversible con el query de rollback.
--
-- RESPALDO recomendado antes de aplicar en prod (para poder revertir el
-- barrido con precisión):
--   CREATE TABLE rehearsals_backup_077 AS SELECT * FROM rehearsals;
--
-- ROLLBACK:
--   -- revertir el barrido de caducados
--   UPDATE rehearsals SET status = 'active' WHERE status = 'expired';
--   ALTER TABLE rehearsals DROP CONSTRAINT IF EXISTS rehearsals_status_check;
--   ALTER TABLE rehearsals ADD  CONSTRAINT rehearsals_status_check
--     CHECK (status IN ('active', 'cancelled'));
--   DROP TRIGGER  IF EXISTS rehearsals_expiry_guard ON rehearsals;
--   DROP FUNCTION IF EXISTS rehearsals_expiry_guard();
--   DROP FUNCTION IF EXISTS rehearsal_expires_at(TEXT, DATE, TIME, TEXT[], TEXT, INTEGER);
--   ALTER TABLE rehearsals DROP COLUMN IF EXISTS expires_at;
--   ALTER TABLE rehearsals DROP COLUMN IF EXISTS confirmed_at;
--   DROP TABLE IF EXISTS rehearsal_proposal_votes;
--   DROP TABLE IF EXISTS rehearsal_proposals;
--   DROP TABLE IF EXISTS rehearsal_discards;
--   DROP FUNCTION IF EXISTS is_rehearsal_participant(UUID);
--   DROP FUNCTION IF EXISTS rehearsal_server_only_guard();
--   -- y recrear notifications_type_check sin 'rehearsal_vote'/'rehearsal_date_set'
--   -- (la lista de 076).
-- ============================================================

-- ============================================================
-- (1) CADUCIDAD
-- ============================================================

ALTER TABLE rehearsals
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE rehearsals
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN rehearsals.expires_at IS
  'DERIVADA. La mantiene rehearsals_expiry_guard(); ningún caller la escribe, tampoco service role. NULL = no caduca (datos insuficientes para decidirlo).';
COMMENT ON COLUMN rehearsals.confirmed_at IS
  'Cuándo quedó fijada la fecha de un ensayo date_mode=coordinate (vía votación o "Fijar ahora"). NULL en coordinate = sigue coordinando.';

-- 'expired' ≠ 'cancelled'. `cancelled` es "el creador lo dio de baja" y ya se
-- muestra como tal en la UI; `expired` es "ocurrió (o se le pasó el plazo) y
-- salió de circulación". Distinguirlos importa para saber si el ensayo
-- alcanzó a existir.
ALTER TABLE rehearsals DROP CONSTRAINT IF EXISTS rehearsals_status_check;
ALTER TABLE rehearsals ADD CONSTRAINT rehearsals_status_check
  CHECK (status IN ('active', 'cancelled', 'expired'));

-- Ventana de gracia después de que termina el ensayo. Espejo de
-- REHEARSAL_GRACE_HOURS en packages/shared/src/lib/rehearsalSchedule.ts.
CREATE OR REPLACE FUNCTION rehearsal_expires_at(
  p_date_mode        TEXT,
  p_rehearsal_date   DATE,
  p_rehearsal_time   TIME,
  p_custom_dates     TEXT[],
  p_coordinate_month TEXT,
  p_duration_minutes INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_grace     INTERVAL := INTERVAL '2 hours';
  v_last_date DATE;
  v_month     DATE;
BEGIN
  -- Caso 1: hay fecha fija. Cubre `single` y el `coordinate` ya fijado —
  -- por eso se pregunta por la FECHA y no por el date_mode.
  IF p_rehearsal_date IS NOT NULL THEN
    RETURN ((p_rehearsal_date + COALESCE(p_rehearsal_time, TIME '00:00'))
              AT TIME ZONE 'America/Santiago')
           + make_interval(mins => COALESCE(p_duration_minutes, 60))
           + v_grace;
  END IF;

  -- Caso 1b: varias fechas. Los formularios no capturan hora en este modo, así
  -- que el ensayo "termina" al final de la última fecha. MAX() sobre texto
  -- ISO ordena cronológicamente; se filtran valores con formato inválido para
  -- que un dato sucio no reviente el trigger de toda la tabla.
  IF p_date_mode = 'custom' AND p_custom_dates IS NOT NULL THEN
    SELECT MAX(d)::DATE INTO v_last_date
    FROM unnest(p_custom_dates) AS d
    WHERE d ~ '^\d{4}-\d{2}-\d{2}$';

    IF v_last_date IS NOT NULL THEN
      RETURN (((v_last_date + 1)::TIMESTAMP) AT TIME ZONE 'America/Santiago') + v_grace;
    END IF;
    RETURN NULL;
  END IF;

  -- Caso 2: coordinando y sin fecha fijada → al terminar el mes acordado.
  -- Sin gracia: acá no hay ensayo que termine, se venció el plazo para fijarlo.
  IF p_date_mode = 'coordinate' AND p_coordinate_month ~ '^\d{4}-\d{2}$' THEN
    v_month := (p_coordinate_month || '-01')::DATE;
    RETURN (((v_month + INTERVAL '1 month')::TIMESTAMP) AT TIME ZONE 'America/Santiago');
  END IF;

  -- Datos insuficientes: no caduca. Un `single` sin fecha es hoy posible.
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION rehearsal_expires_at(TEXT, DATE, TIME, TEXT[], TEXT, INTEGER)
  TO authenticated, service_role;

-- SECURITY INVOKER (default): no pregunta quién llama, sólo recalcula. Aun así
-- lleva `SET search_path = public` — la regla vale para toda función que un
-- trigger pueda disparar, sea DEFINER o no.
CREATE OR REPLACE FUNCTION rehearsals_expiry_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.expires_at := rehearsal_expires_at(
    NEW.date_mode, NEW.rehearsal_date, NEW.rehearsal_time,
    NEW.custom_dates, NEW.coordinate_month, NEW.duration_minutes
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rehearsals_expiry_guard ON rehearsals;
CREATE TRIGGER rehearsals_expiry_guard
  BEFORE INSERT OR UPDATE ON rehearsals
  FOR EACH ROW EXECUTE FUNCTION rehearsals_expiry_guard();

-- Backfill de expires_at (el trigger recalcularía lo mismo; se escribe directo
-- para no disparar rehearsals_updated_at sobre toda la tabla).
UPDATE rehearsals
SET expires_at = rehearsal_expires_at(
  date_mode, rehearsal_date, rehearsal_time, custom_dates, coordinate_month, duration_minutes
)
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS rehearsals_status_expires_idx
  ON rehearsals (status, expires_at);

-- ÚNICO punto de esta migración que cambia datos: saca de circulación lo que ya
-- venció. Es el objetivo del problema (1) — sin esto habría que esperar al cron
-- de las 03:00 UTC con los ensayos viejos todavía en el feed.
DO $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE rehearsals
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '077: % ensayo(s) vencido(s) marcados como expired', v_count;
END $$;

-- ============================================================
-- (2) COORDINACIÓN: pertenencia
-- ============================================================

-- SECURITY DEFINER, igual que is_rehearsal_invitee/is_rehearsal_creator (072):
-- las policies de las tablas nuevas tienen que poder responder "¿es parte de
-- este ensayo?" sin que la respuesta dependa de qué puede LEER el llamador, y
-- sin subconsultar tablas cuyas policies vuelvan acá (42P17).
--
-- Más estricta que is_rehearsal_invitee a propósito: ésa devuelve TRUE con
-- cualquier estado de invitación, incluido 'rejected'. Quien rechazó el ensayo
-- no descarta horarios ni vota en él.
CREATE OR REPLACE FUNCTION is_rehearsal_participant(p_rehearsal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rehearsals r
    WHERE r.id = p_rehearsal_id AND r.creator_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM rehearsal_invites ri
    WHERE ri.rehearsal_id = p_rehearsal_id
      AND ri.user_id = auth.uid()
      AND ri.status IN ('pending', 'accepted')
  );
$$;

GRANT EXECUTE ON FUNCTION is_rehearsal_participant(UUID) TO authenticated, service_role;

-- ============================================================
-- (2a) DESCARTES
-- ============================================================

CREATE TABLE IF NOT EXISTS rehearsal_discards (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rehearsal_id UUID        NOT NULL REFERENCES rehearsals(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  discard_date DATE        NOT NULL,
  -- NULL = el día completo. Si no, la hora puntual (bloque de 1 h, la misma
  -- resolución que user_busy_blocks y que el grid de disponibilidad).
  hour         SMALLINT    CHECK (hour IS NULL OR (hour BETWEEN 0 AND 23)),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rehearsal_discards IS
  'Indisponibilidad declarada por un integrante para ESTE ensayo. No toca user_busy_blocks: es puntual, no una regla semanal de su agenda.';

-- Dos índices parciales en vez de un UNIQUE con `hour` nullable: en un UNIQUE
-- normal dos NULL se consideran distintos, así que el día completo se podría
-- insertar N veces (mismo motivo por el que 068 partió su UNIQUE en dos).
CREATE UNIQUE INDEX IF NOT EXISTS rehearsal_discards_day_uniq
  ON rehearsal_discards (rehearsal_id, user_id, discard_date)
  WHERE hour IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rehearsal_discards_hour_uniq
  ON rehearsal_discards (rehearsal_id, user_id, discard_date, hour)
  WHERE hour IS NOT NULL;

CREATE INDEX IF NOT EXISTS rehearsal_discards_rehearsal_idx
  ON rehearsal_discards (rehearsal_id, discard_date);

ALTER TABLE rehearsal_discards ENABLE ROW LEVEL SECURITY;

-- Lo ve todo el grupo, no sólo su autor: que el creador sepa QUIÉN descartó es
-- justamente lo que pide el problema (3).
DROP POLICY IF EXISTS rehearsal_discards_select ON rehearsal_discards;
CREATE POLICY rehearsal_discards_select ON rehearsal_discards
  FOR SELECT USING (is_rehearsal_participant(rehearsal_discards.rehearsal_id));

-- La policy dice la regla COMPLETA: es mi marca Y soy parte del ensayo. Sin la
-- segunda mitad, `user_id = auth.uid()` dejaría insertar descartes en ensayos
-- ajenos (el defecto de forma que 073 encontró en cinco tablas).
DROP POLICY IF EXISTS rehearsal_discards_insert_own ON rehearsal_discards;
CREATE POLICY rehearsal_discards_insert_own ON rehearsal_discards
  FOR INSERT WITH CHECK (
    auth.uid() = rehearsal_discards.user_id
    AND is_rehearsal_participant(rehearsal_discards.rehearsal_id)
  );

DROP POLICY IF EXISTS rehearsal_discards_delete_own ON rehearsal_discards;
CREATE POLICY rehearsal_discards_delete_own ON rehearsal_discards
  FOR DELETE USING (auth.uid() = rehearsal_discards.user_id);

-- Sin policy de UPDATE a propósito: un descarte es un interruptor
-- (INSERT/DELETE). No hay ninguna columna que tenga sentido mutar, así que no
-- se abre la superficie.

-- ============================================================
-- (2b) VOTACIÓN
-- ============================================================

CREATE TABLE IF NOT EXISTS rehearsal_proposals (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rehearsal_id           UUID        NOT NULL REFERENCES rehearsals(id) ON DELETE CASCADE,
  created_by             UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  proposed_date          DATE        NOT NULL,
  -- TIME, no hora entera: el ensayo puede ir de 12:30 a 13:35.
  start_time             TIME        NOT NULL,
  end_time               TIME        NOT NULL,
  required_confirmations SMALLINT    NOT NULL CHECK (required_confirmations >= 1),
  status                 TEXT        NOT NULL DEFAULT 'open'
                                     CHECK (status IN ('open', 'confirmed', 'cancelled', 'expired')),
  resolved_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rehearsal_proposals_range_check CHECK (end_time > start_time)
);

COMMENT ON TABLE rehearsal_proposals IS
  'Votación para fijar la fecha de un ensayo date_mode=coordinate. Sólo la escribe /api/rehearsal/proposal/* con service role.';

-- Una sola votación abierta por ensayo: dos que alcancen el umbral a la vez no
-- tienen desempate posible y la fecha del ensayo es un único campo.
CREATE UNIQUE INDEX IF NOT EXISTS rehearsal_proposals_one_open
  ON rehearsal_proposals (rehearsal_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS rehearsal_proposals_rehearsal_idx
  ON rehearsal_proposals (rehearsal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rehearsal_proposal_votes (
  proposal_id UUID        NOT NULL REFERENCES rehearsal_proposals(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id)            ON DELETE CASCADE,
  vote        TEXT        NOT NULL CHECK (vote IN ('yes', 'no')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, user_id)
);

ALTER TABLE rehearsal_proposals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rehearsal_proposal_votes ENABLE ROW LEVEL SECURITY;

-- Sólo SELECT para clientes. Todo el resto pasa por ruta de servidor: contar
-- votos y decidir que se alcanzó el umbral no es algo que RLS pueda validar.
DROP POLICY IF EXISTS rehearsal_proposals_select ON rehearsal_proposals;
CREATE POLICY rehearsal_proposals_select ON rehearsal_proposals
  FOR SELECT USING (is_rehearsal_participant(rehearsal_proposals.rehearsal_id));

-- El voto de cada uno es visible para el grupo: saber quién confirmó es la
-- mitad del valor de la votación (y es lo que el creador mira antes de usar
-- "Fijar ahora").
DROP POLICY IF EXISTS rehearsal_proposal_votes_select ON rehearsal_proposal_votes;
CREATE POLICY rehearsal_proposal_votes_select ON rehearsal_proposal_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rehearsal_proposals p
      WHERE p.id = rehearsal_proposal_votes.proposal_id
        AND is_rehearsal_participant(p.rehearsal_id)
    )
  );

-- Cinturón, además de la ausencia de policies: si alguien agrega una policy de
-- escritura sin pensarlo, el guard sigue rechazando. Mismo razonamiento por el
-- que 073 dejó el trigger de chat_participants tras borrar su policy.
--
-- SECURITY INVOKER obligatorio: pregunta QUIÉN llama. Como SECURITY DEFINER,
-- `current_user` sería el dueño de la función y danzclass_is_privileged()
-- devolvería TRUE para todo el mundo — el bug que la primera versión de 075
-- tuvo y que no da ningún error, sólo deja de proteger.
CREATE OR REPLACE FUNCTION rehearsal_server_only_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT danzclass_is_privileged() THEN
    RAISE EXCEPTION
      'rehearsal_%: esta tabla no acepta escrituras del cliente; usá /api/rehearsal/proposal/*',
      TG_TABLE_NAME;
  END IF;
  -- ⚠️ En un BEFORE DELETE, `NEW` es NULL, y un trigger BEFORE ... FOR EACH ROW
  -- que devuelve NULL CANCELA la operación — en silencio, sin ningún error. Con
  -- `RETURN NEW` a secas este guard bloqueaba TODO borrado, incluido el del
  -- service role y el CASCADE al borrar el ensayo padre (que además habría
  -- hecho fallar la FK). Lo destapó tests/integration/rehearsal-coordination.spec.ts
  -- ("sólo UNA votación abierta por ensayo"), no el typecheck ni la migración,
  -- que corre sin quejarse.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rehearsal_proposals_server_only ON rehearsal_proposals;
CREATE TRIGGER rehearsal_proposals_server_only
  BEFORE INSERT OR UPDATE OR DELETE ON rehearsal_proposals
  FOR EACH ROW EXECUTE FUNCTION rehearsal_server_only_guard();

DROP TRIGGER IF EXISTS rehearsal_proposal_votes_server_only ON rehearsal_proposal_votes;
CREATE TRIGGER rehearsal_proposal_votes_server_only
  BEFORE INSERT OR UPDATE OR DELETE ON rehearsal_proposal_votes
  FOR EACH ROW EXECUTE FUNCTION rehearsal_server_only_guard();

-- ============================================================
-- (3) TIPOS DE NOTIFICACIÓN
-- ============================================================
-- Cada migración reescribe el CHECK completo. Base: la lista de `076`.
--
--   rehearsal_vote     → se abrió una votación de horario; el destinatario vota
--   rehearsal_date_set → la fecha quedó fijada (va a TODOS, hayan votado o no)

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  '2x_request', '2x_match', '2x_payment_turn',
  'friend_request', 'friend_accepted',
  'payment_confirmed', 'payment_rejected',
  'follow', 'new_class', 'class_updated', 'class_cancelled', 'class_discount',
  'debt_warning', 'new_report',
  'audition_accepted', 'audition_rejected', 'new_audition',
  'class_reminder', 'waitlist_available',
  'rehearsal_invite', 'rehearsal_accepted', 'rehearsal_rejected',
  'payment_reminder',
  'event_invite', 'event_invite_accepted', 'event_invite_rejected',
  'posts_expiring',
  'mp_connection_expiring', 'payment_refunded',
  'teach_request',
  'rehearsal_vote', 'rehearsal_date_set'
));

-- ============================================================
-- (4) REALTIME
-- ============================================================
-- No se agrega ninguna tabla a `supabase_realtime`: la UI de coordinación
-- recarga contra la ruta, no se suscribe. Si algún día se quiere ver los votos
-- llegar en vivo, hay que agregar la tabla acá — escribir el `.on(...)` en el
-- cliente no alcanza, que es exactamente lo que 071 tuvo que corregir.
