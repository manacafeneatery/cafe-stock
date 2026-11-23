import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import type { Role } from '../lib/types'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [role, setRole] = useState<Role>('staff')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    if (mode === 'login') {
      const err = await signIn(email.trim(), password, role)
      if (err) setMsg({ ok: false, text: err })
    } else {
      const res = await signUp(name.trim(), email.trim(), password)
      const ok = res.startsWith('Pendaftaran berhasil')
      setMsg({ ok, text: res })
      if (ok) setMode('login')
    }
    setBusy(false)
  }

  return (
    <div className="center-screen">
      <div className="card login">
        <div className="login-head">
          <div className="logo big">☕</div>
          <h1>Cafe Stock</h1>
          <p className="muted">Monitoring stok bahan harian</p>
        </div>

        {mode === 'login' && (
          <div className="segmented" role="tablist">
            <button type="button" className={role === 'staff' ? 'on' : ''} onClick={() => setRole('staff')}>👤 Karyawan</button>
            <button type="button" className={role === 'admin' ? 'on' : ''} onClick={() => setRole('admin')}>🛡️ Admin</button>
          </div>
        )}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>Nama lengkap
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nama Anda" />
            </label>
          )}
          <label>Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="nama@email.com" />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Minimal 6 karakter" />
          </label>
          {msg && <div className={msg.ok ? 'alert ok' : 'alert err'}>{msg.text}</div>}
          <button className="btn" disabled={busy}>
            {busy ? 'Memproses…' : mode === 'login' ? `Masuk sebagai ${role === 'admin' ? 'Admin' : 'Karyawan'}` : 'Daftar'}
          </button>
        </form>

        <p className="muted center small">
          {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); setMsg(null); setMode(mode === 'login' ? 'register' : 'login') }}>
            {mode === 'login' ? 'Daftar' : 'Masuk'}
          </a>
        </p>
        {mode === 'register' && <p className="muted center small">Akun pertama yang terdaftar otomatis menjadi Admin.</p>}
      </div>
    </div>
  )
}
