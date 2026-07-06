import { useMemo, useState } from 'react'
import {
  useTasks,
  useAddTask,
  useUpdateTask,
  useDeleteTask,
  useShopping,
  useAddShoppingItem,
  useUpdateShoppingItem,
  useDeleteShoppingItem,
  useClearBoughtShopping,
} from '../lib/queries'
import { ShoppingItem, ShoppingTerm, Task } from '../lib/types'
import { addDays, parseISO, toISODate, todayISO } from '../lib/date'
import { buzz, BUZZ_TAP, BUZZ_DONE } from '../lib/haptics'

type View = 'taski' | 'kalendarz' | 'zakupy'

const VIEWS: { key: View; label: string; icon: string }[] = [
  { key: 'taski', label: 'Taski', icon: '✅' },
  { key: 'kalendarz', label: 'Kalendarz', icon: '📅' },
  { key: 'zakupy', label: 'Zakupy', icon: '🛒' },
]

export default function Planner() {
  const [view, setView] = useState<View>('taski')

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Plan 📅</h1>
      <p className="mb-4 text-sm text-muted">Taski, plany w kalendarzu i lista zakupów.</p>

      <div className="mb-4 flex rounded-xl border border-border bg-surface p-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              view === v.key ? 'bg-rating-good/15 text-rating-good' : 'text-muted'
            }`}
          >
            {v.icon} {v.label}
          </button>
        ))}
      </div>

      {view === 'taski' && <TasksView />}
      {view === 'kalendarz' && <CalendarView />}
      {view === 'zakupy' && <ShoppingView />}
    </div>
  )
}

// ====================================================================
// Taski — szybkie planowanie
// ====================================================================

type DueChoice = 'today' | 'tomorrow' | 'none' | 'custom'

function TasksView() {
  const tasks = useTasks()
  const add = useAddTask()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState<DueChoice>('today')
  const [customDate, setCustomDate] = useState(todayISO())
  const [showDone, setShowDone] = useState(false)

  const today = todayISO()
  const list = tasks.data ?? []

  const groups = useMemo(() => {
    const open = list.filter((t) => !t.done)
    const byDate = (a: Task, b: Task) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    return {
      overdue: open.filter((t) => t.due_date && t.due_date < today).sort(byDate),
      today: open.filter((t) => t.due_date === today),
      upcoming: open.filter((t) => t.due_date && t.due_date > today).sort(byDate),
      someday: open.filter((t) => !t.due_date),
      done: list.filter((t) => t.done),
    }
  }, [list, today])

  if (tasks.isLoading) return <div className="p-6 text-muted">Ładowanie…</div>

  function dueDate(): string | null {
    if (due === 'today') return today
    if (due === 'tomorrow') return addDays(today, 1)
    if (due === 'custom') return customDate
    return null
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    buzz(BUZZ_TAP)
    add.mutate({ title, due_date: dueDate() }, { onSuccess: () => setTitle('') })
  }

  const chips: { key: DueChoice; label: string }[] = [
    { key: 'today', label: 'Dziś' },
    { key: 'tomorrow', label: 'Jutro' },
    { key: 'custom', label: '📅 Data' },
    { key: 'none', label: 'Bez terminu' },
  ]

  return (
    <div>
      <form onSubmit={submit} className="mb-4 rounded-2xl border border-border bg-surface p-3">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Co masz do zrobienia?"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface2 px-3 py-2.5 outline-none focus:border-rating-good"
          />
          <button
            type="submit"
            className="rounded-xl bg-rating-good px-4 py-2.5 text-sm font-semibold text-bg"
          >
            Dodaj
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setDue(c.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                due === c.key
                  ? 'border-rating-good/60 bg-rating-good/10 text-rating-good'
                  : 'border-border text-muted'
              }`}
            >
              {c.label}
            </button>
          ))}
          {due === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="rounded-lg border border-border bg-surface2 px-2 py-1 text-xs outline-none [color-scheme:dark]"
            />
          )}
        </div>
      </form>

      {groups.overdue.length > 0 && (
        <TaskGroup label="⏰ Zaległe" tone="bad" items={groups.overdue} showDate />
      )}
      <TaskGroup label="🔥 Dziś" items={groups.today} empty="Nic na dziś. Dodaj coś powyżej." />
      {groups.upcoming.length > 0 && <TaskGroup label="📆 Nadchodzące" items={groups.upcoming} showDate />}
      {groups.someday.length > 0 && <TaskGroup label="🗂 Bez terminu" items={groups.someday} />}

      {groups.done.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowDone((s) => !s)} className="text-xs font-medium text-muted">
            {showDone ? '▾' : '▸'} Zrobione ({groups.done.length})
          </button>
          {showDone && (
            <div className="mt-2">
              {groups.done.map((t) => (
                <TaskRow key={t.id} task={t} showDate />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TaskGroup({
  label,
  items,
  empty,
  showDate,
  tone,
}: {
  label: string
  items: Task[]
  empty?: string
  showDate?: boolean
  tone?: 'bad'
}) {
  if (items.length === 0 && !empty) return null
  return (
    <div className="mb-4">
      <div
        className={`mb-1.5 text-xs font-semibold uppercase tracking-wider ${
          tone === 'bad' ? 'text-rating-bad' : 'text-muted'
        }`}
      >
        {label}
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-center text-sm text-muted">
          {empty}
        </p>
      ) : (
        items.map((t) => <TaskRow key={t.id} task={t} showDate={showDate} />)
      )}
    </div>
  )
}

function TaskRow({ task, showDate }: { task: Task; showDate?: boolean }) {
  const update = useUpdateTask()
  const del = useDeleteTask()

  return (
    <div className="mb-1.5 flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
      <button
        onClick={() => {
          buzz(task.done ? BUZZ_TAP : BUZZ_DONE)
          update.mutate({ id: task.id, done: !task.done })
        }}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
          task.done ? 'border-rating-good bg-rating-good text-bg' : 'border-border'
        }`}
        aria-label={task.done ? 'Odznacz' : 'Zrobione'}
      >
        {task.done && '✓'}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${task.done ? 'text-muted line-through' : ''}`}>
          {task.title}
        </div>
        {showDate && task.due_date && (
          <div className="text-[11px] text-muted">{formatDay(task.due_date)}</div>
        )}
      </div>
      <button
        onClick={() => del.mutate(task.id)}
        className="text-xs text-muted hover:text-rating-bad"
        title="Usuń"
      >
        ✕
      </button>
    </div>
  )
}

// ====================================================================
// Kalendarz — plany na dni
// ====================================================================

const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
const MONTHS = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]

