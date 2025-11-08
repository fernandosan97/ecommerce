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

**Parámetros:** Ninguno

**Respuesta exitosa (200):**
```json
[
  {
    "id": "uuid",
    "name": "Producto 1",
    "description": "Descripción del producto",
    "price": "99.99",
    "sku": "SKU001",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "stock": {
      "id": "uuid",
      "productId": "uuid",
      "quantity": 100,
      "reserved": 0,
      "version": 0,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
]
```

---

#### GET `/api/products/:id`
Obtiene un producto específico por ID.

**Parámetros de URL:**
- `id` (string, requerido): UUID del producto

**Respuesta exitosa (200):**
```json
{
  "id": "uuid",
  "name": "Producto 1",
  "description": "Descripción del producto",
  "price": "99.99",
  "sku": "SKU001",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "stock": {
    "id": "uuid",
    "productId": "uuid",
    "quantity": 100,
    "reserved": 0,
    "version": 0
  }
}
```

**Errores posibles:**
- `404`: Producto no encontrado

---

#### POST `/api/products`
Crea un nuevo producto.

**Body (JSON):**
```json
{
  "name": "Producto 1",              // requerido
  "description": "Descripción",      // opcional
  "price": 99.99,                     // requerido
  "sku": "SKU001",                   // requerido, debe ser único
  "initialStock": 100                 // opcional, crea movimiento ENTRY si se proporciona
}
```

**Respuesta exitosa (201):**
```json
{
  "id": "uuid",
  "name": "Producto 1",
  "description": "Descripción",
  "price": "99.99",
  "sku": "SKU001",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "stock": {
    "id": "uuid",
    "productId": "uuid",
    "quantity": 100,
    "reserved": 0
  }
}
```

**Errores posibles:**
- `400`: Datos incompletos (falta name, price o sku)
- `409`: SKU duplicado

---

#### PUT `/api/products/:id`
Actualiza un producto existente.

**Parámetros de URL:**
- `id` (string, requerido): UUID del producto

**Body (JSON):**
```json
{
  "name": "Producto Actualizado",    // opcional
  "description": "Nueva descripción", // opcional
  "price": 149.99                     // opcional
}
```

**Respuesta exitosa (200):**
```json
{
  "id": "uuid",
  "name": "Producto Actualizado",
  "description": "Nueva descripción",
  "price": "149.99",
  "sku": "SKU001",
  "stock": {
    "id": "uuid",
    "productId": "uuid",
    "quantity": 100,
    "reserved": 0
  }
}
```

**Errores posibles:**
- `404`: Producto no encontrado

---

#### DELETE `/api/products/:id`
Elimina un producto.

**Parámetros de URL:**
- `id` (string, requerido): UUID del producto

**Respuesta exitosa (204):** Sin contenido

**Errores posibles:**
- `404`: Producto no encontrado

---

#### POST `/api/products/:productId/stock/add`
Agrega stock a un producto (entrada de inventario).

**Parámetros de URL:**
- `productId` (string, requerido): UUID del producto

**Body (JSON):**
```json
{
  "quantity": 50,                     // requerido, debe ser > 0
  "description": "Compra de proveedor" // opcional
}
```

**Respuesta exitosa (200):**
```json
{
  "id": "uuid",
  "name": "Producto 1",
  "price": "99.99",
  "sku": "SKU001",
  "stock": {
    "id": "uuid",
    "productId": "uuid",
    "quantity": 150,
    "reserved": 0,
    "available": 150
  }
}
```

**Errores posibles:**
- `400`: Cantidad inválida (debe ser > 0)
- `404`: Producto no encontrado

---

#### POST `/api/products/:productId/stock/adjust`
Ajusta el stock de un producto (puede ser positivo o negativo).

**Parámetros de URL:**
- `productId` (string, requerido): UUID del producto

**Body (JSON):**
```json
{
  "quantity": -10,                    // requerido, puede ser positivo o negativo (no puede ser 0)
  "description": "Ajuste por pérdida" // opcional
}
```

**Nota:** Si `quantity` es negativo, debe haber suficiente stock disponible.

**Respuesta exitosa (200):**
```json
{
  "id": "uuid",
  "name": "Producto 1",
  "price": "99.99",
  "sku": "SKU001",
  "stock": {
    "id": "uuid",
    "productId": "uuid",
    "quantity": 140,
    "reserved": 0,
    "available": 140
  }
}
```

**Errores posibles:**
- `400`: Cantidad inválida (debe ser diferente de 0) o stock insuficiente
- `404`: Producto no encontrado

---

#### GET `/api/products/:productId/movements`
Obtiene el historial de movimientos de inventario de un producto.

**Parámetros de URL:**
- `productId` (string, requerido): UUID del producto

**Query Parameters:**
- `type` (string, opcional): Filtrar por tipo de movimiento (`ENTRY`, `EXIT`, `ADJUSTMENT`)
- `limit` (number, opcional): Número máximo de resultados (default: 100)
- `offset` (number, opcional): Número de resultados a saltar (default: 0)

**Ejemplo:**
```
GET /api/products/uuid/movements?type=ENTRY&limit=50&offset=0
```

