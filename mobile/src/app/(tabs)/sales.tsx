import { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { startOfToday } from '@/lib/data'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import type { Menu } from '@/lib/types'
import { dateTime, num, rupiah } from '@/lib/analytics'
import {
  Button, Card, CardHead, Empty, Field, List, Notice, PageTitle, Pill, Row, Screen, Stat, StatGrid, Stepper, Txt, useDialog,
} from '@/components/ui'

interface Sale {
  id: string; menu_id: string | null; menu_name: string; quantity: number
  unit_price: number; note: string | null; created_at: string
  voided_at: string | null; void_reason: string | null
}

export default function Sales() {
  const t = useTheme()
  const { isAdmin } = useAuth()
  const { confirm, prompt } = useDialog()
  const [menus, setMenus] = useState<Menu[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [cogs, setCogs] = useState<Map<string, number>>(new Map())
  const [qty, setQty] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [a, b] = await Promise.all([
      supabase.from('menus').select('id, name, price, is_active').eq('is_active', true).order('name'),
      supabase.from('sales').select('id, menu_id, menu_name, quantity, unit_price, note, created_at, voided_at, void_reason')
        .gte('created_at', startOfToday()).order('created_at', { ascending: false }).limit(100),
    ])
    if (a.error) setMsg({ ok: false, text: `${a.error.message} (sudah menjalankan 006_sales.sql?)` })
    if (a.data) setMenus(a.data as Menu[])
    const list = (b.data ?? []) as Sale[]
    setSales(list)
    if (isAdmin && list.length) {
      const c = await supabase.from('sale_costs').select('sale_id, cogs').in('sale_id', list.map((s) => s.id))
      setCogs(new Map(((c.data ?? []) as { sale_id: string; cogs: number }[]).map((r) => [r.sale_id, Number(r.cogs)])))
    } else setCogs(new Map())
    setLoading(false)
  }, [isAdmin])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const shown = useMemo(() => menus.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())), [menus, q])
  const cart = menus.filter((m) => (qty[m.id] ?? 0) > 0)
  const cartItems = cart.reduce((s, m) => s + qty[m.id], 0)
  const cartTotal = cart.reduce((s, m) => s + qty[m.id] * Number(m.price), 0)

  const submit = async () => {
    if (cart.length === 0) return
    setBusy(true); setMsg(null)
    const failed: string[] = []
    const next: Record<string, number> = { ...qty }
    for (const m of cart) {
      const { error } = await supabase.rpc('record_sale', { p_menu: m.id, p_qty: qty[m.id], p_note: note.trim() || null })
      if (error) failed.push(`${m.name}: ${error.message}`)
      else next[m.id] = 0
    }
    setBusy(false); setQty(next)
    if (failed.length === 0) { setNote(''); setMsg({ ok: true, text: `Penjualan tercatat: ${cartItems} item. Stok bahan sudah terpotong.` }) }
    else setMsg({ ok: false, text: failed.join('\n') })
    load()
  }

  const voidSale = async (s: Sale) => {
    if (!(await confirm('Batalkan penjualan?', `${s.menu_name} ×${s.quantity}. Stok bahan akan dikembalikan.`, 'Batalkan'))) return
    const reason = (await prompt('Alasan pembatalan (opsional)', '')) ?? ''
    const { error } = await supabase.rpc('void_sale', { p_sale: s.id, p_reason: reason.trim() || null })
    setMsg(error
      ? { ok: false, text: `${error.message} (sudah menjalankan 007_void_sale.sql?)` }
      : { ok: true, text: `Penjualan ${s.menu_name} ×${s.quantity} dibatalkan. Stok dikembalikan.` })
    load()
  }

  const active = sales.filter((s) => !s.voided_at)
  const items = active.reduce((s, x) => s + x.quantity, 0)
  const revenue = active.reduce((s, x) => s + x.quantity * Number(x.unit_price), 0)
  const totalCogs = active.reduce((s, x) => s + (cogs.get(x.id) ?? 0), 0)

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <PageTitle title="Penjualan" subtitle="Pilih menu yang terjual, stok bahan terpotong otomatis sesuai resep" />

      <StatGrid>
        <Stat label="Item terjual hari ini" value={num(items)} />
        <Stat label="Transaksi" value={String(active.length)} />
        {isAdmin ? <Stat label="Omzet" value={rupiah(revenue)} tone="good" /> : null}
        {isAdmin ? <Stat label="Laba kotor" value={rupiah(revenue - totalCogs)} /> : null}
      </StatGrid>

      {msg ? <Notice ok={msg.ok} text={msg.text} /> : null}

      <Card>
        <Field value={q} onChangeText={setQ} placeholder="🔍 Cari menu…" />
        {menus.length === 0 ? <Empty text="Belum ada menu aktif. Admin dapat menambahkannya di Lainnya → Menu & Resep." /> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {shown.map((m) => {
              const n = qty[m.id] ?? 0
              return (
                <View key={m.id} style={{ flexBasis: '47%', flexGrow: 1, borderWidth: 1.5, borderRadius: 16, padding: 12, gap: 2,
                  borderColor: n > 0 ? t.brand : t.line, backgroundColor: n > 0 ? t.brandSoft : t.inputBg }}>
                  <Txt bold numberOfLines={2}>{m.name}</Txt>
                  <Txt muted small>{rupiah(Number(m.price))}</Txt>
                  <Stepper value={n} onChange={(v) => setQty((s) => ({ ...s, [m.id]: v }))} />
                </View>
              )
            })}
            {shown.length === 0 ? <Empty text="Menu tidak ditemukan." /> : null}
          </View>
        )}

        <View style={{ borderTopWidth: 1, borderTopColor: t.line, paddingTop: 12, gap: 12 }}>
          <Field label="Catatan (opsional)" value={note} onChangeText={setNote} placeholder="mis. pesanan meja 5" />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Txt muted>{cartItems} item</Txt>
            <Txt size={22} bold>{rupiah(cartTotal)}</Txt>
          </View>
          <Button title="Catat penjualan" onPress={submit} loading={busy} disabled={cart.length === 0} />
        </View>
      </Card>

      <Card>
        <CardHead title="Penjualan hari ini" />
        {sales.length === 0 ? <Empty text="Belum ada penjualan hari ini." /> : (
          <List>
            {sales.map((s) => (
              <Row key={s.id} dim={!!s.voided_at}
                title={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Txt bold>{s.menu_name} <Txt muted>×{s.quantity}</Txt></Txt>
                    {s.voided_at ? <Pill tone="empty" text="Dibatalkan" /> : null}
                  </View>
                }
                subtitle={`${dateTime(s.created_at)}${s.note ? ` · ${s.note}` : ''}${s.voided_at ? ` · batal ${dateTime(s.voided_at)}${s.void_reason ? `: ${s.void_reason}` : ''}` : ''}`}
                extra={isAdmin && !s.voided_at ? (
                  <View style={{ alignSelf: 'flex-start', marginTop: 6 }}><Button title="Batalkan" variant="danger" small onPress={() => voidSale(s)} /></View>
                ) : undefined}
                right={rupiah(s.quantity * Number(s.unit_price))}
                rightSub={isAdmin && cogs.has(s.id) && !s.voided_at ? `HPP ${rupiah(cogs.get(s.id)!)}` : undefined}
              />
            ))}
          </List>
        )}
      </Card>
    </Screen>
  )
}
