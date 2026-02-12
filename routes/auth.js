const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')

function generateId() {
  return crypto.randomBytes(8).toString('hex')
}

const JWT_SECRET = process.env.JWT_SECRET || 'basket-jwt-secret-change-in-production'
const JWT_EXPIRY = '7d'

module.exports = function(db) {
  const router = express.Router()

  // Kayıt - sunucuda kullanıcı oluştur
  router.post('/register', (req, res) => {
    try {
      const { username, password, firstName, lastName, email, phone, deviceId, ipAddress } = req.body
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Kullanıcı adı ve şifre gerekli.' })
      }

      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
      if (existing) {
        return res.status(400).json({ success: false, error: 'Bu kullanıcı adı zaten kullanılıyor.' })
      }

      // IP kısıtlaması kaldırıldı - aynı IP'den birden fazla kayıt yapılabilir

      const id = generateId()
      const passwordHash = bcrypt.hashSync(password, 10)
      db.prepare(`
        INSERT INTO users (id, username, password_hash, first_name, last_name, email, phone, device_id, registered_ip, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(id, username, passwordHash, firstName || '', lastName || '', email || '', phone || '', deviceId || '', ipAddress || '')

      const token = jwt.sign({ userId: id, type: 'user' }, JWT_SECRET, { expiresIn: JWT_EXPIRY })
      const user = {
        id,
        username,
        firstName: firstName || '',
        lastName: lastName || '',
        email: email || '',
        phone: phone || '',
        deviceId: deviceId || '',
        registeredIP: ipAddress || '',
        createdAt: new Date().toISOString()
      }
      res.json({ success: true, user, token })
    } catch (e) {
      console.error('Register error:', e)
      res.status(500).json({ success: false, error: 'Kayıt sırasında bir hata oluştu.' })
    }
  })

  // Giriş - sunucuda doğrula, token dön
  router.post('/login', (req, res) => {
    try {
      const { username, password, deviceId, ipAddress } = req.body
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Kullanıcı adı ve şifre gerekli.' })
      }

      const user = db.prepare(`
        SELECT id, username, password_hash, first_name, last_name, email, phone, device_id, registered_ip, is_active, created_at
        FROM users WHERE username = ? OR email = ?
      `).get(username, username)

      if (!user) {
        return res.status(401).json({ success: false, error: 'Kullanıcı adı veya şifre hatalı.' })
      }

      if (user.is_active !== 1) {
        return res.status(403).json({ success: false, error: 'Hesabınız pasif. Yönetici ile iletişime geçin.' })
      }

      const valid = bcrypt.compareSync(password, user.password_hash)
      if (!valid) {
        return res.status(401).json({ success: false, error: 'Kullanıcı adı veya şifre hatalı.' })
      }

      // Cihaz ve IP kısıtlamaları kaldırıldı - kullanıcılar farklı cihaz/IP'den giriş yapabilir

      const token = jwt.sign({ userId: user.id, type: 'user' }, JWT_SECRET, { expiresIn: JWT_EXPIRY })
      const out = {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        deviceId: user.device_id,
        registeredIP: user.registered_ip,
        createdAt: user.created_at
      }
      res.json({ success: true, user: out, token })
    } catch (e) {
      console.error('Login error:', e)
      res.status(500).json({ success: false, error: 'Giriş sırasında bir hata oluştu.' })
    }
  })

  return router
}
