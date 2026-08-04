/**
 * Interacciones sobre publicaciones de video: "me gusta" y "¡Enséñala!".
 * Ver 076_post_interactions.sql — la base es la autoridad; esto es el cliente.
 *
 * Los CONTADORES vienen en la fila del post (`likes_count`,
 * `teach_requests_count`), así que no hay que consultarlos. Lo que sí hay que
 * consultar es el estado del que mira ("¿lo marqué yo?"), y ahí está el riesgo:
 * el feed pinta hasta 20 tarjetas y cada una lo necesita. Una consulta por
 * tarjeta serían 40 idas a la base por pantalla.
 *
 * Por eso el loader AGRUPA: cada tarjeta pide su estado al montarse y el loader
 * junta todos los pedidos del mismo tick en dos consultas (una por tabla). El
 * alternativa era pasar el estado como prop desde las 8 pantallas que muestran
 * videos (feed SSR, feed cliente, perfil propio, perfil ajeno, y sus espejos en
 * mobile); agrupar acá deja esas pantallas sin tocar.
 */

type SupabaseLike = any

export interface PostInteractionFlags {
  /** El usuario le dio "me gusta". */
  liked: boolean
  /** El usuario pidió que enseñen esta coreografía. */
  requested: boolean
}

const NONE: PostInteractionFlags = { liked: false, requested: false }

type Resolver = (flags: PostInteractionFlags) => void

interface Loader {
  load(postId: string): Promise<PostInteractionFlags>
}

function createLoader(supabase: SupabaseLike, userId: string): Loader {
  let pending = new Map<string, Resolver[]>()
  let scheduled = false

  async function flush() {
    const batch = pending
    pending = new Map()
    scheduled = false

    const ids = Array.from(batch.keys())
    const liked = new Set<string>()
    const requested = new Set<string>()

    try {
      const [likesRes, teachRes] = await Promise.all([
        supabase.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', ids),
        supabase.from('post_teach_requests').select('post_id').eq('user_id', userId).in('post_id', ids),
      ])
      for (const row of (likesRes?.data ?? []) as { post_id: string }[]) liked.add(row.post_id)
      for (const row of (teachRes?.data ?? []) as { post_id: string }[]) requested.add(row.post_id)
    } catch {
      // Sin conexión: las tarjetas quedan en "no marcado". Es el estado neutro,
      // y el siguiente montaje vuelve a intentarlo.
    }

    for (const [postId, resolvers] of batch) {
      const flags: PostInteractionFlags = { liked: liked.has(postId), requested: requested.has(postId) }
      for (const resolve of resolvers) resolve(flags)
    }
  }

  return {
    load(postId: string) {
      return new Promise<PostInteractionFlags>((resolve) => {
        const waiting = pending.get(postId)
        if (waiting) waiting.push(resolve)
        else pending.set(postId, [resolve])

        if (!scheduled) {
          scheduled = true
          // setTimeout(0) y no microtask: da margen a que monten todas las
          // tarjetas del commit antes de disparar la consulta.
          setTimeout(() => { void flush() }, 0)
        }
      })
    },
  }
}

const loaders = new Map<string, Loader>()

/**
 * Loader agrupador para el usuario dado. Cacheado por usuario: cada plataforma
 * tiene un único cliente de Supabase, así que basta la sesión como clave.
 * Sin sesión (visitante anónimo del feed público) no consulta nada.
 */
export function loadPostInteractions(
  supabase: SupabaseLike,
  userId: string | null | undefined,
  postId: string
): Promise<PostInteractionFlags> {
  if (!userId || !postId) return Promise.resolve(NONE)
  let loader = loaders.get(userId)
  if (!loader) {
    loader = createLoader(supabase, userId)
    loaders.set(userId, loader)
  }
  return loader.load(postId)
}

/** Solo para tests: vacía el caché de loaders entre casos. */
export function resetPostInteractionLoaders(): void {
  loaders.clear()
}

/**
 * Agrega o quita el "me gusta". Va directo a la tabla (RLS lo permite, igual
 * que `follows`): es reversible, no notifica a nadie y no mueve dinero. El
 * contador lo recalcula un trigger, así que la UI no lo escribe.
 *
 * Devuelve `true` si la escritura quedó firme; `false` deja a la UI revertir su
 * actualización optimista.
 */
export async function setPostLike(
  supabase: SupabaseLike,
  postId: string,
  userId: string,
  liked: boolean
): Promise<boolean> {
  try {
    if (liked) {
      const { error } = await supabase
        .from('post_likes')
        .upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id' })
      return !error
    }
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId)
    return !error
  } catch {
    return false
  }
}

/** Texto del botón. Único, para que web y mobile no se desincronicen. */
export const TEACH_REQUEST_LABEL = '¡Enséñala!'

/**
 * Resumen de la demanda para el autor. Es lo que convierte la interacción en
 * algo accionable: "12 personas quieren que enseñes esto".
 */
export function teachRequestSummary(count: number): string {
  if (count <= 0) return 'Nadie la ha pedido todavía'
  if (count === 1) return '1 persona quiere que la enseñes'
  return `${count} personas quieren que la enseñes`
}
