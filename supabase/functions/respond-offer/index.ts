import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(rawToken);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "401 Unauthorized: Valid session token required." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { offerId, action } = await req.json();
    if (!offerId || !action || !['accepted', 'declined'].includes(action)) {
      return new Response(JSON.stringify({ error: "Missing offerId or invalid action ('accepted' | 'declined')." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseKey);

    // Fetch caller's profile
    const { data: callerProfile } = await serviceClient
      .from('profiles')
      .select('id, role, candidate_id, email')
      .eq('id', user.id)
      .maybeSingle();

    const callerRole = (callerProfile?.role || "").toLowerCase();
    const isHrOrAdmin = ['admin', 'hr'].includes(callerRole);

    const { data: offer, error: offerErr } = await serviceClient
      .from('offer_letters')
      .select('id, status, candidate_id, application_id, candidate_email')
      .eq('id', offerId)
      .single();

    if (offerErr || !offer) {
      return new Response(JSON.stringify({ error: "Offer not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Security check: must be either Admin/HR or the candidate to whom this offer belongs
    const candidateId = callerProfile?.candidate_id || user.id;
    const isOwner = (offer.candidate_id === candidateId) || (offer.candidate_email && (offer.candidate_email.toLowerCase() === user.email?.toLowerCase()));

    if (!isHrOrAdmin && !isOwner) {
      return new Response(JSON.stringify({ error: "403 Forbidden: You are not authorized to respond to this offer letter." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (offer.status !== 'Sent') {
      return new Response(JSON.stringify({ error: `Offer is currently '${offer.status}' and cannot be responded to.` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const newStatus = action === 'accepted' ? 'Accepted' : 'Declined';

    // Immutable fields protected: only status and responded_at updated
    await serviceClient
      .from('offer_letters')
      .update({ status: newStatus, responded_at: new Date().toISOString() })
      .eq('id', offerId);

    // Synchronize job application status
    if (offer.application_id) {
      const appStatus = action === 'accepted' ? 'Offer Accepted' : 'Offer Declined';
      await serviceClient
        .from('job_applications')
        .update({ status: appStatus })
        .eq('id', offer.application_id);
    }

    // Notify HR
    const { data: hrUsers } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('role', 'hr');

    const { data: appData } = await serviceClient
      .from('job_applications')
      .select('candidate_name, form_id')
      .eq('id', offer.application_id)
      .single();

    let jobTitle = "a position";
    if (appData?.form_id) {
      const { data: form } = await serviceClient
        .from('job_forms')
        .select('job_title')
        .eq('id', appData.form_id)
        .single();
      if (form?.job_title) jobTitle = form.job_title;
    }

    const candidateName = appData?.candidate_name || "A candidate";
    const title = action === 'accepted' ? 'Offer Accepted by Candidate' : 'Offer Declined by Candidate';
    const message = action === 'accepted'
      ? `${candidateName} has accepted the offer for ${jobTitle}. Proceed with onboarding.`
      : `${candidateName} has declined the offer for ${jobTitle}.`;

    if (hrUsers && hrUsers.length > 0) {
      const notifications = hrUsers.map((hr: any) => ({
        user_id: hr.id,
        title,
        message,
        is_read: false,
        created_at: new Date().toISOString()
      }));
      await serviceClient.from('notifications').insert(notifications);
    }

    return new Response(JSON.stringify({
      success: true,
      newStatus
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
