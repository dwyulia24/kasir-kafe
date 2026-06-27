// Edge Function: create-user
// ============================================================
// Function ini berjalan di server Supabase (BUKAN di browser), sehingga
// boleh memakai SERVICE_ROLE_KEY untuk membuat user baru. Kunci itu
// disimpan sebagai secret di Supabase, TIDAK PERNAH dikirim ke browser.
//
// Hanya admin yang sudah login boleh memanggil function ini — dicek
// lewat tabel user_access sebelum melakukan apa pun.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Tidak ada token otorisasi." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Client biasa (pakai token pemanggil) untuk verifikasi siapa yang memanggil
    const supabaseCaller = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabaseCaller.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Token tidak valid." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cek apakah pemanggil adalah admin
    const { data: aksesPemanggil } = await supabaseCaller
      .from("user_access")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!aksesPemanggil || aksesPemanggil.role !== "admin") {
      return new Response(JSON.stringify({ error: "Hanya admin yang bisa menambah user." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, role, aksesTab } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email dan password wajib diisi." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Password minimal 6 karakter." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Client admin (pakai service_role) khusus untuk operasi admin
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // langsung aktif, tanpa perlu konfirmasi email
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roleFinal = role === "admin" ? "admin" : "user";
    const aksesFinal = roleFinal === "admin"
      ? ["kasir", "dapur", "meja", "menu", "laporan", "rekonsiliasi", "kelola_user"]
      : (Array.isArray(aksesTab) ? aksesTab : []);

    const { error: insertError } = await supabaseAdmin.from("user_access").insert({
      user_id: created.user.id,
      email,
      role: roleFinal,
      akses_tab: aksesFinal,
    });

    if (insertError) {
      // rollback: hapus user auth yang baru dibuat kalau insert akses gagal
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return new Response(JSON.stringify({ error: "Gagal menyimpan akses: " + insertError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: created.user.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "Terjadi kesalahan tak terduga." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
