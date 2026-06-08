/* ============================================================
   DanzClass — Sistema de color por estilo de baile
   ------------------------------------------------------------
   Cada estilo de baile tiene su propio acento cromático. Esto
   rompe la monotonía del morado de marca y le da identidad a
   cada pill/badge de estilo en feed, perfil, explorar y cards.

   Una familia de color = [softLight, inkLight, softDark, inkDark, gradA, gradB]
     softLight / inkLight → fondo y texto del pill en tema claro
     softDark  / inkDark  → fondo y texto del pill en tema oscuro
     gradA     / gradB     → gradiente para placeholders de media

   styleColor(name, dark) resuelve un estilo (incluyendo texto
   libre) a un objeto { soft, ink, gradA, gradB }. Estilos no
   mapeados caen de forma determinista en una familia vía hash,
   para que el mismo texto siempre reciba el mismo color.
   ============================================================ */

export interface StyleColor {
  /** fondo del pill según el tema */
  soft: string
  /** color de texto del pill según el tema */
  ink: string
  /** gradiente (inicio) para placeholders de media */
  gradA: string
  /** gradiente (fin) para placeholders de media */
  gradB: string
}

type Family = [string, string, string, string, string, string]

const FAMILIES: Record<string, Family> = {
  violet:  ['#ECE8FB', '#5B45CC', '#271A57', '#B3A6F8', '#3A2486', '#7059E6'],
  coral:   ['#FCEADF', '#C8431B', '#3A1E12', '#FF936B', '#7A2A12', '#EC5A2B'],
  indigo:  ['#E5E9FB', '#3B53C4', '#161E44', '#8FA2F2', '#1B2A6B', '#3B53C4'],
  lime:    ['#EEF8CE', '#5A6B12', '#2C3A10', '#C7F24E', '#4A5510', '#9BB01C'],
  teal:    ['#DCF1F4', '#0E7C90', '#0A2A30', '#5FD0E0', '#0D4A55', '#1AA0B8'],
  rose:    ['#FBE3E6', '#C42648', '#3A121B', '#FF7C97', '#7A1228', '#E0395C'],
  magenta: ['#FBE5F3', '#B41E7C', '#3A1230', '#F389C9', '#6B1250', '#D6399E'],
  purple:  ['#F1E5FB', '#7C25BC', '#27123A', '#C98DF2', '#4A1270', '#9B39D6'],
  amber:   ['#FAF0D5', '#A8760E', '#3A2C0C', '#F0C44E', '#6B4A0E', '#D69A1A'],
  emerald: ['#DDF2E5', '#1E9D57', '#10331F', '#45D389', '#0D5A32', '#1E9D57'],
  blue:    ['#DEEAFB', '#2563C4', '#11203F', '#7BB0F2', '#143A72', '#2E78D6'],
  slate:   ['#E8E6F0', '#4A4668', '#221C3A', '#B0A8CC', '#2A2348', '#5A4F86'],
}

const FAMILY_ORDER = Object.keys(FAMILIES)

/** Mapa explícito estilo → familia (los estilos de DANCE_STYLES + alias comunes). */
const STYLE_FAMILY: Record<string, string> = {
  'bachata': 'magenta',
  'ballet': 'slate',
  'breaking': 'coral',
  'contemporáneo': 'slate',
  'contemporaneo': 'slate',
  'coreografía': 'violet',
  'coreografia': 'violet',
  'cueca': 'amber',
  'cumbia': 'rose',
  'dancehall': 'lime',
  'danza árabe': 'amber',
  'danza arabe': 'amber',
  'danza contemporánea': 'slate',
  'danza contemporanea': 'slate',
  'fit dance': 'emerald',
  'flamenco': 'rose',
  'freestyle': 'violet',
  'girly style': 'magenta',
  'heels': 'purple',
  'hip hop': 'indigo',
  'hip-hop': 'indigo',
  'house': 'violet',
  'k-pop': 'blue',
  'kpop': 'blue',
  'kizomba': 'amber',
  'locking': 'lime',
  'merengue': 'amber',
  'popping': 'teal',
  'reggaetón': 'coral',
  'reggaeton': 'coral',
  'salsa': 'rose',
  'street jazz': 'blue',
  'tango': 'slate',
  'twerk': 'magenta',
  'urbano': 'violet',
  'vogue': 'purple',
  'waacking': 'purple',
  'zumba': 'emerald',
}

function hashFamily(name: string): string {
  let n = 0
  for (let i = 0; i < name.length; i++) n = (n + name.charCodeAt(i)) | 0
  return FAMILY_ORDER[Math.abs(n) % FAMILY_ORDER.length]
}

/**
 * Resuelve un estilo de baile a su acento cromático.
 * @param name  nombre del estilo (case-insensitive; tolera texto libre)
 * @param dark  true para tema oscuro
 */
export function styleColor(name: string | null | undefined, dark = false): StyleColor {
  const key = (name ?? '').trim().toLowerCase()
  const family = FAMILIES[STYLE_FAMILY[key] ?? (key ? hashFamily(key) : 'violet')]
  return {
    soft: dark ? family[2] : family[0],
    ink: dark ? family[3] : family[1],
    gradA: family[4],
    gradB: family[5],
  }
}
