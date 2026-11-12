import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import pool from '../config/db.js'

const money = (value) => Number(value || 0)
const monthFormat = /^\d{4}-(0[1-9]|1[0-2])$/
const monthWindow = (month) => {
  const [year, part] = month.split('-').map(Number)
  const start = `${month}-01`
  const endDate = new Date(Date.UTC(year, part, 1))
  const end = endDate.toISOString().slice(0, 10)
  const previousDate = new Date(Date.UTC(year, part - 2, 1))
  return { start, end, previous: `${previousDate.toISOString().slice(0, 7)}-01` }
}

export async function dashboard(req, res) {
  const canSeeFinance = ['administrator', 'manager', 'accountant'].includes(req.user.role)
  const [[supplierRows]] = await pool.query(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN type = 'Farmer' THEN 1 ELSE 0 END) AS farmers,
      SUM(CASE WHEN type = 'Abadongi' THEN 1 ELSE 0 END) AS abadongi,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
     FROM suppliers`,
  )
  const [[collection]] = await pool.query(
    `SELECT
      COALESCE(SUM(CASE WHEN delivery_date = CURDATE() THEN quantity_litres ELSE 0 END),0) AS today,
      COALESCE(SUM(CASE WHEN delivery_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND delivery_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH) THEN quantity_litres ELSE 0 END),0) AS month,
      COALESCE(SUM(CASE WHEN grade = 'Grade 1' AND delivery_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND delivery_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH) THEN quantity_litres ELSE 0 END),0) AS grade1,
      COALESCE(SUM(CASE WHEN grade = 'Grade 2' AND delivery_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND delivery_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH) THEN quantity_litres ELSE 0 END),0) AS grade2
     FROM milk_deliveries`,
  )
  const [[payments]] = await pool.query(
    `SELECT
      COALESCE((SELECT SUM(total_payment) FROM milk_deliveries),0) -
      COALESCE((SELECT SUM(amount) FROM payments),0) AS outstanding,
      COALESCE((SELECT SUM(amount) FROM payments WHERE payment_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND payment_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)),0) AS paidMonth`,
  )
  const [[sales]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN sale_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND sale_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH) THEN total_amount ELSE 0 END),0) AS month,
      COALESCE(SUM(CASE WHEN sale_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND sale_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH) THEN quantity_litres ELSE 0 END),0) AS litresMonth,
      COALESCE(SUM(total_amount),0) AS total FROM milk_sales`,
  )
  const [stockRows] = await pool.query(
    `SELECT grade, COALESCE(SUM(CASE WHEN movement_type = 'delivery' THEN quantity_litres WHEN movement_type IN ('sale','rejected') THEN -quantity_litres ELSE 0 END),0) AS available
     FROM stock_movements GROUP BY grade`,
  )
  const stock = { 'Grade 1': 0, 'Grade 2': 0 }
  for (const row of stockRows) stock[row.grade] = money(row.available)
  const [monthRows] = await pool.query(
    `SELECT m.monthStart, m.label,
      COALESCE(d.grade1,0) AS grade1, COALESCE(d.grade2,0) AS grade2, COALESCE(s.revenue,0) AS sales
     FROM (
       SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL n MONTH), '%Y-%m-01') AS monthStart,
         DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL n MONTH), '%b') AS label
       FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) seq
     ) m
     LEFT JOIN (
       SELECT DATE_FORMAT(delivery_date, '%Y-%m-01') AS monthStart,
         SUM(CASE WHEN grade = 'Grade 1' THEN quantity_litres ELSE 0 END) AS grade1,
         SUM(CASE WHEN grade = 'Grade 2' THEN quantity_litres ELSE 0 END) AS grade2
       FROM milk_deliveries WHERE delivery_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
       GROUP BY DATE_FORMAT(delivery_date, '%Y-%m-01')
     ) d ON d.monthStart = m.monthStart
     LEFT JOIN (
       SELECT DATE_FORMAT(sale_date, '%Y-%m-01') AS monthStart, SUM(total_amount) AS revenue
       FROM milk_sales WHERE sale_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
       GROUP BY DATE_FORMAT(sale_date, '%Y-%m-01')
     ) s ON s.monthStart = m.monthStart
     ORDER BY m.monthStart`,
  )
  return res.json({
    suppliers: { total: Number(supplierRows.total), active: Number(supplierRows.active), farmers: Number(supplierRows.farmers), abadongi: Number(supplierRows.abadongi) },
    collection: { today: money(collection.today), month: money(collection.month), grade1: money(collection.grade1), grade2: money(collection.grade2) },
    ...(canSeeFinance ? {
      payments: { outstanding: money(payments.outstanding), paidMonth: money(payments.paidMonth) },
      sales: { month: money(sales.month), litresMonth: money(sales.litresMonth), total: money(sales.total) },
    } : {}),
    stock: { grade1: stock['Grade 1'], grade2: stock['Grade 2'], total: stock['Grade 1'] + stock['Grade 2'] },
    monthly: monthRows.map((row) => ({
      label: row.label,
      grade1: money(row.grade1),
      grade2: money(row.grade2),
      ...(canSeeFinance ? { sales: money(row.sales) } : {}),
    })),
  })
}

