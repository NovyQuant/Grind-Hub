import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import {
  Abstinence,
  AttributeSnapshot,
  CalendarEvent,
  Habit,
  Log,
  RecordRow,
  ShoppingItem,
  ShoppingTerm,
  Task,
  TaskPriority,
} from './types'
import { todayISO } from './date'

// ---------- Queries --------------------------------------------------

export function useHabits() {
  return useQuery({
    queryKey: ['habits'],
    queryFn: async (): Promise<Habit[]> => {
      const { data, error } = await supabase
        .from('habits')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as Habit[]
    },
  })
}

export function useLogs() {
  return useQuery({
    queryKey: ['logs'],
    queryFn: async (): Promise<Log[]> => {
      const { data, error } = await supabase
        .from('logs')
        .select('*')
        .order('log_date', { ascending: true })
      if (error) throw error
      return (data ?? []) as Log[]
    },
  })
}

export function useSnapshots() {
  return useQuery({
    queryKey: ['snapshots'],
    queryFn: async (): Promise<AttributeSnapshot[]> => {
      const { data, error } = await supabase
        .from('attribute_snapshots')
        .select('*')
        .order('snap_date', { ascending: true })
      if (error) throw error
      return (data ?? []) as AttributeSnapshot[]
    },
  })
}

export function useRecords() {
  return useQuery({
    queryKey: ['records'],
    queryFn: async (): Promise<RecordRow[]> => {
      const { data, error } = await supabase.from('records').select('*')
      if (error) throw error
      return (data ?? []) as RecordRow[]
    },
  })
}

// ---------- Mutacje: logi (optimistic) -------------------------------

interface UpsertLogInput {
  habit_id: string
  log_date: string
  value: number
  tag?: string | null
  note?: string | null
}

export function useUpsertLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpsertLogInput) => {
      const { data, error } = await supabase
        .from('logs')
        .upsert(
          {
            habit_id: input.habit_id,
            log_date: input.log_date,
            value: input.value,
            tag: input.tag ?? null,
            note: input.note ?? null,
          },
          { onConflict: 'habit_id,log_date' }
        )
        .select()
        .single()
      if (error) throw error
      return data as Log
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['logs'] })
      const prev = qc.getQueryData<Log[]>(['logs']) ?? []
      const idx = prev.findIndex(
        (l) => l.habit_id === input.habit_id && l.log_date === input.log_date
      )
      const optimistic: Log = {
        id: idx >= 0 ? prev[idx].id : `tmp-${Date.now()}`,
        habit_id: input.habit_id,
        log_date: input.log_date,
        value: input.value,
        tag: input.tag ?? null,
        note: input.note ?? null,
      }
      const next = idx >= 0 ? prev.map((l, i) => (i === idx ? optimistic : l)) : [...prev, optimistic]
      qc.setQueryData<Log[]>(['logs'], next)
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['logs'], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['logs'] })
    },
  })
}

export function useDeleteLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { habit_id: string; log_date: string }) => {
      const { error } = await supabase
        .from('logs')
        .delete()
        .eq('habit_id', input.habit_id)
        .eq('log_date', input.log_date)
      if (error) throw error
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['logs'] })
      const prev = qc.getQueryData<Log[]>(['logs']) ?? []
      qc.setQueryData<Log[]>(
        ['logs'],
        prev.filter((l) => !(l.habit_id === input.habit_id && l.log_date === input.log_date))
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['logs'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['logs'] }),
  })
}

// ---------- Mutacje: nawyki (CRUD) -----------------------------------

export function useSaveHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (h: Partial<Habit> & { id?: string }) => {
      if (h.id) {
        const { error } = await supabase.from('habits').update(h).eq('id', h.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('habits').insert(h)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  })
}

export function useDeleteHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('habits').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] })
      qc.invalidateQueries({ queryKey: ['logs'] })
    },
  })
}

// ---------- Zapis rekordów -------------------------------------------

export async function saveRecords(rows: RecordRow[]) {
  if (rows.length === 0) return
  const { error } = await supabase.from('records').upsert(rows, { onConflict: 'key' })
  if (error) throw error
}

// ---------- Nałogi (liczniki czystych dni) ---------------------------

export function useAbstinences() {
  return useQuery({
    queryKey: ['abstinences'],
    queryFn: async (): Promise<Abstinence[]> => {
      const { data, error } = await supabase
        .from('abstinences')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as Abstinence[]
    },
  })
}

