import { useState, useRef, useEffect } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Bot, X, Send, Loader2, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

// Emo's NEW direct API Key connection using your freshly generated key
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;;

export function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([
    { role: "ai", text: "Hey! I'm Emo. I can look around the database and help you out with whatever you need. What's on your mind today?" }
  ]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setInput("");
    setIsTyping(true);

    try {
      // 1. SAFELY FETCH DYNAMIC DB METRICS
      let topPerformersList = "Data unavailable";
      let totalStaff = 0;
      let activeProjectsList = "Data unavailable";

      try {
        // Fetch top 3 performers by rating to feed Emo's brain
        const { data: topProfiles, count: staffCount } = await supabase
          .from('profiles')
          .select('name, department, rating', { count: 'exact' })
          .order('rating', { ascending: false })
          .limit(3);
          
        if (topProfiles) {
          topPerformersList = topProfiles.map(p => `${p.name} (Dept: ${p.department || 'General'}, Rating: ${p.rating})`).join(', ');
        }
        totalStaff = staffCount || 0;

        // Fetch recent active projects
        const { data: projects } = await supabase
          .from('projects')
          .select('name, status')
          .limit(5);
        if (projects) {
          activeProjectsList = projects.map(p => `${p.name} (${p.status})`).join(', ');
        }
      } catch (dbError) {
        console.warn("Emo DB Scan Notice:", dbError);
      }

      // 2. EMO'S PERSONALITY AND KNOWLEDGE BASE
      const liveContext = `
        You are 'Emo', an intelligent but very approachable AI assistant built exclusively for this company's workflow application.
        
        Your Personality:
        - Keep your language simple, friendly, and highly situational.
        - Do not use overly complex corporate jargon. Talk like a smart, helpful coworker.
        - Be direct and concise.

        Live Company Data you just scanned:
        - Total Employees in system: ${totalStaff}
        - Top Performers (Highest Ratings): ${topPerformersList}
        - Current Projects: ${activeProjectsList}
        
        Use this data to accurately answer the user's questions. If they ask about something you don't have data for, just politely let them know.
      `;

      // 3. CONNECT TO GEMINI
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      
      // FIXED: Using gemini-1.5-flash which is the correct, supported model for new keys.
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `${liveContext}\n\nUser Question: ${userMsg}`;
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      setMessages((prev) => [...prev, { role: "ai", text: responseText }]);
    } catch (error: any) {
      console.error("Emo API Error:", error);
      setMessages((prev) => [...prev, { role: "ai", text: `Oops, I ran into a glitch trying to process that. (Error: ${error.message || "Network issue"}).` }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <Card className="w-80 sm:w-96 h-[500px] mb-4 shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 bg-white">
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-500 to-emerald-500 p-4 text-white flex items-center justify-between shadow-md z-10 border-b border-teal-600">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-full border border-white/30 backdrop-blur-sm shadow-sm">
                <Bot className="w-5 h-5 text-white drop-shadow-md" />
              </div>
              <div>
                <h3 className="font-black text-sm tracking-wide text-white drop-shadow-sm">Emo</h3>
                <p className="text-[10px] text-teal-50 font-medium uppercase tracking-widest">Smart Assistant</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-teal-100 hover:text-white transition-colors bg-teal-600/30 p-1.5 rounded-full hover:bg-teal-600/50">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3.5 text-sm shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-teal-600 text-white rounded-br-sm font-medium' 
                    : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm leading-relaxed'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm p-4 shadow-sm flex gap-1.5 items-center">
                  <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce delay-75" />
                  <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce delay-150" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-slate-100 shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.05)]">
            <form onSubmit={handleSend} className="flex items-center gap-2 relative">
              <Input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Emo..." 
                className="pr-10 h-11 bg-slate-50 border-slate-200 focus-visible:ring-teal-500 rounded-xl"
                disabled={isTyping}
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={!input.trim() || isTyping}
                className="absolute right-1.5 h-8 w-8 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all shadow-sm"
              >
                {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
              </Button>
            </form>
          </div>
        </Card>
      )}

      {/* Floating Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 border-2 ${
          isOpen ? 'bg-teal-700 border-teal-600 rotate-12' : 'bg-gradient-to-tr from-teal-500 to-emerald-500 border-white hover:shadow-teal-500/25'
        }`}
      >
        {isOpen ? <X className="w-6 h-6 text-white" /> : <Cpu className="w-7 h-7 text-white" />}
      </button>
    </div>
  );
}