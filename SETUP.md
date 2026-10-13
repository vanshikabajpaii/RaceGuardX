# RaceGuardX — Setup & Configuration Guide

> **Tagline:** *"Every Request. Every Seat. Under Control."*

---

## 1. Quick Start

### Step 1: Install Dependencies
From the repository root:
```bash
# In the server folder:
cd server
npm install

# In the client folder:
cd ../client
npm install
```

### Step 2: Configure Environment Variables
Copy the template file `.env.example` in the project root to `.env`:
```bash
cp .env.example .env
```

Key environment settings:
```ini
# Server Port
PORT=5000

# Database Configuration (PostgreSQL / Supabase)
# If left empty, RaceGuardX automatically initializes persistent PostgreSQL WASM (PGlite) locally!
# To connect to Supabase, provide your Supabase PostgreSQL connection string:
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# Security & Session Secret
JWT_SECRET=raceguardx_production_jwt_secret_change_me_in_env

# Initial Seed Credentials (used by seed.js)
SEED_STUDENT_PASSWORD=Student@Pass123
SEED_ADMIN_PASSWORD=Admin@SecurePass123
```

---

## 2. Database Migration & Account Seeding

### Execute Schema Migration
Run the idempotent schema migration script:
```bash
npm --prefix server run migrate
```
This applies all 7 tables, check constraints, and unique active registration indexes defined in `server/schema.sql`.

### Seed Demo Accounts
Run the safe, repeatable seed script:
```bash
npm --prefix server run seed
```

This creates the four initial development accounts if they do not already exist:
* **VANSHIKA** — Student ID: `620` (Email: `vanshika620@raceguardx.edu`)
* **KHYATI** — Student ID: `622` (Email: `khyati622@raceguardx.edu`)
* **PALLAVI** — Student ID: `649` (Email: `pallavi649@raceguardx.edu`)
* **System Administrator** — Role: `ADMIN` (Email: `admin@raceguardx.edu`)

> **Security Guarantee:** Running `npm run seed` repeatedly is strictly idempotent. It never duplicates accounts, never overwrites student registrations, and never resets existing passwords.

---

## 3. Running the Application

### Start the Backend Server:
```bash
cd server
npm start
# Server listens on http://localhost:5000
```

### Start the Frontend Client:
```bash
# Option A: From root directory
npm run client

# Option B: Directly inside client folder
cd client
npm run dev
# (or: npm start)
# Frontend runs on http://localhost:5173
```

---

## 4. Running Automated Concurrency Tests

To execute the automated concurrency test suite verifying zero overbooking, idempotency, FIFO waitlist promotion, and transaction rollback:
```bash
npm --prefix server run test:concurrency
```

All 4 test cases will execute:
1. **10 simultaneous requests competing for the last seat**: Confirms that active registrations never exceed capacity and remaining students are placed on the FIFO waitlist in order.
2. **Duplicate request retry idempotency**: Confirms request IDs prevent duplicate registrations on rapid repeated clicks.
3. **Registration cancellation & automatic promotion**: Confirms that cancelling a seat atomically promotes the earliest student from the waitlist.
4. **Controlled failure injection with rollback**: Confirms that an error mid-transaction rolls back partial writes without seat leaks.
