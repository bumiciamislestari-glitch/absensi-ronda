// ============================================================================
// warga/app.js — Logika halaman absen warga
// TIDAK PERLU DIUBAH. Konfigurasi ada di shared/config.js
// ============================================================================

// --- Elemen UI ---
const elGrupInfo   = document.getElementById("grup-info");
const dotWaktu      = document.getElementById("dot-waktu");
const teksWaktu      = document.getElementById("teks-waktu");
const dotLokasi     = document.getElementById("dot-lokasi");
const teksLokasi     = document.getElementById("teks-lokasi");
const inputNama     = document.getElementById("input-nama");
const inputFoto     = document.getElementById("input-foto");
const previewFoto   = document.getElementById("preview-foto");
const btnSubmit     = document.getElementById("btn-submit");
const pesanHasil    = document.getElementById("pesan-hasil");
const areaForm      = document.getElementById("area-form");
const boxTerkunci   = document.getElementById("box-terkunci");
const teksTerkunci  = document.getElementById("teks-terkunci");

// --- State ---
let offsetWaktuServer = 0;   // selisih (ms) antara waktu server & waktu HP
let waktuValid = false;
let lokasiValid = false;
let lokasiTerakhir = null;   // { lat, lng }
let fotoBase64 = null;       // foto selfie hasil kompresi (data URL)
let sudahAbsen = false;

// ============================================================================
// 0. KUNCI 1 HP = 1x ABSEN PER MINGGU (disimpan di localStorage HP ini)
// Catatan: ini lapis kenyamanan di sisi HP saja, bisa diakali dengan hapus
// cache/incognito. Pencegahan yang SESUNGGUHNYA (tidak bisa diakali) ada di
// server: Code.gs menolak nama yang sama absen 2x (lihat doPost).
// ============================================================================
const KEY_ABSEN_DEVICE = "ronda_absen_device";

function cekKunciDevice(sekarangServer) {
  const raw = localStorage.getItem(KEY_ABSEN_DEVICE);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data.minggu === tanggalMingguRonda(sekarangServer)) return data;
  } catch (e) {
    // data rusak/format lama, abaikan
  }
  return null;
}

function kunciDevice(nama, sekarangServer) {
  localStorage.setItem(KEY_ABSEN_DEVICE, JSON.stringify({
    nama,
    minggu: tanggalMingguRonda(sekarangServer),
    waktu: sekarangServer.toISOString()
  }));
}

function tampilkanTerkunci(data) {
  areaForm.classList.add("hidden");
  boxTerkunci.classList.remove("hidden");
  const waktuText = new Date(data.waktu).toLocaleString("id-ID");
  teksTerkunci.textContent = `HP ini sudah dipakai untuk absen atas nama ${data.nama} pada ${waktuText}.`;
}

// --- Isi dropdown nama dari jadwal (shared/config.js) ---
semuaNamaWarga().forEach((nama) => {
  const opt = document.createElement("option");
  opt.value = nama;
  opt.textContent = nama;
  inputNama.appendChild(opt);
});

// --- Info grup yang bertugas malam ini ---
elGrupInfo.textContent = `Grup bertugas malam ini: ${grupMingguIni()}`;

// ============================================================================
// SEMBUNYIKAN NAMA YANG SUDAH ABSEN MALAM INI (dari server, bukan localStorage)
// Ini murni kenyamanan supaya warga tidak salah pilih nama yang sudah absen.
// Pencegahan sesungguhnya tetap di server (Code.gs menolak nama ganda).
// ============================================================================
async function sembunyikanNamaSudahAbsen() {
  try {
    const res = await fetch(`${CONFIG.WEBHOOK_URL}?action=namaSudahAbsen`);
    const data = await res.json();
    const sudahSet = new Set(data.nama || []);
    Array.from(inputNama.options).forEach((opt) => {
      if (sudahSet.has(opt.value)) opt.remove();
    });
  } catch (err) {
    // kalau gagal ambil daftar, biarkan semua nama tetap tampil — validasi
    // duplikat tetap aman karena dicek ulang di server saat submit.
  }
}

// ============================================================================
// 1. VALIDASI WAKTU — WAJIB pakai waktu SERVER, bukan jam HP warga
// ============================================================================
async function ambilWaktuServer() {
  try {
    const res = await fetch(`${CONFIG.WEBHOOK_URL}?action=time`);
    const data = await res.json();
    const waktuServer = new Date(data.serverTime).getTime();
    offsetWaktuServer = waktuServer - Date.now();

    // Cek apakah HP ini sudah pernah dipakai absen minggu ini
    const sekarangServer = new Date(Date.now() + offsetWaktuServer);
    const kunci = cekKunciDevice(sekarangServer);
    if (kunci) {
      tampilkanTerkunci(kunci);
      return; // jangan tampilkan form sama sekali
    }

    mulaiJamBerjalan();
  } catch (err) {
    teksWaktu.textContent = "Gagal mengambil waktu server. Periksa koneksi internet.";
    dotWaktu.className = "w-3 h-3 rounded-full bg-red-500 shrink-0";
  }
}

function mulaiJamBerjalan() {
  perbaruiTampilanWaktu();
  setInterval(perbaruiTampilanWaktu, 1000);
}

function perbaruiTampilanWaktu() {
  const waktuSekarangServer = new Date(Date.now() + offsetWaktuServer);
  waktuValid = dalamJendelaWaktu(waktuSekarangServer);

  const jamText = waktuSekarangServer.toLocaleTimeString("id-ID");

  if (waktuValid) {
    dotWaktu.className = "w-3 h-3 rounded-full bg-green-500 shrink-0";
    teksWaktu.textContent = `Absen dibuka — sekarang pukul ${jamText}`;
  } else {
    dotWaktu.className = "w-3 h-3 rounded-full bg-red-500 shrink-0";
    teksWaktu.textContent = `Absen HANYA dibuka Jumat 21:00 - Sabtu 01:00 (sekarang ${jamText})`;
  }

  perbaruiStatusTombol();
}

