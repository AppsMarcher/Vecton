// Supabase Edge Function: set-user-password
// Define uma nova senha para um usuário existente, sem precisar do fluxo de
// recuperação por email — o usuário já consegue logar com ela em seguida.
//
// Por que Edge Function: alterar a senha de auth de outro usuário exige a
// service_role, que NUNCA pode ir pro browser. Aqui ela roda no servidor (a
// Supabase injeta SUPABASE_SERVICE_ROLE_KEY automaticamente nas Edge
// Functions).
//
// Deploy:
//   supabase functions deploy set-user-password --no-verify-jwt
//   (--no-verify-jwt porque validamos o token do chamador manualmente abaixo)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Não autenticado" }, 401);

    // Cliente como o chamador — valida quem é e qual o papel/org dele.
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Sessão inválida" }, 401);

    const { data: callerProfile } = await caller
      .from("user_profiles")
      .select("organization_id, access_role")
      .eq("user_id", userData.user.id)
      .limit(1)
      .maybeSingle();

    if (!callerProfile) return json({ error: "Perfil do solicitante não encontrado" }, 403);
    if (!["admin", "super_admin"].includes(callerProfile.access_role)) {
      return json({ error: "Apenas administradores podem definir senha de outros usuários" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.user_id ?? "").trim();
    const newPassword = String(body.new_password ?? "");
    if (!targetUserId) return json({ error: "user_id é obrigatório" }, 400);
    if (newPassword.length < 6) return json({ error: "A senha deve ter pelo menos 6 caracteres" }, 400);

    // Cliente admin (service_role) — único que pode ler perfil de outra org e alterar auth.
    const admin = createClient(url, serviceKey);

    const { data: targetProfile } = await admin
      .from("user_profiles")
      .select("organization_id, access_role")
      .eq("user_id", targetUserId)
      .limit(1)
      .maybeSingle();

    if (!targetProfile) return json({ error: "Usuário alvo não encontrado" }, 404);
    if (targetProfile.organization_id !== callerProfile.organization_id) {
      return json({ error: "Usuário alvo pertence a outra organização" }, 403);
    }
    // Só super_admin pode alterar a senha de outro admin/super_admin.
    if (["admin", "super_admin"].includes(targetProfile.access_role) && callerProfile.access_role !== "super_admin") {
      return json({ error: "Apenas Super Admin pode alterar a senha de um Admin" }, 403);
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(targetUserId, {
      password: newPassword,
    });
    if (updateErr) return json({ error: updateErr.message || "Falha ao definir a nova senha" }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
