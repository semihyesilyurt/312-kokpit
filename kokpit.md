# Kokpit – Akıllı Restoran ve Lojistik Yönetim Sistemi

## Tam Teknik PRD (Product Requirements Document)

**Proje:** Kokpit  
**Domain:** kokpit.312doner.com  
**Kapsam:** 312 Döner – Firma İçi Kullanım (SaaS Değil)  
**Versiyon:** 3.0

---

# BÖLÜM 1: PROJE GENEL BAKIŞ

## 1.1 Proje Amacı

Kokpit, 312 Döner'in tüm operasyonlarını tek merkezden yöneten bir iç yönetim sistemidir:

- Online platformlar (Getir, Yemeksepeti, Trendyol) ve fiziksel satışları birleştirme
- Kurye ve sipariş dağıtımını algoritmik yönetme
- Reçete bazlı stok takibi ile fire önleme
- Platform bağımlılığını azaltarak doğrudan müşteri ilişkisi kurma
- Operasyonu veri ve kurallarla yönetme

## 1.2 Sistem Mimarisi

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  Web Dashboard        Kurye Mobile App       Kitchen Display    POS     │
│  (Next.js 16.1)       (React Native/Expo)    (Next.js)         Terminal │
└──────────────┬────────────────┬─────────────────┬──────────────┬────────┘
               │                │                 │              │
               └────────────────┼─────────────────┼──────────────┘
                                │                 │
                         ┌──────▼─────────────────▼──────┐
                         │        API Gateway            │
                         │        (NestJS 11.x)          │
                         └──────────────┬────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        │                               │                               │
┌───────▼───────┐  ┌───────────────────▼───────────────────┐  ┌────────▼────────┐
│   WebSocket   │  │              Services                  │  │   Job Queue     │
│   Gateway     │  │  ┌─────────────────────────────────┐  │  │   (BullMQ)      │
│  (Socket.IO)  │  │  │ Auth │ Order │ Stock │ Delivery │  │  │                 │
│               │  │  │ User │ Recipe│ Report│ Customer │  │  │ - Order Sync    │
│ - Orders      │  │  │ POS  │Platform│ Rule │Notification│ │  │ - Notifications │
│ - Couriers    │  │  └─────────────────────────────────┘  │  │ - Reports       │
│ - Alerts      │  │                                        │  │                 │
└───────────────┘  └───────────────────┬───────────────────┘  └─────────────────┘
                                       │
                   ┌───────────────────┼───────────────────┐
                   │                   │                   │
            ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
            │   MySQL 8   │     │   Redis 7   │     │  External   │
            │  (Prisma)   │     │   Cache     │     │    APIs     │
            │             │     │   Queue     │     │  - Getir    │
            │  - Orders   │     │   Session   │     │  - YS       │
            │  - Stock    │     │   PubSub    │     │  - Trendyol │
            │  - Users    │     │             │     │  - Maps     │
            └─────────────┘     └─────────────┘     └─────────────┘
