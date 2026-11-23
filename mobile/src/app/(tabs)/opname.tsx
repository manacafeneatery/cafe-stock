import { useCallback, useMemo, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { loadIngredients } from '@/lib/data'
import { useTheme } from '@/lib/theme'
import type { Category, Ingredient } from '@/lib/types'
import { dateTime, num, toNum, uuid } from '@/lib/analytics'
import { Button, Card, CardHead, Chips, Empty, Field, List, Notice, PageTitle, Pill, Row, Screen, Txt, useDialog } from '@/components/ui'

interface Session {
  session_key: string; performed_at: string; user_name: string; item_count: number
  items: { name: string; unit: string; diff: number; note: string | null }[]
}

export default function Opname() {
  const t = useTheme()
  const { confirm } = useDialog()
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [counts, setCounts] = useState<Record<string, string>>({})   // id -> stok fisik (teks)
  const [filter, setFilter] = useState('all')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [history, setHistory] = useState<Session[]>([])
  const [openKey, setOpenKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [a, b, h] = await Promise.all([
      loadIngredients(false, true),
      supabase.from('categories').select('*').order('name'),
      supabase.rpc('opname_history', { p_limit: 15 }),
    ])
    const hist = (h.data ?? []) as Session[]
    setHistory(hist)
    setOpenKey((k) => k ?? hist[0]?.session_key ?? null)
    setIngs(a.data)
    if (b.data) setCats(b.data as Category[])
    setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const visible = useMemo(
    () => ings.filter((i) => filter === 'all' || (filter === 'none' ? !i.category_id : i.category_id === filter)),
    [ings, filter],
  )

  // Hanya baris yang diisi & berbeda dari stok sistem yang akan disesuaikan
  const changes = useMemo(() => ings.flatMap((i) => {
    const raw = counts[i.id]
    if (raw === undefined || raw === '') return []
    const physical = toNum(raw)
    if (!(physical >= 0)) return []
    const diff = physical - Number(i.current_stock)
    return Math.abs(diff) < 1e-9 ? [] : [{ ing: i, physical, diff }]
  }), [ings, counts])

  const save = async () => {
    if (changes.length === 0) return
    if (!(await confirm(`Simpan penyesuaian ${changes.length} bahan?`, 'Stok sistem akan diubah mengikuti stok fisik.', 'Simpan'))) return
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    const batch = uuid()   // satu sesi opname
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
    setCounts({}); setNote(''); setOpenKey(null); load()
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <PageTitle title="Stok Opname" subtitle="Cocokkan stok sistem dengan hitungan fisik. Isi hanya bahan yang dihitung." />
      <Txt small color={t.brand}>
        {history[0]
          ? `Opname terakhir: ${dateTime(history[0].performed_at)} oleh ${history[0].user_name} (${history[0].item_count} bahan)`
          : 'Belum ada riwayat opname.'}
      </Txt>
      {msg ? <Notice ok={msg.ok} text={msg.text} /> : null}

      <Card>
        <Chips value={filter} onChange={setFilter}
          options={[{ id: 'all', label: 'Semua' }, ...cats.map((c) => ({ id: c.id, label: c.name })), { id: 'none', label: 'Tanpa kategori' }]} />
        <Field label="Catatan opname (opsional)" value={note} onChangeText={setNote} placeholder="mis. opname akhir bulan" />

        {visible.length === 0 ? <Empty text="Tidak ada bahan." /> : (
          <List>
            {visible.map((i) => {
              const raw = counts[i.id] ?? ''
              const diff = raw === '' ? null : toNum(raw) - Number(i.current_stock)
              return (
                <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Txt bold>{i.name}</Txt>
                    <Txt muted small>Sistem: {num(i.current_stock)} {i.unit}</Txt>
                  </View>
                  <View style={{ width: 70, alignItems: 'flex-end' }}>
                    {diff === null ? <Txt muted>—</Txt>
                      : Math.abs(diff) < 1e-9 ? <Pill tone="ok" text="Sesuai" />
                      : <Txt bold color={diff > 0 ? t.brand : t.brick}>{diff > 0 ? '+' : ''}{num(diff)}</Txt>}
                  </View>
                  <TextInput
                    value={raw} onChangeText={(v) => setCounts((c) => ({ ...c, [i.id]: v }))}
                    keyboardType="decimal-pad" placeholder="Fisik" placeholderTextColor={t.muted}
                    accessibilityLabel={`Stok fisik ${i.name}`}
                    style={{ width: 84, textAlign: 'right', backgroundColor: t.inputBg, color: t.text, borderColor: t.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 }}
                  />
                </View>
              )
            })}
          </List>
        )}
        <Button title={`Simpan opname${changes.length ? ` (${changes.length})` : ''}`} onPress={save} loading={busy} disabled={changes.length === 0} />
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
                        {s.items.map((it, k) => (
                          <Row key={k} title={it.name} subtitle={it.note ?? ''}
                            right={`${Number(it.diff) > 0 ? '+' : ''}${num(Number(it.diff))}`} rightSub={it.unit}
                            rightColor={Number(it.diff) > 0 ? t.brand : t.brick} />
                        ))}
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
