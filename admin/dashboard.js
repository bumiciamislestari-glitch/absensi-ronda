// ============================================================================
// admin/dashboard.js — Logika Dashboard Admin
// TIDAK PERLU DIUBAH. Konfigurasi ada di shared/config.js
// ============================================================================

const KEY_KEHADIRAN = "ronda_kehadiran";     // riwayat absen (disimpan lokal)
const KEY_STATUS_DENDA = "ronda_status_denda"; // status lunas/belum per nama+minggu

// --- Elemen UI ---
const gerbangPin   = document.getElementById("gerbang-pin");
const isiDashboard = document.getElementById("isi-dashboard");
const inputPin     = document.getElementById("input-pin");
const btnBuka      = document.getElementById("btn-buka");
const pinError     = document.getElementById("pin-error");

const teksTanggal  = document.getElementById("teks-tanggal");
const teksJam      = document.getElementById("teks-jam");
const grupAktifEl  = document.getElementById("grup-aktif");

const btnSync      = document.getElementById("btn-sync");
const statusSync   = document.getElementById("status-sync");

const tabelJadwal  = document.getElementById("tabel-jadwal");
const bodyRiwayat  = document.getElementById("body-riwayat");
const kosongRiwayat = document.getElementById("kosong-riwayat");
const paginasiRiwayat = document.getElementById("paginasi-riwayat");
const bodyDendaDetail = document.getElementById("body-denda-detail");
const kosongDenda  = document.getElementById("kosong-denda");
const bodyRekap    = document.getElementById("body-rekap");
const kosongRekap  = document.getElementById("kosong-rekap");

const modalKonfirmasi = document.getElementById("modal-konfirmasi");
const modalPesan   = document.getElementById("modal-pesan");
const modalIya     = document.getElementById("modal-iya");
const modalTidak   = document.getElementById("modal-tidak");

// ============================================================================
// MODAL KONFIRMASI — dipakai sebelum mengubah status lunas/belum lunas
// supaya tidak salah klik / salah input data.
// ============================================================================
function konfirmasi(pesan, kalauIya) {
  modalPesan.textContent = pesan;
  modalKonfirmasi.classList.remove("hidden");

  const tutup = () => modalKonfirmasi.classList.add("hidden");

  const handlerIya = () => { tutup(); kalauIya(); bersihkan(); };
  const handlerTidak = () => { tutup(); bersihkan(); };
  function bersihkan() {
    modalIya.removeEventListener("click", handlerIya);
    modalTidak.removeEventListener("click", handlerTidak);
  }

  modalIya.addEventListener("click", handlerIya);
  modalTidak.addEventListener("click", handlerTidak);
}

// ============================================================================
// 0. GERBANG PIN
// ============================================================================
function cobaBuka() {
  if (inputPin.value === CONFIG.ADMIN_PIN) {
    sessionStorage.setItem("admin_unlocked", "1");
    gerbangPin.classList.add("hidden");
    isiDashboard.classList.remove("hidden");
    mulaiDashboard();
  } else {
    pinError.textContent = "PIN salah, coba lagi.";
    inputPin.value = "";
  }
}
btnBuka.addEventListener("click", cobaBuka);
inputPin.addEventListener("keydown", (e) => { if (e.key === "Enter") cobaBuka(); });

// Jika sudah unlock di sesi browser ini (belum tutup tab), langsung tampil
if (sessionStorage.getItem("admin_unlocked") === "1") {
  gerbangPin.classList.add("hidden");
  isiDashboard.classList.remove("hidden");
  mulaiDashboard();
}

// ============================================================================
// 1. JAM & KALENDER REAL-TIME + GRUP BERTUGAS
// ============================================================================
function perbaruiJamKalender() {
  const sekarang = new Date();
  teksJam.textContent = sekarang.toLocaleTimeString("id-ID");
  teksTanggal.textContent = sekarang.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  grupAktifEl.textContent = grupMingguIni(sekarang);
}

// ============================================================================
// 2. PENYIMPANAN LOKAL (localStorage)
// ============================================================================
function getKehadiran() {
  return JSON.parse(localStorage.getItem(KEY_KEHADIRAN) || "[]");
}
function simpanKehadiran(arr) {
  localStorage.setItem(KEY_KEHADIRAN, JSON.stringify(arr));
}
function getStatusDenda() {
  return JSON.parse(localStorage.getItem(KEY_STATUS_DENDA) || "{}");
}
function simpanStatusDenda(obj) {
  localStorage.setItem(KEY_STATUS_DENDA, JSON.stringify(obj));
}

