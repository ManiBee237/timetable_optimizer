import mongoose from 'mongoose'
import 'dotenv/config'

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/timeweave'

export async function connectMongo() {
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri, { autoIndex: true })
  console.log('✓ Mongo connected')
}

/* ---------- Schemas & Models ---------- */
const opt = { timestamps: false, versionKey: false }

const Tenant = new mongoose.Schema({
  slug: { type: String, index: true, unique: true },
  name: String,
}, opt)

const Class = new mongoose.Schema({
  tenant_slug: { type: String, index: true },
  code: String, section: String, size: Number
}, opt)

const Subject = new mongoose.Schema({
  tenant_slug: { type: String, index: true },
  code: String, name: String, is_lab: { type: Number, default: 0 }
}, opt)

const Teacher = new mongoose.Schema({
  tenant_slug: { type: String, index: true },
  name: String,
  max_periods_per_day: { type: Number, default: 5 },
  max_periods_per_week: { type: Number, default: 28 },
}, opt)

const Room = new mongoose.Schema({
  tenant_slug: { type: String, index: true },
  code: String, capacity: Number, is_lab: { type: Number, default: 0 }
}, opt)

const TeacherSubject = new mongoose.Schema({
  tenant_slug: { type: String, index: true },
  teacher_id: mongoose.Schema.Types.ObjectId,
  subject_id: mongoose.Schema.Types.ObjectId,
}, opt)

const ClassSubject = new mongoose.Schema({
  tenant_slug: { type: String, index: true },
  class_id: mongoose.Schema.Types.ObjectId,
  subject_id: mongoose.Schema.Types.ObjectId,
}, opt)

const AvTeacher = new mongoose.Schema({
  tenant_slug: { type: String, index: true },
  teacher_id: mongoose.Schema.Types.ObjectId,
  day: Number, period: Number, available: Number,
}, opt).index({ tenant_slug:1, teacher_id:1, day:1, period:1 }, { unique: true })

const AvRoom = new mongoose.Schema({
  tenant_slug: { type: String, index: true },
  room_id: mongoose.Schema.Types.ObjectId,
  day: Number, period: Number, available: Number,
}, opt).index({ tenant_slug:1, room_id:1, day:1, period:1 }, { unique: true })

const Demand = new mongoose.Schema({
  tenant_slug: { type: String, index: true },
  week_start: String,
  class_id: mongoose.Schema.Types.ObjectId,
  subject_id: mongoose.Schema.Types.ObjectId,
  periods_required: Number,
  source: { type: String, default: 'ml' }
}, opt).index({ tenant_slug:1, week_start:1, class_id:1, subject_id:1 }, { unique:true })

const Lock = new mongoose.Schema({
  tenant_slug: { type: String, index: true },
  week_start: String,
  class_id: mongoose.Schema.Types.ObjectId,
  subject_id: mongoose.Schema.Types.ObjectId,
  teacher_id: mongoose.Schema.Types.ObjectId,
  room_id: mongoose.Schema.Types.ObjectId,
  day: Number, period: Number
}, opt)

const Penalties = new mongoose.Schema({
  tenant_slug: { type: String, index: true, unique: true },
  teacher_gap: { type: Number, default: 3 },
  uneven_subject: { type: Number, default: 2 },
  room_mismatch: { type: Number, default: 4 },
  early_or_late: { type: Number, default: 1 },
}, opt)

const Timetable = new mongoose.Schema({
  tenant_slug: { type: String, index: true },
  solution_id: String,
  week_start: String,
  class_id: mongoose.Schema.Types.ObjectId,
  subject_id: mongoose.Schema.Types.ObjectId,
  teacher_id: mongoose.Schema.Types.ObjectId,
  room_id: mongoose.Schema.Types.ObjectId,
  day: Number, period: Number,
  hard_lock: { type: Number, default: 0 },
}, opt).index({ tenant_slug:1, solution_id:1, week_start:1, day:1, period:1 })

export const Models = {
  Tenant: mongoose.model('Tenant', Tenant),
  Class: mongoose.model('Class', Class),
  Subject: mongoose.model('Subject', Subject),
  Teacher: mongoose.model('Teacher', Teacher),
  Room: mongoose.model('Room', Room),
  TeacherSubject: mongoose.model('TeacherSubject', TeacherSubject),
  ClassSubject: mongoose.model('ClassSubject', ClassSubject),
  AvTeacher: mongoose.model('AvTeacher', AvTeacher),
  AvRoom: mongoose.model('AvRoom', AvRoom),
  Demand: mongoose.model('Demand', Demand),
  Lock: mongoose.model('Lock', Lock),
  Penalties: mongoose.model('Penalties', Penalties),
  Timetable: mongoose.model('Timetable', Timetable),
}
