# Jay Products

Jay Products is a web-based stock and inventory management system for a manufacturing workflow. It tracks master data, raw materials, product mix designs (BOMs), purchases, production, finished stock, sales, dispatches, payments, returns, reports, users, permissions, and audit history.

The project consists of a Node.js/Express API, a PostgreSQL database, and a static HTML/CSS/JavaScript frontend served by the same application.

## Features

- Dashboard with operational summaries and production-versus-sales data.
- Master data for products, raw materials, customers, suppliers, and product BOMs.
- Raw-material and finished-goods inventory, including stock movements.
- Purchases and purchase returns.
- Production batches, material consumption, and wastage tracking.
- Sales, sales returns, and dispatches.
- Customer and supplier payments.
- Stock, production, purchase, sales, and payment reports.
- JWT-based sign-in and password reset by email.
- Role and per-user permissions, with audit logging for tracked changes.

## Technology

| Area | Implementation |
| --- | --- |
| Runtime | Node.js |
| HTTP server | Express 5 |
| Database | PostgreSQL (`pg`) |
| Authentication | JSON Web Tokens (`jsonwebtoken`) |
| Password hashing | `bcryptjs` |
| Email | Nodemailer using SMTP |
| Client | Static HTML, CSS, and browser JavaScript |

## Project layout

```text
.
├── public/                 Static UI: pages, components, styles, scripts, and images
├── src/
│   ├── app.js              Express app, middleware, static serving, and API registration
│   ├── config/db.js        PostgreSQL connection pool
│   ├── controllers/        HTTP request and response handlers
│   ├── email/              Password-reset email template
│   ├── middleware/         JWT authentication and permission checks
│   ├── routes/             API route definitions
│   ├── services/           Database queries and business logic
│   ├── sql/schema.sql      Database schema, indexes, roles, and permissions seed data
│   └── sql/initializeDatabase.js
│                           Database creation and schema initialization script
├── server.js               Application entry point
├── package.json            Scripts and dependencies
└── .env.example            Required environment-variable template
```

## Prerequisites

- Node.js compatible with the dependencies in `package.json`.
- A running PostgreSQL server and an account permitted to create the target database when using `npm run db:setup`.
- SMTP credentials if password-reset email is required.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and provide real values:

   ```env
   PORT=5000

   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=rcc_stock_management
   DB_USER=postgres
   DB_PASSWORD=your_postgres_password

   JWT_SECRET=change_this_to_a_long_random_secret
   JWT_EXPIRES_IN=7d

   COMPANY_EMAIL=your_email_address
   COMPANY_PASS=your_app_code
   ```

   Keep `.env` private. It contains database, JWT, and email credentials.

3. Create the database and apply the schema:

   ```bash
   npm run db:setup
   ```

4. Start the application:

   ```bash
   npm start
   ```

   For development with automatic restarts:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:5000` (or the port configured in `PORT`). The health endpoint is available at `GET /api/health`.

## API overview

The API is served under `/api`. Authentication endpoints are under `/api/auth`; the application uses a bearer JWT in the `Authorization` header for protected endpoints.

| Area | Base endpoint |
| --- | --- |
| Authentication | `/api/auth` |
| Dashboard | `/api/dashboard` |
| Products and categories | `/api/products`, `/api/product-categories` |
| Raw materials and stock | `/api/raw-materials`, `/api/raw-material-stock` |
| BOMs | `/api/product-boms` |
| Suppliers and purchases | `/api/suppliers`, `/api/purchases`, `/api/purchase-returns` |
| Production and finished stock | `/api/production`, `/api/finished-stock` |
| Customers, sales, returns, dispatches | `/api/customers`, `/api/sales`, `/api/sales-returns`, `/api/dispatches` |
| Payments | `/api/payments` |
| Reports | `/api/stock-report`, `/api/production-report`, `/api/purchase-report`, `/api/sale-report`, `/api/reports/payments` |
| Administration | `/api/users`, `/api/authorizations`, `/api/audit-logs` |

Most resources provide list, detail, create, update, and delete operations. The route modules are the source of truth for the exact methods, request payloads, query parameters, and permission requirements.

## Data model

The schema models the business flow below:

```text
Suppliers → Purchases → Raw-material stock → Production/BOM → Finished stock
Customers ← Sales ← Finished stock
             ├─ Sales returns
             └─ Dispatches

Customers/Suppliers ↔ Payments
Users/Roles/Permissions → Authorized actions → Audit logs
```

`stock_movements` records inventory in/out activity for raw materials and products. The schema also defines indexes for common product, supplier, customer, date, and stock lookup paths.

## Authorization

- A successful sign-in issues a JWT containing the user identity and role.
- Protected routes first validate the bearer token.
- Administrators bypass individual permission checks.
- Other users require the applicable permission, which can be granted directly to the user.
- The schema seeds `admin` and `member` roles, plus module/action permissions. Admin is granted every seeded permission; member is granted seeded view permissions.

## Frontend routes

The frontend is served from `public/`. In addition to `/`, the server resolves a request such as `/products` to `public/products.html` when that file exists. The UI includes pages for login, password reset, operational modules, reports, user administration, and audit logs.

## Available npm scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Start the server with Node.js. |
| `npm run dev` | Start the server through Nodemon. |
| `npm run db:setup` | Create the configured PostgreSQL database if needed and execute `src/sql/schema.sql`. |
| `npm test` | Placeholder only; no automated test suite is currently configured. |

## Notes for maintainers

- The server uses `helmet`, CORS with credentials enabled, JSON and URL-encoded request parsing, and static file serving.
- Password-reset delivery is configured for the SMTP host in `src/services/emailService.js`; ensure the configured email account supports the supplied credentials.
- Keep database changes in `src/sql/schema.sql` so `npm run db:setup` remains representative of the required schema.
- There is no build step: browser assets in `public/` are served directly.
