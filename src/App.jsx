import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Coffee, Plus, Minus, Trash2, X, Check, Search, ChefHat,
  ClipboardList, BarChart3, LayoutGrid, ShoppingCart, Edit3,
  CreditCard, Banknote, QrCode, TrendingUp, Receipt, AlertCircle,
  Clock, ChevronLeft, Package, Wifi, WifiOff, LogOut, Printer, FileSpreadsheet,
  CookingPot, Flame, Bell, ArrowUpRight, ArrowDownRight, Wallet, Scale,
  CheckCircle2, MinusCircle, PlusCircle, Save, Users, UserCog
} from "lucide-react";
import { loadJSON, saveJSON, subscribeToKey, subscribeToTable } from "./storage";
import { supabase } from "./supabaseClient";
import LoginScreen from "./LoginScreen";
import KelolaUserView from "./KelolaUserView";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip,
} from "recharts";

/* ============================================================
   KONSTANTA & UTIL
============================================================ */

const KATEGORI = ["Kopi", "Non-Kopi", "Makanan", "Snack"];
const META_NEXTID_KEY = "meta:nextid";

const formatRupiah = (n) =>
  "Rp" + Math.round(n).toLocaleString("id-ID");

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const todayStr = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
};

const jamMenit = (iso) => {
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
};

/* ============================================================
   DATA AWAL (seed) — dipakai hanya jika storage masih kosong
============================================================ */

const SEED_MENU = [
  { id: "m1", nama: "Kopi Hitam", kategori: "Kopi", harga: 15000, aktif: true },
  { id: "m2", nama: "Espresso", kategori: "Kopi", harga: 18000, aktif: true },
  { id: "m3", nama: "Cappuccino", kategori: "Kopi", harga: 25000, aktif: true },
  { id: "m4", nama: "Café Latte", kategori: "Kopi", harga: 25000, aktif: true },
  { id: "m5", nama: "Kopi Susu Gula Aren", kategori: "Kopi", harga: 22000, aktif: true },
  { id: "m6", nama: "Americano", kategori: "Kopi", harga: 20000, aktif: true },
  { id: "m7", nama: "Matcha Latte", kategori: "Non-Kopi", harga: 27000, aktif: true },
  { id: "m8", nama: "Coklat Panas", kategori: "Non-Kopi", harga: 22000, aktif: true },
  { id: "m9", nama: "Teh Tarik", kategori: "Non-Kopi", harga: 18000, aktif: true },
  { id: "m10", nama: "Lemon Tea", kategori: "Non-Kopi", harga: 17000, aktif: true },
  { id: "m11", nama: "Nasi Goreng", kategori: "Makanan", harga: 28000, aktif: true },
  { id: "m12", nama: "Mie Goreng", kategori: "Makanan", harga: 26000, aktif: true },
  { id: "m13", nama: "Sandwich Telur", kategori: "Makanan", harga: 24000, aktif: true },
  { id: "m14", nama: "Croissant", kategori: "Snack", harga: 17000, aktif: true },
  { id: "m15", nama: "Kentang Goreng", kategori: "Snack", harga: 16000, aktif: true },
  { id: "m16", nama: "Pisang Goreng", kategori: "Snack", harga: 14000, aktif: true },
];

const JUMLAH_MEJA = 8;

/* ============================================================
   APP ROOT
============================================================ */

