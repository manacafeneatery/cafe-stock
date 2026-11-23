export type Role = 'admin' | 'staff' | 'pending'
export type MovementType = 'in' | 'out' | 'waste' | 'adjust_in' | 'adjust_out'
export const isIncoming = (t: MovementType) => t === 'in' || t === 'adjust_in'

export interface Menu {
  id: string
  name: string
  price: number
  is_active: boolean
}

export interface RecipeItem {
  id: string
  menu_id: string
  ingredient_id: string
  quantity: number
}

export interface Profile {
  id: string
  full_name: string | null
  email?: string | null
  role: Role
}

export interface Ingredient {
  id: string
  name: string
  unit: string
  category: string | null       // kolom lama (teks), tidak dipakai lagi
  category_id: string | null
  min_stock: number
  current_stock: number
  avg_cost: number
  last_cost: number
  is_active: boolean
}

export interface Category {
  id: string
  name: string
}

export interface Movement {
  id: string
  ingredient_id: string
  type: MovementType
  quantity: number
  unit_cost: number
  note: string | null
  created_by: string | null
  created_at: string
}
