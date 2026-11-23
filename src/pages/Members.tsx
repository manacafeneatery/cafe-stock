import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Profile, Role } from '../lib/types'

const LABEL: Record<Role, string> = { admin: 'Admin', staff: 'Karyawan', pending: 'Menunggu' }
const PILL: Record<Role, string> = { admin: 'ok', staff: 'ok', pending: 'low' }

export default function Members() {
  const { profile: me } = useAuth()
  const [rows, setRows] = useState<Profile[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('id, full_name, email, role').order('created_at', { ascending: false })
    if (error) setMsg({ ok: false, text: `${error.message} (sudah menjalankan 004_security.sql?)` })
    if (data) setRows(data as Profile[])
  }, [])
  useEffect(() => { load() }, [load])

  const setRole = async (p: Profile, role: Role, okText: string) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${p.full_name ?? p.email}: ${okText}` })
    load()
  }
  const confirmRole = (p: Profile, role: Role, q: string, okText: string) => {
    if (window.confirm(q)) setRole(p, role, okText)
  }

  const pending = rows.filter((r) => r.role === 'pending')
  const active = rows.filter((r) => r.role !== 'pending')

  const Item = ({ p }: { p: Profile }) => {
    const self = p.id === me?.id
    return (
      <li>
        <div className="row-main">
          <strong>{p.full_name} {self && <span className="muted small">(Anda)</span>}</strong>
          <span className="muted small">{p.email ?? '—'}</span>
        </div>
        <div className="row-side nowrap">
          <span className={`pill ${PILL[p.role]}`}>{LABEL[p.role]}</span>
          {!self && (
            <div className="member-actions">
              {p.role === 'pending' && <button className="btn sm-btn" onClick={() => setRole(p, 'staff', 'disetujui sebagai Karyawan.')}>Setujui</button>}
              {p.role === 'staff' && <button className="btn-ghost sm" onClick={() => confirmRole(p, 'admin', `Jadikan ${p.full_name} sebagai Admin? Admin bisa melihat HPP dan mengubah semua data.`, 'dijadikan Admin.')}>Jadikan Admin</button>}
              {p.role === 'admin' && <button className="btn-ghost sm" onClick={() => confirmRole(p, 'staff', `Turunkan ${p.full_name} menjadi Karyawan?`, 'diturunkan menjadi Karyawan.')}>Jadikan Karyawan</button>}
              {p.role !== 'pending' && <button className="btn-ghost sm danger" onClick={() => confirmRole(p, 'pending', `Nonaktifkan akun ${p.full_name}? Ia tidak bisa mengakses aplikasi sampai disetujui lagi.`, 'dinonaktifkan.')}>Nonaktifkan</button>}
              {p.role === 'pending' && <span className="muted small"> </span>}
            </div>
          )}
        </div>
      </li>
    )
  }

  return (
    <>
      <header className="page-head">
        <div><h1>Karyawan</h1><p className="muted">Setujui akun baru dan atur peran. Akun yang belum disetujui tidak bisa membaca data apa pun.</p></div>
      </header>
      {msg && <div className={msg.ok ? 'alert ok' : 'alert err'}>{msg.text}</div>}

      <section className="card">
        <header className="card-head"><h3><span className="dot red" /> Menunggu persetujuan</h3><span className="badge">{pending.length}</span></header>
        {pending.length === 0 ? <p className="empty">Tidak ada akun yang menunggu.</p> : <ul className="list">{pending.map((p) => <Item key={p.id} p={p} />)}</ul>}
      </section>

      <section className="card">
        <header className="card-head"><h3>Akun aktif</h3><span className="badge">{active.length}</span></header>
        <ul className="list">{active.map((p) => <Item key={p.id} p={p} />)}</ul>
      </section>
    </>
  )
}
