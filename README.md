# Payment Reconciliation Engine

**Enterprise-grade payment reconciliation engine built with Node.js, PostgreSQL, and AWS. Handles idempotency, double-entry ledger, discrepancy detection, and asynchronous processing for payment systems at scale.**

---

## Table of Contents
- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [AWS Integration](#aws-integration)
- [Project Showcase](#-project-showcase)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Testing AWS Integration](#testing-aws-integration)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Real-Time Reconciliation:** Detects and resolves inconsistencies across payment transactions instantly.
- **Idempotency Handling:** Ensures repeat operations (e.g., webhook retries) do not create duplicates using Redis cache.
- **Double-Entry Ledger:** Follows best practices for accounting and transaction auditing.
- **Discrepancy Detection:** Flags missing, mismatched, or erroneous transactions.
- **Asynchronous Processing:** AWS SQS integration for distributed, scalable transaction processing.
- **Cloud-Native Design:** Built for AWS with monitoring, health checks, and readiness probes.
- **Docker Support:** Rapid local deployment and isolation using Docker & Docker Compose.
- **Configurable Schema:** Tweak the core accounting and transaction schema to fit enterprise needs.

---

## Architecture Overview

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
            ┌─────────────────────┐
            │ Background Workers  │
            │ (Processing messages)│
            └─────────┬───────────┘
                      │
                      ▼
              ┌──────────────────┐
              │ PostgreSQL DB    │
              │ - Transactions   │
              │ - Ledger entries │
              │ - Audit trail    │
              └──────────────────┘
```

### Components

| Component | Purpose | AWS Service |
|-----------|---------|------------|
| **API Server** | Handles HTTP requests, validates input, manages auth | Application |
| **SQS Queue** | Async transaction processing, decouples API from workers | AWS SQS (FIFO) |
| **Redis Cache** | Idempotency key storage, fast duplicate detection | ElastiCache/local |
| **PostgreSQL** | Primary database for ledger, transactions, audit logs | RDS/local |
| **Background Workers** | Processes SQS messages, updates database | Lambda/EC2 |
| **CloudWatch** | Monitoring, logging, metrics | AWS CloudWatch |

---

## AWS Integration

### Why AWS?

This implementation demonstrates **production-grade architecture** solving real challenges:

| Challenge | AWS Solution | Benefit |
|-----------|--------------|---------|
| **API Response Time** | SQS async processing | Return 202 immediately, process in background |
| **Duplicate Prevention** | Redis + idempotency keys | Handles webhook retries safely |
| **Scalability** | Decoupled services + queues | Add workers without touching API |
| **Reliability** | FIFO SQS + DLQ | Messages processed exactly-once |
| **Visibility** | CloudWatch metrics | Monitor queue depth, latency, errors |

### Key Endpoints

#### Transaction Processing (Async via SQS)
```bash
# 1. Submit transaction (returns immediately with 202)
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "Authorization: Bearer demo-token-for-testing" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": {
      "source_account_id": "account-123",
      "destination_account_id": "account-456",
      "amount": 100.00
    },
    "idempotencyKey": "unique-key-12345"
  }'

# Response: 202 ACCEPTED
{
  "status": "ACCEPTED",
  "idempotencyKey": "unique-key-12345",
  "messageId": "msg-id-xyz",
  "pollUrl": "/api/v1/transactions/status/unique-key-12345",
  "expiresAt": "2026-01-09T23:13:00.000Z"
}

# 2. Poll for completion
curl http://localhost:3000/api/v1/transactions/status/unique-key-12345 \
  -H "Authorization: Bearer demo-token-for-testing"

# Response: Processing...
{ "status": "PROCESSING", "idempotencyKey": "unique-key-12345" }

# Response: Complete
{
  "status": "COMPLETED",
  "result": {
    "id": 1,
    "source_account_id": "account-123",
    "destination_account_id": "account-456",
    "amount": 100.00,
    "status": "COMPLETED",
    "created_at": "2026-01-09T02:13:00.000Z"
  }
}
```

#### Queue Monitoring
```bash
# Check SQS queue stats
curl http://localhost:3000/api/v1/queue/stats \
  -H "Authorization: Bearer demo-token-for-testing"

