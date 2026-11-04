from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from models import UserAccessEnum, ApplicationStatusEnum, PaymentMethodEnum, PaymentStatusEnum


# ==========================================
# 1. USERS SCHEMAS
# ==========================================
class UserBase(BaseModel):
    user_id: str = Field(..., max_length=25)
    email: EmailStr
    full_name: str = Field(..., max_length=255)
    phone_number: Optional[str] = Field(None, max_length=25)
    user_type: UserAccessEnum = UserAccessEnum.student


class UserCreate(UserBase):
    user_password: str = Field(..., min_length=6, max_length=255)


class UserResponse(UserBase):
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True  # Allows SQLAlchemy model conversion


# ==========================================
# 2. PROGRAMS SCHEMAS
# ==========================================
class ProgramBase(BaseModel):
    course_id: str = Field(..., max_length=25)
    course_name: str = Field(..., max_length=100)
    academic_year: str = Field(..., max_length=25)
    is_active: bool = True


class ProgramCreate(ProgramBase):
    pass


class ProgramResponse(ProgramBase):

    class Config:
        from_attributes = True


# ==========================================
# 3. DOCUMENTS SCHEMAS
# ==========================================
class DocumentCreate(BaseModel):
    document_id: str = Field(..., max_length=25)
    application_id: str = Field(..., max_length=25)
    document_type: str = Field(..., max_length=100)
    file_path: str = Field(..., max_length=255)
    file_name: str = Field(..., max_length=255)
    file_type: str = Field(..., max_length=100)


class DocumentResponse(BaseModel):
    document_id: str
    application_id: str
    document_type: str
    file_path: str
    file_name: str
    file_type: str

    class Config:
        from_attributes = True


# ==========================================
# 4. PAYMENTS SCHEMAS
# ==========================================
class PaymentCreate(BaseModel):
    application_id: str = Field(..., max_length=25)
    amount: float = Field(..., gt=0)
    payment_method: PaymentMethodEnum


class PaymentResponse(BaseModel):
    payment_id: str
    application_id: str
    amount: float
    payment_method: PaymentMethodEnum
    reference_number: str
    status: PaymentStatusEnum

    class Config:
        from_attributes = True


# ==========================================
# 5. APPLICATIONS SCHEMAS
# ==========================================
class ApplicationCreate(BaseModel):
    user_id: str = Field(..., max_length=25)
    course_id: str = Field(..., max_length=25)
    application_id: Optional[str] = Field(None, max_length=25)


class ApplicationUpdateStatus(BaseModel):
    status: ApplicationStatusEnum


class ApplicationResponse(BaseModel):
    application_id: str
    user_id: str
    course_id: str
    status: ApplicationStatusEnum
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Defined here *after* ProgramResponse, DocumentResponse, and PaymentResponse
class ApplicationDetailResponse(BaseModel):
    application_id: str
    user_id: str
    course_id: str
    status: ApplicationStatusEnum
    created_at: datetime
    updated_at: datetime

    # Nested relations for complete visibility
    program: Optional[ProgramResponse] = None
    documents: List[DocumentResponse] = []
    payments: List[PaymentResponse] = []

    class Config:
        from_attributes = True


# In schemas.py
class UserRegister(BaseModel):
    email: EmailStr
    full_name: str = Field(..., max_length=255)
    phone_number: Optional[str] = Field(None, max_length=25)
    user_password: str = Field(..., min_length=6, max_length=255)
    user_type: UserAccessEnum = UserAccessEnum.student