**Respuesta exitosa (200):**
```json
[
  {
    "id": "uuid",
    "productId": "uuid",
    "type": "ENTRY",
    "quantity": 100,
    "referenceId": null,
    "referenceType": "INITIAL_STOCK",
    "description": "Stock inicial del producto",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "createdBy": null
  },
  {
    "id": "uuid",
    "productId": "uuid",
    "type": "EXIT",
    "quantity": -20,
    "referenceId": "invoice-uuid",
    "referenceType": "INVOICE",
    "description": "Venta confirmada - Factura INV-00000001",
    "createdAt": "2024-01-02T00:00:00.000Z",
    "createdBy": null
  }
]
```

**Errores posibles:**
- `404`: Producto no encontrado

### Facturas

#### GET `/api/invoices`
Obtiene todas las facturas con sus items.

**Parámetros:** Ninguno

**Respuesta exitosa (200):**
```json
[
  {
    "id": "uuid",
    "invoiceNumber": "INV-00000001",
    "total": "299.97",
    "status": "CONFIRMED",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "items": [
      {
        "id": "uuid",
        "invoiceId": "uuid",
        "productId": "uuid",
        "quantity": 2,
        "unitPrice": "99.99",
        "subtotal": "199.98",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "product": {
          "id": "uuid",
          "name": "Producto 1",
          "price": "99.99",
          "stock": {
            "quantity": 98,
            "reserved": 0
          }
        }
      }
    ]
  }
]
```

---

#### GET `/api/invoices/:id`
Obtiene una factura específica por ID.

**Parámetros de URL:**
- `id` (string, requerido): UUID de la factura

**Respuesta exitosa (200):**
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-00000001",
  "total": "299.97",
  "status": "CONFIRMED",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "items": [
    {
      "id": "uuid",
      "invoiceId": "uuid",
      "productId": "uuid",
      "quantity": 2,
      "unitPrice": "99.99",
      "subtotal": "199.98",
      "product": {
        "id": "uuid",
        "name": "Producto 1",
        "price": "99.99",
        "stock": {
          "quantity": 98,
          "reserved": 0
        }
      }
    }
  ]
}
```

**Errores posibles:**
- `404`: Factura no encontrada

---

#### POST `/api/invoices`
Crea una nueva factura con **bloqueo pesimista** (por defecto).

**Body (JSON):**
```json
{
  "items": [                          // requerido, array con al menos un item
    {
      "productId": "uuid-producto-1", // requerido
      "quantity": 2                    // requerido, debe ser > 0
    },
    {
      "productId": "uuid-producto-2",
      "quantity": 1
    }
  ]
}
```

**Respuesta exitosa (201):**
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-00000001",
  "total": "299.97",
  "status": "CONFIRMED",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "items": [
    {
      "id": "uuid",
      "invoiceId": "uuid",
      "productId": "uuid",
      "quantity": 2,
      "unitPrice": "99.99",
      "subtotal": "199.98",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "product": {
        "id": "uuid",
        "name": "Producto 1",
        "price": "99.99",
        "stock": {
          "quantity": 98,
          "reserved": 0
        }
      }
    }
  ]
}
```

**Errores posibles:**
- `400`: Datos inválidos (items vacío, productId o quantity faltante/inválido) o stock insuficiente
- `409`: Error de concurrencia después de múltiples reintentos (muy raro)

**Nota:** Este endpoint usa bloqueo pesimista. El sistema reintenta automáticamente durante hasta 10 segundos si hay conflictos de concurrencia.

---

#### POST `/api/invoices/optimistic`
Crea una nueva factura con **bloqueo optimista**.

**Body (JSON):**
```json
{
  "items": [                          // requerido, array con al menos un item
    {
      "productId": "uuid-producto-1", // requerido
      "quantity": 2                    // requerido, debe ser > 0
    },
    {
      "productId": "uuid-producto-2",
      "quantity": 1
    }
  ]
}
```

**Respuesta exitosa (201):**
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-00000001",
  "total": "299.97",
  "status": "CONFIRMED",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "items": [
    {
      "id": "uuid",
      "invoiceId": "uuid",
      "productId": "uuid",
      "quantity": 2,
      "unitPrice": "99.99",
      "subtotal": "199.98",
      "product": {
        "id": "uuid",
        "name": "Producto 1",
        "price": "99.99",
        "stock": {
          "quantity": 98,
          "reserved": 0
        }
      }
    }
  ]
}
```

**Errores posibles:**
- `400`: Datos inválidos (items vacío, productId o quantity faltante/inválido) o stock insuficiente
- `409`: Error de concurrencia después de múltiples reintentos (muy raro)

**Nota:** Este endpoint usa bloqueo optimista. Ver sección "Bloqueo Pesimista vs Optimista" para más detalles. Recomendado por defecto para mejor rendimiento.

---

#### PUT `/api/invoices/:id/cancel`
Cancela una factura y devuelve el stock al inventario.

**Parámetros de URL:**
- `id` (string, requerido): UUID de la factura

**Body:** Ninguno

**Respuesta exitosa (200):**
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-00000001",
  "total": "299.97",
  "status": "CANCELLED",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "items": [
    {
      "id": "uuid",
      "invoiceId": "uuid",
      "productId": "uuid",
      "quantity": 2,
      "unitPrice": "99.99",
      "subtotal": "199.98",
      "product": {
        "id": "uuid",
        "name": "Producto 1",
        "price": "99.99",
        "stock": {
          "quantity": 100,
          "reserved": 0
        }
      }
    }
  ]
}
```

**Errores posibles:**
- `404`: Factura no encontrada
- `400`: La factura ya está cancelada

**Nota:** Al cancelar una factura, se crea un movimiento `ENTRY` para cada item, devolviendo el stock al inventario.

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

