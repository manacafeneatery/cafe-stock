import { ActivityIndicator, View } from 'react-native'
import { useTheme } from '@/lib/theme'

export default function Loading() {
  const t = useTheme()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
      <ActivityIndicator size="large" color={t.brand} />
    </View>
  )
}
