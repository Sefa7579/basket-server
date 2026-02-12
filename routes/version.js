const express = require('express')

module.exports = function(db) {
  const router = express.Router()

  // Uygulama açılışta versiyon kontrolü
  router.get('/', (req, res) => {
    try {
      const row = db.prepare(`
        SELECT current_version, min_version, force_update, download_url, release_notes, updated_at
        FROM app_versions ORDER BY id DESC LIMIT 1
      `).get()

      if (!row) {
        return res.json({
          currentVersion: '1.0.0',
          minVersion: '1.0.0',
          forceUpdate: false,
          downloadUrl: '',
          releaseNotes: '',
          updatedAt: null
        })
      }

      res.json({
        currentVersion: row.current_version,
        minVersion: row.min_version,
        forceUpdate: row.force_update === 1,
        downloadUrl: row.download_url || '',
        releaseNotes: row.release_notes || '',
        updatedAt: row.updated_at
      })
    } catch (e) {
      console.error('Version get error:', e)
      res.status(500).json({ error: 'Versiyon bilgisi alınamadı.' })
    }
  })

  // Küçük güncellemeler için OTA config (APK/EXE dağıtımı gerekmez)
  router.get('/config', (req, res) => {
    try {
      const rows = db.prepare('SELECT key, value FROM app_config').all()
      const config = {}
      rows.forEach(r => {
        try {
          config[r.key] = JSON.parse(r.value)
        } catch {
          config[r.key] = r.value
        }
      })
      res.json(config)
    } catch (e) {
      console.error('Config get error:', e)
      res.json({})
    }
  })

  return router
}
