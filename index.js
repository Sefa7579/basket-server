const fs = require('fs')
const path = require('path')
const express = require('express')
const cors = require('cors')
const { initDatabase } = require('./db')

// Data klasörünü oluştur
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true })

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// Global db instance
let db = null

// Sunucuyu başlat
async function startServer() {
  try {
    // Veritabanını başlat
    console.log('[Server] Veritabanı başlatılıyor...')
    db = await initDatabase()
    console.log('[Server] Veritabanı hazır.')

    // DB'yi global olarak ayarla (routes için)
    app.locals.db = db

    // Routes
    const authRoutes = require('./routes/auth')(db)
    const adminRoutes = require('./routes/admin')(db)
    const licenseRoutes = require('./routes/license')(db)
    const versionRoutes = require('./routes/version')(db)
    const statsRoutes = require('./routes/stats')(db)

    app.use('/api/auth', authRoutes)
    app.use('/api/admin', adminRoutes)
    app.use('/api/license', licenseRoutes)
    app.use('/api/version', versionRoutes)
    app.use('/api/stats', statsRoutes)

    // Health check
    app.get('/health', (req, res) => res.json({ ok: true }))

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ error: 'Not found' })
    })

    // Error handler
    app.use((err, req, res, next) => {
      console.error('[Server] Error:', err)
      res.status(500).json({ error: 'Internal server error' })
    })

    // Sunucuyu başlat
    app.listen(PORT, () => {
      console.log(`[Server] Basket sunucusu http://localhost:${PORT} adresinde çalışıyor.`)
      console.log(`[Server] Admin hesapları: Sefa7579, Semdota`)
    })

  } catch (error) {
    console.error('[Server] Başlatma hatası:', error)
    process.exit(1)
  }
}

startServer()