function formatDay(iso: string): string {
  const d = parseISO(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase().slice(0, 3)}`
}

function CalendarView() {
  const tasks = useTasks()
  const add = useAddTask()
  const today = todayISO()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [selected, setSelected] = useState(today)
  const [title, setTitle] = useState('')

  const list = tasks.data ?? []
  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of list) {
      if (!t.due_date) continue
      map.set(t.due_date, [...(map.get(t.due_date) ?? []), t])
    }
    return map
  }, [list])

  if (tasks.isLoading) return <div className="p-6 text-muted">Ładowanie…</div>

  // siatka miesiąca, tydzień od poniedziałku
  const first = new Date(month.y, month.m, 1)
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(month.y, month.m, i + 1))),
  ]

  function shiftMonth(delta: number) {
    setMonth(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const dayTasks = byDate.get(selected) ?? []

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    buzz(BUZZ_TAP)
    add.mutate({ title, due_date: selected }, { onSuccess: () => setTitle('') })
  }

  return (
    <div>
      <div className="rounded-2xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <button onClick={() => shiftMonth(-1)} className="rounded-lg px-3 py-1 text-muted">
            ‹
          </button>
          <div className="text-sm font-bold">
            {MONTHS[month.m]} {month.y}
          </div>
          <button onClick={() => shiftMonth(1)} className="rounded-lg px-3 py-1 text-muted">
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-[10px] font-semibold uppercase text-muted">
              {w}
            </div>
          ))}
          {cells.map((iso, i) =>
            iso === null ? (
              <div key={`x${i}`} />
            ) : (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm tabular-nums ${
                  iso === selected
                    ? 'bg-rating-good text-bg font-bold'
                    : iso === today
                      ? 'border border-rating-good/60 text-rating-good'
                      : 'text-text hover:bg-surface2'
                }`}
              >
                {parseISO(iso).getDate()}
                {(byDate.get(iso)?.length ?? 0) > 0 && (
                  <span
                    className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${
                      iso === selected
                        ? 'bg-bg'
                        : byDate.get(iso)!.every((t) => t.done)
                          ? 'bg-muted'
                          : 'bg-rating-mid'
                    }`}
                  />
                )}
              </button>
            )
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          {selected === today ? '🔥 Dziś' : formatDay(selected)}
        </div>
        <form onSubmit={submit} className="mb-2 flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Plan na ${formatDay(selected)}…`}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 outline-none focus:border-rating-good"
          />
          <button
            type="submit"
            className="rounded-xl bg-rating-good px-4 py-2.5 text-sm font-semibold text-bg"
          >
            Dodaj
          </button>
        </form>
        {dayTasks.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-4 text-center text-sm text-muted">
            Brak planów na ten dzień.
          </p>
        ) : (
          dayTasks.map((t) => <TaskRow key={t.id} task={t} />)
        )}
      </div>
    </div>
  )
}

