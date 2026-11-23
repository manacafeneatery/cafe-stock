import { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { MOVE_COLS, loadIngredients, startOfToday } from '@/lib/data'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import type { Category, Ingredient, Movement } from '@/lib/types'
import {
  computeStats, LEVEL_LABEL, num, restockQty, rupiah, stockLevel, WINDOW_DAYS, type IngredientStat,
} from '@/lib/analytics'
import { Bar, Button, Card, CardHead, Chips, Empty, List, Notice, PageTitle, Pill, Row, Screen, Stat, StatGrid, Txt } from '@/components/ui'

type Kind = 'fast' | 'low' | 'slow'

function ItemRow({ s, kind, cat }: { s: IngredientStat; kind: Kind; cat?: string }) {
  const t = useTheme()
  const pct = s.min_stock > 0 ? (s.current_stock / (s.min_stock * 2)) * 100 : 100
  const lv = stockLevel(s.current_stock, s.min_stock)
  const buy = restockQty(s.current_stock, s.min_stock, s.isFast)

  const sub =
    kind === 'fast' ? `Terpakai ${num(s.usage)} ${s.unit} / ${WINDOW_DAYS} hr`
    : kind === 'low' ? `${s.daysLeft !== null ? `Cukup ± ${num(Math.floor(s.daysLeft))} hari · ` : ''}Min ${num(s.min_stock)} ${s.unit}`
    : s.usage === 0 ? `Tidak ada pemakaian ${WINDOW_DAYS} hr` : `Terpakai ${num(s.usage)} ${s.unit}`

  return (
    <Row
      title={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Txt bold>{s.name}</Txt>
          {lv !== 'ok' ? <Pill tone={lv} text={LEVEL_LABEL[lv]} /> : null}
        </View>
      }
      subtitle={`${sub}${cat ? ` · ${cat}` : ''}`}
      extra={
        <>
          {kind === 'low' && buy > 0 ? (
            <Txt small bold color={t.brick}>
              Saran beli ± {num(buy)} {s.unit} ({s.isFast ? '2×' : '1×'} min){s.last_cost > 0 ? ` · ± ${rupiah(buy * s.last_cost)}` : ''}
            </Txt>
          ) : null}
          <Bar pct={pct} tone={kind} />
        </>
      }
      right={num(s.current_stock)}
      rightSub={s.unit}
    />
  )
}

function Section({ title, hint, dot, items, kind, catName }: {
  title: string; hint: string; dot: 'red' | 'green' | 'gray'; items: IngredientStat[]; kind: Kind; catName: Map<string, string>
}) {
  return (
    <Card>
      <CardHead title={title} dot={dot} right={<Pill tone="gray" text={String(items.length)} />} />
      <Txt muted small>{hint}</Txt>
      {items.length === 0 ? <Empty text="Tidak ada bahan di kategori ini." /> : (
        <List>{items.map((s) => <ItemRow key={s.id} s={s} kind={kind} cat={s.category_id ? catName.get(s.category_id) : undefined} />)}</List>
      )}
    </Card>
  )
}

export default function Dashboard() {
  const { isAdmin } = useAuth()
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [moves, setMoves] = useState<Movement[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [opname, setOpname] = useState<{ done: number; total: number } | null>(null)
  const router = useRouter()
  const theme = useTheme()

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

  useFocusEffect(useCallback(() => { load() }, [load]))

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
    <Screen onRefresh={load} refreshing={loading}>
      <PageTitle title="Ringkasan Stok" subtitle={`Analisis pemakaian ${WINDOW_DAYS} hari terakhir`} />
      {error ? <Notice ok={false} text={error} /> : null}

      {/* Pengingat opname harian */}
      {opname && opname.total > 0 ? (
        opname.done < opname.total ? (
          <Card style={{ borderLeftWidth: 5, borderLeftColor: theme.brick, gap: 8 }}>
            <Txt bold size={16}>⚠️ {opname.total - opname.done} bahan belum di-opname hari ini</Txt>
            <Txt muted small>{opname.done} dari {opname.total} bahan sudah dihitung.</Txt>
            <Button title="Mulai opname" onPress={() => router.navigate('/opname')} />
          </Card>
        ) : (
          <Card style={{ borderLeftWidth: 5, borderLeftColor: theme.brand, gap: 4 }}>
            <Txt bold color={theme.brand}>✅ Opname hari ini selesai</Txt>
            <Txt muted small>Semua {opname.total} bahan sudah dihitung.</Txt>
          </Card>
        )
      ) : null}

      {cats.length > 0 ? (
        <Chips value={filter} onChange={setFilter}
          options={[{ id: 'all', label: 'Semua' }, ...cats.map((c) => ({ id: c.id, label: c.name })), { id: 'none', label: 'Tanpa kategori' }]} />
      ) : null}

      <StatGrid>
        <Stat label="Total bahan" value={String(stats.length)} />
        <Stat label="Akan habis" value={String(low.length)} tone="warn" />
        <Stat label="Fast moving" value={String(fast.length)} tone="good" />
        {isAdmin ? <Stat label="Nilai stok" value={rupiah(totalValue)} /> : <Stat label="Jarang keluar" value={String(slow.length)} />}
      </StatGrid>

      <Section title="Akan habis" dot="red" kind="low" items={low} catName={catName} hint="Stok ≤ batas minimum atau cukup ≤ 3 hari pemakaian." />
      <Section title="Fast moving" dot="green" kind="fast" items={fast} catName={catName} hint="Bahan yang cepat terpakai — jaga selalu tersedia." />
      <Section title="Jarang keluar" dot="gray" kind="slow" items={slow} catName={catName} hint="Pemakaian rendah — hindari membeli berlebihan." />
    </Screen>
  )
}
