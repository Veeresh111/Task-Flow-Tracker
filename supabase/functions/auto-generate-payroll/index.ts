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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine the current month/year for generation
    // Salary is credited on the 1st of the month, so this generates
    // payroll for the *current* month. If called on Feb 1st, it
    // generates January's payroll (for the previous month's work).
    const now = new Date();
    let month: number;
    let year: number;

    // Accept optional override for testing
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.month && body.year) {
          month = body.month;
          year = body.year;
        } else {
          // Default: generate for previous month (salary credited on 1st is for previous month's work)
          const d = new Date();
          month = d.getMonth(); // 0-indexed
          year = d.getFullYear();
          if (month === 0) { month = 12; year -= 1; }
        }
      } catch {
        const d = new Date();
        month = d.getMonth();
        year = d.getFullYear();
        if (month === 0) { month = 12; year -= 1; }
      }
    } else {
      const d = new Date();
      month = d.getMonth();
      year = d.getFullYear();
      if (month === 0) { month = 12; year -= 1; }
    }

    const { data, error } = await supabase.rpc('auto_generate_monthly_payroll', {
      p_month: month,
      p_year: year,
    });

    if (error) throw error;

    return new Response(JSON.stringify({
      success: true,
      month,
      year,
      result: data,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
