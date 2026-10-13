-- ========================================================
-- RaceGuardX Database Schema (PostgreSQL)
-- Tagline: "Every Request. Every Seat. Under Control."
-- ========================================================

-- 1. Users Table (Students & Administrators)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    student_id VARCHAR(32) UNIQUE,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('STUDENT', 'ADMIN')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Production Courses Table
CREATE TABLE IF NOT EXISTS courses (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    instructor VARCHAR(128) NOT NULL,
    description TEXT,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    enrolled_count INTEGER NOT NULL DEFAULT 0 CHECK (enrolled_count >= 0 AND enrolled_count <= capacity),
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'ARCHIVED')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Production Registrations Table
CREATE TABLE IF NOT EXISTS registrations (
    id VARCHAR(36) PRIMARY KEY,
    course_id VARCHAR(36) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL CHECK (status IN ('REGISTERED', 'WAITLISTED', 'CANCELLED')),
    waitlist_position INTEGER,
    request_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Unique index enforcing that a student can only have ONE active status ('REGISTERED' or 'WAITLISTED') per course
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_registration 
ON registrations (course_id, user_id) 
WHERE status IN ('REGISTERED', 'WAITLISTED');

-- Index on waitlist ordering
CREATE INDEX IF NOT EXISTS idx_registrations_waitlist 
ON registrations (course_id, waitlist_position) 
WHERE status = 'WAITLISTED';

-- 4. Idempotent Registration Requests Audit Table
CREATE TABLE IF NOT EXISTS registration_requests (
    id VARCHAR(36) PRIMARY KEY,
    request_id VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id VARCHAR(36) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    action VARCHAR(32) NOT NULL DEFAULT 'REGISTER',
    outcome VARCHAR(32) NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reg_requests_lookup 
ON registration_requests (request_id, user_id);

-- 5. Audit Event Log Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    course_id VARCHAR(36),
    user_id VARCHAR(36),
    action VARCHAR(64) NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_course 
ON audit_logs (course_id, created_at DESC);

-- ========================================================
-- 6. Dedicated Concurrency Lab Simulation Tables
-- (Isolated from production tables to guarantee real student data integrity)
-- ========================================================

CREATE TABLE IF NOT EXISTS simulation_courses (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    capacity INTEGER NOT NULL,
    enrolled_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS simulation_registrations (
    id VARCHAR(36) PRIMARY KEY,
    simulation_course_id VARCHAR(36) NOT NULL REFERENCES simulation_courses(id) ON DELETE CASCADE,
    simulated_user_id VARCHAR(64) NOT NULL,
    simulated_user_name VARCHAR(128) NOT NULL,
    mode VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
