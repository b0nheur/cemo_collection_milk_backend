import jwt from 'jsonwebtoken'
import pool from '../config/db.js'

export async function authenticate(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ message: 'Sign in to continue.' })
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET)
    const [users] = await pool.execute(
      'SELECT id, full_name AS fullName, email, role FROM users WHERE id = ? AND status = ?',
      [claims.sub, 'active'],
    )
    if (!users.length) return res.status(401).json({ message: 'This account is no longer active.' })
    req.user = users[0]
    return next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Your session has expired. Sign in again.' })
    }
    return next(error)
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Your account does not have permission to perform this action.' })
    }
    return next()
  }
}
