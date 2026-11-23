import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react'
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import RNWebView from 'react-native-webview'

// Tipe bawaan react-native-webview 14 bentrok dengan TypeScript (semua props menjadi `never`),
// jadi komponennya dibungkus dengan tipe longgar. Perilaku runtime tidak berubah.
interface WebViewHandle { goBack: () => void; reload: () => void }
const WebView = RNWebView as unknown as ComponentType<Record<string, unknown> & { ref?: Ref<WebViewHandle> }>
interface NavState { canGoBack: boolean }

// Alamat situs Cafe Stock (GitHub Pages). Ubah di sini jika alamatnya berpindah.
const APP_URL = 'https://manacafeneatery.github.io/cafe-stock/'
const APP_ORIGIN = 'https://manacafeneatery.github.io/'
const BRAND = '#1f8a5b'

// Mencegah layar ter-zoom (cubit) agar terasa seperti aplikasi
const NO_ZOOM = `(function(){var m=document.querySelector('meta[name=viewport]');
if(m){m.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');}})(); true;`

function Shell() {
  const insets = useSafeAreaInsets()
  const dark = useColorScheme() === 'dark'
  const bg = dark ? '#0b0f0d' : '#f2f4f1'

  const web = useRef<WebViewHandle>(null)
  const canGoBack = useRef(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Tombol Kembali Android: mundur di dalam aplikasi dulu, baru keluar
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) {
        web.current?.goBack()
        return true
      }
      return false
    })
    return () => sub.remove()
  }, [])

  const onNav = (n: NavState) => { canGoBack.current = n.canGoBack }

  // Hanya situs Cafe Stock yang dibuka di dalam aplikasi; tautan lain dibuka di browser
  const allow = (req: { url: string }) => {
    if (req.url.startsWith(APP_ORIGIN) || req.url.startsWith('about:')) return true
    Linking.openURL(req.url).catch(() => {})
    return false
  }

  const retry = () => { setFailed(false); setLoading(true); setAttempt((a) => a + 1) }

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />

      {failed ? (
        <View style={styles.center}>
          <Text style={styles.emoji}>☕</Text>
          <Text style={[styles.title, { color: dark ? '#e9f0ec' : '#141a17' }]}>Tidak ada koneksi</Text>
          <Text style={[styles.sub, { color: dark ? '#8b9d95' : '#66746d' }]}>
            Cafe Stock membutuhkan internet. Periksa koneksi Anda lalu coba lagi.
          </Text>
          <Pressable style={styles.button} onPress={retry}>
            <Text style={styles.buttonText}>Coba lagi</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          key={attempt}
          ref={web}
          source={{ uri: APP_URL }}
          style={{ backgroundColor: bg }}
          originWhitelist={['https://*', 'about:*']}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          setSupportMultipleWindows={false}
          pullToRefreshEnabled
          overScrollMode="never"
          textZoom={100}
          allowsBackForwardNavigationGestures
          injectedJavaScript={NO_ZOOM}
          onNavigationStateChange={onNav}
          onShouldStartLoadWithRequest={allow}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setFailed(true); setLoading(false) }}
          onHttpError={(e: { nativeEvent: { statusCode: number } }) => { if (e.nativeEvent.statusCode >= 500) { setFailed(true); setLoading(false) } }}
        />
      )}

      {loading && !failed && (
        <View style={[styles.loader, { backgroundColor: bg }]} pointerEvents="none">
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      )}
    </View>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emoji: { fontSize: 56 },
  title: { fontSize: 20, fontWeight: '700' },
  sub: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  button: { marginTop: 14, backgroundColor: BRAND, paddingVertical: 13, paddingHorizontal: 28, borderRadius: 12 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
})
