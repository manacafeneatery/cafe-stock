import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile, Role } from './types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string, expected: Role) => Promise<string | null>
  signUp: (name: string, email: string, password: string) => Promise<string>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>(null!)
export const useAuth = () => useContext(Ctx)

async function fetchProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('id, full_name, role').eq('id', id).maybeSingle()
  return (data as Profile) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      setProfile(data.session ? await fetchProfile(data.session.user.id) : null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) setProfile(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn: AuthState['signIn'] = async (email, password, expected) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return 'Email atau password salah.'
    const { data: prof, error: profErr } = await supabase
      .from('profiles').select('id, full_name, role').eq('id', data.user.id).maybeSingle()
    const p = prof as Profile | null
    if (!p) {
      await supabase.auth.signOut()
      return profErr
        ? `Gagal membaca profil: ${profErr.message}`
        : `Profil tidak ditemukan untuk user ${data.user.id}. Hubungi admin.`
    }
    if (p.role === 'pending') {
      await supabase.auth.signOut()
      return 'Akun Anda belum disetujui. Minta Admin menyetujui akun Anda di menu Karyawan, lalu masuk lagi.'
    }
    if (p.role !== expected) {
      await supabase.auth.signOut()
      return expected === 'admin'
        ? 'Akun ini bukan Admin. Silakan masuk lewat tab Karyawan.'
        : 'Akun ini adalah Admin. Silakan masuk lewat tab Admin.'
    }
    setProfile(p)
    return null
  }

  const signUp: AuthState['signUp'] = async (name, email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
    if (error) return error.message
    if (!data.session) return 'Pendaftaran berhasil. Cek email untuk konfirmasi, lalu tunggu persetujuan Admin.'
    await supabase.auth.signOut()
    return 'Pendaftaran berhasil. Akun Anda akan aktif setelah disetujui Admin.'
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return <Ctx.Provider value={{ session, profile, loading, signIn, signUp, signOut }}>{children}</Ctx.Provider>
}
