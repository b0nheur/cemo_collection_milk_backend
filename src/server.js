import 'dotenv/config'
import app from './app.js'
import pool from './config/db.js'

const port = Number(process.env.PORT || 5000)
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be configured with at least 32 characters.')
  process.exit(1)
}

try {
  await pool.query('SELECT 1')
  app.listen(port, () => console.log(`CEMO API listening on http://localhost:${port}`))
} catch (error) {
  console.error('Unable to connect to MySQL:', error.message)
  process.exit(1)
}
