import {
  Children, createContext, useCallback, useContext, useMemo, useRef, useState,
  type ComponentRef, type ReactNode, type Ref,
} from 'react'
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native'
import { useTheme } from '@/lib/theme'

/* ============================ Teks ============================ */
export function Txt({ children, muted, small, bold, size, color, style, numberOfLines, align }: {
  children?: ReactNode; muted?: boolean; small?: boolean; bold?: boolean; size?: number; color?: string
  style?: StyleProp<TextStyle>; numberOfLines?: number; align?: TextStyle['textAlign']
}) {
  const t = useTheme()
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: color ?? (muted ? t.muted : t.text), fontSize: size ?? (small ? 12.5 : 15), fontWeight: bold ? '700' : '400', textAlign: align }, style]}
    >
      {children}
    </Text>
  )
}

/* ============================ Layar ============================ */
export function Screen({ children, onRefresh, refreshing, scrollRef }: {
  children: ReactNode; onRefresh?: () => void; refreshing?: boolean; scrollRef?: Ref<ComponentRef<typeof ScrollView>>
}) {
  const t = useTheme()
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.brand} colors={[t.brand]} /> : undefined}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={24} bold>{title}</Txt>
        {subtitle ? <Txt muted small>{subtitle}</Txt> : null}
      </View>
      {right}
    </View>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme()
  return (
    <View style={[{ backgroundColor: t.surface, borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, borderColor: t.line }, style]}>
      {children}
    </View>
  )
}

export function CardHead({ title, right, dot }: { title: string; right?: ReactNode; dot?: 'red' | 'green' | 'gray' }) {
  const t = useTheme()
  const c = dot === 'red' ? t.brick : dot === 'green' ? t.brand : t.slow
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        {dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} /> : null}
        <Txt size={17} bold>{title}</Txt>
      </View>
      {right}
    </View>
  )
}

export const Empty = ({ text }: { text: string }) => <Txt muted align="center" style={{ paddingVertical: 14 }}>{text}</Txt>

/* ============================ Tombol ============================ */
export function Button({ title, onPress, variant = 'primary', disabled, loading, small, style }: {
  title: string; onPress?: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; loading?: boolean
  small?: boolean; style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()
  const off = disabled || loading
  const bg = variant === 'primary' ? t.brand : 'transparent'
  const fg = variant === 'primary' ? t.brandInk : variant === 'danger' ? t.brick : t.text
  const border = variant === 'primary' ? t.brand : variant === 'danger' ? t.brick : t.line
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [{
        backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: small ? 10 : 12,
        paddingVertical: small ? 7 : 13, paddingHorizontal: small ? 12 : 18, alignItems: 'center', justifyContent: 'center',
        opacity: off ? 0.45 : pressed ? 0.8 : 1, flexDirection: 'row', gap: 8,
      }, style]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  )
}

/* ============================ Input ============================ */
export function Field({ label, hint, style, ...props }: TextInputProps & { label?: string; hint?: string }) {
  const t = useTheme()
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt small bold>{label}</Txt> : null}
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[{
          backgroundColor: t.inputBg, color: t.text, borderColor: t.line, borderWidth: 1, borderRadius: 12,
          paddingHorizontal: 13, paddingVertical: 11, fontSize: 16,
        }, style]}
      />
      {hint ? <Txt muted small>{hint}</Txt> : null}
    </View>
  )
}

export const NumField = (p: TextInputProps & { label?: string; hint?: string }) => <Field keyboardType="decimal-pad" {...p} />

/* ============================ Status & statistik ============================ */
export function Pill({ tone, text }: { tone: 'ok' | 'low' | 'empty' | 'gray'; text: string }) {
  const t = useTheme()
  const m = {
    ok: [t.brandSoft, t.brand], low: [t.amberSoft, t.amber], empty: [t.brickSoft, t.brick], gray: [t.inputBg, t.muted],
  }[tone]
  return (
    <View style={{ backgroundColor: m[0], borderRadius: 99, paddingHorizontal: 9, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: m[1], fontSize: 11.5, fontWeight: '700' }}>{text}</Text>
    </View>
  )
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'good' }) {
  const t = useTheme()
  const top = tone === 'warn' ? t.brick : tone === 'good' ? t.brand : t.black
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: t.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: t.line, borderTopWidth: 4, borderTopColor: top }}>
      <Txt muted small>{label}</Txt>
      <Txt size={22} bold color={tone === 'warn' ? t.brick : tone === 'good' ? t.brand : t.text}>{value}</Txt>
    </View>
  )
}

