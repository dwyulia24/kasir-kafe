import { supabase } from "./supabaseClient";

/**
 * Layer ini meniru window.storage milik Claude artifact, tapi datanya
 * disimpan di Supabase (tabel `pos_data`) sehingga semua perangkat yang
 * membuka website yang sama akan melihat data yang sama secara real-time.
 *
 * Skema tabel (lihat README untuk SQL lengkap):
 *   pos_data (
 *     key   text primary key,
 *     value jsonb not null,
 *     updated_at timestamptz default now()
 *   )
 */

export async function loadJSON(key, fallback) {
  const { data, error } = await supabase
    .from("pos_data")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error("Gagal memuat", key, error);
    return fallback;
  }
  if (!data) return fallback;
  return data.value;
}

export async function saveJSON(key, value) {
  const { error } = await supabase
    .from("pos_data")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) {
    console.error("Gagal menyimpan", key, error);
    return false;
  }
  return true;
}

/**
 * Mendengarkan perubahan real-time pada satu key tertentu.
 * Memanggil callback(value) setiap kali ada perangkat lain yang mengubah data ini.
 * Mengembalikan fungsi unsubscribe.
 */
export function subscribeToKey(key, callback) {
  const channel = supabase
    .channel(`pos_data:${key}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "pos_data", filter: `key=eq.${key}` },
      (payload) => {
        if (payload.new && payload.new.value !== undefined) {
          callback(payload.new.value);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Mendengarkan perubahan real-time pada SELURUH baris di sebuah tabel
 * (bukan key tertentu seperti subscribeToKey). Dipakai untuk tabel seperti
 * user_access yang strukturnya beda dari pos_data. callback dipanggil
 * setiap kali ada perubahan apa pun (insert/update/delete) pada tabel itu —
 * pemanggil bertanggung jawab untuk reload datanya sendiri.
 */
export function subscribeToTable(tableName, callback) {
  const channel = supabase
    .channel(`table:${tableName}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: tableName },
      (payload) => callback(payload)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
