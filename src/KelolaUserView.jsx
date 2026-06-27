import React, { useState } from "react";
import {
  UserPlus, Trash2, X, Check, Shield, User as UserIcon, AlertCircle, Mail, Lock,
} from "lucide-react";
import { supabase } from "./supabaseClient";

const SEMUA_TAB_OPSI = [
  { key: "kasir", label: "Kasir" },
  { key: "dapur", label: "Dapur" },
  { key: "meja", label: "Meja" },
  { key: "menu", label: "Menu" },
  { key: "laporan", label: "Laporan" },
  { key: "rekonsiliasi", label: "Rekonsiliasi" },
];

async function panggilEdgeFunction(namaFunction, body) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const res = await fetch(`${supabaseUrl}/functions/v1/${namaFunction}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || "Terjadi kesalahan tak terduga.");
  }
  return json;
}

export default function KelolaUserView({ daftarUser, session, muatDaftarUser, showToast }) {
  const [showTambah, setShowTambah] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [konfirmHapus, setKonfirmHapus] = useState(null);

  const handleHapus = async (user) => {
    try {
      await panggilEdgeFunction("delete-user", { targetUserId: user.user_id });
      showToast(`User ${user.email} dihapus`, "ok");
      await muatDaftarUser();
    } catch (e) {
      showToast(e.message, "error");
    }
    setKonfirmHapus(null);
  };

  return (
    <div className="view-pad">
      <header className="view-header view-header-row">
        <div>
          <h2>Kelola User</h2>
          <p>Tambah akun kasir baru dan atur akses tab yang boleh mereka gunakan.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowTambah(true)}>
          <UserPlus size={16} /> Tambah User
        </button>
      </header>

      <div className="user-table">
        <div className="user-table-head">
          <span>Email</span>
          <span>Role</span>
          <span>Akses Tab</span>
          <span></span>
        </div>
        {daftarUser.length === 0 && (
          <div className="empty-state">
            <UserIcon size={28} />
            <p>Belum ada user yang terdaftar.</p>
          </div>
        )}
        {daftarUser.map((u) => (
          <div className="user-table-row" key={u.user_id}>
            <span className="cell-email">
              {u.email}
              {u.user_id === session.user.id && <span className="badge-diri-sendiri">Kamu</span>}
            </span>
            <span>
              <span className={"badge-role" + (u.role === "admin" ? " admin" : "")}>
                {u.role === "admin" ? <Shield size={12} /> : <UserIcon size={12} />}
                {u.role === "admin" ? "Admin" : "User"}
              </span>
            </span>
            <span className="cell-akses-tab">
              {u.role === "admin" ? (
                <span className="akses-tab-semua">Semua tab</span>
              ) : u.akses_tab && u.akses_tab.length > 0 ? (
                u.akses_tab.map((t) => (
                  <span key={t} className="badge-tab-mini">
                    {SEMUA_TAB_OPSI.find((o) => o.key === t)?.label || t}
                  </span>
                ))
              ) : (
                <span className="akses-tab-kosong">Tidak ada akses</span>
              )}
            </span>
            <span className="row-actions">
              <button className="icon-btn" onClick={() => setEditUser(u)} title="Edit akses">
                <Shield size={15} />
              </button>
              {u.user_id !== session.user.id && (
                <button
                  className="icon-btn-danger"
                  onClick={() => setKonfirmHapus(u)}
                  title="Hapus user"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {showTambah && (
        <FormUserModal
          mode="tambah"
          onClose={() => setShowTambah(false)}
          onSukses={muatDaftarUser}
          showToast={showToast}
        />
      )}

      {editUser && (
        <FormUserModal
          mode="edit"
          userAwal={editUser}
          onClose={() => setEditUser(null)}
          onSukses={muatDaftarUser}
          showToast={showToast}
        />
      )}

      {konfirmHapus && (
        <div className="modal-overlay" onClick={() => setKonfirmHapus(null)}>
          <div className="modal-card modal-card-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Hapus User?</h3>
              <button className="icon-btn" onClick={() => setKonfirmHapus(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p>
                Akun <strong>{konfirmHapus.email}</strong> akan dihapus permanen dan tidak akan
                bisa login lagi. Tindakan ini tidak bisa dibatalkan.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setKonfirmHapus(null)}>Batal</button>
              <button className="btn-danger" onClick={() => handleHapus(konfirmHapus)}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormUserModal({ mode, userAwal, onClose, onSukses, showToast }) {
  const isEdit = mode === "edit";
  const [email, setEmail] = useState(userAwal?.email || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(userAwal?.role || "user");
  const [aksesTab, setAksesTab] = useState(userAwal?.akses_tab || []);
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState("");

  const toggleTab = (key) => {
    setAksesTab((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]
    );
  };

  const submit = async () => {
    setError("");
    if (!isEdit) {
      if (!email.trim() || !password) {
        setError("Email dan password wajib diisi.");
        return;
      }
      if (password.length < 6) {
        setError("Password minimal 6 karakter.");
        return;
      }
    }
    if (role === "user" && aksesTab.length === 0) {
      setError("Pilih minimal satu tab yang boleh diakses untuk role User.");
      return;
    }

    setMenyimpan(true);
    try {
      if (isEdit) {
        const { error: updateError } = await supabase
          .from("user_access")
          .update({
            role,
            akses_tab: role === "admin" ? SEMUA_TAB_OPSI.map((o) => o.key).concat("kelola_user") : aksesTab,
            diupdate_pada: new Date().toISOString(),
          })
          .eq("user_id", userAwal.user_id);
        if (updateError) throw updateError;
        showToast(`Akses ${userAwal.email} diperbarui`, "ok");
      } else {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const res = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ email: email.trim(), password, role, aksesTab }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal membuat user.");
        showToast(`User ${email} berhasil dibuat`, "ok");
      }
      await onSukses();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? `Edit Akses — ${userAwal.email}` : "Tambah User Baru"}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {!isEdit && (
            <>
              <div className="form-field">
                <label>Email</label>
                <div className="login-input-wrap-inline">
                  <Mail size={15} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="kasir2@kedaikamu.com"
                    autoFocus
                  />
                </div>
              </div>
              <div className="form-field">
                <label>Password Awal</label>
                <div className="login-input-wrap-inline">
                  <Lock size={15} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                  />
                </div>
              </div>
            </>
          )}

          <div className="form-field">
            <label>Role</label>
            <div className="role-pick-grid">
              <button
                className={"role-pick-btn" + (role === "user" ? " active" : "")}
                onClick={() => setRole("user")}
              >
                <UserIcon size={16} /> User
              </button>
              <button
                className={"role-pick-btn" + (role === "admin" ? " active" : "")}
                onClick={() => setRole("admin")}
              >
                <Shield size={16} /> Admin
              </button>
            </div>
          </div>

          {role === "user" && (
            <div className="form-field">
              <label>Akses Tab (pilih minimal satu)</label>
              <div className="akses-tab-grid">
                {SEMUA_TAB_OPSI.map((t) => (
                  <label key={t.key} className="akses-tab-checkbox">
                    <input
                      type="checkbox"
                      checked={aksesTab.includes(t.key)}
                      onChange={() => toggleTab(t.key)}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {role === "admin" && (
            <p className="hint-text">
              Role Admin otomatis mendapat akses ke semua tab, termasuk Kelola User.
            </p>
          )}

          {error && (
            <p className="login-error"><AlertCircle size={14} /> {error}</p>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={submit} disabled={menyimpan}>
            <Check size={16} /> {menyimpan ? "Menyimpan…" : isEdit ? "Simpan Perubahan" : "Tambah User"}
          </button>
        </div>
      </div>
    </div>
  );
}