export const StatGrid = ({ children }: { children: ReactNode }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>
)

export function Bar({ pct, tone }: { pct: number; tone: 'low' | 'fast' | 'slow' }) {
  const t = useTheme()
  const c = tone === 'low' ? t.brick : tone === 'fast' ? t.brand : t.slow
  return (
    <View style={{ height: 7, backgroundColor: t.inputBg, borderRadius: 99, overflow: 'hidden', marginTop: 6 }}>
      <View style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: '100%', backgroundColor: c, borderRadius: 99 }} />
    </View>
  )
}

export function Notice({ ok, text }: { ok: boolean; text: string }) {
  const t = useTheme()
  return (
    <View style={{ backgroundColor: ok ? t.brandSoft : t.brickSoft, borderRadius: 12, padding: 12 }}>
      <Text style={{ color: ok ? t.brand : t.brick, fontSize: 14 }}>{text}</Text>
    </View>
  )
}

/* ============================ Navigasi kecil ============================ */
export function Chips({ options, value, onChange }: {
  options: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void
}) {
  const t = useTheme()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)}
            style={{ backgroundColor: on ? t.black : t.surface, borderColor: on ? t.black : t.line, borderWidth: 1, borderRadius: 99, paddingHorizontal: 15, paddingVertical: 8 }}>
            <Text style={{ color: on ? '#fff' : t.text, fontWeight: '500', fontSize: 13.5 }}>
              {o.label}{o.count !== undefined ? `  ${o.count}` : ''}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[]; value: T; onChange: (id: T) => void
}) {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.inputBg, borderRadius: 14, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center', backgroundColor: on ? t.black : 'transparent' }}>
            <Text style={{ color: on ? '#fff' : t.muted, fontWeight: '600', fontSize: 13.5 }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/* ============================ Daftar ============================ */
export function List({ children }: { children: ReactNode }) {
  const t = useTheme()
  return (
    <View>
      {Children.toArray(children).map((c, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line } : undefined}>{c}</View>
      ))}
    </View>
  )
}

export function Row({ title, subtitle, extra, right, rightSub, rightColor, onPress, dim }: {
  title: ReactNode; subtitle?: string; extra?: ReactNode; right?: string; rightSub?: string; rightColor?: string
  onPress?: () => void; dim?: boolean
}) {
  const Wrap: typeof Pressable = Pressable
  return (
    <Wrap onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, opacity: dim ? 0.55 : 1 }}>
      <View style={{ flex: 1, gap: 2 }}>
        {typeof title === 'string' ? <Txt bold>{title}</Txt> : title}
        {subtitle ? <Txt muted small>{subtitle}</Txt> : null}
        {extra}
      </View>
      {right !== undefined ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Txt bold color={rightColor}>{right}</Txt>
          {rightSub ? <Txt muted small>{rightSub}</Txt> : null}
        </View>
      ) : null}
    </Wrap>
  )
}

/* ============================ Stepper ============================ */
export function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useTheme()
  const btn = (label: string, d: number, off: boolean, accent?: boolean) => (
    <Pressable onPress={() => !off && onChange(Math.max(0, Math.min(999, value + d)))} hitSlop={6}
      style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: accent && value > 0 ? t.brand : t.black, opacity: off ? 0.3 : 1 }}>
      <Text style={{ color: '#fff', fontSize: 22, lineHeight: 26 }}>{label}</Text>
    </Pressable>
  )
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
      {btn('−', -1, value === 0)}
      <Txt size={18} bold>{value}</Txt>
      {btn('+', 1, false, true)}
    </View>
  )
}

/* ============================ Dropdown (bottom sheet) ============================ */
export interface Option { value: string; label: string; group?: string }

