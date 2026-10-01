import os
import base64
import bcrypt
import jwt
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, create_engine, inspect
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

SECRET_KEY = "campus_portal_super_jwt_secret_2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
security = HTTPBearer(auto_error=False)

DATABASE_URL = "sqlite:///./events.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class UserModel(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    role = Column(String(20), default="student")
    roll_number = Column(String(50), default="N/A")
    department = Column(String(80), default="General")
    academic_year = Column(String(30), default="1st Year")
    job_title = Column(String(80), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    bookings = relationship("BookingModel", back_populates="user", cascade="all, delete-orphan")

class EventModel(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    category = Column(String(80), nullable=False)
    venue = Column(String(150), nullable=False)
    date_str = Column(String(80), nullable=False)
    price = Column(Float, default=0.0)
    capacity = Column(Integer, nullable=False)
    registered_count = Column(Integer, default=0)
    is_team_event = Column(Integer, default=0)
    team_size = Column(Integer, default=1)
    status = Column(String(30), default="Published")
    description = Column(Text, default="")
    payment_qr = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    bookings = relationship("BookingModel", back_populates="event", cascade="all, delete-orphan")

class BookingModel(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticket_count = Column(Integer, default=1)
    team_name = Column(String(100), default="Solo Participant")
    team_members = Column(Text, default="")
    status = Column(String(30), default="Confirmed")# 'Confirmed', 'Checked In', 'Cancelled'
    certificate_issued = Column(Integer, default=0)
    booked_at = Column(DateTime, default=datetime.utcnow)
    payment_mode = Column(String(50), default="Free")
    transaction_id = Column(String(100), default="FREE_PASS")
    amount_paid = Column(Float, default=0.0)

    event = relationship("EventModel", back_populates="bookings")
    user = relationship("UserModel", back_populates="bookings")

Base.metadata.create_all(bind=engine)

booking_columns = {column["name"] for column in inspect(engine).get_columns("bookings")}
booking_column_migrations = {
    "payment_mode": "VARCHAR(50) DEFAULT 'Free'",
    "transaction_id": "VARCHAR(100) DEFAULT 'FREE_PASS'",
    "amount_paid": "FLOAT DEFAULT 0.0",
}
with engine.begin() as connection:
    for column_name, column_definition in booking_column_migrations.items():
        if column_name not in booking_columns:
            connection.exec_driver_sql(
                f"ALTER TABLE bookings ADD COLUMN {column_name} {column_definition}"
            )
    user_columns = {column["name"] for column in inspect(engine).get_columns("users")}
    if "job_title" not in user_columns:
        connection.exec_driver_sql("ALTER TABLE users ADD COLUMN job_title VARCHAR(80) DEFAULT ''")
    event_columns = {column["name"] for column in inspect(engine).get_columns("events")}
    if "payment_qr" not in event_columns:
        connection.exec_driver_sql("ALTER TABLE events ADD COLUMN payment_qr VARCHAR(255) DEFAULT ''")

class StudentRegister(BaseModel):
    name: str = Field(..., min_length=2)
    email: EmailStr
    password: str = Field(..., min_length=8)
    roll_number: Optional[str] = "N/A"
    department: Optional[str] = "CSE"
    academic_year: Optional[str] = "2nd Year"

class StudentProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2)
    email: Optional[EmailStr] = None
    roll_number: Optional[str] = Field(None, min_length=1)
    department: Optional[str] = Field(None, min_length=1)
    academic_year: Optional[str] = Field(None, min_length=1)

class StaffCreate(BaseModel):
    name: str = Field(..., min_length=2)
    email: EmailStr
    password: str = Field(..., min_length=8)
    roll_number: str = Field(..., min_length=1)
    department: str = Field(..., min_length=1)
    job_title: str = Field(..., min_length=2)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    roll_number: str
    department: str
    academic_year: str
    job_title: str = ""
    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

class EventCreate(BaseModel):
    title: str = Field(..., min_length=2)
    category: str
    venue: str
    date_str: str
    price: float = 0.0
    capacity: int = Field(..., gt=0)
    is_team_event: int = 0
    team_size: int = 1
    status: str = "Published"
    description: Optional[str] = ""
    payment_qr: Optional[str] = Field(None, max_length=1_400_000)

class EventUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    venue: Optional[str] = None
    date_str: Optional[str] = None
    price: Optional[float] = None
    capacity: Optional[int] = None
    is_team_event: Optional[int] = None
    team_size: Optional[int] = None
    status: Optional[str] = None
    description: Optional[str] = None
    payment_qr: Optional[str] = Field(None, max_length=1_400_000)

class EventOut(BaseModel):
    id: int
    title: str
    category: str
    venue: str
    date_str: str
    price: float
    capacity: int
    registered_count: int
    is_team_event: int
    team_size: int
    status: str
    description: Optional[str]
    payment_qr: Optional[str] = ""
    created_at: datetime
    class Config:
        from_attributes = True


class BookingCreate(BaseModel):
    event_id: int
    ticket_count: int = Field(1, ge=1)
    team_name: Optional[str] = "Solo Participant"
    team_members: Optional[str] = ""
    transaction_id: Optional[str] = None

class BookingOut(BaseModel):
    id: int
    event_id: int
    user_id: int
    ticket_count: int
    team_name: str
    team_members: str
    status: str
    certificate_issued: int
    booked_at: datetime
    event_title: Optional[str] = None
    event_venue: Optional[str] = None
    event_date: Optional[str] = None
    event_price: Optional[float] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    user_roll: Optional[str] = None
    user_dept: Optional[str] = None
    payment_mode: Optional[str] = "Free"
    transaction_id: Optional[str] = "FREE_PASS"
    amount_paid: Optional[float] = 0.0
    class Config:
        from_attributes = True

class UserListingOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    roll_number: str
    department: str
    academic_year: str
    total_bookings: int
    bookings: List[BookingOut]
    class Config:
        from_attributes = True

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(data)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

app = FastAPI(title="Campus Fest & Event Management Engine", version="2.0.0")
PAYMENT_QR_DIR = os.path.join(os.path.dirname(__file__), "payment_qr")
os.makedirs(PAYMENT_QR_DIR, exist_ok=True)
app.mount("/api/payment-qr", StaticFiles(directory=PAYMENT_QR_DIR), name="payment-qr")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode('utf-8')[:72]
    hashed_bytes = hashed_password.encode('utf-8')
    try:
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_payment_qr(data_url: str):
    mime_extensions = {
        "data:image/png;base64": "png",
        "data:image/jpeg;base64": "jpg",
        "data:image/webp;base64": "webp",
    }
    header, separator, encoded_image = data_url.partition(",")
    extension = mime_extensions.get(header)
    if not separator or not extension:
        raise HTTPException(status_code=400, detail="Upload a PNG, JPG, or WEBP payment QR image")
    try:
        image_bytes = base64.b64decode(encoded_image, validate=True)
    except ValueError:
        raise HTTPException(status_code=400, detail="The uploaded payment QR image is invalid")
    if not image_bytes or len(image_bytes) > 1_000_000:
        raise HTTPException(status_code=400, detail="Payment QR images must be smaller than 1 MB")
    return extension, image_bytes

def save_payment_qr(event_id: int, data_url: str) -> str:
    extension, image_bytes = decode_payment_qr(data_url)
    filename = f"{event_id}.{extension}"
    with open(os.path.join(PAYMENT_QR_DIR, filename), "wb") as image_file:
        image_file.write(image_bytes)
    return f"/api/payment-qr/{filename}"

def remove_payment_qr(qr_url: Optional[str]):
    if not qr_url:
        return
    filename = qr_url.rsplit("/", 1)[-1]
    if filename != os.path.basename(filename):
        return
    file_path = os.path.join(PAYMENT_QR_DIR, filename)
    if os.path.isfile(file_path):
        os.remove(file_path)

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security), db: Session = Depends(get_db)) -> UserModel:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication token missing")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token identity")
    except Exception:
        raise HTTPException(status_code=401, detail="Session expired or invalid token")

    user = db.query(UserModel).filter(UserModel.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Student account not found")
    return user

async def get_current_admin(current_user: UserModel = Depends(get_current_user)) -> UserModel:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Faculty/Club Coordinator authorization required")
    return current_user

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/api/auth/register", response_model=TokenResponse)
async def register(payload: StudentRegister, db: Session = Depends(get_db)):
    if db.query(UserModel).filter(UserModel.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Account with this email already exists")

    new_user = UserModel(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role="student",
        roll_number=payload.roll_number or "N/A",
        department=payload.department or "General",
        academic_year=payload.academic_year or "1st Year"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token({"sub": str(new_user.id), "role": new_user.role})
    return {"access_token": token, "token_type": "bearer", "user": new_user}

@app.post("/api/auth/login", response_model=TokenResponse)
async def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"access_token": token, "token_type": "bearer", "user": user}

@app.get("/api/auth/me", response_model=UserOut)
async def get_me(user: UserModel = Depends(get_current_user)):
    return user

@app.patch("/api/auth/me", response_model=UserOut)
def update_student_profile(
    payload: StudentProfileUpdate,
    db: Session = Depends(get_db),
    student: UserModel = Depends(get_current_user),
):
    if student.role != "student":
        raise HTTPException(status_code=403, detail="Only student profiles can be edited here")

    updates = payload.model_dump(exclude_unset=True)
    email = updates.get("email")
    if email and db.query(UserModel).filter(UserModel.email == email, UserModel.id != student.id).first():
        raise HTTPException(status_code=409, detail="That email address is already in use")

    for field, value in updates.items():
        setattr(student, field, value)
    db.commit()
    db.refresh(student)
    return student

@app.get("/api/admin/staff", response_model=List[UserOut])
def get_staff_accounts(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    return db.query(UserModel).filter(UserModel.role == "admin").order_by(UserModel.id.desc()).all()

@app.post("/api/admin/staff", response_model=UserOut, status_code=201)
def create_staff_account(
    payload: StaffCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    if db.query(UserModel).filter(UserModel.email == payload.email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    staff = UserModel(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role="admin",
        roll_number=payload.roll_number,
        department=payload.department,
        academic_year="Faculty / Staff",
        job_title=payload.job_title,
    )
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return staff

@app.get("/api/events", response_model=List[EventOut])
def list_events(db: Session = Depends(get_db)):
    return db.query(EventModel).order_by(EventModel.id.desc()).all()

@app.get("/api/events/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db)):
    ev = db.query(EventModel).filter(EventModel.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Campus event not found")
    return ev

@app.post("/api/events", response_model=EventOut)
async def create_event(payload: EventCreate, db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    qr_data = payload.payment_qr
    new_event = EventModel(**payload.model_dump(exclude={"payment_qr"}), registered_count=0)
    db.add(new_event)
    db.flush()
    if qr_data:
        new_event.payment_qr = save_payment_qr(new_event.id, qr_data)
    db.commit()
    db.refresh(new_event)
    await manager.broadcast({"action": "EVENT_CREATED", "id": new_event.id})
    return new_event

@app.put("/api/events/{event_id}", response_model=EventOut)
async def update_event(event_id: int, payload: EventUpdate, db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    ev = db.query(EventModel).filter(EventModel.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Campus event not found")
    updates = payload.model_dump(exclude_unset=True)
    qr_data = updates.pop("payment_qr", None)
    previous_qr = ev.payment_qr
    for field, val in updates.items():
        setattr(ev, field, val)
    if qr_data is not None:
        ev.payment_qr = save_payment_qr(ev.id, qr_data) if qr_data else ""
    db.commit()
    db.refresh(ev)
    if previous_qr and previous_qr != ev.payment_qr:
        remove_payment_qr(previous_qr)
    await manager.broadcast({"action": "EVENT_UPDATED", "id": ev.id})
    return ev

@app.delete("/api/events/{event_id}")
async def delete_event(event_id: int, db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    ev = db.query(EventModel).filter(EventModel.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Campus event not found")
    payment_qr = ev.payment_qr
    db.delete(ev)
    db.commit()
    remove_payment_qr(payment_qr)
    await manager.broadcast({"action": "EVENT_DELETED", "id": event_id})
    return {"status": "success", "deleted_id": event_id}

@app.post("/api/bookings", response_model=BookingOut)
async def book_pass(payload: BookingCreate, db: Session = Depends(get_db), student: UserModel = Depends(get_current_user)):
    ev = db.query(EventModel).filter(EventModel.id == payload.event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    existing = db.query(BookingModel).filter(BookingModel.event_id == ev.id, BookingModel.user_id == student.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="You already hold an active pass for this event.")

    if (ev.registered_count + payload.ticket_count) > ev.capacity:
        raise HTTPException(status_code=400, detail="Seat capacity full for this event/hall.")

    total_payable = ev.price * payload.ticket_count
    if ev.price > 0:
        if not payload.transaction_id or len(payload.transaction_id.strip()) < 8:
            raise HTTPException(
                status_code=400, 
                detail="This is a paid event. A valid 12-digit UPI Transaction / UTR ID is mandatory."
            )
        mode = "UPI / Online"
        tx_id = payload.transaction_id.strip()
    else:
        mode = "Free Admission"
        tx_id = "FREE_PASS"
        total_payable = 0.0

    ev.registered_count += payload.ticket_count
    if ev.registered_count >= ev.capacity:
        ev.status = "Sold Out"

    booking = BookingModel(
        event_id=ev.id,
        user_id=student.id,
        ticket_count=payload.ticket_count,
        team_name=payload.team_name if ev.is_team_event else "Individual Student",
        team_members=payload.team_members or f"{student.name} ({student.roll_number})",
        payment_mode=mode,
        transaction_id=tx_id,
        amount_paid=total_payable,
        status="Confirmed",
        certificate_issued=0
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    await manager.broadcast({"action": "BOOKING_MADE", "event_id": ev.id})

    out = BookingOut.from_orm(booking)
    out.event_title = ev.title
    out.event_venue = ev.venue
    out.event_date = ev.date_str
    out.event_price = ev.price
    out.user_name = student.name
    out.user_email = student.email
    out.user_roll = student.roll_number
    out.user_dept = student.department
    out.payment_mode = booking.payment_mode
    out.transaction_id = booking.transaction_id
    out.amount_paid = booking.amount_paid
    return out

@app.get("/api/bookings/my", response_model=List[BookingOut])
def get_student_bookings(db: Session = Depends(get_db), student: UserModel = Depends(get_current_user)):
    try:
        bookings = db.query(BookingModel).filter(BookingModel.user_id == student.id).order_by(BookingModel.id.desc()).all()
        results = []
        for b in bookings:
            item = BookingOut(
                id=b.id,
                event_id=b.event_id,
                user_id=b.user_id,
                ticket_count=b.ticket_count or 1,
                team_name=b.team_name or "Solo Participant",
                team_members=b.team_members or "",
                status=b.status or "Confirmed",
                certificate_issued=b.certificate_issued or 0,
                booked_at=b.booked_at or datetime.utcnow(),
                event_title=b.event.title if b.event else "Decommissioned Event",
                event_venue=b.event.venue if b.event else "N/A",
                event_date=b.event.date_str if b.event else "N/A",
                event_price=b.event.price if b.event else 0.0,
                user_name=student.name,
                user_email=student.email,
                user_roll=student.roll_number or "N/A",
                user_dept=student.department or "General",
                payment_mode=getattr(b, "payment_mode", "Free Admission") or "Free Admission",
                transaction_id=getattr(b, "transaction_id", "FREE_PASS") or "FREE_PASS",
                amount_paid=getattr(b, "amount_paid", 0.0) or 0.0
            )
            results.append(item)
        return results
    except Exception as e:
        print(f"Error in /api/bookings/my: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/bookings/{booking_id}")
async def cancel_booking(booking_id: int, db: Session = Depends(get_db), student: UserModel = Depends(get_current_user)):
    booking = db.query(BookingModel).filter(BookingModel.id == booking_id, BookingModel.user_id == student.id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking record not found")

    ev = db.query(EventModel).filter(EventModel.id == booking.event_id).first()
    if ev:
        ev.registered_count = max(0, ev.registered_count - booking.ticket_count)
        if ev.status == "Sold Out" and ev.registered_count < ev.capacity:
            ev.status = "Published"

    db.delete(booking)
    db.commit()
    await manager.broadcast({"action": "BOOKING_CANCELLED", "event_id": ev.id if ev else 0})
    return {"status": "success", "cancelled_id": booking_id}

@app.get("/api/admin/users", response_model=List[UserListingOut])
def get_all_students_with_listings(db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    users = db.query(UserModel).filter(UserModel.role == "student").order_by(UserModel.id.desc()).all()
    results = []
    for u in users:
        user_bookings = []
        for b in u.bookings:
            item = BookingOut.from_orm(b)
            item.event_title = b.event.title if b.event else "N/A"
            item.event_venue = b.event.venue if b.event else "N/A"
            item.event_date = b.event.date_str if b.event else "N/A"
            item.event_price = b.event.price if b.event else 0.0
            item.user_name = u.name
            item.user_email = u.email
            item.user_roll = u.roll_number
            item.user_dept = u.department
            user_bookings.append(item)

        results.append(UserListingOut(
            id=u.id,
            name=u.name,
            email=u.email,
            role=u.role,
            roll_number=u.roll_number,
            department=u.department,
            academic_year=u.academic_year,
            total_bookings=len(user_bookings),
            bookings=user_bookings
        ))
    return results

@app.get("/api/admin/manifest", response_model=List[BookingOut])
def get_all_manifest(db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    bookings = db.query(BookingModel).order_by(BookingModel.id.desc()).all()
    results = []
    for b in bookings:
        item = BookingOut.from_orm(b)
        item.event_title = b.event.title if b.event else "Unknown Event"
        item.user_name = b.user.name if b.user else "Unknown Student"
        item.user_email = b.user.email if b.user else "N/A"
        item.user_roll = b.user.roll_number if b.user else "N/A"
        item.user_dept = b.user.department if b.user else "N/A"
        results.append(item)
    return results

@app.patch("/api/admin/check-in/{booking_id}")
async def toggle_check_in(booking_id: int, db: Session = Depends(get_db), admin: UserModel = Depends(get_current_admin)):
    booking = db.query(BookingModel).filter(BookingModel.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status == "Checked In":
        booking.status = "Confirmed"
        booking.certificate_issued = 0
    else:
        booking.status = "Checked In"
        booking.certificate_issued = 1

    db.commit()
    db.refresh(booking)
    await manager.broadcast({"action": "CHECKIN_TOGGLED", "booking_id": booking.id})
    return {"status": "success", "new_status": booking.status}

@app.on_event("startup")
def seed_campus_records():
    with SessionLocal() as db:
        if not db.query(UserModel).filter(UserModel.email == "faculty@campus.edu").first():
            db.add(UserModel(
                name="Dr. K. Ramanathan (HOD CSE)",
                email="faculty@campus.edu",
                password_hash=hash_password("admin123"),
                role="admin",
                roll_number="FAC-CSE-01",
                department="Computer Science & Engineering",
                academic_year="Faculty Lead"
            ))

        if not db.query(UserModel).filter(UserModel.email == "sajin@campus.edu").first():
            db.add(UserModel(
                name="Sajin Kumar",
                email="sajin@campus.edu",
                password_hash=hash_password("student123"),
                role="student",
                roll_number="22CS104",
                department="Computer Science & Engineering",
                academic_year="3rd Year"
            ))

        if db.query(EventModel).count() == 0:
            db.add_all([
                EventModel(
                    title="HackGenesis 2026: 24hr Campus Hackathon",
                    category="CSE / Turing Club",
                    venue="Advanced Computing Lab & Innovation Hub",
                    date_str="Oct 24, 2026 • 09:00 AM",
                    price=0.0,
                    capacity=160,
                    registered_count=0,
                    is_team_event=1,
                    team_size=4,
                    status="Live",
                    description="24-hour non-stop national collegiate hackathon with AI, Web3, and IoT tracks. Meals, hardware kits, and OD provided."
                ),
                EventModel(
                    title="RoboWars & Line Follower Championship",
                    category="Robotics & Mech Club",
                    venue="College Indoor Stadium",
                    date_str="Oct 28, 2026 • 10:30 AM",
                    price=50.0,
                    capacity=80,
                    is_team_event=1,
                    team_size=3,
                    status="Published",
                    description="Combat robotics arena battle up to 15kg weight class and precision line-follower speed course."
                ),
                EventModel(
                    title="Guest Keynote: Generative AI in Production",
                    category="ECE & AI Society",
                    venue="Dr. APJ Abdul Kalam Central Auditorium",
                    date_str="Nov 04, 2026 • 02:00 PM",
                    price=0.0,
                    capacity=350,
                    is_team_event=0,
                    team_size=1,
                    status="Published",
                    description="Industrial guest lecture by senior engineers on latency optimization and multi-agent deployment."
                ),
                EventModel(
                    title="Battle of the Bands & Pro-Show Night",
                    category="Cultural Council",
                    venue="Open Air Amphitheatre",
                    date_str="Nov 14, 2026 • 06:00 PM",
                    price=150.0,
                    capacity=600,
                    is_team_event=0,
                    team_size=1,
                    status="Published",
                    description="Annual cultural fest grand pro-show with celebrity guest performance. RFID wristband entry pass."
                )
            ])
        db.commit()

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)