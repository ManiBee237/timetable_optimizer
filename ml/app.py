from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict
from ortools.sat.python import cp_model
import uuid

app = FastAPI()

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
    tenant: str
    week_start: str
    strict: bool = True
    classes: List[Dict]
    subjects: List[Dict]
    teachers: List[Dict]
    rooms: List[Dict]
    teacher_subjects: List[Dict]
    class_subjects: List[Dict]
    availability_teacher: List[Dict]
    availability_room: List[Dict]
    demand: List[Dict]
    locks: List[Dict]
    penalties: Dict

@app.post('/demand/forecast', response_model=ForecastOut)
def demand_forecast(_: ForecastIn):
    # Placeholder (returns empty; backend keeps manual/previous rows)
    return {"items": []}

@app.post('/optimize/solve')
def optimize(inp: SolveIn):
    DAYS, PERIODS = 5, 8
    class_ids = [c['id'] for c in inp.classes]
    teacher_ids = [t['id'] for t in inp.teachers]
    room_ids = [r['id'] for r in inp.rooms]

    teacher_subj = set((x['teacher_id'], x['subject_id']) for x in inp.teacher_subjects)
    t_avail = {(a['teacher_id'], a['day'], a['period']) for a in inp.availability_teacher if a['available']==1}
    r_avail = {(a['room_id'], a['day'], a['period']) for a in inp.availability_room if a['available']==1}
    demand = {(d['class_id'], d['subject_id']): d['periods_required'] for d in inp.demand}
    locks = {(L['class_id'], L['day'], L['period']): (L['subject_id'], L['teacher_id'], L['room_id']) for L in inp.locks}

    model = cp_model.CpModel()
    X = {}
    for (c, s), req in demand.items():
        for t in teacher_ids:
            if (t, s) not in teacher_subj: continue
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
        model.Add(X[(c,s,t,r,d,p)] == 1)

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
    out = []
    for key, var in X.items():
        if solver.Value(var) == 1:
            c,s,t,r,d,p = key
            out.append({
              'class_id': c, 'subject_id': s, 'teacher_id': t, 'room_id': r,
              'day': d, 'period': p, 'hard_lock': ((c,d,p) in locks and locks[(c,d,p)]==(s,t,r))
            })
    return {"solution_id": sid, "assignments": out, "objective": solver.ObjectiveValue()}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=5000)
