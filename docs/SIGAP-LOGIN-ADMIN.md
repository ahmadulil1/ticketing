# Login Admin Ticketing via SIGAP

Status: aktif di staging (`https://sigap.marisoncloud.com`).

## Alur

```
Browser Ticketing  →  POST /api/auth/login/sigap {email, password}
                          ↓ (server Ticketing, HTTPS, origin staging persis)
                    SIGAP POST /api/auth/login {email, password}
                          ↓
                    { session: { user: { id, email, full_name } } }
                          ↓
                    cek tabel sigap_admins (ID SIGAP / email pending)
                          ↓
                    Token Ticketing (JWT) → dashboard admin
```

- Password hanya diteruskan ke SIGAP, tidak pernah disimpan atau dicatat.
- Server Ticketing tidak memakai cookie SIGAP; hanya membaca `user.id`.
- `id` dari SIGAP adalah kunci. Email cuma jalan masuk **sekali** (bootstrap),
  lalu diikat ke `sigap_user_id` dan tidak bisa dipakai lagi oleh akun lain.

## Allowlist admin

```bash
# di server
node /opt/ticketing/sigap-admin.cjs list
node /opt/ticketing/sigap-admin.cjs add ahmad@marison.id "Ahmad Ulil Albab"
node /opt/ticketing/sigap-admin.cjs remove ahmad@marison.id
```

Env (di `/etc/ticketing-api.env`):

```
SIGAP_BASE_URL=https://sigap.marison-testing.biz.id
SIGAP_ADMIN_EMAILS=ahmad@marison.id,aldama@marison.id
SIGAP_ADMIN_NAMES=Ahmad Ulil Albab,Aldama
```

Baris `SIGAP_ADMIN_EMAILS` di-seed saat API start. Baris yang sudah terikat ke
ID SIGAP tidak ditimpa.

## Akun lokal

- `POST /api/auth/login` → **403** "Login lokal dinonaktifkan. Gunakan akun SIGAP."
- `POST /api/auth/register` → **403** (pendaftaran ditutup).
- Kelima akun lokal lama dinonaktifkan lewat `scripts/disable-local-accounts.cjs`:
  password diacak random + `is_active = false`. **Baris tidak dihapus** supaya
  rujukan tiket/chat/audit tetap utuh (menghapus baris = history putus).
- Backup: `/var/www/ticketing/users-backup-<waktu>.sql`.

Akun admin SIGAP tetap butuh baris `users` (untuk FK tiket/chat). Baris itu
"cermin": role dipaksa `admin`, password diacak random sehingga mustahil dipakai
login lokal, dan `sigap_user_id` menautkannya ke SIGAP.

## Endpoint

| Method / path | Perilaku |
|---|---|
| `POST /api/auth/login/sigap` | `{email, password}` → `{token, user}` |
| `POST /api/auth/login` | 403 (dimatikan) |
| `POST /api/auth/register` | 403 (dimatikan) |
| `GET /api/auth/me` | seperti biasa, pakai JWT |

## Tes

```bash
# mock SIGAP + alur Ticketing (15 cek)
node /opt/ticketing/test-sigap-login.cjs
```

Untuk menjalankan tes, arahkan `SIGAP_BASE_URL` ke mock (127.0.0.1:3999) lebih
dulu, lalu kembalikan ke staging.

## Batas

- Hanya staging; token desktop tidak dipakai untuk ini (beda kontrak).
- SIGAP bisa mewajibkan OTP untuk login web — kalau nanti aktif, alur ini
  perlu/token tambahan.
- Belum ada rate limit spesifik per email; rate limit bawaan 10/menit per IP.
