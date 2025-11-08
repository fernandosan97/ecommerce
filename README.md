# API REST de Ecommerce - Tipo Amazon

API REST completa para un sistema de ecommerce con control de concurrencia, manejo de stock e inventario, y sistema de facturación.

## Características

- ✅ Gestión de productos (CRUD completo)
- ✅ Control de stock e inventario
- ✅ Sistema de facturación con múltiples productos
- ✅ **Control de concurrencia**: Previene ventas que excedan el stock disponible, incluso con peticiones simultáneas
- ✅ Transacciones de base de datos con bloqueos pesimistas
- ✅ Validación de stock en tiempo real

## Tecnologías

- **Node.js** con **Express**
- **PostgreSQL** como base de datos
- **Prisma ORM** para gestión de base de datos
- **Transacciones** con bloqueos pesimistas para control de concurrencia

## Instalación

### 1. Clonar e instalar dependencias

```bash
npm install
```

### 2. Configurar base de datos

Crea un archivo `.env` en la raíz del proyecto:

```env
DATABASE_URL="postgresql://usuario:password@localhost:5432/ecommerce?schema=public"
PORT=3000
NODE_ENV=development
```

### 3. Configurar Prisma

```bash
# Generar el cliente de Prisma
npm run prisma:generate

# Ejecutar migraciones
npm run prisma:migrate
```

### 4. Iniciar el servidor

```bash
# Modo desarrollo (con watch)
npm run dev

# Modo producción
npm start
```

El servidor estará disponible en `http://localhost:3000`

## Endpoints de la API

### Productos

#### GET `/api/products`
Obtiene todos los productos con su stock.

**Respuesta:**
```json
[
  {
    "id": "uuid",
    "name": "Producto 1",
    "description": "Descripción",
    "price": "99.99",
    "sku": "SKU001",
    "stock": {
      "id": "uuid",
      "productId": "uuid",
      "quantity": 100,
      "reserved": 0
    }
  }
]
```

#### GET `/api/products/:id`
Obtiene un producto específico por ID.

#### POST `/api/products`
Crea un nuevo producto.

**Body:**
```json
{
  "name": "Producto 1",
  "description": "Descripción del producto",
  "price": 99.99,
  "sku": "SKU001",
  "initialStock": 100
}
```

#### PUT `/api/products/:id`
Actualiza un producto existente.

#### DELETE `/api/products/:id`
Elimina un producto.

#### PUT `/api/products/:productId/stock`
Actualiza el stock de un producto.

**Body:**
```json
{
  "quantity": 150
}
```

### Facturas

#### GET `/api/invoices`
Obtiene todas las facturas con sus items.

#### GET `/api/invoices/:id`
Obtiene una factura específica por ID.

#### POST `/api/invoices`
Crea una nueva factura con **bloqueo pesimista** (por defecto).

**Body:**
```json
{
  "items": [
    {
      "productId": "uuid-del-producto-1",
      "quantity": 2
    },
    {
      "productId": "uuid-del-producto-2",
      "quantity": 1
    }
  ]
}
```

