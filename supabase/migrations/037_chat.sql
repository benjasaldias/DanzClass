-- 037_chat.sql
-- Chat en tiempo real: directo alumno↔profesor (por clase, uno por par) y grupal (por ensayo).
-- Los chats se eliminan por el cron 48h después de que termina la clase/ensayo.
-- Reglas:
--   - 'class': solo si el alumno tiene enrollment activo en esa clase. Un chat por par (class_id + student_id).
--   - 'rehearsal': todos los invitados con status='accepted' + el creador. Un chat grupal por ensayo.

CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('class', 'rehearsal')),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  rehearsal_id UUID REFERENCES rehearsals(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- solo para type='class'
  CONSTRAINT chats_one_ref CHECK (
    (type = 'class' AND class_id IS NOT NULL AND rehearsal_id IS NULL) OR
    (type = 'rehearsal' AND rehearsal_id IS NOT NULL AND class_id IS NULL)
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un chat por par alumno+clase y uno por ensayo
CREATE UNIQUE INDEX chats_class_student_unique ON chats(class_id, student_id) WHERE type = 'class';
CREATE UNIQUE INDEX chats_rehearsal_unique ON chats(rehearsal_id) WHERE type = 'rehearsal';

CREATE TABLE chat_participants (
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (chat_id, user_id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_chat_id_idx ON chat_messages(chat_id, created_at DESC);
CREATE INDEX chat_participants_user_id_idx ON chat_participants(user_id);
CREATE INDEX chats_class_id_idx ON chats(class_id);
CREATE INDEX chats_rehearsal_id_idx ON chats(rehearsal_id);

-- RLS
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- chats: visible solo a sus participantes
CREATE POLICY "chats_select_participant" ON chats
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_participants cp WHERE cp.chat_id = id AND cp.user_id = auth.uid())
  );

-- chat_participants: visible a cualquier participante del mismo chat
CREATE POLICY "chat_participants_select" ON chat_participants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_participants cp2 WHERE cp2.chat_id = chat_id AND cp2.user_id = auth.uid())
  );

CREATE POLICY "chat_participants_update_own" ON chat_participants
  FOR UPDATE USING (auth.uid() = user_id);

-- chat_messages: solo participantes del chat pueden leer/enviar
CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_participants cp WHERE cp.chat_id = chat_id AND cp.user_id = auth.uid())
  );

CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (SELECT 1 FROM chat_participants cp WHERE cp.chat_id = chat_id AND cp.user_id = auth.uid())
  );
