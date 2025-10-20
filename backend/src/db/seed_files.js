import { initStore, getState, insert, upsert } from '../store/fileStore.js'

async function one(key, where, data = {}) {
  const st = getState()
  const row = st[key].find(r => Object.entries(where).every(([k, v]) => String(r[k]) === String(v)))
  if (!row) await insert(key, { ...where, ...data })
}

async function main() {
  await initStore()
  const tenant_slug = 'demo'

  // classes
  const classesSeed = [
    { code:'8', section:'A', size:35 },
    { code:'8', section:'B', size:34 },
    { code:'9', section:'A', size:36 },
    { code:'9', section:'B', size:35 },
    { code:'10', section:'A', size:38 },
  ]
  for (const c of classesSeed) await one('classes', { tenant_slug, code:c.code, section:c.section }, { tenant_slug, ...c })

  // subjects
  const subjectsSeed = [
    { code:'MATH', name:'Mathematics', is_lab:0 },
    { code:'SCI',  name:'Science',     is_lab:1 },
    { code:'ENG',  name:'English',     is_lab:0 },
    { code:'SOC',  name:'Social Studies', is_lab:0 },
    { code:'LANG', name:'Language',    is_lab:0 },
    { code:'COMP', name:'Computer Science', is_lab:1 },
  ]
  for (const s of subjectsSeed) await one('subjects', { tenant_slug, code:s.code }, { tenant_slug, ...s })

  // teachers
  const teachersSeed = ['Ms. Priya','Mr. Raj','Ms. Anu','Mr. Kumar','Ms. Lakshmi','Mr. Joseph','Ms. Fatima','Mr. Arjun','Ms. Nisha','Mr. Vivek','Ms. Meera','Mr. Sandeep']
  for (const name of teachersSeed) await one('teachers', { tenant_slug, name }, { tenant_slug, name })

  // rooms
  const roomsSeed = [
    { code:'R101', capacity:40, is_lab:0 },
    { code:'R201', capacity:40, is_lab:0 },
    { code:'LAB1', capacity:30, is_lab:1 },
    { code:'R102', capacity:40, is_lab:0 },
    { code:'R202', capacity:40, is_lab:0 },
    { code:'LAB2', capacity:30, is_lab:1 },
  ]
  for (const r of roomsSeed) await one('rooms', { tenant_slug, code:r.code }, { tenant_slug, ...r })

  // teacher_subjects (simple mapping)
  const st = getState()
  const s = code => st.subjects.find(x => x.code === code && x.tenant_slug === tenant_slug)
  const t = name => st.teachers.find(x => x.name === name && x.tenant_slug === tenant_slug)

  const mapTS = [
    [t('Ms. Priya'), s('MATH')], [t('Mr. Kumar'), s('MATH')], [t('Mr. Vivek'), s('MATH')],
    [t('Mr. Raj'), s('SCI')], [t('Ms. Lakshmi'), s('SCI')],
    [t('Ms. Anu'), s('ENG')], [t('Mr. Joseph'), s('ENG')],
    [t('Ms. Fatima'), s('SOC')], [t('Mr. Sandeep'), s('SOC')],
    [t('Mr. Arjun'), s('LANG')], [t('Ms. Meera'), s('LANG')],
    [t('Ms. Nisha'), s('COMP')], [t('Mr. Vivek'), s('COMP')],
  ]
  for (const [teacher, subj] of mapTS) if (teacher && subj)
    await one('teacher_subjects', { tenant_slug, teacher_id: teacher.id, subject_id: subj.id }, { tenant_slug, teacher_id: teacher.id, subject_id: subj.id })

  // class_subjects (all classes take all subjects)
  for (const c of st.classes) {
    if (c.tenant_slug !== tenant_slug) continue
    for (const subj of st.subjects.filter(su => su.tenant_slug === tenant_slug))
      await one('class_subjects', { tenant_slug, class_id: c.id, subject_id: subj.id }, { tenant_slug, class_id: c.id, subject_id: subj.id })
  }

  // availability (5 days x 8 periods, all available)
  const DAYS = 5, PERIODS = 8
  for (const teacher of st.teachers.filter(x => x.tenant_slug === tenant_slug)) {
    for (let d=0; d<DAYS; d++) for (let p=0; p<PERIODS; p++)
      await one('availability_teacher', { tenant_slug, teacher_id: teacher.id, day:d, period:p }, { tenant_slug, teacher_id: teacher.id, day:d, period:p, available:1 })
  }
  for (const room of st.rooms.filter(x => x.tenant_slug === tenant_slug)) {
    for (let d=0; d<DAYS; d++) for (let p=0; p<PERIODS; p++)
      await one('availability_room', { tenant_slug, room_id: room.id, day:d, period:p }, { tenant_slug, room_id: room.id, day:d, period:p, available:1 })
  }

  // penalties default already exists via DEFAULT_DATA
  console.log('✓ File seed complete')
}

main().catch(e => { console.error(e); process.exit(1) })
