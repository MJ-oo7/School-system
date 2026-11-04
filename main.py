from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List
import os
import uuid
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# Import your database session dependency and Base
from database import engine, Base, get_db, SessionLocal

# Import your SQLAlchemy models and Pydantic schemas
import models
import schemas

# 1. Initialize FastAPI app FIRST
app = FastAPI(
    title="Digital School Enrollment System API",
    version="1.0.0"
)

# 2. Automatically create tables in PostgreSQL / SQLite if they don't exist yet
Base.metadata.create_all(bind=engine)


# Seed a default Admin account (ADMIN-001) if it doesn't exist
def seed_default_admin():
    db = SessionLocal()
    try:
        admin_user = db.query(models.User).filter(
            or_(
                models.User.user_id == "ADMIN-001",
                models.User.email == "admin@school.edu"
            )
        ).first()
        if not admin_user:
            default_admin = models.User(
                user_id="ADMIN-001",
                email="admin@school.edu",
                user_password="admin123",
                full_name="System Administrator",
                phone_number="09123456789",
                user_type=models.UserAccessEnum.admin
            )
            db.add(default_admin)
            db.commit()
        elif admin_user.user_type != models.UserAccessEnum.admin:
            admin_user.user_type = models.UserAccessEnum.admin
            db.commit()
    finally:
        db.close()


seed_default_admin()

# 3. Directory setup for uploads (resolved relative to this file)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

# Mount uploads directory so admins can view uploaded documents
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Enable CORS for frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Welcome to the Digital School Enrollment System API!"}


# ==========================================
# 4. DOCUMENT UPLOAD ENDPOINT
# ==========================================
@app.post("/documents/upload", response_model=schemas.DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    application_id: str = Form(...),
    document_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # 1. Verify that the application exists
    application = db.query(models.Application).filter(
        models.Application.application_id == application_id).first()
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application ID not found. Please create an application first."
        )

    # 2. Validate file name and extension
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided."
        )

    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{file_extension}'. Allowed formats: PDF, JPG, JPEG, PNG, DOC, DOCX."
        )

    # 3. Read and validate file size
    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file cannot be empty."
        )
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 10 MB maximum limit."
        )

    # 4. Generate a unique safe filename and storage path
    unique_filename = f"{uuid.uuid4().hex}{file_extension}"
    disk_file_path = os.path.join(UPLOAD_DIR, unique_filename)
    relative_file_path = f"uploads/{unique_filename}"

    # 5. Save the physical file to disk
    try:
        with open(disk_file_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save uploaded file: {str(e)}"
        )

    # 6. If a document of the same type already exists for this application, replace it
    existing_document = db.query(models.Document).filter(
        models.Document.application_id == application_id,
        models.Document.document_type == document_type
    ).first()

    if existing_document:
        old_disk_path = os.path.join(BASE_DIR, existing_document.file_path)
        if os.path.exists(old_disk_path):
            try:
                os.remove(old_disk_path)
            except OSError:
                pass
        existing_document.file_path = relative_file_path
        existing_document.file_name = file.filename
        existing_document.file_type = file.content_type or "application/octet-stream"
        db.commit()
        db.refresh(existing_document)
        return existing_document

    # 7. Generate a unique document_id and save new document record
    document_id = f"DOC-{uuid.uuid4().hex[:10].upper()}"

    db_document = models.Document(
        document_id=document_id,
        application_id=application_id,
        document_type=document_type,
        file_path=relative_file_path,
        file_name=file.filename,
        file_type=file.content_type or "application/octet-stream"
    )

    db.add(db_document)
    db.commit()
    db.refresh(db_document)

    return db_document


