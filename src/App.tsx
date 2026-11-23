import { useState } from 'react'
import { useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import StockEntry from './pages/StockEntry'
import Opname from './pages/Opname'
import Menus from './pages/Menus'
import Ingredients from './pages/Ingredients'
import Members from './pages/Members'
import Bell from './components/Bell'

type Tab = 'dashboard' | 'entry' | 'opname' | 'menus' | 'ingredients' | 'members'

export default function App() {
  const { session, profile, loading, signOut } = useAuth()
  const [tab, setTab] = useState<Tab>('dashboard')

  if (!isConfigured) {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h2>Supabase belum dikonfigurasi</h2>
          <p className="muted">
            Salin <code>.env.example</code> menjadi <code>.env</code> lalu isi <code>VITE_SUPABASE_URL</code> dan{' '}
            <code>VITE_SUPABASE_ANON_KEY</code>, kemudian jalankan ulang <code>npm run dev</code>.
          </p>
        </div>
      </div>
    )
  }

  if (loading) return <div className="center-screen"><div className="spinner" /></div>
  if (!session || !profile) return <Login />

  if (profile.role === 'pending') {
    return (
      <div className="center-screen">
        <div className="card narrow center">
          <div className="logo big">⏳</div>
          <h2>Menunggu persetujuan Admin</h2>
          <p className="muted">Akun <strong>{profile.full_name}</strong> sudah terdaftar, tetapi belum diaktifkan. Hubungi Admin kafe, lalu masuk kembali.</p>
          <button className="btn" onClick={signOut}>Keluar</button>
        </div>
      </div>
    )
  }

  const isAdmin = profile.role === 'admin'
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Ringkasan', icon: '📊' },
    { id: 'entry', label: 'Entry Stok', icon: '📝' },
    { id: 'opname', label: 'Opname', icon: '✅' },
    ...(isAdmin ? [
      { id: 'menus' as Tab, label: 'Menu', icon: '🍹' },
      { id: 'ingredients' as Tab, label: 'Bahan', icon: '🧾' },
      { id: 'members' as Tab, label: 'Karyawan', icon: '👥' },
    ] : []),
  ]

  return (
    <div className="shell">
      <aside className="nav">
        <div className="brand"><span className="logo">☕</span> Cafe Stock</div>
        <nav>
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <span>{t.icon}</span><em>{t.label}</em>
            </button>
          ))}
        </nav>
        <div className="user">
          <div>
            <strong>{profile.full_name}</strong>
            <span className={`badge ${isAdmin ? 'badge-brand' : ''}`}>{isAdmin ? 'Admin' : 'Karyawan'}</span>
          </div>
          <button className="btn-ghost" onClick={signOut}>Keluar</button>
        </div>
      </aside>
      <main className="content">
        <div className="topbar"><Bell /></div>
        {tab === 'dashboard' && <Dashboard isAdmin={isAdmin} />}
        {tab === 'entry' && <StockEntry isAdmin={isAdmin} />}
        {tab === 'opname' && <Opname isAdmin={isAdmin} />}
        {tab === 'menus' && isAdmin && <Menus />}
        {tab === 'ingredients' && isAdmin && <Ingredients />}
        {tab === 'members' && isAdmin && <Members />}
      </main>
    </div>
  )
}
