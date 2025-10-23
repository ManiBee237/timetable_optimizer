# app.py (backend)

from fastapi import FastAPI, APIRouter, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from ortools.sat.python import cp_model
import uuid

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter(prefix="/api")

# ---------------- In-memory DB ----------------
DB = {
    "classes": [],
    "subjects": [],
    "teachers": [],
    "rooms": [],
    "teacher_subjects": [],
    "availability_teacher": [],
    "availability_room": [],
    "locks": [],
    "demand": [],
    "solutions": {},  # solution_id -> {"rows":[...], "objective": float}
}
SEQ = {k: 1 for k in ["classes","subjects","teachers","rooms"]}

def _rows(kind: str, limit: int = 1000):
    return {"rows": DB.get(kind, [])[:limit]}

def _create(kind: str, item: Dict):
    if kind in SEQ:
        item = dict(item)
        item["id"] = SEQ[kind]
        SEQ[kind] += 1
    DB[kind].append(item)
    return item

def _delete(kind: str, id_field: str, id_val: int):
    before = len(DB[kind])
    DB[kind] = [x for x in DB[kind] if int(x.get(id_field, -1)) != int(id_val)]
    return {"deleted": before - len(DB[kind])}

# ---------------- Schemas ----------------
class DemandItem(BaseModel):
    class_id: int
    subject_id: int
    periods_required: int

class ForecastIn(BaseModel):
    tenant: str
    week_start: str

class ForecastOut(BaseModel):
    items: List[DemandItem]

class SolveIn(BaseModel):
    tenant: str = "demo"
    week_start: str
    strict: bool = True
    classes: List[Dict] = Field(default_factory=list)
    subjects: List[Dict] = Field(default_factory=list)
    teachers: List[Dict] = Field(default_factory=list)
    rooms: List[Dict] = Field(default_factory=list)
    teacher_subjects: List[Dict] = Field(default_factory=list)
    class_subjects: List[Dict] = Field(default_factory=list)
    availability_teacher: List[Dict] = Field(default_factory=list)
    availability_room: List[Dict] = Field(default_factory=list)
    demand: List[Dict] = Field(default_factory=list)
    locks: List[Dict] = Field(default_factory=list)
    penalties: Dict = Field(default_factory=dict)

# ---------------- Health ----------------
@router.get("/health")
def health():
    return {"ok": True}

# ---------------- CRUD: classes/subjects/teachers/rooms ----------------
@router.get("/crud/classes")
def list_classes(limit: int = 1000): return _rows("classes", limit)
@router.post("/crud/classes")
def create_class(payload: Dict): return _create("classes", payload)
@router.delete("/crud/classes/{id}")
def delete_class(id: int): return _delete("classes", "id", id)

@router.get("/crud/subjects")
def list_subjects(limit: int = 1000): return _rows("subjects", limit)
@router.post("/crud/subjects")
def create_subject(payload: Dict): return _create("subjects", payload)
@router.delete("/crud/subjects/{id}")
def delete_subject(id: int): return _delete("subjects", "id", id)

@router.get("/crud/teachers")
def list_teachers(limit: int = 1000): return _rows("teachers", limit)
@router.post("/crud/teachers")
def create_teacher(payload: Dict): return _create("teachers", payload)
@router.delete("/crud/teachers/{id}")
def delete_teacher(id: int): return _delete("teachers", "id", id)

@router.get("/crud/rooms")
def list_rooms(limit: int = 1000): return _rows("rooms", limit)
@router.post("/crud/rooms")
def create_room(payload: Dict): return _create("rooms", payload)
@router.delete("/crud/rooms/{id}")
def delete_room(id: int): return _delete("rooms", "id", id)

# ---------------- Extra CRUD ----------------
@router.get("/crud/teacher_subjects")
def list_teacher_subjects(limit: int = 10000): return _rows("teacher_subjects", limit)
@router.post("/crud/teacher_subjects")
def add_teacher_subject(payload: Dict): return _create("teacher_subjects", payload)