// ============================================================================
// 3. SINKRONISASI: tarik dari Cloud Relay -> simpan lokal -> hapus dari cloud
// ============================================================================
async function sinkronisasi() {
  btnSync.disabled = true;
  statusSync.textContent = "Sedang sinkronisasi…";
  try {
    // a) Tarik data dari Google Apps Script
    const urlFetch = `${CONFIG.WEBHOOK_URL}?action=fetch&secret=${encodeURIComponent(CONFIG.ADMIN_SECRET)}`;
    const res = await fetch(urlFetch);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // b) Gabungkan ke penyimpanan lokal (hindari duplikat)
    const existing = getKehadiran();
    const kunciAda = new Set(existing.map((r) => r.nama + "|" + r.waktuServer));
    let ditambah = 0;

    (data.data || []).forEach((row) => {
      const kunci = row.nama + "|" + row.waktuServer;
      if (!kunciAda.has(kunci)) {
        existing.push({
          nama: row.nama,
          grup: row.grup || cariGrupDariNama(row.nama),
          waktuServer: row.waktuServer,
          minggu: tanggalMingguRonda(new Date(row.waktuServer)),
          jarak: row.jarak
        });
        ditambah++;
      }
    });
    simpanKehadiran(existing);
    halamanRiwayat = 1; // kembali ke halaman 1 supaya data terbaru langsung terlihat

    // c) Auto-purge: hapus data di cloud karena sudah aman tersimpan lokal
    const urlPurge = `${CONFIG.WEBHOOK_URL}?action=purge&secret=${encodeURIComponent(CONFIG.ADMIN_SECRET)}`;
    await fetch(urlPurge);

    statusSync.textContent =
      `Sinkron terakhir: ${new Date().toLocaleString("id-ID")} — ${ditambah} data baru, cloud sudah dikosongkan.`;

    renderSemua();
  } catch (err) {
    statusSync.textContent = "Gagal sinkronisasi: " + err.message;
  } finally {
    btnSync.disabled = false;
  }
}
btnSync.addEventListener("click", sinkronisasi);

// ============================================================================
// 4. RENDER: Jadwal Master
// ============================================================================
function renderJadwal() {
  const grupAktif = grupMingguIni();
  tabelJadwal.innerHTML = "";

  Object.entries(CONFIG.JADWAL).forEach(([grup, anggota]) => {
    const aktif = grup === grupAktif;
    const kartu = document.createElement("div");
    kartu.className = `rounded-xl border p-3 ${aktif ? "border-emerald-400 bg-emerald-50" : "border-slate-200"}`;
    kartu.innerHTML = `
      <p class="font-semibold text-sm ${aktif ? "text-emerald-700" : "text-slate-700"}">
        ${grup} ${aktif ? "— bertugas minggu ini" : ""}
      </p>
      <ul class="text-sm text-slate-600 mt-1 list-disc list-inside">
        ${anggota.map((n) => `<li>${n}</li>`).join("")}
      </ul>`;
    tabelJadwal.appendChild(kartu);
  });
}

// ============================================================================
// 5. RENDER: Riwayat Kehadiran (dengan pagination, 10 baris per halaman)
// ============================================================================
const UKURAN_HALAMAN_RIWAYAT = 10;
let halamanRiwayat = 1;

function renderRiwayat() {
  const semua = getKehadiran().slice().sort((a, b) => new Date(b.waktuServer) - new Date(a.waktuServer));
  bodyRiwayat.innerHTML = "";
  kosongRiwayat.classList.toggle("hidden", semua.length > 0);

  const totalHalaman = Math.max(1, Math.ceil(semua.length / UKURAN_HALAMAN_RIWAYAT));
  if (halamanRiwayat > totalHalaman) halamanRiwayat = totalHalaman;
  if (halamanRiwayat < 1) halamanRiwayat = 1;

  const mulai = (halamanRiwayat - 1) * UKURAN_HALAMAN_RIWAYAT;
  const data = semua.slice(mulai, mulai + UKURAN_HALAMAN_RIWAYAT);

  data.forEach((r) => {
    const tr = document.createElement("tr");
    tr.className = "border-b last:border-0";
    tr.innerHTML = `
      <td class="py-2 pr-3">${r.minggu}</td>
      <td class="py-2 pr-3">${r.nama}</td>
      <td class="py-2 pr-3">${r.grup}</td>
      <td class="py-2 pr-3">${new Date(r.waktuServer).toLocaleString("id-ID")}</td>
      <td class="py-2 pr-3">${Math.round(r.jarak)}m</td>`;
    bodyRiwayat.appendChild(tr);
  });

  renderPaginasiRiwayat(totalHalaman, semua.length);
}

