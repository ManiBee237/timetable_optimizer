import { Blocks, School, Users, Lock, Wrench, TableProperties, LayoutPanelTop } from 'lucide-react'

const NAV = [
  { key:'demand',   label:'Demand',          icon:TableProperties },
  { key:'opt',      label:'Classes',         icon:School },
  { key:'teachers', label:'Teachers',        icon:Users },
  { key:'locks',    label:'Constraints',     icon:Lock },
  { key:'admin',    label:'Admin',           icon:Wrench },
  // optional extra, a teacher-first dashboard:
  { key:'teacher-mode', label:'Teacher Dashboard', icon:LayoutPanelTop },
]

export default function Sidebar({ tab, setTab }) {
  return (
    <aside className="h-full border-r border-[rgb(var(--border))] bg-[rgb(var(--card))]">
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-60">
          <Blocks size={14}/> Navigate
        </div>
      </div>
      <nav className="px-2">
        {NAV.map(n => {
          const active = tab === n.key
          const Icon = n.icon
          return (
            <button key={n.key} onClick={()=>setTab(n.key)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 text-sm
                ${active ? 'bg-gray-200 dark:bg-gray-800 font-medium' : 'hover:bg-gray-100 dark:hover:bg-gray-900'}`}>
              <Icon size={18}/>{n.label}
            </button>
          )
        })}
      </nav>
      <div className="px-4 pt-6 text-xs opacity-60">Backend :4000 • ML :5000</div>
    </aside>
  )
}
