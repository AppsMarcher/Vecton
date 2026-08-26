// Supabase Edge Function: set-user-active
// Ativa/desativa o acesso de um usuário. Diferente de só marcar uma coluna
// (is_active em user_profiles, que a 117_user_profiles_is_active.sql já
// bloqueia via RLS pra sessões já abertas), aqui a gente também bane o
// usuário no GoTrue (auth.admin ban_duration) — é o que de fato impede um
// NOVO login. Exige service_role, por isso Edge Function.
//
// Deploy:
//   supabase functions deploy set-user-active --no-verify-jwt
//   (--no-verify-jwt porque validamos o token do chamador manualmente abaixo)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// GoTrue não tem "ban permanente" nativo — 100 anos é o truque padrão pra
// simular. "none" remove o ban (reativação).
const PERMANENT_BAN = "876000h";

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
      return json({ error: "Apenas administradores podem ativar/desativar usuários" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.user_id ?? "").trim();
    const isActive = body.is_active === true;
    if (!targetUserId) return json({ error: "user_id é obrigatório" }, 400);

    // Ninguém desativa a si mesmo (evita ficar trancado fora do sistema).
    if (targetUserId === userData.user.id) {
      return json({ error: "Você não pode desativar o próprio acesso." }, 400);
    }

    const admin = createClient(url, serviceKey);

    const { data: targetProfile } = await admin
      .from("user_profiles")
      .select("organization_id, access_role, email, full_name")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!targetProfile) return json({ error: "Usuário alvo não encontrado" }, 404);
    if (targetProfile.organization_id !== callerProfile.organization_id) {
      return json({ error: "Usuário alvo pertence a outra organização" }, 403);
    }
    // Só Super Admin desativa outro Admin/Super Admin (mesma regra das
    // demais ações administrativas sobre usuários neste app).
    if (["admin", "super_admin"].includes(targetProfile.access_role) && callerProfile.access_role !== "super_admin") {
      return json({ error: "Apenas Super Admin pode ativar/desativar um Admin" }, 403);
    }

    const { error: banErr } = await admin.auth.admin.updateUserById(targetUserId, {
      ban_duration: isActive ? "none" : PERMANENT_BAN,
    });
    if (banErr) return json({ error: banErr.message || "Falha ao atualizar o acesso no login" }, 400);

    const { error: updateErr } = await admin
      .from("user_profiles")
      .update({ is_active: isActive })
      .eq("organization_id", targetProfile.organization_id)
      .eq("user_id", targetUserId);
    if (updateErr) return json({ error: updateErr.message || "Falha ao atualizar o status do usuário" }, 400);

    return json({ ok: true, is_active: isActive });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
