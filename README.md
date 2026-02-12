# Basket Sunucu (Client-Server)

Tüm kullanıcı kayıtları, lisanslar ve versiyon bilgisi bu sunucuda tutulur. APK/EXE istemci olarak sadece sunucuya istek atar.

## Kurulum

```bash
cd server
npm install
```

## Çalıştırma

```bash
npm start
```

Varsayılan port: **4000** (`http://localhost:4000`)

## Ortam Değişkenleri (isteğe bağlı)

- `PORT` – Sunucu portu (varsayılan: 4000)
- `JWT_SECRET` – JWT imza anahtarı (production'da mutlaka değiştirin)
- `MAX_OFFLINE_GRACE_MS` – Offline lisans grace süresi (ms). Varsayılan: 72 saat

## Admin Hesapları

İlk çalıştırmada otomatik oluşturulur:
- **Hesap 1:** Sefa7579
- **Hesap 2:** Semdota

Admin şifreleri güvenlik nedeniyle burada gösterilmez.

## Veritabanı

SQLite, `server/data/basket.db` dosyasında. Klasör ilk çalıştırmada otomatik oluşturulur.

## API Özeti

- `POST /api/auth/register` – Kullanıcı kayıt
- `POST /api/auth/login` – Kullanıcı giriş (JWT döner)
- `POST /api/admin/login` – Admin giriş (JWT döner)
- `GET /api/admin/users` – Kullanıcı listesi (Admin token)
- `PATCH /api/admin/users/:id` – Kullanıcı aktif/pasif
- `POST /api/admin/users/:id/license` – Lisans ekle
- `DELETE /api/admin/users/:id/license` – Lisans iptal
- `POST /api/admin/users/:id/license/add-time` – Lisansa süre ekle
- `GET/PUT /api/admin/version` – Güncelleme ayarları
- `POST /api/license/validate` – Lisans doğrulama (her açılışta istemci çağırır)
- `GET /api/version` – Versiyon bilgisi (güncelleme kontrolü)

## İstemci Ayarı

İstemci (Vite/Electron) sunucu adresini `VITE_API_URL` ile alır. Örnek: `.env` dosyasında:

```
VITE_API_URL=http://localhost:4000
```

Production'da kendi sunucu adresinizi yazın.
