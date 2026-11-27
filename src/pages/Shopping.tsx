import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { loadIngredients, MOVE_COLS } from '../lib/data'
import { computeStats, num, restockQty, rupiah, WINDOW_DAYS } from '../lib/analytics'
import { niceQty, shoppingText } from '../lib/shopping'
import type { Category, Ingredient, Movement } from '../lib/types'

type Msg = { ok: boolean; text: string } | null
interface Recv { id: string; qty: string; price: string; mode: 'unit' | 'total' }

export default function Shopping({ isAdmin }: { isAdmin: boolean }) {
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [moves, setMoves] = useState<Movement[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [qty, setQty] = useState<Record<string, string>>({})       // jumlah yang diubah manual
  const [skip, setSkip] = useState<Record<string, boolean>>({})    // bahan yang tidak ikut daftar
  const [recv, setRecv] = useState<Recv | null>(null)
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString()
    const [a, b, c] = await Promise.all([
      loadIngredients(isAdmin, true),
      supabase.from('stock_movements').select(MOVE_COLS).gte('created_at', since).in('type', ['out', 'waste', 'void_in']),
      supabase.from('categories').select('*').order('name'),
    ])
    setIngs(a.data)
    if (b.data) setMoves(b.data as unknown as Movement[])
    if (c.data) setCats(c.data as Category[])
  }, [isAdmin])
  useEffect(() => { load() }, [load])

  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats])
  const items = useMemo(() => computeStats(ings, moves)
    .filter((s) => s.isLow)
    .map((s) => ({ ...s, suggest: niceQty(restockQty(s.current_stock, s.min_stock, s.isFast)), cat: (s.category_id && catName.get(s.category_id)) || 'Tanpa kategori' }))
    .filter((s) => s.suggest > 0)
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name)), [ings, moves, catName])

  const amount = (id: string, suggest: number) => {
    const v = Number((qty[id] ?? '').replace(',', '.'))
    return qty[id] !== undefined && qty[id] !== '' && v > 0 ? v : suggest
  }
  const picked = items.filter((i) => !skip[i.id])
  const estimate = picked.reduce((t, i) => t + amount(i.id, i.suggest) * i.last_cost, 0)
  const text = () => shoppingText(picked.map((i) => ({ name: i.name, unit: i.unit, qty: amount(i.id, i.suggest), category: i.cat })))

  const share = async () => {
    if (picked.length === 0) return
    const t = text()
    if (navigator.share) { try { await navigator.share({ text: t }); return } catch { /* dibatalkan pengguna */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank')
  }
  const copy = async () => {
    if (picked.length === 0) return
    try { await navigator.clipboard.writeText(text()); setMsg({ ok: true, text: 'Daftar belanja disalin. Tempel di WhatsApp atau catatan.' }) }
    catch { setMsg({ ok: false, text: 'Tidak bisa menyalin. Gunakan tombol Bagikan.' }) }
  }

  // ---- Terima barang -> masuk ke stok ----
  const openRecv = (i: { id: string; suggest: number; last_cost: number }) => {
    const hasRef = i.last_cost > 0
    setRecv({ id: i.id, qty: String(amount(i.id, i.suggest)), price: hasRef ? String(i.last_cost) : '', mode: hasRef ? 'unit' : 'total' })
  }
  const saveRecv = async (e: FormEvent) => {
    e.preventDefault()
    if (!recv) return
    const q = Number(recv.qty.replace(',', '.')), p = Number(recv.price.replace(',', '.'))
    if (!(q > 0)) return setMsg({ ok: false, text: 'Jumlah harus lebih dari 0.' })
    if (recv.price === '' || !(p >= 0)) return setMsg({ ok: false, text: 'Isi harga pembelian.' })
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    const ing = ings.find((i) => i.id === recv.id)!
    const { error } = await supabase.from('stock_movements').insert({
      ingredient_id: recv.id, type: 'in', quantity: q, unit_cost: recv.mode === 'unit' ? p : p / q, note: 'Belanja', created_by: u.user?.id,
    })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: `Tersimpan: masuk ${num(q)} ${ing.unit} ${ing.name}.` })
    setRecv(null); load()
  }

  // kelompokkan per kategori
  const groups = useMemo(() => {
    const m = new Map<string, typeof items>()
    for (const i of items) m.set(i.cat, [...(m.get(i.cat) ?? []), i])
    return [...m.entries()]
  }, [items])

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Daftar Belanja</h1>
          <p className="muted">Dari bahan yang menipis. Jumlah mengikuti saran beli (fast moving 2× minimum, lainnya 1×) dan bisa diubah.</p>
        </div>
        <div className="actions">
          <button className="btn-ghost" disabled={picked.length === 0} onClick={copy}>Salin</button>
          <button className="btn" disabled={picked.length === 0} onClick={share}>Bagikan ke WhatsApp</button>
        </div>
      </header>

      <div className="stats">
        <div className="stat"><span>Item di daftar</span><strong>{picked.length}</strong></div>
        {isAdmin && <div className="stat good"><span>Perkiraan biaya</span><strong>{rupiah(estimate)}</strong></div>}
      </div>

      {msg && <div className={msg.ok ? 'alert ok' : 'alert err'}>{msg.text}</div>}

      {items.length === 0 ? (
        <section className="card"><p className="empty">🎉 Tidak ada bahan yang perlu dibeli saat ini.</p></section>
      ) : groups.map(([cat, list]) => (
        <section className="card" key={cat}>
          <header className="card-head"><h3>{cat}</h3><span className="badge">{list.length}</span></header>
          <ul className="list">
            {list.map((i) => (
              <li key={i.id} className="shop-li">
                <div className="shop-row">
                  <input type="checkbox" className="shop-check" checked={!skip[i.id]} onChange={(e) => setSkip({ ...skip, [i.id]: !e.target.checked })} aria-label={`Ikutkan ${i.name}`} />
                  <div className="row-main">
                    <strong>{i.name}</strong>
                    <span className="muted small">Stok {num(i.current_stock)} · min {num(i.min_stock)} {i.unit}{i.isFast ? ' · fast moving' : ''}</span>
                    {isAdmin && i.last_cost > 0 && <span className="muted small">≈ {rupiah(amount(i.id, i.suggest) * i.last_cost)}</span>}
                  </div>
                  <div className="shop-qty">
                    <input type="text" inputMode="decimal" value={qty[i.id] ?? String(i.suggest)} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} aria-label={`Jumlah ${i.name}`} />
                    <span className="muted small">{i.unit}</span>
                  </div>
                  <button className="btn-ghost sm" onClick={() => openRecv(i)}>Terima</button>
                </div>

                {recv?.id === i.id && (
                  <form className="shop-recv" onSubmit={saveRecv}>
                    <label>Jumlah diterima ({i.unit})
                      <input type="text" inputMode="decimal" value={recv.qty} onChange={(e) => setRecv({ ...recv, qty: e.target.value })} required />
                    </label>
                    <label>{recv.mode === 'unit' ? `Harga per ${i.unit} (Rp)` : 'Total harga pembelian (Rp)'}
                      <input type="text" inputMode="decimal" value={recv.price} onChange={(e) => setRecv({ ...recv, price: e.target.value })} required placeholder="0" />
                      {recv.mode === 'unit' && i.last_cost > 0 && <small className="muted">Harga beli terakhir, ubah jika berbeda</small>}
                    </label>
                    <div className="actions">
                      <button className="btn" disabled={busy}>{busy ? 'Menyimpan…' : 'Masukkan ke stok'}</button>
                      <button type="button" className="btn-ghost" onClick={() => setRecv(null)}>Batal</button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
