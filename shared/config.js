// ============================================================================
// KONFIGURASI SISTEM ABSENSI RONDA
// File ini dipakai bersama oleh halaman Warga (warga/index.html) dan
// Dashboard Admin (admin/index.html). Cukup edit nilai di bawah ini,
// TIDAK PERLU mengubah file lain untuk pengaturan dasar.
// ============================================================================

const CONFIG = {

  // --- 1. LOKASI POS RONDA (WAJIB DICEK) -----------------------------------
  // Cara ambil koordinat: buka Google Maps > klik-kanan tepat di titik
  // Pos Ronda > klik angka koordinat yang muncul paling atas untuk menyalin.
  POS_LAT: -7.3481181,
  POS_LNG: 108.3864744,
  RADIUS_METER: 30, // toleransi jarak maksimal (meter) dari Pos Ronda

  // --- 2. URL BACKEND (Cloud Relay / Google Apps Script) -------------------
  // WAJIB DIGANTI setelah Apps Script di-deploy (lihat README.md Langkah 2).
  // Contoh: "https://script.google.com/macros/s/AKfycb..../exec"
  WEBHOOK_URL: "https://script.google.com/macros/s/AKfycbzHxsgzsonpRHwYcIWGk_rS8WqkgCLLgV1fxjjsIAjglWeOK4aU4N1DS_TdEQfITXen/exec",

  // --- 3. KATA SANDI SINKRONISASI ------------------------------------------
  // Kunci rahasia agar hanya Dashboard Admin yang bisa menarik & menghapus
  // data dari Google Sheet. HARUS SAMA PERSIS dengan ADMIN_SECRET di Code.gs.
  ADMIN_SECRET: "ronda-rahasia-2026",

  // --- 4. PIN DASHBOARD ADMIN -----------------------------------------------
  // PIN untuk membuka Dashboard Admin di HP/laptop admin. Ganti sesukanya.
  ADMIN_PIN: "192026",

  // --- 5. NOMINAL DENDA -------------------------------------------------------
  DENDA_PER_BOLOS: 25000, // dalam Rupiah

  // --- 6. JAM ABSEN DIBUKA (waktu WIB / Asia-Jakarta) -----------------------
  // Malam Jumat pukul 21:00 s/d Sabtu pukul 01:00.
  // Nilai "hari" pakai standar JavaScript: 0=Minggu, 1=Senin ... 6=Sabtu.
  JAM_MULAI: { hari: 5, jam: 21, menit: 0 }, // Jumat 21:00
  JAM_SELESAI: { hari: 6, jam: 1, menit: 0 }, // Sabtu 01:00

  // --- 7. JADWAL & PEMBAGIAN GRUP RONDA (M1 - M6) ---------------------------
  // Tambah / kurangi / ganti nama sesuai kebutuhan RT/RW Anda.
  JADWAL: {
    M1: ["Pak Aziz", "Pak Ujang", "Pak Arif", "Pak Nandang"],
    M2: ["Pak Omen", "Pak Nana", "Pak Dadan", "Pak Dudung"],
    M3: ["Pak Sayyid", "Pak Feri", "Pak Egi", "Pak Ari", "Pak Karwan"],
    M4: ["Pak Asep", "Pak Iwan", "Pak Toni", "Pak Fajar"],
    M5: ["Pak Oky", "Pak Ali", "Pak Rian", "Pak Ahmad Dani", "Pak Alfian"],
    M6: ["Pak Anggi", "Pak Heri", "Pak Iik", "Pak Ayi"]
  },

  // --- 8. TITIK ACUAN ROTASI GRUP -------------------------------------------
  // Tanggal Sabtu ini dijadikan patokan awal, beserta grup yang bertugas
  // pada tanggal tersebut. Grup minggu-minggu lain dihitung otomatis
  // maju/mundur dari titik ini (urutan M1 -> M2 -> ... -> M6 -> M1 ...).
  ROTASI_ACUAN_TANGGAL: "2026-08-15", // Sabtu, 15 Agustus 2026
  ROTASI_ACUAN_GRUP: "M3"             // grup yang bertugas pada tanggal di atas
};

