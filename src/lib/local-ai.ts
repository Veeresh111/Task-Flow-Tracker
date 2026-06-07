// src/lib/local-ai.ts
export async function getLocalAIResponse(userPrompt: string, context: string) {
  try {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1",
        messages: [
          { role: "system", content: "You are Emo, an Enterprise Analyst. Use this database context to provide precise, professional insights: " + context },
          { role: "user", content: userPrompt }
        ],
        stream: false
      })
    });
    
    if (!response.ok) throw new Error("Ollama server unreachable");
    
    const data = await response.json();
    return data.message.content;
  } catch (error) {
    console.error("Local AI Error:", error);
    return "Local AI is currently offline. Please ensure Ollama is running in your taskbar.";
  }
}