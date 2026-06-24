import { supabase } from './supabase';

interface AIOptions {
  prompt: string;
  systemInstruction?: string;
  messages?: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
}

export const callCorporateAI = async (opts: AIOptions): Promise<string> => {
  let attempt = 0;
  const maxRetries = 3;

  while (attempt < maxRetries) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(opts)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "AI proxy rejected the request.");
      }

      return data.content;
    } catch (error: any) {
      attempt++;
      const msg = error.message || error.toString();
      if (msg.includes('429') || msg.includes('503') || msg.includes('Quota')) {
        if (attempt >= maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, 4000 * attempt));
      } else {
        throw error;
      }
    }
  }
  throw new Error("AI proxy unreachable after 3 retries.");
};
