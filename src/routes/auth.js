import { Router } from 'express'
import { createUser, listUsers, login, me, updateUserStatus } from '../controllers/auth.js'
import { allowRoles, authenticate } from '../middleware/auth.js'

const router = Router()
router.post('/login', login)
router.get('/me', authenticate, me)
router.get('/users', authenticate, allowRoles('administrator'), listUsers)
router.post('/users', authenticate, allowRoles('administrator'), createUser)
router.patch('/users/:id/status', authenticate, allowRoles('administrator'), updateUserStatus)
export default router
