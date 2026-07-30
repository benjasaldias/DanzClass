-- ============================================================
-- 073_invite_write_guards_rls.sql
-- ------------------------------------------------------------
-- Cierre de la superficie de escritura RLS en las tablas de invitación/relación
-- (audit2.md P0-1 y P0-3, sesión 1).
--
-- EL PROBLEMA, QUE ES EL MISMO DE 065. Una policy `FOR UPDATE ... USING (X)` sin
-- `WITH CHECK` hace que Postgres reutilice `X` como `WITH CHECK`: valida QUÉ
-- FILAS podés tocar, no QUÉ VALORES escribís en ellas. Cuando `X` solo dice
-- "esta fila es mía" (`auth.uid() = user_id`) y la fila tiene OTRA columna que
-- apunta al recurso relacionado (`chat_id`, `rehearsal_id`, `event_id`,
-- `requester_id`, `applicant_id`), esa segunda columna queda libre: el dueño de
-- la fila la redirige a cualquier recurso ajeno y ninguna policy lo nota.
--
-- 065 cerró exactamente esto para las 6 tablas que mueven dinero. Estas 5
-- quedaron afuera porque son tablas de "invitación/relación" y nadie las miró
-- con la misma lupa. Las variantes por INSERT (2, 3 y 5 de la lista) son
-- hallazgos nuevos de esta sesión: no hacía falta ni el UPDATE.
--
-- VERIFICADO EMPÍRICAMENTE antes de escribir esta migración
-- (tests/integration/rls-guards.spec.ts, con JWT de usuario real contra
-- PostgREST): las 10 escrituras siguientes pasaban.
--
--   1. chat_participants: redirigir la propia fila de participación a un chat
--      ajeno → `is_chat_participant()` pasa a TRUE y se abre la LECTURA y la
--      ESCRITURA de la conversación de dos desconocidos (comprobado: el mensaje
--      privado se lee con el JWT del atacante).
--   2. friendships: mudar `requester_id` de una solicitud recibida a la víctima
--      + `status='accepted'` → amistad forjada sin que la víctima haga nada. Y
--      la variante directa: INSERT con `status='accepted'` (la policy de INSERT
--      solo mira `requester_id`). `posts_select` usa esa tabla para el gate
--      'friends': el atacante ve las publicaciones "solo amigos" de cualquiera.
--   3. event_invites: crear un evento señuelo propio, auto-invitarse y luego
--      retargetear `event_id` al evento ajeno + `accepted` → figura como
--      profesor aceptado de un evento que nunca lo invitó, y el evento aparece
--      en el tab "Siguiendo" de sus propios seguidores.
--   4. rehearsal_invites: `rehearsal_invites_own` es FOR ALL y su WITH CHECK
--      solo mira `user_id`, así que basta INSERTAR la invitación propia a un
--      ensayo privado ajeno (o redirigir una legítima) → el ensayo pasa a ser
--      legible (comprobado con el JWT del atacante).
--   5. auditions: el profesor puede reescribir `applicant_id` de una postulación
--      de su clase (la policy protege `class_id`, que sí aparece en su
--      condición, pero no la otra). Y un alumno puede INSERTAR su propia
--      postulación con `status='accepted'`, que es exactamente lo que
--      /api/class/enroll exige para entrar a un entrenamiento: salta la
--      selección completa.
--
-- P0-3, en la misma migración porque toca la misma tabla. `AuditionModal` hace
-- UPDATE cuando la postulación está `pending` (feature documentada en
-- CLAUDE.md), pero NUNCA existió una policy de UPDATE para el postulante: el
-- UPDATE devuelve 0 filas, PostgREST no lo considera error, y el modal canta
-- éxito. El alumno cree haber corregido su teléfono/edad/video y no pasó nada.
-- Se agrega la policy que falta y el trigger acota qué columnas puede tocar
-- cada lado (patrón de `event_enrollments_write_guard`: un solo trigger que
-- distingue el camino según quién escribe).
--
-- CRITERIO, igual que 065: no se blinda "todo lo que el dueño puede tocar",
-- sino la columna que identifica el RECURSO AJENO y los estados que son
-- decisión de otro. Lo que hoy sale del cliente y es legítimo sigue saliendo:
-- enviar y aceptar solicitudes de amistad, invitar profesores a un evento
-- propio, editar la postulación pendiente y publicar la decisión del profesor.
-- Hay una segunda prueba en esa misma suite que lo verifica — un guard
-- demasiado estricto rompe pantallas sin avisar.
--
-- Reutiliza `danzclass_is_privileged()` e `is_class_teacher()` de 065.
-- Aditiva e idempotente. No modifica datos.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS chat_participants_write_guard_trigger ON chat_participants;
--   DROP TRIGGER IF EXISTS friendships_write_guard_trigger ON friendships;
--   DROP TRIGGER IF EXISTS event_invites_write_guard_trigger ON event_invites;
--   DROP TRIGGER IF EXISTS rehearsal_invites_write_guard_trigger ON rehearsal_invites;
--   DROP TRIGGER IF EXISTS auditions_write_guard_trigger ON auditions;
--   DROP FUNCTION IF EXISTS chat_participants_write_guard();
--   DROP FUNCTION IF EXISTS friendships_write_guard();
--   DROP FUNCTION IF EXISTS event_invites_write_guard();
--   DROP FUNCTION IF EXISTS rehearsal_invites_write_guard();
--   DROP FUNCTION IF EXISTS auditions_write_guard();
--   DROP POLICY IF EXISTS "auditions_update_own_pending" ON auditions;
--   CREATE POLICY "chat_participants_update_own" ON chat_participants
--     FOR UPDATE USING (auth.uid() = user_id);
-- ============================================================

