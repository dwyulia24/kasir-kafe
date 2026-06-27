import * as XLSX from "xlsx";

const formatRupiahPolos = (n) => Math.round(n);

const labelTipe = (tipe) => (tipe === "dine-in" ? "Dine-in" : "Bawa Pulang");
const labelMetode = { tunai: "Tunai", kartu: "Kartu", qris: "QRIS" };

function formatTanggalIndo(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function formatJamIndo(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Membangun & mengunduh file Excel laporan penjualan dengan 3 sheet:
 *  1. Detail Transaksi — satu baris per item per transaksi
 *  2. Rekap per Menu — jumlah terjual & omzet tiap menu
 *  3. Rekap Harian — total penjualan per hari
 *
 * @param {Array} orders - daftar order yang sudah difilter (status 'paid')
 * @param {{dari: string, sampai: string, labelPeriode: string}} infoPeriode
 */
export function exportLaporanExcel(orders, infoPeriode) {
  if (!orders || orders.length === 0) {
    throw new Error("Tidak ada transaksi pada periode ini untuk diekspor.");
  }

  const wb = XLSX.utils.book_new();

  /* ---------- SHEET 1: Detail Transaksi ---------- */
  const detailRows = [];
  orders.forEach((o) => {
    o.items.forEach((item, idx) => {
      detailRows.push({
        "No. Order": o.id.slice(-6).toUpperCase(),
        Tanggal: formatTanggalIndo(o.dibayarPada),
        Jam: formatJamIndo(o.dibayarPada),
        Tipe: idx === 0 ? labelTipe(o.tipe) : "",
        Menu: item.nama,
        Qty: item.qty,
        "Harga Satuan": formatRupiahPolos(item.harga),
        Subtotal: formatRupiahPolos(item.harga * item.qty),
        "Total Order": idx === 0 ? formatRupiahPolos(o.totalBayar) : "",
        "Metode Bayar": idx === 0 ? (labelMetode[o.metodeBayar] || o.metodeBayar) : "",
      });
    });
  });
  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  wsDetail["!cols"] = [
    { wch: 11 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 24 },
    { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 13 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, "Detail Transaksi");

  /* ---------- SHEET 2: Rekap per Menu ---------- */
  const menuMap = {};
  orders.forEach((o) => {
    o.items.forEach((item) => {
      if (!menuMap[item.nama]) {
        menuMap[item.nama] = { nama: item.nama, qty: 0, omzet: 0 };
      }
      menuMap[item.nama].qty += item.qty;
      menuMap[item.nama].omzet += item.qty * item.harga;
    });
  });
  const rekapMenuRows = Object.values(menuMap)
    .sort((a, b) => b.omzet - a.omzet)
    .map((m) => ({
      Menu: m.nama,
      "Jumlah Terjual": m.qty,
      "Total Omzet": formatRupiahPolos(m.omzet),
    }));
  const wsMenu = XLSX.utils.json_to_sheet(rekapMenuRows);
  wsMenu["!cols"] = [{ wch: 26 }, { wch: 15 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsMenu, "Rekap per Menu");

  /* ---------- SHEET 3: Rekap Harian ---------- */
  const harianMap = {};
  orders.forEach((o) => {
    const tgl = formatTanggalIndo(o.dibayarPada);
    if (!harianMap[tgl]) {
      harianMap[tgl] = { tanggal: tgl, jumlahTransaksi: 0, totalOmzet: 0, sortKey: o.dibayarPada.slice(0, 10) };
    }
    harianMap[tgl].jumlahTransaksi += 1;
    harianMap[tgl].totalOmzet += o.totalBayar;
  });
  const rekapHarianRows = Object.values(harianMap)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map((h) => ({
      Tanggal: h.tanggal,
      "Jumlah Transaksi": h.jumlahTransaksi,
      "Total Omzet": formatRupiahPolos(h.totalOmzet),
      "Rata-rata per Transaksi": formatRupiahPolos(h.totalOmzet / h.jumlahTransaksi),
    }));
  const wsHarian = XLSX.utils.json_to_sheet(rekapHarianRows);
  wsHarian["!cols"] = [{ wch: 13 }, { wch: 16 }, { wch: 15 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsHarian, "Rekap Harian");

  /* ---------- Nama file ---------- */
  const namaFile = `Laporan Penjualan - ${infoPeriode.labelPeriode}.xlsx`;
  XLSX.writeFile(wb, namaFile);
}
