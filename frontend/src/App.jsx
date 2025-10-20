import { useState } from 'react'
import Layout from './components/Layout'
import { ToastHost } from './components/Toast'
import DemandPlan from './pages/DemandPlan'
import Optimize from './pages/Optimize'
import Teachers from './pages/Teachers'
import Constraints from './pages/Constraints'
import Admin from './pages/Admin'
import TeacherMode from './pages/TeacherMode' // keep the teacher-first page available

export default function App(){
  const [tab, setTab] = useState('opt')
  const [weekStart, setWeekStart] = useState('2025-10-20')

  return (
    <Layout tab={tab} setTab={setTab} weekStart={weekStart} setWeekStart={setWeekStart}>
      {tab==='admin'    && <Admin />}
      {tab==='demand'   && <DemandPlan   weekStart={weekStart} />}
      {tab==='opt'      && <Optimize     weekStart={weekStart} />}
      {tab==='teachers' && <Teachers     weekStart={weekStart} />}
      {tab==='locks'    && <Constraints  weekStart={weekStart} />}
      

      {/* Bonus: a dedicated teacher dashboard page (optional) */}
      {tab==='teacher-mode' && <TeacherMode weekStart={weekStart} />}

      <ToastHost/>
    </Layout>
  )
}