```

---

# BÖLÜM 2: TECH STACK

## 2.1 Backend

| Teknoloji | Versiyon | Kullanım |
|-----------|----------|----------|
| NestJS | 11.x | Ana framework |
| TypeScript | 5.7.x | Dil |
| Prisma | 6.x | ORM |
| MySQL | 8.x | Veritabanı |
| Redis | 7.x | Cache, Queue, Session |
| BullMQ | 5.x | Job Queue |
| Socket.IO | 4.8.x | WebSocket |
| Passport.js | 0.7.x | Authentication |
| class-validator | 0.14.x | Validation |
| class-transformer | 0.5.x | DTO transformation |

## 2.2 Frontend

| Teknoloji | Versiyon | Kullanım |
|-----------|----------|----------|
| Next.js | 16.1.x | Framework (App Router) |
| React | 19.2.x | UI Library |
| TypeScript | 5.7.x | Dil |
| Tailwind CSS | 4.x | Styling |
| shadcn/ui | latest | UI Components |
| TanStack Query | 5.x | Server State |
| Zustand | 5.x | Client State |
| Socket.IO Client | 4.8.x | WebSocket |
| Recharts | 2.14.x | Charts |
| Leaflet | 1.9.x | Maps |
| React Hook Form | 7.x | Forms |
| Zod | 3.x | Schema Validation |

## 2.3 Mobile (Kurye App)

| Teknoloji | Versiyon | Kullanım |
|-----------|----------|----------|
| React Native | 0.76.x | Framework |
| Expo | 52.x | Development Platform |
| expo-location | 18.x | GPS Tracking |
| expo-notifications | 0.29.x | Push Notifications |
| react-native-maps | 1.18.x | Harita |

## 2.4 DevOps & Services

| Teknoloji | Kullanım |
|-----------|----------|
| Docker + docker-compose | Containerization |
| GitHub Actions | CI/CD |
| Nginx | Reverse Proxy |
| Sentry | Error Tracking |
| Google Maps API | Geocoding, ETA, Routes |

## 2.5 Proje Yapısı

```
kokpit/
├── apps/
│   ├── api/                    # NestJS Backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── user/
│   │   │   │   ├── order/
│   │   │   │   ├── stock/
│   │   │   │   ├── recipe/
│   │   │   │   ├── delivery/
│   │   │   │   ├── customer/
│   │   │   │   ├── platform/
│   │   │   │   ├── pos/
│   │   │   │   ├── report/
│   │   │   │   ├── rule-engine/
│   │   │   │   └── notification/
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   ├── filters/
│   │   │   │   ├── guards/
│   │   │   │   ├── interceptors/
│   │   │   │   └── pipes/
│   │   │   ├── config/
│   │   │   ├── prisma/
│   │   │   └── main.ts
│   │   └── package.json
│   │
│   ├── web/                    # Next.js Dashboard
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── login/
│   │   │   │   │   └── layout.tsx
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── orders/
│   │   │   │   │   ├── stock/
│   │   │   │   │   ├── delivery/
│   │   │   │   │   ├── pos/
│   │   │   │   │   ├── customers/
│   │   │   │   │   ├── reports/
│   │   │   │   │   ├── settings/
│   │   │   │   │   └── layout.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── components/
│   │   │   │   ├── ui/          # shadcn components
│   │   │   │   ├── orders/
│   │   │   │   ├── stock/
│   │   │   │   ├── delivery/
│   │   │   │   └── shared/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── services/
│   │   │   ├── stores/
│   │   │   └── types/
│   │   └── package.json
│   │
│   └── mobile/                 # React Native Kurye App
│       ├── src/
│       │   ├── screens/
│       │   ├── components/
│       │   ├── services/
│       │   └── stores/
│       └── package.json
│
├── packages/
│   └── shared/                 # Shared types & utilities
│       ├── src/
│       │   ├── types/
│       │   ├── constants/
│       │   └── utils/
│       └── package.json
│
├── docker-compose.yml
├── package.json                # Monorepo root (pnpm workspaces)
└── pnpm-workspace.yaml
```

---

# BÖLÜM 3: DATABASE SCHEMA (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ==================== ENUMS ====================

enum UserRole {
  ADMIN
  OPERATION_MANAGER
  BRANCH_MANAGER
  CASHIER
  KITCHEN
  COURIER
  ACCOUNTING
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

enum Platform {
  GETIR
  YEMEKSEPETI
  TRENDYOL
  DIRECT
  POS
}

enum OrderStatus {
  PENDING
  CONFIRMED
  PREPARING
  READY
  ON_DELIVERY
  DELIVERED
  CANCELLED
  REFUNDED
}

enum PaymentMethod {
  CASH
  CREDIT_CARD
  ONLINE
  MEAL_CARD
}

enum PaymentStatus {
  PENDING
  PAID
  REFUNDED
  FAILED
}

enum CourierStatus {
  AVAILABLE
  ON_DELIVERY
  RETURNING
  OFFLINE
  ON_BREAK
}

enum StockMovementType {
  SALE
  PURCHASE
  WASTE
  ADJUSTMENT
  TRANSFER
  COUNT
}

enum CustomerStatus {
  ACTIVE
  SLEEPING
  LOST
  VIP
}

enum NotificationType {
  NEW_ORDER
  ORDER_UPDATE
  CRITICAL_STOCK
  COURIER_ASSIGNED
  DELIVERY_COMPLETE
  WIN_BACK
  SYSTEM_ALERT
}

enum NotificationChannel {
  PUSH
  SMS
  WHATSAPP
  IN_APP
  EMAIL
}

enum RuleStatus {
  ACTIVE
  INACTIVE
  DRAFT
}

enum RuleActionType {
  CLOSE_PLATFORM
  OPEN_PLATFORM
  DISABLE_PRODUCT
  ENABLE_PRODUCT
  ADJUST_PRICE
  SEND_NOTIFICATION
  HOLD_ORDERS
  ASSIGN_COURIER
}

// ==================== USER & AUTH ====================

model User {
  id            Int         @id @default(autoincrement())
  email         String      @unique
  password      String
  name          String
  phone         String?
  role          UserRole
  status        UserStatus  @default(ACTIVE)
  branchId      Int?
  branch        Branch?     @relation(fields: [branchId], references: [id])
  courierProfile  Courier?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  lastLoginAt   DateTime?
  orders        Order[]     @relation("CreatedBy")
  auditLogs     AuditLog[]
  
  @@index([email])
  @@index([role])
  @@index([branchId])
}

model Branch {
  id            Int         @id @default(autoincrement())
  name          String
  address       String
  phone         String
  latitude      Decimal     @db.Decimal(10, 8)
  longitude     Decimal     @db.Decimal(11, 8)
  isActive      Boolean     @default(true)
  workingHours  Json
  users         User[]
  orders        Order[]
  couriers      Courier[]
  stockItems    StockItem[]
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}

model RefreshToken {
  id            Int         @id @default(autoincrement())
  token         String      @unique @db.VarChar(500)
  userId        Int
  expiresAt     DateTime
  createdAt     DateTime    @default(now())
  
  @@index([userId])
  @@index([expiresAt])
}

// ==================== ORDER ====================

model Order {
  id                  Int             @id @default(autoincrement())
  orderNumber         String          @unique
  platform            Platform
  platformOrderId     String?
  status              OrderStatus     @default(PENDING)
  customerId          Int?
  customer            Customer?       @relation(fields: [customerId], references: [id])
  customerName        String
  customerPhone       String
  customerAddress     String?
  customerNote        String?         @db.Text
  latitude            Decimal?        @db.Decimal(10, 8)
  longitude           Decimal?        @db.Decimal(11, 8)
  subtotal            Decimal         @db.Decimal(10, 2)
  discount            Decimal         @default(0) @db.Decimal(10, 2)
  deliveryFee         Decimal         @default(0) @db.Decimal(10, 2)
  platformCommission  Decimal         @default(0) @db.Decimal(10, 2)
  totalAmount         Decimal         @db.Decimal(10, 2)
  netAmount           Decimal         @db.Decimal(10, 2)
  paymentMethod       PaymentMethod
  paymentStatus       PaymentStatus   @default(PENDING)
  courierId           Int?
  courier             Courier?        @relation(fields: [courierId], references: [id])
  estimatedDelivery   DateTime?
  actualDelivery      DateTime?
  deliveryDuration    Int?
  branchId            Int
  branch              Branch          @relation(fields: [branchId], references: [id])
  createdById         Int?
  createdBy           User?           @relation("CreatedBy", fields: [createdById], references: [id])
  confirmedAt         DateTime?
  preparingAt         DateTime?
  readyAt             DateTime?
  pickedUpAt          DateTime?
  deliveredAt         DateTime?
  cancelledAt         DateTime?
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  items               OrderItem[]
  statusHistory       OrderStatusHistory[]
  
  @@index([platform])
  @@index([status])
  @@index([customerId])
  @@index([courierId])
  @@index([branchId])
  @@index([createdAt])
  @@index([platformOrderId])
}

model OrderItem {
  id              Int         @id @default(autoincrement())
  orderId         Int
  order           Order       @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId       Int
  product         Product     @relation(fields: [productId], references: [id])
  productName     String
  quantity        Int
  unitPrice       Decimal     @db.Decimal(10, 2)
  totalPrice      Decimal     @db.Decimal(10, 2)
  cost            Decimal     @db.Decimal(10, 2)
  notes           String?     @db.Text
  createdAt       DateTime    @default(now())
  
  @@index([orderId])
  @@index([productId])
}

model OrderStatusHistory {
  id          Int         @id @default(autoincrement())
  orderId     Int
  order       Order       @relation(fields: [orderId], references: [id], onDelete: Cascade)
  fromStatus  OrderStatus?
  toStatus    OrderStatus
  note        String?
  changedById Int?
  createdAt   DateTime    @default(now())
  
  @@index([orderId])
}

// ==================== PRODUCT & MENU ====================

model Category {
  id          Int         @id @default(autoincrement())
  name        String
  slug        String      @unique
  sortOrder   Int         @default(0)
  isActive    Boolean     @default(true)
  products    Product[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model Product {
  id              Int         @id @default(autoincrement())
  name            String
  slug            String      @unique
  description     String?     @db.Text
  categoryId      Int
  category        Category    @relation(fields: [categoryId], references: [id])
  basePrice       Decimal     @db.Decimal(10, 2)
  platformPrices  Json?
  cost            Decimal     @default(0) @db.Decimal(10, 2)
  isActive        Boolean     @default(true)
  isAvailable     Boolean     @default(true)
  preparationTime Int         @default(10)
  sortOrder       Int         @default(0)
  imageUrl        String?
  recipe          RecipeItem[]
  orderItems      OrderItem[]
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  
  @@index([categoryId])
  @@index([isActive])
  @@index([slug])
}

// ==================== RECIPE & INGREDIENTS ====================

model Ingredient {
  id              Int             @id @default(autoincrement())
  name            String
  unit            String
  unitCost        Decimal         @db.Decimal(10, 4)
  trackStock      Boolean         @default(true)
  minStock        Decimal         @default(0) @db.Decimal(10, 2)
  isActive        Boolean         @default(true)
  recipes         RecipeItem[]
  stockItems      StockItem[]
  stockMovements  StockMovement[]
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  
  @@index([name])
}

model RecipeItem {
  id              Int         @id @default(autoincrement())
  productId       Int
  product         Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  ingredientId    Int
  ingredient      Ingredient  @relation(fields: [ingredientId], references: [id])
  quantity        Decimal     @db.Decimal(10, 4)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  
  @@unique([productId, ingredientId])
  @@index([productId])
  @@index([ingredientId])
}

// ==================== STOCK ====================

model StockItem {
  id               Int         @id @default(autoincrement())
  ingredientId     Int
  ingredient       Ingredient  @relation(fields: [ingredientId], references: [id])
  branchId         Int
  branch           Branch      @relation(fields: [branchId], references: [id])
  currentStock     Decimal     @db.Decimal(10, 2)
  theoreticalStock Decimal     @db.Decimal(10, 2)
  minStock         Decimal     @db.Decimal(10, 2)
  maxStock         Decimal?    @db.Decimal(10, 2)
  lastCountAt      DateTime?
  lastCountValue   Decimal?    @db.Decimal(10, 2)
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
  
  @@unique([ingredientId, branchId])
  @@index([branchId])
}

model StockMovement {
  id              Int                 @id @default(autoincrement())
  ingredientId    Int
  ingredient      Ingredient          @relation(fields: [ingredientId], references: [id])
  branchId        Int
  type            StockMovementType
  quantity        Decimal             @db.Decimal(10, 2)
  referenceType   String?
  referenceId     Int?
  stockBefore     Decimal             @db.Decimal(10, 2)
  stockAfter      Decimal             @db.Decimal(10, 2)
  note            String?
  createdById     Int?
  createdAt       DateTime            @default(now())
  
  @@index([ingredientId])
  @@index([branchId])
  @@index([type])
  @@index([createdAt])
}

// ==================== DELIVERY / COURIER ====================

model Courier {
  id                  Int             @id @default(autoincrement())
  userId              Int             @unique
  user                User            @relation(fields: [userId], references: [id])
  branchId            Int
  branch              Branch          @relation(fields: [branchId], references: [id])
  status              CourierStatus   @default(OFFLINE)
  currentLatitude     Decimal?        @db.Decimal(10, 8)
  currentLongitude    Decimal?        @db.Decimal(11, 8)
  lastLocationAt      DateTime?
  vehicleType         String?
  vehiclePlate        String?
  totalDeliveries     Int             @default(0)
  averageDeliveryTime Int?
  rating              Decimal?        @db.Decimal(3, 2)
  performanceScore    Int             @default(100)
  cashBalance         Decimal         @default(0) @db.Decimal(10, 2)
  isOnShift           Boolean         @default(false)
  shiftStartedAt      DateTime?
  orders              Order[]
  cashTransactions    CourierCashTransaction[]
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  
  @@index([branchId])
  @@index([status])
}

model CourierCashTransaction {
  id              Int         @id @default(autoincrement())
  courierId       Int
  courier         Courier     @relation(fields: [courierId], references: [id])
  type            String
  amount          Decimal     @db.Decimal(10, 2)
  balanceBefore   Decimal     @db.Decimal(10, 2)
  balanceAfter    Decimal     @db.Decimal(10, 2)
  orderId         Int?
  note            String?
  createdById     Int?
  createdAt       DateTime    @default(now())
  
  @@index([courierId])
  @@index([createdAt])
}

// ==================== CUSTOMER ====================

model Customer {
  id                  Int             @id @default(autoincrement())
  phone               String          @unique
  name                String?
  email               String?
  defaultAddress      String?
  defaultLatitude     Decimal?        @db.Decimal(10, 8)
  defaultLongitude    Decimal?        @db.Decimal(11, 8)
  status              CustomerStatus  @default(ACTIVE)
  firstOrderPlatform  Platform?
  isDirectCustomer    Boolean         @default(false)
  totalOrders         Int             @default(0)
  totalSpent          Decimal         @default(0) @db.Decimal(10, 2)
  averageOrderValue   Decimal?        @db.Decimal(10, 2)
  firstOrderAt        DateTime?
  lastOrderAt         DateTime?
  loyaltyPoints       Int             @default(0)
  usedPromoCodes      Json?
  orders              Order[]
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  
  @@index([phone])
  @@index([status])
  @@index([lastOrderAt])
}

// ==================== PLATFORM INTEGRATION ====================

model PlatformConfig {
  id              Int         @id @default(autoincrement())
  platform        Platform    @unique
  apiKey          String?     @db.Text
  apiSecret       String?     @db.Text
  accessToken     String?     @db.Text
  refreshToken    String?     @db.Text
  tokenExpiresAt  DateTime?
  isActive        Boolean     @default(true)
  autoAccept      Boolean     @default(false)
  commissionRate  Decimal     @db.Decimal(5, 2)
  lastSyncAt      DateTime?
  syncStatus      String?
  webhookSecret   String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

model PlatformSyncLog {
  id              Int         @id @default(autoincrement())
  platform        Platform
  action          String
  status          String
  requestData     Json?
  responseData    Json?
  errorMessage    String?     @db.Text
  duration        Int?
  createdAt       DateTime    @default(now())
  
  @@index([platform])
  @@index([createdAt])
}

// ==================== RULE ENGINE ====================

model Rule {
  id              Int             @id @default(autoincrement())
  name            String
  description     String?
  condition       Json
  actionType      RuleActionType
  actionParams    Json?
  status          RuleStatus      @default(DRAFT)
  priority        Int             @default(0)
  cooldownMinutes Int             @default(5)
  lastTriggeredAt DateTime?
  createdById     Int?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  executions      RuleExecution[]
  
  @@index([status])
}

model RuleExecution {
  id              Int         @id @default(autoincrement())
  ruleId          Int
  rule            Rule        @relation(fields: [ruleId], references: [id])
  triggered       Boolean
  conditionValue  Json?
  actionTaken     String?
  canRollback     Boolean     @default(false)
  rolledBackAt    DateTime?
  rollbackData    Json?
  createdAt       DateTime    @default(now())
  
  @@index([ruleId])
  @@index([createdAt])
}

// ==================== NOTIFICATION ====================

model Notification {
  id              Int                   @id @default(autoincrement())
  type            NotificationType
  channel         NotificationChannel
  recipientId     Int?
  recipientPhone  String?
  title           String
  body            String                @db.Text
  data            Json?
  status          String                @default("pending")
  sentAt          DateTime?
  failedReason    String?
  createdAt       DateTime              @default(now())
  
  @@index([type])
  @@index([recipientId])
  @@index([createdAt])
}

// ==================== REPORTS & ANALYTICS ====================

model DailyReport {
  id                  Int         @id @default(autoincrement())
  branchId            Int
  date                DateTime    @db.Date
  totalOrders         Int
  platformOrders      Json
  posOrders           Int
  cancelledOrders     Int
  grossRevenue        Decimal     @db.Decimal(12, 2)
  netRevenue          Decimal     @db.Decimal(12, 2)
  platformCommissions Decimal     @db.Decimal(10, 2)
  averageDeliveryTime Int?
  onTimeDeliveryRate  Decimal?    @db.Decimal(5, 2)
  wasteAmount         Decimal?    @db.Decimal(10, 2)
  wasteRate           Decimal?    @db.Decimal(5, 2)
  newCustomers        Int         @default(0)
  returningCustomers  Int         @default(0)
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt
  
  @@unique([branchId, date])
  @@index([date])
}

// ==================== AUDIT LOG ====================

model AuditLog {
  id              Int         @id @default(autoincrement())
  userId          Int?
  user            User?       @relation(fields: [userId], references: [id])
  action          String
  entity          String
  entityId        Int?
  oldData         Json?
  newData         Json?
  ipAddress       String?
  userAgent       String?
  createdAt       DateTime    @default(now())
  
  @@index([userId])
  @@index([entity])
  @@index([createdAt])
}

// ==================== SETTINGS ====================

model Setting {
  id              Int         @id @default(autoincrement())
  key             String      @unique
  value           Json
  description     String?
  updatedAt       DateTime    @updatedAt
}
```

