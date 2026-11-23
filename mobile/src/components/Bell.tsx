import { useCallback, useEffect, useState } from 'react'
import { AppState, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '@/lib/supabase'
import { ING_COLS } from '@/lib/data'
import { num } from '@/lib/analytics'
import { useTheme } from '@/lib/theme'
import type { Ingredient } from '@/lib/types'
import { Empty, List, Row, Txt } from './ui'

const POLL_MS = 60_000

// Lonceng di header: menampilkan jumlah & daftar bahan yang stoknya <= stok minimum
export default function Bell() {
  const t = useTheme()
  const [low, setLow] = useState<Ingredient[]>([])
  const [open, setOpen] = useState(false)

  const check = useCallback(async () => {
    const { data } = await supabase.from('ingredients').select(ING_COLS).eq('is_active', true)
    if (!data) return
    setLow(
      (data as unknown as Ingredient[])
        .filter((i) => Number(i.current_stock) <= Number(i.min_stock))
        .sort((a, b) => Number(a.current_stock) - Number(b.current_stock)),
    )
  }, [])

  useEffect(() => {
    check()
    const id = setInterval(check, POLL_MS)
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check() })
    return () => { clearInterval(id); sub.remove() }
  }, [check])

  return (
    <>
      <Pressable onPress={() => { setOpen(true); check() }} hitSlop={8} style={{ marginRight: 14 }} accessibilityLabel={`Stok menipis: ${low.length}`}>
        <Ionicons name="notifications-outline" size={25} color={t.text} />
        {low.length > 0 ? (
          <View style={{ position: 'absolute', top: -5, right: -7, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: t.brick, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{low.length}</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.5)' }} onPress={() => setOpen(false)} />
        <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '70%', paddingTop: 16 }}>
          <View style={{ paddingHorizontal: 18, paddingBottom: 6 }}>
            <Txt size={18} bold>Stok menipis</Txt>
            <Txt muted small>Bahan dengan stok sama dengan atau di bawah stok minimum</Txt>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
            {low.length === 0 ? <Empty text="Semua stok aman 🎉" /> : (
              <List>
                {low.map((i) => (
                  <Row key={i.id} title={i.name} subtitle={`Min ${num(i.min_stock)} ${i.unit}`}
                    right={num(i.current_stock)} rightSub={i.unit} rightColor={Number(i.current_stock) <= 0 ? t.brick : undefined} />
                ))}
              </List>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  )
}