function PosApp({ session, onLogout }) {
  const [tab, setTab] = useState("kasir");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [menu, setMenu] = useState([]);
  const [meja, setMeja] = useState([]); // {id, nomor, status, orderId|null}
  const [orders, setOrders] = useState({}); // orderId -> {id, mejaId|null, items:[{menuId,nama,harga,qty}], status:'open'|'paid', dibuatPada, dibayarPada, metodeBayar, totalBayar}
  const [rekonsiliasi, setRekonsiliasi] = useState({}); // tanggal (YYYY-MM-DD) -> {tunaiAktual, kartuAktual, qrisAktual, catatan, disimpanPada}
  const [toast, setToast] = useState(null);
  const [online, setOnline] = useState(true);
  const [strukUntukCetak, setStrukUntukCetak] = useState(null);
  const [orderUntukDilanjutkan, setOrderUntukDilanjutkan] = useState(null);
  const [userAccess, setUserAccess] = useState(undefined); // undefined = belum dicek, null = tidak ditemukan, {role, akses_tab}
  const [daftarUser, setDaftarUser] = useState([]); // daftar semua user_access, untuk halaman Kelola User (admin)

  // Dipakai untuk MENCEGAH kasir pindah tab selagi ada pesanan Bawa Pulang
  // yang sedang diisi (minimal 1 item) tapi belum dibayar. KasirView yang
  // melaporkan status ini lewat setPesananBawaPulangBelumBayar.
  const [pesananBawaPulangBelumBayar, setPesananBawaPulangBelumBayar] = useState(false);
  const [pintuKasirTerkunci, setPintuKasirTerkunci] = useState(false); // trigger modal bayar dari Sidebar

  const showToast = useCallback((msg, type = "ok") => {
    setToast({ msg, type, id: uid() });
    setTimeout(() => setToast((cur) => (cur && cur.msg === msg ? null : cur)), 2600);
  }, []);

  // Pengganti setTab biasa: kalau ada pesanan Bawa Pulang yang belum dibayar
  // dan kasir mencoba pindah ke tab LAIN (bukan "kasir"), jangan pindah —
  // sebagai gantinya munculkan modal Bayar lewat sinyal pintuKasirTerkunci.
  const cobaGantiTab = useCallback((tabBaru) => {
    if (tabBaru !== "kasir" && pesananBawaPulangBelumBayar) {
      setPintuKasirTerkunci(true);
      showToast("Selesaikan pembayaran pesanan Bawa Pulang ini dulu.", "error");
      return;
    }
    setTab(tabBaru);
  }, [pesananBawaPulangBelumBayar, showToast]);

  const lanjutkanPesananMeja = useCallback((orderId) => {
    setOrderUntukDilanjutkan(orderId);
    setTab("kasir");
  }, []);

  const triggerCetak = useCallback((order) => {
    setStrukUntukCetak(order);
    // beri waktu satu frame agar konten struk sempat ter-render ke DOM
    // sebelum dialog print dipanggil
    requestAnimationFrame(() => {
      setTimeout(() => window.print(), 50);
    });
  }, []);

  useEffect(() => {
    const handleAfterPrint = () => setStrukUntukCetak(null);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  // ref dipakai supaya callback realtime selalu lihat state terbaru tanpa
  // perlu di-list sebagai dependency (menghindari subscribe ulang terus-terusan)
  const skipNextEcho = useRef({ "pos:menu": 0, "pos:meja": 0, "pos:orders": 0 });

  /* ---------- LOAD AWAL ---------- */
  useEffect(() => {
    (async () => {
      try {
        const [m, t, o, r] = await Promise.all([
          loadJSON("pos:menu", null),
          loadJSON("pos:meja", null),
          loadJSON("pos:orders", null),
          loadJSON("pos:rekonsiliasi", null),
        ]);

        let menuData = m;
        if (!menuData) {
          menuData = SEED_MENU;
          await saveJSON("pos:menu", menuData);
        }

        let mejaData = t;
        if (!mejaData) {
          mejaData = Array.from({ length: JUMLAH_MEJA }, (_, i) => ({
            id: "t" + (i + 1),
            nomor: i + 1,
            status: "kosong", // kosong | terisi
            orderId: null,
            jumlahBangku: 4,
          }));
          await saveJSON("pos:meja", mejaData);
        }

        let orderData = o || {};
        if (!o) await saveJSON("pos:orders", orderData);

        let rekonsiliasiData = r || {};
        if (!r) await saveJSON("pos:rekonsiliasi", rekonsiliasiData);

        setMenu(menuData);
        setMeja(mejaData);
        setOrders(orderData);
        setRekonsiliasi(rekonsiliasiData);

        // Muat role & akses tab milik user yang sedang login
        const { data: akses, error: aksesError } = await supabase
          .from("user_access")
          .select("role, akses_tab")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (aksesError) {
          console.error("Gagal memuat akses user", aksesError);
          setUserAccess(null);
        } else {
          setUserAccess(akses || null);
        }
      } catch (e) {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const muatDaftarUser = useCallback(async () => {
    const { data, error } = await supabase
      .from("user_access")
      .select("user_id, email, role, akses_tab, dibuat_pada")
      .order("dibuat_pada", { ascending: true });
    if (error) {
      console.error("Gagal memuat daftar user", error);
      return;
    }
    setDaftarUser(data || []);
  }, []);

  // Muat daftar user HANYA jika role-nya admin (user biasa tidak perlu
  // dan tidak akan diizinkan baca lewat RLS untuk operasi tertentu)
  useEffect(() => {
    if (userAccess?.role === "admin") {
      muatDaftarUser();
    }
  }, [userAccess, muatDaftarUser]);

  /* ---------- REALTIME SYNC ANTAR PERANGKAT ---------- */
  useEffect(() => {
    const unsubMenu = subscribeToKey("pos:menu", (val) => setMenu(val));
    const unsubMeja = subscribeToKey("pos:meja", (val) => setMeja(val));
    const unsubOrders = subscribeToKey("pos:orders", (val) => setOrders(val));
    const unsubRekonsiliasi = subscribeToKey("pos:rekonsiliasi", (val) => setRekonsiliasi(val));
    const unsubUserAccess = subscribeToTable("user_access", () => {
      // Reload akses milik diri sendiri (mungkin admin baru saja mengubah
      // role/akses kita), dan reload daftar user jika sedang admin.
      (async () => {
        const { data: akses } = await supabase
          .from("user_access")
          .select("role, akses_tab")
          .eq("user_id", session.user.id)
          .maybeSingle();
        setUserAccess(akses || null);
      })();
      if (userAccess?.role === "admin") muatDaftarUser();
    });

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setOnline(navigator.onLine);

    return () => {
      unsubMenu();
      unsubMeja();
      unsubOrders();
      unsubRekonsiliasi();
      unsubUserAccess();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  /* ---------- PERSISTERS ---------- */
  const persistMenu = useCallback(async (next) => {
    setMenu(next);
    const ok = await saveJSON("pos:menu", next);
    if (!ok) showToast("Gagal menyimpan ke server. Cek koneksi internet.", "error");
  }, [showToast]);

  const persistMeja = useCallback(async (next) => {
    setMeja(next);
    const ok = await saveJSON("pos:meja", next);
    if (!ok) showToast("Gagal menyimpan ke server. Cek koneksi internet.", "error");
  }, [showToast]);

  const persistOrders = useCallback(async (next) => {
    setOrders(next);
    const ok = await saveJSON("pos:orders", next);
    if (!ok) showToast("Gagal menyimpan ke server. Cek koneksi internet.", "error");
  }, [showToast]);

  const persistRekonsiliasi = useCallback(async (next) => {
    setRekonsiliasi(next);
    const ok = await saveJSON("pos:rekonsiliasi", next);
    if (!ok) showToast("Gagal menyimpan ke server. Cek koneksi internet.", "error");
  }, [showToast]);

  // Daftar tab yang boleh diakses user ini. Admin selalu akses semua tab.
  // userAccess === null (belum terdaftar di tabel sama sekali, misal akun
  // lama sebelum sistem role ada) DIPERLAKUKAN sebagai akses semua tab,
  // supaya tidak ada yang ter-lockout tanpa sengaja — admin bisa atur ulang
  // belakangan lewat menu Kelola User begitu akun itu didaftarkan.
  //
  // PENTING: deklarasi ini dan useEffect di bawahnya HARUS berada SEBELUM
  // early return (if loading / if loadError) supaya jumlah & urutan hooks
  // yang dipanggil selalu konsisten di setiap render (Rules of Hooks) —
  // menempatkannya setelah early return menyebabkan React error #310.
  const SEMUA_TAB = ["kasir", "dapur", "meja", "menu", "laporan", "rekonsiliasi", "kelola_user"];
  const aksesTabAktif =
    userAccess?.role === "admin" || userAccess === null || userAccess === undefined
      ? SEMUA_TAB
      : (userAccess.akses_tab || []);

  // Kalau tab yang sedang aktif ternyata tidak diizinkan (misal admin baru
  // saja mencabut akses tab ini), otomatis pindah ke tab pertama yang masih
  // diizinkan supaya tidak terjebak di layar kosong.
  useEffect(() => {
    if (userAccess !== undefined && !aksesTabAktif.includes(tab)) {
      setTab(aksesTabAktif[0] || "kasir");
    }
  }, [tab, aksesTabAktif, userAccess]);

  if (loading) {
    return (
      <div className="pos-root pos-loading">
        <Coffee size={28} className="spin-soft" />
        <p>Menyiapkan kasir…</p>
        <style>{baseStyles}</style>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="pos-root pos-loading">
        <AlertCircle size={28} />
        <p>Gagal memuat data. Cek koneksi internet, lalu muat ulang halaman.</p>
        <style>{baseStyles}</style>
      </div>
    );
  }

  return (
    <div className="pos-root">
      <style>{baseStyles}</style>
      <Sidebar tab={tab} setTab={cobaGantiTab} online={online} onLogout={onLogout} aksesTabAktif={aksesTabAktif} />
      <main className="pos-main">
        {tab === "kasir" && aksesTabAktif.includes("kasir") && (
          <KasirView
            menu={menu}
            meja={meja}
            orders={orders}
            persistOrders={persistOrders}
            persistMeja={persistMeja}
            showToast={showToast}
            triggerCetak={triggerCetak}
            orderUntukDilanjutkan={orderUntukDilanjutkan}
            clearOrderUntukDilanjutkan={() => setOrderUntukDilanjutkan(null)}
            onStatusBawaPulangBelumBayarChange={setPesananBawaPulangBelumBayar}
            pintuKasirTerkunci={pintuKasirTerkunci}
            clearPintuKasirTerkunci={() => setPintuKasirTerkunci(false)}
          />
        )}
        {tab === "dapur" && aksesTabAktif.includes("dapur") && (
          <DapurView orders={orders} meja={meja} persistOrders={persistOrders} persistMeja={persistMeja} />
        )}
        {tab === "meja" && aksesTabAktif.includes("meja") && (
          <MejaView
            meja={meja}
            orders={orders}
            persistMeja={persistMeja}
            persistOrders={persistOrders}
            showToast={showToast}
            lanjutkanPesananMeja={lanjutkanPesananMeja}
          />
        )}
        {tab === "menu" && aksesTabAktif.includes("menu") && (
          <MenuView menu={menu} persistMenu={persistMenu} showToast={showToast} />
        )}
        {tab === "laporan" && aksesTabAktif.includes("laporan") && (
          <LaporanView orders={orders} meja={meja} menu={menu} triggerCetak={triggerCetak} />
        )}
        {tab === "rekonsiliasi" && aksesTabAktif.includes("rekonsiliasi") && (
          <RekonsiliasiView
            orders={orders}
            rekonsiliasi={rekonsiliasi}
            persistRekonsiliasi={persistRekonsiliasi}
            showToast={showToast}
          />
        )}
        {tab === "kelola_user" && aksesTabAktif.includes("kelola_user") && (
          <KelolaUserView
            daftarUser={daftarUser}
            session={session}
            muatDaftarUser={muatDaftarUser}
            showToast={showToast}
          />
        )}
      </main>
      {toast && (
        <div className={`pos-toast pos-toast-${toast.type}`} key={toast.id}>
          {toast.type === "ok" ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{toast.msg}</span>
        </div>
      )}
      <Struk order={strukUntukCetak} />
    </div>
  );
}

/* ============================================================
   SIDEBAR NAV
============================================================ */

function Sidebar({ tab, setTab, online, onLogout, aksesTabAktif }) {
  const semuaItem = [
    { key: "kasir", label: "Kasir", icon: ShoppingCart },
    { key: "dapur", label: "Dapur", icon: CookingPot },
    { key: "meja", label: "Meja", icon: LayoutGrid },
    { key: "menu", label: "Menu", icon: ChefHat },
    { key: "laporan", label: "Laporan", icon: BarChart3 },
    { key: "rekonsiliasi", label: "Rekonsiliasi", icon: Scale },
    { key: "kelola_user", label: "Kelola User", icon: UserCog },
  ];
  const items = semuaItem.filter((it) => aksesTabAktif.includes(it.key));
  return (
    <nav className="pos-sidebar">
      <div className="pos-brand">
        <Coffee size={22} />
        <span>Kedai Kasir</span>
      </div>
      <div className="pos-navitems">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              className={"pos-navbtn" + (tab === it.key ? " active" : "")}
              onClick={() => setTab(it.key)}
            >
              <Icon size={19} />
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
      <div className={"pos-conn-status" + (online ? "" : " offline")}>
        {online ? <Wifi size={14} /> : <WifiOff size={14} />}
        <span>{online ? "Tersambung" : "Offline"}</span>
      </div>
      <button className="pos-logout-btn" onClick={onLogout}>
        <LogOut size={16} />
        <span>Keluar</span>
      </button>
    </nav>
  );
}

/* ============================================================
   STRUK — komponen cetak struk thermal (58mm/80mm)
============================================================ */

const NAMA_KAFE = "Kedai Kasir";
const ALAMAT_KAFE = "Jl. Contoh No. 123, Jakarta";

function Struk({ order, nomorAntrian }) {
  if (!order) return null;
  const total = order.items.reduce((s, i) => s + i.harga * i.qty, 0);
  const waktu = order.dibayarPada ? new Date(order.dibayarPada) : new Date();
  const metodeLabel = { tunai: "Tunai", kartu: "Kartu", qris: "QRIS" }[order.metodeBayar] || order.metodeBayar || "-";

  return (
    <div className="struk-cetak" id="area-struk">
      <div className="struk-center struk-bold struk-besar">{NAMA_KAFE}</div>
      <div className="struk-center">{ALAMAT_KAFE}</div>
      <div className="struk-garis" />
      <div className="struk-baris">
        <span>{waktu.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
        <span>{waktu.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div className="struk-baris">
        <span>{order.tipe === "dine-in" ? "Dine-in" : "Bawa Pulang"}</span>
        <span>#{order.id.slice(-6).toUpperCase()}</span>
      </div>
      <div className="struk-garis" />
      {order.items.map((i) => (
        <div className="struk-item" key={i.menuId}>
          <div className="struk-baris">
            <span>{i.nama}</span>
          </div>
          <div className="struk-baris">
            <span>{i.qty} x {formatRupiah(i.harga)}</span>
            <span>{formatRupiah(i.harga * i.qty)}</span>
          </div>
        </div>
      ))}
      <div className="struk-garis" />
      <div className="struk-baris struk-bold struk-besar">
        <span>TOTAL</span>
        <span>{formatRupiah(total)}</span>
      </div>
      <div className="struk-garis-titik" />
      <div className="struk-baris">
        <span>Bayar ({metodeLabel})</span>
        <span>{formatRupiah(order.uangBayar ?? total)}</span>
      </div>
      {order.metodeBayar === "tunai" && (
        <div className="struk-baris">
          <span>Kembali</span>
          <span>{formatRupiah(Math.max((order.uangBayar ?? total) - total, 0))}</span>
        </div>
      )}
      <div className="struk-garis" />
      <div className="struk-center" style={{ marginTop: 6 }}>Terima kasih telah berkunjung!</div>
      <div className="struk-center">Sampai jumpa lagi</div>
    </div>
  );
}

/* ============================================================
   KASIR VIEW
============================================================ */

function KasirView({
  menu, meja, orders, persistOrders, persistMeja, showToast, triggerCetak,
  orderUntukDilanjutkan, clearOrderUntukDilanjutkan,
  onStatusBawaPulangBelumBayarChange, pintuKasirTerkunci, clearPintuKasirTerkunci,
}) {
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [search, setSearch] = useState("");
  const [kategoriFilter, setKategoriFilter] = useState("Semua");
  const [showBayar, setShowBayar] = useState(false);
  const [showPilihMeja, setShowPilihMeja] = useState(false);
  const [showPilihMejaAwal, setShowPilihMejaAwal] = useState(false);

  // Jika kasir datang dari tab Meja lewat tombol "Lanjutkan Pesanan",
  // langsung fokuskan ke order tersebut, lalu bersihkan sinyalnya.
  useEffect(() => {
    if (orderUntukDilanjutkan && orders[orderUntukDilanjutkan]) {
      setActiveOrderId(orderUntukDilanjutkan);
      clearOrderUntukDilanjutkan();
    }
  }, [orderUntukDilanjutkan, orders, clearOrderUntukDilanjutkan]);

  const activeOrder = activeOrderId ? orders[activeOrderId] : null;

  // Lapor ke PosApp: apakah saat ini ada pesanan Bawa Pulang (bukan dine-in)
  // yang sedang diisi (minimal 1 item) tapi belum dibayar. PosApp memakai
  // info ini untuk MENCEGAH kasir pindah ke tab lain tanpa menyelesaikan
  // pembayaran dulu — supaya pesanan tidak "ketinggalan" tanpa sengaja.
  useEffect(() => {
    const belumBayar =
      !!activeOrder &&
      activeOrder.tipe !== "dine-in" &&
      activeOrder.status === "open" &&
      activeOrder.items.length > 0;
    onStatusBawaPulangBelumBayarChange(belumBayar);
  }, [activeOrder, onStatusBawaPulangBelumBayarChange]);

  // Saat PosApp mendeteksi kasir mencoba pindah tab padahal pesanan Bawa
  // Pulang belum dibayar, ia menyalakan sinyal pintuKasirTerkunci. Di sini
  // kita tangkap sinyal itu untuk langsung membuka modal Bayar.
  useEffect(() => {
    if (pintuKasirTerkunci) {
      setShowBayar(true);
      clearPintuKasirTerkunci();
    }
  }, [pintuKasirTerkunci, clearPintuKasirTerkunci]);

  // Pesanan Bawa Pulang yang SUDAH dibayar tapi masih dalam proses dapur
  // (belum semua item "Siap"). Ditampilkan di tab Kasir supaya kasir bisa
  // pantau statusnya tanpa harus bolak-balik ke tab Dapur — soalnya pesanan
  // Bawa Pulang tidak punya "tempat" lain untuk dicek seperti Dine-in yang
  // bisa dilihat lewat tab Meja.
  const pesananBawaPulangDalamProses = useMemo(() => {
    return Object.values(orders)
      .filter(
        (o) =>
          o.status === "paid" &&
          o.tipe !== "dine-in" &&
          o.items.length > 0 &&
          statusOrderDariItems(o.items) !== "siap"
      )
      .sort((a, b) => new Date(a.dibayarPada) - new Date(b.dibayarPada));
  }, [orders]);

  const ensureDraft = useCallback(async () => {
    if (activeOrder) return activeOrder;
    const id = uid();
    const newOrder = {
      id,
      mejaId: null,
      tipe: "bawa",
      items: [],
      status: "open",
      dibuatPada: new Date().toISOString(),
    };
    const next = { ...orders, [id]: newOrder };
    await persistOrders(next);
    setActiveOrderId(id);
    return newOrder;
  }, [activeOrder, orders, persistOrders]);

  // Memulai pesanan baru secara eksplisit dengan tipe Bawa Pulang, dipanggil
  // dari layar "Pilih Tipe Pesanan" sebelum kasir mulai pilih menu.
  const mulaiPesananBawaPulang = useCallback(async () => {
    await ensureDraft();
  }, [ensureDraft]);

  const tambahItem = async (item) => {
    const ord = activeOrder || (await ensureDraft());
    const items = [...ord.items];
    const idx = items.findIndex((i) => i.menuId === item.id);
    if (idx >= 0) {
      items[idx] = { ...items[idx], qty: items[idx].qty + 1 };
    } else {
      items.push({
        menuId: item.id,
        nama: item.nama,
        harga: item.harga,
        kategori: item.kategori,
        qty: 1,
        statusDapur: "menunggu", // menunggu | diproses | siap
      });
    }
    const updated = { ...ord, items };
    const next = { ...orders, [updated.id]: updated };
    await persistOrders(next);
    setActiveOrderId(updated.id);
  };

  const ubahQty = async (menuId, delta) => {
    if (!activeOrder) return;
    let items = activeOrder.items.map((i) =>
      i.menuId === menuId ? { ...i, qty: i.qty + delta } : i
    );
    items = items.filter((i) => i.qty > 0);
    const updated = { ...activeOrder, items };
    await persistOrders({ ...orders, [updated.id]: updated });
  };

  const hapusItem = async (menuId) => {
    if (!activeOrder) return;
    const items = activeOrder.items.filter((i) => i.menuId !== menuId);
    const updated = { ...activeOrder, items };
    await persistOrders({ ...orders, [updated.id]: updated });
  };

  const batalkanOrder = async () => {
    if (!activeOrder) return;
    const next = { ...orders };
    delete next[activeOrder.id];
    // bila order ini terkait meja, bebaskan meja
    if (activeOrder.mejaId) {
      const nextMeja = meja.map((m) =>
        m.id === activeOrder.mejaId ? { ...m, status: "kosong", orderId: null } : m
      );
      await persistMeja(nextMeja);
    }
    await persistOrders(next);
    setActiveOrderId(null);
    showToast("Pesanan dibatalkan", "ok");
  };

  const total = useMemo(() => {
    if (!activeOrder) return 0;
    return activeOrder.items.reduce((s, i) => s + i.harga * i.qty, 0);
  }, [activeOrder]);

  const kaitkanMeja = async (mejaId) => {
    const ord = activeOrder || (await ensureDraft());
    const target = meja.find((m) => m.id === mejaId);
    if (!target) return;

    const updatedOrder = { ...ord, mejaId, nomorMeja: target.nomor, tipe: "dine-in" };
    const nextMeja = meja.map((m) =>
      m.id === mejaId ? { ...m, status: "terisi", orderId: updatedOrder.id } : m
    );
    await persistOrders({ ...orders, [updatedOrder.id]: updatedOrder });
    await persistMeja(nextMeja);
    setActiveOrderId(updatedOrder.id);
    setShowPilihMeja(false);
    showToast(`Pesanan dikaitkan ke Meja ${target.nomor}`, "ok");
  };

  const selesaikanBayar = async (metode, uangBayar) => {
    if (!activeOrder) return;
    const updated = {
      ...activeOrder,
      status: "paid",
      dibayarPada: new Date().toISOString(),
      metodeBayar: metode,
      totalBayar: total,
      uangBayar: uangBayar ?? total,
    };
    const nextOrders = { ...orders, [updated.id]: updated };

    // Meja HANYA dibebaskan jika semua item pesanan sudah "siap" saat dibayar.
    // Kalau masih ada item yang belum siap, meja tetap "terisi" — karena
    // pelanggan masih duduk menunggu makanannya datang meski sudah bayar.
    // Meja akan otomatis dibebaskan nanti oleh tab Dapur saat semua item
    // ditandai siap (lihat tandaiSemuaSiap & ubahStatusItem di DapurView).
    let nextMeja = meja;
    if (updated.mejaId && statusOrderDariItems(updated.items) === "siap") {
      nextMeja = meja.map((m) =>
        m.id === updated.mejaId ? { ...m, status: "kosong", orderId: null } : m
      );
      await persistMeja(nextMeja);
    }
    await persistOrders(nextOrders);
    setActiveOrderId(null);
    setShowBayar(false);
    showToast("Pembayaran berhasil", "ok");
    triggerCetak(updated);
  };

  const menuTersaring = useMemo(() => {
    return menu
      .filter((m) => m.aktif)
      .filter((m) => kategoriFilter === "Semua" || m.kategori === kategoriFilter)
      .filter((m) => m.nama.toLowerCase().includes(search.toLowerCase()));
  }, [menu, kategoriFilter, search]);

  const mejaTerkait = activeOrder?.mejaId
    ? meja.find((m) => m.id === activeOrder.mejaId)
    : null;

  if (!activeOrder) {
    return (
      <div className="pilih-tipe-screen">
        {pesananBawaPulangDalamProses.length > 0 && (
          <div className="proses-dapur-box proses-dapur-box-standalone">
            <span className="proses-dapur-label">
              <Flame size={13} /> Bawa Pulang — Sedang Disiapkan
            </span>
            {pesananBawaPulangDalamProses.map((o) => {
              const totalO = o.items.reduce((s, i) => s + i.harga * i.qty, 0);
              const jumlahSiap = o.items.filter((i) => i.statusDapur === "siap").length;
              return (
                <div key={o.id} className="proses-dapur-item">
                  <div className="proses-dapur-item-info">
                    <span className="proses-dapur-item-id">#{o.id.slice(-6).toUpperCase()}</span>
                    <span className="proses-dapur-item-progress">
                      {jumlahSiap}/{o.items.length} item siap
                    </span>
                  </div>
                  <span className="proses-dapur-item-total">{formatRupiah(totalO)}</span>
                </div>
              );
            })}
            <p className="proses-dapur-hint">
              Pesanan ini sudah dibayar. Cek tab Dapur untuk update status, atau cetak ulang
              struknya lewat tab Laporan.
            </p>
          </div>
        )}

        <div className="pilih-tipe-card">
          <h2>Mulai Pesanan Baru</h2>
          <p>Pilih jenis pesanan sebelum menambahkan menu.</p>
          <div className="pilih-tipe-grid">
            <button className="pilih-tipe-btn" onClick={mulaiPesananBawaPulang}>
              <ShoppingCart size={28} />
              <span>Bawa Pulang</span>
            </button>
            <button className="pilih-tipe-btn" onClick={() => setShowPilihMejaAwal(true)}>
              <LayoutGrid size={28} />
              <span>Dine-in</span>
            </button>
          </div>
        </div>

        {showPilihMejaAwal && (
          <PilihMejaModal
            meja={meja}
            onPilih={async (mejaId) => {
              await kaitkanMeja(mejaId);
              setShowPilihMejaAwal(false);
            }}
            onClose={() => setShowPilihMejaAwal(false)}
          />
        )}
        <style>{`
          .pilih-tipe-screen {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 20px;
            height: 100%;
            padding: 24px;
          }
          .pilih-tipe-card {
            background: white;
            border: 1px solid var(--border-soft);
            border-radius: var(--radius-lg);
            padding: 32px;
            text-align: center;
            max-width: 420px;
            width: 100%;
          }
          .pilih-tipe-card h2 { margin: 0 0 6px; font-size: 19px; font-weight: 700; color: var(--kopi-900); }
          .pilih-tipe-card p { margin: 0 0 22px; font-size: 13px; color: var(--teks-redup); }
          .pilih-tipe-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
          .pilih-tipe-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            padding: 28px 16px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border-soft);
            background: var(--krem-100);
            color: var(--kopi-900);
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            transition: border-color 0.15s, transform 0.1s;
          }
          .pilih-tipe-btn:hover { border-color: var(--terracotta-500); transform: translateY(-2px); color: var(--terracotta-500); }
          .proses-dapur-box-standalone { max-width: 420px; width: 100%; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="kasir-grid">
      {/* KOLOM MENU */}
      <section className="kasir-menu-col">
        <div className="kasir-toolbar">
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Cari menu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="kategori-pills">
            {["Semua", ...KATEGORI].map((k) => (
              <button
                key={k}
                className={"pill" + (kategoriFilter === k ? " active" : "")}
                onClick={() => setKategoriFilter(k)}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="menu-grid">
          {menuTersaring.length === 0 && (
            <div className="empty-state">
              <Package size={28} />
              <p>Tidak ada menu yang cocok.</p>
            </div>
          )}
          {menuTersaring.map((item) => (
            <button key={item.id} className="menu-card" onClick={() => tambahItem(item)}>
              <span className="menu-card-kategori">{item.kategori}</span>
              <span className="menu-card-nama">{item.nama}</span>
              <span className="menu-card-harga">{formatRupiah(item.harga)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* KOLOM ORDER */}
      <aside className="kasir-order-col">
        <div className="order-header">
          <div>
            <h3>Pesanan Saat Ini</h3>
            {mejaTerkait ? (
              <span className="order-tag">Meja {mejaTerkait.nomor}</span>
            ) : activeOrder ? (
              <span className="order-tag order-tag-bawa">Bawa Pulang</span>
            ) : (
              <span className="order-tag-empty">Belum ada pesanan</span>
            )}
            {activeOrder && activeOrder.items.length > 0 &&
              statusOrderDariItems(activeOrder.items) === "siap" && (
                <span className="order-tag-siap"><Bell size={11} /> Siap Disajikan</span>
              )}
          </div>
          {activeOrder && (
            <button className="link-btn" onClick={() => setShowPilihMeja(true)}>
              {mejaTerkait ? "Ganti meja" : "Kaitkan meja"}
            </button>
          )}
        </div>

        <div className="order-items">
          {!activeOrder && pesananBawaPulangDalamProses.length > 0 && (
            <div className="proses-dapur-box">
              <span className="proses-dapur-label">
                <Flame size={13} /> Bawa Pulang — Sedang Disiapkan
              </span>
              {pesananBawaPulangDalamProses.map((o) => {
                const totalO = o.items.reduce((s, i) => s + i.harga * i.qty, 0);
                const jumlahSiap = o.items.filter((i) => i.statusDapur === "siap").length;
                return (
                  <div key={o.id} className="proses-dapur-item">
                    <div className="proses-dapur-item-info">
                      <span className="proses-dapur-item-id">
                        #{o.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="proses-dapur-item-progress">
                        {jumlahSiap}/{o.items.length} item siap
                      </span>
                    </div>
                    <span className="proses-dapur-item-total">{formatRupiah(totalO)}</span>
                  </div>
                );
              })}
              <p className="proses-dapur-hint">
                Pesanan ini sudah dibayar. Cek tab Dapur untuk update status, atau cetak ulang
                struknya lewat tab Laporan.
              </p>
            </div>
          )}
          {(!activeOrder || activeOrder.items.length === 0) && (
            <div className="empty-state small">
              <ShoppingCart size={24} />
              <p>Klik menu di kiri untuk menambahkan item.</p>
            </div>
          )}
          {activeOrder?.items.map((i) => (
            <div className="order-item" key={i.menuId}>
              <div className="order-item-info">
                <span className="order-item-nama">
                  {i.nama}
                  {i.statusDapur === "siap" && (
                    <span className="order-item-dapur-badge siap"><Check size={10} /></span>
                  )}
                  {i.statusDapur === "diproses" && (
                    <span className="order-item-dapur-badge diproses"><Flame size={10} /></span>
                  )}
                </span>
                <span className="order-item-harga">{formatRupiah(i.harga)} / pcs</span>
              </div>
              <div className="qty-ctl">
                <button onClick={() => ubahQty(i.menuId, -1)}><Minus size={14} /></button>
                <span>{i.qty}</span>
                <button onClick={() => ubahQty(i.menuId, 1)}><Plus size={14} /></button>
              </div>
              <span className="order-item-subtotal">{formatRupiah(i.harga * i.qty)}</span>
              <button className="icon-btn-danger" onClick={() => hapusItem(i.menuId)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="order-footer">
          <div className="order-total-row">
            <span>Total</span>
            <span className="order-total-amount">{formatRupiah(total)}</span>
          </div>
          <div className="order-actions">
            <button
              className="btn-secondary"
              disabled={!activeOrder || activeOrder.items.length === 0}
              onClick={batalkanOrder}
            >
              Batalkan
            </button>
            <button
              className="btn-primary"
              disabled={!activeOrder || activeOrder.items.length === 0}
              onClick={() => setShowBayar(true)}
            >
              Bayar
            </button>
          </div>
        </div>
      </aside>

      {showPilihMeja && (
        <PilihMejaModal
          meja={meja}
          onPilih={kaitkanMeja}
          onClose={() => setShowPilihMeja(false)}
        />
      )}

      {showBayar && activeOrder && (
        <BayarModal
          total={total}
          onBayar={selesaikanBayar}
          onClose={() => setShowBayar(false)}
        />
      )}
    </div>
  );
}

/* ---------------- Modal: Pilih Meja (dari Kasir) ---------------- */

function PilihMejaModal({ meja, onPilih, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Pilih Meja</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="meja-pick-grid">
            {meja.map((m) => (
              <button
                key={m.id}
                disabled={m.status === "terisi"}
                className={"meja-pick" + (m.status === "terisi" ? " terisi" : "")}
                onClick={() => onPilih(m.id)}
              >
                <span className="meja-pick-nomor">Meja {m.nomor}</span>
                {m.jumlahBangku && (
                  <span className="meja-pick-bangku">
                    <Users size={11} /> {m.jumlahBangku} bangku
                  </span>
                )}
                {m.status === "terisi" && <span className="meja-pick-status-terisi">Terisi</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Modal: Bayar ---------------- */

function BayarModal({ total, onBayar, onClose }) {
  const [metode, setMetode] = useState("tunai");
  const [uangInput, setUangInput] = useState("");

  const uangBayar = metode === "tunai" ? Number(uangInput || 0) : total;
  const kembalian = metode === "tunai" ? uangBayar - total : 0;
  const cukup = metode !== "tunai" || uangBayar >= total;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Pembayaran</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="bayar-total">
            <span>Total Tagihan</span>
            <strong>{formatRupiah(total)}</strong>
          </div>

          <div className="metode-grid">
            <button
              className={"metode-btn" + (metode === "tunai" ? " active" : "")}
              onClick={() => setMetode("tunai")}
            >
              <Banknote size={18} /> Tunai
            </button>
            <button
              className={"metode-btn" + (metode === "kartu" ? " active" : "")}
              onClick={() => setMetode("kartu")}
            >
              <CreditCard size={18} /> Kartu
            </button>
            <button
              className={"metode-btn" + (metode === "qris" ? " active" : "")}
              onClick={() => setMetode("qris")}
            >
              <QrCode size={18} /> QRIS
            </button>
          </div>

          {metode === "tunai" && (
            <div className="tunai-area">
              <label>Uang diterima</label>
              <input
                type="number"
                placeholder="0"
                value={uangInput}
                onChange={(e) => setUangInput(e.target.value)}
                autoFocus
              />
              <div className="uang-cepat">
                {[total, 50000, 100000, 150000, 200000].map((v) => (
                  <button key={v} onClick={() => setUangInput(String(v))}>
                    {formatRupiah(v)}
                  </button>
                ))}
              </div>
              <div className="kembalian-row">
                <span>Kembalian</span>
                <strong className={kembalian < 0 ? "negatif" : ""}>
                  {formatRupiah(Math.max(kembalian, 0))}
                </strong>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button
            className="btn-primary"
            disabled={!cukup}
            onClick={() => onBayar(metode, uangBayar)}
          >
            <Check size={16} /> Konfirmasi Bayar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MEJA VIEW
============================================================ */

/* ============================================================
   DAPUR VIEW — sistem antrian kitchen display
============================================================ */

const URUTAN_STATUS_DAPUR = ["menunggu", "diproses", "siap"];
const LABEL_STATUS_DAPUR = { menunggu: "Menunggu", diproses: "Diproses", siap: "Siap" };

function statusOrderDariItems(items) {
  if (items.every((i) => i.statusDapur === "siap")) return "siap";
  if (items.some((i) => i.statusDapur === "diproses" || i.statusDapur === "siap")) return "diproses";
  return "menunggu";
}

function DapurView({ orders, meja, persistOrders, persistMeja }) {
  const antrian = useMemo(() => {
    return Object.values(orders)
      .filter((o) => o.items.length > 0 && statusOrderDariItems(o.items) !== "siap")
      .sort((a, b) => new Date(a.dibuatPada) - new Date(b.dibuatPada));
  }, [orders]);

  // Nomor urut "Bawa Pulang #N" dihitung dari seluruh order bertipe bawa-pulang
  // yang dibuat pada HARI YANG SAMA (reset setiap hari), diurutkan dari yang
  // paling pertama dibuat — supaya nomornya konsisten & tidak terus membesar.
  const nomorBawaPulang = useMemo(() => {
    const semuaOrderHariIni = Object.values(orders)
      .filter((o) => o.tipe !== "dine-in" && todayStr(new Date(o.dibuatPada)) === todayStr())
      .sort((a, b) => new Date(a.dibuatPada) - new Date(b.dibuatPada));
    const map = {};
    semuaOrderHariIni.forEach((o, idx) => {
      map[o.id] = idx + 1;
    });
    return map;
  }, [orders]);

  const labelOrder = (o) => {
    if (o.tipe === "dine-in") {
      const nomor = o.nomorMeja || meja.find((x) => x.id === o.mejaId)?.nomor;
      return nomor ? `Meja ${nomor}` : "Dine-in";
    }
    return `Bawa Pulang #${nomorBawaPulang[o.id] || "?"}`;
  };

  // Jika order ini sudah dibayar (status 'paid'), terkait ke meja, dan SEMUA
  // itemnya kini berstatus siap, bebaskan mejanya — karena saat order belum
  // semuanya siap, meja sengaja dibiarkan "terisi" (lihat selesaikanBayar di
  // KasirView). Ini baru dipanggil SETELAH state items diupdate.
  const bebaskanMejaJikaSudahSiapDanLunas = async (orderSudahUpdate) => {
    if (
      orderSudahUpdate.status === "paid" &&
      orderSudahUpdate.mejaId &&
      statusOrderDariItems(orderSudahUpdate.items) === "siap"
    ) {
      const nextMeja = meja.map((m) =>
        m.id === orderSudahUpdate.mejaId ? { ...m, status: "kosong", orderId: null } : m
      );
      await persistMeja(nextMeja);
    }
  };

  const ubahStatusItem = async (orderId, menuId, statusBaru) => {
    const ord = orders[orderId];
    if (!ord) return;
    const items = ord.items.map((i) =>
      i.menuId === menuId ? { ...i, statusDapur: statusBaru } : i
    );
    const updated = { ...ord, items };
    await persistOrders({ ...orders, [updated.id]: updated });
    await bebaskanMejaJikaSudahSiapDanLunas(updated);
  };

  const siklusStatus = (statusSekarang) => {
    const idx = URUTAN_STATUS_DAPUR.indexOf(statusSekarang || "menunggu");
    return URUTAN_STATUS_DAPUR[(idx + 1) % URUTAN_STATUS_DAPUR.length];
  };

  const tandaiSemuaSiap = async (orderId) => {
    const ord = orders[orderId];
    if (!ord) return;
    const items = ord.items.map((i) => ({ ...i, statusDapur: "siap" }));
    const updated = { ...ord, items };
    await persistOrders({ ...orders, [orderId]: updated });
    await bebaskanMejaJikaSudahSiapDanLunas(updated);
  };

  return (
    <div className="view-pad">
      <header className="view-header">
        <h2>Antrian Dapur</h2>
        <p>Klik item untuk mengubah status: Menunggu → Diproses → Siap.</p>
      </header>

      {antrian.length === 0 ? (
        <div className="empty-state">
          <CookingPot size={28} />
          <p>Tidak ada pesanan yang sedang diproses.</p>
        </div>
      ) : (
        <div className="dapur-grid">
          {antrian.map((o) => {
            const statusOrder = statusOrderDariItems(o.items);
            const menitBerlalu = Math.max(
              0,
              Math.round((Date.now() - new Date(o.dibuatPada).getTime()) / 60000)
            );
            return (
              <div
                key={o.id}
                className={"dapur-card" + (statusOrder === "siap" ? " siap" : "")}
              >
                <div className="dapur-card-head">
                  <div className="dapur-card-id">
                    <span className="dapur-id-besar">{labelOrder(o)}</span>
                    <span className="dapur-tipe">
                      {o.tipe === "dine-in" ? "Dine-in" : "Bawa Pulang"}
                    </span>
                  </div>
                  <span className="dapur-waktu">
                    <Clock size={12} /> {menitBerlalu} menit
                  </span>
                </div>

                <div className="dapur-items">
                  {o.items.map((item) => {
                    const status = item.statusDapur || "menunggu";
                    return (
                      <button
                        key={item.menuId}
                        className={"dapur-item dapur-item-" + status}
                        onClick={() => ubahStatusItem(o.id, item.menuId, siklusStatus(status))}
                      >
                        <span className="dapur-item-qty">{item.qty}×</span>
                        <span className="dapur-item-nama">{item.nama}</span>
                        <span className="dapur-item-status">
                          {status === "siap" && <Check size={13} />}
                          {status === "diproses" && <Flame size={13} />}
                          {status === "menunggu" && <Clock size={13} />}
                          {LABEL_STATUS_DAPUR[status]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="dapur-card-footer">
                  {statusOrder === "siap" ? (
                    <span className="dapur-siap-label">
                      <Bell size={15} /> Siap Disajikan
                    </span>
                  ) : (
                    <button className="dapur-tandai-btn" onClick={() => tandaiSemuaSiap(o.id)}>
                      Tandai Semua Siap
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MEJA VIEW
============================================================ */

function MejaView({ meja, orders, persistMeja, persistOrders, showToast, lanjutkanPesananMeja }) {
  const [detailMejaId, setDetailMejaId] = useState(null);
  const [konfirmHapusMeja, setKonfirmHapusMeja] = useState(null);
  const [formMeja, setFormMeja] = useState(null); // null = tutup, {} = tambah baru, {...meja} = edit

  const detailMeja = detailMejaId ? meja.find((m) => m.id === detailMejaId) : null;
  const detailOrder = detailMeja?.orderId ? orders[detailMeja.orderId] : null;

  const bebaskanMeja = async (mejaId) => {
    const m = meja.find((x) => x.id === mejaId);
    if (m?.orderId) {
      const next = { ...orders };
      delete next[m.orderId];
      await persistOrders(next);
    }
    const nextMeja = meja.map((x) =>
      x.id === mejaId ? { ...x, status: "kosong", orderId: null } : x
    );
    await persistMeja(nextMeja);
    setDetailMejaId(null);
    showToast("Meja dikosongkan", "ok");
  };

  const simpanFormMeja = async (jumlahBangku) => {
    if (formMeja.id) {
      // edit meja yang sudah ada
      await persistMeja(
        meja.map((x) => (x.id === formMeja.id ? { ...x, jumlahBangku } : x))
      );
      showToast(`Meja ${formMeja.nomor} diperbarui`, "ok");
    } else {
      // tambah meja baru
      const nomorTertinggi = meja.reduce((max, m) => Math.max(max, m.nomor), 0);
      const mejaBaru = {
        id: "t" + uid(),
        nomor: nomorTertinggi + 1,
        status: "kosong",
        orderId: null,
        jumlahBangku,
      };
      await persistMeja([...meja, mejaBaru]);
      showToast(`Meja ${mejaBaru.nomor} ditambahkan`, "ok");
    }
    setFormMeja(null);
  };

  const hapusMeja = async (mejaId) => {
    const m = meja.find((x) => x.id === mejaId);
    if (!m) return;
    if (m.status === "terisi") {
      showToast("Tidak bisa menghapus meja yang masih terisi.", "error");
      setKonfirmHapusMeja(null);
      return;
    }
    await persistMeja(meja.filter((x) => x.id !== mejaId));
    setKonfirmHapusMeja(null);
    showToast(`Meja ${m.nomor} dihapus`, "ok");
  };

  return (
    <div className="view-pad">
      <header className="view-header view-header-row">
        <div>
          <h2>Status Meja</h2>
          <p>Klik meja yang terisi untuk melihat pesanan yang sedang berjalan.</p>
        </div>
        <button className="btn-primary" onClick={() => setFormMeja({})}>
          <Plus size={16} /> Tambah Meja
        </button>
      </header>

      <div className="meja-grid">
        {meja.map((m) => {
          const ord = m.orderId ? orders[m.orderId] : null;
          const totalMeja = ord
            ? ord.items.reduce((s, i) => s + i.harga * i.qty, 0)
            : 0;
          return (
            <div key={m.id} className="meja-card-wrap">
              <button
                className={"meja-card" + (m.status === "terisi" ? " terisi" : " kosong")}
                onClick={() => m.status === "terisi" && setDetailMejaId(m.id)}
              >
                <span className="meja-card-nomor">Meja {m.nomor}</span>
                <span className="meja-card-status">
                  {m.status === "terisi" ? "Terisi" : "Kosong"}
                </span>
                {m.jumlahBangku && (
                  <span className="meja-card-bangku">
                    <Users size={12} /> {m.jumlahBangku} bangku
                  </span>
                )}
                {m.status === "terisi" && (
                  <span className="meja-card-total">{formatRupiah(totalMeja)}</span>
                )}
              </button>
              {m.status === "kosong" && (
                <div className="meja-card-aksi">
                  <button
                    className="meja-card-aksi-btn"
                    onClick={() => setFormMeja(m)}
                    title={`Edit Meja ${m.nomor}`}
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    className="meja-card-aksi-btn meja-card-aksi-btn-hapus"
                    onClick={() => setKonfirmHapusMeja(m)}
                    title={`Hapus Meja ${m.nomor}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {detailMeja && (
        <div className="modal-overlay" onClick={() => setDetailMejaId(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Meja {detailMeja.nomor}</h3>
              <button className="icon-btn" onClick={() => setDetailMejaId(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {detailOrder && detailOrder.items.length > 0 ? (
                <>
                  <div className="detail-meja-items">
                    {detailOrder.items.map((i) => (
                      <div className="detail-meja-item" key={i.menuId}>
                        <span>
                          {i.qty}× {i.nama}
                          {detailOrder.status === "paid" && (
                            <span className={"status-dapur-mini status-dapur-mini-" + (i.statusDapur || "menunggu")}>
                              {LABEL_STATUS_DAPUR[i.statusDapur || "menunggu"]}
                            </span>
                          )}
                        </span>
                        <span>{formatRupiah(i.harga * i.qty)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bayar-total" style={{ marginTop: 12 }}>
                    <span>Total</span>
                    <strong>
                      {formatRupiah(detailOrder.items.reduce((s, i) => s + i.harga * i.qty, 0))}
                    </strong>
                  </div>
                  {detailOrder.status === "paid" ? (
                    <p className="hint-text">
                      Pesanan ini <strong>sudah dibayar</strong> dan sedang menunggu disiapkan
                      di dapur. Meja akan otomatis kosong begitu semua item ditandai siap.
                    </p>
                  ) : (
                    <p className="hint-text">
                      Klik "Lanjutkan Pesanan" untuk membuka pesanan ini di tab Kasir dan
                      memproses pembayarannya.
                    </p>
                  )}
                </>
              ) : (
                <p className="hint-text">
                  Meja ini berstatus terisi, tapi pesanannya kosong atau tidak ditemukan
                  (mungkin tersisa dari sesi sebelumnya). Klik "Kosongkan Meja" untuk
                  membebaskannya.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => bebaskanMeja(detailMeja.id)}>
                Kosongkan Meja
              </button>
              {detailOrder && detailOrder.items.length > 0 && detailOrder.status !== "paid" && (
                <button
                  className="btn-primary"
                  onClick={() => lanjutkanPesananMeja(detailOrder.id)}
                >
                  Lanjutkan Pesanan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {konfirmHapusMeja && (
        <div className="modal-overlay" onClick={() => setKonfirmHapusMeja(null)}>
          <div className="modal-card modal-card-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Hapus Meja {konfirmHapusMeja.nomor}?</h3>
              <button className="icon-btn" onClick={() => setKonfirmHapusMeja(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p>
                Meja {konfirmHapusMeja.nomor} akan dihapus permanen dari daftar meja kafe.
                Riwayat transaksi yang sudah pernah terkait meja ini tidak akan terpengaruh.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setKonfirmHapusMeja(null)}>
                Batal
              </button>
              <button className="btn-danger" onClick={() => hapusMeja(konfirmHapusMeja.id)}>
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {formMeja !== null && (
        <FormMejaModal
          meja={formMeja}
          onSimpan={simpanFormMeja}
          onClose={() => setFormMeja(null)}
        />
      )}
    </div>
  );
}

function FormMejaModal({ meja, onSimpan, onClose }) {
  const isBaru = !meja.id;
  const [jumlahBangku, setJumlahBangku] = useState(
    meja.jumlahBangku ? String(meja.jumlahBangku) : "4"
  );
  const [error, setError] = useState("");

  const submit = () => {
    const angka = Number(jumlahBangku);
    if (!jumlahBangku || isNaN(angka) || angka <= 0 || !Number.isInteger(angka)) {
      setError("Jumlah bangku harus berupa bilangan bulat lebih dari 0.");
      return;
    }
    onSimpan(angka);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isBaru ? "Tambah Meja" : `Edit Meja ${meja.nomor}`}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-field">
            <label>Jumlah Bangku</label>
            <input
              type="number"
              min="1"
              value={jumlahBangku}
              onChange={(e) => setJumlahBangku(e.target.value)}
              placeholder="Misal: 4"
              autoFocus
            />
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={submit}>
            <Check size={16} /> {isBaru ? "Tambah Meja" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MENU VIEW (CRUD Produk)
============================================================ */

function MenuView({ menu, persistMenu, showToast }) {
  const [editing, setEditing] = useState(null); // null = tutup, {} = baru, {...item} = edit
  const [search, setSearch] = useState("");
  const [konfirmHapus, setKonfirmHapus] = useState(null);

  const tersaring = menu.filter((m) =>
    m.nama.toLowerCase().includes(search.toLowerCase())
  );

  const simpan = async (data) => {
    let next;
    if (data.id) {
      next = menu.map((m) => (m.id === data.id ? data : m));
    } else {
      next = [...menu, { ...data, id: uid() }];
    }
    await persistMenu(next);
    setEditing(null);
    showToast(data.id ? "Menu diperbarui" : "Menu ditambahkan", "ok");
  };

  const hapus = async (id) => {
    await persistMenu(menu.filter((m) => m.id !== id));
    setKonfirmHapus(null);
    showToast("Menu dihapus", "ok");
  };

  const toggleAktif = async (id) => {
    await persistMenu(menu.map((m) => (m.id === id ? { ...m, aktif: !m.aktif } : m)));
  };

  return (
    <div className="view-pad">
      <header className="view-header view-header-row">
        <div>
          <h2>Manajemen Menu</h2>
          <p>Tambah, ubah, atau nonaktifkan item menu kafe.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({})}>
          <Plus size={16} /> Tambah Menu
        </button>
      </header>

      <div className="search-box" style={{ maxWidth: 320, marginBottom: 16 }}>
        <Search size={16} />
        <input
          placeholder="Cari menu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="menu-table">
        <div className="menu-table-head">
          <span>Nama</span>
          <span>Kategori</span>
          <span>Harga</span>
          <span>Status</span>
          <span></span>
        </div>
        {tersaring.length === 0 && (
          <div className="empty-state">
            <Package size={28} />
            <p>Belum ada menu yang cocok.</p>
          </div>
        )}
        {tersaring.map((m) => (
          <div className="menu-table-row" key={m.id}>
            <span className="cell-nama">{m.nama}</span>
            <span><span className="badge-kategori">{m.kategori}</span></span>
            <span>{formatRupiah(m.harga)}</span>
            <span>
              <button
                className={"status-toggle" + (m.aktif ? " on" : " off")}
                onClick={() => toggleAktif(m.id)}
              >
                {m.aktif ? "Aktif" : "Nonaktif"}
              </button>
            </span>
            <span className="row-actions">
              <button className="icon-btn" onClick={() => setEditing(m)}>
                <Edit3 size={15} />
              </button>
              <button className="icon-btn-danger" onClick={() => setKonfirmHapus(m)}>
                <Trash2 size={15} />
              </button>
            </span>
          </div>
        ))}
      </div>

      {editing !== null && (
        <MenuFormModal
          item={editing}
          onSimpan={simpan}
          onClose={() => setEditing(null)}
        />
      )}

      {konfirmHapus && (
        <div className="modal-overlay" onClick={() => setKonfirmHapus(null)}>
          <div className="modal-card modal-card-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Hapus Menu?</h3>
              <button className="icon-btn" onClick={() => setKonfirmHapus(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p>
                "{konfirmHapus.nama}" akan dihapus permanen dari daftar menu. Riwayat
                transaksi lama tidak akan terpengaruh.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setKonfirmHapus(null)}>
                Batal
              </button>
              <button className="btn-danger" onClick={() => hapus(konfirmHapus.id)}>
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuFormModal({ item, onSimpan, onClose }) {
  const isBaru = !item.id;
  const [nama, setNama] = useState(item.nama || "");
  const [kategori, setKategori] = useState(item.kategori || KATEGORI[0]);
  const [harga, setHarga] = useState(item.harga ? String(item.harga) : "");
  const [error, setError] = useState("");

  const submit = () => {
    if (!nama.trim()) return setError("Nama menu wajib diisi.");
    const hargaNum = Number(harga);
    if (!harga || isNaN(hargaNum) || hargaNum <= 0)
      return setError("Harga harus berupa angka lebih dari 0.");

    onSimpan({
      id: item.id,
      nama: nama.trim(),
      kategori,
      harga: hargaNum,
      aktif: item.aktif ?? true,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isBaru ? "Tambah Menu" : "Ubah Menu"}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-field">
            <label>Nama Menu</label>
            <input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Contoh: Es Kopi Susu"
              autoFocus
            />
          </div>
          <div className="form-field">
            <label>Kategori</label>
            <select value={kategori} onChange={(e) => setKategori(e.target.value)}>
              {KATEGORI.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Harga (Rp)</label>
            <input
              type="number"
              value={harga}
              onChange={(e) => setHarga(e.target.value)}
              placeholder="0"
            />
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={submit}>
            <Check size={16} /> Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   LAPORAN VIEW
============================================================ */

function GrafikTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-tgl">{label}</div>
      <div className="chart-tooltip-row">
        <span>Omzet</span>
        <strong>{formatRupiah(data.omzet)}</strong>
      </div>
      <div className="chart-tooltip-row">
        <span>Transaksi</span>
        <strong>{data.jumlahTransaksi}</strong>
      </div>
    </div>
  );
}

function JamTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-tgl">{label}</div>
      <div className="chart-tooltip-row">
        <span>Transaksi</span>
        <strong>{data.jumlahTransaksi}</strong>
      </div>
      <div className="chart-tooltip-row">
        <span>Omzet</span>
        <strong>{formatRupiah(data.omzet)}</strong>
      </div>
    </div>
  );
}

// Menghitung rentang [mulai, akhir] (inklusif) untuk satu kode periode.
// offset=0 berarti periode yang sedang aktif; offset=1 berarti "satu periode
// sebelumnya" dengan panjang yang sama (dipakai untuk perbandingan).
function hitungRentangPeriode(periode, tglDari, tglSampai, offset = 0) {
  const now = new Date();

  if (periode === "custom") {
    if (!tglDari || !tglSampai || tglDari > tglSampai) return null;
    let mulai = new Date(tglDari + "T00:00:00");
    let akhir = new Date(tglSampai + "T23:59:59.999");
    if (offset > 0) {
      const panjangMs = akhir.getTime() - mulai.getTime();
      akhir = new Date(mulai.getTime() - 1);
      akhir.setHours(23, 59, 59, 999);
      mulai = new Date(akhir.getTime() - panjangMs);
      mulai.setHours(0, 0, 0, 0);
    }
    return { mulai, akhir };
  }

  if (periode === "hari" || periode === "kemarin") {
    const geserHari = periode === "kemarin" ? 1 : 0;
    const mulai = new Date(now);
    mulai.setDate(mulai.getDate() - geserHari - offset);
    mulai.setHours(0, 0, 0, 0);
    const akhir = new Date(mulai);
    akhir.setHours(23, 59, 59, 999);
    return { mulai, akhir };
  }

  if (periode === "minggu") {
    const akhir = new Date(now);
    akhir.setDate(akhir.getDate() - offset * 7);
    const mulai = new Date(akhir);
    mulai.setDate(mulai.getDate() - 7);
    mulai.setHours(0, 0, 0, 0);
    return { mulai, akhir };
  }

  if (periode === "bulan") {
    const bulanTarget = now.getMonth() - offset;
    const mulai = new Date(now.getFullYear(), bulanTarget, 1);
    const akhir = offset === 0 ? now : new Date(now.getFullYear(), bulanTarget + 1, 0, 23, 59, 59, 999);
    return { mulai, akhir };
  }

  // "semua" tidak punya periode pembanding yang masuk akal
  return null;
}

function BadgePerbandingan({ persen }) {
  if (persen === null || persen === undefined || !isFinite(persen)) return null;
  const naik = persen >= 0;
  const Icon = naik ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={"badge-perbandingan" + (naik ? " naik" : " turun")}>
      <Icon size={12} />
      {Math.abs(persen).toFixed(0)}%
    </span>
  );
}

function LaporanView({ orders, meja, menu, triggerCetak }) {
  const [periode, setPeriode] = useState("hari"); // hari | kemarin | minggu | bulan | semua | custom
  const [tglDari, setTglDari] = useState(todayStr());
  const [tglSampai, setTglSampai] = useState(todayStr());
  const [errorTgl, setErrorTgl] = useState("");
  const [mengekspor, setMengekspor] = useState(false);
  const [detailTransaksi, setDetailTransaksi] = useState(null);

  const lunas = useMemo(
    () => Object.values(orders).filter((o) => o.status === "paid"),
    [orders]
  );

  useEffect(() => {
    if (periode !== "custom") {
      setErrorTgl("");
      return;
    }
    if (tglDari && tglSampai && tglDari > tglSampai) {
      setErrorTgl('Tanggal "dari" tidak boleh setelah tanggal "sampai".');
    } else {
      setErrorTgl("");
    }
  }, [periode, tglDari, tglSampai]);

  const filtered = useMemo(() => {
    if (periode === "semua") return lunas;
    const rentang = hitungRentangPeriode(periode, tglDari, tglSampai, 0);
    if (!rentang) return [];
    return lunas.filter((o) => {
      const d = new Date(o.dibayarPada);
      return d >= rentang.mulai && d <= rentang.akhir;
    });
  }, [lunas, periode, tglDari, tglSampai]);

  // Data periode SEBELUMNYA dengan panjang yang sama, untuk perbandingan
  // naik/turun. Tidak tersedia untuk periode "semua" (tidak ada pembanding
  // yang masuk akal).
  const filteredSebelumnya = useMemo(() => {
    if (periode === "semua") return null;
    const rentang = hitungRentangPeriode(periode, tglDari, tglSampai, 1);
    if (!rentang) return null;
    return lunas.filter((o) => {
      const d = new Date(o.dibayarPada);
      return d >= rentang.mulai && d <= rentang.akhir;
    });
  }, [lunas, periode, tglDari, tglSampai]);

  const totalPendapatan = filtered.reduce((s, o) => s + o.totalBayar, 0);
  const jumlahTransaksi = filtered.length;
  const rataRata = jumlahTransaksi > 0 ? totalPendapatan / jumlahTransaksi : 0;

  // Perbandingan dengan periode sebelumnya (naik/turun %)
  const perbandingan = useMemo(() => {
    if (!filteredSebelumnya) return null;
    const totalSebelumnya = filteredSebelumnya.reduce((s, o) => s + o.totalBayar, 0);
    const jumlahSebelumnya = filteredSebelumnya.length;
    const persenOmzet =
      totalSebelumnya > 0 ? ((totalPendapatan - totalSebelumnya) / totalSebelumnya) * 100 : null;
    const persenTransaksi =
      jumlahSebelumnya > 0 ? ((jumlahTransaksi - jumlahSebelumnya) / jumlahSebelumnya) * 100 : null;
    return { totalSebelumnya, jumlahSebelumnya, persenOmzet, persenTransaksi };
  }, [filteredSebelumnya, totalPendapatan, jumlahTransaksi]);

  // Breakdown omzet per kategori menu (butuh lookup kategori dari menu master
  // untuk transaksi lama yang belum menyimpan kategori langsung di item-nya)
  const breakdownKategori = useMemo(() => {
    const map = {};
    filtered.forEach((o) => {
      o.items.forEach((i) => {
        const kategori = i.kategori || menu.find((m) => m.id === i.menuId)?.kategori || "Lainnya";
        if (!map[kategori]) map[kategori] = { kategori, qty: 0, omzet: 0 };
        map[kategori].qty += i.qty;
        map[kategori].omzet += i.qty * i.harga;
      });
    });
    const totalOmzetKategori = Object.values(map).reduce((s, k) => s + k.omzet, 0);
    return Object.values(map)
      .map((k) => ({ ...k, persen: totalOmzetKategori > 0 ? (k.omzet / totalOmzetKategori) * 100 : 0 }))
      .sort((a, b) => b.omzet - a.omzet);
  }, [filtered, menu]);

  // Jam tersibuk: jumlah transaksi per jam (0-23), untuk pola keramaian
  const jamTersibuk = useMemo(() => {
    const map = Array.from({ length: 24 }, (_, jam) => ({ jam, jumlahTransaksi: 0, omzet: 0 }));
    filtered.forEach((o) => {
      const jam = new Date(o.dibayarPada).getHours();
      map[jam].jumlahTransaksi += 1;
      map[jam].omzet += o.totalBayar;
    });
    return map
      .filter((j) => j.jumlahTransaksi > 0)
      .map((j) => ({ ...j, label: `${String(j.jam).padStart(2, "0")}:00` }));
  }, [filtered]);

  const jamTersibukTertinggi = useMemo(() => {
    if (jamTersibuk.length === 0) return null;
    return jamTersibuk.reduce((a, b) => (b.jumlahTransaksi > a.jumlahTransaksi ? b : a));
  }, [jamTersibuk]);

  // Breakdown metode pembayaran
  const breakdownMetodeBayar = useMemo(() => {
    const map = { tunai: 0, kartu: 0, qris: 0 };
    filtered.forEach((o) => {
      map[o.metodeBayar] = (map[o.metodeBayar] || 0) + o.totalBayar;
    });
    const totalSemua = Object.values(map).reduce((s, v) => s + v, 0);
    const labelMap = { tunai: "Tunai", kartu: "Kartu", qris: "QRIS" };
    return Object.entries(map)
      .map(([key, omzet]) => ({
        metode: labelMap[key] || key,
        omzet,
        persen: totalSemua > 0 ? (omzet / totalSemua) * 100 : 0,
      }))
      .filter((m) => m.omzet > 0)
      .sort((a, b) => b.omzet - a.omzet);
  }, [filtered]);

  const terlarisMap = useMemo(() => {
    const map = {};
    filtered.forEach((o) => {
      o.items.forEach((i) => {
        if (!map[i.nama]) map[i.nama] = { nama: i.nama, qty: 0, omzet: 0 };
        map[i.nama].qty += i.qty;
        map[i.nama].omzet += i.qty * i.harga;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [filtered]);

  const riwayatTerurut = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.dibayarPada) - new Date(a.dibayarPada)),
    [filtered]
  );

  const dataGrafikHarian = useMemo(() => {
    const map = {};
    filtered.forEach((o) => {
      const tglKey = o.dibayarPada.slice(0, 10); // YYYY-MM-DD
      if (!map[tglKey]) map[tglKey] = { tglKey, omzet: 0, jumlahTransaksi: 0 };
      map[tglKey].omzet += o.totalBayar;
      map[tglKey].jumlahTransaksi += 1;
    });
    return Object.values(map)
      .sort((a, b) => a.tglKey.localeCompare(b.tglKey))
      .map((d) => ({
        ...d,
        label: new Date(d.tglKey + "T00:00:00").toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
        }),
      }));
  }, [filtered]);

  const maxQty = terlarisMap[0]?.qty || 1;

  const labelPeriodeAktif = useMemo(() => {
    const map = { hari: "Hari Ini", kemarin: "Kemarin", minggu: "7 Hari Terakhir", bulan: "Bulan Ini", semua: "Semua" };
    if (periode === "custom") {
      return tglDari === tglSampai ? tglDari : `${tglDari} sd ${tglSampai}`;
    }
    return map[periode] || periode;
  }, [periode, tglDari, tglSampai]);

  const handleExportExcel = async () => {
    if (filtered.length === 0) return;
    setMengekspor(true);
    try {
      const { exportLaporanExcel } = await import("./exportExcel");
      exportLaporanExcel(filtered, { labelPeriode: labelPeriodeAktif });
    } catch (e) {
      alert(e.message || "Gagal membuat file Excel.");
    } finally {
      setMengekspor(false);
    }
  };

  return (
    <div className="view-pad">
      <header className="view-header view-header-row">
        <div>
          <h2>Laporan Penjualan</h2>
          <p>Ringkasan transaksi yang sudah dibayar.</p>
        </div>
        <div className="laporan-header-actions">
          <div className="periode-pills">
            {[
              { k: "hari", label: "Hari Ini" },
              { k: "kemarin", label: "Kemarin" },
              { k: "minggu", label: "7 Hari" },
              { k: "bulan", label: "Bulan Ini" },
              { k: "semua", label: "Semua" },
              { k: "custom", label: "Pilih Tanggal" },
            ].map((p) => (
              <button
                key={p.k}
                className={"pill" + (periode === p.k ? " active" : "")}
                onClick={() => setPeriode(p.k)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            className="btn-export-excel"
            onClick={handleExportExcel}
            disabled={filtered.length === 0 || mengekspor}
            title={filtered.length === 0 ? "Tidak ada transaksi untuk diekspor" : "Unduh laporan Excel"}
          >
            <FileSpreadsheet size={16} />
            {mengekspor ? "Membuat file…" : "Unduh Excel"}
          </button>
        </div>
      </header>

      {periode === "custom" && (
        <div className="date-range-box">
          <div className="date-range-field">
            <label>Dari</label>
            <input
              type="date"
              value={tglDari}
              max={tglSampai || undefined}
              onChange={(e) => setTglDari(e.target.value)}
            />
          </div>
          <span className="date-range-sep">–</span>
          <div className="date-range-field">
            <label>Sampai</label>
            <input
              type="date"
              value={tglSampai}
              min={tglDari || undefined}
              onChange={(e) => setTglSampai(e.target.value)}
            />
          </div>
          {errorTgl && <span className="form-error date-range-error">{errorTgl}</span>}
        </div>
      )}

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-icon"><TrendingUp size={18} /></div>
          <div>
            <span className="stat-label">Total Pendapatan</span>
            <span className="stat-value">
              {formatRupiah(totalPendapatan)}
              {perbandingan && <BadgePerbandingan persen={perbandingan.persenOmzet} />}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Receipt size={18} /></div>
          <div>
            <span className="stat-label">Jumlah Transaksi</span>
            <span className="stat-value">
              {jumlahTransaksi}
              {perbandingan && <BadgePerbandingan persen={perbandingan.persenTransaksi} />}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><BarChart3 size={18} /></div>
          <div>
            <span className="stat-label">Rata-rata / Transaksi</span>
            <span className="stat-value">{formatRupiah(rataRata)}</span>
          </div>
        </div>
        {jamTersibukTertinggi && (
          <div className="stat-card">
            <div className="stat-icon"><Clock size={18} /></div>
            <div>
              <span className="stat-label">Jam Tersibuk</span>
              <span className="stat-value">{jamTersibukTertinggi.label}</span>
            </div>
          </div>
        )}
      </div>

      {perbandingan && (
        <p className="perbandingan-note">
          Dibandingkan periode sebelumnya: {formatRupiah(perbandingan.totalSebelumnya)} omzet
          dari {perbandingan.jumlahSebelumnya} transaksi.
        </p>
      )}

      <div className="laporan-panel laporan-panel-chart">
        <h3>Grafik Penjualan Harian</h3>
        {dataGrafikHarian.length === 0 ? (
          <div className="empty-state small">
            <BarChart3 size={22} />
            <p>Belum ada transaksi pada periode ini.</p>
          </div>
        ) : (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dataGrafikHarian} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5D8C5" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#7A6A58" }}
                  axisLine={{ stroke: "#E5D8C5" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#7A6A58" }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v >= 1000 ? `${Math.round(v / 1000)}rb` : v)}
                />
                <Tooltip content={<GrafikTooltip />} cursor={{ fill: "rgba(193,89,47,0.08)" }} />
                <Bar dataKey="omzet" fill="#C1592F" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="laporan-grid-3">
        <div className="laporan-panel">
          <h3>Per Kategori Menu</h3>
          {breakdownKategori.length === 0 ? (
            <div className="empty-state small">
              <ChefHat size={20} />
              <p>Belum ada data pada periode ini.</p>
            </div>
          ) : (
            <div className="bar-list">
              {breakdownKategori.map((k) => (
                <div className="bar-row" key={k.kategori}>
                  <span className="bar-label">{k.kategori}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${k.persen}%` }} />
                  </div>
                  <span className="bar-value">{k.persen.toFixed(0)}% · {formatRupiah(k.omzet)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="laporan-panel">
          <h3>Jam Tersibuk</h3>
          {jamTersibuk.length === 0 ? (
            <div className="empty-state small">
              <Clock size={20} />
              <p>Belum ada data pada periode ini.</p>
            </div>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={jamTersibuk} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5D8C5" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7A6A58" }} axisLine={{ stroke: "#E5D8C5" }} tickLine={false} interval={1} />
                  <YAxis tick={{ fontSize: 10, fill: "#7A6A58" }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                  <Tooltip content={<JamTooltip />} cursor={{ fill: "rgba(193,89,47,0.08)" }} />
                  <Bar dataKey="jumlahTransaksi" fill="#7C5236" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="laporan-panel">
          <h3>Metode Pembayaran</h3>
          {breakdownMetodeBayar.length === 0 ? (
            <div className="empty-state small">
              <Wallet size={20} />
              <p>Belum ada data pada periode ini.</p>
            </div>
          ) : (
            <div className="bar-list">
              {breakdownMetodeBayar.map((m) => (
                <div className="bar-row" key={m.metode}>
                  <span className="bar-label">{m.metode}</span>
                  <div className="bar-track">
                    <div className="bar-fill bar-fill-pucuk" style={{ width: `${m.persen}%` }} />
                  </div>
                  <span className="bar-value">{m.persen.toFixed(0)}% · {formatRupiah(m.omzet)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="laporan-grid">
        <div className="laporan-panel">
          <h3>Menu Terlaris</h3>
          {terlarisMap.length === 0 ? (
            <div className="empty-state small">
              <ClipboardList size={22} />
              <p>Belum ada transaksi pada periode ini.</p>
            </div>
          ) : (
            <div className="bar-list">
              {terlarisMap.map((t) => (
                <div className="bar-row" key={t.nama}>
                  <span className="bar-label">{t.nama}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(t.qty / maxQty) * 100}%` }}
                    />
                  </div>
                  <span className="bar-value">{t.qty}× · {formatRupiah(t.omzet)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="laporan-panel">
          <h3>Riwayat Transaksi</h3>
          {riwayatTerurut.length === 0 ? (
            <div className="empty-state small">
              <Clock size={22} />
              <p>Belum ada riwayat pada periode ini.</p>
            </div>
          ) : (
            <div className="riwayat-list">
              {riwayatTerurut.slice(0, 30).map((o) => (
                <div className="riwayat-row" key={o.id}>
                  <button
                    className="riwayat-info-clickable"
                    onClick={() => setDetailTransaksi(o)}
                  >
                    <div className="riwayat-info">
                      <span className="riwayat-waktu">{jamMenit(o.dibayarPada)}</span>
                      <span className="riwayat-tipe">
                        {o.tipe === "dine-in" ? "Dine-in" : "Bawa Pulang"}
                      </span>
                      <span className="riwayat-metode">{o.metodeBayar}</span>
                    </div>
                    <span className="riwayat-total">{formatRupiah(o.totalBayar)}</span>
                  </button>
                  <button
                    className="riwayat-cetak-btn"
                    onClick={() => triggerCetak(o)}
                    title="Cetak ulang struk"
                  >
                    <Printer size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {detailTransaksi && (
        <div className="modal-overlay" onClick={() => setDetailTransaksi(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Detail Transaksi #{detailTransaksi.id.slice(-6).toUpperCase()}</h3>
              <button className="icon-btn" onClick={() => setDetailTransaksi(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-transaksi-meta">
                <span>
                  {new Date(detailTransaksi.dibayarPada).toLocaleDateString("id-ID", {
                    day: "2-digit", month: "long", year: "numeric",
                  })} · {jamMenit(detailTransaksi.dibayarPada)}
                </span>
                <span className="riwayat-tipe">
                  {detailTransaksi.tipe === "dine-in"
                    ? (() => {
                        const nomor =
                          detailTransaksi.nomorMeja ||
                          meja.find((m) => m.id === detailTransaksi.mejaId)?.nomor;
                        return nomor ? `Dine-in · Meja ${nomor}` : "Dine-in · Meja tidak tercatat";
                      })()
                    : "Bawa Pulang"}
                </span>
              </div>
              <div className="detail-meja-items">
                {detailTransaksi.items.map((i) => (
                  <div className="detail-meja-item" key={i.menuId}>
                    <span>{i.qty}× {i.nama}</span>
                    <span>{formatRupiah(i.harga * i.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="bayar-total" style={{ marginTop: 12 }}>
                <span>Total</span>
                <strong>{formatRupiah(detailTransaksi.totalBayar)}</strong>
              </div>
              <div className="detail-transaksi-bayar">
                <span>Metode Bayar</span>
                <span className="riwayat-metode">{detailTransaksi.metodeBayar}</span>
              </div>
              {detailTransaksi.metodeBayar === "tunai" && (
                <div className="detail-transaksi-bayar">
                  <span>Uang Diterima / Kembalian</span>
                  <span>
                    {formatRupiah(detailTransaksi.uangBayar ?? detailTransaksi.totalBayar)} /{" "}
                    {formatRupiah(Math.max((detailTransaksi.uangBayar ?? detailTransaksi.totalBayar) - detailTransaksi.totalBayar, 0))}
                  </span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setDetailTransaksi(null)}>
                Tutup
              </button>
              <button
                className="btn-primary"
                onClick={() => { triggerCetak(detailTransaksi); setDetailTransaksi(null); }}
              >
                <Printer size={16} /> Cetak Ulang Struk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   REKONSILIASI VIEW — cocokkan uang fisik/tercatat vs sistem per hari
============================================================ */

// Menghitung total tercatat sistem (per metode bayar) untuk SATU tanggal
// tertentu. Dipakai baik untuk tanggal yang sedang aktif di form maupun
// untuk menghitung status cocok/tidak di tiap baris Riwayat Rekonsiliasi.
function hitungTercatatSistemUntukTanggal(orders, tgl) {
  const map = { tunai: 0, kartu: 0, qris: 0 };
  let jumlahTransaksi = 0;
  Object.values(orders).forEach((o) => {
    if (o.status !== "paid") return;
    if (todayStr(new Date(o.dibayarPada)) !== tgl) return;
    map[o.metodeBayar] = (map[o.metodeBayar] || 0) + o.totalBayar;
    jumlahTransaksi += 1;
  });
  return { ...map, totalSemua: map.tunai + map.kartu + map.qris, jumlahTransaksi };
}

function RekonsiliasiView({ orders, rekonsiliasi, persistRekonsiliasi, showToast }) {
  const [tglPilih, setTglPilih] = useState(todayStr());
  const [tunaiInput, setTunaiInput] = useState("");
  const [kartuInput, setKartuInput] = useState("");
  const [qrisInput, setQrisInput] = useState("");
  const [catatan, setCatatan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [filterRiwayat, setFilterRiwayat] = useState("semua"); // semua | bulan-ini | bulan-lalu | tahun-ini
  const [editTanggal, setEditTanggal] = useState(null); // tanggal yang sedang diedit lewat modal popup

  const dataTersimpan = rekonsiliasi[tglPilih] || null;

  // Saat ganti tanggal, isi ulang form dari data tersimpan (jika ada),
  // atau kosongkan kalau belum pernah direkonsiliasi.
  useEffect(() => {
    const d = rekonsiliasi[tglPilih];
    setTunaiInput(d ? String(d.tunaiAktual) : "");
    setKartuInput(d ? String(d.kartuAktual) : "");
    setQrisInput(d ? String(d.qrisAktual) : "");
    setCatatan(d ? d.catatan || "" : "");
  }, [tglPilih, rekonsiliasi]);

  // Total tercatat sistem untuk tanggal yang dipilih, dipecah per metode bayar
  const tercatatSistem = useMemo(
    () => hitungTercatatSistemUntukTanggal(orders, tglPilih),
    [orders, tglPilih]
  );

  const tunaiAktual = Number(tunaiInput || 0);
  const kartuAktual = Number(kartuInput || 0);
  const qrisAktual = Number(qrisInput || 0);
  const totalAktual = tunaiAktual + kartuAktual + qrisAktual;

  const selisih = {
    tunai: tunaiAktual - tercatatSistem.tunai,
    kartu: kartuAktual - tercatatSistem.kartu,
    qris: qrisAktual - tercatatSistem.qris,
    totalSemua: totalAktual - tercatatSistem.totalSemua,
  };

  const adaInput = tunaiInput !== "" || kartuInput !== "" || qrisInput !== "";
  const semuaCocok =
    adaInput && selisih.tunai === 0 && selisih.kartu === 0 && selisih.qris === 0;

  const simpanRekonsiliasi = async () => {
    setMenyimpan(true);
    const next = {
      ...rekonsiliasi,
      [tglPilih]: {
        tunaiAktual,
        kartuAktual,
        qrisAktual,
        catatan: catatan.trim(),
        disimpanPada: new Date().toISOString(),
      },
    };
    await persistRekonsiliasi(next);
    setMenyimpan(false);
    showToast("Rekonsiliasi tersimpan", "ok");
  };

  // Daftar tanggal yang sudah pernah direkonsiliasi, dengan status cocok/tidak
  // dihitung per baris (dibandingkan dengan data sistem pada tanggal masing-
  // masing), dan disaring sesuai filter periode yang dipilih.
  const riwayatRekonsiliasi = useMemo(() => {
    const now = new Date();
    let semua = Object.entries(rekonsiliasi)
      .map(([tgl, d]) => ({ tgl, ...d }))
      .sort((a, b) => b.tgl.localeCompare(a.tgl));

    if (filterRiwayat === "bulan-ini") {
      const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      semua = semua.filter((r) => r.tgl.startsWith(prefix));
    } else if (filterRiwayat === "bulan-lalu") {
      const bulanLalu = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prefix = `${bulanLalu.getFullYear()}-${String(bulanLalu.getMonth() + 1).padStart(2, "0")}`;
      semua = semua.filter((r) => r.tgl.startsWith(prefix));
    } else if (filterRiwayat === "tahun-ini") {
      const prefix = `${now.getFullYear()}-`;
      semua = semua.filter((r) => r.tgl.startsWith(prefix));
    }

    return semua.map((r) => {
      const sistemTglItu = hitungTercatatSistemUntukTanggal(orders, r.tgl);
      const totalAktualR = r.tunaiAktual + r.kartuAktual + r.qrisAktual;
      const cocok =
        r.tunaiAktual === sistemTglItu.tunai &&
        r.kartuAktual === sistemTglItu.kartu &&
        r.qrisAktual === sistemTglItu.qris;
      return { ...r, totalAktualR, cocok, selisihTotal: totalAktualR - sistemTglItu.totalSemua };
    });
  }, [rekonsiliasi, orders, filterRiwayat]);

  return (
    <div className="view-pad">
      <header className="view-header view-header-row">
        <div>
          <h2>Rekonsiliasi Keuangan</h2>
          <p>Cocokkan uang yang diterima dengan transaksi yang tercatat sistem, per hari.</p>
        </div>
        <div className="rekon-tgl-pick">
          <label>Tanggal</label>
          <input
            type="date"
            value={tglPilih}
            max={todayStr()}
            onChange={(e) => setTglPilih(e.target.value)}
          />
        </div>
      </header>

      <div className="rekon-grid">
        <div className="laporan-panel">
          <h3>Tercatat di Sistem</h3>
          <div className="rekon-baris-readonly">
            <span>Tunai</span>
            <strong>{formatRupiah(tercatatSistem.tunai)}</strong>
          </div>
          <div className="rekon-baris-readonly">
            <span>Kartu</span>
            <strong>{formatRupiah(tercatatSistem.kartu)}</strong>
          </div>
          <div className="rekon-baris-readonly">
            <span>QRIS</span>
            <strong>{formatRupiah(tercatatSistem.qris)}</strong>
          </div>
          <div className="rekon-baris-readonly rekon-total">
            <span>Total ({tercatatSistem.jumlahTransaksi} transaksi)</span>
            <strong>{formatRupiah(tercatatSistem.totalSemua)}</strong>
          </div>
        </div>

        <div className="laporan-panel">
          <h3>Uang Aktual Diterima</h3>
          <div className="rekon-input-field">
            <label>Tunai</label>
            <input
              type="number"
              placeholder="0"
              value={tunaiInput}
              onChange={(e) => setTunaiInput(e.target.value)}
            />
          </div>
          <div className="rekon-input-field">
            <label>Kartu</label>
            <input
              type="number"
              placeholder="0"
              value={kartuInput}
              onChange={(e) => setKartuInput(e.target.value)}
            />
          </div>
          <div className="rekon-input-field">
            <label>QRIS</label>
            <input
              type="number"
              placeholder="0"
              value={qrisInput}
              onChange={(e) => setQrisInput(e.target.value)}
            />
          </div>
          <div className="rekon-input-field">
            <label>Catatan (opsional)</label>
            <input
              type="text"
              placeholder="Misal: selisih karena kembalian kurang"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>
        </div>

        <div className="laporan-panel">
          <h3>Selisih</h3>
          {!adaInput ? (
            <div className="empty-state small">
              <Scale size={22} />
              <p>Isi uang aktual di sebelah kiri untuk melihat selisihnya.</p>
            </div>
          ) : (
            <>
              <SelisihBaris label="Tunai" nilai={selisih.tunai} />
              <SelisihBaris label="Kartu" nilai={selisih.kartu} />
              <SelisihBaris label="QRIS" nilai={selisih.qris} />
              <div className={"rekon-status-akhir" + (semuaCocok ? " cocok" : " tidak-cocok")}>
                {semuaCocok ? (
                  <><CheckCircle2 size={16} /> Semua cocok</>
                ) : (
                  <>
                    {selisih.totalSemua >= 0 ? <PlusCircle size={16} /> : <MinusCircle size={16} />}
                    Total selisih {formatRupiah(Math.abs(selisih.totalSemua))}
                    {selisih.totalSemua >= 0 ? " (lebih)" : " (kurang)"}
                  </>
                )}
              </div>
              <button className="btn-primary rekon-simpan-btn" onClick={simpanRekonsiliasi} disabled={menyimpan}>
                <Save size={16} /> {menyimpan ? "Menyimpan…" : dataTersimpan ? "Update Rekonsiliasi" : "Simpan Rekonsiliasi"}
              </button>
              {dataTersimpan && (
                <p className="rekon-tersimpan-note">
                  Tersimpan {new Date(dataTersimpan.disimpanPada).toLocaleString("id-ID")}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="laporan-panel">
        <div className="rekon-riwayat-header">
          <h3>Riwayat Rekonsiliasi</h3>
          <div className="periode-pills">
            {[
              { k: "semua", label: "Semua" },
              { k: "bulan-ini", label: "Bulan Ini" },
              { k: "bulan-lalu", label: "Bulan Lalu" },
              { k: "tahun-ini", label: "Tahun Ini" },
            ].map((p) => (
              <button
                key={p.k}
                className={"pill" + (filterRiwayat === p.k ? " active" : "")}
                onClick={() => setFilterRiwayat(p.k)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {riwayatRekonsiliasi.length === 0 ? (
          <div className="empty-state small">
            <Scale size={22} />
            <p>Belum ada rekonsiliasi pada periode ini.</p>
          </div>
        ) : (
          <div className="rekon-riwayat-list">
            {riwayatRekonsiliasi.map((r) => (
              <button
                key={r.tgl}
                className="rekon-riwayat-row"
                onClick={() => setEditTanggal(r.tgl)}
              >
                <span className="rekon-riwayat-tgl">
                  {new Date(r.tgl + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
                </span>
                <span
                  className={"rekon-status-badge" + (r.cocok ? " cocok" : " tidak-cocok")}
                  title={r.cocok ? "Semua metode bayar cocok" : `Selisih total ${formatRupiah(Math.abs(r.selisihTotal))}`}
                >
                  {r.cocok ? <CheckCircle2 size={13} /> : <MinusCircle size={13} />}
                  {r.cocok ? "Cocok" : "Tidak Cocok"}
                </span>
                <span className="rekon-riwayat-total">{formatRupiah(r.totalAktualR)}</span>
                {r.catatan && <span className="rekon-riwayat-catatan">{r.catatan}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {editTanggal && (
        <EditRekonsiliasiModal
          tgl={editTanggal}
          dataAwal={rekonsiliasi[editTanggal]}
          tercatatSistem={hitungTercatatSistemUntukTanggal(orders, editTanggal)}
          onClose={() => setEditTanggal(null)}
          onSimpan={async (dataBaru) => {
            const next = { ...rekonsiliasi, [editTanggal]: dataBaru };
            await persistRekonsiliasi(next);
            showToast("Rekonsiliasi diperbarui", "ok");
            setEditTanggal(null);
          }}
          onHapus={async () => {
            const next = { ...rekonsiliasi };
            delete next[editTanggal];
            await persistRekonsiliasi(next);
            showToast("Rekonsiliasi dihapus", "ok");
            setEditTanggal(null);
          }}
        />
      )}
    </div>
  );
}

function EditRekonsiliasiModal({ tgl, dataAwal, tercatatSistem, onClose, onSimpan, onHapus }) {
  const [tunaiInput, setTunaiInput] = useState(dataAwal ? String(dataAwal.tunaiAktual) : "");
  const [kartuInput, setKartuInput] = useState(dataAwal ? String(dataAwal.kartuAktual) : "");
  const [qrisInput, setQrisInput] = useState(dataAwal ? String(dataAwal.qrisAktual) : "");
  const [catatan, setCatatan] = useState(dataAwal?.catatan || "");
  const [menyimpan, setMenyimpan] = useState(false);
  const [konfirmHapus, setKonfirmHapus] = useState(false);

  const tunaiAktual = Number(tunaiInput || 0);
  const kartuAktual = Number(kartuInput || 0);
  const qrisAktual = Number(qrisInput || 0);

  const selisih = {
    tunai: tunaiAktual - tercatatSistem.tunai,
    kartu: kartuAktual - tercatatSistem.kartu,
    qris: qrisAktual - tercatatSistem.qris,
    totalSemua: (tunaiAktual + kartuAktual + qrisAktual) - tercatatSistem.totalSemua,
  };
  const semuaCocok = selisih.tunai === 0 && selisih.kartu === 0 && selisih.qris === 0;

  const handleSimpan = async () => {
    setMenyimpan(true);
    await onSimpan({
      tunaiAktual,
      kartuAktual,
      qrisAktual,
      catatan: catatan.trim(),
      disimpanPada: new Date().toISOString(),
    });
    setMenyimpan(false);
  };

  const labelTgl = new Date(tgl + "T00:00:00").toLocaleDateString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Rekonsiliasi — {labelTgl}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="rekon-baris-readonly">
            <span>Tercatat sistem (Tunai/Kartu/QRIS)</span>
            <strong>
              {formatRupiah(tercatatSistem.tunai)} / {formatRupiah(tercatatSistem.kartu)} / {formatRupiah(tercatatSistem.qris)}
            </strong>
          </div>

          <div className="rekon-input-field" style={{ marginTop: 14 }}>
            <label>Tunai</label>
            <input
              type="number"
              placeholder="0"
              value={tunaiInput}
              onChange={(e) => setTunaiInput(e.target.value)}
              autoFocus
            />
          </div>
          <div className="rekon-input-field">
            <label>Kartu</label>
            <input
              type="number"
              placeholder="0"
              value={kartuInput}
              onChange={(e) => setKartuInput(e.target.value)}
            />
          </div>
          <div className="rekon-input-field">
            <label>QRIS</label>
            <input
              type="number"
              placeholder="0"
              value={qrisInput}
              onChange={(e) => setQrisInput(e.target.value)}
            />
          </div>
          <div className="rekon-input-field">
            <label>Catatan (opsional)</label>
            <input
              type="text"
              placeholder="Misal: selisih karena kembalian kurang"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>

          <div className={"rekon-status-akhir" + (semuaCocok ? " cocok" : " tidak-cocok")}>
            {semuaCocok ? (
              <><CheckCircle2 size={16} /> Semua cocok</>
            ) : (
              <>
                {selisih.totalSemua >= 0 ? <PlusCircle size={16} /> : <MinusCircle size={16} />}
                Total selisih {formatRupiah(Math.abs(selisih.totalSemua))}
                {selisih.totalSemua >= 0 ? " (lebih)" : " (kurang)"}
              </>
            )}
          </div>

          {konfirmHapus && (
            <p className="form-error" style={{ marginTop: 10 }}>
              Yakin ingin menghapus rekonsiliasi tanggal ini? Tindakan ini tidak bisa dibatalkan.
            </p>
          )}
        </div>
        <div className="modal-footer">
          {konfirmHapus ? (
            <>
              <button className="btn-secondary" onClick={() => setKonfirmHapus(false)}>Batal</button>
              <button className="btn-danger" onClick={onHapus}>Ya, Hapus</button>
            </>
          ) : (
            <>
              <button className="btn-secondary" onClick={() => setKonfirmHapus(true)}>
                <Trash2 size={15} /> Hapus
              </button>
              <button className="btn-primary" onClick={handleSimpan} disabled={menyimpan}>
                <Save size={16} /> {menyimpan ? "Menyimpan…" : "Simpan Perubahan"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SelisihBaris({ label, nilai }) {
  const cocok = nilai === 0;
  return (
    <div className={"rekon-selisih-baris" + (cocok ? "" : nilai > 0 ? " lebih" : " kurang")}>
      <span>{label}</span>
      <strong>
        {cocok ? "Cocok" : `${nilai > 0 ? "+" : ""}${formatRupiah(nilai)}`}
      </strong>
    </div>
  );
}

/* ============================================================
   STYLES
============================================================ */

const baseStyles = `
:root {
  --kopi-900: #2B1B12;
  --kopi-700: #4A2F1F;
  --kopi-500: #7C5236;
  --krem-100: #FBF6EE;
  --krem-200: #F3E8D8;
  --krem-300: #E8D9C2;
  --pucuk-500: #5C7A52;
  --pucuk-600: #4A6442;
  --terracotta-500: #C1592F;
  --merah-500: #C1452F;
  --teks-utama: #2B1B12;
  --teks-redup: #7A6A58;
  --border-soft: #E5D8C5;
  --radius-md: 10px;
  --radius-lg: 16px;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
}

* { box-sizing: border-box; }

html, body, #root {
  height: 100%;
  margin: 0;
  padding: 0;
}
body {
  overflow: hidden;
}

.pos-root {
  display: flex;
  width: 100%;
  height: 100vh;
  background: var(--krem-100);
  color: var(--teks-utama);
  overflow: hidden;
}

.pos-loading {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px;
  color: var(--teks-redup);
}
.spin-soft { animation: spin 1.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ---------- SIDEBAR ---------- */
.pos-sidebar {
  width: 168px;
  flex-shrink: 0;
  background: var(--kopi-900);
  color: var(--krem-200);
  padding: 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.pos-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 15px;
  color: var(--krem-100);
  padding: 0 6px;
}
.pos-navitems { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.pos-conn-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #8FB386;
  padding: 6px 8px;
}
.pos-conn-status.offline { color: #E0A88A; }
.pos-logout-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 1px solid rgba(255,255,255,0.12);
  color: var(--krem-200);
  opacity: 0.8;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 6px;
}
.pos-logout-btn:hover { opacity: 1; background: rgba(255,255,255,0.06); }
.pos-navbtn {
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  color: var(--krem-200);
  opacity: 0.75;
  padding: 10px 10px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, opacity 0.15s;
}
.pos-navbtn:hover { background: rgba(255,255,255,0.06); opacity: 1; }
.pos-navbtn.active {
  background: var(--terracotta-500);
  color: white;
  opacity: 1;
}

/* ---------- MAIN ---------- */
.pos-main { flex: 1; min-width: 0; display: flex; flex-direction: column; height: 100%; overflow-y: auto; }

.view-pad { padding: 24px 28px; }
.view-header { margin-bottom: 18px; }
.view-header h2 { margin: 0 0 4px; font-size: 20px; font-weight: 700; }
.view-header p { margin: 0; color: var(--teks-redup); font-size: 13.5px; }
.view-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

/* ---------- KASIR LAYOUT ---------- */
.kasir-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  height: 100%;
  min-height: 600px;
}
.kasir-menu-col {
  padding: 20px 20px 20px 24px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--border-soft);
}
.kasir-toolbar { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 9px 12px;
  color: var(--teks-redup);
}
.search-box input {
  border: none;
  outline: none;
  font-size: 13.5px;
  width: 100%;
  background: transparent;
  color: var(--teks-utama);
}

.kategori-pills, .periode-pills { display: flex; gap: 6px; flex-wrap: wrap; }

.laporan-header-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}
.btn-export-excel {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--pucuk-500);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.btn-export-excel:hover:not(:disabled) { background: var(--pucuk-600); }
.btn-export-excel:disabled { background: var(--border-soft); color: var(--teks-redup); cursor: not-allowed; }

.date-range-box {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  background: white;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  margin-bottom: 18px;
}
.date-range-field { display: flex; flex-direction: column; gap: 5px; }
.date-range-field label {
  font-size: 11.5px; font-weight: 600; color: var(--teks-redup);
}
.date-range-field input[type="date"] {
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--teks-utama);
  background: var(--krem-100);
}
.date-range-sep { color: var(--teks-redup); font-weight: 700; padding-bottom: 8px; }
.date-range-error { margin-top: 0; padding-bottom: 6px; }
.pill {
  border: 1px solid var(--border-soft);
  background: white;
  color: var(--teks-redup);
  padding: 6px 13px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.pill.active { background: var(--kopi-700); color: white; border-color: var(--kopi-700); }
.pill:hover:not(.active) { border-color: var(--kopi-500); }

.menu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  overflow-y: auto;
  padding-bottom: 8px;
}
.menu-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  background: white;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 13px 14px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, transform 0.1s;
}
.menu-card:hover { border-color: var(--terracotta-500); transform: translateY(-1px); }
.menu-card-kategori {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--pucuk-600);
}
.menu-card-nama { font-size: 14px; font-weight: 600; color: var(--teks-utama); }
.menu-card-harga { font-size: 13px; font-weight: 700; color: var(--terracotta-500); margin-top: 2px; }

/* ---------- ORDER COLUMN ---------- */
.kasir-order-col {
  display: flex;
  flex-direction: column;
  background: var(--krem-200);
  min-width: 0;
}
.order-header {
  padding: 18px 18px 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid var(--border-soft);
}
.order-header h3 { margin: 0 0 6px; font-size: 15px; font-weight: 700; }
.order-tag {
  display: inline-block;
  background: var(--pucuk-500);
  color: white;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
}
.order-tag-bawa { background: var(--kopi-500); }
.order-tag-empty { font-size: 12px; color: var(--teks-redup); }
.order-tag-siap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--pucuk-500);
  color: white;
  font-size: 10.5px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  margin-left: 6px;
}
.link-btn {
  background: none;
  border: none;
  color: var(--terracotta-500);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  white-space: nowrap;
}

.order-items {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.proses-dapur-box {
  border: 1px solid #E0A05A;
  background: #FCF0E1;
  border-radius: var(--radius-md);
  padding: 12px;
  margin-bottom: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.proses-dapur-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #B5762E;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.proses-dapur-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12.5px;
}
.proses-dapur-item-info { display: flex; flex-direction: column; gap: 2px; }
.proses-dapur-item-id { font-weight: 700; color: var(--teks-utama); }
.proses-dapur-item-progress { font-size: 11px; color: var(--teks-redup); }
.proses-dapur-item-total { font-weight: 700; }
.proses-dapur-hint {
  font-size: 11px;
  color: #8A5A22;
  margin: 2px 0 0;
  line-height: 1.4;
}
.order-item {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: 8px;
  background: white;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 9px 10px;
}
.order-item-info { display: flex; flex-direction: column; min-width: 0; }
.order-item-nama { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.order-item-harga { font-size: 11px; color: var(--teks-redup); }
.order-item-dapur-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  margin-left: 6px;
  vertical-align: middle;
}
.order-item-dapur-badge.siap { background: var(--pucuk-500); color: white; }
.order-item-dapur-badge.diproses { background: #E0A05A; color: white; }
.qty-ctl { display: flex; align-items: center; gap: 6px; }
.qty-ctl button {
  width: 22px; height: 22px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--krem-100);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.qty-ctl span { font-size: 13px; font-weight: 700; min-width: 16px; text-align: center; }
.order-item-subtotal { font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.icon-btn-danger {
  background: none; border: none; color: var(--merah-500); cursor: pointer;
  display: flex; align-items: center; padding: 2px;
}

.order-footer { padding: 14px 18px; border-top: 1px solid var(--border-soft); background: var(--krem-100); }
.order-total-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.order-total-row span:first-child { font-size: 13px; color: var(--teks-redup); font-weight: 600; }
.order-total-amount { font-size: 22px; font-weight: 800; color: var(--kopi-900); }
.order-actions { display: flex; gap: 8px; }

/* ---------- BUTTONS ---------- */
.btn-primary, .btn-secondary, .btn-danger {
  border-radius: var(--radius-md);
  padding: 10px 16px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: opacity 0.15s, transform 0.1s;
}
.btn-primary { background: var(--terracotta-500); color: white; flex: 1; }
.btn-primary:hover:not(:disabled) { opacity: 0.92; }
.btn-primary:disabled { background: var(--border-soft); color: var(--teks-redup); cursor: not-allowed; }
.btn-secondary { background: white; color: var(--teks-utama); border: 1px solid var(--border-soft); flex: 1; }
.btn-secondary:hover:not(:disabled) { border-color: var(--kopi-500); }
.btn-secondary:disabled { color: var(--teks-redup); opacity: 0.5; cursor: not-allowed; }
.btn-danger { background: var(--merah-500); color: white; }

/* ---------- EMPTY STATES ---------- */
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 40px 20px; color: var(--teks-redup); text-align: center;
  grid-column: 1 / -1;
}
.empty-state.small { padding: 24px 12px; }
.empty-state p { margin: 0; font-size: 13px; }

/* ---------- MODAL ---------- */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(43,27,18,0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 50; padding: 20px;
}
.modal-card {
  background: white; border-radius: var(--radius-lg);
  width: 100%; max-width: 420px; max-height: 85vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 20px 50px rgba(43,27,18,0.25);
}
.modal-card-small { max-width: 360px; }
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 18px; border-bottom: 1px solid var(--border-soft);
}
.modal-header h3 { margin: 0; font-size: 15.5px; font-weight: 700; }
.modal-body { padding: 16px 18px; overflow-y: auto; }
.modal-body p { font-size: 13.5px; color: var(--teks-redup); line-height: 1.5; margin: 0; }
.modal-footer {
  display: flex; gap: 8px; padding: 14px 18px;
  border-top: 1px solid var(--border-soft);
}
.icon-btn {
  background: var(--krem-200); border: none; border-radius: 8px;
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--teks-utama);
}

/* meja pick */
.meja-pick-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.meja-pick {
  display: flex; flex-direction: column; gap: 3px; align-items: center;
  padding: 14px 8px; border-radius: var(--radius-md); border: 1px solid var(--border-soft);
  background: var(--krem-100); font-size: 13px; font-weight: 700; cursor: pointer;
}
.meja-pick:hover:not(:disabled) { border-color: var(--terracotta-500); }
.meja-pick.terisi { opacity: 0.45; cursor: not-allowed; }
.meja-pick-nomor { font-size: 13px; font-weight: 700; color: var(--teks-utama); }
.meja-pick-bangku {
  display: flex; align-items: center; gap: 3px;
  font-size: 10.5px; font-weight: 600; color: var(--teks-redup); text-transform: none;
}
.meja-pick-status-terisi {
  font-size: 10.5px; font-weight: 600; color: var(--merah-500); text-transform: uppercase;
}

/* bayar */
.bayar-total { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
.bayar-total span { font-size: 13px; color: var(--teks-redup); font-weight: 600; }
.bayar-total strong { font-size: 20px; font-weight: 800; color: var(--kopi-900); }
.metode-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
.metode-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 12px 6px; border-radius: var(--radius-md); border: 1px solid var(--border-soft);
  background: var(--krem-100); font-size: 12px; font-weight: 600; cursor: pointer;
}
.metode-btn.active { border-color: var(--terracotta-500); background: #FCEFE6; color: var(--terracotta-500); }
.tunai-area label { font-size: 12.5px; font-weight: 600; color: var(--teks-redup); display: block; margin-bottom: 6px; }
.tunai-area input {
  width: 100%; padding: 10px 12px; border-radius: var(--radius-md);
  border: 1px solid var(--border-soft); font-size: 15px; font-weight: 700; margin-bottom: 10px;
}
.uang-cepat { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
.uang-cepat button {
  border: 1px solid var(--border-soft); background: white; padding: 6px 10px;
  border-radius: 999px; font-size: 11.5px; font-weight: 600; cursor: pointer;
}
.kembalian-row { display: flex; justify-content: space-between; align-items: baseline; padding-top: 8px; border-top: 1px dashed var(--border-soft); }
.kembalian-row span { font-size: 13px; color: var(--teks-redup); font-weight: 600; }
.kembalian-row strong { font-size: 17px; font-weight: 800; color: var(--pucuk-600); }
.kembalian-row strong.negatif { color: var(--merah-500); }

/* ---------- DAPUR VIEW ---------- */
.dapur-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.dapur-card {
  background: white;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dapur-card.siap { border-color: var(--pucuk-500); background: #F2F8EF; }
.dapur-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.dapur-card-id { display: flex; flex-direction: column; gap: 2px; }
.dapur-id-besar { font-size: 15px; font-weight: 800; color: var(--kopi-900); }
.dapur-tipe {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--teks-redup);
}
.dapur-waktu {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--teks-redup);
  background: var(--krem-200);
  padding: 4px 9px;
  border-radius: 999px;
}
.dapur-items { display: flex; flex-direction: column; gap: 6px; }
.dapur-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  padding: 9px 10px;
  background: var(--krem-100);
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  transition: all 0.12s;
}
.dapur-item-qty { font-weight: 700; color: var(--teks-redup); flex-shrink: 0; }
.dapur-item-nama { flex: 1; font-weight: 600; color: var(--teks-utama); }
.dapur-item-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  padding: 3px 8px;
  border-radius: 999px;
}
.dapur-item-menunggu { border-color: var(--border-soft); }
.dapur-item-menunggu .dapur-item-status { background: var(--krem-200); color: var(--teks-redup); }
.dapur-item-diproses { background: #FCF0E1; border-color: #E0A05A; }
.dapur-item-diproses .dapur-item-status { background: #E0A05A; color: white; }
.dapur-item-siap { background: #EAF4E6; border-color: var(--pucuk-500); }
.dapur-item-siap .dapur-item-status { background: var(--pucuk-500); color: white; }
.dapur-card-footer { margin-top: 2px; }
.dapur-tandai-btn {
  width: 100%;
  background: var(--kopi-700);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 9px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
.dapur-tandai-btn:hover { opacity: 0.9; }
.dapur-siap-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  background: var(--pucuk-500);
  color: white;
  border-radius: 8px;
  padding: 9px;
  font-size: 12.5px;
  font-weight: 700;
}

/* ---------- MEJA VIEW ---------- */
.meja-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.meja-card-wrap { position: relative; }
.meja-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 5px;
  padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-soft);
  cursor: pointer; text-align: left; width: 100%;
}
.meja-card.kosong { background: white; cursor: default; }
.meja-card.terisi { background: #FCEFE6; border-color: var(--terracotta-500); }
.meja-card-nomor { font-size: 15px; font-weight: 700; }
.meja-card-status { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--teks-redup); }
.meja-card.terisi .meja-card-status { color: var(--terracotta-500); }
.meja-card-total { font-size: 13px; font-weight: 700; color: var(--kopi-900); margin-top: 4px; }
.meja-card-bangku {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; color: var(--teks-redup);
}
.meja-card-aksi {
  position: absolute; top: 8px; right: 8px;
  display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s;
}
.meja-card-aksi-btn {
  width: 22px; height: 22px; border-radius: 6px;
  background: white; border: 1px solid var(--border-soft);
  color: var(--teks-redup); display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.meja-card-aksi-btn:hover { border-color: var(--terracotta-500); color: var(--terracotta-500); }
.meja-card-aksi-btn-hapus { color: var(--merah-500); }
.meja-card-aksi-btn-hapus:hover { background: #F1E2DC; border-color: var(--merah-500); color: var(--merah-500); }
.meja-card-wrap:hover .meja-card-aksi { opacity: 1; }
@media (hover: none) {
  /* perangkat touch (tablet/HP) tidak punya hover, jadi tombol selalu terlihat */
  .meja-card-aksi { opacity: 1; }
}

.detail-meja-items { display: flex; flex-direction: column; gap: 8px; }
.detail-meja-item { display: flex; justify-content: space-between; font-size: 13.5px; }
.status-dapur-mini {
  display: inline-block;
  margin-left: 8px;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  text-transform: uppercase;
}
.status-dapur-mini-menunggu { background: var(--krem-200); color: var(--teks-redup); }
.status-dapur-mini-diproses { background: #E0A05A; color: white; }
.status-dapur-mini-siap { background: var(--pucuk-500); color: white; }
.hint-text { font-size: 12.5px; margin-top: 14px; padding: 10px; background: var(--krem-200); border-radius: 8px; }

/* ---------- MENU VIEW (CRUD) ---------- */
.menu-table { border: 1px solid var(--border-soft); border-radius: var(--radius-md); overflow: hidden; background: white; }
.menu-table-head, .menu-table-row {
  display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 70px; gap: 8px; align-items: center;
  padding: 11px 16px;
}
.menu-table-head { background: var(--krem-200); font-size: 11.5px; font-weight: 700; text-transform: uppercase; color: var(--teks-redup); letter-spacing: 0.03em; }
.menu-table-row { border-top: 1px solid var(--border-soft); font-size: 13.5px; }
.cell-nama { font-weight: 600; }
.badge-kategori {
  background: var(--krem-200); color: var(--pucuk-600); font-size: 11px; font-weight: 700;
  padding: 3px 9px; border-radius: 999px;
}
.status-toggle {
  border: none; border-radius: 999px; padding: 4px 11px; font-size: 11.5px; font-weight: 700; cursor: pointer;
}
.status-toggle.on { background: #E3EEDD; color: var(--pucuk-600); }
.status-toggle.off { background: #F1E2DC; color: var(--merah-500); }
.row-actions { display: flex; gap: 6px; justify-content: flex-end; }
.icon-btn { color: var(--teks-redup); }

.form-field { margin-bottom: 14px; }
.form-field label { display: block; font-size: 12.5px; font-weight: 600; color: var(--teks-redup); margin-bottom: 6px; }
.form-field input, .form-field select {
  width: 100%; padding: 9px 12px; border-radius: var(--radius-md);
  border: 1px solid var(--border-soft); font-size: 14px; background: white; color: var(--teks-utama);
}
.form-error { color: var(--merah-500); font-size: 12.5px; margin-top: -4px; }

/* ---------- LAPORAN VIEW ---------- */
.stat-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 22px; }
.stat-card {
  display: flex; align-items: center; gap: 12px;
  background: white; border: 1px solid var(--border-soft); border-radius: var(--radius-md);
  padding: 16px;
}
.stat-icon {
  width: 38px; height: 38px; border-radius: 10px; background: var(--krem-200);
  display: flex; align-items: center; justify-content: center; color: var(--terracotta-500); flex-shrink: 0;
}
.stat-label { display: block; font-size: 11.5px; color: var(--teks-redup); font-weight: 600; margin-bottom: 3px; }
.stat-value { display: block; font-size: 18px; font-weight: 800; color: var(--kopi-900); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.badge-perbandingan {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
}
.badge-perbandingan.naik { background: #E3EEDD; color: var(--pucuk-600); }
.badge-perbandingan.turun { background: #F1E2DC; color: var(--merah-500); }
.perbandingan-note {
  font-size: 12px;
  color: var(--teks-redup);
  margin: -10px 0 18px;
}

.laporan-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.laporan-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 16px; }
.laporan-panel { background: white; border: 1px solid var(--border-soft); border-radius: var(--radius-md); padding: 16px; }
.laporan-panel h3 { margin: 0 0 14px; font-size: 14px; font-weight: 700; }
.laporan-panel-chart { margin-bottom: 16px; }
.chart-wrap { width: 100%; }
.chart-tooltip {
  background: var(--kopi-900);
  color: white;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 12px;
  box-shadow: 0 8px 20px rgba(0,0,0,0.2);
}
.chart-tooltip-tgl { font-weight: 700; margin-bottom: 5px; }
.chart-tooltip-row { display: flex; justify-content: space-between; gap: 14px; }
.chart-tooltip-row strong { font-weight: 700; }

.bar-list { display: flex; flex-direction: column; gap: 10px; }
.bar-row { display: grid; grid-template-columns: 110px 1fr auto; align-items: center; gap: 10px; }
.bar-label { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar-track { height: 8px; background: var(--krem-200); border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--terracotta-500); border-radius: 999px; }
.bar-fill-pucuk { background: var(--pucuk-500); }
.bar-value { font-size: 11.5px; color: var(--teks-redup); white-space: nowrap; }

.riwayat-list { display: flex; flex-direction: column; gap: 8px; max-height: 360px; overflow-y: auto; }
.riwayat-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 10px; border-radius: 8px; background: var(--krem-100);
}
.riwayat-info-clickable {
  display: flex; justify-content: space-between; align-items: center;
  flex: 1; gap: 10px; background: none; border: none; cursor: pointer;
  padding: 0; text-align: left; border-radius: 6px;
}
.riwayat-info-clickable:hover { opacity: 0.75; }
.riwayat-info { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.riwayat-waktu { font-weight: 700; color: var(--kopi-700); }
.riwayat-tipe, .riwayat-metode {
  background: var(--krem-200); padding: 2px 8px; border-radius: 999px; font-weight: 600; color: var(--teks-redup); text-transform: capitalize;
}
.riwayat-total { font-weight: 700; font-size: 13px; }
.detail-transaksi-meta {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12.5px; color: var(--teks-redup); margin-bottom: 12px;
}
.detail-transaksi-bayar {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12.5px; color: var(--teks-redup); margin-top: 8px;
}
.riwayat-cetak-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 7px;
  border: 1px solid var(--border-soft); background: white;
  color: var(--teks-redup); cursor: pointer; flex-shrink: 0;
}
.riwayat-cetak-btn:hover { color: var(--terracotta-500); border-color: var(--terracotta-500); }
.riwayat-row { gap: 8px; }

/* ---------- TOAST ---------- */
.pos-toast {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: var(--kopi-900); color: white; padding: 10px 18px;
  border-radius: 999px; font-size: 13px; font-weight: 600;
  display: flex; align-items: center; gap: 8px; z-index: 100;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  animation: toast-in 0.2s ease-out;
}
.pos-toast-error { background: var(--merah-500); }
@keyframes toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

/* ---------- KELOLA USER VIEW ---------- */
.user-table { border: 1px solid var(--border-soft); border-radius: var(--radius-md); overflow: hidden; background: white; }
.user-table-head, .user-table-row {
  display: grid; grid-template-columns: 1.6fr 1fr 2fr 70px; gap: 8px; align-items: center;
  padding: 11px 16px;
}
.user-table-head { background: var(--krem-200); font-size: 11.5px; font-weight: 700; text-transform: uppercase; color: var(--teks-redup); letter-spacing: 0.03em; }
.user-table-row { border-top: 1px solid var(--border-soft); font-size: 13.5px; }
.cell-email { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.badge-diri-sendiri {
  background: var(--krem-200); color: var(--teks-redup); font-size: 10px; font-weight: 700;
  padding: 2px 7px; border-radius: 999px; text-transform: uppercase;
}
.badge-role {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px;
  background: var(--krem-200); color: var(--teks-redup);
}
.badge-role.admin { background: #FCEFE6; color: var(--terracotta-500); }
.cell-akses-tab { display: flex; gap: 4px; flex-wrap: wrap; }
.badge-tab-mini {
  font-size: 10.5px; font-weight: 600; padding: 2px 7px; border-radius: 999px;
  background: var(--krem-200); color: var(--teks-redup);
}
.akses-tab-semua { font-size: 12px; font-weight: 600; color: var(--pucuk-600); }
.akses-tab-kosong { font-size: 12px; font-style: italic; color: var(--teks-redup); }
.login-input-wrap-inline {
  display: flex; align-items: center; gap: 8px;
  border: 1px solid var(--border-soft); border-radius: 10px;
  padding: 9px 12px; background: var(--krem-100); color: var(--teks-redup);
}
.login-input-wrap-inline input {
  border: none; outline: none; background: transparent;
  font-size: 14px; color: var(--teks-utama); width: 100%;
}
.role-pick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.role-pick-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px; border-radius: var(--radius-md); border: 1px solid var(--border-soft);
  background: var(--krem-100); font-size: 13px; font-weight: 600; cursor: pointer;
}
.role-pick-btn.active { border-color: var(--terracotta-500); background: #FCEFE6; color: var(--terracotta-500); }
.akses-tab-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.akses-tab-checkbox {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 10px; border-radius: 8px; border: 1px solid var(--border-soft);
  background: var(--krem-100); font-size: 13px; font-weight: 600; cursor: pointer;
}
.akses-tab-checkbox input { width: 15px; height: 15px; cursor: pointer; }

/* ---------- REKONSILIASI VIEW ---------- */
.rekon-tgl-pick { display: flex; flex-direction: column; gap: 5px; }
.rekon-tgl-pick label { font-size: 11.5px; font-weight: 600; color: var(--teks-redup); }
.rekon-tgl-pick input[type="date"] {
  border: 1px solid var(--border-soft); border-radius: 8px; padding: 8px 12px;
  font-size: 13px; color: var(--teks-utama); background: white;
}
.rekon-grid {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px;
}
.rekon-baris-readonly {
  display: flex; justify-content: space-between; align-items: center;
  padding: 9px 0; font-size: 13.5px; color: var(--teks-redup);
  border-bottom: 1px solid var(--border-soft);
}
.rekon-baris-readonly strong { color: var(--teks-utama); font-weight: 700; }
.rekon-baris-readonly.rekon-total { border-bottom: none; margin-top: 4px; font-weight: 700; }
.rekon-baris-readonly.rekon-total strong { font-size: 15px; color: var(--kopi-900); }
.rekon-input-field { margin-bottom: 12px; }
.rekon-input-field label {
  display: block; font-size: 12px; font-weight: 600; color: var(--teks-redup); margin-bottom: 5px;
}
.rekon-input-field input {
  width: 100%; padding: 9px 12px; border-radius: 8px;
  border: 1px solid var(--border-soft); font-size: 14px; color: var(--teks-utama); background: var(--krem-100);
}
.rekon-selisih-baris {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 0; font-size: 13.5px; color: var(--teks-redup);
  border-bottom: 1px solid var(--border-soft);
}
.rekon-selisih-baris strong { font-weight: 700; color: var(--teks-utama); }
.rekon-selisih-baris.lebih strong { color: var(--pucuk-600); }
.rekon-selisih-baris.kurang strong { color: var(--merah-500); }
.rekon-status-akhir {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 14px; padding: 11px; border-radius: 10px; font-size: 13.5px; font-weight: 700;
}
.rekon-status-akhir.cocok { background: #E3EEDD; color: var(--pucuk-600); }
.rekon-status-akhir.tidak-cocok { background: #F1E2DC; color: var(--merah-500); }
.rekon-simpan-btn { width: 100%; margin-top: 14px; }
.rekon-tersimpan-note { font-size: 11.5px; color: var(--teks-redup); text-align: center; margin-top: 8px; }
.rekon-riwayat-header {
  display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: 10px; margin-bottom: 14px;
}
.rekon-riwayat-header h3 { margin: 0; }
.rekon-riwayat-list { display: flex; flex-direction: column; gap: 6px; }
.rekon-riwayat-row {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 12px; border-radius: 8px; background: var(--krem-100);
  border: 1px solid var(--border-soft); font-size: 12.5px; font-weight: 600;
  cursor: pointer; text-align: left;
}
.rekon-riwayat-row:hover { border-color: var(--terracotta-500); }
.rekon-riwayat-tgl { flex: 1; min-width: 140px; }
.rekon-riwayat-total { font-weight: 700; white-space: nowrap; }
.rekon-status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px;
  white-space: nowrap;
}
.rekon-status-badge.cocok { background: #E3EEDD; color: var(--pucuk-600); }
.rekon-status-badge.tidak-cocok { background: #F1E2DC; color: var(--merah-500); }
.rekon-riwayat-catatan {
  font-weight: 400; color: var(--teks-redup); font-size: 11.5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;
}

/* ---------- RESPONSIVE ---------- */
@media (max-width: 880px) {
  .pos-sidebar { width: 64px; }
  .pos-brand span { display: none; }
  .pos-navbtn span { display: none; }
  .pos-navbtn { justify-content: center; }
  .pos-logout-btn span { display: none; }
  .pos-logout-btn { justify-content: center; }
  .pos-conn-status span { display: none; }
  .pos-conn-status { justify-content: center; }
  .kasir-grid { grid-template-columns: 1fr; }
  .kasir-order-col { border-top: 1px solid var(--border-soft); }
  .laporan-grid { grid-template-columns: 1fr; }
  .laporan-grid-3 { grid-template-columns: 1fr; }
  .rekon-grid { grid-template-columns: 1fr; }
  .menu-table-head, .menu-table-row { grid-template-columns: 1.5fr 1fr 1fr 70px; }
  .menu-table-head span:nth-child(4), .menu-table-row span:nth-child(4) { display: none; }
}

/* ---------- STRUK CETAK (thermal 58mm/80mm) ---------- */
.struk-cetak {
  display: none; /* tersembunyi di layar normal, hanya tampil saat print */
}

@media print {
  /* sembunyikan seluruh isi aplikasi, tampilkan hanya struk */
  body * { visibility: hidden; }
  .struk-cetak, .struk-cetak * { visibility: visible; }
  .struk-cetak {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    width: 80mm;
    padding: 2mm 3mm;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.45;
    color: #000;
  }
  @page {
    size: 80mm auto;
    margin: 0;
  }
}

.struk-center { text-align: center; }
.struk-bold { font-weight: 700; }
.struk-besar { font-size: 13px; }
.struk-baris {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}
.struk-garis {
  border-top: 1px dashed #000;
  margin: 4px 0;
}
.struk-garis-titik {
  border-top: 1px dotted #000;
  margin: 4px 0;
}
.struk-item { margin-bottom: 2px; }
`;

/* ============================================================
   AUTH WRAPPER — komponen utama yang diekspor.
   Menampilkan LoginScreen jika belum login, atau PosApp jika sudah.
============================================================ */

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = belum dicek, null = belum login, object = sudah login

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Masih memeriksa status login awal
  if (session === undefined) {
    return (
      <div className="pos-root pos-loading">
        <Coffee size={28} className="spin-soft" />
        <p>Memeriksa sesi login…</p>
        <style>{baseStyles}</style>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <PosApp session={session} onLogout={handleLogout} />;
}
