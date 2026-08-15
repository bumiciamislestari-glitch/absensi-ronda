// ============================================================================
// GEOFENCE.JS — validasi jarak lokasi warga terhadap Pos Ronda
// Rumus Haversine (jarak antar 2 titik koordinat bumi, hasil dalam meter).
// TIDAK PERLU DIUBAH — konfigurasi ada di shared/config.js
// ============================================================================

function hitungJarakMeter(lat1, lng1, lat2, lng2) {
  const R = 6371000; // radius bumi rata-rata (meter)
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Mengembalikan { valid: boolean, jarak: number } dibandingkan Pos Ronda
function cekDalamRadius(lat, lng) {
  const jarak = hitungJarakMeter(lat, lng, CONFIG.POS_LAT, CONFIG.POS_LNG);
  return { valid: jarak <= CONFIG.RADIUS_METER, jarak };
}