# ==========================================
# 5. USER REGISTRATION ENDPOINT (Auto-generated user_id, optional phone)
# ==========================================
@app.post("/users/register", status_code=status.HTTP_201_CREATED)
def register_user(user: schemas.UserRegister, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(
        models.User.email == user.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered with another account."
        )

    # Auto-generate unique user_id
    generated_user_id = f"USER-{uuid.uuid4().hex[:8].upper()}"

    db_user = models.User(
        user_id=generated_user_id,
        email=user.email,
        user_password=user.user_password,
        full_name=user.full_name,
        phone_number=user.phone_number,  # Optional field
        user_type=user.user_type
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return {
        "message": "User registered successfully",
        "user_id": db_user.user_id,
        "email": db_user.email,
        "full_name": db_user.full_name
    }


# ==========================================
# 6. PROGRAM CREATION & LISTING ENDPOINTS
# ==========================================
@app.post("/programs/", response_model=schemas.ProgramResponse, status_code=status.HTTP_201_CREATED)
def create_program(program: schemas.ProgramCreate, db: Session = Depends(get_db)):
    existing_program = db.query(models.Program).filter(
        models.Program.course_id == program.course_id).first()
    if existing_program:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Program course ID already exists."
        )

    db_program = models.Program(
        course_id=program.course_id,
        course_name=program.course_name,
        academic_year=program.academic_year,
        is_active=program.is_active
    )

    db.add(db_program)
    db.commit()
    db.refresh(db_program)
    return db_program


@app.get("/programs/", response_model=List[schemas.ProgramResponse])
def list_programs(db: Session = Depends(get_db)):
    return db.query(models.Program).filter(models.Program.is_active == True).all()


# ==========================================
# 7. APPLICATION SUBMISSION ENDPOINT (Auto-generated application_id)
# ==========================================
@app.post("/applications/", response_model=schemas.ApplicationResponse, status_code=status.HTTP_201_CREATED)
def create_application(application: schemas.ApplicationCreate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.user_id == application.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found. Please register or check user ID."
        )

    program = db.query(models.Program).filter(
        models.Program.course_id == application.course_id,
        models.Program.is_active == True
    ).first()
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active academic program not found."
        )

    # Prevent duplicate submitted/active applications for the same user & course
    existing_course_app = db.query(models.Application).filter(
        models.Application.user_id == application.user_id,
        models.Application.course_id == application.course_id,
        models.Application.status != models.ApplicationStatusEnum.rejected
    ).first()

    if existing_course_app:
        if existing_course_app.status == models.ApplicationStatusEnum.draft:
            return existing_course_app
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You already have an active application ({existing_course_app.application_id}) for this program."
        )

    # If the user is changing courses on an existing draft application (e.g., via Back button)
    if application.application_id:
        active_draft = db.query(models.Application).filter(
            models.Application.application_id == application.application_id,
            models.Application.user_id == application.user_id,
            models.Application.status == models.ApplicationStatusEnum.draft
        ).first()
        if active_draft:
            active_draft.course_id = application.course_id
            db.commit()
            db.refresh(active_draft)
            return active_draft

    # Auto-generate unique application_id
    generated_app_id = f"APP-{uuid.uuid4().hex[:8].upper()}"

    db_application = models.Application(
        application_id=generated_app_id,
        user_id=application.user_id,
        course_id=application.course_id,
        status=models.ApplicationStatusEnum.draft
    )

    db.add(db_application)
    db.commit()
    db.refresh(db_application)
    return db_application


