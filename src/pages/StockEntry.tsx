import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { isIncoming, type Category, type Ingredient, type Movement, type MovementType } from '../lib/types'
import { dateTime, num, rupiah } from '../lib/analytics'

const TYPES: { id: 'in' | 'out' | 'waste'; label: string; icon: string }[] = [
  { id: 'in', label: 'Masuk', icon: '📥' },
  { id: 'out', label: 'Pakai', icon: '📤' },
  { id: 'waste', label: 'Rusak/Waste', icon: '🗑️' },
]

export default function StockEntry() {
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [recent, setRecent] = useState<Movement[]>([])
  const [type, setType] = useState<MovementType>('out')
  const [ingId, setIngId] = useState('')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')        // total harga beli (untuk "Masuk")
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('ingredients').select('*').eq('is_active', true).order('name'),
      supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(15),
      supabase.from('categories').select('*').order('name'),
    ])
    if (a.data) setIngs(a.data as Ingredient[])
    if (b.data) setRecent(b.data as Movement[])
    if (c.data) setCats(c.data as Category[])
  }, [])

  useEffect(() => { load() }, [load])

  const selected = ings.find((i) => i.id === ingId)
  const nameOf = (id: string) => ings.find((i) => i.id === id)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selected) return
    const q = Number(qty)
    const total = Number(price)
    if (!(q > 0)) return setMsg({ ok: false, text: 'Jumlah harus lebih dari 0.' })
    if (type === 'in' && !(total >= 0)) return setMsg({ ok: false, text: 'Isi total harga pembelian.' })

    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('stock_movements').insert({
      ingredient_id: selected.id,
      type,
      quantity: q,
      unit_cost: type === 'in' ? total / q : 0,
      note: note.trim() || null,
      created_by: u.user?.id,
    })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: `Tersimpan: ${TYPES.find((t) => t.id === type)!.label} ${num(q)} ${selected.unit} ${selected.name}` })
    setQty(''); setPrice(''); setNote('')
    load()
  }

  return (
    <>
      <header className="page-head">
        <div><h1>Entry Stok</h1><p className="muted">Catat bahan masuk, terpakai, atau rusak</p></div>
      </header>

      <div className="grid two">
        <form className="card" onSubmit={submit}>
          <div className="segmented three">
            {TYPES.map((t) => (
              <button type="button" key={t.id} className={type === t.id ? 'on' : ''} onClick={() => { setType(t.id); setMsg(null) }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <label>Bahan
            <select value={ingId} onChange={(e) => setIngId(e.target.value)} required>
              <option value="">— Pilih bahan —</option>
              {[...cats, { id: '', name: 'Tanpa kategori' }].map((c) => {
                const items = ings.filter((i) => (i.category_id ?? '') === c.id)
                return items.length === 0 ? null : (
                  <optgroup key={c.id || 'none'} label={c.name}>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({num(i.current_stock)} {i.unit})</option>)}
                  </optgroup>
                )
              })}
            </select>
          </label>

          <label>Jumlah {selected && `(${selected.unit})`}
            <input type="number" inputMode="decimal" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} required placeholder="0" />
          </label>

          {type === 'in' && (
            <label>Total harga pembelian (Rp)
              <input type="number" inputMode="numeric" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required placeholder="0" />
              {Number(qty) > 0 && Number(price) >= 0 && price !== '' && selected && (
                <small className="muted">≈ {rupiah(Number(price) / Number(qty))} per {selected.unit}</small>
              )}
              {selected && selected.last_cost > 0 && (
                <small className="muted">Harga beli terakhir: {rupiah(selected.last_cost)} per {selected.unit}</small>
              )}
            </label>
          )}

          <label>Catatan (opsional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. nota supplier / shift pagi" />
          </label>

          {msg && <div className={msg.ok ? 'alert ok' : 'alert err'}>{msg.text}</div>}
          <button className="btn" disabled={busy || !ingId}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </form>

        <section className="card">
          <header className="card-head"><h3>Riwayat terakhir</h3></header>
          {recent.length === 0 ? <p className="empty">Belum ada transaksi.</p> : (
            <ul className="list">
              {recent.map((m) => {
                const ing = nameOf(m.ingredient_id)
                return (
                  <li key={m.id}>
                    <div className="row-main">
                      <strong>{ing?.name ?? '—'}</strong>
                      <span className="muted small">{dateTime(m.created_at)}{m.type.startsWith('adjust') ? ' · Opname' : ''}{m.note ? ` · ${m.note}` : ''}</span>
                    </div>
                    <div className="row-side">
                      <strong className={isIncoming(m.type) ? 'pos' : 'neg'}>{isIncoming(m.type) ? '+' : '−'}{num(m.quantity)}</strong>
                      <span className="muted small">{ing?.unit}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
