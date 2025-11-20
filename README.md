# Payment Reconciliation Engine

**Real-time payment reconciliation engine built with Node.js & PostgreSQL. Handles idempotency, double-entry ledger, and discrepancy detection for payment systems.**

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

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
