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
const btnSubmit     = document.getElementById("btn-submit");
const pesanHasil    = document.getElementById("pesan-hasil");

// --- State ---
let offsetWaktuServer = 0;   // selisih (ms) antara waktu server & waktu HP
let waktuValid = false;
let lokasiValid = false;
let lokasiTerakhir = null;   // { lat, lng }
let sudahAbsen = false;

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
// 1. VALIDASI WAKTU — WAJIB pakai waktu SERVER, bukan jam HP warga
// ============================================================================
async function ambilWaktuServer() {
  try {
    const res = await fetch(`${CONFIG.WEBHOOK_URL}?action=time`);
    const data = await res.json();
    const waktuServer = new Date(data.serverTime).getTime();
    offsetWaktuServer = waktuServer - Date.now();
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
// 3. TOMBOL SUBMIT — aktif hanya jika waktu & lokasi valid + nama dipilih
// ============================================================================
function perbaruiStatusTombol() {
  const namaTerisi = inputNama.value !== "";
  const bolehSubmit = waktuValid && lokasiValid && namaTerisi && !sudahAbsen;

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
        lng: lokasiTerakhir.lng
      })
    });
    const data = await res.json();

    if (data.error) {
      pesanHasil.textContent = `Gagal: ${data.error}`;
      pesanHasil.className = "mt-3 text-center text-sm text-red-600 font-medium";
      perbaruiStatusTombol();
    } else {
      sudahAbsen = true;
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
