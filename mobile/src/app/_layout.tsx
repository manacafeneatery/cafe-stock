import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '@/lib/auth'
import { isConfigured } from '@/lib/supabase'
import { DialogProvider } from '@/components/ui'

// Rute dilindungi sesuai status login: hanya satu "dunia" yang aktif pada satu waktu
function Gate() {
  const { session, profile, loading } = useAuth()
  const hasProfile = !!session && !!profile
  const pending = hasProfile && profile.role === 'pending'
  const authed = hasProfile && !pending
  const ready = isConfigured && !loading

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Protected guard={!isConfigured}><Stack.Screen name="setup" /></Stack.Protected>
      <Stack.Protected guard={isConfigured && loading}><Stack.Screen name="loading" /></Stack.Protected>
      <Stack.Protected guard={ready && !hasProfile}><Stack.Screen name="login" /></Stack.Protected>
      <Stack.Protected guard={ready && pending}><Stack.Screen name="pending" /></Stack.Protected>
      <Stack.Protected guard={ready && authed}><Stack.Screen name="(tabs)" /></Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <DialogProvider>
        <StatusBar style="auto" />
        <Gate />
      </DialogProvider>
    </AuthProvider>
  )
}
