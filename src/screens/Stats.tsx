import {
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useLiveRatings } from '../lib/useLiveRatings'
import { AREAS, AREA_LABELS, Area } from '../lib/types'
import { ratingClass, ratingColor } from '../lib/ratings'

export default function Stats() {
  const live = useLiveRatings(90)

  if (live.loading) return <div className="p-6 text-muted">Ładowanie…</div>

  const radarData = AREAS.map((a) => ({
    area: AREA_LABELS[a],
    rating: Math.round(live.current[a] * 10) / 10,
  }))
  const lineData = live.overallSeries.map((p) => ({
    date: p.date.slice(5),
    overall: Math.round(p.overall * 10) / 10,
  }))

  return (
    <div className="p-4 md:p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight">FM Stats ⚽</h1>
        <p className="text-sm text-muted">
          Overall{' '}
          <span className={`font-bold ${ratingClass(live.overall)}`}>{live.overall.toFixed(1)}</span>{' '}
          <span className="text-muted">— powolna forma (EMA 1–20), dodatek do streaka.</span>
        </p>
      </header>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-3">
          <div className="h-64 lg:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="#243040" />
                <PolarAngleAxis dataKey="area" tick={{ fill: '#e6edf5', fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 20]} tick={{ fill: '#7c8ba1', fontSize: 9 }} axisLine={false} />
                <Radar dataKey="rating" stroke="#30c85e" fill="#30c85e" fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="self-start overflow-hidden rounded-2xl border border-border bg-surface">
          {AREAS.map((a, i) => (
            <AttrRow key={a} area={a} rating={live.current[a]} prev={live.weekAgo[a]} first={i === 0} />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-3">
        <div className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">
          Overall — ostatnie 90 dni
        </div>
        <div className="h-40 md:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <XAxis dataKey="date" tick={{ fill: '#7c8ba1', fontSize: 9 }} interval="preserveStartEnd" minTickGap={40} />
              <YAxis domain={[0, 20]} tick={{ fill: '#7c8ba1', fontSize: 9 }} width={28} />
              <Tooltip
                contentStyle={{ background: '#1a2330', border: '1px solid #243040', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#7c8ba1' }}
              />
              <Line type="monotone" dataKey="overall" stroke="#30c85e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function AttrRow({
  area,
  rating,
  prev,
  first,
}: {
  area: Area
  rating: number
  prev: number
  first: boolean
}) {
  const delta = rating - prev
  const up = delta > 0.05
  const down = delta < -0.05
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${first ? '' : 'border-t border-border'}`}>
      <span className="font-medium">{AREA_LABELS[area]}</span>
      <div className="flex items-center gap-3">
        <span className="text-xs">
          {up ? (
            <span className="text-rating-good">↑ {delta.toFixed(1)}</span>
          ) : down ? (
            <span className="text-rating-bad">↓ {Math.abs(delta).toFixed(1)}</span>
          ) : (
            <span className="text-muted">→</span>
          )}
        </span>
        <span className="w-10 text-right text-lg font-extrabold" style={{ color: ratingColor(rating) }}>
          {rating.toFixed(1)}
        </span>
      </div>
    </div>
  )
}
