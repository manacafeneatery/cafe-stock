import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadIngredients } from '../lib/data'
import type { Category, Ingredient } from '../lib/types'
import { dateTime, num } from '../lib/analytics'

interface Session {
  session_key: string; performed_at: string; user_name: string; item_count: number
  items: { name: string; unit: string; diff: number; note: string | null }[]
}

export default function Opname({ isAdmin }: { isAdmin: boolean }) {
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [counts, setCounts] = useState<Record<string, string>>({})   // id -> stok fisik (teks)
  const [filter, setFilter] = useState('all')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [history, setHistory] = useState<Session[]>([])

  const load = useCallback(async () => {
    const [a, b, h] = await Promise.all([
      loadIngredients(false, true),
      supabase.from('categories').select('*').order('name'),
      supabase.rpc('opname_history', { p_limit: 15 }),
    ])
    setHistory((h.data ?? []) as Session[])
    setIngs(a.data)
    if (b.data) setCats(b.data as Category[])
  }, [])
  useEffect(() => { load() }, [load])

  const visible = useMemo(
    () => ings.filter((i) => filter === 'all' || (filter === 'none' ? !i.category_id : i.category_id === filter)),
    [ings, filter],
  )

  // Hanya baris yang diisi & berbeda dari stok sistem yang akan disesuaikan
  const changes = useMemo(() => ings.flatMap((i) => {
    const raw = counts[i.id]
    if (raw === undefined || raw === '') return []
    const physical = Number(raw)
    if (!(physical >= 0)) return []
    const diff = physical - Number(i.current_stock)
    return Math.abs(diff) < 1e-9 ? [] : [{ ing: i, physical, diff }]
  }), [ings, counts])

  const save = async () => {
    if (changes.length === 0) return
    if (!window.confirm(`Simpan penyesuaian untuk ${changes.length} bahan? Stok sistem akan diubah mengikuti stok fisik.`)) return
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    const batch = crypto.randomUUID()   // satu sesi opname
    const rows = changes.map(({ ing, physical, diff }) => ({
      batch_id: batch,
      ingredient_id: ing.id,
      type: diff > 0 ? 'adjust_in' : 'adjust_out',
      quantity: Math.abs(diff),
      unit_cost: 0,
      note: `Opname: sistem ${num(ing.current_stock)} → fisik ${num(physical)}${note.trim() ? ` · ${note.trim()}` : ''}`,
      created_by: u.user?.id,
    }))
    const { error } = await supabase.from('stock_movements').insert(rows)
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: `Opname tersimpan: ${rows.length} bahan disesuaikan.` })
    setCounts({}); setNote(''); load()
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Stok Opname</h1>
          <p className="muted">Cocokkan stok sistem dengan hitungan fisik. Isi hanya bahan yang dihitung.</p>
          <p className="small last-opname">
            {history[0]
              ? <>Opname terakhir: <strong>{dateTime(history[0].performed_at)}</strong> oleh <strong>{history[0].user_name}</strong> ({history[0].item_count} bahan)</>
              : 'Belum ada riwayat opname.'}
          </p>
        </div>
        <button className="btn" disabled={busy || changes.length === 0} onClick={save}>
          {busy ? 'Menyimpan…' : `Simpan opname${changes.length ? ` (${changes.length})` : ''}`}
        </button>
      </header>

      {msg && <div className={msg.ok ? 'alert ok' : 'alert err'}>{msg.text}</div>}

      <section className="card">
        <div className="chips">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Semua</button>
          {cats.map((c) => <button key={c.id} className={filter === c.id ? 'on' : ''} onClick={() => setFilter(c.id)}>{c.name}</button>)}
          <button className={filter === 'none' ? 'on' : ''} onClick={() => setFilter('none')}>Tanpa kategori</button>
        </div>
        <label>Catatan opname (opsional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. opname akhir bulan" />
        </label>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Bahan</th><th className="r">Stok sistem</th><th className="r">Stok fisik</th><th className="r">Selisih</th></tr></thead>
            <tbody>
              {visible.map((i) => {
                const raw = counts[i.id] ?? ''
                const diff = raw === '' ? null : Number(raw) - Number(i.current_stock)
                return (
                  <tr key={i.id}>
                    <td><strong>{i.name}</strong><br /><span className="muted small">{i.unit}</span></td>
                    <td className="r">{num(i.current_stock)}</td>
                    <td className="r">
                      <input className="min-input" type="number" inputMode="decimal" min="0" step="any" value={raw}
                        onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })} placeholder="—" aria-label={`Stok fisik ${i.name}`} />
                    </td>
                    <td className="r">
                      {diff === null ? <span className="muted">—</span>
                        : Math.abs(diff) < 1e-9 ? <span className="pill ok">Sesuai</span>
                        : <strong className={diff > 0 ? 'pos' : 'neg'}>{diff > 0 ? '+' : ''}{num(diff)}</strong>}
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && <tr><td colSpan={4} className="empty">Tidak ada bahan.</td></tr>}
            </tbody>
          </table>
        </div>
        {!isAdmin && <p className="muted small">Selisih tercatat di riwayat sebagai penyesuaian (opname) dan tidak dihitung sebagai pemakaian.</p>}
      </section>

      <section className="card">
        <header className="card-head"><h3>Riwayat opname</h3><span className="badge">{history.length} sesi terakhir</span></header>
        {history.length === 0 ? <p className="empty">Belum ada opname yang tersimpan.</p> : (
          <div className="sessions">
            {history.map((s, idx) => (
              <details key={s.session_key} open={idx === 0}>
                <summary>
                  <div className="row-main">
                    <strong>{dateTime(s.performed_at)}</strong>
                    <span className="muted small">oleh {s.user_name}</span>
                  </div>
                  <span className="badge">{s.item_count} bahan</span>
                </summary>
                <ul className="list">
                  {s.items.map((it, k) => (
                    <li key={k}>
                      <div className="row-main">
                        <strong>{it.name}</strong>
                        <span className="muted small">{it.note ?? ''}</span>
                      </div>
                      <div className="row-side">
                        <strong className={Number(it.diff) > 0 ? 'pos' : 'neg'}>{Number(it.diff) > 0 ? '+' : ''}{num(Number(it.diff))}</strong>
                        <span className="muted small">{it.unit}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