# Response
{
  "queueUrl": "https://sqs.us-east-1.amazonaws.com/account/queue.fifo",
  "messageCount": 5,
  "inFlightCount": 2,
  "visibilityTimeout": 60,
  "isFifo": true,
  "contentDeduplication": true,
  "timestamp": "2026-01-09T02:13:00.000Z"
}
```

#### Idempotency & Cache
```bash
# Check cache stats
curl http://localhost:3000/api/v1/cache/stats \
  -H "Authorization: Bearer demo-token-for-testing"

# Response
{
  "connected": true,
  "totalKeys": 10,
  "prefix": "idempotency:",
  "defaultTtl": 86400,
  "memoryUsage": "2.5K",
  "timestamp": "2026-01-09T02:13:00.000Z"
}
```

#### Health & Readiness Checks
```bash
# Liveness probe
curl http://localhost:3000/api/v1/health

# Readiness probe (checks all dependencies)
curl http://localhost:3000/api/v1/ready

# Response
{
  "status": "READY",
  "components": {
    "database": "ready",
    "cache": "ready",
    "queue": "ready"
  }
}
```

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

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)
- [PostgreSQL](https://www.postgresql.org/) (can use with Docker)
- AWS credentials (for production AWS setup) or local mock (for development)

### Installation

1. **Clone the repository:**
    ```bash
    git clone https://github.com/GeroJun/payment-reconciliation-engine.git
    cd payment-reconciliation-engine
    ```

2. **Set up your environment:**
    ```bash
    cp .env.example .env
    # Edit .env to configure:
    # - Database connection
    # - AWS SQS queue URL
    # - Redis connection
    # - Node environment
    ```

3. **Run with Docker Compose (Recommended):**
    ```bash
    docker-compose up --build
    ```
    - Boots Node.js app, PostgreSQL, and Redis
    - Initializes schema using `init.sql`
    - All services ready in ~30 seconds

4. **Run locally (Alternative):**
    ```bash
    npm install
    npm run start
    ```
    - Requires PostgreSQL and Redis running separately
    - Set environment variables in `.env`

---

## Usage

### Basic Workflow

1. **Submit Transactions:**
   ```bash
   curl -X POST http://localhost:3000/api/v1/transactions \
     -H "Authorization: Bearer demo-token-for-testing" \
     -H "Content-Type: application/json" \
     -d '{ "transaction": {...}, "idempotencyKey": "..." }'
   ```

2. **Poll for Completion:**
   ```bash
   curl http://localhost:3000/api/v1/transactions/status/:idempotencyKey \
     -H "Authorization: Bearer demo-token-for-testing"
   ```

3. **Check Account Balance:**
   ```bash
   curl http://localhost:3000/api/v1/accounts/:accountId/balance \
     -H "Authorization: Bearer demo-token-for-testing"
   ```

4. **Run Reconciliation:**
   ```bash
   curl -X POST http://localhost:3000/api/v1/accounts/:accountId/reconcile \
     -H "Authorization: Bearer demo-token-for-testing" \
     -H "Content-Type: application/json" \
     -d '{ "startDate": "2026-01-01", "endDate": "2026-01-31" }'
   ```

5. **Monitor System Health:**
   ```bash
   curl http://localhost:3000/api/v1/ready \
     -H "Authorization: Bearer demo-token-for-testing"
   ```

---

## Project Structure

```
.
├── src/
│   ├── controllers/           # Route/controller logic
│   ├── services/
│   │   ├── transactionProcessor.js      # Core transaction logic
│   │   ├── reconciliationService.js     # Reconciliation engine
│   │   ├── ledgerManager.js             # Double-entry ledger
│   │   ├── sqsProducer.js               # SQS queue integration
│   │   └── idempotencyCache.js          # Redis cache layer
│   ├── routes/
│   │   └── routes.js                    # Express route definitions
│   └── utils/
│       ├── validation.js     # Input validation
│       ├── auth.js           # Auth middleware
│       └── logger.js         # Structured logging
├── init.sql                  # PostgreSQL schema & migrations
├── Dockerfile                # Node.js app container
├── docker-compose.yml        # Orchestrates app + DB + Redis
├── package.json              # Dependencies & scripts
├── .env.example              # Environment variables template
└── README.md                 # This file
```

---

## Testing AWS Integration

### Quick Test (3 minutes)

```bash
# 1. Check health
curl http://localhost:3000/api/v1/health \
  -H "Authorization: Bearer demo-token-for-testing"

