import { Pressable, type ColorValue } from 'react-native'
import { Tabs, useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from '@/lib/theme'
import Bell from '@/components/Bell'

type IconName = React.ComponentProps<typeof Ionicons>['name']
const icon = (name: IconName) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={color as string} />

export default function TabsLayout() {
  const t = useTheme()
  const router = useRouter()

  // Halaman khusus Admin dibuka dari tab "Lainnya"; tombol kembali menuju ke sana
  const back = () => (
    <Pressable onPress={() => router.navigate('/more')} hitSlop={8} style={{ paddingHorizontal: 12 }}>
      <Ionicons name="chevron-back" size={26} color={t.text} />
    </Pressable>
  )

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.surface },
        headerTitleStyle: { color: t.text, fontWeight: '700' },
        headerShadowVisible: false,
        headerRight: () => <Bell />,
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Ringkasan', tabBarIcon: icon('stats-chart') }} />
      <Tabs.Screen name="sales" options={{ title: 'Penjualan', tabBarIcon: icon('cash-outline') }} />
      <Tabs.Screen name="entry" options={{ title: 'Entry Stok', tabBarIcon: icon('create-outline') }} />
      <Tabs.Screen name="opname" options={{ title: 'Opname', tabBarIcon: icon('checkmark-done-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'Lainnya', tabBarIcon: icon('menu') }} />

      {/* Halaman Admin: tidak muncul di tab bar */}
      <Tabs.Screen name="import" options={{ href: null, title: 'Impor Kasir', headerLeft: back }} />
      <Tabs.Screen name="menus" options={{ href: null, title: 'Menu & Resep', headerLeft: back }} />
      <Tabs.Screen name="ingredients" options={{ href: null, title: 'Bahan & HPP', headerLeft: back }} />
      <Tabs.Screen name="members" options={{ href: null, title: 'Karyawan', headerLeft: back }} />
    </Tabs>
  )
}
