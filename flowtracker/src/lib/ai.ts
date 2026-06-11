// src/lib/ai.ts

export const callCorporateAI = async (prompt: string, systemInstruction?: string): Promise<string> => {
  let attempt = 0;
  const maxRetries = 3;

  while (attempt < maxRetries) {
    try {
      // Pulls from .env, falls back to the token you provided
      const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || "[REDACTED]";
      
      const messages = [];
      if (systemInstruction) {
        messages.push({ role: "system", content: systemInstruction });
      }
      messages.push({ role: "user", content: prompt });

      const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          // The exact model you requested
          model: "openai/gpt-oss-120b:groq", 
          messages: messages
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Hugging Face Router API rejected the request.");
      }

      return data.choices[0].message.content;
    } catch (error: any) {
      attempt++;
      const msg = error.message || error.toString();
      // Retry on network congestion (503/429)
      if (msg.includes('429') || msg.includes('503') || msg.includes('Quota')) {
        if (attempt >= maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, 4000 * attempt)); // Exponential backoff
      } else {
        throw error; // If it's a code error, fail immediately
      }
    }
  }
  return "";
};