import prisma from '../config/database.js';
import { InsufficientStockError, ConcurrencyError } from '../middleware/errorHandler.js';
import {
  createInventoryMovement,
  validateStockAvailability,
  getProductStock,
} from '../services/inventoryService.js';

// Función auxiliar para esperar un tiempo determinado
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Función de retry con backoff exponencial
const retryWithBackoff = async (fn, maxRetries = 10, maxTimeMs = 10000, initialDelayMs = 100) => {
  const startTime = Date.now();
  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      const elapsedTime = Date.now() - startTime;

      // Si es un error de concurrencia y aún tenemos tiempo, reintentar
      // Maneja tanto errores de Prisma (P2034) como ConcurrencyError personalizado
      const isConcurrencyError = error.code === 'P2034' || error instanceof ConcurrencyError;

      if (isConcurrencyError && elapsedTime < maxTimeMs && attempt < maxRetries) {
        attempt++;
        // Backoff exponencial con jitter aleatorio para evitar thundering herd
        const jitter = Math.random() * 50; // 0-50ms de jitter
        const waitTime = Math.min(delay + jitter, maxTimeMs - elapsedTime);

        await sleep(waitTime);
        delay = Math.min(delay * 1.5, 1000); // Aumentar delay hasta máximo 1 segundo
        continue;
      }

      // Si no es error de concurrencia o se agotó el tiempo, lanzar el error
      throw error;
    }
  }
};

