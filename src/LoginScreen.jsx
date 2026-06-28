import React, { useState } from "react";
import { Coffee, LogIn, AlertCircle, Mail, Lock, ArrowLeft } from "lucide-react";
import { supabase } from "./supabaseClient";

export default function LoginScreen() {
  const [mode, setMode] = useState("login"); // login | lupa-password
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pesanSukses, setPesanSukses] = useState("");

  const masuk = async (e) => {
    e.preventDefault();
    setError("");
    setPesanSukses("");
    if (!email.trim() || !password) {
      setError("Email dan kata sandi wajib diisi.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (err) {
      if (err.message.toLowerCase().includes("invalid login credentials")) {
        setError("Email atau kata sandi salah.");
      } else if (err.message.toLowerCase().includes("email not confirmed")) {
        setError("Email belum dikonfirmasi. Cek kotak masuk email kamu.");
      } else {
        setError(err.message);
      }
    }
    // Jika sukses, App.jsx akan otomatis pindah ke aplikasi lewat listener auth state.
  };

  const kirimResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setPesanSukses("");
    if (!email.trim()) {
      setError("Masukkan email yang dipakai untuk login.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setPesanSukses("Tautan reset kata sandi telah dikirim ke email kamu.");
    }
  };

  return (
    <div className="login-root">
      <style>{loginStyles}</style>
      <div className="login-card">
        <div className="login-brand">
          <Coffee size={26} />
          <span>AY Cafe</span>
        </div>

        {mode === "login" ? (
          <>
            <h2>Masuk ke Kasir</h2>
            <p className="login-sub">Gunakan email dan kata sandi yang sudah dibuatkan untukmu.</p>

            <form onSubmit={masuk} className="login-form">
              <div className="login-field">
                <label>Email</label>
                <div className="login-input-wrap">
                  <Mail size={16} />
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="kasir@kedaikamu.com"
                    autoFocus
                  />
                </div>
              </div>
              <div className="login-field">
                <label>Kata Sandi</label>
                <div className="login-input-wrap">
                  <Lock size={16} />
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <p className="login-error"><AlertCircle size={14} /> {error}</p>
              )}

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? "Memeriksa…" : <><LogIn size={16} /> Masuk</>}
              </button>

              <button
                type="button"
                className="login-link"
                onClick={() => { setMode("lupa-password"); setError(""); setPesanSukses(""); }}
              >
                Lupa kata sandi?
              </button>
            </form>
          </>
        ) : (
          <>
            <h2>Reset Kata Sandi</h2>
            <p className="login-sub">Masukkan email kamu, kami kirim tautan untuk membuat kata sandi baru.</p>

            <form onSubmit={kirimResetPassword} className="login-form">
              <div className="login-field">
                <label>Email</label>
                <div className="login-input-wrap">
                  <Mail size={16} />
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="kasir@kedaikamu.com"
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <p className="login-error"><AlertCircle size={14} /> {error}</p>
              )}
              {pesanSukses && (
                <p className="login-success">{pesanSukses}</p>
              )}

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? "Mengirim…" : "Kirim Tautan Reset"}
              </button>

              <button
                type="button"
                className="login-link"
                onClick={() => { setMode("login"); setError(""); setPesanSukses(""); }}
              >
                <ArrowLeft size={13} /> Kembali ke halaman masuk
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const loginStyles = `
.login-root {
  height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FBF6EE;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  padding: 24px;
  box-sizing: border-box;
}
.login-card {
  width: 100%;
  max-width: 360px;
  background: white;
  border: 1px solid #E5D8C5;
  border-radius: 16px;
  padding: 28px 26px;
  box-shadow: 0 20px 50px rgba(43,27,18,0.08);
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #2B1B12;
  font-weight: 800;
  font-size: 16px;
  margin-bottom: 22px;
}
.login-card h2 { margin: 0 0 6px; font-size: 19px; font-weight: 700; color: #2B1B12; }
.login-sub { margin: 0 0 20px; font-size: 13px; color: #7A6A58; line-height: 1.5; }
.login-form { display: flex; flex-direction: column; gap: 14px; }
.login-field label {
  display: block; font-size: 12.5px; font-weight: 600; color: #7A6A58; margin-bottom: 6px;
}
.login-input-wrap {
  display: flex; align-items: center; gap: 8px;
  border: 1px solid #E5D8C5; border-radius: 10px;
  padding: 10px 12px; background: #FBF6EE; color: #7A6A58;
}
.login-input-wrap input {
  border: none; outline: none; background: transparent;
  font-size: 14px; color: #2B1B12; width: 100%;
}
.login-error {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: #C1452F; margin: 0;
}
.login-success {
  font-size: 12.5px; color: #4A6442; margin: 0;
  background: #E3EEDD; padding: 8px 10px; border-radius: 8px;
}
.login-btn {
  background: #C1592F; color: white; border: none; border-radius: 10px;
  padding: 11px; font-size: 14px; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin-top: 4px;
}
.login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.login-btn:hover:not(:disabled) { opacity: 0.92; }
.login-link {
  background: none; border: none; color: #C1592F; font-size: 12.5px; font-weight: 600;
  cursor: pointer; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px;
  text-decoration: underline; padding: 4px;
}
`;