**Respuesta exitosa:**
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-00000001",
  "total": "299.97",
  "status": "CONFIRMED",
  "items": [
    {
      "id": "uuid",
      "productId": "uuid",
      "quantity": 2,
      "unitPrice": "99.99",
      "subtotal": "199.98",
      "product": {
        "id": "uuid",
        "name": "Producto 1",
        "price": "99.99"
      }
    }
  ]
}
```

**Errores posibles:**
- `400`: Stock insuficiente
- `409`: Error de concurrencia después de múltiples reintentos (muy raro)

#### POST `/api/invoices/optimistic`
Crea una nueva factura con **bloqueo optimista**.

**Body:** (igual que el endpoint anterior)

**Respuesta:** (igual que el endpoint anterior)

**Errores posibles:**
- `400`: Stock insuficiente
- `409`: Error de concurrencia después de múltiples reintentos (muy raro)

**Nota:** Este endpoint usa bloqueo optimista en lugar de pesimista. Ver sección "Bloqueo Pesimista vs Optimista" para más detalles.

#### PUT `/api/invoices/:id/cancel`
Cancela una factura y devuelve el stock.

## Control de Concurrencia

El sistema implementa control de concurrencia mediante:

1. **Transacciones de base de datos**: Todas las operaciones de facturación se realizan dentro de una transacción.
2. **Dos estrategias de bloqueo disponibles**:
   - **Bloqueo pesimista** (endpoint `/api/invoices`): Uso de `SELECT FOR UPDATE` para bloquear registros
   - **Bloqueo optimista** (endpoint `/api/invoices/optimistic`): Verificación de versión sin bloqueo
3. **Reserva de stock**: El stock se reserva temporalmente antes de confirmar la venta, evitando condiciones de carrera.
4. **Validación en tiempo real**: Se verifica la disponibilidad de stock antes de crear la factura.
5. **Mecanismo de retry automático**: Si hay un conflicto de concurrencia temporal, el sistema reintenta automáticamente durante hasta 10 segundos antes de descartar la petición.

### Bloqueo Pesimista vs Optimista

#### Comparación de Rendimiento

**¿Cuál es más rápido?**

La respuesta depende del escenario:

| Escenario | Bloqueo Pesimista | Bloqueo Optimista | Ganador |
|-----------|-------------------|-------------------|---------|
| **Baja contención** (pocas peticiones simultáneas sobre el mismo producto) | Bloquea innecesariamente, causando esperas | No bloquea, procesa inmediatamente | ✅ **Optimista** (más rápido) |
| **Alta contención** (muchas peticiones simultáneas sobre el mismo producto) | Evita reintentos, pero puede causar esperas largas en cola | Requiere múltiples reintentos con backoff | ⚖️ **Depende** (pesimista puede ser más rápido si las transacciones son cortas) |
| **Contención moderada** | Funciona bien, pero puede tener esperas | Funciona bien con algunos reintentos | ⚖️ **Similar** |

**Conclusión:** En la mayoría de los casos, el **bloqueo optimista es más rápido** porque:
- No bloquea innecesariamente cuando no hay conflicto
- Permite que múltiples transacciones se procesen en paralelo
- Los reintentos solo ocurren cuando realmente hay conflicto

El bloqueo pesimista puede ser más lento porque:
- Bloquea el recurso incluso cuando no hay conflicto
- Crea una cola de espera cuando hay muchas peticiones simultáneas
- Puede causar deadlocks en escenarios complejos

#### Bloqueo Pesimista (`POST /api/invoices`)

**Cómo funciona:**
- Bloquea el registro de stock con `SELECT FOR UPDATE` durante toda la transacción
- Otras transacciones deben **esperar** hasta que se libere el bloqueo
- Garantiza que solo una transacción puede modificar el stock a la vez

**Ventajas:**
- ✅ Mayor garantía de consistencia
- ✅ Evita reintentos fallidos
- ✅ Funciona bien cuando las transacciones son muy cortas

**Desventajas:**
- ⚠️ **Puede ser más lento** porque bloquea innecesariamente
- ⚠️ Crea colas de espera cuando hay muchas peticiones simultáneas
- ⚠️ Puede causar deadlocks en escenarios complejos
- ⚠️ Menor throughput general en la mayoría de escenarios

**Cuándo usarlo:**
- Cuando las transacciones son muy cortas (< 10ms)
- Cuando necesitas garantía absoluta de que no habrá conflictos
- Cuando prefieres esperas predecibles en lugar de reintentos

#### Bloqueo Optimista (`POST /api/invoices/optimistic`)

**Cómo funciona:**
- Lee el registro de stock con su versión actual (sin bloqueo)
- Al actualizar, verifica que la versión no haya cambiado (`WHERE version = oldVersion`)
- Si la versión cambió, detecta el conflicto y reintenta automáticamente

**Ventajas:**
- ✅ **Generalmente más rápido** porque no bloquea innecesariamente
- ✅ Mayor throughput en la mayoría de escenarios
- ✅ Permite procesamiento paralelo cuando no hay conflicto
- ✅ No causa deadlocks
- ✅ Ideal para la mayoría de casos de uso

**Desventajas:**
- ⚠️ Puede requerir más reintentos si hay alta contención
- ⚠️ Más complejo de implementar

**Cuándo usarlo:**
- **Recomendado por defecto** para la mayoría de casos
- Cuando esperas baja o moderada contención
- Cuando quieres maximizar el throughput
- Cuando prefieres reintentos automáticos en lugar de esperas

**Recomendación General:**
- 🎯 **Usa bloqueo optimista por defecto** (`/api/invoices/optimistic`) - Es más rápido en la mayoría de casos
- Usa bloqueo pesimista solo si tienes transacciones muy cortas y alta contención específica

### Mecanismo de Retry

Cuando ocurre un error de concurrencia (P2034), el sistema:

- **Reintenta automáticamente** durante un máximo de **10 segundos**
- Usa **backoff exponencial** con jitter aleatorio para evitar el efecto "thundering herd"
- Aumenta el tiempo de espera entre intentos (100ms → 150ms → 225ms → ... hasta 1 segundo máximo)
- Solo descarta la petición si después de 10 segundos aún hay conflictos

Esto significa que en la mayoría de los casos, las peticiones concurrentes se procesarán exitosamente sin necesidad de que el cliente las reintente manualmente.

### Ejemplo de flujo de facturación con bloqueo pesimista:

1. Se recibe la petición de crear factura
2. Se intenta ejecutar la transacción:
   - Se inicia una transacción
   - Para cada producto:
     - Se bloquea el registro de stock (`SELECT FOR UPDATE`)
     - Se verifica disponibilidad (quantity - reserved >= cantidad solicitada)
     - Se reserva el stock (reserved += cantidad)
   - Se crea la factura y sus items
   - Se confirma la reserva (quantity -= cantidad, reserved -= cantidad)
   - Se confirma la transacción
3. Si hay un error de concurrencia (P2034):
   - Se espera un tiempo (con backoff exponencial)
   - Se reintenta automáticamente
   - Se repite hasta éxito o hasta agotar los 10 segundos
4. Si el stock es insuficiente, se rechaza inmediatamente (no se reintenta)

### Ejemplo de flujo de facturación con bloqueo optimista:

1. Se recibe la petición de crear factura
2. Se intenta ejecutar la transacción:
   - Se inicia una transacción
   - Para cada producto:
     - Se lee el registro de stock con su versión (sin bloqueo)
     - Se verifica disponibilidad (quantity - reserved >= cantidad solicitada)
     - Se guarda la versión actual
   - Se intenta actualizar el stock con verificación de versión:
     - `UPDATE Stock SET reserved = reserved + cantidad, version = version + 1 WHERE productId = X AND version = versionGuardada`
     - Si no se actualizó ninguna fila (versión cambió), se detecta conflicto
   - Si hay conflicto, se lanza `ConcurrencyError` y se reintenta
   - Si no hay conflicto, se crea la factura y sus items
   - Se confirma la reserva con verificación de versión
   - Se confirma la transacción
3. Si hay un error de concurrencia (`ConcurrencyError`):
   - Se espera un tiempo (con backoff exponencial)
   - Se reintenta automáticamente
   - Se repite hasta éxito o hasta agotar los 10 segundos
4. Si el stock es insuficiente, se rechaza inmediatamente (no se reintenta)

Si en cualquier momento el stock es insuficiente, la transacción se revierte inmediatamente. Los errores de concurrencia se manejan con retry automático.

## Pruebas de Concurrencia

Para probar el control de concurrencia, puedes hacer múltiples peticiones simultáneas:

```bash
# Ejemplo con curl (en terminales separadas o con scripts)
curl -X POST http://localhost:3000/api/invoices \
  -H "Content-Type: application/json" \
  -d '{"items": [{"productId": "uuid", "quantity": 10}]}'
