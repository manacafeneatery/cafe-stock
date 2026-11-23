import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import type { Role } from '@/lib/types'
import { Button, Card, Field, Notice, Segmented, Txt } from '@/components/ui'

export default function Login() {
  const t = useTheme()
  const { signIn, signUp } = useAuth()
  const [role, setRole] = useState<Role>('staff')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true); setMsg(null)
    if (mode === 'login') {
      const err = await signIn(email.trim(), password, role)
      if (err) setMsg({ ok: false, text: err })
    } else {
      const res = await signUp(name.trim(), email.trim(), password)
      setMsg(res)
      if (res.ok) setMode('login')
    }
    setBusy(false)
  }

  const canSubmit = !!email.trim() && password.length >= 6 && (mode === 'login' || !!name.trim())

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
        <Card style={{ padding: 24, gap: 16, borderTopWidth: 5, borderTopColor: t.brand }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={{ width: 68, height: 68, borderRadius: 22, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
              <Txt size={32}>☕</Txt>
            </View>
            <Txt size={24} bold>Cafe Stock</Txt>
            <Txt muted>Monitoring stok bahan harian</Txt>
          </View>

          {mode === 'login' ? (
            <Segmented options={[{ id: 'staff' as Role, label: '👤 Karyawan' }, { id: 'admin' as Role, label: '🛡️ Admin' }]} value={role} onChange={setRole} />
          ) : null}

          {mode === 'register' ? <Field label="Nama lengkap" value={name} onChangeText={setName} placeholder="Nama Anda" autoCapitalize="words" /> : null}
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="nama@email.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="Minimal 6 karakter" secureTextEntry autoCapitalize="none"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onSubmitEditing={() => canSubmit && submit()} />

          {msg ? <Notice ok={msg.ok} text={msg.text} /> : null}

          <Button title={mode === 'login' ? `Masuk sebagai ${role === 'admin' ? 'Admin' : 'Karyawan'}` : 'Daftar'} onPress={submit} loading={busy} disabled={!canSubmit} />

          <Txt muted small align="center">{mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}</Txt>
          <Button title={mode === 'login' ? 'Daftar akun baru' : 'Kembali ke Masuk'} variant="ghost" small
            onPress={() => { setMsg(null); setMode(mode === 'login' ? 'register' : 'login') }} />
          {mode === 'register' ? <Txt muted small align="center">Akun baru perlu disetujui Admin sebelum bisa dipakai.</Txt> : null}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
