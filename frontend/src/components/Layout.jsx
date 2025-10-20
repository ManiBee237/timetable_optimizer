import Topbar from './Topbar'
import Sidebar from './Sidebar'

export default function Layout({ children, weekStart, setWeekStart, tab, setTab }) {
  return (
    <div className="h-full grid grid-rows-[auto,1fr]">
      <Topbar weekStart={weekStart} setWeekStart={setWeekStart} />
      <div className="grid grid-cols-[260px,1fr] h-full">
        <Sidebar tab={tab} setTab={setTab} />
        <main className="p-6 overflow-auto bg-[rgb(var(--muted))]">{children}</main>
      </div>
    </div>
  )
}