export function Select({ label, value, onChange, options, placeholder = 'Pilih…', searchable }: {
  label?: string; value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; searchable?: boolean
}) {
  const t = useTheme()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const current = options.find((o) => o.value === value)
  const shown = useMemo(() => options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())), [options, q])
  const groups = useMemo(() => {
    const m = new Map<string, Option[]>()
    for (const o of shown) { const g = o.group ?? ''; m.set(g, [...(m.get(g) ?? []), o]) }
    return [...m.entries()]
  }, [shown])

  const close = () => { setOpen(false); setQ('') }
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt small bold>{label}</Txt> : null}
      <Pressable onPress={() => setOpen(true)}
        style={{ backgroundColor: t.inputBg, borderColor: t.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: current ? t.text : t.muted, fontSize: 16, flexShrink: 1 }} numberOfLines={1}>{current?.label ?? placeholder}</Text>
        <Text style={{ color: t.muted }}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.5)' }} onPress={close} />
        <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '72%', paddingTop: 14 }}>
          <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 10 }}>
            <Txt bold size={17}>{label ?? 'Pilih'}</Txt>
            {searchable ? <Field value={q} onChangeText={setQ} placeholder="Cari…" /> : null}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
            {groups.map(([g, items]) => (
              <View key={g}>
                {g ? <Txt muted small bold style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>{g.toUpperCase()}</Txt> : null}
                {items.map((o) => (
                  <Pressable key={o.value} onPress={() => { onChange(o.value); close() }}
                    style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: o.value === value ? t.brandSoft : 'transparent' }}>
                    <Text style={{ color: o.value === value ? t.brand : t.text, fontSize: 16, fontWeight: o.value === value ? '700' : '400' }}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            {shown.length === 0 ? <Empty text="Tidak ditemukan." /> : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

/* ============================ Dialog (pengganti confirm/prompt) ============================ */
interface DialogApi {
  confirm: (title: string, message?: string, okText?: string) => Promise<boolean>
  prompt: (title: string, initial?: string, opts?: { numeric?: boolean; placeholder?: string }) => Promise<string | null>
}
const DialogCtx = createContext<DialogApi>(null!)
export const useDialog = () => useContext(DialogCtx)

type DialogState =
  | { kind: 'confirm'; title: string; message?: string; okText: string }
  | { kind: 'prompt'; title: string; numeric: boolean; placeholder?: string }

export function DialogProvider({ children }: { children: ReactNode }) {
  const t = useTheme()
  const [st, setSt] = useState<DialogState | null>(null)
  const [text, setText] = useState('')
  const resolver = useRef<((v: unknown) => void) | null>(null)

  const confirm = useCallback<DialogApi['confirm']>((title, message, okText = 'Ya') =>
    new Promise<boolean>((res) => { resolver.current = res as (v: unknown) => void; setSt({ kind: 'confirm', title, message, okText }) }), [])
  const prompt = useCallback<DialogApi['prompt']>((title, initial = '', opts) =>
    new Promise<string | null>((res) => {
      resolver.current = res as (v: unknown) => void
      setText(initial)
      setSt({ kind: 'prompt', title, numeric: !!opts?.numeric, placeholder: opts?.placeholder })
    }), [])

  const finish = (v: unknown) => { const r = resolver.current; resolver.current = null; setSt(null); r?.(v) }

  return (
    <DialogCtx.Provider value={{ confirm, prompt }}>
      {children}
      <Modal visible={!!st} transparent animationType="fade" onRequestClose={() => finish(st?.kind === 'confirm' ? false : null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', padding: 24 }}>
          {st ? (
            <View style={{ backgroundColor: t.surface, borderRadius: 20, padding: 20, gap: 14 }}>
              <Txt size={18} bold>{st.title}</Txt>
              {st.kind === 'confirm' && st.message ? <Txt muted>{st.message}</Txt> : null}
              {st.kind === 'prompt' ? (
                <Field value={text} onChangeText={setText} autoFocus placeholder={st.placeholder}
                  keyboardType={st.numeric ? 'decimal-pad' : 'default'} onSubmitEditing={() => finish(text)} />
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
                <Button title="Batal" variant="ghost" small onPress={() => finish(st.kind === 'confirm' ? false : null)} />
                <Button title={st.kind === 'confirm' ? st.okText : 'OK'} small onPress={() => finish(st.kind === 'confirm' ? true : text)} />
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </DialogCtx.Provider>
  )
}