# ==========================================
# 8. MOCK PAYMENT PROCESSING ENDPOINT (Auto-generated payment_id)
# ==========================================
@app.post("/payments/", response_model=schemas.PaymentResponse, status_code=status.HTTP_201_CREATED)
def process_mock_payment(payment: schemas.PaymentCreate, db: Session = Depends(get_db)):
    application = db.query(models.Application).filter(
        models.Application.application_id == payment.application_id
    ).first()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application ID not found."
        )

    # Prevent duplicate payments for the same application
    existing_payment = db.query(models.Payment).filter(
        models.Payment.application_id == payment.application_id,
        models.Payment.status == models.PaymentStatusEnum.completed
    ).first()
    if existing_payment or application.status != models.ApplicationStatusEnum.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment has already been processed for this application."
        )

    # Require both academic documents before payment processing
    if len(application.documents) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload both required documents (Report Card and Birth Certificate) before making a payment."
        )

    # Auto-generate IDs and a professional reference number
    generated_pay_id = f"PAY-{uuid.uuid4().hex[:8].upper()}"
    generated_ref_number = f"REF-{uuid.uuid4().hex[:10].upper()}"

    db_payment = models.Payment(
        payment_id=generated_pay_id,
        application_id=payment.application_id,
        amount=payment.amount,
        payment_method=payment.payment_method,
        reference_number=generated_ref_number,  # <-- Automatically generated here
        status=models.PaymentStatusEnum.completed
    )

    db.add(db_payment)
    application.status = models.ApplicationStatusEnum.under_review

    db.commit()
    db.refresh(db_payment)

    return db_payment


# ==========================================
# 9. RETRIEVAL & ADMIN STATUS ENDPOINTS
# ==========================================

@app.get("/applications/{application_id}", response_model=schemas.ApplicationDetailResponse)
def get_application_details(application_id: str, db: Session = Depends(get_db)):
    application = db.query(models.Application).filter(
        models.Application.application_id == application_id
    ).first()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application ID not found."
        )
    return application


@app.patch("/applications/{application_id}/status", response_model=schemas.ApplicationDetailResponse)
def update_application_status(
    application_id: str,
    status_update: schemas.ApplicationUpdateStatus,
    db: Session = Depends(get_db)
):
    application = db.query(models.Application).filter(
        models.Application.application_id == application_id
    ).first()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application ID not found."
        )

    application.status = status_update.status
    db.commit()
    db.refresh(application)
    return application


@app.get("/users/{user_id}/applications", response_model=List[schemas.ApplicationResponse])
def get_user_applications(user_id: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )

    applications = db.query(models.Application).filter(
        models.Application.user_id == user_id
    ).all()

    return applications


@app.get("/admin/applications", response_model=List[schemas.ApplicationDetailResponse])
def admin_list_all_applications(db: Session = Depends(get_db)):
    applications = db.query(models.Application).all()
    return applications


@app.get("/users/{user_id}/role")
def check_user_role(user_id: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )
    return {
        "user_id": user.user_id,
        "full_name": user.full_name,
        "user_type": user.user_type
    }


class AdminLoginRequest(BaseModel):
    user_password: str


@app.post("/users/{user_id}/verify-admin")
def verify_admin_login(user_id: str, credentials: AdminLoginRequest, db: Session = Depends(get_db)):
    # Ensure default admin is seeded even if DB was reset while server was running
    seed_default_admin()

    normalized_id = user_id.strip()
    user = db.query(models.User).filter(
        models.User.user_id == normalized_id
    ).first()
    if not user or user.user_id != normalized_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin ID not found. Note: Admin ID is case-sensitive."
        )

    if user.user_password != credentials.user_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password."
        )

    if user.user_type != models.UserAccessEnum.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access Denied: User '{user.full_name}' is not an administrator."
        )

    return {
        "user_id": user.user_id,
        "full_name": user.full_name,
        "user_type": user.user_type
    }


class StudentLoginRequest(BaseModel):
    email: str
    user_password: str


@app.post("/users/login")
def login_student(credentials: StudentLoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.email == credentials.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account with this email does not exist."
        )

    if user.user_password != credentials.user_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password."
        )

    return {
        "user_id": user.user_id,
        "full_name": user.full_name,
        "email": user.email,
        "user_type": user.user_type
    }


class StudentIdLoginRequest(BaseModel):
    user_password: str


@app.post("/users/{user_id}/verify-student")
def verify_student_login(user_id: str, credentials: StudentIdLoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User ID not found."
        )
    if user.user_password != credentials.user_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password."
        )
    return {
        "user_id": user.user_id,
        "full_name": user.full_name,
        "user_type": user.user_type
    }
