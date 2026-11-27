import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { loadIngredients, MOVE_COLS, startOfToday } from '../lib/data'
import type { Category, Ingredient, Movement } from '../lib/types'
import { computeStats, LEVEL_LABEL, num, restockQty, rupiah, stockLevel, WINDOW_DAYS, type IngredientStat } from '../lib/analytics'

function Row({ s, kind, cat }: { s: IngredientStat; kind: 'fast' | 'low' | 'slow'; cat?: string }) {
  const pct = Math.min(100, s.min_stock > 0 ? (s.current_stock / (s.min_stock * 2)) * 100 : 100)
  const lv = stockLevel(s.current_stock, s.min_stock)
  const buy = restockQty(s.current_stock, s.min_stock, s.isFast)
  return (
    <li>
      <div className="row-main">
        <strong>{s.name} {lv !== 'ok' && <span className={`pill ${lv}`}>{LEVEL_LABEL[lv]}</span>}</strong>
        <span className="muted small">
          {kind === 'fast' && `Terpakai ${num(s.usage)} ${s.unit} / ${WINDOW_DAYS} hr`}
          {kind === 'low' && (s.daysLeft !== null ? `Cukup ± ${num(Math.floor(s.daysLeft))} hari · ` : '')}
          {kind === 'low' && `Min ${num(s.min_stock)} ${s.unit}`}
          {kind === 'slow' && (s.usage === 0 ? `Tidak ada pemakaian ${WINDOW_DAYS} hr` : `Terpakai ${num(s.usage)} ${s.unit}`)}
          {cat ? ` · ${cat}` : ''}
        </span>
        {kind === 'low' && buy > 0 && (
          <span className="small restock">
            Saran beli ± {num(buy)} {s.unit} ({s.isFast ? '2×' : '1×'} min){s.last_cost > 0 && ` · ± ${rupiah(buy * s.last_cost)}`}
          </span>
        )}
        <div className="bar"><i className={kind} style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="row-side">
        <strong>{num(s.current_stock)}</strong>
        <span className="muted small">{s.unit}</span>
      </div>
    </li>
  )
}

function Section({ title, hint, tone, items, kind, catName, footer }: {
  title: string; hint: string; tone: string; items: IngredientStat[]; kind: 'fast' | 'low' | 'slow'; catName: Map<string, string>; footer?: ReactNode
}) {
  return (
    <section className="card">
      <header className="card-head">
        <h3><span className={`dot ${tone}`} /> {title}</h3>
        <span className="badge">{items.length}</span>
      </header>
      <p className="muted small">{hint}</p>
      {items.length === 0 ? <p className="empty">Tidak ada bahan di kategori ini.</p> : <ul className="list">{items.map((s) => <Row key={s.id} s={s} kind={kind} cat={s.category_id ? catName.get(s.category_id) : undefined} />)}</ul>}
      {items.length > 0 && footer}
    </section>
  )
}

export default function Dashboard({ isAdmin, onOpname, onShop }: { isAdmin: boolean; onOpname: () => void; onShop: () => void }) {
  const [opname, setOpname] = useState<{ done: number; total: number } | null>(null)
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [moves, setMoves] = useState<Movement[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString()
    const [a, b, c, d] = await Promise.all([
      loadIngredients(isAdmin, true),
      supabase.from('stock_movements').select(MOVE_COLS).gte('created_at', since).in('type', ['out', 'waste', 'void_in']),
      supabase.from('categories').select('*').order('name'),
      supabase.rpc('opname_today', { p_since: startOfToday() }),
    ])
    const err = a.error ?? b.error ?? c.error
    if (err) setError(err.message)
    else { setIngs(a.data); setMoves(b.data as unknown as Movement[]); setCats(c.data as Category[]); setError('') }
    // Pengingat opname harian (diabaikan bila SQL 009 belum dijalankan)
    if (d.error) setOpname(null)
    else {
      const ids = new Set(((d.data ?? []) as { ingredient_id: string }[]).map((r) => r.ingredient_id))
      setOpname({ done: a.data.filter((i) => ids.has(i.id)).length, total: a.data.length })
    }
    setLoading(false)
  }, [isAdmin])

  useEffect(() => { load() }, [load])

  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats])
  const visible = useMemo(
    () => ings.filter((i) => filter === 'all' || (filter === 'none' ? !i.category_id : i.category_id === filter)),
    [ings, filter],
  )
  const stats = useMemo(() => computeStats(visible, moves), [visible, moves])
  const fast = stats.filter((s) => s.isFast).sort((a, b) => b.turnover - a.turnover)
  const low = stats.filter((s) => s.isLow).sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999))
  const slow = stats.filter((s) => s.isSlow).sort((a, b) => a.usage - b.usage)
  const totalValue = stats.reduce((t, s) => t + s.stockValue, 0)

  return (
    <>
      <header className="page-head">
        <div><h1>Ringkasan Stok</h1><p className="muted">Analisis pemakaian {WINDOW_DAYS} hari terakhir</p></div>
        <button className="btn-ghost" onClick={load}>↻ Muat ulang</button>
      </header>

      {error && <div className="alert err">{error}</div>}
      {opname && opname.total > 0 && (
        opname.done < opname.total ? (
          <section className="card progress-card">
            <div className="progress-head">
              <strong>⚠️ {opname.total - opname.done} bahan belum di-opname hari ini</strong>
              <button className="btn" onClick={onOpname}>Mulai opname</button>
            </div>
            <span className="muted small">{opname.done} dari {opname.total} bahan sudah dihitung.</span>
          </section>
        ) : (
          <section className="card progress-card ok">
            <strong className="pos">✅ Opname hari ini selesai</strong>
            <span className="muted small">Semua {opname.total} bahan sudah dihitung.</span>
          </section>
        )
      )}
      {cats.length > 0 && (
        <div className="chips">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Semua</button>
          {cats.map((c) => <button key={c.id} className={filter === c.id ? 'on' : ''} onClick={() => setFilter(c.id)}>{c.name}</button>)}
          <button className={filter === 'none' ? 'on' : ''} onClick={() => setFilter('none')}>Tanpa kategori</button>
        </div>
      )}
      {loading ? <div className="center-screen short"><div className="spinner" /></div> : (
        <>
          <div className="stats">
            <div className="stat"><span>Total bahan</span><strong>{stats.length}</strong></div>
            <div className="stat warn"><span>Akan habis</span><strong>{low.length}</strong></div>
            <div className="stat good"><span>Fast moving</span><strong>{fast.length}</strong></div>
            {isAdmin
              ? <div className="stat"><span>Nilai stok</span><strong>{rupiah(totalValue)}</strong></div>
              : <div className="stat"><span>Jarang keluar</span><strong>{slow.length}</strong></div>}
          </div>

          <div className="grid">
            <Section title="Akan habis" tone="red" kind="low" items={low} catName={catName}
              footer={<button className="btn" onClick={onShop}>🛒 Buat daftar belanja</button>}
              hint={`Stok ≤ batas minimum atau cukup ≤ ${3} hari pemakaian.`} />
            <Section title="Fast moving" tone="green" kind="fast" items={fast} catName={catName}
              hint="Bahan yang cepat terpakai — jaga selalu tersedia." />
            <Section title="Jarang keluar" tone="amber" kind="slow" items={slow} catName={catName}
              hint="Pemakaian rendah — hindari membeli berlebihan." />
          </div>
        </>
      )}
    </>
  )
}
