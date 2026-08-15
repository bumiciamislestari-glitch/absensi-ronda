/**
 * ============================================================================
 * CLOUD RELAY — Google Apps Script
 * Jembatan jaringan sementara untuk Sistem Absensi Ronda.
 * Cara pasang: lihat README.md Langkah 2.
 *
 * File ini HANYA berfungsi sebagai terminal transit:
 * - Warga kirim absen -> disimpan sebentar di Google Sheet
 * - Admin sinkron -> data ditarik ke HP/laptop admin -> Sheet dikosongkan
 * ============================================================================
 */

// --- KONFIGURASI (HARUS SAMA PERSIS dengan shared/config.js) ---------------
var POS_LAT = -7.3481181;            // GANTI sesuai shared/config.js
var POS_LNG = 108.3864744;           // GANTI sesuai shared/config.js
var RADIUS_METER = 30;               // GANTI sesuai shared/config.js
var ADMIN_SECRET = "ronda-rahasia-2026"; // GANTI, harus sama dgn config.js
var SHEET_NAME = "Absensi";          // nama sheet tempat data ditampung sementara

// ============================================================================
// doGet — dipanggil untuk: ambil waktu server, tarik data (admin), hapus data (admin)
// ============================================================================
function doGet(e) {
  var action = e.parameter.action;

  if (action === "time") {
    return jsonResponse({ serverTime: new Date().toISOString() });
  }

  if (action === "fetch") {
    if (e.parameter.secret !== ADMIN_SECRET) {
      return jsonResponse({ error: "Kata sandi salah" });
    }
    return jsonResponse({ data: bacaSemuaData() });
  }

  if (action === "purge") {
    if (e.parameter.secret !== ADMIN_SECRET) {
      return jsonResponse({ error: "Kata sandi salah" });
    }
    hapusSemuaData();
    return jsonResponse({ status: "purged" });
  }

  return jsonResponse({ error: "Aksi tidak dikenal" });
}

// ============================================================================
// doPost — dipanggil warga saat submit absen
// ============================================================================
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var nama = (body.nama || "").toString().trim();
    var grup = (body.grup || "").toString().trim();
    var lat = parseFloat(body.lat);
    var lng = parseFloat(body.lng);

    if (!nama || isNaN(lat) || isNaN(lng)) {
      return jsonResponse({ error: "Data tidak lengkap" });
    }

    // 1) Validasi JARAK di SERVER (jangan hanya percaya validasi dari HP warga)
    var jarak = hitungJarak(lat, lng, POS_LAT, POS_LNG);
    if (jarak > RADIUS_METER) {
      return jsonResponse({ error: "Di luar radius Pos Ronda (" + Math.round(jarak) + "m)" });
    }

    // 2) Validasi WAKTU di SERVER (jangan percaya jam HP warga — anti manipulasi)
    if (!dalamJendelaWaktu(new Date())) {
      return jsonResponse({ error: "Di luar jam absen (Jumat 21:00 - Sabtu 01:00)" });
    }

    simpanData(nama, grup, new Date(), lat, lng, jarak);
    return jsonResponse({ status: "ok", waktuServer: new Date().toISOString() });

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ============================================================================
// Helper: Google Sheet sebagai penampung sementara
// ============================================================================
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["Timestamp", "Nama", "Grup", "Lat", "Lng", "JarakMeter"]);
  }
  return sheet;
}

function simpanData(nama, grup, waktu, lat, lng, jarak) {
  getSheet().appendRow([waktu.toISOString(), nama, grup, lat, lng, Math.round(jarak)]);
}

function bacaSemuaData() {
  var sheet = getSheet();
  var rows = sheet.getDataRange().getValues();
  rows.shift(); // buang baris header
  return rows.map(function (r) {
    return { waktuServer: r[0], nama: r[1], grup: r[2], lat: r[3], lng: r[4], jarak: r[5] };
  });
}

function hapusSemuaData() {
  var sheet = getSheet();
  var last = sheet.getLastRow();
  if (last > 1) sheet.deleteRows(2, last - 1); // sisakan baris header
}

// ============================================================================
// Helper: Geofence (rumus Haversine) — sama dengan shared/geofence.js
// ============================================================================
function hitungJarak(lat1, lng1, lat2, lng2) {
  var R = 6371000; // radius bumi (meter)
  var toRad = function (d) { return (d * Math.PI) / 180; };
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a = Math.pow(Math.sin(dLat / 2), 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================================
// Helper: Validasi Jendela Waktu — Jumat 21:00 s/d Sabtu 01:00 (WIB)
// Logika ini HARUS SAMA dengan dalamJendelaWaktu() di shared/config.js
// ============================================================================
function dalamJendelaWaktu(date) {
  var tz = "Asia/Jakarta";
  var hariISO = Number(Utilities.formatDate(date, tz, "u")); // 1=Senin ... 5=Jumat, 6=Sabtu, 7=Minggu
  var jam = Number(Utilities.formatDate(date, tz, "H"));
  var menit = Number(Utilities.formatDate(date, tz, "m"));
  var menitSekarang = jam * 60 + menit;

  var jumatMalam = hariISO === 5 && menitSekarang >= 21 * 60;   // Jumat >= 21:00
  var sabtuDiniHari = hariISO === 6 && menitSekarang < 1 * 60;  // Sabtu < 01:00

  return jumatMalam || sabtuDiniHari;
}

// ============================================================================
// Helper: Response JSON
// ============================================================================
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
