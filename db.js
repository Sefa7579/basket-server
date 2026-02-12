const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')

const dataDir = path.join(__dirname, 'data')
const dbPath = process.env.DB_PATH || path.join(dataDir, 'basket.db')

// Data klasörünü oluştur
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

let db = null
let SQL = null

// Veritabanını kaydet
function saveDatabase() {
  if (db) {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(dbPath, buffer)
  }
}

// Periyodik kaydetme (her 30 saniyede bir)
setInterval(() => {
  saveDatabase()
}, 30000)

// Process kapanırken kaydet
process.on('exit', saveDatabase)
process.on('SIGINT', () => { saveDatabase(); process.exit() })
process.on('SIGTERM', () => { saveDatabase(); process.exit() })

// better-sqlite3 uyumlu wrapper
class DatabaseWrapper {
  constructor(sqlDb) {
    this.db = sqlDb
  }

  exec(sql) {
    this.db.run(sql)
    saveDatabase()
  }

  prepare(sql) {
    const self = this
    return {
      run(...params) {
        self.db.run(sql, params)
        saveDatabase()
        return { changes: self.db.getRowsModified() }
      },
      get(...params) {
        const stmt = self.db.prepare(sql)
        stmt.bind(params)
        if (stmt.step()) {
          const row = stmt.getAsObject()
          stmt.free()
          return row
        }
        stmt.free()
        return undefined
      },
      all(...params) {
        const results = []
        const stmt = self.db.prepare(sql)
        stmt.bind(params)
        while (stmt.step()) {
          results.push(stmt.getAsObject())
        }
        stmt.free()
        return results
      }
    }
  }
}

// Async başlatma
async function initDatabase() {
  SQL = await initSqlJs()
  
  // Mevcut DB dosyası varsa yükle
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
    console.log('[DB] Mevcut veritabanı yüklendi:', dbPath)
  } else {
    db = new SQL.Database()
    console.log('[DB] Yeni veritabanı oluşturuldu')
  }

  // Tabloları oluştur
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      device_id TEXT,
      registered_ip TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      current_version TEXT NOT NULL,
      min_version TEXT NOT NULL,
      force_update INTEGER DEFAULT 0,
      download_url TEXT,
      release_notes TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)

  // Index'ler (ayrı ayrı çalıştır)
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id)`)
  } catch (e) {}
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON licenses(expires_at)`)
  } catch (e) {}

  const wrapper = new DatabaseWrapper(db)

  // Admin kullanıcıları (SADECE bu hesaplar giriş yapabilir)
  const adminUsers = [
    { username: 'Sefa7579', password: '31222449636' },
    { username: 'Semdota', password: 'Bk7676320' }
  ]
  
  // TÜM mevcut adminleri sil ve yeniden oluştur
  wrapper.prepare('DELETE FROM admin_users').run()
  console.log('[DB] Tüm eski admin hesapları silindi.')
  
  // Yeni admin hesaplarını ekle
  for (const admin of adminUsers) {
    const hash = bcrypt.hashSync(admin.password, 10)
    wrapper.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(admin.username, hash)
    console.log(`[DB] Admin oluşturuldu: ${admin.username}`)
  }

  // Varsayılan versiyon kaydı
  const versionCount = wrapper.prepare('SELECT COUNT(*) as c FROM app_versions').get()
  if (!versionCount || versionCount.c === 0) {
    wrapper.prepare(`
      INSERT INTO app_versions (current_version, min_version, force_update, download_url)
      VALUES (?, ?, ?, ?)
    `).run('1.0.0', '1.0.0', 0, '')
    console.log('[DB] Varsayılan versiyon 1.0.0 eklendi.')
  }

  // Başlangıç kullanıcı sayısı (319)
  const baseUserCount = wrapper.prepare("SELECT value FROM app_config WHERE key = 'base_user_count'").get()
  if (!baseUserCount) {
    wrapper.prepare("INSERT INTO app_config (key, value) VALUES ('base_user_count', '319')").run()
    console.log('[DB] Başlangıç kullanıcı sayısı 319 olarak ayarlandı.')
  }

  saveDatabase()
  
  return wrapper
}

// Export
module.exports = { initDatabase }
