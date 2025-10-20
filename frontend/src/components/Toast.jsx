import { useEffect, useState } from 'react'

export function ToastHost(){
  const [toasts, setToasts] = useState([])
  useEffect(()=>{
    window.__tw_toast = (msg, type='info')=>{
      const id = crypto.randomUUID()
      setToasts(t=>[...t, {id,msg,type}])
      setTimeout(()=> setToasts(t=>t.filter(x=>x.id!==id)), 2800)
    }
  },[])
  const tone = (t)=> t==='error' ? 'bg-candy-pink' : t==='success' ? 'bg-candy-mint' : 'bg-candy-sky'
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map(t=>(
        <div key={t.id} className={`px-3 py-2 rounded-bubble text-sm shadow-bubble text-gray-900 border border-[rgb(var(--border))] ${tone(t.type)}`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
export function toast(msg, type){ window.__tw_toast?.(msg, type) }
