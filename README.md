# Bavari Backend API

Professional NestJS backend API for Bavari E-commerce platform.

## Features

- ✅ RESTful API architecture
- ✅ JWT Authentication for admin
- ✅ TypeORM with SQLite database
- ✅ Comprehensive CRUD operations
- ✅ Data validation with class-validator
- ✅ Clean code structure
- ✅ Professional error handling

## Project Structure

```
src/
├── config/           # Configuration files
├── entities/         # Database entities
├── modules/          # Feature modules
│   ├── auth/        # Authentication module
│   ├── products/    # Products management
│   ├── categories/  # Categories management
│   ├── orders/      # Orders management
│   └── analytics/   # Analytics & reports
├── seed/            # Database seeding
└── main.ts          # Application entry point
```

## Installation

```bash
npm install
```

## Environment Setup

Copy `.env.example` to `.env` and configure:

```env
DB_PATH=database.sqlite
NODE_ENV=development
JWT_SECRET=your-secret-key
PORT=3001
FRONTEND_URL=http://localhost:3000
```

## Database Seeding

```bash
npm run seed
```

This will create:
- Default admin user (username: `admin`, password: `admin123`)
- Sample categories
- Sample products

## Running the Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Admin login

### Products
- `GET /api/products` - List all products
- `GET /api/products/:id` - Get product by ID
- `GET /api/products/slug/:slug` - Get product by slug
- `GET /api/products/category/:category` - Get products by category
- `POST /api/products` - Create product (Admin)
- `PATCH /api/products/:id` - Update product (Admin)
- `DELETE /api/products/:id` - Delete product (Admin)

### Categories
- `GET /api/categories` - List all categories
- `GET /api/categories/:id` - Get category by ID
- `GET /api/categories/:id/stats` - Get category statistics
- `POST /api/categories` - Create category (Admin)
- `PATCH /api/categories/:id` - Update category (Admin)
- `DELETE /api/categories/:id` - Delete category (Admin)

### Orders
- `POST /api/orders` - Create order
- `GET /api/orders` - List all orders (Admin)
- `GET /api/orders/:id` - Get order by ID (Admin)
- `PATCH /api/orders/:id/status` - Update order status (Admin)
- `DELETE /api/orders/:id` - Delete order (Admin)

### Analytics
- `GET /api/analytics/dashboard` - Get dashboard stats (Admin)
- `GET /api/analytics/report?period=weekly|monthly|yearly` - Get sales report (Admin)

## Authentication

Admin endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

## License

Private - All rights reserved