---

# BÖLÜM 4: API SERVİS DETAYLARI

## 4.1 Auth Service

### Endpoints
```
POST   /api/auth/login              # { email, password } -> { accessToken, refreshToken, user }
POST   /api/auth/refresh            # { refreshToken } -> { accessToken, refreshToken }
POST   /api/auth/logout             # Headers: Bearer token -> { success }
GET    /api/auth/me                 # Headers: Bearer token -> User
POST   /api/auth/change-password    # { currentPassword, newPassword } -> { success }
```

### Business Logic
```typescript
// Token süreleri
ACCESS_TOKEN_EXPIRY = '15m';
REFRESH_TOKEN_EXPIRY = '7d';

// Login Flow:
// 1. Email ile kullanıcı bul
// 2. Şifre kontrolü (bcrypt.compare)
// 3. Kullanıcı aktif mi kontrol et
// 4. Access & Refresh token üret (JWT)
// 5. Refresh token'ı DB'ye kaydet
// 6. Last login güncelle
// 7. Audit log oluştur

// Guards
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}

// Decorators
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const CurrentUser = createParamDecorator((data, ctx) => ctx.switchToHttp().getRequest().user);
```

### Role Permissions
```typescript
const PERMISSIONS = {
  'orders.view': [ADMIN, OPERATION_MANAGER, BRANCH_MANAGER, CASHIER, KITCHEN],
  'orders.create': [ADMIN, OPERATION_MANAGER, BRANCH_MANAGER, CASHIER],
  'orders.update': [ADMIN, OPERATION_MANAGER, BRANCH_MANAGER],
  'orders.cancel': [ADMIN, OPERATION_MANAGER],
  'delivery.view': [ADMIN, OPERATION_MANAGER, BRANCH_MANAGER, COURIER],
  'delivery.assign': [ADMIN, OPERATION_MANAGER],
  'stock.view': [ADMIN, OPERATION_MANAGER, BRANCH_MANAGER, KITCHEN],
  'stock.update': [ADMIN, BRANCH_MANAGER],
  'products.manage': [ADMIN],
  'reports.view': [ADMIN, OPERATION_MANAGER, BRANCH_MANAGER, ACCOUNTING],
  'users.manage': [ADMIN],
  'settings.manage': [ADMIN],
  'rules.manage': [ADMIN],
  'platforms.toggle': [ADMIN, OPERATION_MANAGER],
};
```

---

## 4.2 Order Service

### Endpoints
```
GET    /api/orders                  # Query: status, platform, startDate, endDate, courierId, search, page, limit
GET    /api/orders/:id              # Order detail with items, history
POST   /api/orders                  # Create order
PATCH  /api/orders/:id/status       # { status, note? }
POST   /api/orders/:id/assign       # { courierId }
POST   /api/orders/:id/cancel       # { reason }
GET    /api/orders/active           # Active orders for dashboard
GET    /api/orders/stats            # Statistics for date range
```

### Create Order Flow
```typescript
async create(dto: CreateOrderDTO, branchId: number): Promise<Order> {
  return this.prisma.$transaction(async (tx) => {
    // 1. Order number üret (ORD-YYYYMMDD-XXXX)
    const orderNumber = await this.generateOrderNumber();

    // 2. Ürünleri ve reçeteleri al
    const products = await tx.product.findMany({
      where: { id: { in: dto.items.map(i => i.productId) } },
      include: { recipe: { include: { ingredient: true } } },
    });

    // 3. Hesaplamaları yap
    const items = dto.items.map(item => {
      const product = products.find(p => p.id === item.productId);
      const price = this.getPriceForPlatform(product, dto.platform);
      return {
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: price,
        totalPrice: price * item.quantity,
        cost: product.cost * item.quantity,
        notes: item.notes,
      };
    });

    const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
    const commission = this.calculateCommission(dto.platform, subtotal);
    const totalAmount = subtotal - (dto.discount || 0) + (dto.deliveryFee || 0);
    const netAmount = totalAmount - commission;

    // 4. Müşteriyi bul veya oluştur
    const customer = await this.customerService.findOrCreate({
      phone: dto.customerPhone,
      name: dto.customerName,
      platform: dto.platform,
    });

    // 5. Siparişi oluştur
    const order = await tx.order.create({
      data: {
        orderNumber, platform: dto.platform, platformOrderId: dto.platformOrderId,
        status: OrderStatus.PENDING, customerId: customer.id,
        customerName: dto.customerName, customerPhone: dto.customerPhone,
        customerAddress: dto.customerAddress, customerNote: dto.customerNote,
        latitude: dto.latitude, longitude: dto.longitude,
        subtotal, discount: dto.discount || 0, deliveryFee: dto.deliveryFee || 0,
        platformCommission: commission, totalAmount, netAmount,
        paymentMethod: dto.paymentMethod,
        paymentStatus: dto.paymentMethod === PaymentMethod.ONLINE ? PaymentStatus.PAID : PaymentStatus.PENDING,
        branchId,
        items: { create: items },
        statusHistory: { create: { toStatus: OrderStatus.PENDING } },
      },
      include: { items: true },
    });

    // 6. Stok düş
    await this.stockService.deductForOrder(order.id, items, branchId, tx);

    // 7. Event emit (WebSocket)
    this.eventEmitter.emit('order.created', order);

    return order;
  });
}
```

### Status Transitions
```typescript
const validTransitions = {
  PENDING: [CONFIRMED, CANCELLED],
  CONFIRMED: [PREPARING, CANCELLED],
  PREPARING: [READY, CANCELLED],
  READY: [ON_DELIVERY, CANCELLED],
  ON_DELIVERY: [DELIVERED, CANCELLED],
  DELIVERED: [],
  CANCELLED: [],
};
```

### WebSocket Events
```typescript
// Namespace: /orders
// Events:
// - newOrder(order)              -> Yeni sipariş
// - orderStatusChanged(payload)  -> Durum değişti
// - orderCourierAssigned(order)  -> Kurye atandı
// - orderCancelled(order)        -> Sipariş iptal
```

---

## 4.3 Stock Service

### Endpoints
```
GET    /api/stock                   # Query: branchId, ingredientId, belowMin
GET    /api/stock/:id               # Stock detail
POST   /api/stock/movement          # Manual stock movement
POST   /api/stock/count             # Stock count with auto-adjustment
GET    /api/stock/movements         # Movement history
GET    /api/stock/alerts            # Critical stock alerts
GET    /api/stock/waste-report      # Waste analysis
```

