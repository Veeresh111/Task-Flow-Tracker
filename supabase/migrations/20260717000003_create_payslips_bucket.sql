-- ============================================================
-- Create Payslips Storage Bucket
--
-- Stores generated payslip PDFs. Bucket is publicly readable
-- so employees can view their payslips via direct URL.
-- Uploads are done exclusively via the generate-payslip-pdf
-- edge function (which uses service_role).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payslips',
  'payslips',
  true,
  5242880,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to payslip PDFs
CREATE POLICY "payslips_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'payslips');

-- Allow service_role to upload/delete
CREATE POLICY "payslips_service_role_insert"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'payslips');

CREATE POLICY "payslips_service_role_delete"
  ON storage.objects
  FOR DELETE
  TO service_role
  USING (bucket_id = 'payslips');
