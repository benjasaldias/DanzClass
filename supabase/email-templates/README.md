# Email Templates — DanzClass

Templates HTML con branding DanzClass para los emails transaccionales de Supabase Auth.

## Archivos

| Archivo | Tipo Supabase | Cuándo se envía |
|---|---|---|
| `confirmation.html` | Confirm signup | Al registrar nueva cuenta |
| `reset-password.html` | Reset password | Al solicitar "Olvidé mi contraseña" |
| `magic-link.html` | Magic link | Si se activa login por enlace mágico |

## Cómo aplicar en Supabase

1. Ir a [Supabase Dashboard](https://supabase.com/dashboard) → tu proyecto → **Authentication** → **Email Templates**
2. Para cada template:
   a. Seleccionar el tipo en el menú (ej: "Confirm signup")
   b. En el campo **Subject**, usar:
      - Confirm signup: `Confirma tu cuenta en DanzClass`
      - Reset password: `Restablecer contraseña — DanzClass`
      - Magic link: `Tu enlace de acceso — DanzClass`
   c. En el campo **Body**, pegar el contenido completo del archivo `.html`
   d. Hacer clic en **Save**

## Variables de Supabase

Los templates usan `{{ .ConfirmationURL }}` — esta variable es inyectada automáticamente por Supabase con el enlace correcto de cada acción.

## Notas de diseño

- Fondo: `#f5f3ff` (Blanco Violeta)
- Header: gradiente `#1A1035 → #2D1B69` (Noche Urbana)
- Logo: rectángulo "D" geométrico en `#c026d3` (brand-600)
- Botón CTA: `#c026d3` con border-radius 12px
- Footer: `#EEEDFE` (Lavanda Suave) con links a /privacy y /terms
