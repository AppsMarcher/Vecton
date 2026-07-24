// Supabase Edge Function: resend-invite
// Reenvia o email de CONVITE original (auth.admin.inviteUserByEmail) para um
// usuário que já foi convidado mas ainda não definiu a senha (pending).
// Diferente de "reenviar senha" (recovery, público, feito direto no front
// via /auth/v1/recover): reenviar convite exige service_role, por isso
// precisa de Edge Function.
//
// Deploy:
//   supabase functions deploy resend-invite --no-verify-jwt
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
      return json({ error: "Apenas administradores podem reenviar convites" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.user_id ?? "").trim();
    const redirectTo = body.redirect_to ? String(body.redirect_to).trim() : null;
    if (!targetUserId) return json({ error: "user_id é obrigatório" }, 400);

    const admin = createClient(url, serviceKey);

    // Confirma que o alvo pertence à MESMA org do chamador — evita reenviar
    // convite pra usuário de outra organização.
    const { data: targetProfile } = await admin
      .from("user_profiles")
      .select("organization_id, email, access_role")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (!targetProfile || targetProfile.organization_id !== callerProfile.organization_id) {
      return json({ error: "Usuário não encontrado nesta organização" }, 404);
    }
    // Só Super Admin reenvia convite de Admin/Super Admin (mesma regra de invite-user).
    if (["admin", "super_admin"].includes(targetProfile.access_role) && callerProfile.access_role !== "super_admin") {
      return json({ error: "Apenas Super Admin pode reenviar convite de Admin/Super Admin" }, 403);
    }
    if (!targetProfile.email) return json({ error: "Usuário sem email cadastrado" }, 400);

    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      targetProfile.email,
      redirectTo ? { redirectTo } : undefined
    );
    if (inviteErr) return json({ error: inviteErr.message || "Falha ao reenviar convite" }, 400);

    return json({ ok: true, email: targetProfile.email });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