export function useAddAbstinence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('abstinences')
        .insert({ name: name.trim(), started_on: todayISO(), best_days: 0 })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['abstinences'] }),
  })
}

/** Wpadka: zapisz najlepszą serię, zresetuj licznik na dziś. */
export function useRelapseAbstinence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: Abstinence & { currentDays: number }) => {
      const best = Math.max(a.best_days, a.currentDays)
      const { error } = await supabase
        .from('abstinences')
        .update({ started_on: todayISO(), best_days: best })
        .eq('id', a.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['abstinences'] }),
  })
}

/** Ręczna korekta daty startu (np. „czysty już od…"). */
export function useSetAbstinenceStart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; started_on: string }) => {
      const { error } = await supabase
        .from('abstinences')
        .update({ started_on: input.started_on })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['abstinences'] }),
  })
}

export function useDeleteAbstinence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('abstinences').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['abstinences'] }),
  })
}

// ---------- Plan: taski -----------------------------------------------

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Task[]
    },
  })
}

export function useAddTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string; due_date: string | null; priority: TaskPriority }) => {
      const { error } = await supabase
        .from('tasks')
        .insert({ title: input.title.trim(), due_date: input.due_date, priority: input.priority })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<Pick<Task, 'title' | 'due_date' | 'done' | 'priority'>>) => {
      const { id, ...patch } = input
      const { error } = await supabase.from('tasks').update(patch).eq('id', id)
      if (error) throw error
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['tasks'] })
      const prev = qc.getQueryData<Task[]>(['tasks']) ?? []
      qc.setQueryData<Task[]>(
        ['tasks'],
        prev.map((t) => (t.id === input.id ? { ...t, ...input } : t))
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['tasks'] })
      const prev = qc.getQueryData<Task[]>(['tasks']) ?? []
      qc.setQueryData<Task[]>(['tasks'], prev.filter((t) => t.id !== id))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

// ---------- Kalendarz: wydarzenia --------------------------------------

export function useEvents() {
  return useQuery({
    queryKey: ['events'],
    queryFn: async (): Promise<CalendarEvent[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true, nullsFirst: true })
      if (error) throw error
      return (data ?? []) as CalendarEvent[]
    },
  })
}

export function useAddEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string; event_date: string; event_time: string | null }) => {
      const { error } = await supabase.from('events').insert({
        title: input.title.trim(),
        event_date: input.event_date,
        event_time: input.event_time,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['events'] })
      const prev = qc.getQueryData<CalendarEvent[]>(['events']) ?? []
      qc.setQueryData<CalendarEvent[]>(['events'], prev.filter((e) => e.id !== id))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['events'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })
}

// ---------- Zakupy -----------------------------------------------------

export function useShopping() {
  return useQuery({
    queryKey: ['shopping'],
    queryFn: async (): Promise<ShoppingItem[]> => {
      const { data, error } = await supabase
        .from('shopping_items')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ShoppingItem[]
    },
  })
}

export function useAddShoppingItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; term: ShoppingTerm }) => {
      const { error } = await supabase
        .from('shopping_items')
        .insert({ name: input.name.trim(), term: input.term })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  })
}

export function useUpdateShoppingItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<Pick<ShoppingItem, 'done' | 'term' | 'name'>>) => {
      const { id, ...patch } = input
      const { error } = await supabase.from('shopping_items').update(patch).eq('id', id)
      if (error) throw error
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['shopping'] })
      const prev = qc.getQueryData<ShoppingItem[]>(['shopping']) ?? []
      qc.setQueryData<ShoppingItem[]>(
        ['shopping'],
        prev.map((s) => (s.id === input.id ? { ...s, ...input } : s))
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['shopping'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  })
}

export function useDeleteShoppingItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('shopping_items').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['shopping'] })
      const prev = qc.getQueryData<ShoppingItem[]>(['shopping']) ?? []
      qc.setQueryData<ShoppingItem[]>(['shopping'], prev.filter((s) => s.id !== id))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['shopping'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  })
}

/** Usuń wszystkie kupione pozycje z danej listy. */
export function useClearBoughtShopping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (term: ShoppingTerm) => {
      const { error } = await supabase
        .from('shopping_items')
        .delete()
        .eq('term', term)
        .eq('done', true)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  })
}
