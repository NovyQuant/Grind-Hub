import { useMemo, useState } from 'react'
import {
  useTasks,
  useAddTask,
  useUpdateTask,
  useDeleteTask,
  useEvents,
  useAddEvent,
  useDeleteEvent,
} from '../lib/queries'
import { CalendarEvent, PRIORITIES, PRIORITY_ORDER, Task, TaskPriority } from '../lib/types'
import { addDays, parseISO, toISODate, todayISO } from '../lib/date'
import { buzz, BUZZ_TAP, BUZZ_DONE } from '../lib/haptics'

type View = 'taski' | 'kalendarz'

const VIEWS: { key: View; label: string; icon: string }[] = [
  { key: 'taski', label: 'Taski', icon: '✅' },
  { key: 'kalendarz', label: 'Kalendarz', icon: '📅' },
]

export default function Planner() {
  const [view, setView] = useState<View>('taski')

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Plan 📅</h1>
      <p className="mb-4 text-sm text-muted">Taski i plany w kalendarzu.</p>

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
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [showDone, setShowDone] = useState(false)

  const today = todayISO()
  const list = tasks.data ?? []

  const groups = useMemo(() => {
    const open = list.filter((t) => !t.done)
    // najpierw termin, w ramach dnia priorytet
    const cmp = (a: Task, b: Task) =>
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    return {
      overdue: open.filter((t) => t.due_date && t.due_date < today).sort(cmp),
      today: open.filter((t) => t.due_date === today).sort(cmp),
      upcoming: open.filter((t) => t.due_date && t.due_date > today).sort(cmp),
      someday: open.filter((t) => !t.due_date).sort(cmp),
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
    add.mutate({ title, due_date: dueDate(), priority }, { onSuccess: () => setTitle('') })
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
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                priority === p.value
                  ? 'border-rating-good/60 bg-rating-good/10 text-text'
                  : 'border-border text-muted'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${p.dot}`} />
              {p.label}
            </button>
          ))}
        </div>
      </form>

      {groups.overdue.length > 0 && (
        <TaskGroup label="⏰ Zaległe" tone="bad" items={groups.overdue} />
      )}
      <TaskGroup label="🔥 Dziś" items={groups.today} empty="Nic na dziś. Dodaj coś powyżej." />
      {groups.upcoming.length > 0 && <TaskGroup label="📆 Nadchodzące" items={groups.upcoming} />}
      {groups.someday.length > 0 && <TaskGroup label="🗂 Bez terminu" items={groups.someday} />}

      {groups.done.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowDone((s) => !s)} className="text-xs font-medium text-muted">
            {showDone ? '▾' : '▸'} Zrobione ({groups.done.length})
          </button>
          {showDone && (
            <div className="mt-2">
              {groups.done.map((t) => (
                <TaskRow key={t.id} task={t} />
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
  tone,
}: {
  label: string
  items: Task[]
  empty?: string
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
        items.map((t) => <TaskRow key={t.id} task={t} />)
      )}
    </div>
  )
}

function TaskRow({ task }: { task: Task }) {
  const update = useUpdateTask()
  const del = useDeleteTask()
  const [editDate, setEditDate] = useState(false)
  const today = todayISO()

  const prio = PRIORITIES.find((p) => p.value === task.priority) ?? PRIORITIES[1]
  const nextPrio: TaskPriority =
    task.priority === 'high' ? 'normal' : task.priority === 'normal' ? 'low' : 'high'

  function setDue(due_date: string | null) {
    buzz(BUZZ_TAP)
    update.mutate({ id: task.id, due_date })
    setEditDate(false)
  }

  const dateChips: { label: string; value: string | null }[] = [
    { label: 'Dziś', value: today },
    { label: 'Jutro', value: addDays(today, 1) },
    { label: '+7 dni', value: addDays(task.due_date ?? today, 7) },
    { label: 'Bez terminu', value: null },
  ]

  return (
    <div className="mb-1.5 rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center gap-3">
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
        <span className={`min-w-0 flex-1 truncate text-sm ${task.done ? 'text-muted line-through' : ''}`}>
          {task.title}
        </span>
        {task.done ? (
          task.due_date && <span className="text-[11px] text-muted">{formatDay(task.due_date)}</span>
        ) : (
          <button
            onClick={() => setEditDate((s) => !s)}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
              editDate ? 'border-rating-good/60 text-rating-good' : 'border-border text-muted'
            }`}
            title="Zmień termin"
          >
            {task.due_date ? formatDay(task.due_date) : '📅'}
          </button>
        )}
        {!task.done && (
          <button
            onClick={() => update.mutate({ id: task.id, priority: nextPrio })}
            className="flex h-6 w-6 shrink-0 items-center justify-center"
            title={`Priorytet: ${prio.label} (kliknij, by zmienić)`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${prio.dot}`} />
          </button>
        )}
        <button
          onClick={() => del.mutate(task.id)}
          className="text-xs text-muted hover:text-rating-bad"
          title="Usuń"
        >
          ✕
        </button>
      </div>
      {editDate && !task.done && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          {dateChips.map((c) => (
            <button
              key={c.label}
              onClick={() => setDue(c.value)}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:border-rating-good/60 hover:text-rating-good"
            >
              {c.label}
            </button>
          ))}
          <input
            type="date"
            value={task.due_date ?? ''}
            onChange={(e) => setDue(e.target.value || null)}
            className="rounded-lg border border-border bg-surface2 px-2 py-1 text-xs outline-none [color-scheme:dark]"
          />
        </div>
      )}
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

/** "19:00:00" (postgres time) → "19:00" */
function fmtTime(t: string | null): string | null {
  return t ? t.slice(0, 5) : null
}

function CalendarView() {
  const events = useEvents()
  const add = useAddEvent()
  const today = todayISO()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [selected, setSelected] = useState(today)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')

  const list = events.data ?? []
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of list) {
      map.set(ev.event_date, [...(map.get(ev.event_date) ?? []), ev])
    }
    return map
  }, [list])

  if (events.isLoading) return <div className="p-6 text-muted">Ładowanie…</div>

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

  const dayEvents = byDate.get(selected) ?? []

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    buzz(BUZZ_TAP)
    add.mutate(
      { title, event_date: selected, event_time: time || null },
      {
        onSuccess: () => {
          setTitle('')
          setTime('')
        },
      }
    )
  }

  return (
    <div>
      <div className="rounded-2xl border border-border bg-surface p-2 md:p-3">
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
        <div className="grid grid-cols-7 gap-0.5 md:gap-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-center text-[10px] font-semibold uppercase text-muted">
              {w}
            </div>
          ))}
          {cells.map((iso, i) => {
            if (iso === null) return <div key={`x${i}`} />
            const evs = byDate.get(iso) ?? []
            const isSel = iso === selected
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                className={`flex min-h-[3.4rem] flex-col items-stretch gap-0.5 overflow-hidden rounded-lg p-0.5 text-left md:min-h-[4.5rem] md:p-1 ${
                  isSel
                    ? 'bg-rating-good/15 ring-1 ring-rating-good'
                    : evs.length > 0
                      ? 'bg-surface2 hover:bg-surface2/70'
                      : 'hover:bg-surface2/60'
                }`}
              >
                <span
                  className={`px-0.5 text-[11px] font-semibold tabular-nums leading-none md:text-xs ${
                    iso === today ? 'text-rating-good' : 'text-muted'
                  }`}
                >
                  {parseISO(iso).getDate()}
                </span>
                {evs.slice(0, 2).map((ev) => (
                  <span
                    key={ev.id}
                    className="truncate rounded bg-rating-good/15 px-0.5 text-[9px] leading-tight text-text md:text-[10px]"
                  >
                    {fmtTime(ev.event_time) && (
                      <span className="font-semibold text-rating-good">{fmtTime(ev.event_time)} </span>
                    )}
                    {ev.title}
                  </span>
                ))}
                {evs.length > 2 && (
                  <span className="px-0.5 text-[9px] leading-none text-muted">+{evs.length - 2}</span>
                )}
              </button>
            )
          })}
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
            placeholder="np. Siłownia, dentysta, spotkanie…"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 outline-none focus:border-rating-good"
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-24 rounded-xl border border-border bg-surface px-2 py-2.5 text-sm outline-none [color-scheme:dark]"
          />
          <button
            type="submit"
            className="rounded-xl bg-rating-good px-4 py-2.5 text-sm font-semibold text-bg"
          >
            Dodaj
          </button>
        </form>
        {dayEvents.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-4 text-center text-sm text-muted">
            Brak wydarzeń tego dnia.
          </p>
        ) : (
          dayEvents.map((ev) => <EventRow key={ev.id} ev={ev} />)
        )}
      </div>
    </div>
  )
}

function EventRow({ ev }: { ev: CalendarEvent }) {
  const del = useDeleteEvent()
  return (
    <div className="mb-1.5 flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-rating-good">
        {fmtTime(ev.event_time) ?? '—'}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{ev.title}</span>
      <button
        onClick={() => del.mutate(ev.id)}
        className="text-xs text-muted hover:text-rating-bad"
        title="Usuń"
      >
        ✕
      </button>
    </div>
  )
}
