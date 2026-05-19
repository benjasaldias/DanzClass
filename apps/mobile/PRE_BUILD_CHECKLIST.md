# Pre-Build Checklist — DanzClass Mobile

Verificar todo esto antes de correr `eas build --profile preview`.

---

## 1. app.json

- [ ] `extra.eas.projectId` reemplazado con el ID real (correr `eas init` desde `apps/mobile/`)
- [ ] Assets reales en `assets/` (ver sección 4)
- [ ] Cambios propuestos del diff de la sesión 2026-05-19 aplicados:
  - `newArchEnabled: true`
  - `ios.buildNumber: "1"`
  - `android.versionCode: 1`
  - `ios.infoPlist` con `NSPhotoLibraryUsageDescription`
  - `android.permissions` con `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_EXTERNAL_STORAGE`
  - Plugin `expo-document-picker` removido (no se usa)
  - Plugin `expo-video` agregado
  - Mensaje de `photosPermission` actualizado

---

## 2. EAS CLI y cuenta

- [ ] EAS CLI instalado: `npm install -g eas-cli`
- [ ] Autenticado en expo.dev: `eas login`
- [ ] Proyecto inicializado: `cd apps/mobile && eas init`
- [ ] Para build iOS (preview/production): Apple Developer Account activa ($99/año) en developer.apple.com
- [ ] Para submit a Play Store (production): Google Play Developer Account activa ($25 único) en play.google.com/console

---

## 3. Variables de entorno en EAS

Las variables `EXPO_PUBLIC_*` no se pueden poner en `.env.local` para EAS builds — deben configurarse en el dashboard de Expo o en `eas.json`.

**Opción A — Dashboard de Expo (recomendado):**  
expo.dev → proyecto → Environment Variables → agregar:

| Variable | Descripción |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | URL pública de Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon key pública de Supabase |

**Verificar que existan en `apps/mobile/.env.local`** para desarrollo local (no se suben a git):
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**Alternativa — inline en eas.json** (solo para builds, no exponer a git):
```json
"preview": {
  "env": {
    "EXPO_PUBLIC_SUPABASE_URL": "https://xxxx.supabase.co",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY": "eyJ..."
  }
}
```
⚠️ No usar esta alternativa si el repo es público.

---

## 4. Assets

Todos los assets en `apps/mobile/assets/` son placeholders de 1×1 px.

- [ ] `icon.png` — 1024×1024 px, PNG, sin transparencia, fondo sólido
- [ ] `adaptive-icon.png` — 1024×1024 px, PNG, capa foreground (puede tener transparencia), logo en el 66% central
- [ ] `splash.png` — 1284×2778 px (o mínimo 1242×2436), PNG, fondo sólido, logo centrado
- [ ] `favicon.png` — 32×32 px, PNG (opcional para builds nativos)

---

## 5. Pruebas mínimas en Expo Go antes del build

Verificar estas rutas en el dispositivo real con `npx expo start --tunnel`:

- [ ] Login y registro funcionan (incluyendo checkbox de términos)
- [ ] Feed carga clases y posts
- [ ] Detalle de clase muestra carrusel de media
- [ ] Subida de foto en "Crear clase" funciona (expo-image-picker → Supabase Storage)
- [ ] Subida de video en "Publicar video" funciona (Cloudinary o Storage fallback)
- [ ] Subida de comprobante en "Pago" funciona
- [ ] Editar perfil: subida de avatar funciona
- [ ] Mis clases: tabs "Tomo" y "Dicto" cargan
- [ ] Notificaciones: carga la lista
- [ ] Planes: abre browser de Mercado Pago
- [ ] Deep link manual: en Safari iOS escribir `danceclass://plans/success` → debe abrir la pantalla de éxito

---

## 6. Supabase — configuración de redirect para mobile

Para que Supabase Auth funcione correctamente en builds nativos (magic links, OAuth futuro):

- [ ] En Supabase → Authentication → URL Configuration → **Redirect URLs**: agregar `danceclass://**`
- [ ] Verificar que `https://dc-project-web.vercel.app/**` sigue en Redirect URLs (no reemplazar, agregar)

---

## 7. Comandos de build

Correr siempre desde `apps/mobile/`:

```bash
# Build de desarrollo (Expo Dev Client)
eas build --profile development --platform android

# Build de preview interno (APK directo para Android)
eas build --profile preview --platform android

# Build de preview para iOS (requiere Apple Dev Account)
eas build --profile preview --platform ios

# Build de producción para tiendas
eas build --profile production --platform all
```

Descargar el APK de preview desde el dashboard de expo.dev o con:
```bash
eas build:list --profile preview --platform android --limit 1
```

---

## 8. Checklist post-build (antes de distribuir)

- [ ] Instalar el APK en un dispositivo Android físico y verificar que abre
- [ ] Verificar que el splash screen se muestra con el asset real (no el placeholder 1×1)
- [ ] Verificar que el ícono de la app se muestra correctamente en el launcher
- [ ] Repetir pruebas mínimas de la sección 5 en el build nativo
- [ ] Verificar que el deep link `danceclass://plans/success` funciona en el build nativo

---

## Pendiente de tu lado (no bloqueantes para el APK preview de Android)

- [ ] Assets reales (icon, adaptive-icon, splash)
- [ ] Cuenta de Expo (expo.dev) — gratuita
- [ ] Variables de entorno configuradas en Expo dashboard
- [ ] Apple Developer Account — **solo necesaria para iOS**
- [ ] Google Play Developer Account — **solo necesaria para submit a Play Store** (no para el APK preview)
- [ ] `eas init` para obtener el `projectId` real
