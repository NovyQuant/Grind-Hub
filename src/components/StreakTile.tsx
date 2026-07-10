import { AreaStreak, DotState } from '../lib/progress'
import { Area, AREA_ICONS, AREA_LABELS } from '../lib/types'

// Segmenty pon–ndz: jeden wspólny język wizualny dla streaków dziennych
// i tygodniowych (dzienne: dzień zaliczony; tygodniowe: dzień z sesją).
const DOT_CLASS: Record<DotState, string> = {
  good: 'bg-rating-good',
  mid: 'bg-rating-mid',
  bad: 'bg-rating-bad/70',
  none: 'bg-surface2',
  future: 'bg-surface2/40',
}

const DAY_LETTERS = ['P', 'W', 'Ś', 'C', 'P', 'S', 'N']

/** Kafelek streaka obszaru — identyczny format dla dziennych i tygodniowych. */
export default function StreakTile({
  area,
  s,
  bonusXP = 0,
}: {
  area: Area
  s: AreaStreak
  bonusXP?: number // XP za nabicie celu tygodnia (tylko unit=week)
}) {
  const week = s.unit === 'week'
  const status = week
    ? s.periodDone
      ? `✓ cel nabity${bonusXP > 0 ? ` +${bonusXP} XP` : ''}`
      : `${s.weekAcc}/${s.weekTarget}${bonusXP > 0 ? ` → +${bonusXP} XP` : ' w tym tyg'}`
    : s.periodDone
      ? '✓ dziś zaliczone'
      : 'dziś jeszcze nie'
  return (
    <div
      className={`rounded-2xl border p-3 ${
        s.periodDone ? 'border-rating-good/60 bg-rating-good/10' : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-base">{AREA_ICONS[area]}</span>
        <span className="font-semibold">{AREA_LABELS[area]}</span>
        <span
          className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
            week ? 'bg-[#a855f7]/20 text-[#c084fc]' : 'bg-surface2 text-muted'
          }`}
        >
          {week ? 'tydzień' : 'dzień'}
        </span>
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums">
        🔥 {s.current}
        <span className="ml-1 text-xs font-medium text-muted">{week ? 'tyg' : 'dni'}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        {s.week.map((d, i) => (
          <span key={d.date} className="min-w-0 flex-1" title={`${DAY_LETTERS[i]} ${d.date}`}>
            <span className={`block h-1.5 rounded-full ${DOT_CLASS[d.state]}`} />
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between text-[11px]">
        <span
          className={
            s.periodDone ? 'text-rating-good' : week && s.weekAcc > 0 ? 'text-[#c084fc]' : 'text-muted'
          }
        >
          {status}
        </span>
        <span className="text-muted">rekord {s.best}</span>
      </div>
    </div>
  )
}