-- (1) chat_participants -------------------------------------------------------
-- Los DOS puntos que escriben `last_read_at` (la page de chat y
-- /api/chat/[id]/messages, que es la vía de mobile) usan `createAdminClient()`,
-- así que `chat_participants_update_own` no tiene NINGÚN llamador legítimo: es
-- superficie de ataque pura. Se elimina, igual que 065 hizo con
-- `payments_insert_student`. El trigger queda como cinturón: si algún día se
-- agrega una policy de UPDATE para marcar leído desde el cliente, el secuestro
-- de `chat_id` sigue cerrado sin que nadie tenga que recordar este documento.
DROP POLICY IF EXISTS "chat_participants_update_own" ON chat_participants;

CREATE OR REPLACE FUNCTION chat_participants_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- La membresía la crea /api/chat/get-or-create tras verificar inscripción
    -- activa o participación aceptada en el ensayo.
    RAISE EXCEPTION 'chat_participant_not_writable'
      USING ERRCODE = '42501',
            HINT = 'La participación en un chat la crea /api/chat/get-or-create.';
  END IF;

  IF NEW.chat_id IS DISTINCT FROM OLD.chat_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'chat_participant_not_writable'
      USING ERRCODE = '42501',
            HINT = 'Mudar la participación a otro chat abriría una conversación ajena.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_participants_write_guard_trigger ON chat_participants;
CREATE TRIGGER chat_participants_write_guard_trigger
  BEFORE INSERT OR UPDATE ON chat_participants
  FOR EACH ROW EXECUTE FUNCTION chat_participants_write_guard();

-- (2) friendships -------------------------------------------------------------
-- Acá el flujo SÍ es cliente-a-cliente (UserCard / TeacherProfileClient, web y
-- mobile): uno envía la solicitud, el otro la acepta. Lo que no puede pasar es
-- que la relación nazca aceptada, ni que se cambie con quién es.
CREATE OR REPLACE FUNCTION friendships_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.status, 'pending') <> 'pending' THEN
      RAISE EXCEPTION 'friendship_status_not_writable'
        USING ERRCODE = '42501',
              HINT = 'Una solicitud de amistad nace pendiente; la acepta el destinatario.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.addressee_id IS DISTINCT FROM OLD.addressee_id THEN
    RAISE EXCEPTION 'friendship_parties_not_writable'
      USING ERRCODE = '42501',
            HINT = 'No se puede cambiar de quién es una solicitud de amistad.';
  END IF;

  -- Solo el destinatario responde, y solo aceptando o rechazando. El
  -- solicitante deshace por DELETE (friendships_delete_own), no por UPDATE.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (auth.uid() = OLD.addressee_id AND NEW.status IN ('accepted', 'rejected')) THEN
    RAISE EXCEPTION 'friendship_status_not_writable'
      USING ERRCODE = '42501',
            HINT = 'Solo el destinatario acepta o rechaza la solicitud.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_write_guard_trigger ON friendships;
CREATE TRIGGER friendships_write_guard_trigger
  BEFORE INSERT OR UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION friendships_write_guard();

-- (3) event_invites -----------------------------------------------------------
-- El organizador invita desde el cliente (InviteTeachersModal). La respuesta va
-- por /api/event/respond-invite (service role), pero se le deja al invitado
-- responder su PROPIA invitación: es su decisión y no abre nada. Lo que se
-- cierra es mudar `event_id`, que es lo que convierte una auto-invitación en
-- una credencial sobre el evento de otro.
CREATE OR REPLACE FUNCTION event_invites_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.status, 'pending') <> 'pending' THEN
      RAISE EXCEPTION 'event_invite_status_not_writable'
        USING ERRCODE = '42501',
              HINT = 'La invitación nace pendiente; la acepta el profesor invitado.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id THEN
    RAISE EXCEPTION 'event_invite_fields_not_writable'
      USING ERRCODE = '42501',
            HINT = 'Mudar la invitación a otro evento la convertiría en una aceptación ajena.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (auth.uid() = OLD.teacher_id AND NEW.status IN ('accepted', 'rejected')) THEN
    RAISE EXCEPTION 'event_invite_status_not_writable'
      USING ERRCODE = '42501',
            HINT = 'Solo el profesor invitado responde su invitación.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_invites_write_guard_trigger ON event_invites;
CREATE TRIGGER event_invites_write_guard_trigger
  BEFORE INSERT OR UPDATE ON event_invites
  FOR EACH ROW EXECUTE FUNCTION event_invites_write_guard();

