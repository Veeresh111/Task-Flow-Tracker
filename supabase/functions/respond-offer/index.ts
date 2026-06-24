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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { offerId, action } = await req.json();
    if (!offerId || !action || !['accepted', 'declined'].includes(action)) {
      return new Response(JSON.stringify({ error: "Missing offerId or invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseKey);

    // Verify the offer belongs to this candidate
    const { data: profile } = await supabase
      .from('profiles')
      .select('candidate_id')
      .eq('id', user.id)
      .maybeSingle();

    const candidateId = profile?.candidate_id || user.id;

    const { data: offer, error: offerErr } = await serviceClient
      .from('offer_letters')
      .select('id, status, candidate_id, application_id')
      .eq('id', offerId)
      .eq('candidate_id', candidateId)
      .single();

    if (offerErr || !offer) {
      return new Response(JSON.stringify({ error: "Offer not found or unauthorized" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (offer.status !== 'Sent') {
      return new Response(JSON.stringify({ error: "Offer is not in 'Sent' status and cannot be responded to" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const newStatus = action === 'accepted' ? 'Accepted' : 'Declined';

    await serviceClient
      .from('offer_letters')
      .update({ status: newStatus, responded_at: new Date().toISOString() })
      .eq('id', offerId);

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
