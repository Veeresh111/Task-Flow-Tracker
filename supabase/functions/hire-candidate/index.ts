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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Authenticate and Authorize Caller (Must be HR or Admin)
    const authHeader = req.headers.get('Authorization') || '';
    const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user: callerUser }, error: callerAuthErr } = await userClient.auth.getUser(rawToken);
    if (callerAuthErr || !callerUser) {
      return new Response(JSON.stringify({ error: "401 Unauthorized: Valid session token required." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: callerProfile, error: callerProfErr } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .maybeSingle();

    const callerRole = (callerProfile?.role || "").toLowerCase();
    if (!['admin', 'hr'].includes(callerRole)) {
      return new Response(JSON.stringify({ 
        error: `403 Forbidden: Caller with role '${callerProfile?.role}' is not authorized to execute hiring operations.` 
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Parse & Validate Payload
    const body = await req.json();
    const { candidateId, applicationId, department, teamLeadId, assignedPayroll, joiningDate, origin } = body;

    if (!candidateId || !applicationId || !department || !assignedPayroll) {
      return new Response(JSON.stringify({ 
        error: "Missing mandatory hiring parameters: candidateId, applicationId, department, assignedPayroll." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const ctcNumber = Number(assignedPayroll);
    if (isNaN(ctcNumber) || ctcNumber <= 0) {
      return new Response(JSON.stringify({ error: "Assigned Annual CTC must be a positive numeric value." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. Verify Candidate & Application Exists in Authoritative DB
    const { data: candidate, error: candErr } = await adminClient
      .from('candidates')
      .select('*')
      .eq('id', candidateId)
      .maybeSingle();

    if (candErr || !candidate) {
      return new Response(JSON.stringify({ error: "Target candidate record does not exist." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!candidate.email) {
      return new Response(JSON.stringify({ error: "Candidate has no registered email address for employee provisioning." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: application, error: appErr } = await adminClient
      .from('job_applications')
      .select('id, form_id, status')
      .eq('id', applicationId)
      .maybeSingle();

    if (appErr || !application) {
      return new Response(JSON.stringify({ error: "Target job application record does not exist." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4. Idempotency Guard: Check if already hired or in progress
    const { data: existingOp } = await adminClient
      .from('candidate_hiring_operations')
      .select('*')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (existingOp && existingOp.status === 'completed') {
      return new Response(JSON.stringify({
        success: true,
        message: "Candidate hiring operation has already completed successfully.",
        employeeId: existingOp.auth_user_id,
        emailQueued: true
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Create or claim hiring operation row in DB
    let hiringOpId = existingOp?.id;
    if (!existingOp) {
      const { data: newOp, error: opErr } = await adminClient
        .from('candidate_hiring_operations')
        .insert([{
          candidate_id: candidateId,
          application_id: applicationId,
          department,
          team_lead_id: teamLeadId || null,
          annual_ctc: ctcNumber,
          joining_date: joiningDate || null,
          hired_by: callerUser.id,
          status: 'processing'
        }])
        .select('id')
        .single();

      if (opErr) throw opErr;
      hiringOpId = newOp.id;
    }

    // 5. Supabase Auth Admin: Provision or link Auth User
    let authUserId: string;
    const cleanEmail = candidate.email.trim().toLowerCase();

    // Check if user already exists in profiles or auth
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id, role')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingProfile) {
      // Security Guard: Ensure existing profile belongs to this candidate or is not bound to a different candidate
      if (existingProfile.candidate_id && existingProfile.candidate_id !== candidateId) {
        return new Response(JSON.stringify({ 
          error: "409 Conflict: This email address is already bound to another registered candidate profile." 
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      authUserId = existingProfile.id;
    } else {
      // Create new user in Supabase Auth Admin
      const tempPassword = `Temp-${crypto.randomUUID()}`;
      const { data: newAuthData, error: createAuthErr } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          name: candidate.full_name,
          registered_role: 'employee'
        }
      });

      if (createAuthErr) {
        // If user already exists in auth.users, fetch by email and verify ownership
        const { data: usersData } = await adminClient.auth.admin.listUsers();
        const found = usersData?.users?.find(u => u.email?.toLowerCase() === cleanEmail);
        if (found) {
          const { data: foreignProfile } = await adminClient
            .from('profiles')
            .select('id, candidate_id')
            .eq('id', found.id)
            .maybeSingle();

          if (foreignProfile && foreignProfile.candidate_id && foreignProfile.candidate_id !== candidateId) {
            await adminClient
              .from('candidate_hiring_operations')
              .update({ status: 'failed', failure_reason: 'Auth account already bound to another candidate profile.' })
              .eq('id', hiringOpId);

            return new Response(JSON.stringify({
              error: "409 Conflict: Existing auth identity belongs to another candidate profile."
            }), {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          authUserId = found.id;
        } else {
          await adminClient
            .from('candidate_hiring_operations')
            .update({ status: 'failed', failure_reason: createAuthErr.message })
            .eq('id', hiringOpId);

          throw new Error(`Failed to provision Supabase Auth account: ${createAuthErr.message}`);
        }
      } else {
        authUserId = newAuthData.user.id;
      }
    }

    // 6. Update or Create authoritative Employee Profile in `profiles`
    const employeeCode = `EMP-${authUserId.substring(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const profilePayload = {
      id: authUserId,
      name: candidate.full_name,
      email: cleanEmail,
      role: 'employee',
      department,
      team_lead_id: teamLeadId || null,
      payroll_ctc: ctcNumber,
      employment_start_date: joiningDate || new Date().toISOString().split('T')[0],
      verification_status: 'verified',
      employment_status: 'active',
      status: 'active',
      candidate_id: candidateId
    };

    const { error: profileErr } = await adminClient
      .from('profiles')
      .upsert(profilePayload);

    if (profileErr) {
      await adminClient
        .from('candidate_hiring_operations')
        .update({ status: 'failed', failure_reason: profileErr.message })
        .eq('id', hiringOpId);
      throw profileErr;
    }

    // 7. Establish candidate linkage & update stage
    await adminClient
      .from('candidates')
      .update({ profile_id: authUserId, stage: 'Hired' })
      .eq('id', candidateId);

    await adminClient
      .from('job_applications')
      .update({ status: 'Hired' })
      .eq('id', applicationId);

    // 8. Generate Cryptographic Activation Token (SHA-256 Hashed at rest)
    const rawTokenBytes = new Uint8Array(32);
    crypto.getRandomValues(rawTokenBytes);
    const rawActivationToken = Array.from(rawTokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const tokenHash = await sha256(rawActivationToken);

    // Invalidate existing active tokens for this user
    await adminClient
      .from('employee_activations')
      .update({ status: 'Revoked' })
      .eq('user_id', authUserId)
      .eq('status', 'Active');

    const { error: actErr } = await adminClient
      .from('employee_activations')
      .insert([{
        user_id: authUserId,
        candidate_id: candidateId,
        token_hash: tokenHash,
        status: 'Active',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7-day expiration
      }]);

    if (actErr) throw actErr;

    // 9. Queue Official Employee Activation Email (Never return token in HTTP body to HR)
    const baseUrl = origin || 'http://localhost:5173';
    const activationLink = `${baseUrl}/employee-activation?token=${rawActivationToken}`;

    await adminClient
      .from('pending_emails')
      .insert([{
        recipient_email: cleanEmail,
        recipient_name: candidate.full_name,
        subject: `Welcome to FWC — Official Employee Account Activation (${employeeCode})`,
        html_body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; background: #ffffff;">
            <h2 style="color: #1e1b4b; margin-top: 0;">Welcome to the Team, ${candidate.full_name}!</h2>
            <p style="color: #475569; font-size: 14px; line-height: 1.6;">Congratulations on your offer! Your employee account has been created in the FWC corporate directory.</p>
            
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px; margin: 24px 0;">
              <p style="margin: 4px 0; font-size: 13px; color: #334155;">• <strong>Employee Code:</strong> <span style="font-family: monospace; color: #4f46e5; font-weight: bold;">${employeeCode}</span></p>
              <p style="margin: 4px 0; font-size: 13px; color: #334155;">• <strong>Department:</strong> ${department}</p>
              <p style="margin: 4px 0; font-size: 13px; color: #334155;">• <strong>Work Email:</strong> ${cleanEmail}</p>
            </div>

            <p style="color: #475569; font-size: 14px; line-height: 1.6;">Please activate your account and configure your private corporate password by clicking below:</p>
            
            <a href="${activationLink}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 12px 24px; font-weight: bold; border-radius: 8px; text-decoration: none; font-size: 14px; margin-top: 12px;">Activate Employee Account &rarr;</a>
            
            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">Note: This activation link is single-use and will expire in 7 days.</p>
          </div>
        `,
        email_type: 'employee_activation',
        reference_id: authUserId,
        idempotency_key: `act-email-${applicationId}`
      }]);

    // 10. Create Onboarding Record
    await adminClient
      .from('candidate_onboarding')
      .delete()
      .eq('candidate_id', candidateId);

    await adminClient
      .from('candidate_onboarding')
      .insert([{
        candidate_id: candidateId,
        onboarding_stage: 'completed',
        completion_percentage: 100,
        department,
        manager_id: teamLeadId || null,
        salary: ctcNumber,
        employee_code: employeeCode,
        asset_status: 'pending',
        payroll_status: 'active',
        onboarding_completed: true
      }]);

    // 11. Complete Hiring Operation & Log Audit Trail
    await adminClient
      .from('candidate_hiring_operations')
      .update({
        status: 'completed',
        auth_user_id: authUserId
      })
      .eq('id', hiringOpId);

    await adminClient
      .from('admin_audit_logs')
      .insert([{
        user_id: callerUser.id,
        action: 'HIRE_CANDIDATE',
        target_table: 'profiles',
        record_id: authUserId,
        details: {
          candidate_id: candidateId,
          application_id: applicationId,
          employee_code: employeeCode,
          department,
          annual_ctc: ctcNumber
        }
      }]);

    // 12. Return Truthful Response to HR Client (Raw token is NOT returned)
    return new Response(JSON.stringify({
      success: true,
      message: "Candidate successfully hired. Corporate profile created and activation invitation email queued.",
      employeeId: authUserId,
      emailQueued: true
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ 
      error: err.message || "Hiring transaction aborted due to unexpected server error." 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
