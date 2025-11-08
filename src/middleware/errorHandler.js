export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Errores de Prisma
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'Conflicto',
      message: 'Ya existe un registro con estos datos únicos',
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'No encontrado',
      message: 'El recurso solicitado no existe',
    });
  }

  // Errores de validación de stock
  if (err.name === 'InsufficientStockError') {
    return res.status(400).json({
      error: 'Stock insuficiente',
      message: err.message,
    });
  }

  if (err.name === 'ConcurrencyError') {
    return res.status(409).json({
      error: 'Error de concurrencia',
      message: err.message,
    });
  }

  // Error genérico
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  res.status(statusCode).json({
    error: 'Error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// Clase de error personalizada para stock insuficiente
export class InsufficientStockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InsufficientStockError';
    this.statusCode = 400;
  }
}

// Clase de error personalizada para concurrencia
export class ConcurrencyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConcurrencyError';
    this.statusCode = 409;
  }
}