// Membuat tombol "‹ Sebelumnya", nomor halaman, "Berikutnya ›" di bawah tabel
function renderPaginasiRiwayat(totalHalaman, totalData) {
  paginasiRiwayat.innerHTML = "";
  if (totalData === 0) return;

  const buatTombol = (label, halamanTujuan, aktif, nonaktif) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.disabled = !!nonaktif;
    btn.className = "px-2.5 py-1 rounded-lg text-xs font-medium border mx-0.5 " + (
      aktif ? "bg-slate-800 text-white border-slate-800"
      : nonaktif ? "bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed"
      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
    );
    btn.addEventListener("click", () => {
      halamanRiwayat = halamanTujuan;
      renderRiwayat();
    });
    return btn;
  };

  const wrap = document.createElement("div");
  wrap.className = "flex flex-wrap items-center gap-1 mt-3 pt-3 border-t";

  const info = document.createElement("span");
  info.className = "text-xs text-slate-500 mr-2";
  info.textContent = `Halaman ${halamanRiwayat} dari ${totalHalaman} (${totalData} data)`;
  wrap.appendChild(info);

  wrap.appendChild(buatTombol("‹ Sebelumnya", halamanRiwayat - 1, false, halamanRiwayat === 1));

  // Tampilkan maksimal 5 nomor halaman supaya tidak terlalu panjang
  let mulaiNomor = Math.max(1, halamanRiwayat - 2);
  let akhirNomor = Math.min(totalHalaman, mulaiNomor + 4);
  mulaiNomor = Math.max(1, akhirNomor - 4);
  for (let i = mulaiNomor; i <= akhirNomor; i++) {
    wrap.appendChild(buatTombol(String(i), i, i === halamanRiwayat, false));
  }

  wrap.appendChild(buatTombol("Berikutnya ›", halamanRiwayat + 1, false, halamanRiwayat === totalHalaman));

  paginasiRiwayat.appendChild(wrap);
}

// ============================================================================
// 6. HITUNG DENDA: bandingkan Jadwal Master vs Riwayat Kehadiran per minggu
// ============================================================================
function hitungDaftarDenda() {
  const kehadiran = getKehadiran();
  const acuan = new Date(CONFIG.ROTASI_ACUAN_TANGGAL + "T00:00:00");
  const sekarang = new Date();

  const daftar = []; // { minggu, grup, nama, nominal }
  let w = 0;

  while (true) {
    const tglMinggu = new Date(acuan);
    tglMinggu.setDate(tglMinggu.getDate() + w * 7);

    // Batas akhir jam absen minggu ini (mis. Sabtu 01:00). Selama batas ini
    // belum lewat, minggu tersebut BELUM DIHITUNG sebagai bolos — supaya
    // warga tidak dianggap "denda" sebelum jadwal rondanya sendiri terjadi.
    const batasAkhir = new Date(tglMinggu);
    batasAkhir.setHours(CONFIG.JAM_SELESAI.jam, CONFIG.JAM_SELESAI.menit, 0, 0);
    if (batasAkhir > sekarang) break;

    const mingguStr = tanggalMingguRonda(tglMinggu);
    const grup = grupMingguIni(tglMinggu);
    const anggota = CONFIG.JADWAL[grup] || [];

    anggota.forEach((nama) => {
      const hadir = kehadiran.some((r) => r.nama === nama && r.minggu === mingguStr);
      if (!hadir) {
        daftar.push({ minggu: mingguStr, grup, nama, nominal: CONFIG.DENDA_PER_BOLOS });
      }
    });

    w++;
    if (w > 520) break; // pengaman anti infinite-loop (setara ~10 tahun)
  }

  return daftar.sort((a, b) => (a.minggu < b.minggu ? 1 : -1));
}

