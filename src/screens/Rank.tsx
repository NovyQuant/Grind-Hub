import { useMemo } from 'react'
import { useAbstinences, useHabits, useLogs } from '../lib/queries'
import { computeRank, RANK_TIERS } from '../lib/rank'
import { AREAS, AREA_ICONS, AREA_LABELS } from '../lib/types'

export default function Rank() {
  const habits = useHabits()
  const logs = useLogs()
  const abstinences = useAbstinences()

  const r = useMemo(
    () => computeRank(habits.data ?? [], logs.data ?? [], abstinences.data ?? []),
    [habits.data, logs.data, abstinences.data]
  )

  if (habits.isLoading || logs.isLoading)
    return <div className="p-6 text-muted">Ładowanie…</div>

  const pct = r.divCost === Infinity ? 100 : Math.min(100, (r.lpInDiv / r.divCost) * 100)

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Ranga 🏆</h1>

      {/* Hero rangi */}
      <div
        className="mb-4 rounded-3xl border bg-gradient-to-b from-surface2 to-surface p-6 text-center"
        style={{ borderColor: `${r.tier.color}66` }}
      >
        <div className="text-6xl leading-none drop-shadow">{r.tier.emblem}</div>
        <div
          className="mt-2 text-3xl font-black uppercase tracking-wide"
          style={{ color: r.tier.color }}
        >
          {r.rankLabel}
        </div>
        <div className="mt-1 text-sm text-muted">
          {r.totalXP.toLocaleString('pl-PL')} XP łącznie
        </div>

        <div className="mx-auto mt-4 max-w-sm">
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>
              {r.lpInDiv} / {r.divCost === Infinity ? '∞' : r.divCost} XP
            </span>
            {r.nextLabel && <span>→ {r.nextLabel}</span>}
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: r.tier.color }}
            />
          </div>
          {r.nextLabel ? (
            <div className="mt-2 text-sm font-semibold">
              Brakuje <span style={{ color: r.tier.color }}>{r.toNext} XP</span> do awansu na{' '}
              {r.nextLabel}
            </div>
          ) : (
            <div className="mt-2 text-sm font-semibold">Szczyt drabinki. Utrzymaj się tu. ⚡</div>
          )}
        </div>

        <div className="mt-4 flex justify-center gap-6 text-sm">
          <div>
            <div className={`font-bold ${r.todayXP < 0 ? 'text-rating-bad' : 'text-rating-good'}`}>
              {r.todayXP >= 0 ? '+' : ''}{r.todayXP} XP
            </div>
            <div className="text-[11px] text-muted">dziś</div>
          </div>
          <div>
            <div className={`font-bold ${r.weekXP < 0 ? 'text-rating-bad' : ''}`}>
              {r.weekXP >= 0 ? '+' : ''}{r.weekXP} XP
            </div>
            <div className="text-[11px] text-muted">w tym tygodniu</div>
          </div>
        </div>
      </div>

      {/* Dzisiejsze XP per obszar (wg wagi) */}
      <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">Dziś — skąd punkty</h2>
      <div className="mb-5 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-2">
          {AREAS.map((area) => {
            const { xp, max, mult } = r.perAreaToday[area]
            const w = max > 0 ? Math.min(100, (Math.abs(xp) / max) * 100) : 0
            return (
              <div key={area} className="flex items-center gap-2">
                <span className="w-6 text-center">{AREA_ICONS[area]}</span>
                <span className="w-20 text-xs font-medium">{AREA_LABELS[area]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                  <div
                    className={`h-full ${xp < 0 ? 'bg-rating-bad' : 'bg-rating-good'}`}
                    style={{ width: `${w}%` }}
                  />
                </div>
                {mult > 1 && (
                  <span className="rounded-full bg-[#a855f7]/15 px-1.5 py-0.5 text-[9px] font-black text-[#c084fc]">
                    ×{mult.toFixed(2).replace(/0$/, '')}
                  </span>
                )}
                <span
                  className={`w-16 text-right text-[11px] tabular-nums ${
                    xp < 0 ? 'text-rating-bad' : xp > 0 ? 'text-rating-good' : 'text-muted'
                  }`}
                >
                  {xp >= 0 ? '+' : ''}{xp}/{max}
                </span>
              </div>
            )
          })}
          {r.abstinenceToday > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-6 text-center">🚭</span>
              <span className="w-20 text-xs font-medium">Nałogi</span>
              <div className="flex-1" />
              <span className="w-16 text-right text-[11px] tabular-nums text-rating-good">
                +{r.abstinenceToday}
              </span>
            </div>
          )}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Super = +XP, okej = połowa +XP, słabo = −XP (wg wagi obszaru). Sen: 7–8h = pełne XP,
          6:30–7 i 8–8:30 = połowa, poza = −XP. Wydatki (samoocena): dobrze = +XP, okej = połowa,
          źle = −XP, bardzo źle = −2×XP. Trening i projekt liczą się z okna tygodnia.
          Seria dni na plusie w obszarze daje mnożnik +5%/dzień (maks ×2) — tylko do plusów.
          Nałogi: +2 XP za każdy czysty dzień, rośnie z serią; wpadka kasuje XP serii.
        </p>
      </div>

      {/* Drabinka rang */}
      <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">Drabinka</h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {RANK_TIERS.map((tier, i) => {
          const passed = i < r.tierIndex
          const current = i === r.tierIndex
          const cost = tier.divCost === Infinity ? '∞' : tier.divisions * tier.divCost
          return (
            <div
              key={tier.label}
              className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-border' : ''} ${
                current ? 'bg-surface2' : ''
              } ${passed ? 'opacity-60' : ''}`}
            >
              <span className="text-xl">{tier.emblem}</span>
              <span
                className={`flex-1 text-sm ${current ? 'font-black' : 'font-medium'}`}
                style={{ color: current || passed ? tier.color : undefined }}
              >
                {tier.label}
                {current && r.division ? ` — dywizja ${['', 'I', 'II', 'III', 'IV'][r.division]}` : ''}
              </span>
              {passed && <span className="text-xs text-rating-good">✓</span>}
              {current && <span className="text-xs font-bold" style={{ color: tier.color }}>TU JESTEŚ</span>}
              <span className="w-14 text-right text-[11px] tabular-nums text-muted">{cost} XP</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
