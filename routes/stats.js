const express = require('express')

module.exports = function(db) {
  const router = express.Router()

  // Aktif kullanıcı sayısını getir (319 + gerçek kullanıcı sayısı)
  router.get('/user-count', (req, res) => {
    try {
      // Başlangıç sayısını al (varsayılan 319)
      const baseCountRow = db.prepare("SELECT value FROM app_config WHERE key = 'base_user_count'").get()
      const baseCount = baseCountRow ? parseInt(baseCountRow.value, 10) : 319

      // Gerçek kayıtlı kullanıcı sayısını al
      const realCountRow = db.prepare('SELECT COUNT(*) as count FROM users').get()
      const realCount = realCountRow ? realCountRow.count : 0

      // Toplam = başlangıç + gerçek
      const totalCount = baseCount + realCount

      res.json({
        success: true,
        count: totalCount,
        baseCount,
        realCount
      })
    } catch (e) {
      console.error('User count error:', e)
      res.status(500).json({ success: false, error: 'Kullanıcı sayısı alınamadı.' })
    }
  })

  return router
}