### Deduct for Order (Recipe-based)
```typescript
async deductForOrder(orderId: number, items: OrderItem[], branchId: number, tx): Promise<void> {
  // Ürünlerin reçetelerini al
  const products = await tx.product.findMany({
    where: { id: { in: items.map(i => i.productId) } },
    include: { recipe: { include: { ingredient: true } } },
  });

  // Her ürün için reçete hesapla
  const stockUpdates = new Map<number, number>();

  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    for (const recipeItem of product.recipe) {
      const deductAmount = recipeItem.quantity * item.quantity;
      const ingredientId = recipeItem.ingredientId;
      const current = stockUpdates.get(ingredientId) || 0;
      stockUpdates.set(ingredientId, current - deductAmount);
    }
  }

  // Stok güncelle ve hareket kaydet
  for (const [ingredientId, change] of stockUpdates) {
    const stockItem = await tx.stockItem.findUnique({
      where: { ingredientId_branchId: { ingredientId, branchId } },
    });
    
    const newStock = stockItem.currentStock + change;
    
    await tx.stockItem.update({
      where: { id: stockItem.id },
      data: { currentStock: newStock, theoreticalStock: newStock },
    });
    
    await tx.stockMovement.create({
      data: {
        ingredientId, branchId, type: StockMovementType.SALE,
        quantity: change, referenceType: 'order', referenceId: orderId,
        stockBefore: stockItem.currentStock, stockAfter: newStock,
      },
    });
    
    // Kritik stok kontrolü
    if (newStock <= stockItem.minStock) {
      this.eventEmitter.emit('stock.critical', { ingredientId, branchId, currentStock: newStock });
    }
  }
}
```

### Stock Count with Auto-Adjustment
```typescript
async processStockCount(dto: StockCountDTO, userId: number): Promise<StockAdjustment[]> {
  const adjustments = [];
  
  await this.prisma.$transaction(async (tx) => {
    for (const item of dto.items) {
      const stockItem = await tx.stockItem.findUnique({
        where: { ingredientId_branchId: { ingredientId: item.ingredientId, branchId: dto.branchId } },
        include: { ingredient: true },
      });
      
      const difference = item.actualQuantity - stockItem.currentStock;
      
      if (Math.abs(difference) > 0.001) {
        await tx.stockItem.update({
          where: { id: stockItem.id },
          data: { currentStock: item.actualQuantity, lastCountAt: new Date(), lastCountValue: item.actualQuantity },
        });
        
        await tx.stockMovement.create({
          data: {
            ingredientId: item.ingredientId, branchId: dto.branchId,
            type: StockMovementType.COUNT, quantity: difference,
            stockBefore: stockItem.currentStock, stockAfter: item.actualQuantity,
            createdById: userId,
          },
        });
        
        adjustments.push({
          ingredientId: item.ingredientId,
          ingredientName: stockItem.ingredient.name,
          previousStock: stockItem.currentStock,
          newStock: item.actualQuantity,
          difference,
          differencePercent: (difference / stockItem.currentStock) * 100,
        });
      }
    }
  });
  
  // Fire analizi için event
  if (adjustments.some(a => a.difference < 0)) {
    this.eventEmitter.emit('stock.waste_detected', { branchId: dto.branchId, adjustments: adjustments.filter(a => a.difference < 0) });
  }
  
  return adjustments;
}
```

---

## 4.4 Delivery Service

### Endpoints
```
GET    /api/delivery/couriers                    # Courier list
GET    /api/delivery/couriers/:id                # Courier detail
PATCH  /api/delivery/couriers/:id/status         # { status }
POST   /api/delivery/couriers/:id/location       # { latitude, longitude }
GET    /api/delivery/couriers/:id/orders         # Active orders
POST   /api/delivery/auto-assign                 # { orderId } -> Auto assign best courier
GET    /api/delivery/couriers/:id/performance    # Performance stats
POST   /api/delivery/couriers/:id/cash           # Cash transaction
GET    /api/delivery/couriers/:id/balance        # Cash balance
POST   /api/delivery/complete/:orderId           # Complete delivery
```

### Auto-Assign Algorithm
```typescript
// Scoring weights
const WEIGHTS = {
  distance: 0.35,
  load: 0.25,
  performance: 0.20,
  returning: 0.20,
};

async autoAssignCourier(orderId: number): Promise<AutoAssignResult | null> {
  const order = await this.prisma.order.findUnique({
    where: { id: orderId },
    include: { branch: true },
  });

  // Müsait kuryeleri al
  const couriers = await this.prisma.courier.findMany({
    where: {
      branchId: order.branchId,
      status: { in: [CourierStatus.AVAILABLE, CourierStatus.RETURNING] },
      isOnShift: true,
    },
    include: {
      user: true,
      orders: { where: { status: { in: [OrderStatus.ON_DELIVERY, OrderStatus.READY] } } },
    },
  });

  if (couriers.length === 0) return null;

  // Her kurye için skor hesapla
  const scoredCouriers = await Promise.all(
    couriers.map(async (courier) => {
      const factors = await this.calculateCourierScore(courier, order);
      const totalScore =
        factors.distanceScore * WEIGHTS.distance +
        factors.loadScore * WEIGHTS.load +
        factors.performanceScore * WEIGHTS.performance +
        factors.returningBonus * WEIGHTS.returning;
      return { courier, score: totalScore, factors };
    }),
  );

  // En yüksek skorlu kuryeyi seç
  const best = scoredCouriers.sort((a, b) => b.score - a.score)[0];

  if (best.score < 30) return null;  // Minimum skor kontrolü

  // Atamayı gerçekleştir
  await this.prisma.order.update({
    where: { id: orderId },
    data: { courierId: best.courier.id },
  });

  return {
    courierId: best.courier.id,
    courierName: best.courier.user.name,
    score: best.score,
    factors: best.factors,
  };
}

calculateCourierScore(courier, order): CourierScoreFactors {
  // 1. Mesafe skoru (0-100, yakın = yüksek)
  const distance = this.calculateDistance(
    courier.currentLatitude || order.branch.latitude,
    courier.currentLongitude || order.branch.longitude,
    order.latitude, order.longitude,
  );
  const distanceScore = Math.max(0, 100 - distance * 10); // Her km için -10

  // 2. Yük skoru (0-100, az sipariş = yüksek)
  const activeOrders = courier.orders.length;
  const loadScore = Math.max(0, 100 - activeOrders * 33); // Her sipariş için -33

  // 3. Performans skoru (0-100)
  const performanceScore = courier.performanceScore;

  // 4. Dönüşte olma bonusu (0 veya 100)
  const returningBonus = courier.status === CourierStatus.RETURNING ? 100 : 0;

  return { distanceScore, loadScore, performanceScore, returningBonus };
}
```

### Complete Delivery
```typescript
async completeDelivery(orderId: number, courierId: number): Promise<Order> {
  return this.prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    
    if (order.courierId !== courierId) throw new ForbiddenException('Not your order');
    
    const deliveryDuration = Math.round((Date.now() - order.pickedUpAt.getTime()) / 60000);
    
    // Sipariş güncelle
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.DELIVERED, deliveredAt: new Date(), deliveryDuration },
    });
    
    // Nakit siparişse kurye bakiyesi güncelle
    if (order.paymentMethod === PaymentMethod.CASH && order.paymentStatus === PaymentStatus.PENDING) {
      const courier = await tx.courier.findUnique({ where: { id: courierId } });
      
      await tx.courier.update({
        where: { id: courierId },
        data: {
          cashBalance: courier.cashBalance + order.totalAmount,
          totalDeliveries: { increment: 1 },
        },
      });
      
      await tx.courierCashTransaction.create({
        data: {
          courierId, type: 'collection', amount: order.totalAmount,
          balanceBefore: courier.cashBalance,
          balanceAfter: courier.cashBalance + order.totalAmount,
          orderId: order.id,
        },
      });
      
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.PAID } });
    }
    
    // Kurye performans güncelle
    await this.updateCourierPerformance(courierId, deliveryDuration, tx);
    
    // Kurye durumunu güncelle
    const remainingOrders = await tx.order.count({
      where: { courierId, status: { in: [OrderStatus.READY, OrderStatus.ON_DELIVERY] } },
    });
    
    if (remainingOrders === 0) {
      await tx.courier.update({ where: { id: courierId }, data: { status: CourierStatus.RETURNING } });
    }
    
    this.eventEmitter.emit('delivery.completed', updated);
    return updated;
  });
}
```

---

## 4.5 Customer Service

### Endpoints
```
GET    /api/customers               # Query: status, search, isDirectCustomer, page, limit
GET    /api/customers/:id           # Customer detail
GET    /api/customers/:id/orders    # Customer order history
GET    /api/customers/sleeping      # Sleeping customers (30+ days)
POST   /api/customers/:id/winback   # { channel: 'sms'|'whatsapp', promoCode? }
GET    /api/customers/stats         # Customer statistics
POST   /api/customers/:id/convert   # Convert to direct customer
```

### Sleeping Customer Detection (Cron)
```typescript
@Cron('0 10 * * *') // Her gün saat 10:00
async checkSleepingCustomers(): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  
  const customers = await this.prisma.customer.findMany({
    where: {
      lastOrderAt: { lt: cutoffDate },
      status: { not: CustomerStatus.SLEEPING },
    },
  });
  
  for (const customer of customers) {
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { status: CustomerStatus.SLEEPING },
    });
    this.eventEmitter.emit('customer.becameSleeping', customer);
  }
}
```

### Loyalty Trigger (on 3rd order)
```typescript
async checkLoyaltyTrigger(customerId: number): Promise<void> {
  const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
  
  if (!customer || customer.isDirectCustomer) return;
  
  if (customer.totalOrders === 3) {
    this.eventEmitter.emit('customer.loyaltyTrigger', { customerId, trigger: 'third_order' });
    // Kurye fişine indirim kodu ekle: "312DIREKT - %20 indirim"
  }
}
```

---

## 4.6 Platform Service

### Endpoints
```
GET    /api/platforms               # Platform list
GET    /api/platforms/:platform     # Platform detail
PATCH  /api/platforms/:platform     # Update config
POST   /api/platforms/:platform/toggle        # { isActive: boolean }
POST   /api/platforms/:platform/sync-orders   # Sync orders
POST   /api/platforms/:platform/sync-menu     # Sync menu
GET    /api/platforms/:platform/logs          # Sync logs
```

