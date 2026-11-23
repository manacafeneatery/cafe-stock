import { useColorScheme } from 'react-native'

// Palet: hijau (brand), hitam (struktur), merah bata (peringatan) — sama dengan versi web
export const light = {
  bg: '#f2f4f1', surface: '#ffffff', text: '#141a17', muted: '#66746d', line: '#e2e7e3', inputBg: '#f2f4f1',
  brand: '#1f8a5b', brandSoft: '#e1f2e9', brandInk: '#ffffff',
  brick: '#b5472f', brickSoft: '#f9e8e3',
  amber: '#b9791b', amberSoft: '#fbf0dc',
  slow: '#7b8680', black: '#0c100e',
}

export const dark: typeof light = {
  bg: '#0b0f0d', surface: '#141b18', text: '#e9f0ec', muted: '#8b9d95', line: '#232d29', inputBg: '#0b0f0d',
  brand: '#3cb584', brandSoft: '#163026', brandInk: '#06120d',
  brick: '#e0674c', brickSoft: '#3a1d17',
  amber: '#e0a24a', amberSoft: '#36290f',
  slow: '#8b9d95', black: '#070a09',
}

export type Theme = typeof light
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light)
