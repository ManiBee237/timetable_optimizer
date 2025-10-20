export default function Card({ title, subtitle, actions, tone='sky', children }) {
  const stripe = {
    pink:'from-candy-pink to-candy-peach',
    sky:'from-candy-sky to-candy-blue',
    mint:'from-candy-mint to-candy-lemon',
    grape:'from-candy-grape to-candy-sky',
    peach:'from-candy-peach to-candy-lemon'
  }[tone] || 'from-candy-sky to-candy-blue'

  return (
    <section className="bg-[rgb(var(--card))] rounded-bubble border border-[rgb(var(--border))] shadow-bubble overflow-hidden">
      {(title || actions || subtitle) && (
        <div className="relative px-4 pt-4">
          <div className={`absolute left-0 top-0 h-2 w-full bg-gradient-to-r ${stripe}`}></div>
          <div className="py-2 flex items-center justify-between">
            <div>
              {title && <div className="font-display text-lg">{title}</div>}
              {subtitle && <div className="text-xs opacity-70 -mt-0.5">{subtitle}</div>}
            </div>
            {actions && <div className="flex gap-2">{actions}</div>}
          </div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}
