import express from 'express';
import {
  getAllInvoices,
  getInvoiceById,
  createInvoice,
  createInvoiceOptimistic,
  cancelInvoice,
} from '../controllers/invoiceController.js';

const router = express.Router();

router.get('/', getAllInvoices);
router.post('/', createInvoice); // Bloqueo pesimista (por defecto)
router.post('/optimistic', createInvoiceOptimistic); // Bloqueo optimista
router.get('/:id', getInvoiceById);
router.put('/:id/cancel', cancelInvoice);

export default router;

