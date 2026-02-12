const express = require('express')

module.exports = function(db) {
  const router = express.Router()

  // Mevcut versiyon bilgisi
  let appVersion = {
    android: {
      version: "1.0.0",
      versionCode: 1,
      downloadUrl: "",
      forceUpdate: false,
      changelog: "İlk sürüm"
    },
    windows: {
      version: "1.0.0",
      downloadUrl: "",
      forceUpdate: false,
      changelog: "İlk sürüm"
    }
  }

  // Versiyon bilgisini veritabanından yükle
  try {
    const saved = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_version')
    if (saved) {
      appVersion = JSON.parse(saved.value)
    }
  } catch (e) {
    console.log('Versiyon ayarları yüklenemedi, varsayılan kullanılıyor')
  }

  // Güncelleme kontrolü - Android
  router.get('/check/android', (req, res) => {
    const currentVersion = req.query.version || "0.0.0"
    const currentCode = parseInt(req.query.versionCode) || 0
    
    const latest = appVersion.android
    const needsUpdate = currentCode < latest.versionCode
    
    res.json({
      success: true,
      needsUpdate,
      forceUpdate: latest.forceUpdate && needsUpdate,
      latestVersion: latest.version,
      latestVersionCode: latest.versionCode,
      downloadUrl: latest.downloadUrl,
      changelog: latest.changelog
    })
  })

  // Güncelleme kontrolü - Windows
  router.get('/check/windows', (req, res) => {
    const currentVersion = req.query.version || "0.0.0"
    
    const latest = appVersion.windows
    const needsUpdate = currentVersion !== latest.version
    
    res.json({
      success: true,
      needsUpdate,
      forceUpdate: latest.forceUpdate && needsUpdate,
      latestVersion: latest.version,
      downloadUrl: latest.downloadUrl,
      changelog: latest.changelog
    })
  })

  // Admin: Versiyon güncelle
  router.post('/set', (req, res) => {
    try {
      const { platform, version, versionCode, downloadUrl, forceUpdate, changelog } = req.body
      
      if (platform === 'android') {
        appVersion.android = {
          version: version || appVersion.android.version,
          versionCode: versionCode || appVersion.android.versionCode,
          downloadUrl: downloadUrl || appVersion.android.downloadUrl,
          forceUpdate: forceUpdate !== undefined ? forceUpdate : appVersion.android.forceUpdate,
          changelog: changelog || appVersion.android.changelog
        }
      } else if (platform === 'windows') {
        appVersion.windows = {
          version: version || appVersion.windows.version,
          downloadUrl: downloadUrl || appVersion.windows.downloadUrl,
          forceUpdate: forceUpdate !== undefined ? forceUpdate : appVersion.windows.forceUpdate,
          changelog: changelog || appVersion.windows.changelog
        }
      }
      
      // Veritabanına kaydet
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('app_version', JSON.stringify(appVersion))
      
      res.json({ success: true, appVersion })
    } catch (e) {
      console.error('Update set error:', e)
      res.status(500).json({ success: false, error: 'Güncelleme ayarlanamadı' })
    }
  })

  // Admin: Mevcut versiyon bilgisi
  router.get('/info', (req, res) => {
    res.json({ success: true, appVersion })
  })

  return router
}
