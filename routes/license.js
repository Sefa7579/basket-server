const express = require('express')
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'basket-jwt-secret-change-in-production'
// Offline kullanım için maksimum süre (ms) - örn. 72 saat
const MAX_OFFLINE_GRACE_MS = Number(process.env.MAX_OFFLINE_GRACE_MS) || 72 * 60 * 60 * 1000

module.exports = function(db) {
  const router = express.Router()

  function authUser(req, res, next) {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Yetkisiz.', code: 'NO_TOKEN' })
    }
    try {
      const token = auth.slice(7)
      const payload = jwt.verify(token, JWT_SECRET)
      if (payload.type !== 'user') {
        return res.status(403).json({ success: false, error: 'Yetkisiz.', code: 'INVALID_TOKEN' })
      }
      req.userId = payload.userId
      next()
    } catch (e) {
      return res.status(401).json({ success: false, error: 'Oturum geçersiz.', code: 'INVALID_TOKEN' })
    }
  }

  // Her açılışta lisans doğrulama (sunucuda)
  router.post('/validate', authUser, (req, res) => {
    try {
      const userId = req.userId
      const user = db.prepare('SELECT is_active FROM users WHERE id = ?').get(userId)
      if (!user) {
        return res.json({
          valid: false,
          reason: 'USER_NOT_FOUND',
          message: 'Kullanıcı bulunamadı.'
        })
      }
      if (user.is_active !== 1) {
        return res.json({
          valid: false,
          reason: 'USER_DEACTIVATED',
          message: 'Hesabınız pasif. Yönetici ile iletişime geçin.'
        })
      }

      const license = db.prepare(`
        SELECT type, expires_at, is_active FROM licenses
        WHERE user_id = ? AND is_active = 1 ORDER BY expires_at DESC LIMIT 1
      `).get(userId)

      if (!license) {
        return res.json({
          valid: false,
          reason: 'NO_LICENSE',
          message: 'Lisansınız bulunmuyor.'
        })
      }
      if (license.is_active !== 1) {
        return res.json({
          valid: false,
          reason: 'LICENSE_REVOKED',
          message: 'Lisansınız iptal edildi.'
        })
      }

      const now = Date.now()
      if (license.expires_at <= now) {
        return res.json({
          valid: false,
          reason: 'LICENSE_EXPIRED',
          message: 'Lisans süreniz doldu.',
          expiresAt: license.expires_at
        })
      }

      res.json({
        valid: true,
        license: {
          type: license.type,
          expiresAt: license.expires_at,
          isActive: true
        },
        validatedAt: now
      })
    } catch (e) {
      console.error('License validate error:', e)
      res.status(500).json({ valid: false, reason: 'ERROR', message: 'Doğrulama hatası.' })
    }
  })

  // Offline grace süresi (client bu süreyi aşarsa erişim kapanır)
  router.get('/offline-max-hours', (req, res) => {
    res.json({ maxOfflineHours: MAX_OFFLINE_GRACE_MS / (60 * 60 * 1000) })
  })

  return router
}
