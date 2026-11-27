import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import Constants from 'expo-constants'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { Button, Card, Pill, Screen, Txt, useDialog } from '@/components/ui'

export default function More() {
  const t = useTheme()
  const router = useRouter()
  const { profile, isAdmin, signOut } = useAuth()
  const { confirm } = useDialog()

  const all = [
    { path: '/shopping', icon: 'cart-outline', title: 'Daftar Belanja', sub: 'Bahan yang perlu dibeli, bagikan ke WhatsApp', admin: false },
    { path: '/import', icon: 'download-outline', title: 'Impor Kasir', sub: 'Potong stok dari laporan penjualan Ideku', admin: false },
    { path: '/menus', icon: 'restaurant-outline', title: 'Menu & Resep', sub: 'HPP per porsi, margin, resep', admin: true },
    { path: '/ingredients', icon: 'cube-outline', title: 'Bahan & HPP', sub: 'Kategori, stok minimum, harga', admin: true },
    { path: '/members', icon: 'people-outline', title: 'Karyawan', sub: 'Setujui akun & atur peran', admin: true },
  ] as const
  const items = all.filter((i) => isAdmin || !i.admin)

  const logout = async () => { if (await confirm('Keluar dari akun?', undefined, 'Keluar')) signOut() }

  return (
    <Screen>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={22} bold color="#fff">{(profile?.full_name ?? '?').slice(0, 1).toUpperCase()}</Txt>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt size={17} bold>{profile?.full_name}</Txt>
          <Txt muted small>{profile?.email}</Txt>
          <Pill tone={isAdmin ? 'ok' : 'gray'} text={isAdmin ? 'Admin' : 'Karyawan'} />
        </View>
      </Card>

      {items.length > 0 ? (
        <Card style={{ padding: 6, gap: 0 }}>
          {items.map((it, i) => (
            <Pressable key={it.path} onPress={() => router.navigate(it.path)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={it.icon} size={21} color={t.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt bold>{it.title}</Txt>
                <Txt muted small>{it.sub}</Txt>
              </View>
              <Ionicons name="chevron-forward" size={20} color={t.muted} />
            </Pressable>
          ))}
        </Card>
      ) : null}
      {!isAdmin ? <Card><Txt muted>Menu Bahan, Menu & Resep, dan Karyawan hanya tersedia untuk Admin.</Txt></Card> : null}

      <Button title="Keluar" variant="danger" onPress={logout} />
      <Txt muted small align="center">Cafe Stock v{Constants.expoConfig?.version ?? '1.0.0'}</Txt>
    </Screen>
  )
}