### Adapter Pattern
```typescript
interface PlatformAdapter {
  authenticate(): Promise<void>;
  refreshToken(): Promise<void>;
  fetchOrders(since?: Date): Promise<PlatformOrder[]>;
  acceptOrder(orderId: string): Promise<void>;
  rejectOrder(orderId: string, reason: string): Promise<void>;
  updateOrderStatus(orderId: string, status: string): Promise<void>;
  syncMenu(products: Product[]): Promise<void>;
  updateProductAvailability(productId: string, available: boolean): Promise<void>;
  setRestaurantStatus(open: boolean): Promise<void>;
}

// Getir Adapter implementation
@Injectable()
export class GetirAdapter implements PlatformAdapter {
  async fetchOrders(since?: Date): Promise<PlatformOrder[]> {
    const response = await this.httpService.axiosRef.get(`${this.baseUrl}/orders`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      params: { since: since?.toISOString() },
    });
    return response.data.map(this.transformOrder);
  }
  
  private transformOrder(getirOrder: any): PlatformOrder {
    return {
      platformOrderId: getirOrder.id,
      platform: Platform.GETIR,
      customerName: getirOrder.client.name,
      customerPhone: getirOrder.client.phone,
      customerAddress: getirOrder.address.full,
      latitude: getirOrder.address.lat,
      longitude: getirOrder.address.lng,
      items: getirOrder.products.map(p => ({
        platformProductId: p.id,
        name: p.name,
        quantity: p.count,
        unitPrice: p.price,
        notes: p.note,
      })),
      subtotal: getirOrder.totalPrice,
      deliveryFee: getirOrder.courierFee || 0,
      discount: getirOrder.discountAmount || 0,
      totalAmount: getirOrder.paymentAmount,
      paymentMethod: this.mapPaymentMethod(getirOrder.paymentMethod),
    };
  }
}
```

### Sync Orders (BullMQ Job)
```typescript
@Cron('*/2 * * * *') // Her 2 dakikada
async scheduledSync() {
  const platforms = await this.prisma.platformConfig.findMany({ where: { isActive: true } });
  for (const config of platforms) {
    await this.platformSyncQueue.add('sync-orders', { platform: config.platform });
  }
}

@Process('sync-orders')
async syncOrders(job: Job<{ platform: Platform }>) {
  const adapter = this.getAdapter(job.data.platform);
  const platformOrders = await adapter.fetchOrders(config.lastSyncAt);
  
  for (const platformOrder of platformOrders) {
    const existing = await this.prisma.order.findFirst({
      where: { platform: job.data.platform, platformOrderId: platformOrder.platformOrderId },
    });
    
    if (!existing) {
      await this.orderService.createFromPlatform(platformOrder);
      if (config.autoAccept) {
        await adapter.acceptOrder(platformOrder.platformOrderId);
      }
    }
  }
  
  await this.prisma.platformConfig.update({
    where: { platform: job.data.platform },
    data: { lastSyncAt: new Date(), syncStatus: 'success' },
  });
}
```

---

## 4.7 POS Service

### Endpoints
```
POST   /api/pos/quick-sale          # Quick sale (walk-in)
GET    /api/pos/products            # POS product grid
GET    /api/pos/tables              # Table list
POST   /api/pos/tables/:id/open     # Open table
POST   /api/pos/tables/:id/add      # Add items to table
POST   /api/pos/tables/:id/close    # Close table (create order)
GET    /api/pos/daily-summary       # Daily cash summary
```

### Quick Sale
```typescript
async createQuickSale(dto: QuickSaleDTO, branchId: number, cashierId: number): Promise<Order> {
  // Order service'i kullanarak sipariş oluştur
  const order = await this.orderService.create({
    platform: Platform.POS,
    customerName: dto.customerName || 'Gel-Al Müşteri',
    customerPhone: dto.customerPhone || '',
    items: dto.items,
    paymentMethod: dto.paymentMethod,
    discount: dto.discount,
  }, branchId);
  
  // POS satışları için durumları hızlıca geç
  await this.orderService.updateStatus(order.id, OrderStatus.CONFIRMED, cashierId);
  await this.orderService.updateStatus(order.id, OrderStatus.PREPARING, cashierId);
  await this.orderService.updateStatus(order.id, OrderStatus.READY, cashierId);
  
  if (!dto.customerPhone) {
    await this.orderService.updateStatus(order.id, OrderStatus.DELIVERED, cashierId);
  }
  
  // Fiş yazdır
  this.eventEmitter.emit('pos.printReceipt', order);
  
  return order;
}
```

---

## 4.8 Report Service

### Endpoints
```
GET    /api/reports/dashboard               # Dashboard widgets
GET    /api/reports/kpis                    # KPI report
GET    /api/reports/sales                   # Sales report (groupBy: day/week/month)
GET    /api/reports/platform-comparison     # Platform comparison
GET    /api/reports/product-performance     # Product performance
GET    /api/reports/courier-performance     # Courier performance
GET    /api/reports/profitability           # Profitability analysis
POST   /api/reports/generate-daily          # Generate daily report
GET    /api/reports/export                  # Export (csv/xlsx)
```

### Dashboard DTO
```typescript
interface DashboardDTO {
  todayOrders: number;
  todayRevenue: number;
  todayNetProfit: number;
  averageDeliveryTime: number;
  ordersChangePercent: number;   // vs yesterday
  revenueChangePercent: number;
  activeOrders: number;
  availableCouriers: number;
  criticalStockCount: number;
  sleepingCustomers: number;
  ordersByPlatform: Record<Platform, number>;
  alerts: AlertDTO[];
}
```

### Profitability Report
```typescript
interface ProfitabilityReportDTO {
  grossRevenue: number;
  totalCost: number;
  netProfit: number;
  profitMargin: number;
  platformProfitability: {
    platform: Platform;
    revenue: number;
    commission: number;
    netRevenue: number;
    orderCount: number;
    profitPerOrder: number;
  }[];
  unprofitableProducts: {
    productId: number;
    productName: string;
    totalSold: number;
    revenue: number;
    cost: number;
    loss: number;
  }[];
}
```

---

## 4.9 Rule Engine Service

### Endpoints
```
GET    /api/rules                   # Rule list
GET    /api/rules/:id               # Rule detail
POST   /api/rules                   # Create rule
PATCH  /api/rules/:id               # Update rule
DELETE /api/rules/:id               # Delete rule
POST   /api/rules/:id/toggle        # Toggle active/inactive
GET    /api/rules/:id/executions    # Execution history
POST   /api/rules/:id/test          # Test rule
POST   /api/rules/:id/rollback      # Rollback execution
```

### Rule Condition Structure
```typescript
interface RuleCondition {
  field: string;    // 'average_delivery_time', 'available_couriers', 'stock_level', 'waste_rate'
  operator: string; // '>', '<', '>=', '<=', '==', '!='
  value: number;
  scope?: string;   // 'branch:1', 'product:5', 'ingredient:3'
}
```

### Metric Providers
```typescript
metricsProviders.set('average_delivery_time', async () => {
  const orders = await this.prisma.order.findMany({
    where: {
      status: OrderStatus.DELIVERED,
      deliveredAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Son 1 saat
    },
  });
  if (orders.length === 0) return 0;
  return orders.reduce((sum, o) => sum + (o.deliveryDuration || 0), 0) / orders.length;
});

metricsProviders.set('available_couriers', async () => {
  return this.prisma.courier.count({
    where: { status: CourierStatus.AVAILABLE, isOnShift: true },
  });
});

metricsProviders.set('waste_rate', async () => {
  const report = await this.stockService.getWasteReport(branchId, yesterday, today);
  return report.wasteRate;
});
```

### Rule Execution (Cron - Her dakika)
```typescript
@Cron('* * * * *')
async checkAllRules(): Promise<void> {
  const activeRules = await this.prisma.rule.findMany({
    where: { status: RuleStatus.ACTIVE },
    orderBy: { priority: 'desc' },
  });
  
  for (const rule of activeRules) {
    // Cooldown kontrolü
    if (rule.lastTriggeredAt) {
      const cooldownEnd = new Date(rule.lastTriggeredAt.getTime() + rule.cooldownMinutes * 60 * 1000);
      if (new Date() < cooldownEnd) continue;
    }
    
    const evaluation = await this.evaluateRule(rule);
    
    if (evaluation.triggered) {
      const actionResult = await this.executeAction(rule.actionType, rule.actionParams);
      
      await this.prisma.ruleExecution.create({
        data: {
          ruleId: rule.id,
          triggered: true,
          conditionValue: { value: evaluation.currentValue },
          actionTaken: actionResult.description,
          canRollback: actionResult.canRollback,
          rollbackData: actionResult.rollbackData,
        },
      });
      
      await this.prisma.rule.update({
        where: { id: rule.id },
        data: { lastTriggeredAt: new Date() },
      });
      
      this.notificationService.send({
        type: NotificationType.SYSTEM_ALERT,
        channel: NotificationChannel.IN_APP,
        title: 'Kural Tetiklendi',
        body: `"${rule.name}" kuralı tetiklendi: ${actionResult.description}`,
      });
    }
  }
}
```

### Default Rules
```typescript
const defaultRules = [
  {
    name: 'Kurye Yoksa Platformları Kapat',
    condition: { field: 'available_couriers', operator: '==', value: 0 },
    actionType: RuleActionType.CLOSE_PLATFORM,
    actionParams: { platform: Platform.GETIR },
    priority: 100,
    cooldownMinutes: 5,
  },
  {
    name: 'Uzun Teslimat Süresi Uyarısı',
    condition: { field: 'average_delivery_time', operator: '>', value: 45 },
    actionType: RuleActionType.SEND_NOTIFICATION,
    actionParams: { channel: 'IN_APP', title: 'Teslimat Süresi Uyarısı', body: 'Ortalama teslimat 45dk üzeri!' },
    priority: 80,
    cooldownMinutes: 15,
  },
  {
    name: 'Fire Oranı Yüksek',
    condition: { field: 'waste_rate', operator: '>', value: 5 },
    actionType: RuleActionType.SEND_NOTIFICATION,
    actionParams: { channel: 'IN_APP', title: 'Yüksek Fire', body: 'Fire oranı %5 üzerinde!' },
    priority: 70,
    cooldownMinutes: 60,
  },
];
```

