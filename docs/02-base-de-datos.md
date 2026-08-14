# 02 — Base de datos (esquema Prisma)

Esquema completo en Prisma. Mapea 1:1 las entidades actuales de Base44. Los campos built-in (`id`, `created_date`, `updated_date`, `created_by_id`) se declaran explícitamente acá.

```prisma
// schema.prisma
generator client { provider = "prisma-client-js" }
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL") // postgresql://accredit:pass@localhost:5432/accreditevent
}

// ---------- Built-in ----------
model BaseFields {
  // Mixin conceptual — replicar en cada modelo:
  // id            String   @id @default(uuid())
  // created_date  DateTime @default(now())
  // updated_date  DateTime @updatedAt
  // created_by_id String?
}

// ---------- Usuario ----------
model User {
  id                String   @id @default(uuid())
  created_date      DateTime @default(now())
  updated_date      DateTime @updatedAt
  full_name         String?
  email             String   @unique
  password_hash     String   // bcrypt
  role              String   @default("user") // superadmin|admin|coordinator|productora|operador|control|pda|provider|empresa
  company           String?  // nombre de la empresa (productora/empresa)
  assigned_event_ids String[] @default([])
  allowed_paths     String[] @default([])
  blocked           Boolean  @default(false)
  data              Json     @default("{}") // campos extra (phone, etc.)
}

model PendingOperator {
  id                 String   @id @default(uuid())
  created_date       DateTime @default(now())
  updated_date       DateTime @updatedAt
  email              String
  company            String
  desired_role       String   @default("operador")
  assigned_event_ids String[] @default([])
  allowed_paths      String[] @default([])
  invite_url         String?
  status             String   @default("pending") // pending|processed
  @@unique([email])
}

// ---------- Empresas ----------
model Company {
  id                   String   @id @default(uuid())
  created_date         DateTime @default(now())
  updated_date         DateTime @updatedAt
  name                 String   @unique
  slug                 String?
  description          String?
  logo_url             String?
  assigned_user_ids    String[] @default([])
  operator_allowed_paths String[] @default([])
}

model ProviderCompany {
  id              String   @id @default(uuid())
  created_date    DateTime @default(now())
  updated_date    DateTime @updatedAt
  name            String
  description     String?
  logo_url        String?
  cuit            String?
  address         String?
  responsible_name String?
  contact_phone   String?
  contact_email   String?
  insurance_kind  String   @default("") // ART | AP | ""
  custom_fields   Json     @default("{}")
}

// ---------- Eventos ----------
model Event {
  id                String   @id @default(uuid())
  created_date      DateTime @default(now())
  updated_date      DateTime @updatedAt
  name              String
  venue             String?
  logo_url          String?
  company           String?
  start_at          DateTime?
  end_at            DateTime?
  show_days         Int      @default(1)
  armado_start      DateTime?
  armado_end        DateTime?
  desarme_start     DateTime?
  desarme_end       DateTime?
  status            String   @default("draft") // draft|active|closed
  pickup_date       DateTime?
  pickup_start_time String?
  pickup_end_time   String?
  pickup_address    String?
  pickup_lat        Float?
  pickup_lng        Float?
  assigned_user_ids String[] @default([])
  insurance_non_repetition_clauses String[] @default([])
  insurance_insured_amount Float?
  parking_capacities Json   @default("{}") // { sectorValue: number }
  custom_fields      Json    @default("{}")
}

model EventCompanyApproval {
  id              String   @id @default(uuid())
  created_date    DateTime @default(now())
  updated_date    DateTime @updatedAt
  event_id        String
  event_name      String?
  company         String?
  provider_company String
  status          String   @default("pending") // pending|approved|rejected
  approved_by     String?
  load_start_date DateTime?
  load_end_date   DateTime?
  notes           String?
}

// ---------- Personas ----------
model Person {
  id                     String   @id @default(uuid())
  created_date           DateTime @default(now())
  updated_date           DateTime @updatedAt
  full_name              String
  document               String?  // DNI — validar único global
  tipo_vinculo           String   @default("empresa") // empresa|autonomo
  company                String?  // empresa proveedora
  productora             String?  // productora del evento (RLS)
  phone                  String?
  email                  String?
  person_type            String?  @default("provider")
  employment_type        String   @default("fijo") // fijo|eventual
  access_area            String?
  event_phases           String[] @default([]) // armado|dia_1..dia_6|desarme
  event_id               String?
  event_ids              String[] @default([])
  event_names            String[] @default([])
  notes                  String?
  obra_social            String?
  carnet_obra_social     String?
  emergency_contact_name String?
  emergency_contact_phone String?
  allergies              String?
  blood_type             String   @default("")
  coordinator_name       String?
  custom_fields          Json     @default("{}")
  status                 String   @default("active")
  @@unique([document])
}

// ---------- Acreditaciones ----------
model Accreditation {
  id                  String   @id @default(uuid())
  created_date        DateTime @default(now())
  updated_date        DateTime @updatedAt
  event_id            String
  event_name          String?
  company             String?
  person_id           String
  person_name         String?
  person_type         String?
  person_email        String?
  badge_code          String   @unique
  area                String?
  access_level        String   @default("general")
  event_phases        String[] @default([])
  status              String   @default("active") // active|blocked|revoked
  block_reason        String?
  has_biometric       Boolean  @default(false)
  delivered_personal  Boolean  @default(false)
  delivered_vehicular Boolean  @default(false)
  custom_fields       Json     @default("{}")
}

// ---------- Biometría ----------
model Biometric {
  id              String   @id @default(uuid())
  created_date    DateTime @default(now())
  updated_date    DateTime @updatedAt
  accreditation_id String?
  person_id       String
  person_name     String?
  event_id        String?
  company         String?
  face_photo_url  String?
  face_descriptor Float[]  // 128 dimensiones
  status          String   @default("pending")
}

// ---------- Vehículos ----------
model Vehicle {
  id            String   @id @default(uuid())
  created_date  DateTime @default(now())
  updated_date  DateTime @updatedAt
  person_id     String
  person_name   String?
  company       String?
  vehicle_type  String   @default("auto")
  brand         String
  model         String
  plate         String
  color         String?
  parking_sector String?
  event_ids     String[] @default([])
  event_names   String[] @default([])
  status        String   @default("pending") // approved|pending|rejected
  notes         String?
  custom_fields Json     @default("{}")
}

// ---------- Documentos ----------
model Document {
  id              String   @id @default(uuid())
  created_date    DateTime @default(now())
  updated_date    DateTime @updatedAt
  person_id       String?
  person_name     String?
  event_id        String?
  company         String?
  document_type   String
  original_name   String
  file_url        String
  mime_type       String?
  size            Int?
  status          String   @default("pending") // pending|approved|rejected|expired
  review_note     String?
  reviewed_by     String?
  reviewed_at     DateTime?
  expires_at      DateTime?
  expiry_notified_at DateTime?
  custom_fields   Json     @default("{}")
}

// ---------- Accesos ----------
model AccessLog {
  id              String   @id @default(uuid())
  created_date    DateTime @default(now())
  accreditation_id String
  person_name     String?
  badge_code      String?
  event_id        String?
  event_name      String?
  company         String?
  verified_by     String?
  pda_number      String?
  method          String   @default("biometric") // biometric|manual
  resource_type   String   @default("person") // person|vehicle
  zone            String?
  door            String?
  result          String   @default("granted") // granted|denied
  denied_reason   String   @default("") // zone|phase|not_found|blocked
  access_level    String?
  client_uuid     String?  @unique // idempotencia para sync offline
}

model PdaStation {
  id               String   @id @default(uuid())
  created_date     DateTime @default(now())
  updated_date     DateTime @updatedAt
  station_number   String   @unique
  label            String?
  assigned_event_id String?
  assigned_zone    String?
  assigned_sectors String[] @default([])
  event_id         String?
  event_name       String?
  company          String?
  operator_name    String?
  mode             String   @default("person") // person|vehicle
  last_seen        DateTime?
  pending_sync     Int      @default(0)
  battery_level    Float?
  admin_pin        String   @default("1234")
}

// ---------- Configuración ----------
model SystemSetting {
  id               String   @id @default(uuid())
  created_date     DateTime @default(now())
  updated_date     DateTime @updatedAt
  system_name      String?
  organization_name String?
  logo_url         String?
  theme            Json     @default("{}")
  mail_from        String?
  mail_host        String?
  mail_port        Int?
  mail_user        String?
  mail_password    String?
  whatsapp_token   String?
  whatsapp_phone_id String?
  printer_personal String?
  printer_vehicular String?
  role_access      Json     @default("{}") // { "/people": ["productora","admin"] }
  zones            Json     @default("[]") // [{value,label}]
  doors            Json     @default("[]")
  event_phases     Json     @default("[]")
  employment_types Json     @default("[]")
  person_types     Json     @default("[]")
  default_grace_hours Int   @default(4)
  enabled_modules  Json     @default("{}")
}

model CustomField {
  id          String   @id @default(uuid())
  created_date DateTime @default(now())
  entity_name String   // Person|Event|Accreditation|...
  field_key   String
  field_label String
  field_type  String   @default("text") // text|textarea|number|date|boolean|select
  options     Json     @default("[]")
  required    Boolean  @default(false)
  default_value String?
  description String?
  is_active   Boolean  @default(true)
  sort_order  Int      @default(0)
}

// ---------- Catálogos ----------
model DocumentType { id String @id @default(uuid()) value String @unique label String description String? }
model ParkingSector { id String @id @default(uuid()) value String @unique label String description String? }
model AccessLevel { id String @id @default(uuid()) value String @unique label String description String? }

// ---------- Logística / Solicitudes ----------
model RequirementItem {
  id String @id @default(uuid()) name String description String?
  category String? unit String @default("Unidad")
  requires_quantity Boolean @default(true) is_active Boolean @default(true)
}
model ProviderRequest {
  id String @id @default(uuid()) created_date DateTime @default(now())
  event_id String event_name String? company String?
  person_id String person_name String? person_email String?
  items Json @default("[]") status String @default("pending")
  notes String? admin_notes String?
}

// ---------- Audit / ZKTeco ----------
model AuditLog {
  id String @id @default(uuid()) created_date DateTime @default(now())
  actor_name String? actor_id String? action String entity String
  entity_id String? detail String?
}
model ZKTecoDevice { id String @id @default(uuid()) name String ip String? event_id String? status String @default("offline") last_seen DateTime? }
model ZKTecoCommand {
  id String @id @default(uuid()) device_id String event_id String?
  command_type String // sync_user|delete_user|clear_data
  command_data String person_id String? person_name String? status String @default("pending")
}
```

## Migración inicial
```bash
npx prisma migrate dev --name init
npx prisma generate
``