// ============================================================================
// 2. VALIDASI LOKASI — Geofence 30 meter dari Pos Ronda (Haversine)
// ============================================================================
function mulaiPantauLokasi() {
  if (!navigator.geolocation) {
    teksLokasi.textContent = "Perangkat tidak mendukung GPS.";
    dotLokasi.className = "w-3 h-3 rounded-full bg-red-500 shrink-0";
    return;
  }

  navigator.geolocation.watchPosition(
    (posisi) => {
      const { latitude, longitude } = posisi.coords;
      lokasiTerakhir = { lat: latitude, lng: longitude };

      const { valid, jarak } = cekDalamRadius(latitude, longitude);
      lokasiValid = valid;

      if (valid) {
        dotLokasi.className = "w-3 h-3 rounded-full bg-green-500 shrink-0";
        teksLokasi.textContent = `Anda berada ${Math.round(jarak)}m dari Pos Ronda (dalam radius)`;
      } else {
        dotLokasi.className = "w-3 h-3 rounded-full bg-red-500 shrink-0";
        teksLokasi.textContent = `Anda berada ${Math.round(jarak)}m dari Pos Ronda (di luar radius ${CONFIG.RADIUS_METER}m)`;
      }

      perbaruiStatusTombol();
    },
    (err) => {
      lokasiValid = false;
      dotLokasi.className = "w-3 h-3 rounded-full bg-red-500 shrink-0";
      teksLokasi.textContent = "Gagal mengambil lokasi. Aktifkan GPS & izinkan akses lokasi.";
      perbaruiStatusTombol();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

// ============================================================================
// 2b. FOTO SELFIE — diambil langsung dari kamera HP, lalu dikompres di
// browser (max lebar 480px, kualitas 60%) supaya hemat kuota & cepat
// terkirim walau sinyal di Pos Ronda lemah.
// ============================================================================
function kompresFoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const LEBAR_MAKS = 480;
        const skala = Math.min(1, LEBAR_MAKS / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * skala);
        canvas.height = Math.round(img.height * skala);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = () => reject(new Error("Gagal memuat gambar"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(file);
  });
}

inputFoto.addEventListener("change", async () => {
  const file = inputFoto.files[0];
  if (!file) return;
  try {
    fotoBase64 = await kompresFoto(file);
    previewFoto.src = fotoBase64;
    previewFoto.classList.remove("hidden");
  } catch (err) {
    fotoBase64 = null;
    previewFoto.classList.add("hidden");
  }
  perbaruiStatusTombol();
});

// ============================================================================
// 3. TOMBOL SUBMIT — aktif hanya jika waktu, lokasi & foto valid + nama dipilih
// ============================================================================
function perbaruiStatusTombol() {
  const namaTerisi = inputNama.value !== "";
  const fotoTerisi = !!fotoBase64;
  const bolehSubmit = waktuValid && lokasiValid && namaTerisi && fotoTerisi && !sudahAbsen;

  btnSubmit.disabled = !bolehSubmit;
  btnSubmit.className = bolehSubmit
    ? "mt-4 w-full py-3 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition"
    : "mt-4 w-full py-3 rounded-xl font-semibold text-white bg-slate-300 cursor-not-allowed transition";
}

inputNama.addEventListener("change", perbaruiStatusTombol);

// ============================================================================
// 4. KIRIM ABSEN
// ============================================================================
btnSubmit.addEventListener("click", async () => {
  if (btnSubmit.disabled || !lokasiTerakhir) return;

  btnSubmit.disabled = true;
  pesanHasil.textContent = "Mengirim absen…";
  pesanHasil.className = "mt-3 text-center text-sm text-slate-500";

  const nama = inputNama.value;
  const grup = cariGrupDariNama(nama);

  try {
    // Catatan: sengaja TIDAK mengirim header Content-Type khusus supaya
    // browser tidak melakukan CORS "preflight" (yang tidak didukung Apps
    // Script). Data tetap dikirim sebagai JSON di body.
    const res = await fetch(CONFIG.WEBHOOK_URL, {
      method: "POST",
      body: JSON.stringify({
        nama,
        grup,
        lat: lokasiTerakhir.lat,
        lng: lokasiTerakhir.lng,
        foto: fotoBase64
      })
    });
    const data = await res.json();

    if (data.error) {
      pesanHasil.textContent = `Gagal: ${data.error}`;
      pesanHasil.className = "mt-3 text-center text-sm text-red-600 font-medium";
      perbaruiStatusTombol();
    } else {
      sudahAbsen = true;
      kunciDevice(nama, new Date(Date.now() + offsetWaktuServer));
      pesanHasil.textContent = `Absen berhasil, ${nama}! Terima kasih 🙏`;
      pesanHasil.className = "mt-3 text-center text-sm text-emerald-600 font-medium";
      perbaruiStatusTombol();
    }
  } catch (err) {
    pesanHasil.textContent = "Gagal mengirim. Periksa koneksi internet lalu coba lagi.";
    pesanHasil.className = "mt-3 text-center text-sm text-red-600 font-medium";
    perbaruiStatusTombol();
  }
});

// --- Mulai ---
ambilWaktuServer();
mulaiPantauLokasi();
sembunyikanNamaSudahAbsen();
