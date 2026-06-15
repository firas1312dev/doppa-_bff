# Gympify Multi-Tenant SaaS Mobile BFF

A production-ready, highly scalable **Mobile Backend for Frontend (BFF)** built with **NestJS** and **TypeORM**. It is designed for a multi-tenant Gym Management SaaS platform using a **database-per-tenant** architecture to enforce strict tenant isolation.

---

## 🚀 Key Features

*   **Database-per-Tenant Isolation**: Each gym tenant operates on its own dedicated, dynamically resolved database.
*   **Lazy-Loaded Connection Pooling**: A smart connection manager lazy-loads, caches, and automatically evicts idle TypeORM database connections (15 mins timeout) to prevent connection leaks.
*   **Dynamic Tenant Resolver**: Resolves tenant contexts dynamically from incoming requests using:
    1.  Subdomains (e.g., `alpha.gympify.com`)
    2.  Custom headers (e.g., `X-Tenant-ID: alpha`)
    3.  Claims embedded in authenticated JWT payloads
*   **Mobile BFF Dashboard Aggregator**: Executes concurrent queries (`Promise.all`) across memberships, subscriptions, payments, attendance, and notifications, compiling a lightweight dashboard payload in-memory.
*   **Centralized Analytical Synchronizer**: Implements event-driven publishing using NestJS `EventEmitter2`. Aggregated metrics are synchronized to the central registry database (`gympify_central`) without querying tenant databases directly.
*   **Secure Authentication & Role-Based Access Control**: Implements JWT passport strategies and RBAC guards supporting `Member`, `Trainer`, `Manager`, and `Admin` roles. Includes built-in protection against cross-tenant attacks.
*   **Enterprise Middleware**: Centralized error filters, request validation pipes, audit logging trackers, and global rate-limiting.

---

## 📂 Project Structure

```
src/
├── common/                  # Shared decorators, guards, filters, and middlewares
│   ├── decorators/          # @Tenant(), @ActiveUser(), @Roles()
│   ├── filters/             # CentralizedExceptionFilter
│   ├── guards/              # JwtAuthGuard, RolesGuard
│   └── middleware/          # TenantResolverMiddleware, AuditLoggerMiddleware
├── database/                # Connection manager and dynamic connection providers
│   ├── database.module.ts
│   ├── tenant-connection.manager.ts
│   └── tenant-entities.ts
├── modules/                 # Functional Domain Modules
│   ├── auth/                # JWT Auth & Registration
│   ├── tenant/              # Dynamic SaaS Tenant Onboarding (Central DB)
│   ├── profile/             # User Profiles (Tenant DB)
│   ├── membership/          # Memberships (Tenant DB)
│   ├── subscription/        # Subscriptions & Billing (Tenant DB)
│   ├── payment/             # Payments (Tenant DB)
│   ├── attendance/          # Attendance & Check-ins (Tenant DB)
│   ├── class/               # Workout Schedules & Bookings (Tenant DB)
│   ├── notification/        # Message Delivery (Tenant DB)
│   ├── analytics/           # Central Aggregated Analytics (Central DB)
│   └── mobile-bff/          # Mobile Dashboard API Gateway Aggregator
├── app.module.ts            # Root module registering global filters and middlewares
└── main.ts                  # App bootstrap entry point
```

---

## 🛠️ Local Execution (Without Docker)

Follow these steps to run the BFF application locally:

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create or modify the [.env](file:///c:/Users/LENOVO/gympify-mobile-bff/.env) file in the root directory:
```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=yourpassword
DB_CENTRAL_NAME=gympify_central
JWT_SECRET=super-secret-jwt-key-2026
JWT_EXPIRATION=24h
```

### 3. Provision Local Databases
Make sure MySQL is running locally on your configured port, then run the dynamic setup and database seeding script:
```bash
npm run db:setup
```
This script provisions the `gympify_central` registry and two sample tenant databases (`gympify_tenant_alpha` and `gympify_tenant_beta`), and registers them in the central tenant directory.

### 4. Start the Application
Start the NestJS development watch server:
```bash
npm run start:dev
```
The BFF will start listening on port `3000`.

---

## 🧪 Testing the API

You can test the application using tools like Postman, Bruno, or curl.

### 1. Register a Trainer on Tenant Alpha
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: alpha" \
  -d '{"email":"trainer1@alpha.com","firstName":"John","lastName":"Doe","role":"TRAINER","password":"password123"}'
```

### 2. Login as the Trainer
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: alpha" \
  -d '{"email":"trainer1@alpha.com","pass":"password123"}'
```
*Note: Copy the `accessToken` from the JSON response.*

### 3. Retrieve the Mobile Dashboard
Using the token retrieved above:
```bash
curl -X GET http://localhost:3000/api/v1/mobile/dashboard \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Tenant-ID: alpha"
```
This request will fetch user profile details, active memberships, payments, upcoming class bookings, and notifications from the tenant's isolated database.

### 4. Confirm Tenant Cross-Access Prevention
If you try to query Tenant Beta using the token issued for Tenant Alpha:
```bash
curl -X GET http://localhost:3000/api/v1/mobile/dashboard \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Tenant-ID: beta"
```
The system will immediately block the request with `HTTP 401 Unauthorized` indicating that the token's tenant claim does not match the requested tenant context.
