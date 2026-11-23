import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Ingredient, Menu, RecipeItem } from '../lib/types'
import { num, rupiah } from '../lib/analytics'

type Msg = { ok: boolean; text: string } | null

function MenuCard({ menu, items, ings, onChange, onMsg }: {
  menu: Menu; items: RecipeItem[]; ings: Map<string, Ingredient>; onChange: () => void; onMsg: (m: Msg) => void
}) {
  const [open, setOpen] = useState(false)
  const [ingId, setIngId] = useState('')
  const [qty, setQty] = useState('')

  const lines = items.map((r) => {
    const ing = ings.get(r.ingredient_id)
    return { r, ing, cost: ing ? Number(r.quantity) * Number(ing.avg_cost) : 0 }
  })
  const hpp = lines.reduce((t, l) => t + l.cost, 0)
  const profit = menu.price - hpp
  const marginPct = menu.price > 0 ? (profit / menu.price) * 100 : 0
  const tone = menu.price <= 0 ? '' : marginPct >= 60 ? 'pos' : marginPct >= 40 ? '' : 'neg'
  const used = new Set(items.map((i) => i.ingredient_id))
  const options = [...ings.values()].filter((i) => !used.has(i.id))

  const run = async (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error } = await p
    onMsg(error ? { ok: false, text: error.message } : { ok: true, text: ok })
    onChange()
  }

  const addItem = async (e: FormEvent) => {
    e.preventDefault()
    if (!ingId || !(Number(qty) > 0)) return
    await run(supabase.from('recipe_items').insert({ menu_id: menu.id, ingredient_id: ingId, quantity: Number(qty) }), 'Bahan ditambahkan ke resep.')
    setIngId(''); setQty('')
  }
  const rename = () => {
    const name = window.prompt('Nama menu:', menu.name)?.trim()
    if (name && name !== menu.name) run(supabase.from('menus').update({ name }).eq('id', menu.id), 'Nama menu diubah.')
  }
  const setPrice = () => {
    const v = window.prompt('Harga jual (Rp):', String(menu.price))
    if (v === null) return
    const price = Number(v)
    if (!(price >= 0)) return onMsg({ ok: false, text: 'Harga tidak valid.' })
    run(supabase.from('menus').update({ price }).eq('id', menu.id), 'Harga jual diubah.')
  }
  const remove = () => {
    if (window.confirm(`Hapus menu "${menu.name}" beserta resepnya?`)) run(supabase.from('menus').delete().eq('id', menu.id), 'Menu dihapus.')
  }

  return (
    <section className="card menu-card">
      <header className="menu-head" onClick={() => setOpen(!open)}>
        <div className="row-main">
          <strong>{menu.name}</strong>
          <span className="muted small">{items.length} bahan · harga jual {rupiah(menu.price)}</span>
        </div>
        <div className="menu-figures">
          <div><span className="muted small">HPP / porsi</span><strong>{rupiah(hpp)}</strong></div>
          <div><span className="muted small">Margin</span><strong className={tone}>{menu.price > 0 ? `${num(marginPct)}%` : '—'}</strong></div>
        </div>
        <span className="chev">{open ? '▾' : '▸'}</span>
      </header>

      {open && (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Bahan</th><th className="r">Jumlah</th><th className="r">HPP bahan</th><th /></tr></thead>
              <tbody>
                {lines.map(({ r, ing, cost }) => (
                  <tr key={r.id}>
                    <td>{ing?.name ?? '—'}</td>
                    <td className="r">{num(r.quantity)} {ing?.unit}</td>
                    <td className="r">{rupiah(cost)}</td>
                    <td className="r"><button className="btn-ghost sm danger" onClick={() => run(supabase.from('recipe_items').delete().eq('id', r.id), 'Bahan dihapus dari resep.')}>Hapus</button></td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan={4} className="empty">Resep masih kosong.</td></tr>}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr><td colSpan={2}><strong>Total HPP / porsi</strong></td><td className="r"><strong>{rupiah(hpp)}</strong></td><td /></tr>
                  <tr><td colSpan={2}>Laba kotor / porsi</td><td className={`r ${profit >= 0 ? 'pos' : 'neg'}`}>{rupiah(profit)}</td><td /></tr>
                </tfoot>
              )}
            </table>
          </div>
          <form className="inline-form" onSubmit={addItem}>
            <select value={ingId} onChange={(e) => setIngId(e.target.value)} required>
              <option value="">— Tambah bahan —</option>
              {options.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
            <input className="qty-input" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Jumlah" required />
            <button className="btn">Tambah</button>
          </form>
          <div className="actions">
            <button className="btn-ghost sm" onClick={rename}>Ubah nama</button>
            <button className="btn-ghost sm" onClick={setPrice}>Ubah harga jual</button>
            <button className="btn-ghost sm danger" onClick={remove}>Hapus menu</button>
          </div>
        </>
      )}
    </section>
  )
}

export default function Menus() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [items, setItems] = useState<RecipeItem[]>([])
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [msg, setMsg] = useState<Msg>(null)

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('menus').select('*').order('name'),
      supabase.from('recipe_items').select('*'),
      supabase.from('ingredients').select('*').eq('is_active', true).order('name'),
    ])
    const err = a.error ?? b.error ?? c.error
    if (err) setMsg({ ok: false, text: `${err.message} (sudah menjalankan 003_recipes_opname_lastcost.sql?)` })
    if (a.data) setMenus(a.data as Menu[])
    if (b.data) setItems(b.data as RecipeItem[])
    if (c.data) setIngs(c.data as Ingredient[])
  }, [])
  useEffect(() => { load() }, [load])

  const ingMap = useMemo(() => new Map(ings.map((i) => [i.id, i])), [ings])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('menus').insert({ name: name.trim(), price: Number(price) || 0 })
    if (error) return setMsg({ ok: false, text: error.message.includes('duplicate') ? 'Nama menu sudah ada.' : error.message })
    setName(''); setPrice(''); setMsg({ ok: true, text: 'Menu ditambahkan. Buka kartunya untuk mengisi resep.' }); load()
  }

  return (
    <>
      <header className="page-head">
        <div><h1>Menu & Resep</h1><p className="muted">HPP per porsi dihitung dari resep × HPP rata-rata tiap bahan</p></div>
      </header>

      <form className="card form-row" onSubmit={add}>
        <label>Nama menu<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="mis. Es Kopi Susu" /></label>
        <label>Harga jual (Rp)<input type="number" inputMode="numeric" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" /></label>
        <div className="actions"><button className="btn">+ Tambah menu</button></div>
      </form>
      {msg && <div className={msg.ok ? 'alert ok' : 'alert err'}>{msg.text}</div>}

      <div className="stack">
        {menus.map((m) => (
          <MenuCard key={m.id} menu={m} items={items.filter((r) => r.menu_id === m.id)} ings={ingMap} onChange={load} onMsg={setMsg} />
        ))}
        {menus.length === 0 && <p className="empty">Belum ada menu.</p>}
      </div>
    </>
  )
}