# 2. Check queue before transaction
curl http://localhost:3000/api/v1/queue/stats \
  -H "Authorization: Bearer demo-token-for-testing"

# 3. Create transaction (goes to SQS)
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "Authorization: Bearer demo-token-for-testing" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": {
      "source_account_id": "account-123",
      "destination_account_id": "account-456",
      "amount": 100.00
    },
    "idempotencyKey": "test-'$(date +%s)'"
  }'

# 4. Check queue after transaction (message count increased)
curl http://localhost:3000/api/v1/queue/stats \
  -H "Authorization: Bearer demo-token-for-testing"

# 5. Test idempotency (send same transaction twice)
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "Authorization: Bearer demo-token-for-testing" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": {
      "source_account_id": "account-111",
      "destination_account_id": "account-222",
      "amount": 50.00
    },
    "idempotencyKey": "idempotent-test-001"
  }'

# 6. Duplicate request (returns cached result, NOT a new message)
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "Authorization: Bearer demo-token-for-testing" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": {
      "source_account_id": "account-111",
      "destination_account_id": "account-222",
      "amount": 50.00
    },
    "idempotencyKey": "idempotent-test-001"
  }'
```

### Automated Test Script

```bash
chmod +x test-aws.sh
./test-aws.sh
```

See `test-aws.sh` in repo for full testing suite.

---

## Key Architectural Decisions

### 1. **Async Processing with SQS**
- **Why:** Decouples API from workers, enables horizontal scaling
- **How:** POST to `/transactions` publishes to SQS, returns 202 immediately
- **Benefit:** API response time ~50ms regardless of processing time

### 2. **Idempotency with Redis Cache**
- **Why:** Webhook retries must not create duplicate transactions
- **How:** Check cache before processing, store result with TTL
- **Benefit:** Prevents duplicate charges, returns result in <1ms

### 3. **Double-Entry Ledger**
- **Why:** Accounting standard ensures data integrity and auditability
- **How:** Every transaction creates two ledger entries (debit/credit)
- **Benefit:** Balance always equals sum of ledger entries

### 4. **Health & Readiness Checks**
- **Why:** Kubernetes/container orchestration needs dependency verification
- **How:** `/api/v1/health` (liveness) and `/api/v1/ready` (readiness)
- **Benefit:** Ensures pod only receives traffic when all dependencies ready

### 5. **FIFO SQS Queue**
- **Why:** Guarantees order and exactly-once processing
- **How:** AWS SQS FIFO with content-based deduplication
- **Benefit:** No race conditions, guaranteed consistency

---

## Production Deployment

### Deploy to AWS

```bash
# 1. Create SQS queue
aws sqs create-queue \
  --queue-name payment-transactions.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=true \
  --region us-east-1

# 2. Create RDS PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier payment-reconciliation-db \
  --engine postgres \
  --db-instance-class db.t3.micro

# 3. Create ElastiCache Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id payment-cache \
  --engine redis \
  --cache-node-type cache.t3.micro

# 4. Deploy app to ECS/EKS
# (See deployment guides for your preferred orchestration platform)
```

---

## Contributing

1. Fork this repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/your-feature-name`
5. Submit a pull request for review

---

## License

Distributed under the MIT License. See `LICENSE` for details.

---

## About This Project

This payment reconciliation engine demonstrates **production-ready architecture** solving critical challenges in distributed systems:

- ✅ **AWS Services:** SQS, RDS, ElastiCache, CloudWatch
- ✅ **Asynchronous Processing:** Async/await, message queues, background workers
- ✅ **High Reliability:** Idempotency, exactly-once semantics, double-entry ledger
- ✅ **Observability:** Health checks, monitoring, structured logging
- ✅ **Scalability:** Decoupled services, horizontal scaling, load distribution

Built as a portfolio project demonstrating expertise in backend systems, distributed architecture, and cloud-native design patterns.
