import { Sun, Moon, Calendar } from 'lucide-react'

export default function Topbar({ weekStart, setWeekStart }) {
  function toggleTheme(){
    const html = document.documentElement
    const isDark = html.classList.toggle('dark')
    localStorage.setItem('tw_theme', isDark ? 'dark' : 'light')
  }
  return (
    <header className="sticky top-0 z-30 border-b border-[rgb(var(--border))] bg-[rgb(var(--card))]/80 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 h-20 flex items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-bubble bg-candy-pink flex items-center justify-center shadow-bubble text-2xl">🎒</div>
          <div>
            <div className="text-2xl font-display font-semibold tracking-tight">TimeWeave</div>
            <div className="text-xs opacity-70 -mt-1">Timetables made fun!</div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <label className="hidden sm:flex items-center gap-2 text-sm bg-white/80 dark:bg-gray-900/70 border border-[rgb(var(--border))] rounded-bubble px-3 py-2 shadow-bubble">
            <Calendar size={16} />
            <input type="date" value={weekStart} onChange={e=>setWeekStart(e.target.value)} className="bg-transparent outline-none"/>
          </label>
          <button onClick={toggleTheme}
            className="rounded-bubble px-3 py-2 text-sm shadow-bubble border border-[rgb(var(--border))] bg-white dark:bg-gray-900">
            <span className="hidden dark:inline-flex items-center gap-2"><Sun size={16}/> Light</span>
            <span className="inline-flex dark:hidden items-center gap-2"><Moon size={16}/> Dark</span>
          </button>
        </div>
      </div>
    </header>
  )
}
