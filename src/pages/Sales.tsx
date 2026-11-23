import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Menu } from '../lib/types'
import { dateTime, num, rupiah } from '../lib/analytics'

interface Sale {
  id: string; menu_id: string | null; menu_name: string; quantity: number
  unit_price: number; note: string | null; created_at: string
}
type Msg = { ok: boolean; text: string } | null

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }

export default function Sales({ isAdmin }: { isAdmin: boolean }) {
  const [menus, setMenus] = useState<Menu[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [cogs, setCogs] = useState<Map<string, number>>(new Map())
  const [qty, setQty] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('menus').select('id, name, price, is_active').eq('is_active', true).order('name'),
      supabase.from('sales').select('id, menu_id, menu_name, quantity, unit_price, note, created_at')
        .gte('created_at', startOfToday()).order('created_at', { ascending: false }).limit(100),
    ])
    if (a.error) setMsg({ ok: false, text: `${a.error.message} (sudah menjalankan 006_sales.sql?)` })
    if (a.data) setMenus(a.data as Menu[])
    const list = (b.data ?? []) as Sale[]
    setSales(list)
    if (isAdmin && list.length) {
      const c = await supabase.from('sale_costs').select('sale_id, cogs').in('sale_id', list.map((s) => s.id))
      setCogs(new Map(((c.data ?? []) as { sale_id: string; cogs: number }[]).map((r) => [r.sale_id, Number(r.cogs)])))
    } else setCogs(new Map())
  }, [isAdmin])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => menus.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())), [menus, q])
  const cart = menus.filter((m) => (qty[m.id] ?? 0) > 0)
  const cartItems = cart.reduce((t, m) => t + qty[m.id], 0)
  const cartTotal = cart.reduce((t, m) => t + qty[m.id] * Number(m.price), 0)

  const step = (id: string, d: number) =>
    setQty((s) => ({ ...s, [id]: Math.max(0, Math.min(999, (s[id] ?? 0) + d)) }))

  const submit = async () => {
    if (cart.length === 0) return
    setBusy(true); setMsg(null)
    const failed: string[] = []
    const done: Record<string, number> = { ...qty }
    for (const m of cart) {
      const { error } = await supabase.rpc('record_sale', { p_menu: m.id, p_qty: qty[m.id], p_note: note.trim() || null })
      if (error) failed.push(`${m.name}: ${error.message}`)
      else done[m.id] = 0
    }
    setBusy(false)
    setQty(done)
    if (failed.length === 0) { setNote(''); setMsg({ ok: true, text: `Penjualan tercatat: ${cartItems} item. Stok bahan sudah terpotong.` }) }
    else setMsg({ ok: false, text: failed.join(' • ') })
    load()
  }

  // Ringkasan hari ini
  const items = sales.reduce((t, s) => t + s.quantity, 0)
  const revenue = sales.reduce((t, s) => t + s.quantity * Number(s.unit_price), 0)
  const totalCogs = [...cogs.values()].reduce((t, v) => t + v, 0)

  return (
    <>
      <header className="page-head">
        <div><h1>Penjualan</h1><p className="muted">Pilih menu yang terjual, stok bahan terpotong otomatis sesuai resep</p></div>
      </header>

      <div className="stats">
        <div className="stat"><span>Item terjual hari ini</span><strong>{num(items)}</strong></div>
        <div className="stat"><span>Transaksi</span><strong>{sales.length}</strong></div>
        {isAdmin && <div className="stat good"><span>Omzet</span><strong>{rupiah(revenue)}</strong></div>}
        {isAdmin && <div className="stat"><span>Laba kotor</span><strong>{rupiah(revenue - totalCogs)}</strong></div>}
      </div>

      {msg && <div className={msg.ok ? 'alert ok' : 'alert err'}>{msg.text}</div>}

      <section className="card">
        <input className="search" placeholder="🔍 Cari menu…" value={q} onChange={(e) => setQ(e.target.value)} />
        {menus.length === 0
          ? <p className="empty">Belum ada menu aktif. Admin dapat menambahkannya di menu <strong>Menu</strong>.</p>
          : (
            <div className="tiles">
              {shown.map((m) => {
                const n = qty[m.id] ?? 0
                return (
                  <div key={m.id} className={`tile ${n > 0 ? 'on' : ''}`}>
                    <div className="tile-name">{m.name}</div>
                    <div className="muted small">{rupiah(Number(m.price))}</div>
                    <div className="stepper">
                      <button type="button" onClick={() => step(m.id, -1)} disabled={n === 0} aria-label={`Kurangi ${m.name}`}>−</button>
                      <b>{n}</b>
                      <button type="button" onClick={() => step(m.id, 1)} aria-label={`Tambah ${m.name}`}>+</button>
                    </div>
                  </div>
                )
              })}
              {shown.length === 0 && <p className="empty">Menu tidak ditemukan.</p>}
            </div>
          )}

        <div className="cart">
          <label className="cart-note">Catatan (opsional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. pesanan meja 5" />
          </label>
          <div className="cart-sum">
            <span className="muted small">{cartItems} item</span>
            <strong>{rupiah(cartTotal)}</strong>
          </div>
          <button className="btn" disabled={busy || cart.length === 0} onClick={submit}>
            {busy ? 'Menyimpan…' : 'Catat penjualan'}
          </button>
        </div>
      </section>

      <section className="card">
        <header className="card-head"><h3>Penjualan hari ini</h3><button className="btn-ghost sm" onClick={load}>↻</button></header>
        {sales.length === 0 ? <p className="empty">Belum ada penjualan hari ini.</p> : (
          <ul className="list">
            {sales.map((s) => (
              <li key={s.id}>
                <div className="row-main">
                  <strong>{s.menu_name} <span className="muted">×{s.quantity}</span></strong>
                  <span className="muted small">{dateTime(s.created_at)}{s.note ? ` · ${s.note}` : ''}</span>
                </div>
                <div className="row-side">
                  <strong>{rupiah(s.quantity * Number(s.unit_price))}</strong>
                  {isAdmin && cogs.has(s.id) && <span className="muted small">HPP {rupiah(cogs.get(s.id)!)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
