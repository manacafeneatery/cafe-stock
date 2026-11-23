import { useCallback, useMemo, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { loadIngredients, startOfToday } from '@/lib/data'
import { useTheme } from '@/lib/theme'
import type { Category, Ingredient } from '@/lib/types'
import { dateTime, num, toNum, uuid } from '@/lib/analytics'
import {
  Bar, Button, Card, CardHead, Chips, Empty, Field, List, Notice, PageTitle, Pill, Row, Screen, Segmented, Txt, useDialog,
} from '@/components/ui'

interface Session {
  session_key: string; performed_at: string; user_name: string; item_count: number
  items: { name: string; unit: string; diff: number; note: string | null }[]
}
interface Done { ingredient_id: string; performed_at: string; user_name: string; physical: number; diff: number }
type Tab = 'pending' | 'done' | 'all'

const hhmm = (iso: string) => dateTime(iso).slice(-5)

export default function Opname() {
  const t = useTheme()
  const { confirm } = useDialog()
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [done, setDone] = useState<Map<string, Done>>(new Map())
  const [counts, setCounts] = useState<Record<string, string>>({})   // id -> stok fisik (teks)
  const [filter, setFilter] = useState('all')
  const [tab, setTab] = useState<Tab>('pending')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [history, setHistory] = useState<Session[]>([])
  const [openKey, setOpenKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [a, b, h, d] = await Promise.all([
      loadIngredients(false, true),
      supabase.from('categories').select('*').order('name'),
      supabase.rpc('opname_history', { p_limit: 15 }),
      supabase.rpc('opname_today', { p_since: startOfToday() }),
    ])
    const hist = (h.data ?? []) as Session[]
    setHistory(hist)
    setOpenKey((k) => k ?? hist[0]?.session_key ?? null)
    setDone(new Map(((d.data ?? []) as Done[]).map((r) => [r.ingredient_id, r])))
    if (d.error) setMsg({ ok: false, text: `${d.error.message} (sudah menjalankan 009_daily_opname.sql?)` })
    setIngs(a.data)
    if (b.data) setCats(b.data as Category[])
    setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { load() }, [load]))

  // Progres hari ini (semua bahan aktif, tidak terpengaruh filter kategori)
  const total = ings.length
  const doneCount = ings.filter((i) => done.has(i.id)).length
  const pendingCount = total - doneCount
  const pct = total > 0 ? (doneCount / total) * 100 : 0

  const inCat = useCallback(
    (i: Ingredient) => filter === 'all' || (filter === 'none' ? !i.category_id : i.category_id === filter),
    [filter],
  )
  const visible = useMemo(() => ings.filter((i) => {
    if (!inCat(i)) return false
    if (tab === 'pending') return !done.has(i.id)
    if (tab === 'done') return done.has(i.id)
    return true
  }), [ings, inCat, tab, done])

  // Semua baris yang diisi (termasuk yang sesuai) akan dicatat sebagai sudah di-opname
  const entries = useMemo(() => ings.flatMap((i) => {
    const raw = counts[i.id]
    if (raw === undefined || raw.trim() === '') return []
    const physical = toNum(raw)
    return physical >= 0 ? [{ ing: i, physical, diff: physical - Number(i.current_stock) }] : []
  }), [ings, counts])
  const mismatches = entries.filter((e) => Math.abs(e.diff) >= 1e-9).length

  const save = async () => {
    if (entries.length === 0) return
    const body = mismatches > 0
      ? `${mismatches} bahan berbeda dari stok sistem dan akan disesuaikan.`
      : 'Semua hitungan sesuai dengan stok sistem.'
    if (!(await confirm(`Simpan opname ${entries.length} bahan?`, body, 'Simpan'))) return
    setBusy(true)
    const { error } = await supabase.rpc('submit_opname', {
      p_batch: uuid(),
      p_items: entries.map((e) => ({ ingredient_id: e.ing.id, physical: e.physical })),
      p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: `${error.message} (sudah menjalankan 009_daily_opname.sql?)` })
    setMsg({ ok: true, text: `Opname tersimpan: ${entries.length} bahan dihitung${mismatches ? `, ${mismatches} disesuaikan` : ', semua sesuai'}.` })
    setCounts({}); setNote(''); setOpenKey(null); load()
  }

  const pendingInView = ings.filter((i) => inCat(i) && !done.has(i.id)).length

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <PageTitle title="Stok Opname" subtitle="Opname harian: hitung stok fisik, lalu simpan." />

      {/* Progres harian */}
      <Card style={{ borderLeftWidth: 5, borderLeftColor: pendingCount === 0 && total > 0 ? t.brand : t.brick }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Txt bold size={17}>Hari ini</Txt>
          <Txt bold color={pendingCount === 0 && total > 0 ? t.brand : t.brick}>{doneCount} / {total} bahan</Txt>
        </View>
        <Bar pct={pct} tone={pendingCount === 0 ? 'fast' : 'low'} />
        <Txt muted small>
          {total === 0 ? 'Belum ada bahan.'
            : pendingCount === 0 ? '✅ Semua bahan sudah di-opname hari ini.'
            : `${pendingCount} bahan belum di-opname hari ini.`}
        </Txt>
      </Card>

      {msg ? <Notice ok={msg.ok} text={msg.text} /> : null}

      <Card>
        <Segmented<Tab> value={tab} onChange={setTab} options={[
          { id: 'pending', label: `Belum (${pendingCount})` },
          { id: 'done', label: `Sudah (${doneCount})` },
          { id: 'all', label: `Semua (${total})` },
        ]} />
        <Chips value={filter} onChange={setFilter}
          options={[{ id: 'all', label: 'Semua kategori' }, ...cats.map((c) => ({ id: c.id, label: c.name })), { id: 'none', label: 'Tanpa kategori' }]} />

        {visible.length === 0 ? (
          <Empty text={tab === 'pending' ? (pendingInView === 0 ? '🎉 Tidak ada bahan yang tersisa di sini.' : 'Tidak ada bahan.') : 'Tidak ada bahan.'} />
        ) : (
          <List>
            {visible.map((i) => {
              const raw = counts[i.id] ?? ''
              const diff = raw.trim() === '' ? null : toNum(raw) - Number(i.current_stock)
              const d = done.get(i.id)
              return (
                <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt bold>{i.name}</Txt>
                    <Txt muted small>Sistem: {num(i.current_stock)} {i.unit}</Txt>
                    {d ? <Txt small color={t.brand}>✓ {hhmm(d.performed_at)} · {d.user_name}</Txt> : null}
                  </View>
                  <View style={{ width: 64, alignItems: 'flex-end' }}>
                    {diff === null ? <Txt muted>—</Txt>
                      : Math.abs(diff) < 1e-9 ? <Pill tone="ok" text="Sesuai" />
                      : <Txt bold color={diff > 0 ? t.brand : t.brick}>{diff > 0 ? '+' : ''}{num(diff)}</Txt>}
                  </View>
                  <TextInput
                    value={raw} onChangeText={(v) => setCounts((c) => ({ ...c, [i.id]: v }))}
                    keyboardType="decimal-pad" placeholder={d ? 'Ulang' : 'Fisik'} placeholderTextColor={t.muted}
                    accessibilityLabel={`Stok fisik ${i.name}`}
                    style={{ width: 80, textAlign: 'right', backgroundColor: t.inputBg, color: t.text, borderColor: t.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 }}
                  />
                </View>
              )
            })}
          </List>
        )}

        <Field label="Catatan opname (opsional)" value={note} onChangeText={setNote} placeholder="mis. opname penutupan" />
        <Button title={`Simpan opname${entries.length ? ` (${entries.length})` : ''}`} onPress={save} loading={busy} disabled={entries.length === 0} />
        <Txt muted small>Isi stok fisik bahan yang dihitung. Bahan yang sesuai pun ikut dicatat sebagai sudah di-opname.</Txt>
      </Card>

      <Card>
        <CardHead title="Riwayat opname" right={<Pill tone="gray" text={`${history.length} sesi`} />} />
        {history.length === 0 ? <Empty text="Belum ada opname yang tersimpan." /> : (
          <View style={{ gap: 10 }}>
            {history.map((s) => {
              const open = openKey === s.session_key
              return (
                <View key={s.session_key} style={{ borderWidth: 1, borderColor: t.line, borderRadius: 14, backgroundColor: t.inputBg, paddingHorizontal: 14 }}>
                  <Pressable onPress={() => setOpenKey(open ? null : s.session_key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Txt bold>{dateTime(s.performed_at)}</Txt>
                      <Txt muted small>oleh {s.user_name}</Txt>
                    </View>
                    <Pill tone="gray" text={`${s.item_count} bahan`} />
                    <Txt muted>{open ? '▾' : '▸'}</Txt>
                  </Pressable>
                  {open ? (
                    <View style={{ paddingBottom: 6 }}>
                      <List>
                        {s.items.map((it, k) => {
                          const df = Number(it.diff)
                          return (
                            <Row key={k} title={it.name} subtitle={it.note ?? ''}
                              right={Math.abs(df) < 1e-9 ? 'Sesuai' : `${df > 0 ? '+' : ''}${num(df)}`}
                              rightSub={Math.abs(df) < 1e-9 ? undefined : it.unit}
                              rightColor={Math.abs(df) < 1e-9 ? t.brand : df > 0 ? t.brand : t.brick} />
                          )
                        })}
                      </List>
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>
        )}
      </Card>
    </Screen>
  )
}