@router.get("/crud/availability_teacher")
def list_avail_teacher(limit: int = 10000): return _rows("availability_teacher", limit)
@router.post("/crud/availability_teacher")
def add_avail_teacher(payload: Dict): return _create("availability_teacher", payload)

@router.get("/crud/availability_room")
def list_avail_room(limit: int = 10000): return _rows("availability_room", limit)
@router.post("/crud/availability_room")
def add_avail_room(payload: Dict): return _create("availability_room", payload)

# ---------------- Demand ----------------
@router.get("/demand/forecast")
def demand_forecast_get(week_start: str):
    return {"items": DB["demand"]}

@router.post("/demand/forecast", response_model=ForecastOut)
def demand_forecast_post(_: ForecastIn):
    return {"items": [
        {k: v for k, v in d.items()
         if k in ("class_id","subject_id","periods_required")}
        for d in DB["demand"]
    ]}

# ---------------- Optimize ----------------
@router.post("/optimize/lock")
def optimize_lock(payload: Dict):
    DB["locks"].append(payload)
    return {"ok": True}

@router.post("/optimize/solve")
def optimize(inp: SolveIn):
    DAYS, PERIODS = 5, 8
    class_ids = [c['id'] for c in inp.classes]
    teacher_ids = [t['id'] for t in inp.teachers]
    room_ids = [r['id'] for r in inp.rooms]

    teacher_subj = set((x['teacher_id'], x['subject_id']) for x in inp.teacher_subjects)
    t_avail = {(a['teacher_id'], a['day'], a['period']) for a in inp.availability_teacher if a.get('available',1)==1}
    r_avail = {(a['room_id'], a['day'], a['period']) for a in inp.availability_room if a.get('available',1)==1}
    demand = {(d['class_id'], d['subject_id']): d['periods_required'] for d in inp.demand}
    locks = {(L['class_id'], L['day'], L['period']): (L['subject_id'], L.get('teacher_id'), L.get('room_id')) for L in (inp.locks or [])}

    model = cp_model.CpModel()
    X = {}
    for (c, s), _req in demand.items():
        for t in teacher_ids:
            if (t, s) not in teacher_subj:
                continue
            for r in room_ids:
                for d in range(DAYS):
                    for p in range(PERIODS):
                        X[(c,s,t,r,d,p)] = model.NewBoolVar(f"x_c{c}_s{s}_t{t}_r{r}_d{d}_p{p}")

    # Class one slot
    for c in class_ids:
        for d in range(DAYS):
            for p in range(PERIODS):
                model.Add(sum(X.get((c,s,t,r,d,p),0)
                              for (cc,s) in demand if cc==c
                              for t in teacher_ids for r in room_ids) <= 1)

    # Teacher one slot
    for t in teacher_ids:
        for d in range(DAYS):
            for p in range(PERIODS):
                model.Add(sum(X.get((c,s,t,r,d,p),0)
                              for (c,s) in demand for r in room_ids) <= 1)

    # Room one slot
    for r in room_ids:
        for d in range(DAYS):
            for p in range(PERIODS):
                model.Add(sum(X.get((c,s,t,r,d,p),0)
                              for (c,s) in demand for t in teacher_ids) <= 1)

    # Availability
    for key, var in list(X.items()):
        c,s,t,r,d,p = key
        if (t,d,p) not in t_avail: model.Add(var==0)
        if (r,d,p) not in r_avail: model.Add(var==0)

    # Demand coverage
    for (c,s), req in demand.items():
        placed = sum(X.get((c,s,t,r,d,p),0)
                     for t in teacher_ids for r in room_ids
                     for d in range(DAYS) for p in range(PERIODS))
        if inp.strict: model.Add(placed == req)
        else: model.Add(placed >= req)

    # Locks
    for (c,d,p), (s,t,r) in locks.items():
        key = (c,s,t,r,d,p)
        if key in X:
            model.Add(X[key] == 1)

    # Soft: lab subjects prefer lab rooms
    lab_subjects = {sub['id'] for sub in inp.subjects if sub.get('is_lab',0)==1}
    lab_rooms = {r['id'] for r in inp.rooms if r.get('is_lab',0)==1}
    mismatches = []
    for key, var in X.items():
        c,s,t,r,d,p = key
        if s in lab_subjects and r not in lab_rooms:
            m = model.NewBoolVar(f"m_{c}_{s}_{r}_{d}_{p}")
            model.Add(var <= m)
            mismatches.append(m)

    pen_room = int(inp.penalties.get('room_mismatch',4)) if inp.penalties else 4
    model.Minimize(pen_room * sum(mismatches))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 25.0
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"solution_id": None, "assignments": [], "objective": None}

    sid = str(uuid.uuid4())
    rows = []
    for key, var in X.items():
        if solver.Value(var) == 1:
            c,s,t,r,d,p = key
            rows.append({
              "class_id": c, "subject_id": s, "teacher_id": t, "room_id": r,
              "day": d, "period": p, "hard_lock": ((c,d,p) in locks and locks[(c,d,p)]==(s,t,r))
            })

    DB["solutions"][sid] = {"rows": rows, "objective": solver.ObjectiveValue()}
    return {"solution_id": sid, "assignments": rows, "objective": solver.ObjectiveValue()}

