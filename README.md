# Payment Reconciliation Engine

A Node.js backend project built to understand payment systems, distributed architecture, and AWS services. This system demonstrates core concepts like async processing, idempotency, and double-entry ledgers — patterns used in production payment systems.

## What I Built

- RESTful API for transaction processing
- Double-entry ledger for financial accuracy
- Redis-based idempotency handling
- AWS SQS integration for async processing
- PostgreSQL for persistent storage

## What I Learned

- How distributed systems handle failures
- Why idempotency matters for financial systems
- The tradeoffs between sync vs async APIs
- How to design APIs that handle retries safely

---

## Why I Built This

While learning about payment systems in my Systems Design course, I realized most tutorials skip the hard problems:

- **What happens if a webhook is retried?** Users get charged twice (bad)
- **How do you know if account balances are correct?** You need an audit trail
- **Why does the API return immediately if processing takes 5 seconds?** Because users shouldn't wait

This project explores those questions.

---

## Features

- **Real-Time Reconciliation:** Detects and resolves inconsistencies across payment transactions
- **Idempotency Handling:** Ensures repeat operations (e.g., webhook retries) don't create duplicates using Redis cache
- **Double-Entry Ledger:** Follows accounting best practices — every transaction creates two entries (debit + credit)
- **Async Processing:** AWS SQS for scalable, background transaction processing
- **Health Checks:** Readiness/liveness probes for Kubernetes-style orchestration
- **Docker Support:** Local deployment with Docker Compose

---

## Architecture

### High-Level Design

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP Request
       ▼
┌──────────────────────────────────┐
│  Express API Server (Port 3000)  │
│  - Route handlers                │
│  - Auth middleware               │
│  - Input validation              │
└──────┬──────────────┬────────────┘
       │              │
       │ Cache check  │ Async publish
       ▼              ▼
   ┌────────┐    ┌──────────┐
   │ Redis  │    │ AWS SQS  │
   │ Cache  │    │ (FIFO)   │
   └────────┘    └────┬─────┘
                      │
                      ▼
            ┌──────────────────────┐
            │ Background Workers   │
            │ (Processing messages)│
            └─────────┬────────────┘
                      │
                      ▼
              ┌──────────────────┐
              │ PostgreSQL DB    │
              │ - Transactions   │
              │ - Ledger entries │
              │ - Audit trail    │
              └──────────────────┘
```

### Key Design Decisions

**1. Async Processing with SQS**

*The Problem:* Processing transactions takes time. API shouldn't block waiting.

*My Solution:* Return 202 ACCEPTED immediately. Publish message to SQS. Workers process in background.

*Tradeoff:* Client needs to poll for status (more complex), but API responds in ~50ms regardless.

```bash
# Client: Submit transaction, get polling URL immediately
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "Authorization: Bearer demo-token" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": {
      "source_account_id": "account-123",
      "destination_account_id": "account-456",
      "amount": 100.00
    },
    "idempotencyKey": "unique-key-12345"
  }'

# Response: 202 ACCEPTED (immediate)
{
  "status": "ACCEPTED",
  "idempotencyKey": "unique-key-12345",
  "messageId": "msg-id-xyz",
  "pollUrl": "/api/v1/transactions/status/unique-key-12345"
}

# Client: Poll for completion
curl http://localhost:3000/api/v1/transactions/status/unique-key-12345 \
  -H "Authorization: Bearer demo-token"

# Response: PROCESSING or COMPLETED
```

**2. Idempotency with Redis Cache**

*The Problem:* Payment providers retry webhooks. Without idempotency, you charge users twice (catastrophic).

*My Solution:* Cache transaction results by idempotency key. Return cached result for duplicates.

*Why it matters:* Banks have solved this for 500 years. It's critical for financial systems.

```bash
# Request 1: New transaction
{
  "transaction": {...},
  "idempotencyKey": "tx-001"
}
# Response: 202 ACCEPTED (processed)

