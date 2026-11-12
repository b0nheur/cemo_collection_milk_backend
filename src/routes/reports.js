import { Router } from 'express'
import { dashboard, exportMonthly, financeReport, monthlyReport } from '../controllers/reports.js'
import { allowRoles, authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)
router.get('/dashboard', dashboard)
router.get('/monthly', allowRoles('administrator', 'manager', 'accountant'), monthlyReport)
router.get('/finance', allowRoles('administrator', 'manager', 'accountant'), financeReport)
router.get('/export', allowRoles('administrator', 'manager', 'accountant'), exportMonthly)
export default router
