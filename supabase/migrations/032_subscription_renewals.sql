-- Track processed MP renewal payments to prevent double-extension of expires_at
-- if Mercado Pago retries the same subscription_authorized_payment event.
CREATE TABLE IF NOT EXISTS subscription_renewals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  mp_payment_id TEXT NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_renewals_mp_payment_id_key UNIQUE (mp_payment_id)
);

ALTER TABLE subscription_renewals ENABLE ROW LEVEL SECURITY;
-- Only service role can interact with this table
CREATE POLICY "no_client_access" ON subscription_renewals USING (false);
