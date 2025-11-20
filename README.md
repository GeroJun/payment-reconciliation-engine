# Payment Reconciliation Engine

**Real-time payment reconciliation engine built with Node.js & PostgreSQL. Handles idempotency, double-entry ledger, and discrepancy detection for payment systems.**

---

## Table of Contents
- Features
- Architecture Overview
- Project Showcase
- Getting Started
- Usage
- Project Structure
- Contributing
- License

---

## Features

- **Real-Time Reconciliation:** Detects and resolves inconsistencies across payment transactions instantly.
- **Idempotency Handling:** Ensures repeat operations (e.g., webhook retries) do not create duplicates.
- **Double-Entry Ledger:** Follows best practices for accounting and transaction auditing.
- **Discrepancy Detection:** Flags missing, mismatched, or erroneous transactions.
- **Docker Support:** Rapid local deployment and isolation using Docker & Docker Compose.
- **Configurable Schema:** Tweak the core accounting and transaction schema to fit enterprise needs.

---

## Architecture Overview

- **Backend:** Node.js application with modular services and controllers.
- **Database:** PostgreSQL with initialization scripts (`init.sql`) for ledgers and reconciliation tables.
- **APIs:** RESTful routes for ingestion and reconciliation triggers.
- **Containerization:** Isolated, reproducible development and test environments via Docker.

---

## 📸 Project Showcase

### Server Running
<img width="823" height="638" alt="image" src="https://github.com/user-attachments/assets/dee0b5f1-ed22-4e0e-8fbb-e9c8541160f2" />

*The health check working confirms your server is running*

### Create new transaction
<img width="853" height="771" alt="image" src="https://github.com/user-attachments/assets/4199ac93-66ca-416a-8366-68c0a758c0ca" />

*Created a new transaction based on all the required IDs to ensure security*

### Test Idempotency
<img width="825" height="775" alt="image" src="https://github.com/user-attachments/assets/12369215-6497-4ab8-bc01-fe0edcf1c0c3" />

*Idempotency key matching, it detects if there are duplicates.*

### Get Account Balance
<img width="837" height="344" alt="image" src="https://github.com/user-attachments/assets/f840c5df-4995-480c-9aca-11f13c7d0675" />

*Check the current balance of an account after processing transactions.*

### Get Ledger History
<img width="907" height="848" alt="image" src="https://github.com/user-attachments/assets/d9e32245-66e3-45b0-ba3e-a8bba24470f1" />

*Retrieve the transaction history for an account.*

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)
- [PostgreSQL](https://www.postgresql.org/) (can use with Docker)

### Installation

1. **Clone the repository:**
    ```bash
    git clone https://github.com/GeroJun/payment-reconciliation-engine.git
    cd payment-reconciliation-engine
    ```

2. **Set up your environment:**
   - Edit `.env` file to configure database connection and other settings as needed.

3. **Run with Docker Compose:**
    ```bash
    docker-compose up --build
    ```
   - Boots both Node.js app and PostgreSQL database.
   - Initializes schema using `init.sql`.

   **OR run locally:**
    ```bash
    npm install
    npm run start
    ```
   - PostgreSQL must be running and credentials set in your environment.

---

## Usage

- **Add Transactions:** Call the relevant REST API endpoints to insert or modify payment and transfer records.
- **Run Reconciliation:** Trigger the reconciliation logic to check for discrepancies and view flagged records.
- **Ledger Validation:** Use double-entry logs to verify account balances and correct mismatches.
- **Customization:** Modify `init.sql` and code in `/src` for advanced business logic, custom transaction types, or external ingestion.

---

## Project Structure

```
.
├── src/                # Application source code
│   ├── controllers/    # Route/controller logic
│   ├── services/       # Core reconciliation and processing logic
│   └── utils/          # Utility helpers
├── init.sql            # PostgreSQL schema/init script
├── Dockerfile          # Node.js app container
├── docker-compose.yml  # Orchestrates app + PostgreSQL
├── package.json        # Dependencies and NPM scripts
├── .env                # Environment variables (example template)
└── README.md           # Project documentation
```

---

## Contributing

1. Fork this repository.
2. Create a feature branch:  
    ```bash
    git checkout -b feature/your-feature-name
    ```
3. Commit your changes & push:
    ```bash
    git commit -am 'Add new feature'
    git push origin feature/your-feature-name
    ```
4. Submit a pull request for review.

---

## License

Distributed under the MIT License. See `LICENSE` for details.
