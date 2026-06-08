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

/* 17 familias recorriendo TODO el espectro cromático — a propósito vivas y
   diversas. Estas NO están atadas a la paleta de marca (morado/coral); la
   restricción de marca aplica al chrome general de la app, no a los acentos
   por estilo. Ver la nota en CLAUDE.md ("Color por estilo de baile"). */
const FAMILIES: Record<string, Family> = {
  red:     ['#FEE2E2', '#DC2626', '#3A1413', '#FCA5A5', '#991B1B', '#EF4444'],
  orange:  ['#FFEDD5', '#C2410C', '#3A1E0C', '#FDBA74', '#9A3412', '#F97316'],
  amber:   ['#FEF3C7', '#B45309', '#3A2A08', '#FCD34D', '#92400E', '#F59E0B'],
  yellow:  ['#FEF9C3', '#A16207', '#33300A', '#FDE047', '#854D0E', '#EAB308'],
  lime:    ['#ECFCCB', '#4D7C0F', '#1F2A0A', '#BEF264', '#3F6212', '#84CC16'],
  green:   ['#DCFCE7', '#15803D', '#0C2A18', '#86EFAC', '#166534', '#22C55E'],
  emerald: ['#D1FAE5', '#047857', '#04261C', '#6EE7B7', '#065F46', '#10B981'],
  teal:    ['#CCFBF1', '#0F766E', '#042F2A', '#5EEAD4', '#115E59', '#14B8A6'],
  cyan:    ['#CFFAFE', '#0E7490', '#08323A', '#67E8F9', '#155E75', '#06B6D4'],
  sky:     ['#E0F2FE', '#0369A1', '#0A2A3F', '#7DD3FC', '#075985', '#0EA5E9'],
  blue:    ['#DBEAFE', '#1D4ED8', '#11214A', '#93C5FD', '#1E40AF', '#3B82F6'],
  indigo:  ['#E0E7FF', '#4338CA', '#1A1A45', '#A5B4FC', '#3730A3', '#6366F1'],
  violet:  ['#EDE9FE', '#6D28D9', '#251650', '#C4B5FD', '#5B21B6', '#8B5CF6'],
  purple:  ['#F3E8FF', '#7E22CE', '#2A1245', '#D8B4FE', '#6B21A8', '#A855F7'],
  fuchsia: ['#FAE8FF', '#A21CAF', '#330A38', '#F0ABFC', '#86198F', '#D946EF'],
  pink:    ['#FCE7F3', '#BE185D', '#3A0F25', '#F9A8D4', '#9D174D', '#EC4899'],
  rose:    ['#FFE4E6', '#BE123C', '#3A0F18', '#FDA4AF', '#9F1239', '#F43F5E'],
}

const FAMILY_ORDER = Object.keys(FAMILIES)

/** Mapa explícito estilo → familia (los estilos de DANCE_STYLES + alias comunes).
    Asignado para máxima variedad: estilos comunes reparten todo el círculo cromático. */
const STYLE_FAMILY: Record<string, string> = {
  'bachata': 'rose',
  'ballet': 'sky',
  'breaking': 'orange',
  'contemporáneo': 'teal',
  'contemporaneo': 'teal',
  'coreografía': 'violet',
  'coreografia': 'violet',
  'cueca': 'amber',
  'cumbia': 'red',
  'dancehall': 'lime',
  'danza árabe': 'fuchsia',
  'danza arabe': 'fuchsia',
  'danza contemporánea': 'cyan',
  'danza contemporanea': 'cyan',
  'fit dance': 'lime',
  'flamenco': 'red',
  'freestyle': 'violet',
  'girly style': 'pink',
  'heels': 'fuchsia',
  'hip hop': 'indigo',
  'hip-hop': 'indigo',
  'house': 'violet',
  'k-pop': 'sky',
  'kpop': 'sky',
  'kizomba': 'amber',
  'locking': 'yellow',
  'merengue': 'orange',
  'popping': 'cyan',
  'reggaetón': 'amber',
  'reggaeton': 'amber',
  'salsa': 'rose',
  'street jazz': 'blue',
  'tango': 'purple',
  'twerk': 'fuchsia',
  'urbano': 'emerald',
  'vogue': 'purple',
  'waacking': 'purple',
  'zumba': 'green',
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
