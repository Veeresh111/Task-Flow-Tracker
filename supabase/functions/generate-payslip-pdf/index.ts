import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import jsPDF from "https://esm.sh/jspdf@2.5.2";

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

    const { payslip_id, cycle_id } = await req.json();

    if (!payslip_id && !cycle_id) {
      return new Response(JSON.stringify({
        error: "Provide either payslip_id or cycle_id",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: Array<{ payslip_id: string; pdf_url: string }> = [];

    if (payslip_id) {
      const url = await generateSinglePayslip(supabase, payslip_id);
      if (url) results.push({ payslip_id, pdf_url: url });
    } else if (cycle_id) {
      const { data: payslips, error: fetchError } = await supabase
        .from("payslips")
        .select("id")
        .eq("cycle_id", cycle_id);

      if (fetchError) throw fetchError;
      if (!payslips || payslips.length === 0) {
        return new Response(JSON.stringify({ error: "No payslips found for this cycle" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      for (const ps of payslips) {
        const url = await generateSinglePayslip(supabase, ps.id);
        if (url) results.push({ payslip_id: ps.id, pdf_url: url });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      generated: results.length,
      payslips: results,
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

async function generateSinglePayslip(
  supabase: ReturnType<typeof createClient>,
  payslipId: string,
): Promise<string | null> {
  const { data: payslip, error: fetchError } = await supabase
    .from("payslips")
    .select("*, payroll_cycles!inner(month, year)")
    .eq("id", payslipId)
    .single();

  if (fetchError || !payslip) {
    console.error("Failed to fetch payslip:", payslipId, fetchError);
    return null;
  }

  const earnings = payslip.earnings as Record<string, number>;
  const deductions = payslip.deductions as Record<string, number>;
  const cycle = payslip.payroll_cycles as { month: number; year: number };

  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pageWidth = 210;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Colors
  const primaryColor: [number, number, number] = [41, 65, 120];
  const accentColor: [number, number, number] = [220, 38, 38];
  const lightGray: [number, number, number] = [245, 245, 245];
  const textColor: [number, number, number] = [51, 51, 51];

  // Header bar
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, pageWidth, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("FlowTracker HRMS", margin, 16);
  doc.setFontSize(10);
  doc.text("Payslip - Salary Statement", margin, 26);

  y = 45;

  // Employee & Period info
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Employee Details", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  y += 8;
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const periodStr = `${months[cycle.month - 1]} ${cycle.year}`;

  const details: Array<[string, string]> = [
    ["Name", payslip.employee_name || "N/A"],
    ["Department", payslip.employee_department || "N/A"],
    ["Email", payslip.employee_email || "N/A"],
    ["Pay Period", periodStr],
  ];

  for (const [label, value] of details) {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(":  " + value, margin + 35, y);
    y += 7;
  }

  y += 5;

  // Annual / Monthly CTC
  const ctcInfo: Array<[string, string]> = [
    ["Annual CTC", formatINR(payslip.annual_ctc)],
    ["Monthly CTC", formatINR(payslip.monthly_ctc)],
  ];
  for (const [label, value] of ctcInfo) {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(":  " + value, margin + 35, y);
    y += 7;
  }

  y += 5;

  // Earnings table header
  drawTableHeader(doc, margin, y, contentWidth, "Earnings", primaryColor);
  y += 8;

  const earningRows: Array<[string, number]> = [
    ["Basic", earnings.basic || 0],
    ["HRA", earnings.hra || 0],
    ["LTA", earnings.lta || 0],
    ["Special Allowance", earnings.special || 0],
    ["Variable", earnings.variable || 0],
  ];

  for (const [label, amount] of earningRows) {
    drawTableRow(doc, margin, y, contentWidth, label, formatINR(amount));
    y += 7;
  }

  // Gross total
  drawTotalRow(doc, margin, y, contentWidth, "Gross Earnings", formatINR(payslip.gross), accentColor);
  y += 10;

  // Deductions table header
  drawTableHeader(doc, margin, y, contentWidth, "Deductions", primaryColor);
  y += 8;

  const deductionRows: Array<[string, number]> = [
    ["Provident Fund (PF)", deductions.pf || 0],
    ["Professional Tax (PT)", deductions.pt || 0],
    ["TDS / Income Tax", deductions.tds || 0],
  ];

  // Attendance-based deductions (if any)
  if (payslip.lop_deduction > 0) {
    deductionRows.push(["Loss of Pay", payslip.lop_deduction]);
  }

  for (const [label, amount] of deductionRows) {
    drawTableRow(doc, margin, y, contentWidth, label, formatINR(amount));
    y += 7;
  }

  // Total deductions
  const totalDeductions = (deductions.pf || 0) + (deductions.pt || 0) + (deductions.tds || 0) + (payslip.lop_deduction || 0);
  drawTotalRow(doc, margin, y, contentWidth, "Total Deductions", formatINR(totalDeductions), accentColor);
  y += 10;

  // Net Pay (highlighted)
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, y, contentWidth, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Net Pay", margin + 5, y + 8);
  doc.text(formatINR(payslip.net), margin + contentWidth - 5, y + 8, { align: "right" });

  y += 22;

  // Additions (overtime, bonus, incentive) - only if present
  const additions: Array<[string, number]> = [];
  if (payslip.overtime_pay > 0) additions.push(["Overtime", payslip.overtime_pay]);
  if (payslip.bonus_amount > 0) additions.push(["Bonus", payslip.bonus_amount]);
  if (payslip.incentive_amount > 0) additions.push(["Incentive", payslip.incentive_amount]);

  if (additions.length > 0) {
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Additional Payments", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    for (const [label, amount] of additions) {
      drawTableRow(doc, margin, y, contentWidth, label, formatINR(amount));
      y += 7;
    }
    y += 5;
  }

  // Reimbursements (if any)
  const reimbursements: Array<Record<string, unknown>> = Array.isArray(payslip.reimbursements)
    ? payslip.reimbursements
    : [];
  if (reimbursements.length > 0) {
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Reimbursements", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    for (const r of reimbursements) {
      drawTableRow(doc, margin, y, contentWidth, String(r.label || "Item"), formatINR(Number(r.amount) || 0));
      y += 7;
    }
    y += 5;
  }

  // Footer
  y = 280;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.text("This is a computer-generated payslip. No signature is required.", margin, y + 5);
  doc.text("FlowTracker HRMS - Confidential", margin, y + 10);

  // Generate PDF bytes
  const pdfBytes = doc.output("arraybuffer");
  const fileName = `payslip_${payslip.employee_name?.replace(/\s+/g, "_") || payslipId}_${cycle.month}_${cycle.year}_v${payslip.version}.pdf`;

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from("payslips")
    .upload(fileName, new Uint8Array(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    console.error("Failed to upload PDF:", uploadError);
    return null;
  }

  const { data: urlData } = await supabase.storage
    .from("payslips")
    .getPublicUrl(fileName);

  const pdfUrl = urlData?.publicUrl ?? null;
  if (!pdfUrl) return null;

  // Update payslip record with PDF URL
  const { error: updateError } = await supabase
    .from("payslips")
    .update({ pdf_url: pdfUrl })
    .eq("id", payslipId);

  if (updateError) {
    console.error("Failed to update pdf_url:", updateError);
  }

  // Queue payslip-available email notification
  await supabase.from("pending_emails").insert({
    recipient_email: payslip.employee_email,
    recipient_name: payslip.employee_name,
    subject: `Payslip Available - ${periodStr}`,
    html_body:
      '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">'
      + '<h2 style="color: #293d78;">Payslip Available</h2>'
      + '<p>Dear ' + (payslip.employee_name || "Employee") + ',</p>'
      + '<p>Your payslip for <strong>' + periodStr + '</strong> is now available.</p>'
      + '<p>You can view and download your payslip from the Employee Dashboard.</p>'
      + '<p style="color: #666; font-size: 12px;">Gross: ' + formatINR(payslip.gross)
      + ' | Net: ' + formatINR(payslip.net)
      + ' | PF: ' + formatINR(payslip.pf_amount)
      + ' | TDS: ' + formatINR(payslip.tds_amount) + '</p>'
      + '<br/><p style="color: #666;">Best regards,<br/>FlowTracker Payroll Team</p>'
      + '</div>',
    email_type: "payslip_available",
    reference_id: payslipId,
  });

  return pdfUrl;
}

function drawTableHeader(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  label: string,
  color: [number, number, number],
) {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.rect(x, y, w, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(label, x + 3, y + 5);
  doc.text("Amount", x + w - 3, y + 5, { align: "right" });
}

function drawTableRow(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  label: string,
  amount: string,
) {
  doc.setDrawColor(230, 230, 230);
  doc.line(x, y + 7, x + w, y + 7);
  doc.setTextColor(51, 51, 51);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(label, x + 3, y + 5);
  doc.text(amount, x + w - 3, y + 5, { align: "right" });
}

function drawTotalRow(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  label: string,
  amount: string,
  color: [number, number, number],
) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, w, 7, "F");
  doc.setTextColor(color[0], color[1], color[2]);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(label, x + 3, y + 5);
  doc.text(amount, x + w - 3, y + 5, { align: "right" });
  doc.line(x, y + 7, x + w, y + 7);
}

function formatINR(amount: number): string {
  const num = Math.round(amount);
  const str = num.toString();
  const lastThree = str.slice(-3);
  const rest = str.slice(0, -3);
  const formatted = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree : lastThree;
  return "₹" + formatted;
}