---

## 4.7 Customer Service

### Endpoints
```typescript
GET    /api/customers                 // List customers
GET    /api/customers/:id             // Get customer detail
GET    /api/customers/:id/orders      // Get customer orders
GET    /api/customers/sleeping        // Get sleeping customers (30+ days)
POST   /api/customers/:id/winback     // Send win-back message
GET    /api/customers/stats           // Get customer statistics
POST   /api/customers/:id/convert     // Convert to direct customer
```

### Loyalty Trigger Logic
```typescript
async checkLoyaltyTrigger(customerId: number): Promise<void> {
  const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.isDirectCustomer) return;

  // 3. siparişte promosyon tetikle
  if (customer.totalOrders === 3) {
    this.eventEmitter.emit('customer.loyaltyTrigger', {
      customerId,
      trigger: 'third_order',
      message: 'Bize doğrudan ulaştığında bir sonraki döner %20 indirimli! Kod: 312DIREKT'
    });
  }
}
```

---

## 4.8 Platform Integration Service

### Adapter Pattern
```typescript
interface PlatformAdapter {
  fetchOrders(since?: Date): Promise<PlatformOrder[]>;
  acceptOrder(orderId: string): Promise<void>;
  rejectOrder(orderId: string, reason: string): Promise<void>;
  updateOrderStatus(orderId: string, status: string): Promise<void>;
  syncMenu(products: Product[]): Promise<void>;
  setRestaurantStatus(open: boolean): Promise<void>;
}

// Getir, Yemeksepeti, Trendyol için ayrı adapter'lar implement edilecek
```

### Sync Job (Her 2 dakika)
```typescript
@Cron('*/2 * * * *')
async scheduledSync() {
  const platforms = await this.prisma.platformConfig.findMany({ where: { isActive: true } });
  for (const config of platforms) {
    await this.platformSyncQueue.add('sync-orders', { platform: config.platform });
  }
}
```

---

## 4.9 POS Service

### Quick Sale
```typescript
POST /api/pos/quick-sale
Body: {
  items: [{ productId: number, quantity: number, notes?: string }],
  paymentMethod: 'CASH' | 'CREDIT_CARD',
  customerName?: string,
  customerPhone?: string,
  discount?: number
}
```

### Business Logic
- POS satışları `Platform.POS` olarak kaydedilir
- Aynı stok havuzundan düşüm yapılır
- Sipariş anında DELIVERED'a kadar ilerler (teslimat yok)
- Mutfak fişi opsiyonel yazdırılır

---

## 4.10 Report Service

### Dashboard Endpoint
```typescript
GET /api/reports/dashboard
Response: {
  todayOrders: number,
  todayRevenue: number,
  todayNetProfit: number,
  averageDeliveryTime: number,
  ordersChangePercent: number,
  revenueChangePercent: number,
  activeOrders: number,
  availableCouriers: number,
  criticalStockCount: number,
  sleepingCustomers: number,
  ordersByPlatform: Record<Platform, number>,
  alerts: AlertDTO[]
}
```

### KPI Calculations
```typescript
Net Kâr = Sipariş Tutarı – Komisyon – Hammadde – Kurye Maliyeti
Fire Oranı = (Fiili – Teorik Stok) / Teorik Stok × 100
Geç Teslim Oranı = Geç Teslim Sayısı / Toplam Teslim × 100
Direkt Müşteri Oranı = Direkt Siparişler / Toplam Siparişler × 100
```

---

## 4.11 Rule Engine Service

### Rule Structure
```typescript
{
  name: string,
  condition: { field: string, operator: string, value: number },
  actionType: RuleActionType,
  actionParams: object,
  cooldownMinutes: number,
  status: 'ACTIVE' | 'INACTIVE' | 'DRAFT'
}
```

### Available Metrics
- `available_couriers` - Müsait kurye sayısı
- `average_delivery_time` - Son 1 saat ortalama teslimat süresi
- `active_orders` - Aktif sipariş sayısı
- `stock_level` - Stok seviyesi (%)
- `waste_rate` - Fire oranı (%)

### Available Actions
- `CLOSE_PLATFORM` - Platformu kapat
- `OPEN_PLATFORM` - Platformu aç
- `DISABLE_PRODUCT` - Ürünü pasife al
- `SEND_NOTIFICATION` - Bildirim gönder
- `HOLD_ORDERS` - Yeni siparişleri beklet

### Execution Cycle (Her dakika)
```typescript
@Cron('* * * * *')
async checkAllRules(): Promise<void> {
  const activeRules = await this.prisma.rule.findMany({
    where: { status: RuleStatus.ACTIVE },
    orderBy: { priority: 'desc' },
  });
  for (const rule of activeRules) {
    await this.executeRule(rule.id);
  }
}
```

---

## 4.12 Notification Service

### Channels
- **PUSH** - Firebase Cloud Messaging
- **SMS** - Twilio / Netgsm
- **WHATSAPP** - WhatsApp Business API
- **IN_APP** - WebSocket

### Usage
```typescript
await this.notificationService.send({
  type: NotificationType.NEW_ORDER,
  channel: NotificationChannel.PUSH,
  recipientId: userId,
  title: 'Yeni Sipariş',
  body: 'Sipariş #ORD-20260117-0001 alındı',
  data: { orderId: 123 }
});
```

---

# BÖLÜM 5: WEBSOCKET EVENTS

```
Namespace: /orders
├── newOrder              - Yeni sipariş geldi
├── orderStatusChanged    - Sipariş durumu değişti
└── orderCourierAssigned  - Kurye atandı

Namespace: /delivery
├── courierLocation       - Kurye konum güncellendi
├── deliveryCompleted     - Teslimat tamamlandı
└── courierStatusChanged  - Kurye durumu değişti

Namespace: /stock
├── criticalStock         - Kritik stok uyarısı
└── stockUpdated          - Stok güncellendi

Namespace: /notifications
└── newNotification       - Yeni bildirim
```

---

# BÖLÜM 6: FRONTEND SAYFALAR

```
/login                    - Giriş sayfası
/                         - Dashboard
/orders                   - Sipariş listesi (tablo + kanban)
/orders/[id]              - Sipariş detay
/stock                    - Stok yönetimi
/stock/recipes            - Reçete yönetimi
/stock/count              - Stok sayım
/delivery                 - Kurye listesi
/delivery/map             - Kurye haritası
/pos                      - Hızlı satış ekranı
/customers                - Müşteri listesi
/reports                  - Raporlar
/settings/menu            - Menü yönetimi
/settings/platforms       - Platform ayarları
/settings/rules           - Kural motoru
/settings/users           - Kullanıcı yönetimi
```

---

# BÖLÜM 7: GELİŞTİRME AŞAMALARI

## Faz 1: Temel Altyapı (Hafta 1-2)
- NestJS + Prisma + MySQL setup
- JWT authentication
- RBAC guards
- Next.js + Tailwind + shadcn/ui setup
- Login ve ana layout

## Faz 2: Sipariş Yönetimi (Hafta 3-4)
- Order CRUD
- Order status workflow
- WebSocket real-time updates
- Platform adapters (Getir başlangıç)

## Faz 3: Stok Yönetimi (Hafta 5-6)
- Stock & Recipe modules
- Auto-deduction on order
- Stock count
- Waste tracking

## Faz 4: Kurye & Teslimat (Hafta 7-8)
- Courier module
- Auto-assign algorithm
- Location tracking
- Cash management

## Faz 5: POS (Hafta 9-10)
- Quick sale
- Touch-friendly UI
- Receipt printing

## Faz 6: Raporlar (Hafta 11-12)
- Dashboard
- KPI calculations
- Charts

## Faz 7: Müşteri & Kurallar (Hafta 13-14)
- Customer module
- Rule engine
- Win-back system

## Faz 8: Platform Entegrasyonları (Hafta 15-16)
- Yemeksepeti adapter
- Trendyol adapter
- Menu sync

## Faz 9: Kurye Mobil App (Hafta 17-18)
- React Native + Expo
- Delivery list
- Navigation
- Push notifications

## Faz 10: Test & Polish (Hafta 19-20)
- Unit & E2E tests
- Bug fixes
- Documentation

---

# BÖLÜM 8: SEED DATA

Sistem başlangıcında oluşturulacak veriler:
- 1 Admin kullanıcı (admin@312doner.com / admin123)
- 1 Branch (312 Döner Merkez)
- 6 Kategori (Dönerler, İskenderler, Pideler, Lahmacunlar, İçecekler, Tatlılar)
- 14 Hammadde (Et, Tavuk, Lavaş, Sebzeler, İçecekler vb.)
- 7 Ürün (Döner Dürüm, Tavuk Döner, Porsiyon, İskender, Ayran, Kola, Su)
- Reçeteler (Her ürün için hammadde miktarları)
- 3 Platform config (Getir, Yemeksepeti, Trendyol - inactive)
- 3 Default kural (Kurye yoksa kapat, Uzun teslimat uyarısı, Fire uyarısı)
- Settings (Teslimat ücreti, max sipariş/kurye vb.)

---

# BÖLÜM 9: ÖNEMLİ NOTLAR

## Güvenlik
- Tüm endpoint'ler authentication gerektirir (login hariç)
- RBAC her endpoint'te uygulanır
- API keys environment variables'da tutulur
- Rate limiting uygulanır

