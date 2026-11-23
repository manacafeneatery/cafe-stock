// Parser laporan "Analitik Item" dari kasir Ideku (CSV).
// File ini identik dengan mobile/src/lib/pos.ts — ubah keduanya bersamaan.

export interface PosRow {
  key: string        // kunci pencocokan: Kode Item, atau "name:<nama>" bila tidak ada kode
  name: string
  code: string
  category: string
  qty: number        // "Item Dipesan"
  refund: number     // "Pengembalian dana" (nominal Rp, bukan jumlah item)
}

export interface PosReport {
  store: string
  date: string       // YYYY-MM-DD
  rows: PosRow[]
}

function parseCsv(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ } else quoted = false
      } else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''; out.push(row); row = []
    } else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); out.push(row) }
  return out
}

// "23/11/26" -> "2026-11-23"
function parseDate(s: string): string {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) throw new Error(`Format tanggal tidak dikenali: "${s}" (diharapkan DD/MM/YY).`)
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

export function parseIdekuReport(input: string): PosReport {
  const rows = parseCsv(input.replace(/^﻿/, ''))

  const mi = rows.findIndex((r) => r[0]?.trim() === 'Toko')
  if (mi < 0 || !rows[mi + 1]) throw new Error('Format laporan tidak dikenali. Gunakan laporan "Analitik Item" dari Ideku (CSV).')
  const meta = rows[mi + 1]
  const start = parseDate(meta[1] ?? '')
  const end = parseDate(meta[2] ?? '')
  if (start !== end) throw new Error(`Laporan mencakup beberapa hari (${start} s/d ${end}). Unduh laporan untuk SATU hari saja.`)

  const hi = rows.findIndex((r) => r[0]?.trim() === 'Item')
  if (hi < 0) throw new Error('Tabel item tidak ditemukan di laporan.')
  const header = rows[hi].map((h) => h.trim())
  const col = (name: string) => header.indexOf(name)
  const iName = col('Item'), iCode = col('Kode Item'), iCat = col('Kategori'), iQty = col('Item Dipesan'), iRef = col('Pengembalian dana')
  if (iQty < 0) throw new Error('Kolom "Item Dipesan" tidak ditemukan di laporan.')

  const byKey = new Map<string, PosRow>()
  for (const r of rows.slice(hi + 1)) {
    const name = (r[iName] ?? '').trim()
    if (!name) continue
    const qty = Number(r[iQty])
    if (!(qty > 0)) continue
    const code = (iCode >= 0 ? r[iCode] ?? '' : '').trim()
    const key = code && code !== '-' ? code : `name:${name.toLowerCase()}`
    const prev = byKey.get(key)
    if (prev) { prev.qty += qty; continue }
    byKey.set(key, {
      key, name, code: code === '-' ? '' : code, category: (iCat >= 0 ? r[iCat] ?? '' : '').trim(),
      qty, refund: iRef >= 0 ? Number(r[iRef]) || 0 : 0,
    })
  }
  return { store: (meta[0] ?? '').trim(), date: start, rows: [...byKey.values()] }
}
