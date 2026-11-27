// Daftar belanja: pembulatan jumlah & teks untuk dibagikan (WhatsApp).
// File ini identik dengan mobile/src/lib/shopping.ts — ubah keduanya bersamaan.
import { num } from './analytics'

export const STORE_NAME = 'MANA Cafe'

export interface ShopItem { name: string; unit: string; qty: number; category: string }

// Bulatkan ke atas agar praktis dibeli: >= 10 jadi bilangan bulat, kecil boleh 1 desimal
export const niceQty = (n: number): number => (n >= 10 ? Math.ceil(n) : Math.ceil(n * 10) / 10)

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export function shoppingText(items: ShopItem[], date = new Date()): string {
  const byCat = new Map<string, ShopItem[]>()
  for (const i of [...items].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))) {
    byCat.set(i.category, [...(byCat.get(i.category) ?? []), i])
  }
  const lines = [
    `🛒 *Daftar belanja ${STORE_NAME}*`,
    `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
  ]
  for (const [cat, list] of byCat) {
    lines.push('', `*${cat}*`)
    for (const i of list) lines.push(`• ${i.name} — ${num(i.qty)} ${i.unit}`)
  }
  lines.push('', `Total ${items.length} item`)
  return lines.join('\n')
}