## Performans
- Database indexes tüm FK ve sık sorgulanan alanlarda
- Redis caching dashboard ve KPI verileri için
- WebSocket real-time için (polling yerine)
- Pagination zorunlu

## Kısıtlamalar
- Sadece 312 Döner için (SaaS değil)
- Tek şube ile başlanacak
- Platform API'leri değişebilir - adapter pattern
- Türkçe UI, TRY para birimi, Europe/Istanbul timezone

---

**DOKÜMAN SONU**

*Bu PRD, Claude Code tarafından doğrudan kodlamaya başlamak için tüm gerekli bilgileri içerir. Her servis, endpoint, veri modeli ve business logic detaylı olarak tanımlanmıştır.*

---

# BÖLÜM 5: FRONTEND SAYFALAR

## 5.1 Sayfa Yapısı

```
/login                          # Giriş sayfası
/                              # Dashboard (ana sayfa)
/orders                        # Sipariş listesi
/orders/[id]                   # Sipariş detayı
/stock                         # Stok yönetimi
/stock/ingredients             # Hammadde listesi
/stock/recipes                 # Reçete yönetimi
/stock/count                   # Stok sayım
/delivery                      # Kurye yönetimi
/delivery/map                  # Kurye haritası
/delivery/[courierId]          # Kurye detay
/pos                           # Hızlı satış ekranı
/pos/tables                    # Masa yönetimi
/customers                     # Müşteri listesi
/customers/[id]                # Müşteri detay
/reports                       # Raporlar
/reports/sales                 # Satış raporları
/reports/profitability         # Karlılık analizi
/settings                      # Ayarlar
/settings/menu                 # Menü yönetimi
/settings/platforms            # Platform ayarları
/settings/rules                # Kural motoru
/settings/users                # Kullanıcı yönetimi
```

## 5.2 Ana Komponentler

### Dashboard Widgets
```typescript
// components/dashboard/DashboardStats.tsx
<StatCard title="Bugünkü Siparişler" value={data.todayOrders} change={data.ordersChangePercent} />
<StatCard title="Bugünkü Ciro" value={formatCurrency(data.todayRevenue)} change={data.revenueChangePercent} />
<StatCard title="Ortalama Teslimat" value={`${data.averageDeliveryTime} dk`} />
<StatCard title="Aktif Siparişler" value={data.activeOrders} />

// components/dashboard/ActiveOrdersWidget.tsx
// Real-time sipariş listesi (WebSocket)

// components/dashboard/AlertsWidget.tsx
// Kritik uyarılar (stok, kurye, kural tetikleme)

// components/dashboard/PlatformBreakdown.tsx
// Platform bazlı sipariş dağılımı (pie chart)
```

### Order Components
```typescript
// components/orders/OrderList.tsx
// Filtreleme, pagination, DataTable

// components/orders/OrderCard.tsx
// Sipariş kartı (durum renkleri, müşteri bilgisi, tutar)

// components/orders/OrderKanban.tsx
// Kanban view (PENDING -> CONFIRMED -> PREPARING -> READY -> ON_DELIVERY)

// components/orders/OrderStatusButtons.tsx
// Durum değiştirme butonları

// components/orders/OrderDetail.tsx
// Sipariş detay (items, history, müşteri, harita)
```

### POS Components
```typescript
// components/pos/QuickSale.tsx
// 3 kolon: Ürün grid | Sepet | Ödeme

// components/pos/ProductGrid.tsx
// Dokunmatik uyumlu ürün butonları

// components/pos/Cart.tsx
// Sepet yönetimi (miktar +/-, silme)

// components/pos/PaymentPanel.tsx
// Ödeme türü seçimi, tamamla butonu
```

### Delivery Components
```typescript
// components/delivery/CourierMap.tsx
// Leaflet harita, kurye markerları, sipariş markerları

// components/delivery/CourierList.tsx
// Kurye listesi (durum, aktif sipariş sayısı)

// components/delivery/CourierCard.tsx
// Kurye kartı (performans skoru, bakiye)

// components/delivery/AssignCourierModal.tsx
// Kurye atama modal (skor bilgisiyle)
```

### Stock Components
```typescript
// components/stock/StockOverview.tsx
// Stok durumu grid (kritik/normal/fazla)

// components/stock/StockCountForm.tsx
// Stok sayım formu

// components/stock/RecipeEditor.tsx
// Reçete düzenleme (ingredient + miktar)

// components/stock/WasteReport.tsx
// Fire analizi grafiği
```

## 5.3 Hooks ve State

```typescript
// hooks/useOrders.ts
export function useOrders(filters: OrderFilters) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => orderApi.getOrders(filters),
  });
}

export function useActiveOrders(branchId: number) {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    const socket = io('/orders', { query: { branchId } });
    
    socket.on('newOrder', (order) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(`Yeni sipariş: #${order.orderNumber}`);
      playNotificationSound();
    });
    
    socket.on('orderStatusChanged', () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    });
    
    return () => socket.disconnect();
  }, [branchId]);
  
  return useQuery({
    queryKey: ['orders', 'active', branchId],
    queryFn: () => orderApi.getActiveOrders(),
    refetchInterval: 30000,
  });
}

