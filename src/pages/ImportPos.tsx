import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { supabase } from '../lib/supabase'
import { parseIdekuReport, type PosReport } from '../lib/pos'
import type { Menu } from '../lib/types'
import { num } from '../lib/analytics'

interface MapRow { pos_key: string; pos_name: string; menu_id: string | null; ignored: boolean }
interface Result { key: string; name: string; status: string; qty: number; message: string | null }
const IGNORE = '__ignore__'

const STATUS_LABEL: Record<string, [string, string]> = {
  imported: ['Berhasil', 'ok'], unchanged: ['Sudah diimpor', 'ok'], lower: ['Lebih kecil', 'low'],
  unmapped: ['Belum dipetakan', 'low'], ignored: ['Diabaikan', 'ok'], error: ['Gagal', 'empty'],
}

export default function ImportPos({ isAdmin }: { isAdmin: boolean }) {
  const [report, setReport] = useState<PosReport | null>(null)
  const [fileErr, setFileErr] = useState('')
  const [menus, setMenus] = useState<Menu[]>([])
  const [map, setMap] = useState<Map<string, MapRow>>(new Map())
  const [logged, setLogged] = useState<Map<string, number>>(new Map())
  const [results, setResults] = useState<Result[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadBase = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('menus').select('id, name, price, is_active').eq('is_active', true).order('name'),
      supabase.from('pos_item_map').select('pos_key, pos_name, menu_id, ignored'),
    ])
    if (a.data) setMenus(a.data as Menu[])
    if (b.error) setMsg({ ok: false, text: `${b.error.message} (sudah menjalankan 010_pos_import.sql?)` })
    if (b.data) setMap(new Map((b.data as MapRow[]).map((r) => [r.pos_key, r])))
  }, [])
  useEffect(() => { loadBase() }, [loadBase])

  const loadLogged = useCallback(async (date: string) => {
    const { data } = await supabase.from('pos_imports').select('pos_key, qty_total').eq('business_date', date)
    setLogged(new Map(((data ?? []) as { pos_key: string; qty_total: number }[]).map((r) => [r.pos_key, Number(r.qty_total)])))
  }, [])
  useEffect(() => { if (report) loadLogged(report.date) }, [report, loadLogged])

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''           // izinkan memilih file yang sama lagi
    if (!f) return
    setResults(null); setMsg(null); setFileErr('')
    try { setReport(parseIdekuReport(await f.text())) }
    catch (err) { setReport(null); setFileErr(err instanceof Error ? err.message : 'File tidak bisa dibaca.') }
  }

  const view = useMemo(() => (report?.rows ?? []).map((r) => {
    const m = map.get(r.key)
    const done = logged.get(r.key) ?? 0
    const delta = r.qty - done
    const kind = !m ? 'unmapped' : m.ignored ? 'ignored' : delta > 0 ? 'todo' : delta === 0 ? 'done' : 'lower'
    return { ...r, m, done, delta, kind }
  }), [report, map, logged])

  const count = (k: string) => view.filter((v) => v.kind === k).length
  const todo = view.filter((v) => v.kind === 'todo')
  const menuName = (id: string | null) => menus.find((m) => m.id === id)?.name ?? '—'

  const setMapping = async (key: string, name: string, value: string) => {
    if (!value) return
    const row: MapRow = value === IGNORE
      ? { pos_key: key, pos_name: name, menu_id: null, ignored: true }
      : { pos_key: key, pos_name: name, menu_id: value, ignored: false }
    const { error } = await supabase.from('pos_item_map').upsert(row, { onConflict: 'pos_key' })
    if (error) setMsg({ ok: false, text: error.message })
    loadBase()
  }

  const autoMap = async () => {
    const byName = new Map(menus.map((m) => [m.name.trim().toLowerCase(), m.id]))
    const rows = view.filter((v) => v.kind === 'unmapped' && byName.has(v.name.trim().toLowerCase()))
      .map((v) => ({ pos_key: v.key, pos_name: v.name, menu_id: byName.get(v.name.trim().toLowerCase())!, ignored: false }))
    if (rows.length === 0) return setMsg({ ok: false, text: 'Tidak ada item dengan nama yang sama persis dengan menu.' })
    const { error } = await supabase.from('pos_item_map').upsert(rows, { onConflict: 'pos_key' })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${rows.length} item dipetakan otomatis berdasarkan nama.` })
    loadBase()
  }

  const run = async () => {
    if (!report || todo.length === 0) return
    if (!window.confirm(`Impor ${todo.length} item (${num(todo.reduce((s, v) => s + v.delta, 0))} porsi) dan potong stok sesuai resep?`)) return
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('import_pos_sales', {
      p_date: report.date,
      p_items: todo.map((v) => ({ key: v.key, name: v.name, qty: v.qty })),
    })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: `${error.message} (sudah menjalankan 010_pos_import.sql?)` })
    const res = (data ?? []) as Result[]
    setResults(res)
    const ok = res.filter((r) => r.status === 'imported').length
    const bad = res.filter((r) => r.status === 'error').length
    setMsg({ ok: bad === 0, text: `Impor selesai: ${ok} item berhasil${bad ? `, ${bad} gagal (lihat rincian)` : ''}.` })
    loadLogged(report.date)
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Impor Kasir</h1>
          <p className="muted">Unggah laporan <strong>Analitik Item</strong> (CSV) dari Ideku untuk satu hari. Stok terpotong sesuai resep.</p>
        </div>
      </header>

      <section className="card">
        <label>File laporan (.csv)
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
        </label>
        {fileErr && <div className="alert err">{fileErr}</div>}
        <p className="muted small">
          Laporan boleh diimpor berkali-kali dalam sehari: yang dipotong hanya selisih penjualan barunya. Jangan mencatat penjualan yang sama
          secara manual di menu Penjualan, supaya stok tidak terpotong dua kali.
        </p>
      </section>

      {msg && <div className={msg.ok ? 'alert ok' : 'alert err'}>{msg.text}</div>}

      {report && (
        <>
          <div className="stats">
            <div className="stat"><span>Toko · Tanggal</span><strong className="stat-sm">{report.store} · {report.date.split('-').reverse().join('/')}</strong></div>
            <div className="stat good"><span>Akan diimpor</span><strong>{todo.length}</strong></div>
            <div className="stat warn"><span>Belum dipetakan</span><strong>{count('unmapped')}</strong></div>
            <div className="stat"><span>Sudah beres</span><strong>{count('done') + count('ignored')}</strong></div>
          </div>

          <section className="card">
            <header className="card-head">
              <h3>Item di laporan</h3>
              <div className="actions">
                {isAdmin && count('unmapped') > 0 && <button className="btn-ghost sm" onClick={autoMap}>Petakan otomatis (nama sama)</button>}
                <button className="btn" disabled={busy || todo.length === 0} onClick={run}>
                  {busy ? 'Mengimpor…' : `Impor ke stok (${todo.length})`}
                </button>
              </div>
            </header>
            {!isAdmin && count('unmapped') > 0 && <div className="alert err">{count('unmapped')} item belum dipetakan ke menu. Minta Admin memetakannya dulu; item itu dilewati saat impor.</div>}
            <div className="table-wrap">
              <table className="rtable">
                <thead><tr><th>Item</th><th className="r">Terjual</th><th className="r">Sudah diimpor</th><th>Pemetaan / status</th></tr></thead>
                <tbody>
                  {view.map((v) => (
                    <tr key={v.key}>
                      <td className="cell-title"><strong>{v.name}</strong><br /><span className="muted small">{v.code || 'tanpa kode'} · {v.category}</span></td>
                      <td className="r" data-label="Terjual">{num(v.qty)}</td>
                      <td className="r" data-label="Sudah diimpor">{num(v.done)}</td>
                      <td data-label="Pemetaan">
                        {v.kind === 'unmapped' ? (
                          isAdmin ? (
                            <select className="map-select" value="" onChange={(e) => setMapping(v.key, v.name, e.target.value)}>
                              <option value="">— Petakan ke menu —</option>
                              {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                              <option value={IGNORE}>Abaikan (bukan menu / tanpa stok)</option>
                            </select>
                          ) : <span className="pill low">Belum dipetakan</span>
                        ) : v.kind === 'ignored' ? <span className="pill ok">Diabaikan</span>
                        : (
                          <span>
                            → {menuName(v.m!.menu_id)}{' '}
                            {v.kind === 'todo' && <span className="pill low">+{num(v.delta)} diimpor</span>}
                            {v.kind === 'done' && <span className="pill ok">Sudah diimpor</span>}
                            {v.kind === 'lower' && <span className="pill low">Lebih kecil dari yang diimpor</span>}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {results && (
            <section className="card">
              <header className="card-head"><h3>Hasil impor</h3></header>
              <ul className="list">
                {results.map((r) => {
                  const [label, tone] = STATUS_LABEL[r.status] ?? [r.status, 'low']
                  return (
                    <li key={r.key}>
                      <div className="row-main"><strong>{r.name}</strong>{r.message && <span className="muted small">{r.message}</span>}</div>
                      <div className="row-side"><span className={`pill ${tone}`}>{label}</span>{r.status === 'imported' && <span className="muted small">+{num(r.qty)}</span>}</div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  )
}
