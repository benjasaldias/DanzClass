# Supabase Edge Functions

Edge Functions corren en Deno (~100ms cold start vs 1-2s en Vercel). Requieren la Supabase CLI.

## Setup

```bash
npm install -g supabase
supabase login
supabase link --project-ref <ref>   # encontrar en dashboard.supabase.com → Settings → General
```

---

## mp-webhook — Webhook de Mercado Pago

Procesa eventos de Mercado Pago: pagos únicos, suscripciones recurrentes, renovaciones mensuales.
Es funcionalmente equivalente al route `apps/web/src/app/api/mercadopago/webhook/route.ts`
pero con ~10x menor latencia de cold start.

### Variables de entorno necesarias en Supabase

Configurar en: dashboard.supabase.com → Edge Functions → Secrets

| Variable | Descripción |
|---|---|
| `SUPABASE_URL` | URL del proyecto (ya disponible automáticamente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (ya disponible automáticamente) |
| `MERCADOPAGO_ACCESS_TOKEN` | Token de producción de MP |
| `MERCADOPAGO_WEBHOOK_SECRET` | Secreto de firma del webhook de MP |

> Nota: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son inyectadas automáticamente por Supabase en las Edge Functions — no las configures manualmente.

### Deploy

```bash
# Desde la raíz del monorepo
supabase functions deploy mp-webhook --project-ref <ref>
```

La URL resultante será:
```
https://<ref>.supabase.co/functions/v1/mp-webhook
```

### Actualizar webhook en Mercado Pago

1. Ir a https://www.mercadopago.com.ar/developers/panel/app
2. Seleccionar tu aplicación → Webhooks
3. Cambiar la URL a `https://<ref>.supabase.co/functions/v1/mp-webhook`
4. Mantener los eventos: `payment`, `subscription_preapproval`, `subscription_authorized_payment`

### Rollback

Si la Edge Function falla, el webhook en MP sigue intentando por ~24h.
Para rollback instantáneo: revertir la URL del webhook de vuelta a la URL de Vercel.

El route de Vercel (`/api/mercadopago/webhook`) permanece activo como fallback y puede
reactivarse en cualquier momento.

### Diferencias con el route de Vercel

| Aspecto | Vercel Function | Supabase Edge Function |
|---|---|---|
| Runtime | Node.js | Deno |
| Cold start | 1-2s | ~100ms |
| HMAC | `crypto.createHmac` (Node) | `crypto.subtle` (Web Crypto API) |
| MP SDK | `mercadopago` npm package | Fetch nativo a la API de MP |
| DB client | `createAdminClient()` wrapper | `@supabase/supabase-js` directo |