// stores/auth.store.ts
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      login: async (email, password) => { ... },
      logout: async () => { ... },
    }),
    { name: 'auth-storage' }
  )
);
```

---

# BÖLÜM 6: API ENDPOINT ÖZETİ

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AUTH                                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ POST   /api/auth/login              POST   /api/auth/refresh                │
│ POST   /api/auth/logout             GET    /api/auth/me                     │
│ POST   /api/auth/change-password                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ USERS                                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ GET    /api/users                   GET    /api/users/:id                   │
│ POST   /api/users                   PATCH  /api/users/:id                   │
│ DELETE /api/users/:id               PATCH  /api/users/:id/status            │
├─────────────────────────────────────────────────────────────────────────────┤
│ ORDERS                                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ GET    /api/orders                  GET    /api/orders/:id                  │
│ POST   /api/orders                  PATCH  /api/orders/:id/status           │
│ POST   /api/orders/:id/assign       POST   /api/orders/:id/cancel           │
│ GET    /api/orders/active           GET    /api/orders/stats                │
├─────────────────────────────────────────────────────────────────────────────┤
│ PRODUCTS & INGREDIENTS                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ GET    /api/products                POST   /api/products                    │
│ GET    /api/products/:id            PATCH  /api/products/:id                │
│ DELETE /api/products/:id            PATCH  /api/products/:id/toggle         │
│ GET    /api/ingredients             POST   /api/ingredients                 │
│ PATCH  /api/ingredients/:id         DELETE /api/ingredients/:id             │
├─────────────────────────────────────────────────────────────────────────────┤
│ RECIPES                                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ GET    /api/recipes/:productId      PUT    /api/recipes/:productId          │
│ GET    /api/recipes/:productId/cost POST   /api/recipes/recalculate         │
├─────────────────────────────────────────────────────────────────────────────┤
│ STOCK                                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ GET    /api/stock                   GET    /api/stock/:id                   │
│ POST   /api/stock/movement          POST   /api/stock/count                 │
│ GET    /api/stock/movements         GET    /api/stock/alerts                │
│ GET    /api/stock/waste-report                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ DELIVERY                                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ GET    /api/delivery/couriers       GET    /api/delivery/couriers/:id       │
│ PATCH  /api/delivery/couriers/:id/status                                    │
│ POST   /api/delivery/couriers/:id/location                                  │
│ GET    /api/delivery/couriers/:id/orders                                    │
│ POST   /api/delivery/auto-assign    POST   /api/delivery/complete/:orderId  │
│ GET    /api/delivery/couriers/:id/performance                               │
│ POST   /api/delivery/couriers/:id/cash                                      │
│ GET    /api/delivery/couriers/:id/balance                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ CUSTOMERS                                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ GET    /api/customers               GET    /api/customers/:id               │
│ GET    /api/customers/:id/orders    GET    /api/customers/sleeping          │
│ POST   /api/customers/:id/winback   GET    /api/customers/stats             │
│ POST   /api/customers/:id/convert                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ PLATFORMS                                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ GET    /api/platforms               GET    /api/platforms/:platform         │
│ PATCH  /api/platforms/:platform     POST   /api/platforms/:platform/toggle  │
│ POST   /api/platforms/:platform/sync-orders                                 │
│ POST   /api/platforms/:platform/sync-menu                                   │
│ GET    /api/platforms/:platform/logs                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ POS                                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ POST   /api/pos/quick-sale          GET    /api/pos/products                │
│ GET    /api/pos/tables              POST   /api/pos/tables/:id/open         │
│ POST   /api/pos/tables/:id/add      POST   /api/pos/tables/:id/close        │
│ GET    /api/pos/daily-summary                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ REPORTS                                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ GET    /api/reports/dashboard       GET    /api/reports/kpis                │
│ GET    /api/reports/sales           GET    /api/reports/platform-comparison │
│ GET    /api/reports/product-performance                                     │
│ GET    /api/reports/courier-performance                                     │
│ GET    /api/reports/profitability   POST   /api/reports/generate-daily      │
│ GET    /api/reports/export                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ RULES                                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ GET    /api/rules                   GET    /api/rules/:id                   │
│ POST   /api/rules                   PATCH  /api/rules/:id                   │
│ DELETE /api/rules/:id               POST   /api/rules/:id/toggle            │
│ GET    /api/rules/:id/executions    POST   /api/rules/:id/test              │
│ POST   /api/rules/:id/rollback                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ NOTIFICATIONS                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ POST   /api/notifications/send      GET    /api/notifications               │
│ PATCH  /api/notifications/:id/read  GET    /api/notifications/unread        │
├─────────────────────────────────────────────────────────────────────────────┤
│ SETTINGS                                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ GET    /api/settings                GET    /api/settings/:key               │
│ PUT    /api/settings/:key           GET    /api/settings/branches           │
│ POST   /api/settings/branches       PATCH  /api/settings/branches/:id       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# BÖLÜM 7: WEBSOCKET EVENTS

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ NAMESPACE: /orders                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ Client → Server                                                              │
│   joinBranch(branchId)           # Şube odasına katıl                        │
│   leaveBranch(branchId)          # Şube odasından ayrıl                      │
│                                                                              │
│ Server → Client                                                              │
│   newOrder(order)                # Yeni sipariş                              │
│   orderStatusChanged(payload)    # Durum değişti                             │
│   orderCourierAssigned(order)    # Kurye atandı                              │
│   orderCancelled(order)          # Sipariş iptal                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ NAMESPACE: /delivery                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Client → Server                                                              │
│   joinAsCourier(courierId)       # Kurye olarak katıl                        │
│   updateLocation(lat, lng)       # Konum güncelle                            │
│   joinBranch(branchId)           # Şube odasına katıl                        │
│                                                                              │
│ Server → Client                                                              │
│   courierLocation(payload)       # Kurye konum güncelleme                    │
│   newDelivery(order)             # Yeni teslimat atandı                      │
│   deliveryCompleted(order)       # Teslimat tamamlandı                       │
│   courierStatusChanged(courier)  # Kurye durumu değişti                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ NAMESPACE: /stock                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Server → Client                                                              │
│   criticalStock(payload)         # Kritik stok uyarısı                       │
│   stockUpdated(branchId)         # Stok güncellendi                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ NAMESPACE: /notifications                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Client → Server                                                              │
│   subscribe(userId)              # Bildirimlere abone ol                     │
│                                                                              │
│ Server → Client                                                              │
│   notification(payload)          # Yeni bildirim                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# BÖLÜM 8: GELİŞTİRME FAZLARI

## Faz 1: Temel Altyapı (2 Hafta)

### Backend
- [ ] NestJS proje kurulumu (modüler yapı)
- [ ] Prisma schema ve migration
- [ ] Auth module (JWT + Refresh Token)
- [ ] User module (CRUD + RBAC)
- [ ] Global filters, guards, interceptors
- [ ] Swagger API documentation
- [ ] Seed data

### Frontend
- [ ] Next.js proje kurulumu (App Router)
- [ ] shadcn/ui component library kurulumu
- [ ] Auth flow (login, logout, protected routes)
- [ ] Layout (sidebar, header, mobile responsive)
- [ ] API client setup (axios + interceptors)
- [ ] TanStack Query setup
- [ ] Zustand stores

### DevOps
- [ ] Docker compose (MySQL, Redis)
- [ ] Environment configuration

---

## Faz 2: Sipariş Yönetimi (3 Hafta)

### Backend
- [ ] Order module (CRUD, status management)
- [ ] Product & Category modules
- [ ] Platform module (adapter pattern)
- [ ] Getir API entegrasyonu
- [ ] WebSocket gateway (orders namespace)
- [ ] BullMQ setup (order sync job)

### Frontend
- [ ] Order list page (filters, pagination)
- [ ] Order detail page
- [ ] Order kanban view
- [ ] Real-time order updates (WebSocket)
- [ ] Product management page
- [ ] Platform settings page

---

## Faz 3: Stok & Reçete (2 Hafta)

### Backend
- [ ] Ingredient module
- [ ] Recipe module
- [ ] Stock module (movements, counts)
- [ ] Auto stock deduction on order
- [ ] Stock alerts
- [ ] Waste report

### Frontend
- [ ] Ingredient list page
- [ ] Recipe editor
- [ ] Stock overview page
- [ ] Stock count form
- [ ] Stock alerts widget

---

## Faz 4: Kurye & Teslimat (3 Hafta)

### Backend
- [ ] Courier module
- [ ] Delivery service (auto-assign algorithm)
- [ ] Location tracking
- [ ] Cash balance management
- [ ] Performance scoring
- [ ] WebSocket gateway (delivery namespace)

### Frontend
- [ ] Courier list page
- [ ] Courier map view (Leaflet)
- [ ] Courier detail page
- [ ] Delivery assignment modal
- [ ] Real-time courier tracking
- [ ] Cash transaction forms

---

## Faz 5: POS & Fiziksel Satış (2 Hafta)

### Backend
- [ ] POS module
- [ ] Quick sale endpoint
- [ ] Daily summary

### Frontend
- [ ] POS quick sale screen (touch-friendly)
- [ ] Product grid
- [ ] Cart management
- [ ] Payment method selection
- [ ] Daily summary view

---

## Faz 6: Müşteri & Sadakat (2 Hafta)

### Backend
- [ ] Customer module
- [ ] Customer tracking (from orders)
- [ ] Sleeping customer detection (cron)
- [ ] Win-back messaging

### Frontend
- [ ] Customer list page
- [ ] Customer detail page
- [ ] Sleeping customers list
- [ ] Win-back action buttons

---

## Faz 7: Raporlar & KPI (2 Hafta)

### Backend
- [ ] Report module
- [ ] Dashboard aggregations
- [ ] KPI calculations
- [ ] Daily report generation (cron)
- [ ] Export functionality (CSV, XLSX)

### Frontend
- [ ] Dashboard page (widgets, charts)
- [ ] Sales report page
- [ ] Profitability report page
- [ ] Courier performance report
- [ ] Export buttons

---

## Faz 8: Kural Motoru (1 Hafta)

### Backend
- [ ] Rule engine module
- [ ] Metric providers
- [ ] Rule execution (cron)
- [ ] Rollback mechanism

### Frontend
- [ ] Rule list page
- [ ] Rule creator/editor
- [ ] Rule execution history

---

## Faz 9: Bildirimler & Son Dokunuşlar (1 Hafta)

### Backend
- [ ] Notification module
- [ ] Push notification (Firebase)
- [ ] SMS integration
- [ ] In-app notifications

### Frontend
- [ ] Notification bell
- [ ] Notification dropdown
- [ ] Sound alerts
- [ ] Settings page

---

## Faz 10: Mobile App (3+ Hafta)

### React Native / Expo
- [ ] Project setup
- [ ] Auth flow
- [ ] Delivery list screen
- [ ] Active delivery screen
- [ ] Map & navigation
- [ ] Location tracking (background)
- [ ] Push notifications
- [ ] Cash balance screen

---

# BÖLÜM 9: ENVIRONMENT VARIABLES

```env
# apps/api/.env
DATABASE_URL="mysql://root:password@localhost:3306/kokpit"
REDIS_URL="redis://localhost:6379"

JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_REFRESH_SECRET="your-refresh-secret-key-min-32-chars"

# Platform APIs
GETIR_API_KEY=""
GETIR_API_SECRET=""
YEMEKSEPETI_API_KEY=""
TRENDYOL_API_KEY=""

# Google Maps
GOOGLE_MAPS_API_KEY=""

# Notifications
FIREBASE_PROJECT_ID=""
FIREBASE_PRIVATE_KEY=""
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""

# apps/web/.env
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_WS_URL="ws://localhost:3001"
NEXT_PUBLIC_GOOGLE_MAPS_KEY=""
```

---

# BÖLÜM 10: DOCKER COMPOSE

```yaml
version: '3.8'

services:
  db:
    image: mysql:8
    container_name: kokpit-db
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD:-rootpassword}
      MYSQL_DATABASE: kokpit
      MYSQL_USER: kokpit
      MYSQL_PASSWORD: ${DB_PASSWORD:-kokpitpassword}
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    command: --default-authentication-plugin=mysql_native_password

  redis:
    image: redis:7-alpine
    container_name: kokpit-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: kokpit-api
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=mysql://kokpit:${DB_PASSWORD:-kokpitpassword}@db:3306/kokpit
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    container_name: kokpit-web
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://api:3001
    depends_on:
      - api

volumes:
  mysql_data:
  redis_data:
```

---

# BÖLÜM 11: BAŞARI KRİTERLERİ

| Metrik | Hedef |
|--------|-------|
| Stok farkı (Teorik vs Fiili) | < %1 |
| Ortalama teslim süresi | < 30 dk |
| Teslim süresi iyileşmesi | %20 azalma |
| Doğrudan sipariş oranı | > %25 |
| Operasyonel manuel müdahale | %50 azalma |
| Zarar eden ürün sayısı | 0 |
| Fire oranı | < %3 |
| Kurye performans tutarlılığı | > %90 |

---

# BÖLÜM 12: SONUÇ

Bu PRD, Kokpit projesinin tüm teknik detaylarını içermektedir:

1. **Servis bazlı mimari** - Her modül bağımsız ve test edilebilir
2. **Tam type safety** - TypeScript + Prisma + Zod
3. **Real-time** - WebSocket ile anlık güncellemeler
4. **Ölçeklenebilir** - Modüler yapı, queue sistemi
5. **Otomatik** - Kural motoru ile otonom operasyon

## Claude Code Kullanım Talimatları

Bu dokümanı kullanarak:

1. **Backend API'lerini** NestJS ile geliştir
   - Her modül için controller, service, dto, entity oluştur
   - Prisma schema'yı kopyala ve migrate et
   - Guards ve decorators'ları implement et

2. **Frontend sayfalarını** Next.js ile oluştur
   - App Router kullan
   - shadcn/ui componentlerini kur
   - TanStack Query ile data fetching yap
   - Zustand ile state yönet

3. **WebSocket entegrasyonunu** yap
   - Socket.IO gateway'leri oluştur
   - Client tarafında hook'lar yaz

4. **Tüm servisleri** entegre et
   - Platform adapter'larını implement et
   - Cron job'ları ayarla
   - BullMQ queue'larını konfigüre et

---

**Doküman Sonu**

*Versiyon: 3.0 - Ocak 2026*
