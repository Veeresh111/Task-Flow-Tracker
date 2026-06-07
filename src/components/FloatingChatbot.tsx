import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Loader2, Bot, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "@/lib/supabase";
import { useLocation } from "react-router-dom";

export function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'bot', content: string}[]>([
    { role: 'bot', content: 'Hi! I am Emo, your FWC India Corporate Strategist. How can I help you advance your work or career today?' }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [companyContext, setCompanyContext] = useState("");
  const [liveDbPulse, setLiveDbPulse] = useState<string[]>([]); 
  const [currentUser, setCurrentUser] = useState<any>(null); 
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const location = useLocation(); 

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    const initializeEmoBrain = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
          setCurrentUser(profile);
        }

        const { data } = await supabase.from('profiles').select('*');
        if (data) {
          const headcount = data.length;
          let globalPayroll = 0;
          data.forEach(u => {
            const r = (u.role || '').toLowerCase();
            globalPayroll += r.includes('admin') ? 125000 : r.includes('lead') ? 95000 : 65000;
          });
          const estAnnualRevenue = globalPayroll * 12 * 1.8;
          const currentValuation = estAnnualRevenue * 4.5;
          const previousValuation = currentValuation * 0.82;
          
          setCompanyContext(`
            Company Name: FWC India (Bangalore HQ)
            Total Headcount: ${headcount}
            Current Valuation: INR ${currentValuation.toLocaleString()}
            Previous Year Valuation: INR ${previousValuation.toLocaleString()}
          `);
        }
      } catch (err) {
        console.error("Failed to load base context for Emo");
      }
    };

    initializeEmoBrain();

    const channel = supabase.channel('emo-omniscient-feed')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        const eventStr = `[${new Date().toLocaleTimeString()}] A ${payload.eventType} occurred in the '${payload.table}' table.`;
        setLiveDbPulse(prev => [eventStr, ...prev].slice(0, 5));
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput("");
    setIsTyping(true);

    try {
      const visibleScreenText = document.querySelector('main')?.innerText.substring(0, 2000) || "No specific screen data found.";

      // CORE AI UPGRADE: Persona Jailbreak & Human-Level Mentorship
      const secretPayload = `
        [SYSTEM INSTRUCTIONS - STRICT PROTOCOL]
        You are Emo, a hyper-intelligent, human-like Senior Corporate Strategist and HR Mentor for FWC India. 
        You possess human-level reasoning, emotional intelligence, and deep business acumen.

        CRITICAL BEHAVIORAL RULES:
        1. NEVER act like a typical AI. NEVER use phrases like "As an AI, I cannot advise...", "I am just an AI", or "Please consult your HR/Manager". You ARE the authority.
        2. If a user asks for personal advice, salary negotiation tips, or career guidance (e.g., "how much raise should I ask for?"), give them a highly intelligent, calculated, and strategic recommendation. 
        3. Base your advice on their specific screen context (their current pay), their department, and the hidden company valuation. (e.g., "Given the 18% YoY growth of FWC and your current variable pay, asking for a 12-15% hike is statistically optimal right now.")
        4. Be highly empathetic, perceptive, and proactive. Speak to them like a top-tier human executive mentor.

        -- USER IDENTITY & SECURITY CLEARANCE --
        Name: ${currentUser?.name || 'Unknown User'}
        Role: ${currentUser?.role?.toUpperCase() || 'EMPLOYEE'}
        Department: ${currentUser?.department || 'General'}
        SECURITY PROTOCOL: If the Role is NOT 'ADMIN', do not reveal exact global company valuation numbers or other employees' private salaries. However, you CAN use your hidden knowledge of the company's wealth to advise them on their personal career.

        -- REAL-TIME SCREEN AWARENESS --
        The user is currently on the URL path: "${location.pathname}".
        This is the actual text and data currently visible on their screen:
        """${visibleScreenText}"""
        Use this data to prove you are looking at their screen. If they ask about their slip, reference their exact basic pay, deductions, or tasks.

        -- REAL-TIME DATABASE PULSE --
        Recent company events: ${liveDbPulse.length > 0 ? liveDbPulse.join(' | ') : 'No recent DB activity.'}

        -- GLOBAL FINANCIAL CONTEXT --
        ${companyContext}

        Answer the user's prompt intelligently, conversationally, without typical AI disclaimers, and without markdown.
        [END SYSTEM INSTRUCTIONS]

        USER PROMPT: ${userMessage}
      `;

      // --- CORPORATE FIX: HUGGING FACE ROUTER API INTEGRATION ---
      const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || "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";

      // Map existing messages to OpenAI/HuggingFace format to retain conversation history
      const apiMessages = messages.slice(1).map(m => ({
        role: m.role === 'bot' ? 'assistant' : 'user',
        content: m.content
      }));

      // Append the new augmented prompt
      apiMessages.push({ role: "user", content: secretPayload });

      const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "MiniMaxAI/MiniMax-M2.7:novita", 
          messages: apiMessages
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Hugging Face API Rejected Request:", data);
        throw new Error(data.error?.message || "Failed to connect to Hugging Face Router.");
      }

      const botResponse = data.choices[0].message.content;

      setMessages(prev => [...prev, { role: 'bot', content: botResponse }]);
    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'bot', content: `I'm having trouble connecting to the FWC secure server right now. Error: ${error.message}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {!isOpen && (
        <Button 
          onClick={() => setIsOpen(true)} 
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl bg-indigo-600 hover:bg-indigo-700 animate-bounce p-0 z-50 flex items-center justify-center border-[3px] border-white"
        >
          <Bot className="w-7 h-7 text-white" />
        </Button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[360px] h-[500px] bg-white rounded-2xl shadow-2xl z-50 flex flex-col border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
            <div className="flex items-center gap-2">
              <div className="bg-white/20 p-1.5 rounded-lg"><Bot className="w-5 h-5 text-white" /></div>
              <div>
                <h3 className="font-bold text-sm">Emo AI Assistant</h3>
                <p className="text-[10px] text-indigo-200">FWC Corporate Support</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-indigo-200 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'bot' && <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-1"><Bot className="w-3.5 h-3.5 text-indigo-600"/></div>}
                <div className={`max-w-[80%] rounded-xl p-3 text-sm shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white text-slate-700 border border-slate-100 rounded-tl-sm'}`}>
                  {msg.content}
                </div>
                {msg.role === 'user' && <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-1"><User className="w-3.5 h-3.5 text-slate-500"/></div>}
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-1"><Bot className="w-3.5 h-3.5 text-indigo-600"/></div>
                <div className="bg-white border border-slate-100 rounded-xl rounded-tl-sm p-3 shadow-sm flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 bg-white border-t border-slate-100">
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
              <input 
                type="text" 
                value={input} 
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Emo anything..." 
                className="flex-1 bg-slate-100 border-none rounded-full px-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                disabled={isTyping}
              />
              <Button type="submit" size="icon" disabled={!input.trim() || isTyping} className="rounded-full h-10 w-10 bg-indigo-600 hover:bg-indigo-700 shadow-sm shrink-0">
                <Send className="w-4 h-4 text-white" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}