export async function monthlyReport(req, res) {
  const month = req.query.month || new Date().toISOString().slice(0, 7)
  if (!monthFormat.test(month)) return res.status(400).json({ message: 'Month must be in YYYY-MM format.' })
  const { start, end, previous } = monthWindow(month)
  const [data] = await pool.execute(
    `SELECT s.id AS supplierId, s.full_name AS supplierName,
      COALESCE(SUM(CASE WHEN d.delivery_date >= ? AND d.delivery_date < ? AND d.grade = 'Grade 1' THEN d.quantity_litres ELSE 0 END),0) AS grade1,
      COALESCE(SUM(CASE WHEN d.delivery_date >= ? AND d.delivery_date < ? AND d.grade = 'Grade 2' THEN d.quantity_litres ELSE 0 END),0) AS grade2,
      COALESCE(SUM(CASE WHEN d.delivery_date >= ? AND d.delivery_date < ? THEN d.quantity_litres ELSE 0 END),0) AS totalLitres,
      COALESCE(SUM(CASE WHEN d.delivery_date >= ? AND d.delivery_date < ? THEN d.total_payment ELSE 0 END),0) AS totalPayment,
      COALESCE(SUM(CASE WHEN d.delivery_date >= ? AND d.delivery_date < ? THEN d.quantity_litres ELSE 0 END),0) AS previousMonthLitres
     FROM suppliers s LEFT JOIN milk_deliveries d ON d.supplier_id = s.id
     WHERE s.status = 'active' OR (d.delivery_date >= ? AND d.delivery_date < ?) OR (d.delivery_date >= ? AND d.delivery_date < ?)
     GROUP BY s.id, s.full_name ORDER BY s.full_name`,
    [start, end, start, end, start, end, start, end, previous, start, start, end, previous, start],
  )
  return res.json({ data: data.map((row) => {
    const totalLitres = money(row.totalLitres)
    const previousMonthLitres = money(row.previousMonthLitres)
    const changeLitres = totalLitres - previousMonthLitres
    return {
      ...row,
      grade1: money(row.grade1),
      grade2: money(row.grade2),
      totalLitres,
      totalPayment: money(row.totalPayment),
      previousMonthLitres,
      changeLitres,
      changePercent: previousMonthLitres === 0 ? (totalLitres > 0 ? 100 : 0) : (changeLitres / previousMonthLitres) * 100,
    }
  }) })
}

export async function financeReport(req, res) {
  const month = req.query.month || new Date().toISOString().slice(0, 7)
  if (!monthFormat.test(month)) return res.status(400).json({ message: 'Month must be in YYYY-MM format.' })
  const { start, end } = monthWindow(month)
  const [[totals]] = await pool.execute(
    `SELECT
      COALESCE((SELECT SUM(total_amount) FROM milk_sales WHERE sale_date >= ? AND sale_date < ?),0) AS revenue,
      COALESCE((SELECT SUM(total_payment) FROM milk_deliveries WHERE delivery_date >= ? AND delivery_date < ?),0) AS supplierCosts,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date >= ? AND expense_date < ?),0) AS expenses`,
    [start, end, start, end, start, end],
  )
  const revenue = money(totals.revenue)
  const supplierCosts = money(totals.supplierCosts)
  const expenses = money(totals.expenses)
  return res.json({ data: { month, revenue, supplierCosts, expenses, profitOrLoss: revenue - supplierCosts - expenses } })
}

