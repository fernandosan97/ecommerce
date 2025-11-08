import express from 'express';
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  addStock,
  adjustStock,
  getProductMovements,
} from '../controllers/productController.js';

const router = express.Router();

router.get('/', getAllProducts);
router.get('/:id', getProductById);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);
router.post('/:productId/stock/add', addStock); // Agregar stock (entrada)
router.post('/:productId/stock/adjust', adjustStock); // Ajustar stock (puede ser positivo o negativo)
router.get('/:productId/movements', getProductMovements); // Historial de movimientos

export default router;

