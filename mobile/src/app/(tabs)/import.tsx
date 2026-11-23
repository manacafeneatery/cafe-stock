import { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { parseIdekuReport, type PosReport } from '@/lib/pos'
import type { Menu } from '@/lib/types'
import { num } from '@/lib/analytics'
import {
  Button, Card, CardHead, Empty, List, Notice, PageTitle, Pill, Row, Screen, Select, Stat, StatGrid, Txt, useDialog,
} from '@/components/ui'

interface MapRow { pos_key: string; pos_name: string; menu_id: string | null; ignored: boolean }
interface Result { key: string; name: string; status: string; qty: number; message: string | null }
const IGNORE = '__ignore__'

const STATUS: Record<string, [string, 'ok' | 'low' | 'empty']> = {
  imported: ['Berhasil', 'ok'], unchanged: ['Sudah diimpor', 'ok'], lower: ['Lebih kecil', 'low'],
  unmapped: ['Belum dipetakan', 'low'], ignored: ['Diabaikan', 'ok'], error: ['Gagal', 'empty'],
}

export default function ImportPos() {
  const t = useTheme()
  const { isAdmin } = useAuth()
  const { confirm } = useDialog()
  const [report, setReport] = useState<PosReport | null>(null)
  const [fileErr, setFileErr] = useState('')
  const [fileName, setFileName] = useState('')
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
  useFocusEffect(useCallback(() => { loadBase() }, [loadBase]))

  const loadLogged = useCallback(async (date: string) => {
    const { data } = await supabase.from('pos_imports').select('pos_key, qty_total').eq('business_date', date)
    setLogged(new Map(((data ?? []) as { pos_key: string; qty_total: number }[]).map((r) => [r.pos_key, Number(r.qty_total)])))
  }, [])
  useEffect(() => { if (report) loadLogged(report.date) }, [report, loadLogged])

  const pick = async () => {
    setResults(null); setMsg(null); setFileErr('')
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false })
      if (res.canceled || !res.assets?.[0]) return
      const asset = res.assets[0]
      const text = await (await fetch(asset.uri)).text()
      setReport(parseIdekuReport(text)); setFileName(asset.name)
    } catch (err) {
      setReport(null)
      setFileErr(err instanceof Error ? err.message : 'File tidak bisa dibaca.')
    }
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
  const mapOptions = useMemo(
    () => [...menus.map((m) => ({ value: m.id, label: m.name })), { value: IGNORE, label: 'Abaikan (bukan menu / tanpa stok)' }],
    [menus],
  )

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
    const rows: MapRow[] = view.filter((v) => v.kind === 'unmapped' && byName.has(v.name.trim().toLowerCase()))
      .map((v) => ({ pos_key: v.key, pos_name: v.name, menu_id: byName.get(v.name.trim().toLowerCase())!, ignored: false }))
    if (rows.length === 0) return setMsg({ ok: false, text: 'Tidak ada item dengan nama yang sama persis dengan menu.' })
    const { error } = await supabase.from('pos_item_map').upsert(rows, { onConflict: 'pos_key' })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${rows.length} item dipetakan otomatis berdasarkan nama.` })
    loadBase()
  }

  const run = async () => {
    if (!report || todo.length === 0) return
    const portions = todo.reduce((s, v) => s + v.delta, 0)
    if (!(await confirm(`Impor ${todo.length} item?`, `${num(portions)} porsi akan memotong stok sesuai resep.`, 'Impor'))) return
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
    <Screen>
      <PageTitle title="Impor Kasir" subtitle="Unggah laporan Analitik Item (CSV) dari Ideku untuk satu hari. Stok terpotong sesuai resep." />

      <Card>
        <Button title={report ? 'Pilih file lain' : 'Pilih file laporan (.csv)'} variant={report ? 'ghost' : 'primary'} onPress={pick} />
        {fileName ? <Txt muted small>File: {fileName}</Txt> : null}
        {fileErr ? <Notice ok={false} text={fileErr} /> : null}
        <Txt muted small>
          Laporan boleh diimpor berkali-kali dalam sehari: yang dipotong hanya selisih penjualan barunya. Jangan mencatat penjualan yang sama
          secara manual di menu Penjualan, supaya stok tidak terpotong dua kali.
        </Txt>
      </Card>

      {msg ? <Notice ok={msg.ok} text={msg.text} /> : null}

      {report ? (
        <>
          <StatGrid>
            <Stat label="Toko · Tanggal" value={`${report.date.split('-').reverse().join('/')}`} />
            <Stat label="Akan diimpor" value={String(todo.length)} tone="good" />
            <Stat label="Belum dipetakan" value={String(count('unmapped'))} tone="warn" />
            <Stat label="Sudah beres" value={String(count('done') + count('ignored'))} />
          </StatGrid>

          <Card>
            <CardHead title="Item di laporan" right={<Pill tone="gray" text={`${view.length} item`} />} />
            {isAdmin && count('unmapped') > 0 ? <Button title="Petakan otomatis (nama sama)" variant="ghost" small onPress={autoMap} /> : null}
            {!isAdmin && count('unmapped') > 0 ? (
              <Notice ok={false} text={`${count('unmapped')} item belum dipetakan ke menu. Minta Admin memetakannya dulu; item itu dilewati saat impor.`} />
            ) : null}

            {view.length === 0 ? <Empty text="Tidak ada item terjual di laporan ini." /> : (
              <List>
                {view.map((v) => (
                  <Row key={v.key} title={v.name}
                    subtitle={`${v.code || 'tanpa kode'} · ${v.category}  ·  terjual ${num(v.qty)}${v.done ? `, diimpor ${num(v.done)}` : ''}`}
                    extra={
                      v.kind === 'unmapped' ? (
                        isAdmin
                          ? <View style={{ marginTop: 6 }}><Select value="" onChange={(val) => setMapping(v.key, v.name, val)} options={mapOptions} placeholder="Petakan ke menu…" searchable /></View>
                          : <View style={{ marginTop: 4 }}><Pill tone="low" text="Belum dipetakan" /></View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                          {v.kind === 'ignored' ? <Pill tone="ok" text="Diabaikan" /> : <Txt small color={t.brand}>→ {menuName(v.m!.menu_id)}</Txt>}
                          {v.kind === 'todo' ? <Pill tone="low" text={`+${num(v.delta)} diimpor`} /> : null}
                          {v.kind === 'done' ? <Pill tone="ok" text="Sudah diimpor" /> : null}
                          {v.kind === 'lower' ? <Pill tone="low" text="Lebih kecil dari yang diimpor" /> : null}
                        </View>
                      )
                    } />
                ))}
              </List>
            )}
            <Button title={busy ? 'Mengimpor…' : `Impor ke stok (${todo.length})`} onPress={run} loading={busy} disabled={todo.length === 0} />
          </Card>

          {results ? (
            <Card>
              <CardHead title="Hasil impor" />
              <List>
                {results.map((r) => {
                  const [label, tone] = STATUS[r.status] ?? [r.status, 'low' as const]
                  return (
                    <Row key={r.key} title={r.name} subtitle={r.message ?? undefined}
                      extra={<View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}><Pill tone={tone} text={label} />{r.status === 'imported' ? <Pill tone="gray" text={`+${num(r.qty)}`} /> : null}</View>} />
                  )
                })}
              </List>
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  )
}
