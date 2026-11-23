import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { loadIngredients } from '../lib/data'
import type { Category, Ingredient } from '../lib/types'
import { LEVEL_LABEL, num, rupiah, stockLevel } from '../lib/analytics'

const empty = { name: '', unit: 'gram', category_id: '', min_stock: '0' }
type Msg = { ok: boolean; text: string } | null

export default function Ingredients() {
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')   // all | none | <category id>
  const [newCat, setNewCat] = useState('')
  const [showCats, setShowCats] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      loadIngredients(true),
      supabase.from('categories').select('*').order('name'),
    ])
    if (a.error) setMsg({ ok: false, text: a.error.message })
    setIngs(a.data)
    if (b.error) setMsg({ ok: false, text: `Kategori: ${b.error.message} (sudah menjalankan 002_categories.sql?)` })
    if (b.data) setCats(b.data as Category[])
  }, [])
  useEffect(() => { load() }, [load])

  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats])
  const filtered = useMemo(() => ings.filter((i) =>
    i.name.toLowerCase().includes(q.toLowerCase()) &&
    (filter === 'all' || (filter === 'none' ? !i.category_id : i.category_id === filter))), [ings, q, filter])
  const totalValue = ings.filter((i) => i.is_active).reduce((t, i) => t + i.current_stock * i.avg_cost, 0)
  const countBy = (id: string) => ings.filter((i) => (id === 'none' ? !i.category_id : i.category_id === id)).length

  // ---- Bahan ----
  const startEdit = (i: Ingredient) => {
    setEditing(i)
    setForm({ name: i.name, unit: i.unit, category_id: i.category_id ?? '', min_stock: String(i.min_stock) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const reset = () => { setEditing(null); setForm(empty) }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const payload = {
      name: form.name.trim(), unit: form.unit.trim(),
      category_id: form.category_id || null, min_stock: Math.max(0, Number(form.min_stock) || 0),
    }
    const { error } = editing
      ? await supabase.from('ingredients').update(payload).eq('id', editing.id)
      : await supabase.from('ingredients').insert(payload)
    if (error) return setMsg({ ok: false, text: error.message.includes('duplicate') ? 'Nama bahan sudah ada.' : error.message })
    setMsg({ ok: true, text: editing ? 'Bahan diperbarui.' : 'Bahan ditambahkan.' })
    reset(); load()
  }

  const toggle = async (i: Ingredient) => {
    await supabase.from('ingredients').update({ is_active: !i.is_active }).eq('id', i.id)
    load()
  }

  const saveMin = async (i: Ingredient, value: string) => {
    const v = Math.max(0, Number(value) || 0)
    if (v === i.min_stock) return
    const { error } = await supabase.from('ingredients').update({ min_stock: v }).eq('id', i.id)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `Stok minimum ${i.name} diubah menjadi ${num(v)} ${i.unit}.` })
    load()
  }

  // ---- Kategori ----
  const addCat = async (e: FormEvent) => {
    e.preventDefault()
    const name = newCat.trim()
    if (!name) return
    const { error } = await supabase.from('categories').insert({ name })
    if (error) return setMsg({ ok: false, text: error.message.includes('duplicate') ? 'Kategori sudah ada.' : error.message })
    setNewCat(''); setMsg({ ok: true, text: `Kategori "${name}" ditambahkan.` }); load()
  }
  const renameCat = async (c: Category) => {
    const name = window.prompt('Nama kategori baru:', c.name)?.trim()
    if (!name || name === c.name) return
    const { error } = await supabase.from('categories').update({ name }).eq('id', c.id)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Kategori diubah.' }); load()
  }
  const deleteCat = async (c: Category) => {
    const n = countBy(c.id)
    if (!window.confirm(n ? `Hapus kategori "${c.name}"? ${n} bahan akan menjadi tanpa kategori.` : `Hapus kategori "${c.name}"?`)) return
    const { error } = await supabase.from('categories').delete().eq('id', c.id)
    if (filter === c.id) setFilter('all')
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Kategori dihapus.' }); load()
  }

  return (
    <>
      <header className="page-head">
        <div><h1>Bahan & HPP</h1><p className="muted">HPP dihitung otomatis (rata-rata tertimbang) dari setiap pembelian</p></div>
        <div className="stat inline"><span>Nilai stok</span><strong>{rupiah(totalValue)}</strong></div>
      </header>

      <form className="card form-row" onSubmit={submit}>
        <label>Nama bahan<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Satuan<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required list="units" />
          <datalist id="units"><option>gram</option><option>ml</option><option>pcs</option><option>kg</option><option>liter</option></datalist>
        </label>
        <label>Kategori
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
            <option value="">— Tanpa kategori —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Stok minimum {form.unit && `(${form.unit})`}
          <input type="number" min="0" step="any" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
        </label>
        <div className="actions">
          <button className="btn">{editing ? 'Simpan perubahan' : '+ Tambah bahan'}</button>
          {editing && <button type="button" className="btn-ghost" onClick={reset}>Batal</button>}
        </div>
      </form>
      {msg && <div className={msg.ok ? 'alert ok' : 'alert err'}>{msg.text}</div>}

      <section className="card">
        <header className="card-head">
          <h3>Kategori bahan</h3>
          <button className="btn-ghost sm" onClick={() => setShowCats(!showCats)}>{showCats ? 'Tutup' : 'Kelola kategori'}</button>
        </header>
        {showCats && (
          <>
            <form className="inline-form" onSubmit={addCat}>
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nama kategori baru, mis. Topping" />
              <button className="btn">Tambah</button>
            </form>
            <ul className="list">
              {cats.map((c) => (
                <li key={c.id}>
                  <div className="row-main"><strong>{c.name}</strong><span className="muted small">{countBy(c.id)} bahan</span></div>
                  <div className="nowrap">
                    <button className="btn-ghost sm" onClick={() => renameCat(c)}>Ubah</button>
                    <button className="btn-ghost sm danger" onClick={() => deleteCat(c)}>Hapus</button>
                  </div>
                </li>
              ))}
              {cats.length === 0 && <li className="empty">Belum ada kategori.</li>}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <div className="chips">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Semua <b>{ings.length}</b></button>
          {cats.map((c) => <button key={c.id} className={filter === c.id ? 'on' : ''} onClick={() => setFilter(c.id)}>{c.name} <b>{countBy(c.id)}</b></button>)}
          {countBy('none') > 0 && <button className={filter === 'none' ? 'on' : ''} onClick={() => setFilter('none')}>Tanpa kategori <b>{countBy('none')}</b></button>}
        </div>
        <input className="search" placeholder="🔍 Cari bahan…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Bahan</th><th className="r">Stok</th><th>Status</th><th className="r">Stok minimum</th><th className="r">HPP / unit</th><th className="r">Harga beli terakhir</th><th className="r">Nilai stok</th><th /></tr></thead>
            <tbody>
              {filtered.map((i) => {
                const lv = stockLevel(i.current_stock, i.min_stock)
                return (
                  <tr key={i.id} className={i.is_active ? '' : 'off'}>
                    <td><strong>{i.name}</strong><br /><span className="muted small">{(i.category_id && catName.get(i.category_id)) || 'Tanpa kategori'}</span></td>
                    <td className="r">{num(i.current_stock)} {i.unit}</td>
                    <td><span className={`pill ${lv}`}>{LEVEL_LABEL[lv]}</span></td>
                    <td className="r">
                      <input className="min-input" type="number" min="0" step="any" defaultValue={i.min_stock} key={`${i.id}-${i.min_stock}`}
                        onBlur={(e) => saveMin(i, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={`Stok minimum ${i.name}`} />
                    </td>
                    <td className="r">{rupiah(i.avg_cost)}</td>
                    <td className="r">{i.last_cost > 0 ? rupiah(i.last_cost) : '—'}</td>
                    <td className="r"><strong>{rupiah(i.current_stock * i.avg_cost)}</strong></td>
                    <td className="r nowrap">
                      <button className="btn-ghost sm" onClick={() => startEdit(i)}>Ubah</button>
                      <button className="btn-ghost sm" onClick={() => toggle(i)}>{i.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && <tr><td colSpan={8} className="empty">Tidak ada bahan.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
