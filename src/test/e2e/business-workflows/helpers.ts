import { createClient } from "@supabase/supabase-js";
import { test as base, expect as pwExpect } from "@playwright/test";

const SUPABASE_URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";

export const expect = pwExpect;
const SUPABASE_ANON_KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

// Shared test data IDs (existing seed data)
export const SEED = {
  candidateId: "11156aac-f010-4a14-ad16-92eb9c8878de",
  candidateEmail: "Shaikp040@gmail.com",
  candidateName: "prakash mulge",
  jobFormId: "14a66494-ed4f-46eb-94e6-15cef1657c7b",
  jobTitle: "React Dev",
  assessmentId: "20ebee5c-0d11-40f2-bef8-dc39c4905a93",
  assessmentTitle: "AI ML ENGG IQT",
} as const;

let _adminClient: ReturnType<typeof createClient> | null = null;
let _anonClient: ReturnType<typeof createClient>;

export function getAnonClient() {
  if (!_anonClient) {
    _anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _anonClient;
}

export async function getAdminClient() {
  if (_adminClient) return _adminClient;
  const anon = getAnonClient();
  const { data } = await anon.auth.signInWithPassword({
    email: process.env.TEST_ADMIN_EMAIL || "admin@example.com",
    password: process.env.TEST_ADMIN_PASSWORD || "changeme",
  });
  if (!data?.session) throw new Error("Failed to sign in as admin");
  _adminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: "Bearer " + data.session.access_token } },
  });
  return _adminClient;
}

export const test = base;

export async function expectTableRead(table: string) {
  const anon = getAnonClient();
  const { data, error } = await anon.from(table).select("*").limit(1);
  expect(error).toBeNull();
  return data;
}

export async function expectTableWrite(table: string, insertData: Record<string, any>) {
  const admin = await getAdminClient();
  const { data, error } = await admin.from(table).insert(insertData).select();
  expect(error).toBeNull();
  if (data && data.length > 0) {
    await admin.from(table).delete().eq("id", data[0].id);
  }
  return data;
}