// Obtener todas las facturas
export const getAllInvoices = async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({
      include: {
        items: {
          include: {
            product: {
              include: {
                stock: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(invoices);
  } catch (error) {
    next(error);
  }
};

// Obtener una factura por ID
export const getInvoiceById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              include: {
                stock: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    res.json(invoice);
  } catch (error) {
    next(error);
  }
};

// Función interna para crear la factura con bloqueo pesimista (usada con retry)
const createInvoiceTransaction = async (items) => {
  return await prisma.$transaction(async (tx) => {
    // Primero, verificar y reservar stock con bloqueo pesimista
    const stockUpdates = [];
    const productData = [];

    for (const item of items) {
      // Bloqueo pesimista: SELECT FOR UPDATE
      const stock = await tx.$queryRaw`
          SELECT id, "productId", quantity, reserved, version
          FROM "Stock"
          WHERE "productId" = ${item.productId}
          FOR UPDATE
        `;

      if (!stock || stock.length === 0) {
        throw new InsufficientStockError(
          `Producto ${item.productId} no tiene stock registrado`
        );
      }

      const stockRecord = stock[0];
      // Stock disponible es simplemente quantity (ya no usamos reserved)
      const availableStock = stockRecord.quantity;

      if (availableStock < item.quantity) {
        throw new InsufficientStockError(
          `Stock insuficiente para el producto ${item.productId}. Disponible: ${availableStock}, Solicitado: ${item.quantity}`
        );
      }

      // Obtener datos del producto para calcular precios
      const product = await tx.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        throw new Error(`Producto ${item.productId} no encontrado`);
      }

      productData.push({
        product,
        quantity: item.quantity,
      });

    }

    // Generar número de factura único
    const invoiceCount = await tx.invoice.count();
    const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(8, '0')}`;

    // Calcular totales
    let total = 0;
    const invoiceItems = productData.map(({ product, quantity }) => {
      const unitPrice = parseFloat(product.price);
      const subtotal = unitPrice * quantity;
      total += subtotal;

      return {
        productId: product.id,
        quantity,
        unitPrice,
        subtotal,
      };
    });

    // Crear la factura y sus items
    const newInvoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        total,
        status: 'CONFIRMED',
        items: {
          create: invoiceItems,
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    // Crear salida de stock directamente (sin reservas)
    for (const { product, quantity } of productData) {
      await createInventoryMovement(
        {
          productId: product.id,
          type: 'EXIT',
          quantity: -quantity, // Negativo para salida
          referenceId: newInvoice.id,
          referenceType: 'INVOICE',
          description: `Venta confirmada - Factura ${invoiceNumber}`,
        },
        tx
      );
    }

    return newInvoice;
  }, {
    timeout: 10000, // 10 segundos de timeout para la transacción
  });
};

// Función interna para crear la factura con bloqueo optimista
const createInvoiceOptimisticTransaction = async (items) => {
  return await prisma.$transaction(async (tx) => {
    const productData = [];
    const stockVersions = []; // Guardar versiones para verificación optimista

    // Paso 1: Leer stock y productos (sin bloqueo)
    for (const item of items) {
      // Leer stock sin bloqueo (bloqueo optimista)
      const stock = await tx.stock.findUnique({
        where: { productId: item.productId },
      });

      if (!stock) {
        throw new InsufficientStockError(
          `Producto ${item.productId} no tiene stock registrado`
        );
      }

      // Stock disponible es simplemente quantity (ya no usamos reserved)
      const availableStock = stock.quantity;

      if (availableStock < item.quantity) {
        throw new InsufficientStockError(
          `Stock insuficiente para el producto ${item.productId}. Disponible: ${availableStock}, Solicitado: ${item.quantity}`
        );
      }

      // Guardar la versión actual para verificación optimista
      stockVersions.push({
        productId: item.productId,
        version: stock.version,
        quantity: item.quantity,
      });

      // Obtener datos del producto para calcular precios
      const product = await tx.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        throw new Error(`Producto ${item.productId} no encontrado`);
      }

      productData.push({
        product,
        quantity: item.quantity,
      });
    }

    // Paso 2: Reservar stock con verificación de versión (bloqueo optimista)
    for (const stockInfo of stockVersions) {
      // Verificar versión antes de crear movimiento
      const currentStock = await tx.stock.findUnique({
        where: { productId: stockInfo.productId },
      });

      if (!currentStock || currentStock.version !== stockInfo.version) {
        throw new ConcurrencyError(
          `Conflicto de concurrencia detectado para el producto ${stockInfo.productId}. La versión del stock cambió durante la operación.`
        );
      }

      // Actualizar versión
      await tx.stock.update({
        where: { productId: stockInfo.productId },
        data: { version: currentStock.version + 1 },
      });
    }

    // Paso 3: Generar número de factura único
    const invoiceCount = await tx.invoice.count();
    const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(8, '0')}`;

    // Paso 4: Calcular totales
    let total = 0;
    const invoiceItems = productData.map(({ product, quantity }) => {
      const unitPrice = parseFloat(product.price);
      const subtotal = unitPrice * quantity;
      total += subtotal;

      return {
        productId: product.id,
        quantity,
        unitPrice,
        subtotal,
      };
    });

    // Paso 5: Crear la factura y sus items
    const newInvoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        total,
        status: 'CONFIRMED',
        items: {
          create: invoiceItems,
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    // Paso 6: Crear salida de stock directamente (sin reservas)
    for (const stockInfo of stockVersions) {
      await createInventoryMovement(
        {
          productId: stockInfo.productId,
          type: 'EXIT',
          quantity: -stockInfo.quantity, // Negativo para salida
          referenceId: newInvoice.id,
          referenceType: 'INVOICE',
          description: `Venta confirmada - Factura ${invoiceNumber}`,
        },
        tx
      );
    }

    return newInvoice;
  }, {
    timeout: 10000, // 10 segundos de timeout para la transacción
  });
};

// Crear una factura con control de concurrencia y retry
export const createInvoice = async (req, res, next) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Datos inválidos',
        message: 'Debe proporcionar al menos un item para la factura',
      });
    }

    // Validar que todos los items tengan los datos requeridos
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({
          error: 'Datos inválidos',
          message: 'Cada item debe tener productId y quantity (mayor a 0)',
        });
      }
    }

    // Intentar crear la factura con retry automático durante 10 segundos
    const invoice = await retryWithBackoff(
      () => createInvoiceTransaction(items),
      10,    // máximo 10 intentos
      10000, // máximo 10 segundos
      100    // delay inicial de 100ms
    );

    // Obtener la factura completa con todos los datos
    const completeInvoice = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        items: {
          include: {
            product: {
              include: {
                stock: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json(completeInvoice);
  } catch (error) {
    // Si es un error conocido, lo pasamos al siguiente middleware
    if (error instanceof InsufficientStockError || error instanceof ConcurrencyError) {
      return next(error);
    }

    // Si es un error de Prisma relacionado con transacciones después de todos los reintentos
    if (error.code === 'P2034') {
      return next(new ConcurrencyError(
        'La transacción falló después de múltiples intentos debido a un conflicto de concurrencia. Por favor, intente nuevamente más tarde.'
      ));
    }

    next(error);
  }
};

// Crear una factura con bloqueo optimista y retry
export const createInvoiceOptimistic = async (req, res, next) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Datos inválidos',
        message: 'Debe proporcionar al menos un item para la factura',
      });
    }

    // Validar que todos los items tengan los datos requeridos
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({
          error: 'Datos inválidos',
          message: 'Cada item debe tener productId y quantity (mayor a 0)',
        });
      }
    }

    // Intentar crear la factura con retry automático durante 10 segundos
    // El retry manejará automáticamente los errores de concurrencia (ConcurrencyError)
    const invoice = await retryWithBackoff(
      () => createInvoiceOptimisticTransaction(items),
      10,    // máximo 10 intentos
      10000, // máximo 10 segundos
      100    // delay inicial de 100ms
    );

    // Obtener la factura completa con todos los datos
    const completeInvoice = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        items: {
          include: {
            product: {
              include: {
                stock: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json(completeInvoice);
  } catch (error) {
    // Si es un error conocido, lo pasamos al siguiente middleware
    if (error instanceof InsufficientStockError || error instanceof ConcurrencyError) {
      return next(error);
    }

    // Si es un error de Prisma relacionado con transacciones después de todos los reintentos
    if (error.code === 'P2034') {
      return next(new ConcurrencyError(
        'La transacción falló después de múltiples intentos debido a un conflicto de concurrencia. Por favor, intente nuevamente más tarde.'
      ));
    }

    next(error);
  }
};

// Cancelar una factura (devolver stock)
export const cancelInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const invoice = await prisma.$transaction(async (tx) => {
      // Obtener la factura con bloqueo
      const invoiceToCancel = await tx.invoice.findUnique({
        where: { id },
        include: {
          items: true,
        },
      });

      if (!invoiceToCancel) {
        throw new Error('Factura no encontrada');
      }

      if (invoiceToCancel.status === 'CANCELLED') {
        throw new Error('La factura ya está cancelada');
      }

      // Devolver stock de cada item creando movimientos de entrada
      // Buscar los movimientos EXIT de esta factura y crear ENTRY para revertirlos
      for (const item of invoiceToCancel.items) {
        // Crear entrada para devolver el stock
        await createInventoryMovement(
          {
            productId: item.productId,
            type: 'ENTRY',
            quantity: item.quantity, // Positivo para entrada
            referenceId: invoiceToCancel.id,
            referenceType: 'INVOICE_CANCELLATION',
            description: `Devolución de stock por cancelación de factura ${invoiceToCancel.invoiceNumber}`,
          },
          tx
        );
      }

      // Actualizar estado de la factura
      const updatedInvoice = await tx.invoice.update({
        where: { id },
        data: {
          status: 'CANCELLED',
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  stock: true,
                },
              },
            },
          },
        },
      });

      return updatedInvoice;
    });

    res.json(invoice);
  } catch (error) {
    next(error);
  }
};