# Request 2: Same idempotencyKey (duplicate)
{
  "transaction": {...},
  "idempotencyKey": "tx-001"
}
# Response: 200 OK (returns cached result, NOT a new message)
```

**3. Double-Entry Ledger**

*The Problem:* How do you verify $100 transferred correctly? How do you catch errors?

*My Solution:* Every transaction creates two ledger entries:
- Debit source account: -$100
- Credit destination account: +$100

Then: `Balance = Sum of all ledger entries`

If balance doesn't match, you know something's wrong.

**4. Health & Readiness Probes**

*The Problem:* Kubernetes needs to know when your app is actually ready to handle traffic.

*My Solution:* 
- `/api/v1/health` — Simple "are you running?" check
- `/api/v1/ready` — Complex check: database + cache + queue all working?

---

## 📸 Project Showcase

### Server Running & Health Check
<img width="823" height="638" alt="Health check endpoint confirms server and all dependencies are ready" src="https://github.com/user-attachments/assets/dee0b5f1-ed22-4e0e-8fbb-e9c8541160f2" />

*The `/api/v1/ready` endpoint verifies database, cache, and SQS queue connectivity*

### Create Transaction (Async via SQS)
<img width="853" height="771" alt="POST /transactions returns 202 ACCEPTED with polling URL" src="https://github.com/user-attachments/assets/4199ac93-66ca-416a-8366-68c0a758c0ca" />

*Transaction submitted to SQS queue. API returns immediately with polling URL. Workers process in background.*

### Idempotency Test
<img width="825" height="775" alt="Duplicate request with same idempotencyKey returns cached result" src="https://github.com/user-attachments/assets/12369215-6497-4ab8-bc01-fe0edcf1c0c3" />

*Duplicate request detected via Redis cache. Prevents duplicate charges on webhook retries.*

### Get Account Balance
<img width="837" height="344" alt="GET /accounts/:id/balance returns current balance after processing" src="https://github.com/user-attachments/assets/f840c5df-4995-480c-9aca-11f13c7d0675" />

*Account balance calculated from double-entry ledger after all transactions processed.*

### Get Ledger History
<img width="907" height="848" alt="GET /accounts/:id/ledger returns paginated transaction history" src="https://github.com/user-attachments/assets/d9e32245-66e3-45b0-ba3e-a8bba24470f1" />

*Full audit trail of all account transactions with pagination support.*

---

## Getting Started

### Prerequisites

- Node.js v18+
- Docker & Docker Compose
- PostgreSQL (included in Docker Compose)

### Local Setup

```bash
# Clone repo
git clone https://github.com/GeroJun/payment-reconciliation-engine.git
cd payment-reconciliation-engine

# Copy environment template
cp .env.example .env

# Start with Docker Compose
docker-compose up --build

# Or run locally
npm install
npm run start
```

---

## API Endpoints

### Transactions

- `POST /api/v1/transactions` — Submit transaction async
- `GET /api/v1/transactions/status/:idempotencyKey` — Poll for completion
- `POST /api/v1/transactions/:id/refund` — Process refund

### Accounts

- `GET /api/v1/accounts/:accountId/balance` — Get current balance
- `GET /api/v1/accounts/:accountId/ledger` — Get transaction history
- `GET /api/v1/accounts/:accountId/audit-trail` — Get audit log

### Reconciliation

- `POST /api/v1/accounts/:accountId/reconcile` — Trigger reconciliation
- `GET /api/v1/accounts/:accountId/reconciliation-history` — Get past reconciliations
- `GET /api/v1/accounts/:accountId/reconciliation-difference` — Get balance differences

### Monitoring

- `GET /api/v1/queue/stats` — Check SQS queue depth
- `GET /api/v1/cache/stats` — Check Redis cache health
- `GET /api/v1/health` — Liveness probe
- `GET /api/v1/ready` — Readiness probe (checks all dependencies)

---

## Project Structure

```
.
├── src/
│   ├── controllers/              # Route handlers
│   ├── services/
│   │   ├── transactionProcessor.js      # Core transaction logic
│   │   ├── reconciliationService.js     # Reconciliation engine
│   │   ├── ledgerManager.js             # Double-entry ledger
│   │   ├── sqsProducer.js               # SQS integration
│   │   └── idempotencyCache.js          # Redis cache layer
│   ├── routes/
│   │   └── routes.js                    # Express route definitions
│   └── utils/
│       ├── validation.js     # Input validation
│       ├── auth.js           # Auth middleware
│       └── logger.js         # Structured logging
├── init.sql                  # PostgreSQL schema
├── Dockerfile                # Container config
├── docker-compose.yml        # Local dev setup
├── package.json              # Dependencies
└── README.md                 # This file
```

---

## What I Didn't Build (Yet)

These are areas for future learning:

- Full AWS integration (using local mocks for development)
- Production-grade error recovery and Dead Letter Queue handling
- Load testing and performance benchmarks
- Distributed tracing and advanced monitoring
- Message encryption and advanced security patterns

These would be natural next steps for understanding production systems at scale.

---

## Interview Talking Points

If you're curious about the design decisions:

**Async Processing:**
> "I chose async SQS processing because synchronous APIs create a bottleneck. If processing takes 5 seconds, every request waits 5 seconds. With SQS, the API responds in 50ms and workers process in the background. Tradeoff: client complexity."

**Idempotency:**
> "This prevents duplicate charges. If a payment provider retries a webhook with the same ID, we return the cached result instead of processing twice. It's why payment systems are reliable."

**Double-Entry Ledger:**
> "Every transaction creates two ledger entries (debit + credit). This makes it impossible to lose money — balance always equals sum of entries. It's how banks work."

**Health Checks:**
> "The `/api/v1/ready` endpoint checks database, cache, and queue. Kubernetes uses this to know when the app is safe to receive traffic. Without it, requests fail during startup."

---

## Contributing

Feel free to open issues or PRs if you find bugs or have ideas!

---

## License

MIT
