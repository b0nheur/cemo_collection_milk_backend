import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from '../config/db.js'

export async function login(req, res) {
  const { email, password } = req.body
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return res.status(400).json({ message: 'Email and password are required.' })
  }
  const [rows] = await pool.execute(
    'SELECT id, full_name AS fullName, email, password_hash, role FROM users WHERE email = ? AND status = ?',
    [email.trim().toLowerCase(), 'active'],
  )
  const user = rows[0]
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: 'Email or password is incorrect.' })
  }
  const token = jwt.sign({ sub: String(user.id), role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' })
  return res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role } })
}

export async function me(req, res) {
  return res.json({ user: req.user })
}

export async function listUsers(req, res) {
  const [data] = await pool.execute('SELECT id, full_name AS fullName, email, role, status, created_at AS createdAt FROM users ORDER BY full_name')
  return res.json({ data })
}

export async function createUser(req, res) {
  const { fullName, email, password, role } = req.body
  const roles = ['administrator', 'manager', 'milk_collector', 'accountant']
  if (!fullName?.trim() || !email?.trim() || typeof password !== 'string' || password.length < 10 || !roles.includes(role)) {
    return res.status(400).json({ message: 'Name, valid email, role and a password of at least 10 characters are required.' })
  }
  const passwordHash = await bcrypt.hash(password, 12)
  try {
    const [result] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [fullName.trim(), email.trim().toLowerCase(), passwordHash, role],
    )
    return res.status(201).json({ data: { id: result.insertId, fullName: fullName.trim(), email: email.trim().toLowerCase(), role, status: 'active' } })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A user with this email already exists.' })
    throw error
  }
}

export async function updateUserStatus(req, res) {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid user ID.' })
  if (id === Number(req.user.id)) return res.status(400).json({ message: 'You cannot deactivate your own account.' })
  const status = req.body.status
  if (!['active', 'inactive'].includes(status)) return res.status(400).json({ message: 'Status must be active or inactive.' })
  const [result] = await pool.execute('UPDATE users SET status = ? WHERE id = ?', [status, id])
  if (!result.affectedRows) return res.status(404).json({ message: 'User not found.' })
  return res.json({ message: `User ${status}.` })
}
