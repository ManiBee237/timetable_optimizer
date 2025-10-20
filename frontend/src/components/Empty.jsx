export default function Empty({ title='Nothing here yet', hint }) {
  return (
    <div className="text-center py-10 text-sm">
      <div className="font-medium">{title}</div>
      {hint && <div className="opacity-70 mt-1">{hint}</div>}
    </div>
  )
}