export async function exportMonthly(req, res) {
  const month = req.query.month || new Date().toISOString().slice(0, 7)
  const type = req.query.type || 'monthly'
  const format = req.query.format
  const types = ['daily-collection', 'monthly', 'payments', 'sales', 'stock', 'expenses', 'profit-loss']
  if (!monthFormat.test(month) || !['pdf', 'excel'].includes(format) || !types.includes(type)) return res.status(400).json({ message: 'Choose a valid report type, YYYY-MM month and pdf or excel format.' })
  const { start, end, previous } = monthWindow(month)
  let data
  let titles
  if (type === 'daily-collection') {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'Date must be in YYYY-MM-DD format.' })
    const [rows] = await pool.execute(
      `SELECT s.supplier_code AS supplierCode, s.full_name AS supplierName, d.delivery_date AS deliveryDate,
        d.grade, d.quantity_litres AS litres, d.price_per_litre AS pricePerLitre, d.total_payment AS payment, d.recorded_by AS recordedBy
       FROM milk_deliveries d JOIN suppliers s ON s.id = d.supplier_id WHERE d.delivery_date = ? ORDER BY s.full_name`,
      [date],
    )
    data = rows
    titles = { supplierCode: 'Supplier ID', supplierName: 'Supplier', deliveryDate: 'Date', grade: 'Grade', litres: 'Litres', pricePerLitre: 'Price / L', payment: 'Payment RWF', recordedBy: 'Recorded by' }
  } else if (type === 'monthly') {
    const [rows] = await pool.execute(
      `SELECT s.supplier_code AS supplierCode, s.full_name AS supplierName,
        COALESCE(SUM(CASE WHEN d.delivery_date >= ? AND d.delivery_date < ? AND d.grade = 'Grade 1' THEN d.quantity_litres ELSE 0 END),0) AS grade1,
        COALESCE(SUM(CASE WHEN d.delivery_date >= ? AND d.delivery_date < ? AND d.grade = 'Grade 2' THEN d.quantity_litres ELSE 0 END),0) AS grade2,
        COALESCE(SUM(CASE WHEN d.delivery_date >= ? AND d.delivery_date < ? THEN d.quantity_litres ELSE 0 END),0) AS totalLitres,
        COALESCE(SUM(CASE WHEN d.delivery_date >= ? AND d.delivery_date < ? THEN d.total_payment ELSE 0 END),0) AS totalPayment,
        COALESCE(SUM(CASE WHEN d.delivery_date >= ? AND d.delivery_date < ? THEN d.quantity_litres ELSE 0 END),0) AS previousMonthLitres
       FROM suppliers s LEFT JOIN milk_deliveries d ON d.supplier_id = s.id
       WHERE s.status = 'active' OR (d.delivery_date >= ? AND d.delivery_date < ?) OR (d.delivery_date >= ? AND d.delivery_date < ?)
       GROUP BY s.id, s.supplier_code, s.full_name ORDER BY s.full_name`,
      [start, end, start, end, start, end, start, end, previous, start, start, end, previous, start],
    )
    data = rows.map((row) => {
      const total = money(row.totalLitres)
      const prior = money(row.previousMonthLitres)
      return { ...row, grade1: money(row.grade1), grade2: money(row.grade2), totalLitres: total, totalPayment: money(row.totalPayment), previousMonthLitres: prior, changeLitres: total - prior, changePercent: prior ? ((total - prior) / prior) * 100 : (total ? 100 : 0) }
    })
    titles = { supplierCode: 'Supplier ID', supplierName: 'Supplier', grade1: 'Grade 1 L', grade2: 'Grade 2 L', totalLitres: 'Total litres', previousMonthLitres: 'Previous month L', changeLitres: 'Change L', changePercent: 'Change %', totalPayment: 'Payment RWF' }
  } else if (type === 'payments') {
    const [rows] = await pool.execute(
      `SELECT s.supplier_code AS supplierCode, s.full_name AS supplierName, p.payment_date AS paymentDate,
        p.amount, p.method, p.reference FROM payments p JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.payment_date >= ? AND p.payment_date < ? ORDER BY p.payment_date`,
      [start, end],
    )
    data = rows
    titles = { supplierCode: 'Supplier ID', supplierName: 'Supplier', paymentDate: 'Date', amount: 'Amount RWF', method: 'Method', reference: 'Reference' }
  } else if (type === 'sales') {
    const [rows] = await pool.execute(
      `SELECT b.buyer_name AS buyer, m.sale_date AS saleDate, m.grade, m.quantity_litres AS litres,
        m.price_per_litre AS pricePerLitre, m.total_amount AS totalAmount, m.recorded_by AS recordedBy
       FROM milk_sales m JOIN buyers b ON b.id = m.buyer_id WHERE m.sale_date >= ? AND m.sale_date < ? ORDER BY m.sale_date`,
      [start, end],
    )
    data = rows
    titles = { buyer: 'Buyer', saleDate: 'Date', grade: 'Grade', litres: 'Litres', pricePerLitre: 'Price / L', totalAmount: 'Total RWF', recordedBy: 'Recorded by' }
  } else if (type === 'stock') {
    const [rows] = await pool.execute(
      `SELECT movement_type AS movement, grade, quantity_litres AS litres, reference, recorded_by AS recordedBy, created_at AS createdAt
       FROM stock_movements ORDER BY created_at DESC LIMIT 1000`,
    )
    data = rows
    titles = { movement: 'Movement', grade: 'Grade', litres: 'Litres', reference: 'Reference', recordedBy: 'Recorded by', createdAt: 'Recorded at' }
  } else if (type === 'expenses') {
    const [rows] = await pool.execute(
      'SELECT category, description, expense_date AS expenseDate, amount, recorded_by AS recordedBy FROM expenses WHERE expense_date >= ? AND expense_date < ? ORDER BY expense_date',
      [start, end],
    )
    data = rows
    titles = { category: 'Category', description: 'Description', expenseDate: 'Date', amount: 'Amount RWF', recordedBy: 'Recorded by' }
  } else {
    const [[totals]] = await pool.execute(
      `SELECT COALESCE((SELECT SUM(total_amount) FROM milk_sales WHERE sale_date >= ? AND sale_date < ?),0) AS revenue,
        COALESCE((SELECT SUM(total_payment) FROM milk_deliveries WHERE delivery_date >= ? AND delivery_date < ?),0) AS supplierCosts,
        COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date >= ? AND expense_date < ?),0) AS expenses`,
      [start, end, start, end, start, end],
    )
    const revenue = money(totals.revenue)
    const supplierCosts = money(totals.supplierCosts)
    const expenses = money(totals.expenses)
    data = [{ revenue, supplierCosts, expenses, profitOrLoss: revenue - supplierCosts - expenses }]
    titles = { revenue: 'Sales revenue RWF', supplierCosts: 'Supplier costs RWF', expenses: 'Operating expenses RWF', profitOrLoss: 'Profit / loss RWF' }
  }
  const filename = `cemo-${type}-${month}`
  if (format === 'excel') {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'CEMO Milk Management System'
    const sheet = workbook.addWorksheet(type.replace('-', ' '))
    sheet.columns = Object.entries(titles).map(([key, header]) => ({ header, key, width: Math.max(16, Math.min(32, header.length + 4)) }))
    sheet.addRows(data)
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF19764B' } }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
    await workbook.xlsx.write(res)
    return res.end()
  }
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`)
  const doc = new PDFDocument({ margin: 38, size: 'A4', layout: 'landscape' })
  doc.pipe(res)
  doc.fontSize(18).fillColor('#19764b').text('CEMO Milk Management', { align: 'left' })
  doc.moveDown(0.3).fontSize(12).fillColor('#26382e').text(`Supplier milk summary · ${month}`)
  doc.moveDown(1)
  const headers = Object.values(titles)
  const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const widths = headers.map(() => availableWidth / headers.length)
  let y = doc.y
  let x = doc.page.margins.left
  doc.fontSize(8).fillColor('#19764b')
  headers.forEach((header, i) => { doc.text(header, x, y, { width: widths[i] }); x += widths[i] })
  y += 18
  doc.moveTo(doc.page.margins.left, y - 4).lineTo(doc.page.width - doc.page.margins.right, y - 4).strokeColor('#dce8df').stroke()
  doc.fontSize(8).fillColor('#35443a')
  for (const row of data) {
    if (y > doc.page.height - 45) { doc.addPage(); y = doc.page.margins.top }
    const values = Object.keys(titles).map((key) => {
      const value = row[key]
      if (value === null || value === undefined) return ''
      if (key.toLowerCase().includes('percent')) return `${Number(value).toFixed(1)}%`
      if (typeof value === 'number') return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })
      return String(value)
    })
    x = doc.page.margins.left
    values.forEach((value, i) => { doc.text(String(value), x, y, { width: widths[i], ellipsis: true }); x += widths[i] })
    y += 18
  }
  if (!data.length) doc.text('No supplier records for this month.', doc.page.margins.left, y)
  doc.end()
}
