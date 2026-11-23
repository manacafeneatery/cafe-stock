import { useCallback, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { loadIngredients } from '@/lib/data'
import { useTheme } from '@/lib/theme'
import type { Ingredient, Menu, RecipeItem } from '@/lib/types'
import { num, rupiah, toNum } from '@/lib/analytics'
import { Button, Card, Empty, Field, List, Notice, NumField, PageTitle, Row, Screen, Select, Txt, useDialog } from '@/components/ui'

type Msg = { ok: boolean; text: string } | null
type Result = PromiseLike<{ error: { message: string } | null }>

function MenuCard({ menu, items, ings, onChange, onMsg }: {
  menu: Menu; items: RecipeItem[]; ings: Map<string, Ingredient>; onChange: () => void; onMsg: (m: Msg) => void
}) {
  const t = useTheme()
  const { confirm, prompt } = useDialog()
  const [open, setOpen] = useState(false)
  const [ingId, setIngId] = useState('')
  const [qty, setQty] = useState('')

  const lines = items.map((r) => {
    const ing = ings.get(r.ingredient_id)
    return { r, ing, cost: ing ? Number(r.quantity) * Number(ing.avg_cost) : 0 }
  })
  const hpp = lines.reduce((s, l) => s + l.cost, 0)
  const profit = menu.price - hpp
  const marginPct = menu.price > 0 ? (profit / menu.price) * 100 : 0
  const tone = menu.price <= 0 ? t.text : marginPct >= 60 ? t.brand : marginPct >= 40 ? t.text : t.brick
  const used = new Set(items.map((i) => i.ingredient_id))
  const options = [...ings.values()].filter((i) => !used.has(i.id)).map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))

  const run = async (p: Result, ok: string) => {
    const { error } = await p
    onMsg(error ? { ok: false, text: error.message } : { ok: true, text: ok })
    onChange()
  }

  const addItem = async () => {
    const q = toNum(qty)
    if (!ingId || !(q > 0)) return onMsg({ ok: false, text: 'Pilih bahan dan isi jumlah.' })
    await run(supabase.from('recipe_items').insert({ menu_id: menu.id, ingredient_id: ingId, quantity: q }), 'Bahan ditambahkan ke resep.')
    setIngId(''); setQty('')
  }
  const rename = async () => {
    const name = (await prompt('Nama menu', menu.name))?.trim()
    if (name && name !== menu.name) run(supabase.from('menus').update({ name }).eq('id', menu.id), 'Nama menu diubah.')
  }
  const setPrice = async () => {
    const v = await prompt('Harga jual (Rp)', String(menu.price), { numeric: true })
    if (v === null) return
    const price = toNum(v)
    if (!(price >= 0)) return onMsg({ ok: false, text: 'Harga tidak valid.' })
    run(supabase.from('menus').update({ price }).eq('id', menu.id), 'Harga jual diubah.')
  }
  const remove = async () => {
    if (await confirm('Hapus menu?', `"${menu.name}" beserta resepnya akan dihapus.`, 'Hapus'))
      run(supabase.from('menus').delete().eq('id', menu.id), 'Menu dihapus.')
  }

  return (
    <Card>
      <Pressable onPress={() => setOpen(!open)} style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Txt size={17} bold>{menu.name}</Txt>
            <Txt muted small>{items.length} bahan · harga jual {rupiah(menu.price)}</Txt>
          </View>
          <Txt muted>{open ? '▾' : '▸'}</Txt>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View><Txt muted small>HPP / porsi</Txt><Txt bold>{rupiah(hpp)}</Txt></View>
          <View style={{ alignItems: 'flex-end' }}><Txt muted small>Margin</Txt><Txt bold color={tone}>{menu.price > 0 ? `${num(marginPct)}%` : '—'}</Txt></View>
        </View>
      </Pressable>

      {open ? (
        <>
          {lines.length === 0 ? <Empty text="Resep masih kosong." /> : (
            <List>
              {lines.map(({ r, ing, cost }) => (
                <Row key={r.id} title={ing?.name ?? '—'} subtitle={`${num(r.quantity)} ${ing?.unit ?? ''}`}
                  extra={<View style={{ alignSelf: 'flex-start', marginTop: 4 }}><Button title="Hapus" variant="danger" small onPress={() => run(supabase.from('recipe_items').delete().eq('id', r.id), 'Bahan dihapus dari resep.')} /></View>}
                  right={rupiah(cost)} rightSub="HPP bahan" />
              ))}
            </List>
          )}
          {lines.length > 0 ? (
            <View style={{ borderTopWidth: 1, borderTopColor: t.line, paddingTop: 10, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt bold>Total HPP / porsi</Txt><Txt bold>{rupiah(hpp)}</Txt></View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt muted>Laba kotor / porsi</Txt><Txt bold color={profit >= 0 ? t.brand : t.brick}>{rupiah(profit)}</Txt>
              </View>
            </View>
          ) : null}

          <Select label="Tambah bahan ke resep" value={ingId} onChange={setIngId} options={options} placeholder="— Pilih bahan —" searchable />
          <NumField label="Jumlah per 1 porsi" value={qty} onChangeText={setQty} placeholder="0" />
          <Button title="Tambah ke resep" onPress={addItem} disabled={!ingId || !qty} />

          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button title="Ubah nama" variant="ghost" small onPress={rename} />
            <Button title="Ubah harga jual" variant="ghost" small onPress={setPrice} />
            <Button title="Hapus menu" variant="danger" small onPress={remove} />
          </View>
        </>
      ) : null}
    </Card>
  )
}

export default function Menus() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [items, setItems] = useState<RecipeItem[]>([])
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [a, b, c] = await Promise.all([
      supabase.from('menus').select('*').order('name'),
      supabase.from('recipe_items').select('*'),
      loadIngredients(true, true),
    ])
    const err = a.error ?? b.error ?? c.error
    if (err) setMsg({ ok: false, text: `${err.message} (sudah menjalankan 003 dan 004 .sql?)` })
    if (a.data) setMenus(a.data as Menu[])
    if (b.data) setItems(b.data as RecipeItem[])
    setIngs(c.data)
    setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const ingMap = useMemo(() => new Map(ings.map((i) => [i.id, i])), [ings])

  const add = async () => {
    const { error } = await supabase.from('menus').insert({ name: name.trim(), price: toNum(price) || 0 })
    if (error) return setMsg({ ok: false, text: error.message.includes('duplicate') ? 'Nama menu sudah ada.' : error.message })
    setName(''); setPrice(''); setMsg({ ok: true, text: 'Menu ditambahkan. Buka kartunya untuk mengisi resep.' }); load()
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <PageTitle title="Menu & Resep" subtitle="HPP per porsi dihitung dari resep × HPP rata-rata tiap bahan" />
      <Card>
        <Field label="Nama menu" value={name} onChangeText={setName} placeholder="mis. Es Kopi Susu" />
        <NumField label="Harga jual (Rp)" value={price} onChangeText={setPrice} placeholder="0" />
        <Button title="+ Tambah menu" onPress={add} disabled={!name.trim()} />
      </Card>
      {msg ? <Notice ok={msg.ok} text={msg.text} /> : null}
      {menus.map((m) => (
        <MenuCard key={m.id} menu={m} items={items.filter((r) => r.menu_id === m.id)} ings={ingMap} onChange={load} onMsg={setMsg} />
      ))}
      {menus.length === 0 ? <Empty text="Belum ada menu." /> : null}
    </Screen>
  )
}
