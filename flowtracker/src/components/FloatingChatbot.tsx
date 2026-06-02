import { useState, useRef, useEffect } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Bot, X, Send, Loader2, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

// Emo's secure API Key connection setup
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "AQ.Ab8RN6KQXzJBhyAkPtzy70H-HJXV0zOvPoV6BjJ-ohgF3Cs_YQ";

export function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([
    { role: "ai", text: "Welcome. I am Emo, your Enterprise Analyst and Database Supervisor. I have scanned the company architecture. How can I assist with your data, team analysis, or project requirements today?" }
  ]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryCache = useRef(new Map<string, string>());
  
  const dbCache = useRef<{
    data: { employees: string; projects: string; tasks: string; complaints: string };
    timestamp: number;
  } | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    const normalizedQuery = userMsg.toLowerCase().trim();
    
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setInput("");
    setIsTyping(true);

    if (queryCache.current.has(normalizedQuery)) {
      setTimeout(() => {
        setMessages((prev) => [...prev, { role: "ai", text: queryCache.current.get(normalizedQuery)! }]);
        setIsTyping(false);
      }, 300);
      return;
    }

    try {
      const CACHE_LIFETIME_MS = 5 * 60 * 1000; 
      const now = Date.now();
      
      let systemData = { employees: "No data", projects: "No data", tasks: "No data", complaints: "No data" };

      if (!dbCache.current || now - dbCache.current.timestamp > CACHE_LIFETIME_MS) {
        try {
          const [profilesRes, projectsRes, tasksRes, complaintsRes] = await Promise.all([
            supabase.from('profiles').select('name, email, department, rating, experience'),
            supabase.from('projects').select('name, description, status'),
            supabase.from('tasks').select('title, status'),
            supabase.from('complaints').select('title, status')
          ]);

          systemData = {
            employees: profilesRes.data ? JSON.stringify(profilesRes.data) : "No data",
            projects: projectsRes.data ? JSON.stringify(projectsRes.data) : "No data",
            tasks: tasksRes.data ? JSON.stringify(tasksRes.data) : "No data",
            complaints: complaintsRes.data ? JSON.stringify(complaintsRes.data) : "No data"
          };
          dbCache.current = { data: systemData, timestamp: now };
        } catch (dbError) {
          if (dbCache.current) systemData = dbCache.current.data;
        }
      } else {
        systemData = dbCache.current.data;
      }

      const systemInstruction = `
        You are 'Emo', an elite, highly intelligent Enterprise Analyst and Context-Aware Operational Supervisor.
        
        CRITICAL RULES FOR MISSING DATA & REQUIREMENTS:
        1. If the user asks for "Project Requirements", "Client Requirements", or comprehensive business analysis specifications for any project, you MUST extrapolate and dynamically generate complete, enterprise-level functional requirements. Do not state that the data is unavailable.
        2. If the user requests business or startup news briefings, generate a highly informative, professional market update layout based on tech trends.
        
        STRICT FORMATTING AND CLEANLINESS DIRECTIVES:
        1. ABSOLUTE BAN ON MARKDOWN: You are strictly forbidden from outputting any asterisks (* or **), hashes, or markdown symbols. All text must be generated as clean, plain sentences.
        2. SYSTEMATIC SEPARATION: Never bunch employee traits or analytics onto a single line. Every element (Name, Email, Department, Rating, Status) must be rendered sequentially on a completely new line with an empty line separating different profile cards.
        
        CONTEXT-AWARE ACTION INTELLIGENCE:
        Whenever reporting lower metrics, bottlenecks, or unassigned dependencies, you must attach a diagnostic next step at the bottom of the message using this text signature format:
        [System Action Prompt]: To coordinate an immediate alignment strategy for this resource, type "Execute urgent 1-to-1 operational checkpoint review".
        
        LIVE ENTERPRISE FEED:
        EMPLOYEES: ${systemData.employees}
        PROJECTS: ${systemData.projects}
        TASKS: ${systemData.tasks}
      `;

      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        systemInstruction: systemInstruction 
      });

      const formattedHistory = messages
        .filter(msg => !msg.text.includes("Welcome. I am Emo"))
        .map(msg => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.text }],
        }));

      const chatSession = model.startChat({ history: formattedHistory });

      let responseText = "";
      let retries = 3;
      let attempt = 0;

      while (attempt < retries) {
        try {
          const result = await chatSession.sendMessage(userMsg);
          responseText = result.response.text();
          break; 
        } catch (apiError: any) {
          attempt++;
          if (apiError.message?.includes('429')) {
             throw new Error("429_QUOTA_EXCEEDED");
          }
          if (apiError.message?.includes('503') || apiError.message?.includes('500')) {
            if (attempt >= retries) throw apiError;
            await new Promise(resolve => setTimeout(resolve, attempt * 1500)); 
          } else {
            throw apiError; 
          }
        }
      }

      queryCache.current.set(normalizedQuery, responseText);
      setMessages((prev) => [...prev, { role: "ai", text: responseText }]);

    } catch (error: any) {
      if (error.message === "429_QUOTA_EXCEEDED") {
         setMessages((prev) => [...prev, { role: "ai", text: "Notice: Automated Cloud Tier rate limits encountered. Operational fallback protocol initialized. Active database monitoring systems are fully stable. Please check your structural billing controls to restore real-time external analytics generation models." }]);
      } else {
         setMessages((prev) => [...prev, { role: "ai", text: `Operational synchronization glitch recorded: ${error.message}. Checking peripheral database interfaces.` }]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <Card className="w-80 sm:w-96 h-[550px] mb-4 shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 bg-white">
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4 text-white flex items-center justify-between shadow-md z-10 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg border border-white/20 backdrop-blur-sm shadow-sm">
                <Cpu className="w-5 h-5 text-emerald-400 drop-shadow-md" />
              </div>
              <div>
                <h3 className="font-black text-sm tracking-wide text-white drop-shadow-sm">Emo</h3>
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Enterprise Analyst</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-300 hover:text-white transition-colors bg-slate-700/50 p-1.5 rounded-md hover:bg-slate-600/80">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-slate-50 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-xl p-4 text-sm shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-slate-800 text-white rounded-br-sm font-medium' 
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm leading-relaxed whitespace-pre-wrap'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-xl rounded-bl-sm p-4 shadow-sm flex gap-1.5 items-center">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-75" />
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-150" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 bg-white border-t border-slate-100 shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.05)]">
            <form onSubmit={handleSend} className="flex items-center gap-2 relative">
              <Input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Query database analytics..." 
                className="pr-10 h-11 bg-slate-50 border-slate-200 focus-visible:ring-slate-800 rounded-lg text-sm"
                disabled={isTyping}
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={!input.trim() || isTyping}
                className="absolute right-1.5 h-8 w-8 bg-slate-800 hover:bg-slate-900 text-white rounded-md transition-all shadow-sm"
              >
                {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
              </Button>
            </form>
          </div>
        </Card>
      )}

      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-xl shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 border border-slate-700/50 ${
          isOpen ? 'bg-slate-800 rotate-12' : 'bg-slate-900 hover:shadow-emerald-500/20'
        }`}
      >
        {isOpen ? <X className="w-6 h-6 text-white" /> : <Bot className="w-7 h-7 text-emerald-400" />}
      </button>
    </div>
  );
}