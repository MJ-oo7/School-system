from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# ⚠️ REPLACE THESE WITH YOUR ACTUAL POSTGRESQL CREDENTIALS & DB NAME
DATABASE_URL = "postgresql://postgres:9116969@localhost:5432/school_system"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- TEST BLOCK ---
if __name__ == "__main__":
    try:
        # Test 1: Check engine connection
        with engine.connect() as connection:
            result = connection.execute(text("SELECT version();"))
            db_version = result.scalar()
            print("Successfully connected to PostgreSQL!")
            print(f"Database Version: {db_version}")

        # Test 2: Check SessionLocal generator (`get_db`)
        db_gen = get_db()
        session = next(db_gen)
        print("SQLAlchemy session generator works correctly!")
        session.close()

    except Exception as e:
        print("Connection failed!")
        print(f"Error: {e}")
