import prisma from '../config/database.js';
import { InsufficientStockError } from '../middleware/errorHandler.js';
import {
  createInventoryMovement,
  getProductStock,
  getProductMovementHistory,
} from '../services/inventoryService.js';

// Obtener todos los productos
export const getAllProducts = async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        stock: true,
      },
    });
    res.json(products);
  } catch (error) {
    next(error);
  }
};

// Obtener un producto por ID
export const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        stock: true,
      },
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(product);
  } catch (error) {
    next(error);
  }
};

// Crear un nuevo producto
export const createProduct = async (req, res, next) => {
  try {
    const { name, description, price, sku, initialStock } = req.body;

    if (!name || !price || !sku) {
      return res.status(400).json({
        error: 'Datos incompletos',
        message: 'Nombre, precio y SKU son requeridos',
      });
    }

    const product = await prisma.$transaction(async (tx) => {
      // Crear el producto
      const newProduct = await tx.product.create({
        data: {
          name,
          description,
          price: parseFloat(price),
          sku,
        },
      });

      // Si hay stock inicial, crear un movimiento de entrada
      if (initialStock && initialStock > 0) {
        await createInventoryMovement(
          {
            productId: newProduct.id,
            type: 'ENTRY',
            quantity: initialStock,
            referenceType: 'INITIAL_STOCK',
            description: 'Stock inicial del producto',
          },
          tx
        );
      }

      return newProduct;
    });

    const productWithStock = await prisma.product.findUnique({
      where: { id: product.id },
      include: { stock: true },
    });

    res.status(201).json(productWithStock);
  } catch (error) {
    next(error);
  }
};

// Actualizar un producto
export const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, price } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price) updateData.price = parseFloat(price);

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: { stock: true },
    });

    res.json(product);
  } catch (error) {
    next(error);
  }
};

// Eliminar un producto
export const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    await prisma.product.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// Agregar stock a un producto (entrada) con control de concurrencia
export const addStock = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity, description } = req.body;

    if (quantity === undefined || quantity <= 0) {
      return res.status(400).json({
        error: 'Datos inválidos',
        message: 'La cantidad debe ser un número positivo mayor a 0',
      });
    }

    // Verificar que el producto existe
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Usar transacción con bloqueo pesimista para evitar condiciones de carrera
    await prisma.$transaction(async (tx) => {
      // Bloquear el registro de stock para evitar conflictos con ventas simultáneas
      const stock = await tx.$queryRaw`
        SELECT id, "productId", quantity, reserved, version
        FROM "Stock"
        WHERE "productId" = ${productId}
        FOR UPDATE
      `;

      // Si no existe stock, crear el registro primero
      if (!stock || stock.length === 0) {
        await tx.stock.create({
          data: {
            productId,
            quantity: 0,
            reserved: 0,
          },
        });
      }

      // Crear movimiento de entrada dentro de la transacción
      await createInventoryMovement(
        {
          productId,
          type: 'ENTRY',
          quantity,
          referenceType: 'MANUAL_ADJUSTMENT',
          description: description || `Entrada manual de ${quantity} unidades`,
        },
        tx
      );
    }, {
      timeout: 10000,
    });

    // Obtener stock actualizado
    const stock = await getProductStock(productId);
    const productWithStock = await prisma.product.findUnique({
      where: { id: productId },
      include: { stock: true },
    });

    res.json({
      ...productWithStock,
      stock: {
        ...productWithStock.stock,
        quantity: stock.quantity,
        reserved: stock.reserved || 0,
        available: stock.quantity, // Stock disponible es simplemente quantity
      },
    });
  } catch (error) {
    next(error);
  }
};

// Ajustar stock manualmente (puede ser positivo o negativo) con control de concurrencia
export const adjustStock = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity, description } = req.body;

    if (quantity === undefined || quantity === 0) {
      return res.status(400).json({
        error: 'Datos inválidos',
        message: 'La cantidad debe ser diferente de 0',
      });
    }

    // Verificar que el producto existe
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Usar transacción con bloqueo pesimista para evitar condiciones de carrera
    await prisma.$transaction(async (tx) => {
      // Bloquear el registro de stock para evitar conflictos con ventas simultáneas
      const stock = await tx.$queryRaw`
        SELECT id, "productId", quantity, reserved, version
        FROM "Stock"
        WHERE "productId" = ${productId}
        FOR UPDATE
      `;

      // Si no existe stock, crear el registro primero
      if (!stock || stock.length === 0) {
        await tx.stock.create({
          data: {
            productId,
            quantity: 0,
            reserved: 0,
          },
        });
      } else {
        // Si es negativo, verificar que hay suficiente stock disponible
        if (quantity < 0) {
          const stockRecord = stock[0];
          // Stock disponible es simplemente quantity (ya no usamos reserved)
          const availableStock = stockRecord.quantity;

          if (Math.abs(quantity) > availableStock) {
            throw new InsufficientStockError(
              `No hay suficiente stock disponible. Disponible: ${availableStock}, Solicitado: ${Math.abs(quantity)}`
            );
          }
        }
      }

      // Crear movimiento de ajuste dentro de la transacción
      await createInventoryMovement(
        {
          productId,
          type: 'ADJUSTMENT',
          quantity,
          referenceType: 'MANUAL_ADJUSTMENT',
          description: description || `Ajuste manual de ${quantity} unidades`,
        },
        tx
      );
    }, {
      timeout: 10000,
    });

    // Obtener stock actualizado
    const stock = await getProductStock(productId);
    const productWithStock = await prisma.product.findUnique({
      where: { id: productId },
      include: { stock: true },
    });

    res.json({
      ...productWithStock,
      stock: {
        ...productWithStock.stock,
        quantity: stock.quantity,
        reserved: stock.reserved || 0,
        available: stock.quantity, // Stock disponible es simplemente quantity
      },
    });
  } catch (error) {
    next(error);
  }
};

// Obtener historial de movimientos de un producto
export const getProductMovements = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { type, limit = 100, offset = 0 } = req.query;

    // Verificar que el producto existe
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const movements = await getProductMovementHistory(productId, {
      type,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json(movements);
  } catch (error) {
    next(error);
  }
};