// ============================================================================
// FUNGSI BANTU BERSAMA (dipakai oleh warga & admin) — TIDAK PERLU DIUBAH
// ============================================================================

// Menentukan grup (M1-M6) yang bertugas pada tanggal tertentu (default: hari ini)
function grupMingguIni(tanggal) {
  tanggal = tanggal || new Date();
  const namaGrup = Object.keys(CONFIG.JADWAL); // ["M1","M2",...,"M6"]
  const acuan = new Date(CONFIG.ROTASI_ACUAN_TANGGAL + "T00:00:00");

  // Normalisasi ke tengah malam supaya perbandingan tanggal akurat
  const t = new Date(tanggal.getFullYear(), tanggal.getMonth(), tanggal.getDate());
  const a = new Date(acuan.getFullYear(), acuan.getMonth(), acuan.getDate());

  const selisihHari = Math.round((t - a) / (1000 * 60 * 60 * 24));
  const selisihMinggu = Math.round(selisihHari / 7);

  const idxAcuan = namaGrup.indexOf(CONFIG.ROTASI_ACUAN_GRUP);
  let idx = (idxAcuan + selisihMinggu) % namaGrup.length;
  if (idx < 0) idx += namaGrup.length;

  return namaGrup[idx];
}

// Mencari nama grup (M1-M6) tempat seorang warga terdaftar
function cariGrupDariNama(nama) {
  for (const grup in CONFIG.JADWAL) {
    if (CONFIG.JADWAL[grup].includes(nama)) return grup;
  }
  return "-";
}

// Menghasilkan daftar semua nama warga (gabungan semua grup, tanpa duplikat)
function semuaNamaWarga() {
  const set = new Set();
  Object.values(CONFIG.JADWAL).forEach((arr) => arr.forEach((n) => set.add(n)));
  return Array.from(set);
}

// Menghitung "tanggal Sabtu ronda" dari sebuah waktu (Jumat malam masuk ke
// Sabtu yang sama, Sabtu dini hari tetap tanggal Sabtu itu sendiri)
function tanggalMingguRonda(dateObj) {
  const d = new Date(dateObj);
  const hari = d.getDay(); // 0=Minggu...6=Sabtu
  const hasil = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (hari === 5) {
    // Jumat malam -> Sabtu besoknya
    hasil.setDate(hasil.getDate() + 1);
  }
  // Jika Sabtu dini hari, tanggal hasil sudah benar (tanggal Sabtu itu sendiri)
  const yyyy = hasil.getFullYear();
  const mm = String(hasil.getMonth() + 1).padStart(2, "0");
  const dd = String(hasil.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Format Rupiah sederhana, mis. 25000 -> "Rp25.000"
function formatRupiah(angka) {
  return "Rp" + Number(angka).toLocaleString("id-ID");
}

// Mengecek apakah sebuah waktu berada di dalam jendela absen
// (Jumat 21:00 - Sabtu 01:00). Logika ini HARUS SAMA dengan fungsi
// dalamJendelaWaktu() di apps-script/Code.gs — kalau salah satu diubah,
// ubah juga yang satunya.
function dalamJendelaWaktu(date) {
  const hari = date.getDay(); // 0=Minggu ... 5=Jumat, 6=Sabtu
  const menitSekarang = date.getHours() * 60 + date.getMinutes();

  const mulai = CONFIG.JAM_MULAI.jam * 60 + CONFIG.JAM_MULAI.menit;
  const selesai = CONFIG.JAM_SELESAI.jam * 60 + CONFIG.JAM_SELESAI.menit;

  const jumatMalam = hari === CONFIG.JAM_MULAI.hari && menitSekarang >= mulai;
  const sabtuDiniHari = hari === CONFIG.JAM_SELESAI.hari && menitSekarang < selesai;

  return jumatMalam || sabtuDiniHari;
}
