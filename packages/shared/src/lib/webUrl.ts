// Host único del backend web, usado por mobile para armar URLs de fetch
// absolutas (D-3). Antes vivía copiado como `const WEB_URL =
// 'https://dc-project-web.vercel.app'` en 18 archivos de mobile — el día que
// se apunte `danzclass.com` al deployment, bastaba con olvidar uno para que
// una pantalla llamara a un host que ya no sirve el backend. `EXPO_PUBLIC_*`
// se inlinea en build time por Metro/babel-preset-expo; sin esa env var
// (hoy no está configurada) cae al dominio de Vercel actual.
//
// En `apps/web` esta misma constante también sirve de último fallback detrás
// de `process.env.APP_URL`/`NEXT_PUBLIC_APP_URL` (que sí están configuradas
// en Vercel) — así el literal del dominio vive en un solo lugar del repo.
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://dc-project-web.vercel.app'
