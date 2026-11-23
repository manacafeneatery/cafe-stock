import { View } from 'react-native'
import { useTheme } from '@/lib/theme'
import { Card, Txt } from '@/components/ui'

export default function Setup() {
  const t = useTheme()
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: t.bg }}>
      <Card>
        <Txt size={20} bold>Supabase belum dikonfigurasi</Txt>
        <Txt muted>
          Buat file .env di folder mobile dengan isi EXPO_PUBLIC_SUPABASE_URL dan EXPO_PUBLIC_SUPABASE_ANON_KEY,
          lalu jalankan ulang aplikasi (npx expo start --clear). Untuk APK, isi variabel yang sama di EAS (lihat README).
        </Txt>
      </Card>
    </View>
  )
}
