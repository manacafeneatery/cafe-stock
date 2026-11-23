import type { Ingredient, Movement } from './types'

// ---- Aturan klasifikasi (mudah diubah) ----
export const WINDOW_DAYS = 30        // periode analisis pemakaian
export const LOW_DAYS_COVER = 3      // "akan habis" jika sisa stok <= 3 hari pemakaian
export const FAST_TURNOVER = 0.6     // >= 60% dari stok tersedia terpakai dalam periode
export const SLOW_TURNOVER = 0.15    // <= 15% terpakai (atau tidak ada pemakaian)

export interface IngredientStat extends Ingredient {
  usage: number          // total keluar (out + waste) dalam periode
  avgDaily: number       // rata-rata pemakaian per hari
  daysLeft: number | null // estimasi sisa hari; null jika belum ada pemakaian
  turnover: number       // usage / (stok + usage)
  stockValue: number     // nilai stok = stok x HPP
  isLow: boolean
  isFast: boolean
  isSlow: boolean
}

export function computeStats(ingredients: Ingredient[], movements: Movement[]): IngredientStat[] {
  const usage = new Map<string, number>()
  for (const m of movements) {
    if (m.type !== 'out' && m.type !== 'waste') continue   // opname & pembelian bukan pemakaian
    usage.set(m.ingredient_id, (usage.get(m.ingredient_id) ?? 0) + Number(m.quantity))
  }

  return ingredients.map((i) => {
    const used = usage.get(i.id) ?? 0
    const stock = Number(i.current_stock)
    const avgDaily = used / WINDOW_DAYS
    const daysLeft = avgDaily > 0 ? stock / avgDaily : null
    const turnover = stock + used > 0 ? used / (stock + used) : 0
    const isLow = stock <= Number(i.min_stock) || (daysLeft !== null && daysLeft <= LOW_DAYS_COVER)
    const isFast = used > 0 && turnover >= FAST_TURNOVER
    const isSlow = !isFast && !isLow && (used === 0 || turnover <= SLOW_TURNOVER)
    return {
      ...i,
      current_stock: stock,
      avg_cost: Number(i.avg_cost),
      last_cost: Number(i.last_cost),
      min_stock: Number(i.min_stock),
      usage: used,
      avgDaily,
      daysLeft,
      turnover,
      stockValue: stock * Number(i.avg_cost),
      isLow,
      isFast,
      isSlow,
    }
  })
}

// ---- Status stok terhadap stok minimum ----
export type StockLevel = 'empty' | 'low' | 'ok'

export function stockLevel(stock: number, min: number): StockLevel {
  if (stock <= 0) return 'empty'
  if (stock <= min) return 'low'
  return 'ok'
}

export const LEVEL_LABEL: Record<StockLevel, string> = { empty: 'Habis', low: 'Menipis', ok: 'Aman' }

// Saran jumlah beli: bahan fast moving diisi sampai 2x stok minimum, bahan lain sampai 1x
export const RESTOCK_FAST_MULT = 2
export const RESTOCK_NORMAL_MULT = 1
export const restockQty = (stock: number, min: number, isFast: boolean) =>
  Math.max(0, min * (isFast ? RESTOCK_FAST_MULT : RESTOCK_NORMAL_MULT) - stock)

// ---- Format ----
export const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

export const num = (n: number) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
