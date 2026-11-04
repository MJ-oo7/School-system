from sqlalchemy import Column, String, Boolean, Numeric, TIMESTAMP, ForeignKey, Enum as SQLEnum
from sqlalchemy.sql import func
from database import Base
import enum
from sqlalchemy.orm import relationship

# Python Enums matching your PostgreSQL ENUM types


class UserAccessEnum(str, enum.Enum):
    student = "student"
    employee = "employee"
    admin = "admin"


class ApplicationStatusEnum(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    under_review = "under_review"
    approved = "approved"
    rejected = "rejected"


class PaymentMethodEnum(str, enum.Enum):
    gcash = "gcash"
    debit_card = "debit_card"
    credit_card = "credit_card"


class PaymentStatusEnum(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"


# 1. USERS MODEL
class User(Base):
    __tablename__ = "users"

    user_id = Column(String(25), primary_key=True, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    user_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone_number = Column(String(25), nullable=True)
    user_type = Column(SQLEnum(UserAccessEnum), server_default="student")
    created_at = Column(TIMESTAMP(timezone=True),
                        server_default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.current_timestamp(
    ), onupdate=func.current_timestamp())


# 2. PROGRAMS MODEL
class Program(Base):
    __tablename__ = "programs"

    course_id = Column(String(25), primary_key=True, index=True)
    course_name = Column(String(100), nullable=False)
    academic_year = Column(String(25), nullable=False)
    is_active = Column(Boolean, server_default="true")


# 3. APPLICATIONS MODEL
class Application(Base):
    __tablename__ = "applications"

    application_id = Column(String(25), primary_key=True, index=True)
    user_id = Column(String(25), ForeignKey(
        "users.user_id", ondelete="CASCADE"), nullable=False)
    course_id = Column(String(25), ForeignKey(
        "programs.course_id", ondelete="RESTRICT"), nullable=False)
    status = Column(SQLEnum(ApplicationStatusEnum), server_default="draft")
    created_at = Column(TIMESTAMP(timezone=True),
                        server_default=func.current_timestamp())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.current_timestamp(
    ), onupdate=func.current_timestamp())

    # Add relationships for easy querying
    program = relationship("Program")
    documents = relationship(
        "Document", backref="application", cascade="all, delete")
    payments = relationship(
        "Payment", backref="application", cascade="all, delete")


# 4. DOCUMENTS MODEL
class Document(Base):
    __tablename__ = "documents"

    document_id = Column(String(25), primary_key=True, index=True)
    application_id = Column(String(25), ForeignKey(
        "applications.application_id", ondelete="CASCADE"), nullable=False)
    document_type = Column(String(100), nullable=False)
    file_path = Column(String(255), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(100), nullable=False)


# 5. PAYMENTS MODEL
class Payment(Base):
    __tablename__ = "payments"

    payment_id = Column(String(25), primary_key=True, index=True)
    application_id = Column(String(25), ForeignKey(
        "applications.application_id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False, default=500.00)
    payment_method = Column(SQLEnum(PaymentMethodEnum), nullable=False)
    reference_number = Column(String(100), nullable=False)
    status = Column(SQLEnum(PaymentStatusEnum), server_default="completed")
    paid_at = Column(TIMESTAMP(timezone=True),
                     server_default=func.current_timestamp())