-- (4) rehearsal_invites -------------------------------------------------------
-- Las cuatro escrituras de esta tabla viven en rutas de servidor
-- (/api/rehearsal/create, /invite, /respond y /api/chat/get-or-create), todas
-- con service role: el cliente no escribe acá. Se cierran INSERT y UPDATE por
-- completo y se deja intacto lo que el cliente SÍ necesita — el SELECT de la
-- agenda y de my-classes, y el DELETE de la propia invitación (equivalente a
-- rechazarla). No se toca ninguna de las dos policies: 072 acaba de reescribir
-- sus condiciones para cortar la recursión mutua, y volver a redefinirlas acá
-- sería el mismo error que cometió 059 al recrear la del chat sin mirar UPDATE.
CREATE OR REPLACE FUNCTION rehearsal_invites_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'rehearsal_invite_not_writable'
    USING ERRCODE = '42501',
          HINT = 'Las invitaciones a ensayo se crean y responden por /api/rehearsal/invite y /api/rehearsal/respond.';
END;
$$;

DROP TRIGGER IF EXISTS rehearsal_invites_write_guard_trigger ON rehearsal_invites;
CREATE TRIGGER rehearsal_invites_write_guard_trigger
  BEFORE INSERT OR UPDATE ON rehearsal_invites
  FOR EACH ROW EXECUTE FUNCTION rehearsal_invites_write_guard();

-- (5) auditions ---------------------------------------------------------------
-- La policy que faltaba (P0-3). El `status = 'pending'` va en las DOS puntas:
-- en `USING` para que solo se pueda tocar una postulación aún no decidida, y en
-- `WITH CHECK` para que el postulante no pueda usar esta vía para decidirse.
DROP POLICY IF EXISTS "auditions_update_own_pending" ON auditions;
CREATE POLICY "auditions_update_own_pending" ON auditions
  FOR UPDATE
  USING (auth.uid() = applicant_id AND status = 'pending')
  WITH CHECK (auth.uid() = applicant_id AND status = 'pending');

-- Un solo trigger que distingue el camino según quién escribe: el postulante
-- declara sus datos, el profesor decide. Ninguno de los dos puede cambiar de
-- quién es la postulación ni a qué clase pertenece.
CREATE OR REPLACE FUNCTION auditions_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Sin esto, un alumno se inserta la postulación ya `accepted` y
    -- /api/class/enroll lo deja entrar al entrenamiento: la audición pasa de
    -- ser un filtro a ser un trámite auto-firmado.
    IF COALESCE(NEW.status, 'pending') <> 'pending' THEN
      RAISE EXCEPTION 'audition_status_not_writable'
        USING ERRCODE = '42501',
              HINT = 'La postulación nace pendiente; la decide el profesor.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.class_id IS DISTINCT FROM OLD.class_id
     OR NEW.applicant_id IS DISTINCT FROM OLD.applicant_id THEN
    RAISE EXCEPTION 'audition_identity_not_writable'
      USING ERRCODE = '42501',
            HINT = 'No se puede reescribir de quién es una postulación.';
  END IF;

  IF auth.uid() = OLD.applicant_id THEN
    -- El postulante corrige su propia declaración (AuditionModal, web y
    -- mobile): nombre, edad, teléfono y video. Nada más.
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.notes IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'audition_status_not_writable'
        USING ERRCODE = '42501',
              HINT = 'La decisión y las notas son del profesor.';
    END IF;
    RETURN NEW;
  END IF;

  IF is_class_teacher(OLD.class_id) THEN
    -- El profesor decide (AuditionsListClient / auditions.tsx) y anota, pero no
    -- edita los datos que declaró el postulante.
    IF NEW.full_name IS DISTINCT FROM OLD.full_name
       OR NEW.age IS DISTINCT FROM OLD.age
       OR NEW.phone IS DISTINCT FROM OLD.phone
       OR NEW.video_url IS DISTINCT FROM OLD.video_url THEN
      RAISE EXCEPTION 'audition_applicant_data_not_writable'
        USING ERRCODE = '42501',
              HINT = 'Los datos de la postulación los declara el postulante.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audition_not_writable' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS auditions_write_guard_trigger ON auditions;
CREATE TRIGGER auditions_write_guard_trigger
  BEFORE INSERT OR UPDATE ON auditions
  FOR EACH ROW EXECUTE FUNCTION auditions_write_guard();

-- ============================================================
-- VERIFICACIÓN (correr después de aplicar):
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgname LIKE '%write_guard_trigger' ORDER BY 1;   -- deben ser 11 (6 de 065 + 5)
--
--   SELECT polname FROM pg_policy WHERE polrelid = 'auditions'::regclass ORDER BY 1;
--   -- debe incluir auditions_update_own_pending
--
--   SELECT polname FROM pg_policy WHERE polrelid = 'chat_participants'::regclass;
--   -- debe quedar solo chat_participants_select
--
-- Y la prueba real: `npm run test:integration` (tests/integration/rls-guards.spec.ts).
-- ============================================================
