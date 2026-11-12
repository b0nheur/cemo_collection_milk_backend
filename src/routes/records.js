import { Router } from 'express'
import * as records from '../controllers/records.js'
import { allowRoles, authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

const managers = allowRoles('administrator', 'manager')
const financial = allowRoles('administrator', 'manager', 'accountant')
const collectors = allowRoles('administrator', 'manager', 'milk_collector')

router.get('/suppliers', records.suppliers)
router.post('/suppliers', managers, records.createSupplier)
router.put('/suppliers/:id', managers, records.updateSupplier)
router.delete('/suppliers/:id', managers, records.deactivateSupplier)
router.get('/suppliers/:id/history', records.supplierHistory)

router.get('/buyers', allowRoles('administrator', 'manager', 'accountant'), records.buyers)
router.post('/buyers', managers, records.createBuyer)
router.put('/buyers/:id', managers, records.updateBuyer)
router.delete('/buyers/:id', managers, records.deactivateBuyer)

router.get('/deliveries', records.deliveries)
router.post('/deliveries', collectors, records.createDelivery)
router.put('/deliveries/:id', managers, records.updateDelivery)
router.delete('/deliveries/:id', managers, records.deleteDelivery)

router.get('/sales', financial, records.sales)
router.post('/sales', financial, records.createSale)
router.put('/sales/:id', managers, records.updateSale)
router.delete('/sales/:id', managers, records.deleteSale)

router.get('/payments', financial, records.payments)
router.get('/payments/balances', financial, records.paymentBalances)
router.get('/payments/:id/receipt', financial, records.paymentReceipt)
router.post('/payments', financial, records.createPayment)
router.delete('/payments/:id', allowRoles('administrator', 'manager', 'accountant'), records.deletePayment)

router.get('/expenses', financial, records.expenses)
router.post('/expenses', financial, records.createExpense)
router.put('/expenses/:id', financial, records.updateExpense)
router.delete('/expenses/:id', managers, records.deleteExpense)

router.get('/stock', records.stock)
router.get('/stock/movements', records.stockMovements)
router.post('/stock/rejected', managers, records.rejectStock)

export default router