```

El sistema garantiza que no se venderá más stock del disponible, incluso con peticiones simultáneas.

## Estructura del Proyecto

```
ecommerce/
├── prisma/
│   └── schema.prisma          # Esquema de base de datos
├── src/
│   ├── config/
│   │   └── database.js        # Configuración de Prisma
│   ├── controllers/
│   │   ├── productController.js
│   │   └── invoiceController.js
│   ├── middleware/
│   │   └── errorHandler.js    # Manejo de errores
│   ├── routes/
│   │   ├── productRoutes.js
│   │   └── invoiceRoutes.js
│   └── server.js              # Servidor Express
├── .env                       # Variables de entorno
├── .gitignore
├── package.json
└── README.md
```

## Notas Importantes

- El sistema usa PostgreSQL. Asegúrate de tener PostgreSQL instalado y corriendo.
- Las transacciones tienen un timeout de 10 segundos.
- El stock reservado se usa para evitar condiciones de carrera durante el proceso de facturación.
- Los números de factura se generan automáticamente con formato `INV-00000001`.
- **Mecanismo de retry**: Las peticiones con errores de concurrencia se reintentan automáticamente durante hasta 10 segundos antes de fallar, mejorando significativamente la tolerancia a peticiones simultáneas.
- **Dos estrategias de bloqueo**: El sistema ofrece tanto bloqueo pesimista como optimista, permitiendo elegir la estrategia más adecuada según el caso de uso.

## Licencia

ISC

