import { useCallback, useMemo, useRef, useState, type ComponentRef } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { loadIngredients } from '@/lib/data'
import { useTheme } from '@/lib/theme'
import type { Category, Ingredient } from '@/lib/types'
import { dateTime, LEVEL_LABEL, num, rupiah, stockLevel, toNum } from '@/lib/analytics'
import {
  Button, Card, CardHead, Chips, Empty, Field, List, Notice, NumField, PageTitle, Pill, Row, Screen, Select, Stat, Txt, useDialog,
} from '@/components/ui'

const NEW_CAT = '__new__'   // nilai khusus di dropdown: tambah kategori baru
const UNITS = ['gram', 'ml', 'pcs', 'kg', 'liter']
const empty = { name: '', unit: 'gram', category_id: '', min_stock: '0' }
type Msg = { ok: boolean; text: string } | null
interface Adjustment {
  id: string; ingredient_id: string; old_avg: number; new_avg: number
  old_last: number; new_last: number; note: string | null; created_at: string
}

function Fig({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexBasis: '30%', flexGrow: 1 }}>
      <Txt muted small>{label}</Txt>
      <Txt bold color={color}>{value}</Txt>
    </View>
  )
}

export default function Ingredients() {
  const t = useTheme()
  const { confirm, prompt } = useDialog()
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null)
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')   // all | none | <category id>
  const [newCat, setNewCat] = useState('')
  const [inlineCat, setInlineCat] = useState('')
  const [showCats, setShowCats] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [costFor, setCostFor] = useState<Ingredient | null>(null)
  const [costForm, setCostForm] = useState({ avg: '', last: '', note: '' })
  const [adjs, setAdjs] = useState<Adjustment[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [a, b, d] = await Promise.all([
      loadIngredients(true),
      supabase.from('categories').select('*').order('name'),
      supabase.from('cost_adjustments').select('*').order('created_at', { ascending: false }).limit(10),
    ])
    if (d.data) setAdjs(d.data as Adjustment[])
    if (a.error) setMsg({ ok: false, text: a.error.message })
    setIngs(a.data)
    if (b.error) setMsg({ ok: false, text: `Kategori: ${b.error.message} (sudah menjalankan 002_categories.sql?)` })
    if (b.data) setCats(b.data as Category[])
    setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const toTop = () => scroll.current?.scrollTo({ y: 0, animated: true })
  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats])
  const filtered = useMemo(() => ings.filter((i) =>
    i.name.toLowerCase().includes(q.toLowerCase()) &&
    (filter === 'all' || (filter === 'none' ? !i.category_id : i.category_id === filter))), [ings, q, filter])
  const totalValue = ings.filter((i) => i.is_active).reduce((s, i) => s + i.current_stock * i.avg_cost, 0)
  const countBy = (id: string) => ings.filter((i) => (id === 'none' ? !i.category_id : i.category_id === id)).length

  /* ---------- Bahan ---------- */
  const startEdit = (i: Ingredient) => {
    setEditing(i)
    setForm({ name: i.name, unit: i.unit, category_id: i.category_id ?? '', min_stock: String(i.min_stock) })
    toTop()
  }
  const reset = () => { setEditing(null); setForm(empty) }

  const submit = async () => {
    if (form.category_id === NEW_CAT) return setMsg({ ok: false, text: 'Simpan kategori baru dulu, atau pilih kategori lain.' })
    const payload = {
      name: form.name.trim(), unit: form.unit.trim(),
      category_id: form.category_id || null, min_stock: Math.max(0, toNum(form.min_stock) || 0),
    }
    const { error } = editing
      ? await supabase.from('ingredients').update(payload).eq('id', editing.id)
      : await supabase.from('ingredients').insert(payload)
    if (error) return setMsg({ ok: false, text: error.message.includes('duplicate') ? 'Nama bahan sudah ada.' : error.message })
    setMsg({ ok: true, text: editing ? 'Bahan diperbarui.' : 'Bahan ditambahkan.' })
    reset(); load()
  }

  const toggle = async (i: Ingredient) => {
    await supabase.from('ingredients').update({ is_active: !i.is_active }).eq('id', i.id)
    load()
  }

  const saveMin = async (i: Ingredient, value: string) => {
    const v = Math.max(0, toNum(value) || 0)
    if (v === i.min_stock) return
    const { error } = await supabase.from('ingredients').update({ min_stock: v }).eq('id', i.id)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `Stok minimum ${i.name} diubah menjadi ${num(v)} ${i.unit}.` })
    load()
  }

  /* ---------- Atur harga manual (tercatat di riwayat) ---------- */
  const openCost = (i: Ingredient) => {
    setCostFor(i)
    setCostForm({ avg: String(i.avg_cost), last: String(i.last_cost || i.avg_cost), note: '' })
    toTop()
  }
  const saveCost = async () => {
    if (!costFor) return
    const avg = toNum(costForm.avg), last = toNum(costForm.last)
    if (!(avg >= 0) || !(last >= 0)) return setMsg({ ok: false, text: 'Harga tidak valid.' })
    const { error } = await supabase.rpc('set_ingredient_cost', {
      p_ingredient: costFor.id, p_avg_cost: avg, p_last_cost: last, p_note: costForm.note.trim() || null,
    })
    if (error) return setMsg({ ok: false, text: `${error.message} (sudah menjalankan 005_cost_adjust.sql?)` })
    setMsg({ ok: true, text: `Harga ${costFor.name} diperbarui: HPP ${rupiah(avg)} / ${costFor.unit}.` })
    setCostFor(null); load()
  }

  /* ---------- Kategori ---------- */
  const addCat = async () => {
    const name = newCat.trim()
    if (!name) return
    const { error } = await supabase.from('categories').insert({ name })
    if (error) return setMsg({ ok: false, text: error.message.includes('duplicate') ? 'Kategori sudah ada.' : error.message })
    setNewCat(''); setMsg({ ok: true, text: `Kategori "${name}" ditambahkan.` }); load()
  }
  // Tambah kategori langsung dari form bahan, lalu otomatis terpilih
  const addCatInline = async () => {
    const name = inlineCat.trim()
    if (!name) return setMsg({ ok: false, text: 'Isi nama kategori terlebih dahulu.' })
    const existing = cats.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      setForm((f) => ({ ...f, category_id: existing.id })); setInlineCat('')
      return setMsg({ ok: true, text: `Kategori "${existing.name}" sudah ada dan dipilih.` })
    }
    const { data, error } = await supabase.from('categories').insert({ name }).select('id').single()
    if (error || !data) return setMsg({ ok: false, text: error?.message ?? 'Gagal menyimpan kategori.' })
    setForm((f) => ({ ...f, category_id: data.id as string })); setInlineCat('')
    setMsg({ ok: true, text: `Kategori "${name}" ditambahkan dan dipilih.` }); load()
  }
  const renameCat = async (c: Category) => {
    const name = (await prompt('Nama kategori baru', c.name))?.trim()
    if (!name || name === c.name) return
    const { error } = await supabase.from('categories').update({ name }).eq('id', c.id)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Kategori diubah.' }); load()
  }
  const deleteCat = async (c: Category) => {
    const n = countBy(c.id)
    if (!(await confirm('Hapus kategori?', n ? `"${c.name}": ${n} bahan akan menjadi tanpa kategori.` : `"${c.name}"`, 'Hapus'))) return
    const { error } = await supabase.from('categories').delete().eq('id', c.id)
    if (filter === c.id) setFilter('all')
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Kategori dihapus.' }); load()
  }

  return (
    <Screen scrollRef={scroll} onRefresh={load} refreshing={loading}>
      <PageTitle title="Bahan & HPP" subtitle="HPP dihitung otomatis (rata-rata tertimbang) dari setiap pembelian" />
      <Stat label="Nilai stok" value={rupiah(totalValue)} />

      {/* Form tambah / ubah bahan */}
      <Card>
        <CardHead title={editing ? `Ubah: ${editing.name}` : 'Tambah bahan'} />
        <Field label="Nama bahan" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        <View style={{ gap: 6 }}>
          <Field label="Satuan" value={form.unit} onChangeText={(v) => setForm({ ...form, unit: v })} autoCapitalize="none" />
          <Chips value={form.unit} onChange={(u) => setForm({ ...form, unit: u })} options={UNITS.map((u) => ({ id: u, label: u }))} />
        </View>
        <Select label="Kategori" value={form.category_id} onChange={(v) => setForm({ ...form, category_id: v })}
          options={[{ value: '', label: '— Tanpa kategori —' }, ...cats.map((c) => ({ value: c.id, label: c.name })), { value: NEW_CAT, label: '➕ Kategori baru…' }]} />
        {form.category_id === NEW_CAT ? (
          <View style={{ gap: 10, padding: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.brand, borderRadius: 14, backgroundColor: t.brandSoft }}>
            <Field label="Nama kategori baru" value={inlineCat} onChangeText={setInlineCat} placeholder="mis. Topping" autoFocus onSubmitEditing={addCatInline} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Simpan kategori" onPress={addCatInline} />
              <Button title="Batal" variant="ghost" onPress={() => { setForm({ ...form, category_id: '' }); setInlineCat('') }} />
            </View>
          </View>
        ) : null}
        <NumField label={`Stok minimum${form.unit ? ` (${form.unit})` : ''}`} value={form.min_stock} onChangeText={(v) => setForm({ ...form, min_stock: v })} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={editing ? 'Simpan perubahan' : '+ Tambah bahan'} onPress={submit} disabled={!form.name.trim() || !form.unit.trim()} />
          {editing ? <Button title="Batal" variant="ghost" onPress={reset} /> : null}
        </View>
      </Card>

      {msg ? <Notice ok={msg.ok} text={msg.text} /> : null}

      {/* Atur harga manual */}
      {costFor ? (
        <Card style={{ borderLeftWidth: 5, borderLeftColor: t.brick }}>
          <CardHead title={`Atur harga: ${costFor.name}`} />
          <Txt muted small>Hanya untuk koreksi atau stok awal. Pembelian berikutnya lewat Entry Stok tetap menghitung HPP rata-rata dari angka ini.</Txt>
          <NumField label={`HPP per ${costFor.unit} (Rp)`} value={costForm.avg} onChangeText={(v) => setCostForm({ ...costForm, avg: v })} />
          <NumField label={`Harga beli terakhir per ${costFor.unit} (Rp)`} value={costForm.last} onChangeText={(v) => setCostForm({ ...costForm, last: v })} />
          <Field label="Alasan / catatan" value={costForm.note} onChangeText={(v) => setCostForm({ ...costForm, note: v })} placeholder="mis. stok awal sebelum pakai aplikasi" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Simpan harga" onPress={saveCost} />
            <Button title="Batal" variant="ghost" onPress={() => setCostFor(null)} />
          </View>
        </Card>
      ) : null}

      {/* Kelola kategori */}
      <Card>
        <CardHead title="Kategori bahan" right={<Button title={showCats ? 'Tutup' : 'Kelola'} variant="ghost" small onPress={() => setShowCats(!showCats)} />} />
        {showCats ? (
          <>
            <Field value={newCat} onChangeText={setNewCat} placeholder="Nama kategori baru, mis. Topping" onSubmitEditing={addCat} />
            <Button title="Tambah kategori" onPress={addCat} disabled={!newCat.trim()} />
            {cats.length === 0 ? <Empty text="Belum ada kategori." /> : (
              <List>
                {cats.map((c) => (
                  <Row key={c.id} title={c.name} subtitle={`${countBy(c.id)} bahan`}
                    extra={
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                        <Button title="Ubah" variant="ghost" small onPress={() => renameCat(c)} />
                        <Button title="Hapus" variant="danger" small onPress={() => deleteCat(c)} />
                      </View>
                    } />
                ))}
              </List>
            )}
          </>
        ) : null}
      </Card>

      {/* Daftar bahan */}
      <Chips value={filter} onChange={setFilter}
        options={[{ id: 'all', label: 'Semua', count: ings.length }, ...cats.map((c) => ({ id: c.id, label: c.name, count: countBy(c.id) })),
          ...(countBy('none') > 0 ? [{ id: 'none', label: 'Tanpa kategori', count: countBy('none') }] : [])]} />
      <Field value={q} onChangeText={setQ} placeholder="🔍 Cari bahan…" />

      {filtered.map((i) => {
        const lv = stockLevel(i.current_stock, i.min_stock)
        return (
          <Card key={i.id} style={{ opacity: i.is_active ? 1 : 0.5, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Txt size={17} bold>{i.name}</Txt>
                <Txt muted small>{(i.category_id && catName.get(i.category_id)) || 'Tanpa kategori'}</Txt>
              </View>
              <Pill tone={lv} text={LEVEL_LABEL[lv]} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Fig label="Stok" value={`${num(i.current_stock)} ${i.unit}`} />
              <Fig label="HPP / unit" value={rupiah(i.avg_cost)} />
              <Fig label="Harga beli terakhir" value={i.last_cost > 0 ? rupiah(i.last_cost) : '—'} />
              <Fig label="Nilai stok" value={rupiah(i.current_stock * i.avg_cost)} />
              <View style={{ flexBasis: '30%', flexGrow: 1 }}>
                <Txt muted small>Stok minimum</Txt>
                <TextInput
                  key={`${i.id}-${i.min_stock}`} defaultValue={String(i.min_stock)} keyboardType="decimal-pad"
                  onEndEditing={(e) => saveMin(i, e.nativeEvent.text)} accessibilityLabel={`Stok minimum ${i.name}`}
                  style={{ backgroundColor: t.inputBg, color: t.text, borderColor: t.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, marginTop: 2 }}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button title="Ubah" variant="ghost" small onPress={() => startEdit(i)} />
              <Button title="Atur harga" variant="ghost" small onPress={() => openCost(i)} />
              <Button title={i.is_active ? 'Nonaktifkan' : 'Aktifkan'} variant="ghost" small onPress={() => toggle(i)} />
            </View>
          </Card>
        )
      })}
      {filtered.length === 0 ? <Empty text="Tidak ada bahan." /> : null}

      {/* Riwayat penyesuaian harga */}
      {adjs.length > 0 ? (
        <Card>
          <CardHead title="Riwayat penyesuaian harga" right={<Pill tone="gray" text={`${adjs.length} terakhir`} />} />
          <List>
            {adjs.map((a) => (
              <Row key={a.id} title={ings.find((i) => i.id === a.ingredient_id)?.name ?? '—'}
                subtitle={`${dateTime(a.created_at)}${a.note ? ` · ${a.note}` : ''}`}
                right={`${rupiah(a.old_avg)} → ${rupiah(a.new_avg)}`} rightSub={`Terakhir ${rupiah(a.old_last)} → ${rupiah(a.new_last)}`} />
            ))}
          </List>
        </Card>
      ) : null}
    </Screen>
  )
}
