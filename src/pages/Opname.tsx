import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadIngredients, startOfToday } from '../lib/data'
import { isIncoming, type Category, type Ingredient, type MovementType } from '../lib/types'
import { dateTime, num } from '../lib/analytics'

interface Session {
  session_key: string; performed_at: string; user_name: string; item_count: number
  items: { name: string; unit: string; diff: number; note: string | null }[]
}
interface Done { ingredient_id: string; performed_at: string; user_name: string; physical: number; diff: number }
type Tab = 'pending' | 'done' | 'all'

const toNum = (s: string) => Number(s.replace(',', '.'))
const hhmm = (iso: string) => dateTime(iso).slice(-5)

export default function Opname({ isAdmin }: { isAdmin: boolean }) {
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [done, setDone] = useState<Map<string, Done>>(new Map())
  const [counts, setCounts] = useState<Record<string, string>>({})   // id -> stok fisik (teks)
  const [filter, setFilter] = useState('all')
  const [tab, setTab] = useState<Tab>('pending')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [history, setHistory] = useState<Session[]>([])
  const [todayDelta, setTodayDelta] = useState<Map<string, number>>(new Map())

  const load = useCallback(async () => {
    const [a, b, h, d, mv] = await Promise.all([
      loadIngredients(false, true),
      supabase.from('categories').select('*').order('name'),
      supabase.rpc('opname_history', { p_limit: 15 }),
      supabase.rpc('opname_today', { p_since: startOfToday() }),
      supabase.from('stock_movements').select('ingredient_id, type, quantity').gte('created_at', startOfToday()),
    ])
    // Perubahan stok bersih hari ini per bahan (untuk menghitung stok kemarin = stok sekarang - perubahan hari ini)
    const delta = new Map<string, number>()
    for (const m of (mv.data ?? []) as { ingredient_id: string; type: MovementType; quantity: number }[]) {
      delta.set(m.ingredient_id, (delta.get(m.ingredient_id) ?? 0) + (isIncoming(m.type) ? 1 : -1) * Number(m.quantity))
    }
    setTodayDelta(delta)
    setHistory((h.data ?? []) as Session[])
    setDone(new Map(((d.data ?? []) as Done[]).map((r) => [r.ingredient_id, r])))
    if (d.error) setMsg({ ok: false, text: `${d.error.message} (sudah menjalankan 009_daily_opname.sql?)` })
    setIngs(a.data)
    if (b.data) setCats(b.data as Category[])
  }, [])
  useEffect(() => { load() }, [load])

  // Progres hari ini (semua bahan aktif, tidak terpengaruh filter kategori)
  const total = ings.length
  const doneCount = ings.filter((i) => done.has(i.id)).length
  const pendingCount = total - doneCount
  const pct = total > 0 ? (doneCount / total) * 100 : 0
  const complete = total > 0 && pendingCount === 0

  const visible = useMemo(() => ings.filter((i) => {
    if (!(filter === 'all' || (filter === 'none' ? !i.category_id : i.category_id === filter))) return false
    if (tab === 'pending') return !done.has(i.id)
    if (tab === 'done') return done.has(i.id)
    return true
  }), [ings, filter, tab, done])

  // Semua baris yang diisi (termasuk yang sesuai) dicatat sebagai sudah di-opname
  const entries = useMemo(() => ings.flatMap((i) => {
    const raw = counts[i.id]
    if (raw === undefined || raw.trim() === '') return []
    const physical = toNum(raw)
    return physical >= 0 ? [{ ing: i, physical, diff: physical - Number(i.current_stock) }] : []
  }), [ings, counts])
  const mismatches = entries.filter((e) => Math.abs(e.diff) >= 1e-9).length

  const round = (n: number) => Math.round(n * 1000) / 1000
  const yesterday = (i: Ingredient) => round(Number(i.current_stock) - (todayDelta.get(i.id) ?? 0))

  // Bahan di tampilan saat ini yang belum diisi -> dianggap sesuai stok sistem
  const blanks = visible.filter((i) => (counts[i.id] ?? '').trim() === '')
  const markRest = () => {
    if (blanks.length === 0) return
    if (!window.confirm(`${blanks.length} bahan yang belum diisi akan dianggap SESUAI stok sistem (tidak ada selisih).\nPastikan bahan yang berkurang sudah Anda isi. Lanjutkan?`)) return
    setCounts((c) => ({ ...c, ...Object.fromEntries(blanks.map((i) => [i.id, String(round(Number(i.current_stock)))])) }))
  }

  const save = async () => {
    if (entries.length === 0) return
    const body = mismatches > 0 ? `${mismatches} bahan berbeda dari stok sistem dan akan disesuaikan.` : 'Semua hitungan sesuai dengan stok sistem.'
    if (!window.confirm(`Simpan opname ${entries.length} bahan?\n${body}`)) return
    setBusy(true)
    const { error } = await supabase.rpc('submit_opname', {
      p_batch: crypto.randomUUID(),
      p_items: entries.map((e) => ({ ingredient_id: e.ing.id, physical: e.physical })),
      p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: `${error.message} (sudah menjalankan 009_daily_opname.sql?)` })
    setMsg({ ok: true, text: `Opname tersimpan: ${entries.length} bahan dihitung${mismatches ? `, ${mismatches} disesuaikan` : ', semua sesuai'}.` })
    setCounts({}); setNote(''); load()
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Stok Opname</h1>
          <p className="muted">Opname harian: hitung stok fisik, lalu simpan.</p>
        </div>
        <button className="btn" disabled={busy || entries.length === 0} onClick={save}>
          {busy ? 'Menyimpan…' : `Simpan opname${entries.length ? ` (${entries.length})` : ''}`}
        </button>
      </header>

      <section className={`card progress-card ${complete ? 'ok' : ''}`}>
        <div className="progress-head">
          <strong>Hari ini</strong>
          <strong className={complete ? 'pos' : 'neg'}>{doneCount} / {total} bahan</strong>
        </div>
        <div className="bar"><i className={complete ? 'fast' : 'low'} style={{ width: `${Math.max(2, pct)}%` }} /></div>
        <span className="muted small">
          {total === 0 ? 'Belum ada bahan.' : complete ? '✅ Semua bahan sudah di-opname hari ini.' : `${pendingCount} bahan belum di-opname hari ini.`}
        </span>
      </section>

      {msg && <div className={msg.ok ? 'alert ok' : 'alert err'}>{msg.text}</div>}

      <section className="card">
        <div className="segmented three">
          <button className={tab === 'pending' ? 'on' : ''} onClick={() => setTab('pending')}>Belum ({pendingCount})</button>
          <button className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>Sudah ({doneCount})</button>
          <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>Semua ({total})</button>
        </div>
        <div className="chips">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Semua kategori</button>
          {cats.map((c) => <button key={c.id} className={filter === c.id ? 'on' : ''} onClick={() => setFilter(c.id)}>{c.name}</button>)}
          <button className={filter === 'none' ? 'on' : ''} onClick={() => setFilter('none')}>Tanpa kategori</button>
        </div>
        <label>Catatan opname (opsional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. opname penutupan" />
        </label>
        <div className="actions">
          <button className="btn-ghost" disabled={blanks.length === 0} onClick={markRest}>
            Tandai sisanya sesuai ({blanks.length})
          </button>
        </div>
        <p className="muted small">Isi stok fisik bahan yang <strong>berkurang</strong> saja. Lalu tekan <em>Tandai sisanya sesuai</em> untuk bahan yang tidak berubah dari kemarin.</p>
        <div className="table-wrap">
          <table className="rtable">
            <thead><tr><th>Bahan</th><th className="r">Stok kemarin</th><th className="r">Stok sistem</th><th className="r">Stok fisik</th><th className="r">Selisih</th></tr></thead>
            <tbody>
              {visible.map((i) => {
                const raw = counts[i.id] ?? ''
                const diff = raw.trim() === '' ? null : toNum(raw) - Number(i.current_stock)
                const d = done.get(i.id)
                return (
                  <tr key={i.id}>
                    <td className="cell-title">
                      <strong>{i.name}</strong><br />
                      <span className="muted small">{i.unit}</span>
                      {d && <span className="small pos"> · ✓ {hhmm(d.performed_at)} oleh {d.user_name}</span>}
                    </td>
                    <td className="r" data-label="Stok kemarin">{num(yesterday(i))}</td>
                    <td className="r" data-label="Stok sistem">{num(i.current_stock)}</td>
                    <td className="r" data-label="Stok fisik">
                      <input className="min-input" type="text" inputMode="decimal" value={raw}
                        onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })} placeholder={d ? 'Ulang' : '—'} aria-label={`Stok fisik ${i.name}`} />
                    </td>
                    <td className="r" data-label="Selisih">
                      {diff === null ? <span className="muted">—</span>
                        : Math.abs(diff) < 1e-9 ? <span className="pill ok">Sesuai</span>
                        : <strong className={diff > 0 ? 'pos' : 'neg'}>{diff > 0 ? '+' : ''}{num(diff)}</strong>}
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && <tr><td colSpan={5} className="empty">{tab === 'pending' ? '🎉 Tidak ada bahan yang tersisa di sini.' : 'Tidak ada bahan.'}</td></tr>}
            </tbody>
          </table>
        </div>
        {!isAdmin && <p className="muted small">Bahan yang sesuai pun ikut dicatat sebagai sudah di-opname. Selisih tidak dihitung sebagai pemakaian.</p>}
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
                  {s.items.map((it, k) => {
                    const df = Number(it.diff)
                    return (
                      <li key={k}>
                        <div className="row-main"><strong>{it.name}</strong><span className="muted small">{it.note ?? ''}</span></div>
                        <div className="row-side">
                          {Math.abs(df) < 1e-9 ? <span className="pill ok">Sesuai</span> : (
                            <><strong className={df > 0 ? 'pos' : 'neg'}>{df > 0 ? '+' : ''}{num(df)}</strong><span className="muted small">{it.unit}</span></>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
