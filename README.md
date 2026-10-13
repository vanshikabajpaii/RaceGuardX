# RaceGuardX

> **"Every Request. Every Seat. Under Control."**

RaceGuardX is a full-stack, database-backed course registration platform and operating systems concurrency demonstration system. It pairs an enterprise-grade transactional registration engine with an interactive OS Concurrency Lab.

---

## Key Features

### 1. Database-Enforced Seat Allocation & Zero Overbooking
- Seat limits and registrations are enforced directly at the database engine level using PostgreSQL row-level locks (`SELECT ... FOR UPDATE`), check constraints (`CHECK (enrolled_count <= capacity)`), and conditional unique indexes.
- Guaranteed zero overbooking under hundreds of simultaneous requests competing for the last seat.

### 2. Neutral FIFO Waitlisting & Atomic Promotion
- When a course reaches maximum capacity, incoming eligible students are enqueued onto a neutral FIFO waitlist with an explicit order position (`#1`, `#2`, ...).
- When a registered student cancels their enrollment, a database transaction automatically promotes the head of the waitlist to active registration and adjusts remaining queue positions.

### 3. Request Idempotency & Debouncing
- Every registration operation is bound to a unique `client_request_id`, user identity, and course.
- Repeated clicks and retried requests return the cached outcome without generating duplicate registrations or corrupting counters.

### 4. Student Privacy & Multi-Tenant Isolation
- Students log in using their unique Student ID and secure password.
- Each student accesses solely their own course enrollments, waitlist positions, and request audit logs.

### 5. Administrative Monitoring & Course Controls
- Live course creation modal with input validation and instant appearance in the student portal.
- Capacity decrease safeguards: administrators are prevented from lowering course capacity below existing active student registrations.
- Comprehensive search and filtering by course code, student ID, request ID, and registration status.

### 6. Interactive OS Concurrency Lab
- Sandboxed demonstration suite comparing synchronization paradigms:
  1. **Unsafe Mode**: Demonstrates "Check-Then-Act" race conditions and lost updates without locks, showing overbooking anomalies.
  2. **Global Mutex**: Demonstrates coarse-grained process-level serialization.
  3. **Fine-Grained DB Row Locking**: Demonstrates production-grade horizontal serialization using PostgreSQL row locks.
  4. **Failure Injection & Rollback**: Demonstrates atomic transaction rollback with zero seat leakage upon simulated failure.
- Concurrency experiments run on dedicated simulation tables (`simulation_courses`, `simulation_registrations`), guaranteeing complete isolation from genuine student registration data.

---

## Seed Accounts

| Name | Role | Student ID / Email |
| :--- | :--- | :--- |
| **VANSHIKA** | STUDENT | `620` / `vanshika620@raceguardx.edu` |
| **KHYATI** | STUDENT | `622` / `khyati622@raceguardx.edu` |
| **PALLAVI** | STUDENT | `649` / `pallavi649@raceguardx.edu` |
| **System Administrator** | ADMIN | `admin@raceguardx.edu` |

*(Default development passwords and instructions are documented in [SETUP.md](file:///c:/Users/vansh/OneDrive/Desktop/RaceGuardX/SETUP.md).)*

---

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide React icons
- **Backend:** Node.js, Express, `pg`, `bcryptjs`, `jsonwebtoken`
- **Database:** PostgreSQL / Supabase (with embedded zero-setup PostgreSQL WASM engine for local development)

---

## Quick Start Commands

```bash
# Start backend server (port 5000):
npm run server

# Start frontend client (port 5173):
npm run client
# (or: cd client && npm run dev)

# Run automated concurrency tests:
npm run test:concurrency
```
