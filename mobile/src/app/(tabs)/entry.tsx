import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { MOVE_COLS, loadIngredients } from '@/lib/data'
import { useAuth } from '@/lib/auth'
import { isIncoming, type Category, type Ingredient, type Movement } from '@/lib/types'
import { dateTime, num, rupiah, toNum } from '@/lib/analytics'
import { useTheme } from '@/lib/theme'
import { Button, Card, CardHead, Empty, Field, List, Notice, NumField, PageTitle, Row, Screen, Segmented, Select, Txt, type Option } from '@/components/ui'

type EntryType = 'in' | 'out' | 'waste'
const TYPES: { id: EntryType; label: string }[] = [
  { id: 'in', label: '📥 Masuk' },
  { id: 'out', label: '📤 Pakai' },
  { id: 'waste', label: '🗑️ Rusak' },
]
const LABEL: Record<EntryType, string> = { in: 'Masuk', out: 'Pakai', waste: 'Rusak/Waste' }

export default function Entry() {
  const t = useTheme()
  const { isAdmin } = useAuth()
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [recent, setRecent] = useState<Movement[]>([])
  const [type, setType] = useState<EntryType>('out')
  const [ingId, setIngId] = useState('')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')      // total harga beli (untuk "Masuk")
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [a, b, c] = await Promise.all([
      loadIngredients(isAdmin, true),
      supabase.from('stock_movements').select(MOVE_COLS).order('created_at', { ascending: false }).limit(15),
      supabase.from('categories').select('*').order('name'),
    ])
    setIngs(a.data)
    if (b.data) setRecent(b.data as unknown as Movement[])
    if (c.data) setCats(c.data as Category[])
    setLoading(false)
  }, [isAdmin])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const options = useMemo<Option[]>(() => {
    const cname = new Map(cats.map((c) => [c.id, c.name]))
    return ings.map((i) => ({
      value: i.id,
      label: `${i.name} (${num(i.current_stock)} ${i.unit})`,
      group: (i.category_id && cname.get(i.category_id)) || 'Tanpa kategori',
    }))
  }, [ings, cats])

  const selected = ings.find((i) => i.id === ingId)
  const nameOf = (id: string) => ings.find((i) => i.id === id)
  const q = toNum(qty)
  const total = toNum(price)

  const submit = async () => {
    if (!selected) return
    if (!(q > 0)) return setMsg({ ok: false, text: 'Jumlah harus lebih dari 0.' })
    if (type === 'in' && (price === '' || !(total >= 0))) return setMsg({ ok: false, text: 'Isi total harga pembelian.' })

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
    setMsg({ ok: true, text: `Tersimpan: ${LABEL[type]} ${num(q)} ${selected.unit} ${selected.name}` })
    setQty(''); setPrice(''); setNote('')
    load()
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <PageTitle title="Entry Stok" subtitle="Catat bahan masuk, terpakai, atau rusak" />

      <Card>
        <Segmented options={TYPES} value={type} onChange={(v) => { setType(v); setMsg(null) }} />
        <Select label="Bahan" value={ingId} onChange={setIngId} options={options} placeholder="— Pilih bahan —" searchable />
        <NumField label={`Jumlah${selected ? ` (${selected.unit})` : ''}`} value={qty} onChangeText={setQty} placeholder="0" />

        {type === 'in' ? (
          <NumField label="Total harga pembelian (Rp)" value={price} onChangeText={setPrice} placeholder="0"
            hint={[
              q > 0 && price !== '' && total >= 0 && selected ? `≈ ${rupiah(total / q)} per ${selected.unit}` : '',
              selected && selected.last_cost > 0 ? `Harga beli terakhir: ${rupiah(selected.last_cost)} per ${selected.unit}` : '',
            ].filter(Boolean).join('\n') || undefined} />
        ) : null}

        <Field label="Catatan (opsional)" value={note} onChangeText={setNote} placeholder="mis. nota supplier / shift pagi" />
        {msg ? <Notice ok={msg.ok} text={msg.text} /> : null}
        <Button title="Simpan" onPress={submit} loading={busy} disabled={!ingId} />
      </Card>

      <Card>
        <CardHead title="Riwayat terakhir" />
        {recent.length === 0 ? <Empty text="Belum ada transaksi." /> : (
          <List>
            {recent.map((m) => {
              const ing = nameOf(m.ingredient_id)
              const inc = isIncoming(m.type)
              return (
                <Row key={m.id} title={ing?.name ?? '—'}
                  subtitle={`${dateTime(m.created_at)}${m.type.startsWith('adjust') ? ' · Opname' : ''}${m.note ? ` · ${m.note}` : ''}`}
                  right={`${inc ? '+' : '−'}${num(m.quantity)}`} rightColor={inc ? t.brand : t.brick} rightSub={ing?.unit} />
              )
            })}
          </List>
        )}
        <Txt muted small>Tarik layar ke bawah untuk memuat ulang.</Txt>
      </Card>
    </Screen>
  )
}
