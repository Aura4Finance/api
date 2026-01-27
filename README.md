# OraFi API

Backend API for the OraFi merchant payment gateway. Built with Node.js, Express, PostgreSQL, and Redis.

## 📋 Overview

This is the core backend service that handles:
- Merchant authentication and account management
- Payment processing and webhook management
- User and wallet management
- API key management
- Email notifications via job queues
- Fiat and crypto transaction handling

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+

### Installation

```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env

# Setup database
pnpm exec prisma migrate dev

# Start development server
pnpm dev
```

Server runs on `http://localhost:3000`

## 📁 Project Structure

```
src/
├── app.ts              # Express app setup
├── server.ts           # Server entry point
├── @types/             # TypeScript type definitions
├── config/             # Configuration files
│   ├── cors-config.ts
│   ├── db-config.ts
│   ├── redis-config.ts
│   └── resend-config.ts
├── constants/          # Application constants
│   ├── status.constant.ts
│   └── webhook-events.constants.ts
├── controllers/        # Request handlers
│   ├── admin.controller.ts
│   ├── auth.controller.ts
│   ├── customer.controller.ts
│   ├── paylink.controller.ts
│   ├── payment.controller.ts
│   ├── payout.controller.ts
│   ├── refund.controller.ts
│   ├── transaction.controller.ts
│   └── user/
├── dto/                # Data Transfer Objects
│   ├── api-key.dto.ts
│   ├── auth.dto.ts
│   ├── customer.dto.ts
│   ├── fiat.dto.ts
│   ├── merchant.dto.ts
│   ├── paylink.dto.ts
│   ├── payment.dto.ts
│   ├── payout.dto.ts
│   ├── refund.dto.ts
│   ├── security.dto.ts
│   ├── settlement.dto.ts
│   ├── transaction.dto.ts
│   ├── user.dto.ts
│   └── webhook.dto.ts
├── html/               # Email templates
│   ├── activated.html
│   ├── payment_success.html
│   ├── payment_failed.html
│   └── ... (more templates)
├── jobs/               # Async job handlers
│   └── email.job.ts
├── middlewares/        # Express middlewares
├── queues/             # Job queues (BullMQ)
├── repositories/       # Data access layer
├── routes/             # API route definitions
├── services/           # Business logic
├── utils/              # Utility functions
└── validation/         # Input validation schemas
```

## 🔌 API Endpoints

### Authentication
- `POST /auth/register` - Register new merchant
- `POST /auth/login` - Login merchant
- `POST /auth/logout` - Logout merchant
- `POST /auth/refresh` - Refresh JWT token
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password

### Payments
- `POST /payments/initiate` - Create new payment
- `GET /payments/:id` - Get payment details
- `GET /payments` - List merchant payments
- `POST /payments/:id/refund` - Refund payment

### Webhooks
- `POST /webhooks/register` - Register webhook URL
- `GET /webhooks` - List registered webhooks
- `PUT /webhooks/:id` - Update webhook
- `DELETE /webhooks/:id` - Delete webhook

### Merchants
- `GET /merchants/me` - Get current merchant profile
- `PUT /merchants/me` - Update merchant profile
- `GET /merchants/me/wallets` - List merchant wallets
- `POST /merchants/me/wallets` - Add new wallet

### Customers
- `GET /customers` - List customers
- `GET /customers/:id` - Get customer details

### API Keys
- `GET /api-keys` - List API keys
- `POST /api-keys` - Create new API key
- `DELETE /api-keys/:id` - Delete API key
- `POST /api-keys/:id/rotate` - Rotate API key

### Transactions
- `GET /transactions` - List transactions
- `GET /transactions/:id` - Get transaction details

### Admin
- `GET /admin/stats` - Get platform statistics
- `GET /admin/users` - List all users

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the `Authorization` header:

```bash
Authorization: Bearer <your-jwt-token>
```

Tokens expire based on `JWT_EXPIRY` environment variable (default: 7d).

## 📦 Key Technologies

| Package | Purpose |
|---------|---------|
| `express` | Web framework |
| `@prisma/client` | ORM & database |
| `ioredis` | Redis client |
| `jsonwebtoken` | JWT authentication |
| `argon2` | Password hashing |
| `bullmq` | Job queue |
| `joi` | Input validation |
| `helmet` | Security headers |
| `winston` | Logging |
| `axios` | HTTP client |
| `resend` | Email service |

## 🔧 Environment Variables

Create a `.env` file in the project root:

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/orafi

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRY=7d

# Sui Network
SUI_NETWORK=testnet
SUI_RPC_URL=https://fullnode.testnet.sui.io

# Email
RESEND_API_KEY=your-resend-key
RESEND_FROM_EMAIL=noreply@orafi.com

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:3000

# Logging
LOG_LEVEL=info
```

## 📝 Scripts

```bash
# Development
pnpm dev              # Start with hot reload
pnpm dev:watch       # Watch mode

# Production
pnpm build           # Build TypeScript
pnpm start           # Run production build

# Database
pnpm db:migrate      # Run migrations
pnpm db:reset        # Reset database
pnpm db:studio       # Open Prisma Studio

# Testing
pnpm test            # Run tests
pnpm test:watch      # Watch mode

# Linting
pnpm lint            # Run eslint
pnpm format          # Format code
```

## 🗄️ Database Schema

The database schema is managed by Prisma. Key tables include:

- **users** - Merchant and admin accounts
- **merchants** - Merchant profiles and settings
- **api_keys** - API key management
- **payments** - Payment records
- **webhooks** - Webhook configurations
- **webhook_logs** - Webhook delivery logs
- **wallets** - Merchant wallet addresses
- **bank_accounts** - Fiat bank accounts
- **transactions** - All transaction records

View and modify schema in `prisma/schema.prisma`

## 🔄 Job Queue

The API uses BullMQ for async jobs:

- Email notifications
- Payment status updates
- Webhook retries
- Scheduled tasks

Jobs are processed in the background using Redis as the queue store.

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

Test files are in the `tests/` directory.

## 🚀 Deployment

### Docker

```bash
# Build image
docker build -t orafi-api .

# Run container
docker run -p 3000:3000 --env-file .env orafi-api
```

### Docker Compose

```bash
# Development
docker-compose up -d

# Production
docker-compose -f docker-compose.prod.yml up -d
```

### Heroku / Render / Railway

```bash
# Build
pnpm build

# Start
NODE_ENV=production pnpm start
```

## 📊 Monitoring

The API includes Winston logging with:
- Console output (development)
- File logs (production)
- Error tracking
- Request logging via Morgan

View logs in `logs/` directory.

## 🔒 Security

- **Password Hashing** - Argon2 with salt rounds
- **JWT Authentication** - Secure token-based auth
- **Rate Limiting** - Protected endpoints
- **CORS** - Configurable origin restrictions
- **Helmet** - Security headers
- **Input Validation** - Joi schema validation
- **SQL Injection Protection** - Via Prisma ORM
- **Environment Secrets** - Never hardcoded

## 📚 API Documentation

Import `postman.json` into Postman for API request examples.

Alternatively, use the OpenAPI/Swagger specification at `/api/docs`

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and commit: `git commit -am 'Add feature'`
3. Push to branch: `git push origin feature/my-feature`
4. Create Pull Request

## 📄 License

MIT License - See project LICENSE file

## 📧 Support

For issues or questions, open an issue on GitHub or contact the development team.

---

**OraFi API - Powering Sui Payments**
