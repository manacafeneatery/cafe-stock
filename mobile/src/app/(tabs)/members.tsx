import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import type { Profile, Role } from '@/lib/types'
import { Button, Card, CardHead, Empty, List, Notice, PageTitle, Pill, Row, Screen, Txt, useDialog } from '@/components/ui'

const LABEL: Record<Role, string> = { admin: 'Admin', staff: 'Karyawan', pending: 'Menunggu' }
const TONE: Record<Role, 'ok' | 'low'> = { admin: 'ok', staff: 'ok', pending: 'low' }

export default function Members() {
  const { profile: me } = useAuth()
  const { confirm } = useDialog()
  const [rows, setRows] = useState<Profile[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('id, full_name, email, role').order('created_at', { ascending: false })
    if (error) setMsg({ ok: false, text: `${error.message} (sudah menjalankan 004_security.sql?)` })
    if (data) setRows(data as Profile[])
    setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const setRole = async (p: Profile, role: Role, okText: string) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${p.full_name ?? p.email}: ${okText}` })
    load()
  }
  const ask = async (p: Profile, role: Role, title: string, body: string, okText: string) => {
    if (await confirm(title, body)) setRole(p, role, okText)
  }

  const pending = rows.filter((r) => r.role === 'pending')
  const active = rows.filter((r) => r.role !== 'pending')

  const item = (p: Profile) => {
    const self = p.id === me?.id
    return (
      <Row key={p.id}
        title={<Txt bold>{p.full_name} {self ? <Txt muted small>(Anda)</Txt> : null}</Txt>}
        subtitle={p.email ?? '—'}
        extra={
          <View style={{ gap: 8, marginTop: 6 }}>
            <Pill tone={TONE[p.role]} text={LABEL[p.role]} />
            {!self ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {p.role === 'pending' ? <Button title="Setujui" small onPress={() => setRole(p, 'staff', 'disetujui sebagai Karyawan.')} /> : null}
                {p.role === 'staff' ? <Button title="Jadikan Admin" variant="ghost" small
                  onPress={() => ask(p, 'admin', `Jadikan ${p.full_name} Admin?`, 'Admin bisa melihat HPP dan mengubah semua data.', 'dijadikan Admin.')} /> : null}
                {p.role === 'admin' ? <Button title="Jadikan Karyawan" variant="ghost" small
                  onPress={() => ask(p, 'staff', `Turunkan ${p.full_name} menjadi Karyawan?`, '', 'diturunkan menjadi Karyawan.')} /> : null}
                {p.role !== 'pending' ? <Button title="Nonaktifkan" variant="danger" small
                  onPress={() => ask(p, 'pending', `Nonaktifkan ${p.full_name}?`, 'Akun tidak bisa mengakses aplikasi sampai disetujui lagi.', 'dinonaktifkan.')} /> : null}
              </View>
            ) : null}
          </View>
        }
      />
    )
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <PageTitle title="Karyawan" subtitle="Setujui akun baru dan atur peran. Akun yang belum disetujui tidak bisa membaca data apa pun." />
      {msg ? <Notice ok={msg.ok} text={msg.text} /> : null}

      <Card>
        <CardHead title="Menunggu persetujuan" dot="red" right={<Pill tone="gray" text={String(pending.length)} />} />
        {pending.length === 0 ? <Empty text="Tidak ada akun yang menunggu." /> : <List>{pending.map(item)}</List>}
      </Card>

      <Card>
        <CardHead title="Akun aktif" right={<Pill tone="gray" text={String(active.length)} />} />
        <List>{active.map(item)}</List>
      </Card>
    </Screen>
  )
}
