import prisma from '../config/database.js';
import { InsufficientStockError } from '../middleware/errorHandler.js';

/**
 * Calcula el stock disponible de un producto sumando/restando todos los movimientos
 * @param {string} productId - ID del producto
 * @param {Object} tx - Transacción de Prisma (opcional)
 * @returns {Promise<{quantity: number, reserved: number}>} Stock disponible y reservado
 */
export const calculateStockFromMovements = async (productId, tx = null) => {
  const prismaClient = tx || prisma;

  const movements = await prismaClient.inventoryMovement.findMany({
    where: { productId },
    orderBy: { createdAt: 'asc' },
  });

  // Simplificado: el stock es simplemente la suma de todos los quantity
  // ENTRY: quantity positivo (ej: 10)
  // EXIT: quantity negativo (ej: -5)
  // ADJUSTMENT: quantity positivo o negativo según el ajuste
  let quantity = 0;
  let reserved = 0; // Mantenemos reserved para compatibilidad, pero no se calcula desde movimientos

  for (const movement of movements) {
    // Simplemente sumar todos los quantity
    quantity += movement.quantity;
  }

  return {
    quantity: Math.max(0, quantity), // El stock no puede ser negativo
    reserved: Math.max(0, reserved) // Por ahora mantenemos reserved en 0, se puede usar para otras funcionalidades
  };
};

/**
 * Registra un movimiento de inventario y actualiza el stock en caché
 * @param {Object} params - Parámetros del movimiento
 * @param {string} params.productId - ID del producto
 * @param {string} params.type - Tipo de movimiento
 * @param {number} params.quantity - Cantidad (positivo para entradas, negativo para salidas)
 * @param {string} params.referenceId - ID de referencia (opcional)
 * @param {string} params.referenceType - Tipo de referencia (opcional)
 * @param {string} params.description - Descripción del movimiento (opcional)
 * @param {string} params.createdBy - Usuario que creó el movimiento (opcional)
 * @param {Object} tx - Transacción de Prisma (opcional)
 * @returns {Promise<InventoryMovement>} Movimiento creado
 */
export const createInventoryMovement = async (params, tx = null) => {
  const prismaClient = tx || prisma;

  // Crear el movimiento
  const movement = await prismaClient.inventoryMovement.create({
    data: {
      productId: params.productId,
      type: params.type,
      quantity: params.quantity,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
      description: params.description,
      createdBy: params.createdBy,
    },
  });

  // Recalcular y actualizar el stock en caché
  const calculatedStock = await calculateStockFromMovements(params.productId, prismaClient);

  // Actualizar o crear el registro de stock
  await prismaClient.stock.upsert({
    where: { productId: params.productId },
    update: {
      quantity: calculatedStock.quantity,
      reserved: calculatedStock.reserved,
    },
    create: {
      productId: params.productId,
      quantity: calculatedStock.quantity,
      reserved: calculatedStock.reserved,
    },
  });

  return movement;
};

/**
 * Obtiene el stock disponible de un producto (desde caché o calculado)
 * @param {string} productId - ID del producto
 * @param {boolean} recalculate - Si true, recalcula desde movimientos en lugar de usar caché
 * @returns {Promise<{quantity: number, reserved: number, available: number}>}
 */
export const getProductStock = async (productId, recalculate = false) => {
  if (recalculate) {
    return await calculateStockFromMovements(productId);
  }

  const stock = await prisma.stock.findUnique({
    where: { productId },
  });

  if (!stock) {
    // Si no existe stock, calcular desde movimientos
    return await calculateStockFromMovements(productId);
  }

  return {
    quantity: stock.quantity,
    reserved: stock.reserved || 0, // Mantenemos reserved para compatibilidad
    available: stock.quantity, // Stock disponible es simplemente quantity
  };
};

/**
 * Verifica si hay stock suficiente disponible
 * @param {string} productId - ID del producto
 * @param {number} requiredQuantity - Cantidad requerida
 * @param {Object} tx - Transacción de Prisma (opcional)
 * @throws {InsufficientStockError} Si no hay stock suficiente
 */
export const validateStockAvailability = async (productId, requiredQuantity, tx = null) => {
  const stock = await getProductStock(productId, false);
  // Stock disponible es simplemente quantity (ya no usamos reserved)
  const available = stock.quantity;

  if (available < requiredQuantity) {
    throw new InsufficientStockError(
      `Stock insuficiente para el producto ${productId}. Disponible: ${available}, Solicitado: ${requiredQuantity}`
    );
  }
};

/**
 * Obtiene el historial de movimientos de un producto
 * @param {string} productId - ID del producto
 * @param {Object} options - Opciones de filtrado
 * @returns {Promise<InventoryMovement[]>}
 */
export const getProductMovementHistory = async (productId, options = {}) => {
  const { type, limit = 100, offset = 0 } = options;

  return await prisma.inventoryMovement.findMany({
    where: {
      productId,
      ...(type && { type }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
};

