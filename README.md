# Sistem Absensi Ronda Berbasis Geofence

Panduan ini ditulis untuk yang **belum pernah coding**. Ikuti urut dari atas ke bawah.

## Isi Folder

```
warga/index.html      -> halaman absen untuk warga (dibuka via scan QR)
warga/app.js           -> logika halaman warga
admin/index.html       -> dashboard admin
admin/dashboard.js     -> logika dashboard admin
shared/config.js       -> SEMUA pengaturan (koordinat, denda, PIN, jadwal) ada di sini
shared/geofence.js     -> rumus hitung jarak (tidak perlu diubah)
apps-script/Code.gs    -> kode backend (ditempel ke Google Apps Script)
```

Anda hanya perlu sering-sering mengedit **shared/config.js**. File lain jarang perlu disentuh.

---

## Langkah 1 — Pasang Backend (Google Apps Script)

Ini adalah "kotak surat sementara" tempat absen warga mampir sebelum ditarik ke dashboard admin.

1. Buka [sheets.google.com](https://sheets.google.com), buat **Spreadsheet baru**, beri nama misalnya "Data Ronda".
2. Di menu atas klik **Extensions (Ekstensi) > Apps Script**.
3. Hapus semua kode contoh yang ada di editor, lalu **copy-paste seluruh isi file `apps-script/Code.gs`** ke sana.
4. Klik ikon disket (Simpan).
5. Klik tombol biru **Deploy > New deployment (Setelan Baru)**.
6. Klik ikon gerigi di sebelah "Select type", pilih **Web app**.
7. Isi:
   - Execute as: **Me (Saya)**
   - Who has access: **Anyone (Siapa saja)**
8. Klik **Deploy**. Google akan minta izin — klik **Authorize**, pilih akun Google Anda, lalu klik **Advanced > Go to (nama project) (unsafe)** kalau muncul peringatan (ini normal untuk script buatan sendiri).
9. Setelah selesai, akan muncul **Web app URL** — bentuknya seperti:
   `https://script.google.com/macros/s/AKfycbxxxxxxxxx/exec`
   **Salin URL ini.**
10. Buka file `shared/config.js`, cari baris `WEBHOOK_URL`, ganti dengan URL yang Anda salin tadi.

> Catatan: setiap kali Anda mengubah isi `Code.gs`, Anda harus **Deploy > Manage deployments > Edit (ikon pensil) > Version: New version > Deploy** lagi supaya perubahan aktif.

---

## Langkah 2 — Publikasikan Website (GitHub Pages)

1. Buat akun gratis di [github.com](https://github.com) kalau belum punya.
2. Buat **repository baru** (tombol hijau "New"), beri nama misalnya `absensi-ronda`, set ke **Public**.
3. Upload semua file & folder di paket ini (`warga/`, `admin/`, `shared/`) ke repository tersebut (bisa drag-and-drop lewat halaman GitHub, tombol "Add file > Upload files").
4. Masuk ke **Settings (Pengaturan) > Pages**.
5. Di bagian "Source", pilih branch **main**, folder **/(root)**, klik **Save**.
6. Tunggu 1-2 menit, GitHub akan memberi URL seperti:
   `https://namaAnda.github.io/absensi-ronda/`
7. Halaman warga ada di: `https://namaAnda.github.io/absensi-ronda/warga/`
   Dashboard admin ada di: `https://namaAnda.github.io/absensi-ronda/admin/`

---

## Langkah 3 — Buat QR Code untuk Pos Ronda

1. Buka situs gratis seperti [qr-code-generator.com](https://www.qr-code-generator.com/) atau cari "generate QR code online".
2. Masukkan URL halaman warga (Langkah 2 poin 7), contoh: `https://namaAnda.github.io/absensi-ronda/warga/`
3. Unduh gambar QR-nya, cetak, tempel/laminating di Pos Ronda.

---

## Langkah 4 — Sesuaikan Pengaturan (shared/config.js)

Buka file ini di GitHub (klik file > ikon pensil untuk edit) dan sesuaikan:

| Pengaturan | Keterangan |
|---|---|
| `POS_LAT`, `POS_LNG` | Koordinat GPS Pos Ronda. Ambil dari klik-kanan titik lokasi di Google Maps. |
| `RADIUS_METER` | Toleransi jarak (meter). Default 30. |
| `WEBHOOK_URL` | URL Apps Script dari Langkah 1. |
| `ADMIN_SECRET` | Kata sandi rahasia — **harus SAMA PERSIS** dengan `ADMIN_SECRET` di `apps-script/Code.gs`. |
| `ADMIN_PIN` | PIN untuk buka dashboard admin. |
| `DENDA_PER_BOLOS` | Nominal denda (Rupiah) per ketidakhadiran. |
| `JADWAL` | Daftar nama warga per grup M1-M6. |
| `ROTASI_ACUAN_TANGGAL` / `ROTASI_ACUAN_GRUP` | Tanggal Sabtu acuan & grup yang bertugas saat itu — dasar hitung rotasi otomatis. |

Setelah mengedit, GitHub Pages otomatis memperbarui website dalam 1-2 menit.

---

## Cara Pakai Setiap Minggu

**Warga:**
1. Datang ke Pos Ronda malam Jumat (21:00 - 01:00).
2. Scan QR Code di Pos Ronda.
3. Pilih nama dari daftar dropdown.
4. Tombol "Absen Sekarang" otomatis aktif jika waktu & lokasi valid — tekan tombol tersebut.

**Admin:**
1. Buka link dashboard admin, masukkan PIN.
2. Dashboard otomatis menarik data terbaru dari cloud saat dibuka (dan cloud otomatis dikosongkan setelahnya).
3. Lihat tabel Riwayat Kehadiran, Daftar Denda, dan Rekap Akumulasi.
4. Tekan "Tandai Lunas" jika warga sudah membayar denda.

---

## Catatan Keamanan & Keterbatasan

- Data absen tersimpan **hanya di browser device admin** (localStorage). Jika Anda membuka dashboard dari device lain, atau membersihkan data browser (clear browsing data), riwayat akan hilang. **Cadangkan (screenshot/export) secara berkala jika perlu.**
- Dashboard admin dilindungi PIN sederhana — cukup untuk mencegah warga iseng, bukan proteksi tingkat enterprise. Jangan bagikan link dashboard admin ke publik.
- Validasi waktu & lokasi dilakukan **dua kali**: di HP warga (untuk kenyamanan, supaya warga tahu langsung kalau gagal) dan di server Google Apps Script (agar tidak bisa dimanipulasi lewat pengaturan jam/lokasi palsu di HP).
- Jika ronda diliburkan suatu minggu (misal karena hujan/hari besar), sistem tetap akan mencatat warga yang tidak absen sebagai "bolos" di minggu itu — Anda perlu hapus manual entri tersebut di kolom Daftar Denda (via localStorage) atau abaikan secara manual saat rekap.
