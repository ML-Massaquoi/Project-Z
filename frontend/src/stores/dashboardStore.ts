import { create } from 'zustand'
import type { DashboardStats, DepartmentOpsData } from '@/types'

interface DashboardState {
  stats: DashboardStats | null
  departments: DepartmentOpsData[]
  setStats: (stats: DashboardStats) => void
  updateStats: (partial: Partial<DashboardStats>) => void
  setDepartments: (depts: DepartmentOpsData[]) => void
  updateDepartment: (dept: DepartmentOpsData) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: null,
  departments: [],
  setStats: (stats) => set({ stats }),
  updateStats: (partial) =>
    set((state) => ({
      stats: state.stats ? { ...state.stats, ...partial } : (partial as DashboardStats),
    })),
  setDepartments: (departments) => set({ departments }),
  updateDepartment: (dept) =>
    set((state) => ({
      departments: state.departments.map((d) => (d.id === dept.id ? dept : d)),
    })),
}))