// ====================================================================
// Zakupy — short term / long term
// ====================================================================

function ShoppingView() {
  const shopping = useShopping()
  if (shopping.isLoading) return <div className="p-6 text-muted">Ładowanie…</div>

  const items = shopping.data ?? []
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ShoppingList
        term="short"
        title="🛒 Na teraz"
        hint="Codzienne zakupy — spożywka, drogeria…"
        items={items.filter((i) => i.term === 'short')}
      />
      <ShoppingList
        term="long"
        title="🎯 Long term"
        hint="Większe rzeczy, na które zbierasz lub czekasz."
        items={items.filter((i) => i.term === 'long')}
      />
    </div>
  )
}

function ShoppingList({
  term,
  title,
  hint,
  items,
}: {
  term: ShoppingTerm
  title: string
  hint: string
  items: ShoppingItem[]
}) {
  const add = useAddShoppingItem()
  const clear = useClearBoughtShopping()
  const [name, setName] = useState('')

  const open = items.filter((i) => !i.done)
  const bought = items.filter((i) => i.done)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    buzz(BUZZ_TAP)
    add.mutate({ name, term }, { onSuccess: () => setName('') })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="mb-0.5 font-semibold">{title}</div>
      <div className="mb-3 text-[11px] text-muted">{hint}</div>

      <form onSubmit={submit} className="mb-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dodaj do listy…"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-rating-good"
        />
        <button
          type="submit"
          className="rounded-xl bg-rating-good px-3.5 py-2 text-sm font-semibold text-bg"
        >
          +
        </button>
      </form>

      {items.length === 0 && (
        <p className="py-3 text-center text-sm text-muted">Pusta lista.</p>
      )}
      {open.map((i) => (
        <ShoppingRow key={i.id} item={i} />
      ))}
      {bought.length > 0 && (
        <>
          <div className="mb-1 mt-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Kupione ({bought.length})
            </span>
            <button
              onClick={() => clear.mutate(term)}
              className="text-[11px] text-muted hover:text-rating-bad"
            >
              Wyczyść
            </button>
          </div>
          {bought.map((i) => (
            <ShoppingRow key={i.id} item={i} />
          ))}
        </>
      )}
    </div>
  )
}

function ShoppingRow({ item }: { item: ShoppingItem }) {
  const update = useUpdateShoppingItem()
  const del = useDeleteShoppingItem()

  return (
    <div className="mb-1.5 flex items-center gap-3 rounded-xl border border-border bg-surface2 px-3 py-2">
      <button
        onClick={() => {
          buzz(item.done ? BUZZ_TAP : BUZZ_DONE)
          update.mutate({ id: item.id, done: !item.done })
        }}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
          item.done ? 'border-rating-good bg-rating-good text-bg' : 'border-border'
        }`}
        aria-label={item.done ? 'Odznacz' : 'Kupione'}
      >
        {item.done && '✓'}
      </button>
      <span className={`min-w-0 flex-1 truncate text-sm ${item.done ? 'text-muted line-through' : ''}`}>
        {item.name}
      </span>
      <button
        onClick={() => update.mutate({ id: item.id, term: item.term === 'short' ? 'long' : 'short' })}
        className="text-xs text-muted"
        title={item.term === 'short' ? 'Przenieś do long term' : 'Przenieś do „na teraz"'}
      >
        ⇄
      </button>
      <button
        onClick={() => del.mutate(item.id)}
        className="text-xs text-muted hover:text-rating-bad"
        title="Usuń"
      >
        ✕
      </button>
    </div>
  )
}
