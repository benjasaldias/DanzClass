import { test, expect } from '@playwright/test'
import {
  loadPostInteractions,
  resetPostInteractionLoaders,
  setPostLike,
  teachRequestSummary,
  TEACH_REQUEST_LABEL,
} from '../../packages/shared/src/lib/postInteractions'

/**
 * Cliente de Supabase de mentira: registra cada consulta y devuelve lo que se le
 * configuró por tabla. Alcanza para lo único que importa acá — que el loader
 * AGRUPE (una consulta por tabla, no una por tarjeta).
 */
function fakeSupabase(rows: Record<string, { post_id: string }[]>, opts: { failWrites?: boolean } = {}) {
  const calls: { table: string; op: string; ids?: string[] }[] = []

  function builder(table: string, op: string) {
    const state: { ids?: string[] } = {}
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: (_col: string, ids: string[]) => { state.ids = ids; return chain },
      then: (resolve: (v: any) => void) => {
        calls.push({ table, op, ids: state.ids })
        const data = (rows[table] ?? []).filter((r) => !state.ids || state.ids.includes(r.post_id))
        resolve({ data, error: null })
      },
    }
    return chain
  }

  const supabase = {
    from(table: string) {
      return {
        select: () => builder(table, 'select').select(),
        upsert: async () => { calls.push({ table, op: 'upsert' }); return { error: opts.failWrites ? { message: 'nope' } : null } },
        delete: () => {
          calls.push({ table, op: 'delete' })
          const chain: any = {
            eq: () => chain,
            then: (resolve: (v: any) => void) => resolve({ error: opts.failWrites ? { message: 'nope' } : null }),
          }
          return chain
        },
      }
    },
  }

  return { supabase, calls }
}

test.describe('loadPostInteractions', () => {
  test('agrupa todas las tarjetas del mismo tick en una consulta por tabla', async () => {
    resetPostInteractionLoaders()
    const { supabase, calls } = fakeSupabase({
      post_likes: [{ post_id: 'p1' }],
      post_teach_requests: [{ post_id: 'p3' }],
    })

    const [a, b, c] = await Promise.all([
      loadPostInteractions(supabase, 'u1', 'p1'),
      loadPostInteractions(supabase, 'u1', 'p2'),
      loadPostInteractions(supabase, 'u1', 'p3'),
    ])

    const selects = calls.filter((c2) => c2.op === 'select')
    expect(selects).toHaveLength(2)
    expect(selects[0].ids).toEqual(['p1', 'p2', 'p3'])

    expect(a).toEqual({ liked: true, requested: false })
    expect(b).toEqual({ liked: false, requested: false })
    expect(c).toEqual({ liked: false, requested: true })
  })

  test('sin sesión no consulta nada (feed público anónimo)', async () => {
    resetPostInteractionLoaders()
    const { supabase, calls } = fakeSupabase({})
    expect(await loadPostInteractions(supabase, null, 'p1')).toEqual({ liked: false, requested: false })
    expect(calls).toHaveLength(0)
  })

  test('dos tarjetas del mismo video comparten la misma respuesta', async () => {
    resetPostInteractionLoaders()
    const { supabase, calls } = fakeSupabase({ post_likes: [{ post_id: 'p1' }] })
    const [a, b] = await Promise.all([
      loadPostInteractions(supabase, 'u1', 'p1'),
      loadPostInteractions(supabase, 'u1', 'p1'),
    ])
    expect(a.liked).toBe(true)
    expect(b.liked).toBe(true)
    expect(calls.filter((c) => c.op === 'select')[0].ids).toEqual(['p1'])
  })
})

test.describe('setPostLike', () => {
  test('marcar escribe, desmarcar borra', async () => {
    const { supabase, calls } = fakeSupabase({})
    expect(await setPostLike(supabase, 'p1', 'u1', true)).toBe(true)
    expect(await setPostLike(supabase, 'p1', 'u1', false)).toBe(true)
    expect(calls.map((c) => c.op)).toEqual(['upsert', 'delete'])
  })

  test('si la escritura falla lo dice, para que la UI revierta su optimismo', async () => {
    const { supabase } = fakeSupabase({}, { failWrites: true })
    expect(await setPostLike(supabase, 'p1', 'u1', true)).toBe(false)
  })
})

test.describe('teachRequestSummary', () => {
  test('sin pedidos', () => {
    expect(teachRequestSummary(0)).toBe('Nadie la ha pedido todavía')
  })

  test('singular y plural', () => {
    expect(teachRequestSummary(1)).toBe('1 persona quiere que la enseñes')
    expect(teachRequestSummary(12)).toBe('12 personas quieren que la enseñes')
  })

  test('el texto del botón es único para web y mobile', () => {
    expect(TEACH_REQUEST_LABEL).toBe('¡Enséñala!')
  })
})
