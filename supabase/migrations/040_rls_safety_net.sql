-- 040_rls_safety_net.sql
-- Respuesta al alerta de Supabase Security Advisor (31 May 2026).
-- El advisor detectó una tabla en el esquema public sin RLS habilitado.
--
-- DIAGNÓSTICO: Para identificar exactamente qué tabla causó el alerta, ejecuta
-- antes de aplicar esta migración:
--
--   SELECT schemaname, tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public' AND rowsecurity = false;
--
-- Esta migración es idempotente: habilitar RLS en una tabla que ya lo tiene
-- activo no tiene ningún efecto. Actúa como red de seguridad para cualquier
-- tabla que haya podido quedar sin RLS por una creación manual en el dashboard.

-- ── Tablas del schema base (001) ──────────────────────────────────────────────
ALTER TABLE IF EXISTS profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS teacher_payment_info  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS follows               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS classes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_media           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS enrollments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments              ENABLE ROW LEVEL SECURITY;

-- ── Tablas añadidas en migraciones 002–020 ────────────────────────────────────
ALTER TABLE IF EXISTS subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS friendships           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_2x_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS trust_endorsements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS posts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dismissed_debts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS auditions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ratings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS waitlist              ENABLE ROW LEVEL SECURITY;

-- ── Tablas añadidas en migraciones 022–027 ────────────────────────────────────
ALTER TABLE IF EXISTS user_busy_blocks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rehearsals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rehearsal_invites     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS admin_actions         ENABLE ROW LEVEL SECURITY;

-- ── Tablas añadidas en migraciones 032–039 ────────────────────────────────────
ALTER TABLE IF EXISTS subscription_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_packages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_package_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS package_enrollments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chats                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chat_participants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chat_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS event_invites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS event_enrollments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS event_payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS push_tokens           ENABLE ROW LEVEL SECURITY;

-- ── Verificación post-migración ───────────────────────────────────────────────
-- Ejecuta esto en el SQL Editor de Supabase para confirmar que no queda
-- ninguna tabla pública sin RLS:
--
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND rowsecurity = false;
--
-- Resultado esperado: 0 filas.
