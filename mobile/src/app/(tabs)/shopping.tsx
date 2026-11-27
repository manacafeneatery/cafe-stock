import { useCallback, useMemo, useState } from 'react'
import { Pressable, Share, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { MOVE_COLS, loadIngredients } from '@/lib/data'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import type { Category, Ingredient, Movement } from '@/lib/types'
import { computeStats, num, restockQty, rupiah, toNum, WINDOW_DAYS } from '@/lib/analytics'
import { niceQty, shoppingText } from '@/lib/shopping'
import { Button, Card, CardHead, Empty, Field, NumField, Notice, PageTitle, Pill, Screen, Stat, StatGrid, Txt } from '@/components/ui'

interface Recv { id: string; qty: string; price: string; mode: 'unit' | 'total' }

export default function Shopping() {
  const t = useTheme()
  const { isAdmin } = useAuth()
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [moves, setMoves] = useState<Movement[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [qty, setQty] = useState<Record<string, string>>({})       // jumlah yang diubah manual
  const [skip, setSkip] = useState<Record<string, boolean>>({})    // bahan yang tidak ikut daftar
  const [recv, setRecv] = useState<Recv | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString()
    const [a, b, c] = await Promise.all([
      loadIngredients(isAdmin, true),
      supabase.from('stock_movements').select(MOVE_COLS).gte('created_at', since).in('type', ['out', 'waste', 'void_in']),
      supabase.from('categories').select('*').order('name'),
    ])
    setIngs(a.data)
    if (b.data) setMoves(b.data as unknown as Movement[])
    if (c.data) setCats(c.data as Category[])
    setLoading(false)
  }, [isAdmin])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats])
  const items = useMemo(() => computeStats(ings, moves)
    .filter((s) => s.isLow)
    .map((s) => ({ ...s, suggest: niceQty(restockQty(s.current_stock, s.min_stock, s.isFast)), cat: (s.category_id && catName.get(s.category_id)) || 'Tanpa kategori' }))
    .filter((s) => s.suggest > 0)
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name)), [ings, moves, catName])

  const amount = (id: string, suggest: number) => {
    const raw = qty[id]
    const v = raw === undefined || raw === '' ? 0 : toNum(raw)
    return v > 0 ? v : suggest
  }
  const picked = items.filter((i) => !skip[i.id])
  const estimate = picked.reduce((s, i) => s + amount(i.id, i.suggest) * i.last_cost, 0)

  const share = async () => {
    if (picked.length === 0) return
    const message = shoppingText(picked.map((i) => ({ name: i.name, unit: i.unit, qty: amount(i.id, i.suggest), category: i.cat })))
    try { await Share.share({ message }) } catch { /* dibatalkan pengguna */ }
  }

  // ---- Terima barang -> masuk ke stok ----
  const openRecv = (i: { id: string; suggest: number; last_cost: number }) => {
    const hasRef = i.last_cost > 0
    setRecv({ id: i.id, qty: String(amount(i.id, i.suggest)), price: hasRef ? String(i.last_cost) : '', mode: hasRef ? 'unit' : 'total' })
  }
  const saveRecv = async () => {
    if (!recv) return
    const q = toNum(recv.qty), p = toNum(recv.price)
    if (!(q > 0)) return setMsg({ ok: false, text: 'Jumlah harus lebih dari 0.' })
    if (recv.price.trim() === '' || !(p >= 0)) return setMsg({ ok: false, text: 'Isi harga pembelian.' })
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    const ing = ings.find((i) => i.id === recv.id)!
    const { error } = await supabase.from('stock_movements').insert({
      ingredient_id: recv.id, type: 'in', quantity: q, unit_cost: recv.mode === 'unit' ? p : p / q, note: 'Belanja', created_by: u.user?.id,
    })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: `Tersimpan: masuk ${num(q)} ${ing.unit} ${ing.name}.` })
    setRecv(null); load()
  }

  const groups = useMemo(() => {
    const m = new Map<string, typeof items>()
    for (const i of items) m.set(i.cat, [...(m.get(i.cat) ?? []), i])
    return [...m.entries()]
  }, [items])

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <PageTitle title="Daftar Belanja" subtitle="Dari bahan yang menipis. Jumlah mengikuti saran beli (fast moving 2× minimum, lainnya 1×) dan bisa diubah." />

      <StatGrid>
        <Stat label="Item di daftar" value={String(picked.length)} />
        {isAdmin ? <Stat label="Perkiraan biaya" value={rupiah(estimate)} tone="good" /> : null}
      </StatGrid>
      <Button title="Bagikan ke WhatsApp / lainnya" onPress={share} disabled={picked.length === 0} />
      {msg ? <Notice ok={msg.ok} text={msg.text} /> : null}

      {items.length === 0 ? <Card><Empty text="🎉 Tidak ada bahan yang perlu dibeli saat ini." /></Card> : groups.map(([cat, list]) => (
        <Card key={cat}>
          <CardHead title={cat} right={<Pill tone="gray" text={String(list.length)} />} />
          {list.map((i, idx) => {
            const on = !skip[i.id]
            return (
              <View key={i.id} style={{ gap: 10, paddingTop: idx ? 12 : 0, borderTopWidth: idx ? 1 : 0, borderTopColor: t.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pressable onPress={() => setSkip({ ...skip, [i.id]: on })} hitSlop={8} accessibilityLabel={`Ikutkan ${i.name}`}
                    style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: on ? t.brand : t.line, backgroundColor: on ? t.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Txt color="#fff" bold size={15}>✓</Txt> : null}
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Txt bold>{i.name}</Txt>
                    <Txt muted small>Stok {num(i.current_stock)} · min {num(i.min_stock)} {i.unit}{i.isFast ? ' · fast moving' : ''}</Txt>
                    {isAdmin && i.last_cost > 0 ? <Txt muted small>≈ {rupiah(amount(i.id, i.suggest) * i.last_cost)}</Txt> : null}
                  </View>
                  <View style={{ width: 92 }}>
                    <Field value={qty[i.id] ?? String(i.suggest)} onChangeText={(v) => setQty({ ...qty, [i.id]: v })} keyboardType="decimal-pad"
                      style={{ textAlign: 'right', paddingVertical: 8 }} accessibilityLabel={`Jumlah ${i.name}`} />
                    <Txt muted small align="right">{i.unit}</Txt>
                  </View>
                </View>
                <View style={{ alignSelf: 'flex-start' }}><Button title="Terima barang" variant="ghost" small onPress={() => openRecv(i)} /></View>

                {recv?.id === i.id ? (
                  <View style={{ gap: 10, padding: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.brand, borderRadius: 14, backgroundColor: t.brandSoft }}>
                    <NumField label={`Jumlah diterima (${i.unit})`} value={recv.qty} onChangeText={(v) => setRecv({ ...recv, qty: v })} />
                    <NumField label={recv.mode === 'unit' ? `Harga per ${i.unit} (Rp)` : 'Total harga pembelian (Rp)'} value={recv.price}
                      onChangeText={(v) => setRecv({ ...recv, price: v })} placeholder="0"
                      hint={recv.mode === 'unit' && i.last_cost > 0 ? 'Harga beli terakhir, ubah jika berbeda' : undefined} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button title="Masukkan ke stok" onPress={saveRecv} loading={busy} />
                      <Button title="Batal" variant="ghost" onPress={() => setRecv(null)} />
                    </View>
                  </View>
                ) : null}
              </View>
            )
          })}
        </Card>
      ))}
    </Screen>
  )
}
