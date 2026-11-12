import pool from '../config/db.js'
import PDFDocument from 'pdfkit'

const isId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0
const isPositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0
const grades = ['Grade 1', 'Grade 2']
const prices = { 'Grade 1': 500, 'Grade 2': 400 }
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const dateValid = (value) => {
  if (typeof value !== 'string' || !datePattern.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
const queryData = (res, data) => res.json({ data })
const notFound = (res, label) => res.status(404).json({ message: `${label} not found.` })

export async function suppliers(req, res) {
  const values = []
  let where = ''
  if (req.query.status && ['active', 'inactive'].includes(req.query.status)) {
    where = 'WHERE status = ?'
    values.push(req.query.status)
  }
  const [data] = await pool.execute(
    `SELECT id, supplier_code AS supplierCode, full_name AS fullName, phone, location, type, registered_on AS registeredOn, status FROM suppliers ${where} ORDER BY full_name`,
    values,
  )
  return queryData(res, data)
}

export async function createSupplier(req, res) {
  const { fullName, phone, location, type } = req.body
  if (!fullName?.trim() || !phone?.trim() || !location?.trim() || !['Farmer', 'Abadongi'].includes(type)) {
    return res.status(400).json({ message: 'Full name, phone, location and supplier type are required.' })
  }
  const registeredOn = dateValid(req.body.registeredOn) ? req.body.registeredOn : new Date().toISOString().slice(0, 10)
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [result] = await connection.execute(
      'INSERT INTO suppliers (supplier_code, full_name, phone, location, type, registered_on) VALUES (?, ?, ?, ?, ?, ?)',
      ['PENDING', fullName.trim(), phone.trim(), location.trim(), type, registeredOn],
    )
    const supplierCode = `CEMO-${String(result.insertId).padStart(5, '0')}`
    await connection.execute('UPDATE suppliers SET supplier_code = ? WHERE id = ?', [supplierCode, result.insertId])
    await connection.commit()
    return res.status(201).json({ data: { id: result.insertId, supplierCode, fullName: fullName.trim(), phone: phone.trim(), location: location.trim(), type, registeredOn, status: 'active' } })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

export async function updateSupplier(req, res) {
  const { fullName, phone, location, type, status, registeredOn } = req.body
  if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid supplier ID.' })
  if (!fullName?.trim() || !phone?.trim() || !location?.trim() || !['Farmer', 'Abadongi'].includes(type)) {
    return res.status(400).json({ message: 'Full name, phone, location and supplier type are required.' })
  }
  if (status && !['active', 'inactive'].includes(status)) return res.status(400).json({ message: 'Status must be active or inactive.' })
  const [result] = await pool.execute(
    'UPDATE suppliers SET full_name = ?, phone = ?, location = ?, type = ?, registered_on = COALESCE(?, registered_on), status = COALESCE(?, status) WHERE id = ?',
    [fullName.trim(), phone.trim(), location.trim(), type, dateValid(registeredOn) ? registeredOn : null, status || null, req.params.id],
  )
  if (!result.affectedRows) return notFound(res, 'Supplier')
  return res.json({ message: 'Supplier updated.' })
}

export async function deactivateSupplier(req, res) {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid supplier ID.' })
  const [result] = await pool.execute('UPDATE suppliers SET status = ? WHERE id = ?', ['inactive', req.params.id])
  if (!result.affectedRows) return notFound(res, 'Supplier')
  return res.json({ message: 'Supplier deactivated.' })
}

export async function supplierHistory(req, res) {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid supplier ID.' })
  const [data] = await pool.execute(
    `SELECT d.id, d.delivery_date AS deliveryDate, d.quantity_litres AS quantityLitres, d.grade, d.price_per_litre AS pricePerLitre, d.total_payment AS totalPayment, d.recorded_by AS recordedBy, q.fat, q.density, q.temperature, q.notes
     FROM milk_deliveries d LEFT JOIN milk_quality_tests q ON q.delivery_id = d.id WHERE d.supplier_id = ? ORDER BY d.delivery_date DESC, d.id DESC`,
    [req.params.id],
  )
  return queryData(res, data)
}

export async function buyers(req, res) {
  const where = req.query.status && ['active', 'inactive'].includes(req.query.status) ? 'WHERE status = ?' : ''
  const params = where ? [req.query.status] : []
  const [data] = await pool.execute(
    `SELECT id, buyer_name AS buyerName, company_name AS companyName, phone, address, type, status FROM buyers ${where} ORDER BY buyer_name`,
    params,
  )
  return queryData(res, data)
}

export async function createBuyer(req, res) {
  const { buyerName, companyName, phone, address, type } = req.body
  if (!buyerName?.trim() || !['Company', 'Market', 'Individual'].includes(type)) {
    return res.status(400).json({ message: 'Buyer name and a valid buyer type are required.' })
  }
  const [result] = await pool.execute(
    'INSERT INTO buyers (buyer_name, company_name, phone, address, type) VALUES (?, ?, ?, ?, ?)',
    [buyerName.trim(), companyName?.trim() || null, phone?.trim() || null, address?.trim() || null, type],
  )
  return res.status(201).json({ data: { id: result.insertId, buyerName: buyerName.trim(), companyName: companyName || null, phone: phone || null, address: address || null, type, status: 'active' } })
}

export async function updateBuyer(req, res) {
  const { buyerName, companyName, phone, address, type, status } = req.body
  if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid buyer ID.' })
  if (!buyerName?.trim() || !['Company', 'Market', 'Individual'].includes(type)) return res.status(400).json({ message: 'Buyer name and a valid buyer type are required.' })
  const [result] = await pool.execute(
    'UPDATE buyers SET buyer_name = ?, company_name = ?, phone = ?, address = ?, type = ?, status = COALESCE(?, status) WHERE id = ?',
    [buyerName.trim(), companyName?.trim() || null, phone?.trim() || null, address?.trim() || null, type, ['active', 'inactive'].includes(status) ? status : null, req.params.id],
  )
  if (!result.affectedRows) return notFound(res, 'Buyer')
  return res.json({ message: 'Buyer updated.' })
}

export async function deactivateBuyer(req, res) {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid buyer ID.' })
  const [result] = await pool.execute('UPDATE buyers SET status = ? WHERE id = ?', ['inactive', req.params.id])
  if (!result.affectedRows) return notFound(res, 'Buyer')
  return res.json({ message: 'Buyer deactivated.' })
}

export async function deliveries(req, res) {
  const where = req.query.supplierId && isId(req.query.supplierId) ? 'WHERE d.supplier_id = ?' : ''
  const params = where ? [req.query.supplierId] : []
  const [data] = await pool.execute(
    `SELECT d.id, d.supplier_id AS supplierId, s.full_name AS supplierName, d.delivery_date AS deliveryDate, d.quantity_litres AS quantityLitres, d.grade, d.price_per_litre AS pricePerLitre, d.total_payment AS totalPayment, d.recorded_by AS recordedBy, d.notes, q.fat, q.density, q.temperature, q.notes AS qualityNotes
     FROM milk_deliveries d JOIN suppliers s ON s.id = d.supplier_id LEFT JOIN milk_quality_tests q ON q.delivery_id = d.id ${where} ORDER BY d.delivery_date DESC, d.id DESC`,
    params,
  )
  return queryData(res, data)
}

async function saveQuality(connection, deliveryId, body, userId) {
  const readings = ['fat', 'density', 'temperature']
  if (!readings.some((key) => body[key] !== undefined && body[key] !== '') && !body.qualityNotes?.trim()) return
  const values = readings.map((key) => body[key] === undefined || body[key] === '' ? null : Number(body[key]))
  if (values.some((value) => value !== null && !Number.isFinite(value))) throw Object.assign(new Error('Quality test readings must be valid numbers.'), { status: 400 })
  await connection.execute(
    `INSERT INTO milk_quality_tests (delivery_id, fat, density, temperature, notes, tested_by)
     VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE fat = VALUES(fat), density = VALUES(density), temperature = VALUES(temperature), notes = VALUES(notes), tested_by = VALUES(tested_by)`,
    [deliveryId, ...values, body.qualityNotes?.trim() || null, userId],
  )
}

export async function createDelivery(req, res) {
  const { supplierId, quantityLitres, grade, deliveryDate, recordedBy } = req.body
  if (!isId(supplierId) || !isPositive(quantityLitres) || !grades.includes(grade) || !dateValid(deliveryDate) || !recordedBy?.trim()) {
    return res.status(400).json({ message: 'An active supplier, positive litres, grade, delivery date and employee name are required.' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [supplierRows] = await connection.execute('SELECT id FROM suppliers WHERE id = ? AND status = ? FOR UPDATE', [supplierId, 'active'])
    if (!supplierRows.length) { await connection.rollback(); return res.status(400).json({ message: 'The selected supplier is not active.' }) }
    await connection.execute('SELECT id FROM stock_control WHERE id = 1 FOR UPDATE')
    const price = prices[grade]
    const litres = Number(quantityLitres)
    const [result] = await connection.execute(
      'INSERT INTO milk_deliveries (supplier_id, delivery_date, quantity_litres, grade, price_per_litre, total_payment, recorded_by, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [supplierId, deliveryDate, litres, grade, price, litres * price, recordedBy.trim(), req.body.notes?.trim() || null, req.user.id],
    )
    await saveQuality(connection, result.insertId, req.body, req.user.id)
    await connection.execute(
      'INSERT INTO stock_movements (movement_type, grade, quantity_litres, delivery_id, reference, recorded_by) VALUES (?, ?, ?, ?, ?, ?)',
      ['delivery', grade, litres, result.insertId, `DEL-${result.insertId}`, recordedBy.trim()],
    )
    await connection.commit()
    return res.status(201).json({ data: { id: result.insertId, supplierId: Number(supplierId), deliveryDate, quantityLitres: litres, grade, pricePerLitre: price, totalPayment: litres * price, recordedBy: recordedBy.trim() } })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

export async function updateDelivery(req, res) {
  const { supplierId, quantityLitres, grade, deliveryDate, recordedBy } = req.body
  if (!isId(req.params.id) || !isId(supplierId) || !isPositive(quantityLitres) || !grades.includes(grade) || !dateValid(deliveryDate) || !recordedBy?.trim()) {
    return res.status(400).json({ message: 'A supplier, positive litres, grade, delivery date and employee name are required.' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [oldRows] = await connection.execute('SELECT * FROM milk_deliveries WHERE id = ? FOR UPDATE', [req.params.id])
    if (!oldRows.length) { await connection.rollback(); return notFound(res, 'Delivery') }
    await connection.execute('SELECT id FROM stock_control WHERE id = 1 FOR UPDATE')
    const [stockRows] = await connection.execute(
      `SELECT COALESCE(SUM(CASE WHEN movement_type = 'delivery' THEN quantity_litres WHEN movement_type IN ('sale','rejected') THEN -quantity_litres ELSE 0 END), 0) AS available
       FROM stock_movements WHERE grade = ?`,
      [oldRows[0].grade],
    )
    const remaining = Number(stockRows[0].available) - (oldRows[0].grade === grade ? Number(oldRows[0].quantity_litres) - Number(quantityLitres) : Number(oldRows[0].quantity_litres))
    if (oldRows[0].grade !== grade) {
      const [newStock] = await connection.execute(
        `SELECT COALESCE(SUM(CASE WHEN movement_type = 'delivery' THEN quantity_litres WHEN movement_type IN ('sale','rejected') THEN -quantity_litres ELSE 0 END), 0) AS available FROM stock_movements WHERE grade = ?`,
        [grade],
      )
      if (Number(newStock[0].available) + Number(quantityLitres) < 0 || remaining < 0) {
        await connection.rollback()
        return res.status(409).json({ message: 'This edit would reduce available stock below zero. Record a stock adjustment first.' })
      }
    } else if (remaining < 0) {
      await connection.rollback()
      return res.status(409).json({ message: 'This edit would reduce available stock below zero. Record a stock adjustment first.' })
    }
    const [supplierRows] = await connection.execute('SELECT id FROM suppliers WHERE id = ? AND status = ?', [supplierId, 'active'])
    if (!supplierRows.length) { await connection.rollback(); return res.status(400).json({ message: 'The selected supplier is not active.' }) }
    const litres = Number(quantityLitres)
    const price = prices[grade]
    await connection.execute(
      'UPDATE milk_deliveries SET supplier_id = ?, delivery_date = ?, quantity_litres = ?, grade = ?, price_per_litre = ?, total_payment = ?, recorded_by = ?, notes = ? WHERE id = ?',
      [supplierId, deliveryDate, litres, grade, price, litres * price, recordedBy.trim(), req.body.notes?.trim() || null, req.params.id],
    )
    await connection.execute('UPDATE stock_movements SET grade = ?, quantity_litres = ?, recorded_by = ? WHERE delivery_id = ?', [grade, litres, recordedBy.trim(), req.params.id])
    await saveQuality(connection, Number(req.params.id), req.body, req.user.id)
    await connection.commit()
    return res.json({ message: 'Delivery updated.' })
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function deleteDelivery(req, res) {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid delivery ID.' })
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute('SELECT * FROM milk_deliveries WHERE id = ? FOR UPDATE', [req.params.id])
    if (!rows.length) { await connection.rollback(); return notFound(res, 'Delivery') }
    await connection.execute('SELECT id FROM stock_control WHERE id = 1 FOR UPDATE')
    const [stock] = await connection.execute(
      `SELECT COALESCE(SUM(CASE WHEN movement_type = 'delivery' THEN quantity_litres WHEN movement_type IN ('sale','rejected') THEN -quantity_litres ELSE 0 END),0) AS available FROM stock_movements WHERE grade = ?`,
      [rows[0].grade],
    )
    if (Number(stock[0].available) < Number(rows[0].quantity_litres)) {
      await connection.rollback()
      return res.status(409).json({ message: 'This delivery cannot be removed because some of its milk has already been sold or rejected.' })
    }
    await connection.execute('DELETE FROM stock_movements WHERE delivery_id = ?', [req.params.id])
    await connection.execute('DELETE FROM milk_deliveries WHERE id = ?', [req.params.id])
    await connection.commit()
    return res.json({ message: 'Delivery removed.' })
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function sales(req, res) {
  const [data] = await pool.execute(
    `SELECT m.id, m.buyer_id AS buyerId, b.buyer_name AS buyerName, m.sale_date AS saleDate, m.grade, m.quantity_litres AS quantityLitres, m.price_per_litre AS pricePerLitre, m.total_amount AS totalAmount, m.recorded_by AS recordedBy
     FROM milk_sales m JOIN buyers b ON b.id = m.buyer_id ORDER BY m.sale_date DESC, m.id DESC`,
  )
  return queryData(res, data)
}

export async function createSale(req, res) {
  const { buyerId, saleDate, grade, quantityLitres, pricePerLitre, recordedBy } = req.body
  if (!isId(buyerId) || !dateValid(saleDate) || !grades.includes(grade) || !isPositive(quantityLitres) || !isPositive(pricePerLitre) || !recordedBy?.trim()) {
    return res.status(400).json({ message: 'Buyer, date, grade, positive litres, selling price and employee name are required.' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute('SELECT id FROM stock_control WHERE id = 1 FOR UPDATE')
    const [buyerRows] = await connection.execute('SELECT id FROM buyers WHERE id = ? AND status = ?', [buyerId, 'active'])
    if (!buyerRows.length) { await connection.rollback(); return res.status(400).json({ message: 'The selected buyer is not active.' }) }
    const [stock] = await connection.execute(
      `SELECT COALESCE(SUM(CASE WHEN movement_type = 'delivery' THEN quantity_litres WHEN movement_type IN ('sale','rejected') THEN -quantity_litres ELSE 0 END), 0) AS available
       FROM stock_movements WHERE grade = ?`,
      [grade],
    )
    const litres = Number(quantityLitres)
    if (Number(stock[0].available) < litres) {
      await connection.rollback()
      return res.status(409).json({ message: `Not enough ${grade} milk in stock. Available: ${Number(stock[0].available).toFixed(2)} L.` })
    }
    const price = Number(pricePerLitre)
    const [result] = await connection.execute(
      'INSERT INTO milk_sales (buyer_id, sale_date, grade, quantity_litres, price_per_litre, total_amount, recorded_by, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [buyerId, saleDate, grade, litres, price, litres * price, recordedBy.trim(), req.user.id],
    )
    await connection.execute(
      'INSERT INTO stock_movements (movement_type, grade, quantity_litres, sale_id, reference, recorded_by) VALUES (?, ?, ?, ?, ?, ?)',
      ['sale', grade, litres, result.insertId, `SALE-${result.insertId}`, recordedBy.trim()],
    )
    await connection.commit()
    return res.status(201).json({ data: { id: result.insertId, buyerId: Number(buyerId), saleDate, grade, quantityLitres: litres, pricePerLitre: price, totalAmount: litres * price, recordedBy: recordedBy.trim() } })
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function updateSale(req, res) {
  const { buyerId, saleDate, grade, quantityLitres, pricePerLitre, recordedBy } = req.body
  if (!isId(req.params.id) || !isId(buyerId) || !dateValid(saleDate) || !grades.includes(grade) || !isPositive(quantityLitres) || !isPositive(pricePerLitre) || !recordedBy?.trim()) {
    return res.status(400).json({ message: 'Buyer, date, grade, positive litres, selling price and employee name are required.' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [oldRows] = await connection.execute('SELECT * FROM milk_sales WHERE id = ? FOR UPDATE', [req.params.id])
    if (!oldRows.length) { await connection.rollback(); return notFound(res, 'Sale') }
    await connection.execute('SELECT id FROM stock_control WHERE id = 1 FOR UPDATE')
    const old = oldRows[0]
    const [stock] = await connection.execute(
      `SELECT COALESCE(SUM(CASE WHEN movement_type = 'delivery' THEN quantity_litres WHEN movement_type IN ('sale','rejected') THEN -quantity_litres ELSE 0 END), 0) AS available FROM stock_movements WHERE grade = ?`,
      [grade],
    )
    const available = Number(stock[0].available) + (old.grade === grade ? Number(old.quantity_litres) : 0)
    if (available < Number(quantityLitres)) {
      await connection.rollback()
      return res.status(409).json({ message: `Not enough ${grade} milk in stock. Available for this sale: ${available.toFixed(2)} L.` })
    }
    const [buyerRows] = await connection.execute('SELECT id FROM buyers WHERE id = ? AND status = ?', [buyerId, 'active'])
    if (!buyerRows.length) { await connection.rollback(); return res.status(400).json({ message: 'The selected buyer is not active.' }) }
    const litres = Number(quantityLitres)
    const price = Number(pricePerLitre)
    await connection.execute('UPDATE milk_sales SET buyer_id = ?, sale_date = ?, grade = ?, quantity_litres = ?, price_per_litre = ?, total_amount = ?, recorded_by = ? WHERE id = ?', [buyerId, saleDate, grade, litres, price, litres * price, recordedBy.trim(), req.params.id])
    await connection.execute('UPDATE stock_movements SET grade = ?, quantity_litres = ?, recorded_by = ? WHERE sale_id = ?', [grade, litres, recordedBy.trim(), req.params.id])
    await connection.commit()
    return res.json({ message: 'Sale updated.' })
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function deleteSale(req, res) {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid sale ID.' })
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute('SELECT id FROM stock_control WHERE id = 1 FOR UPDATE')
    await connection.execute('DELETE FROM stock_movements WHERE sale_id = ?', [req.params.id])
    const [result] = await connection.execute('DELETE FROM milk_sales WHERE id = ?', [req.params.id])
    if (!result.affectedRows) { await connection.rollback(); return notFound(res, 'Sale') }
    await connection.commit()
    return res.json({ message: 'Sale removed and stock restored.' })
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function payments(req, res) {
  const clauses = []
  const params = []
  if (req.query.supplierId !== undefined) {
    if (!isId(req.query.supplierId)) return res.status(400).json({ message: 'Invalid supplier ID.' })
    clauses.push('p.supplier_id = ?')
    params.push(req.query.supplierId)
  }
  if (req.query.month !== undefined) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)) return res.status(400).json({ message: 'Month must be in YYYY-MM format.' })
    clauses.push("p.payment_date >= ? AND p.payment_date < DATE_ADD(?, INTERVAL 1 MONTH)")
    params.push(`${req.query.month}-01`, `${req.query.month}-01`)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const [data] = await pool.execute(
    `SELECT p.id, p.supplier_id AS supplierId, s.full_name AS supplierName, p.amount, p.payment_date AS paymentDate, p.method, p.reference, p.notes
     FROM payments p JOIN suppliers s ON s.id = p.supplier_id ${where} ORDER BY p.payment_date DESC, p.id DESC`,
    params,
  )
  return queryData(res, data)
}

export async function paymentBalances(req, res) {
  const [data] = await pool.execute(
    `SELECT s.id AS supplierId, s.supplier_code AS supplierCode, s.full_name AS supplierName,
      COALESCE(d.earned, 0) AS earned, COALESCE(p.paid, 0) AS paid,
      COALESCE(d.earned, 0) - COALESCE(p.paid, 0) AS outstanding
     FROM suppliers s
     LEFT JOIN (SELECT supplier_id, SUM(total_payment) AS earned FROM milk_deliveries GROUP BY supplier_id) d ON d.supplier_id = s.id
     LEFT JOIN (SELECT supplier_id, SUM(amount) AS paid FROM payments GROUP BY supplier_id) p ON p.supplier_id = s.id
     WHERE s.status = 'active' ORDER BY outstanding DESC, s.full_name`,
  )
  return queryData(res, data)
}

export async function paymentReceipt(req, res) {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid payment ID.' })
  const [rows] = await pool.execute(
    `SELECT p.id, p.amount, p.payment_date AS paymentDate, p.method, p.reference, p.notes,
      s.supplier_code AS supplierCode, s.full_name AS supplierName, s.phone
     FROM payments p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
    [req.params.id],
  )
  if (!rows.length) return notFound(res, 'Payment')
  const payment = rows[0]
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="cemo-payment-${payment.id}.pdf"`)
  const doc = new PDFDocument({ size: 'A5', margin: 40 })
  doc.pipe(res)
  doc.fontSize(20).fillColor('#19764b').text('CEMO MILK')
  doc.moveDown(0.3).fontSize(13).fillColor('#26382e').text('SUPPLIER PAYMENT RECEIPT')
  doc.moveDown().fontSize(10).fillColor('#59665d')
  doc.text(`Receipt number: CEMO-PAY-${String(payment.id).padStart(6, '0')}`)
  doc.text(`Payment date: ${payment.paymentDate}`)
  doc.text(`Supplier: ${payment.supplierName} (${payment.supplierCode})`)
  doc.text(`Phone: ${payment.phone || '—'}`)
  doc.text(`Method: ${payment.method}`)
  doc.text(`Reference: ${payment.reference || '—'}`)
  doc.moveDown().fontSize(15).fillColor('#19764b').text(`Amount paid: ${Number(payment.amount).toLocaleString('en-US')} RWF`)
  if (payment.notes) doc.moveDown().fontSize(9).fillColor('#59665d').text(`Notes: ${payment.notes}`)
  doc.moveDown(2).fontSize(9).fillColor('#87938a').text('This receipt confirms a recorded payment. Supplier balances are based on recorded deliveries and payments.', { width: 330 })
  doc.end()
}

export async function createPayment(req, res) {
  const { supplierId, amount, paymentDate, method } = req.body
  if (!isId(supplierId) || !isPositive(amount) || !dateValid(paymentDate) || !['Mobile Money', 'Bank transfer', 'Cash'].includes(method)) {
    return res.status(400).json({ message: 'Supplier, positive payment amount, date and payment method are required.' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [supplierRows] = await connection.execute('SELECT id FROM suppliers WHERE id = ? FOR UPDATE', [supplierId])
    if (!supplierRows.length) { await connection.rollback(); return res.status(400).json({ message: 'Supplier not found.' }) }
    const [balances] = await connection.execute(
      `SELECT COALESCE((SELECT SUM(total_payment) FROM milk_deliveries WHERE supplier_id = ?),0) AS earned,
              COALESCE((SELECT SUM(amount) FROM payments WHERE supplier_id = ?),0) AS paid`,
      [supplierId, supplierId],
    )
    const outstanding = Number(balances[0].earned) - Number(balances[0].paid)
    if (Number(amount) > outstanding) {
      await connection.rollback()
      return res.status(409).json({ message: `Payment exceeds the supplier's unpaid balance of ${outstanding.toFixed(2)} RWF.` })
    }
    const [result] = await connection.execute(
      'INSERT INTO payments (supplier_id, amount, payment_date, method, reference, notes, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [supplierId, Number(amount), paymentDate, method, req.body.reference?.trim() || null, req.body.notes?.trim() || null, req.user.id],
    )
    await connection.commit()
    return res.status(201).json({ data: { id: result.insertId, supplierId: Number(supplierId), amount: Number(amount), paymentDate, method, reference: req.body.reference || null } })
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function deletePayment(req, res) {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid payment ID.' })
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute('SELECT supplier_id FROM payments WHERE id = ? FOR UPDATE', [req.params.id])
    if (!rows.length) { await connection.rollback(); return notFound(res, 'Payment') }
    await connection.execute('SELECT id FROM suppliers WHERE id = ? FOR UPDATE', [rows[0].supplier_id])
    await connection.execute('DELETE FROM payments WHERE id = ?', [req.params.id])
    await connection.commit()
    return res.json({ message: 'Payment removed.' })
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function expenses(req, res) {
  const [data] = await pool.execute('SELECT id, category, description, amount, expense_date AS expenseDate, recorded_by AS recordedBy FROM expenses ORDER BY expense_date DESC, id DESC')
  return queryData(res, data)
}

const expenseCategories = ['Transport', 'Employee salaries', 'Electricity', 'Maintenance', 'Other']
export async function createExpense(req, res) {
  const { category, description, amount, expenseDate } = req.body
  if (!expenseCategories.includes(category) || !description?.trim() || !isPositive(amount) || !dateValid(expenseDate)) {
    return res.status(400).json({ message: 'Category, description, positive amount and expense date are required.' })
  }
  const [result] = await pool.execute(
    'INSERT INTO expenses (category, description, amount, expense_date, recorded_by, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [category, description.trim(), Number(amount), expenseDate, req.body.recordedBy?.trim() || req.user.fullName, req.user.id],
  )
  return res.status(201).json({ data: { id: result.insertId, category, description: description.trim(), amount: Number(amount), expenseDate, recordedBy: req.body.recordedBy || req.user.fullName } })
}

export async function updateExpense(req, res) {
  const { category, description, amount, expenseDate } = req.body
  if (!isId(req.params.id) || !expenseCategories.includes(category) || !description?.trim() || !isPositive(amount) || !dateValid(expenseDate)) {
    return res.status(400).json({ message: 'Category, description, positive amount and expense date are required.' })
  }
  const [result] = await pool.execute(
    'UPDATE expenses SET category = ?, description = ?, amount = ?, expense_date = ?, recorded_by = ? WHERE id = ?',
    [category, description.trim(), Number(amount), expenseDate, req.body.recordedBy?.trim() || req.user.fullName, req.params.id],
  )
  if (!result.affectedRows) return notFound(res, 'Expense')
  return res.json({ message: 'Expense updated.' })
}

export async function deleteExpense(req, res) {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid expense ID.' })
  const [result] = await pool.execute('DELETE FROM expenses WHERE id = ?', [req.params.id])
  if (!result.affectedRows) return notFound(res, 'Expense')
  return res.json({ message: 'Expense removed.' })
}

export async function stock(req, res) {
  const [rows] = await pool.execute(
    `SELECT grade,
      COALESCE(SUM(CASE WHEN movement_type = 'delivery' THEN quantity_litres WHEN movement_type IN ('sale','rejected') THEN -quantity_litres ELSE 0 END),0) AS available,
      COALESCE(SUM(CASE WHEN movement_type = 'rejected' THEN quantity_litres ELSE 0 END),0) AS rejected
     FROM stock_movements GROUP BY grade`,
  )
  const values = { 'Grade 1': { available: 0, rejected: 0 }, 'Grade 2': { available: 0, rejected: 0 } }
  for (const row of rows) values[row.grade] = { available: Number(row.available), rejected: Number(row.rejected) }
  return res.json({ data: { grade1: values['Grade 1'].available, grade2: values['Grade 2'].available, total: values['Grade 1'].available + values['Grade 2'].available, rejected: values['Grade 1'].rejected + values['Grade 2'].rejected } })
}

export async function stockMovements(req, res) {
  const [data] = await pool.execute(
    'SELECT id, movement_type AS movementType, grade, quantity_litres AS quantityLitres, reference, recorded_by AS recordedBy, created_at AS createdAt FROM stock_movements ORDER BY created_at DESC, id DESC LIMIT 300',
  )
  return queryData(res, data)
}

export async function rejectStock(req, res) {
  const { grade, quantityLitres, recordedBy, reason } = req.body
  if (!grades.includes(grade) || !isPositive(quantityLitres) || !reason?.trim()) return res.status(400).json({ message: 'Grade, positive litres and a rejection reason are required.' })
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute('SELECT id FROM stock_control WHERE id = 1 FOR UPDATE')
    const [rows] = await connection.execute(
      `SELECT COALESCE(SUM(CASE WHEN movement_type = 'delivery' THEN quantity_litres WHEN movement_type IN ('sale','rejected') THEN -quantity_litres ELSE 0 END),0) AS available FROM stock_movements WHERE grade = ?`,
      [grade],
    )
    if (Number(rows[0].available) < Number(quantityLitres)) { await connection.rollback(); return res.status(409).json({ message: 'Rejected litres cannot exceed available grade stock.' }) }
    const [result] = await connection.execute(
      'INSERT INTO stock_movements (movement_type, grade, quantity_litres, reference, recorded_by) VALUES (?, ?, ?, ?, ?)',
      ['rejected', grade, Number(quantityLitres), reason.trim(), recordedBy?.trim() || req.user.fullName],
    )
    await connection.commit()
    return res.status(201).json({ data: { id: result.insertId } })
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}