@router.get("/optimize/solution/{sid}")
def get_solution(sid: str):
    sol = DB["solutions"].get(sid)
    if not sol:
        raise HTTPException(status_code=404, detail="Solution not found")
    return sol

# ---------------- Teacher timetable (filtered) ----------------
@router.get("/teacher/timetable/{teacher_id}")
def teacher_timetable(teacher_id: int, solution_id: str = Query(..., alias="solution_id")):
    sol = DB["solutions"].get(solution_id)
    if not sol:
        raise HTTPException(status_code=404, detail="Solution not found")
    rows = [r for r in sol["rows"] if int(r["teacher_id"]) == int(teacher_id)]
    return {"rows": rows, "objective": sol.get("objective")}

# ---------------- Seed demo ----------------
@router.post("/seed/demo")
def seed_demo():
    for k in DB: DB[k].clear()
    for k in SEQ: SEQ[k] = 1

    classes = [
        {"id": 1, "code": "A", "section": "1"},
        {"id": 2, "code": "B", "section": "1"},
    ]
    subjects = [
        {"id": 10, "name": "Math", "is_lab": 0},
        {"id": 11, "name": "Science", "is_lab": 1},
        {"id": 12, "name": "English", "is_lab": 0},
    ]
    teachers = [
        {"id": 100, "name": "Mr. Raj"},
        {"id": 101, "name": "Mrs. Devi"},
    ]
    rooms = [
        {"id": 200, "name": "R1", "is_lab": 0},
        {"id": 201, "name": "Lab1", "is_lab": 1},
    ]

    DB["classes"].extend(classes)
    DB["subjects"].extend(subjects)
    DB["teachers"].extend(teachers)
    DB["rooms"].extend(rooms)

    # broader teacher-subject coverage so assignments exist
    DB["teacher_subjects"].extend([
        {"teacher_id": 100, "subject_id": 10},
        {"teacher_id": 100, "subject_id": 12},
        {"teacher_id": 101, "subject_id": 11},
        {"teacher_id": 101, "subject_id": 10},
        {"teacher_id": 100, "subject_id": 11},
    ])

    DB["availability_teacher"].extend([
        {"teacher_id": t["id"], "day": d, "period": p, "available": 1}
        for t in teachers for d in range(5) for p in range(8)
    ])
    DB["availability_room"].extend([
        {"room_id": r["id"], "day": d, "period": p, "available": 1}
        for r in rooms for d in range(5) for p in range(8)
    ])

    DB["demand"].extend([
        {"class_id": 1, "subject_id": 10, "periods_required": 3, "source": "demo"},
        {"class_id": 1, "subject_id": 11, "periods_required": 2, "source": "demo"},
        {"class_id": 2, "subject_id": 12, "periods_required": 3, "source": "demo"},
        {"class_id": 2, "subject_id": 10, "periods_required": 2, "source": "demo"},
    ])

    return {"ok": True}

app.include_router(router)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=5000, reload=True)