// ============================================================================
// 7. RENDER: Daftar Denda (detail) + Rekap Akumulasi
// ============================================================================
function renderDenda() {
  const daftar = hitungDaftarDenda();
  const statusDenda = getStatusDenda();

  bodyDendaDetail.innerHTML = "";
  kosongDenda.classList.toggle("hidden", daftar.length > 0);

  daftar.forEach((item) => {
    const kunci = `${item.nama}|${item.minggu}`;
    const lunas = !!statusDenda[kunci];

    const tr = document.createElement("tr");
    tr.className = "border-b last:border-0";
    tr.innerHTML = `
      <td class="py-2 pr-3">${item.minggu}</td>
      <td class="py-2 pr-3">${item.grup}</td>
      <td class="py-2 pr-3">${item.nama}</td>
      <td class="py-2 pr-3">${formatRupiah(item.nominal)}</td>
      <td class="py-2 pr-3">
        <span class="px-2 py-0.5 rounded-full text-xs font-medium ${lunas ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}">
          ${lunas ? "Lunas" : "Belum Bayar"}
        </span>
      </td>
      <td class="py-2 pr-3">
        <button data-kunci="${kunci}" data-nama="${item.nama}" data-minggu="${item.minggu}"
          class="btn-toggle-lunas text-xs font-medium text-blue-600 hover:underline">
          ${lunas ? "Tandai Belum Bayar" : "Tandai Lunas"}
        </button>
      </td>`;
    bodyDendaDetail.appendChild(tr);
  });

  // pasang event listener tombol toggle — selalu konfirmasi dulu sebelum
  // mengubah status, supaya tidak salah klik / salah input data.
  document.querySelectorAll(".btn-toggle-lunas").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kunci = btn.dataset.kunci;
      const status = getStatusDenda();
      const lunasSekarang = !!status[kunci];

      const pesan = lunasSekarang
        ? `Yakin anda akan merubahnya? Status ${btn.dataset.nama} (minggu ${btn.dataset.minggu}) akan dikembalikan jadi Belum Bayar.`
        : `Apakah benar ${btn.dataset.nama} sudah membayar denda minggu ${btn.dataset.minggu}?`;

      konfirmasi(pesan, () => {
        const statusTerbaru = getStatusDenda();
        statusTerbaru[kunci] = !statusTerbaru[kunci];
        simpanStatusDenda(statusTerbaru);
        renderDenda(); // refresh tampilan
      });
    });
  });

  // --- Rekap akumulasi per warga (yang BELUM lunas saja) ---
  const rekap = {}; // nama -> { jumlah, total }
  daftar.forEach((item) => {
    const kunci = `${item.nama}|${item.minggu}`;
    const lunas = !!statusDenda[kunci];
    if (lunas) return;
    if (!rekap[item.nama]) rekap[item.nama] = { jumlah: 0, total: 0 };
    rekap[item.nama].jumlah += 1;
    rekap[item.nama].total += item.nominal;
  });

  const namaRekap = Object.keys(rekap);
  bodyRekap.innerHTML = "";
  kosongRekap.classList.toggle("hidden", namaRekap.length > 0);

  namaRekap
    .sort((a, b) => rekap[b].total - rekap[a].total)
    .forEach((nama) => {
      const tr = document.createElement("tr");
      tr.className = "border-b last:border-0";
      tr.innerHTML = `
        <td class="py-2 pr-3">${nama}</td>
        <td class="py-2 pr-3">${rekap[nama].jumlah}x</td>
        <td class="py-2 pr-3 font-semibold text-red-600">${formatRupiah(rekap[nama].total)}</td>`;
      bodyRekap.appendChild(tr);
    });
}

// ============================================================================
// 8. RENDER SEMUA + INISIALISASI
// ============================================================================
function renderSemua() {
  renderJadwal();
  renderRiwayat();
  renderDenda();
}

function mulaiDashboard() {
  perbaruiJamKalender();
  setInterval(perbaruiJamKalender, 1000);
  renderSemua();
  // Sinkronisasi otomatis setiap kali dashboard dibuka
  sinkronisasi();
}
