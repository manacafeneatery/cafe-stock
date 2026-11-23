import { supabase } from './supabase'
import type { Ingredient } from './types'

// Kolom eksplisit: kolom biaya (unit_cost) tidak boleh dibaca lewat API
export const ING_COLS = 'id, name, unit, category, category_id, min_stock, current_stock, is_active'
export const MOVE_COLS = 'id, ingredient_id, type, quantity, note, created_by, created_at'

/**
 * Ambil daftar bahan. HPP (avg_cost) & harga beli terakhir (last_cost) hanya
 * diambil bila withCosts = true (khusus Admin; RLS menolak untuk Karyawan).
 */
export async function loadIngredients(withCosts: boolean, activeOnly = false) {
  let q = supabase.from('ingredients').select(ING_COLS).order('name')
  if (activeOnly) q = q.eq('is_active', true)
  const costsQ = withCosts ? supabase.from('ingredient_costs').select('ingredient_id, avg_cost, last_cost') : null

  const [a, c] = await Promise.all([q, costsQ ?? Promise.resolve({ data: null, error: null })])
  const costs = new Map<string, { avg_cost: number; last_cost: number }>(
    ((c.data ?? []) as { ingredient_id: string; avg_cost: number; last_cost: number }[]).map((r) => [r.ingredient_id, r]),
  )
  const data = ((a.data ?? []) as unknown as Omit<Ingredient, 'avg_cost' | 'last_cost'>[]).map((i) => ({
    ...i,
    avg_cost: Number(costs.get(i.id)?.avg_cost ?? 0),
    last_cost: Number(costs.get(i.id)?.last_cost ?? 0),
  })) as Ingredient[]
  return { data, error: a.error ?? c.error }
}
