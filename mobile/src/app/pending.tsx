import { View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { Button, Card, Txt } from '@/components/ui'

export default function Pending() {
  const t = useTheme()
  const { profile, signOut, reloadProfile } = useAuth()
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: t.bg }}>
      <Card style={{ alignItems: 'center', gap: 14, padding: 24 }}>
        <Txt size={48}>⏳</Txt>
        <Txt size={20} bold align="center">Menunggu persetujuan Admin</Txt>
        <Txt muted align="center">
          Akun {profile?.full_name} sudah terdaftar, tetapi belum diaktifkan. Hubungi Admin kafe, lalu muat ulang.
        </Txt>
        <View style={{ alignSelf: 'stretch', gap: 10 }}>
          <Button title="Periksa lagi" onPress={reloadProfile} />
          <Button title="Keluar" variant="ghost" onPress={signOut} />
        </View>
      </Card>
    </View>
  )
}
