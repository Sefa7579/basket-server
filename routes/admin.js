const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'basket-jwt-secret-change-in-production'
const ADMIN_JWT_EXPIRY = '24h'

module.exports = function(db) {
  const router = express.Router()

  function authAdmin(req, res, next) {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Yetkisiz.' })
    }
    try {
      const token = auth.slice(7)
      const payload = jwt.verify(token, JWT_SECRET)
      if (payload.type !== 'admin') {
        return res.status(403).json({ success: false, error: 'Yetkisiz.' })
      }
      req.adminId = payload.adminId
      next()
    } catch (e) {
      return res.status(401).json({ success: false, error: 'Oturum geçersiz.' })
    }
  }

  // Admin giriş
  router.post('/login', (req, res) => {
    try {
      const { username, password } = req.body
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Kullanıcı adı ve şifre gerekli.' })
      }

      const admin = db.prepare('SELECT id, username, password_hash FROM admin_users WHERE username = ?').get(username)
      if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
        return res.status(401).json({ success: false, error: 'Kullanıcı adı veya şifre hatalı.' })
      }

      const token = jwt.sign({ adminId: admin.id, type: 'admin' }, JWT_SECRET, { expiresIn: ADMIN_JWT_EXPIRY })
      res.json({ success: true, token })
    } catch (e) {
      console.error('Admin login error:', e)
      res.status(500).json({ success: false, error: 'Giriş sırasında bir hata oluştu.' })
    }
  })

  // Tüm kullanıcıları listele (admin)
  router.get('/users', authAdmin, (req, res) => {
    try {
      const users = db.prepare(`
        SELECT id, username, first_name, last_name, email, phone, device_id, registered_ip, is_active, created_at
        FROM users
        ORDER BY created_at DESC
      `).all()

      const list = users.map(u => {
        const license = db.prepare(`
          SELECT type, expires_at, is_active FROM licenses
          WHERE user_id = ? AND is_active = 1 ORDER BY expires_at DESC LIMIT 1
        `).get(u.id)
        const licenseTypeMap = { '24h': '24hour', '1month': '1month', '3months': '3month', '6months': '6month' }
        return {
          id: u.id,
          username: u.username,
          name: u.first_name,
          surname: u.last_name,
          email: u.email,
          phone: u.phone,
          registerDate: u.created_at ? new Date(u.created_at).getTime() : Date.now(),
          banned: u.is_active === 0,
          isActive: u.is_active === 1,
          license: license ? {
            type: licenseTypeMap[license.type] || license.type,
            expiryDate: license.expires_at,
            active: license.is_active === 1
          } : null
        }
      })
      res.json({ success: true, users: list })
    } catch (e) {
      console.error('Admin users list error:', e)
      res.status(500).json({ success: false, error: 'Kullanıcılar yüklenemedi.' })
    }
  })

  // Kullanıcı aktif/pasif
  router.patch('/users/:id', authAdmin, (req, res) => {
    try {
      const { id } = req.params
      const { isActive } = req.body
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ success: false, error: 'isActive (true/false) gerekli.' })
      }
      db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id)
      res.json({ success: true })
    } catch (e) {
      console.error('Admin patch user error:', e)
      res.status(500).json({ success: false, error: 'Güncellenemedi.' })
    }
  })

  // Lisans süresi tanımla (admin)
  const DURATIONS = {
    '24hour': 24 * 60 * 60 * 1000,
    '1month': 30 * 24 * 60 * 60 * 1000,
    '3month': 90 * 24 * 60 * 60 * 1000,
    '6month': 180 * 24 * 60 * 60 * 1000
  }
  const LICENSE_TYPE_SERVER = { '24hour': '24h', '1month': '1month', '3month': '3months', '6month': '6months' }

  router.post('/users/:id/license', authAdmin, (req, res) => {
    try {
      const { id: userId } = req.params
      const { licenseType } = req.body
      const duration = DURATIONS[licenseType] || DURATIONS['24hour']
      const typeServer = LICENSE_TYPE_SERVER[licenseType] || '24h'

      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
      if (!user) {
        return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' })
      }

      const now = Date.now()
      const existing = db.prepare('SELECT expires_at FROM licenses WHERE user_id = ? AND is_active = 1 ORDER BY expires_at DESC LIMIT 1').get(userId)
      let expiresAt = now + duration
      if (existing && existing.expires_at > now) {
        expiresAt = existing.expires_at + duration
      }

      db.prepare('UPDATE licenses SET is_active = 0 WHERE user_id = ?').run(userId)
      db.prepare('INSERT INTO licenses (user_id, type, expires_at, is_active) VALUES (?, ?, ?, 1)').run(userId, typeServer, expiresAt)
      res.json({ success: true, expiresAt })
    } catch (e) {
      console.error('Admin add license error:', e)
      res.status(500).json({ success: false, error: 'Lisans eklenemedi.' })
    }
  })

  // Lisans iptal (pasif yap)
  router.delete('/users/:id/license', authAdmin, (req, res) => {
    try {
      const { id: userId } = req.params
      db.prepare('UPDATE licenses SET is_active = 0 WHERE user_id = ?').run(userId)
      res.json({ success: true })
    } catch (e) {
      console.error('Admin revoke license error:', e)
      res.status(500).json({ success: false, error: 'Lisans iptal edilemedi.' })
    }
  })

  // Lisansa süre ekle (gün/saat)
  router.post('/users/:id/license/add-time', authAdmin, (req, res) => {
    try {
      const { id: userId } = req.params
      const { days = 0, hours = 0 } = req.body
      const addMs = days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000
      if (addMs <= 0) {
        return res.status(400).json({ success: false, error: 'Süre girin (days/hours).' })
      }

      const row = db.prepare('SELECT expires_at FROM licenses WHERE user_id = ? AND is_active = 1 ORDER BY expires_at DESC LIMIT 1').get(userId)
      if (!row) {
        return res.status(404).json({ success: false, error: 'Aktif lisans bulunamadı.' })
      }
      const newExpires = Math.max(Date.now(), row.expires_at) + addMs
      db.prepare('UPDATE licenses SET expires_at = ? WHERE user_id = ? AND is_active = 1').run(newExpires, userId)
      res.json({ success: true, expiresAt: newExpires })
    } catch (e) {
      console.error('Admin add time error:', e)
      res.status(500).json({ success: false, error: 'Süre eklenemedi.' })
    }
  })

  // Güncelleme ayarları (versiyon / zorunlu güncelleme / indirme linki)
  router.get('/version', authAdmin, (req, res) => {
    try {
      const row = db.prepare('SELECT current_version, min_version, force_update, download_url, release_notes FROM app_versions ORDER BY id DESC LIMIT 1').get()
      res.json(row || { current_version: '1.0.0', min_version: '1.0.0', force_update: 0, download_url: '', release_notes: '' })
    } catch (e) {
      res.status(500).json({ error: 'Yüklenemedi.' })
    }
  })

  router.put('/version', authAdmin, (req, res) => {
    try {
      const { currentVersion, minVersion, forceUpdate, downloadUrl, releaseNotes } = req.body
      const current = db.prepare('SELECT id FROM app_versions ORDER BY id DESC LIMIT 1').get()
      const force = forceUpdate === true || forceUpdate === 1 ? 1 : 0
      if (current) {
        db.prepare(`
          UPDATE app_versions SET current_version = ?, min_version = ?, force_update = ?, download_url = ?, release_notes = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(currentVersion || '1.0.0', minVersion || '1.0.0', force, downloadUrl || '', releaseNotes || '', current.id)
      } else {
        db.prepare(`
          INSERT INTO app_versions (current_version, min_version, force_update, download_url, release_notes)
          VALUES (?, ?, ?, ?, ?)
        `).run(currentVersion || '1.0.0', minVersion || '1.0.0', force, downloadUrl || '', releaseNotes || '')
      }
      res.json({ success: true })
    } catch (e) {
      console.error('Admin version update error:', e)
      res.status(500).json({ success: false, error: 'Kaydedilemedi.' })
    }
  })

  return router
}
