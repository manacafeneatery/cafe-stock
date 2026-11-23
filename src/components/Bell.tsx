import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Ingredient } from '../lib/types'
import { num } from '../lib/analytics'

const POLL_MS = 60_000
const supported = typeof Notification !== 'undefined'

export default function Bell() {
  const [low, setLow] = useState<Ingredient[]>([])
  const [open, setOpen] = useState(false)
  const [perm, setPerm] = useState<NotificationPermission>(supported ? Notification.permission : 'denied')
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    let stop = false
    const check = async () => {
      const { data } = await supabase.from('ingredients').select('*').eq('is_active', true)
      if (stop || !data) return
      const items = (data as Ingredient[])
        .filter((i) => Number(i.current_stock) <= Number(i.min_stock))
        .sort((a, b) => Number(a.current_stock) - Number(b.current_stock))
      setLow(items)

      // Notifikasi browser hanya untuk bahan yang baru masuk daftar menipis
      const ids = new Set(items.map((i) => i.id))
      const fresh = items.filter((i) => !seen.current || !seen.current.has(i.id))
      seen.current = ids
      if (fresh.length > 0 && supported && Notification.permission === 'granted') {
        new Notification('Stok menipis ☕', {
          body: fresh.slice(0, 5).map((i) => `${i.name}: ${num(i.current_stock)} ${i.unit}`).join('\n'),
        })
      }
    }
    check()
    const t = setInterval(check, POLL_MS)
    return () => { stop = true; clearInterval(t) }
  }, [])

  const enable = async () => setPerm(await Notification.requestPermission())

  return (
    <div className="bell-wrap">
      <button className="bell" onClick={() => setOpen(!open)} aria-label={`Notifikasi stok menipis: ${low.length}`}>
        🔔{low.length > 0 && <span className="bell-count">{low.length}</span>}
      </button>
      {open && (
        <div className="bell-panel card">
          <header className="card-head"><h3>Stok menipis</h3><button className="btn-ghost sm" onClick={() => setOpen(false)}>Tutup</button></header>
          {low.length === 0 ? <p className="empty">Semua stok aman 🎉</p> : (
            <ul className="list">
              {low.map((i) => (
                <li key={i.id}>
                  <div className="row-main"><strong>{i.name}</strong><span className="muted small">Min {num(i.min_stock)} {i.unit}</span></div>
                  <div className="row-side">
                    <strong className={Number(i.current_stock) <= 0 ? 'neg' : ''}>{num(i.current_stock)}</strong>
                    <span className="muted small">{i.unit}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {supported && perm === 'default' && <button className="btn" onClick={enable}>Aktifkan notifikasi browser</button>}
          {supported && perm === 'granted' && <p className="muted small">Notifikasi browser aktif (saat aplikasi terbuka).</p>}
          {supported && perm === 'denied' && <p className="muted small">Notifikasi diblokir di browser. Izinkan lewat pengaturan situs.</p>}
        </div>
      )}
    </div>
  )
}
