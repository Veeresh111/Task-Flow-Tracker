import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ error: "Server configuration missing." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Parse & Validate Payload
    const body = await req.json();
    const { token, password } = body;

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Missing or invalid activation token." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters in length." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Hash token to verify against employee_activations
    const tokenHash = await sha256(token.trim());

    const { data: activation, error: findErr } = await adminClient
      .from('employee_activations')
      .select('id, user_id, status, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (findErr) {
      return new Response(JSON.stringify({ error: `Database error: ${findErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!activation) {
      return new Response(JSON.stringify({ error: "Invalid activation token. Please check your invitation link." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. State-Machine & Expiration checks
    if (activation.status === 'Consumed' || activation.used_at) {
      return new Response(JSON.stringify({ error: "This activation link has already been used. Please proceed to login." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (activation.status === 'Revoked') {
      return new Response(JSON.stringify({ error: "This activation link has been revoked by an administrator." }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (new Date(activation.expires_at).getTime() < Date.now()) {
      await adminClient
        .from('employee_activations')
        .update({ status: 'Expired' })
        .eq('id', activation.id);

      return new Response(JSON.stringify({ error: "This activation link has expired. Please contact your HR department for a new link." }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (activation.status !== 'Active') {
      return new Response(JSON.stringify({ error: `Invalid activation state (${activation.status}).` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4. Update Supabase Auth User with new password & confirm email
    const { data: updateAuthData, error: updateAuthErr } = await adminClient.auth.admin.updateUserById(
      activation.user_id,
      {
        password: password,
        email_confirm: true
      }
    );

    if (updateAuthErr) {
      return new Response(JSON.stringify({ error: `Failed to set employee password: ${updateAuthErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 5. Authoritatively consume the activation token
    const { error: consumeErr } = await adminClient
      .from('employee_activations')
      .update({
        status: 'Consumed',
        used_at: new Date().toISOString()
      })
      .eq('id', activation.id);

    if (consumeErr) {
      console.error("Warning: Failed to mark token consumed:", consumeErr);
    }

    // 6. Ensure employee profile status is 'active'
    const { data: profile, error: profErr } = await adminClient
      .from('profiles')
      .select('id, email, name, role')
      .eq('id', activation.user_id)
      .maybeSingle();

    await adminClient
      .from('profiles')
      .update({
        employment_status: 'active',
        status: 'active',
        verification_status: 'verified'
      })
      .eq('id', activation.user_id);

    // 7. Write Audit Trail
    await adminClient
      .from('audit_log')
      .insert([{
        actor_id: activation.user_id,
        actor_role: profile?.role || 'employee',
        action: 'EMPLOYEE_ACCOUNT_ACTIVATED',
        entity_type: 'profiles',
        entity_id: activation.user_id,
        new_values: {
          activated_at: new Date().toISOString(),
          email: profile?.email,
          auth_updated: true
        }
      }]);

    return new Response(JSON.stringify({
      success: true,
      message: "Your corporate account has been successfully activated. You can now sign in.",
      email: profile?.email || updateAuthData.user?.email,
      name: profile?.name
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error during activation." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
