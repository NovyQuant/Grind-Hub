import { createContext, useCallback, useContext, useState, ReactNode } from 'react'

interface ToastItem {
  id: number
  text: string
}

const Ctx = createContext<(text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setItems((xs) => [...xs, { id, text }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3500)
  }, [])

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto w-full max-w-sm rounded-xl border border-rating-good/60 bg-surface2 px-4 py-3 text-sm font-semibold text-rating-good shadow-lg"
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  return useContext(Ctx)
}
