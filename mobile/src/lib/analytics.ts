import type { Ingredient, Movement } from './types'

// ---- Aturan klasifikasi (sama dengan versi web) ----
export const WINDOW_DAYS = 30        // periode analisis pemakaian
export const LOW_DAYS_COVER = 3      // "akan habis" jika sisa stok <= 3 hari pemakaian
export const FAST_TURNOVER = 0.6     // >= 60% dari stok tersedia terpakai dalam periode
export const SLOW_TURNOVER = 0.15    // <= 15% terpakai (atau tidak ada pemakaian)

export interface IngredientStat extends Ingredient {
  usage: number
  avgDaily: number
  daysLeft: number | null
  turnover: number
  stockValue: number
  isLow: boolean
  isFast: boolean
  isSlow: boolean
}

export function computeStats(ingredients: Ingredient[], movements: Movement[]): IngredientStat[] {
  const usage = new Map<string, number>()
  for (const m of movements) {
    // Pemakaian = keluar + waste; pembatalan penjualan (void_in) mengurangi.
    let d = 0
    if (m.type === 'out' || m.type === 'waste') d = Number(m.quantity)
    else if (m.type === 'void_in') d = -Number(m.quantity)
    else continue
    usage.set(m.ingredient_id, (usage.get(m.ingredient_id) ?? 0) + d)
  }

  return ingredients.map((i) => {
    const used = Math.max(0, usage.get(i.id) ?? 0)
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

// Saran jumlah beli: fast moving diisi sampai 2x stok minimum, bahan lain sampai 1x
export const RESTOCK_FAST_MULT = 2
export const RESTOCK_NORMAL_MULT = 1
export const restockQty = (stock: number, min: number, isFast: boolean) =>
  Math.max(0, min * (isFast ? RESTOCK_FAST_MULT : RESTOCK_NORMAL_MULT) - stock)

// ---- Format (manual agar konsisten di semua perangkat, tanpa bergantung Intl) ----
const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export const num = (n: number): string => {
  const r = Math.round(Number(n) * 100) / 100
  if (!Number.isFinite(r)) return '0'
  const [i, d] = Math.abs(r).toString().split('.')
  return `${r < 0 ? '-' : ''}${group(i)}${d ? ',' + d : ''}`
}

export const rupiah = (n: number): string => {
  const v = Number(n)
  if (!Number.isFinite(v)) return 'Rp 0'
  // nilai kecil (HPP per gram/ml) tetap menampilkan desimal
  if (Math.abs(v) < 1000 && v % 1 !== 0) return `${v < 0 ? '-' : ''}Rp ${num(Math.abs(v))}`
  return `${v < 0 ? '-' : ''}Rp ${group(Math.round(Math.abs(v)).toString())}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const two = (n: number) => String(n).padStart(2, '0')

export const dateTime = (iso: string): string => {
  const d = new Date(iso)
  return `${two(d.getDate())} ${MONTHS[d.getMonth()]} ${two(d.getHours())}.${two(d.getMinutes())}`
}

// Teks angka dari keyboard (boleh memakai koma) -> number
export const toNum = (s: string): number => Number(String(s).replace(',', '.'))

// UUID v4 sederhana (untuk penanda sesi opname)
export const uuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
