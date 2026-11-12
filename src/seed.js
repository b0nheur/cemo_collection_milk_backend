import 'dotenv/config'
import bcrypt from 'bcryptjs'
import pool from './config/db.js'

const connection = await pool.getConnection()
try {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || ''
  if (!email || password.length < 10) throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 10 characters in backend/.env before seeding.')
  const passwordHash = await bcrypt.hash(password, 12)
  await connection.execute(
    `INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), password_hash = VALUES(password_hash), role = VALUES(role), status = 'active'`,
    [process.env.ADMIN_NAME || 'CEMO Administrator', email, passwordHash, 'administrator'],
  )
  const [[{ total }]] = await connection.query('SELECT COUNT(*) AS total FROM suppliers')
  if (Number(total) === 0) {
    const [farmer] = await connection.execute(
      'INSERT INTO suppliers (supplier_code, full_name, phone, location, type, registered_on) VALUES (?, ?, ?, ?, ?, CURDATE())',
      ['CEMO-00001', 'Mukamana Alice', '+250788123456', 'Rwamagana, Eastern Province', 'Farmer'],
    )
    const [collector] = await connection.execute(
      'INSERT INTO suppliers (supplier_code, full_name, phone, location, type, registered_on) VALUES (?, ?, ?, ?, ?, CURDATE())',
      ['CEMO-00002', 'Ndayisaba Jean', '+250788654321', 'Huye, Southern Province', 'Abadongi'],
    )
    const [buyer] = await connection.execute(
      'INSERT INTO buyers (buyer_name, company_name, phone, address, type) VALUES (?, ?, ?, ?, ?)',
      ['Kigali Fresh Foods', 'Kigali Fresh Foods Ltd', '+250788456789', 'Kigali, Rwanda', 'Company'],
    )
    const today = new Date().toISOString().slice(0, 10)
    const lastMonth = new Date()
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1)
    const previousDate = lastMonth.toISOString().slice(0, 10)
    const adminRows = await connection.execute('SELECT id, full_name FROM users WHERE email = ?', [email])
    const admin = adminRows[0][0]
    for (const [supplier, date, grade, litres, recordedBy] of [
      [farmer.insertId, today, 'Grade 1', 42.5, 'CEMO Collector'],
      [collector.insertId, today, 'Grade 2', 68, 'CEMO Collector'],
      [farmer.insertId, previousDate, 'Grade 1', 35, 'CEMO Collector'],
    ]) {
      const price = grade === 'Grade 1' ? 500 : 400
      const [delivery] = await connection.execute(
        'INSERT INTO milk_deliveries (supplier_id, delivery_date, quantity_litres, grade, price_per_litre, total_payment, recorded_by, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [supplier, date, litres, grade, price, litres * price, recordedBy, admin.id],
      )
      await connection.execute('INSERT INTO stock_movements (movement_type, grade, quantity_litres, delivery_id, reference, recorded_by) VALUES (?, ?, ?, ?, ?, ?)', ['delivery', grade, litres, delivery.insertId, `DEL-${delivery.insertId}`, recordedBy])
      await connection.execute('INSERT INTO milk_quality_tests (delivery_id, fat, density, temperature, tested_by) VALUES (?, ?, ?, ?, ?)', [delivery.insertId, grade === 'Grade 1' ? 3.8 : 3.2, 1.03, 4.1, admin.id])
    }
    await connection.execute(
      'INSERT INTO payments (supplier_id, amount, payment_date, method, reference, recorded_by) VALUES (?, ?, CURDATE(), ?, ?, ?)',
      [farmer.insertId, 5000, 'Mobile Money', 'SAMPLE-001', admin.id],
    )
    const [sale] = await connection.execute(
      'INSERT INTO milk_sales (buyer_id, sale_date, grade, quantity_litres, price_per_litre, total_amount, recorded_by, created_by) VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?)',
      [buyer.insertId, 'Grade 1', 8, 750, 6000, 'CEMO Sales', admin.id],
    )
    await connection.execute('INSERT INTO stock_movements (movement_type, grade, quantity_litres, sale_id, reference, recorded_by) VALUES (?, ?, ?, ?, ?, ?)', ['sale', 'Grade 1', 8, sale.insertId, `SALE-${sale.insertId}`, 'CEMO Sales'])
    await connection.execute(
      'INSERT INTO expenses (category, description, amount, expense_date, recorded_by, created_by) VALUES (?, ?, ?, CURDATE(), ?, ?)',
      ['Transport', 'Milk collection route fuel', 18000, admin.full_name, admin.id],
    )
    console.log('Inserted sample suppliers, deliveries, buyer, sale, partial payment and expense.')
  } else {
    console.log('Sample records already exist; skipped sample data.')
  }
  console.log(`Administrator ready: ${email}`)
} finally {
  connection.release()
  await pool.end()
}
