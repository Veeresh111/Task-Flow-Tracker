import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Loader2, Bot, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const isAssessmentRoute = location.pathname.startsWith("/assessment");

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
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, name, role, department')
            .eq('id', user.id)
            .single();
          setCurrentUser(profile);
        }

        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        if (count !== null) {
          setCompanyContext(`
            Company: FWC India (Bangalore HQ)
            Total Employees: ${count}
          `);
        }
      } catch (err) {
        console.error("Failed to load base context for Emo");
      }
    };

    initializeEmoBrain();

    const channel = supabase.channel('emo-scoped-feed')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${currentUser?.id || 'none'}`
      }, () => {
        setLiveDbPulse(prev => [`[${new Date().toLocaleTimeString()}] New notification`, ...prev].slice(0, 5));
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput("");
    setIsTyping(true);

    try {
      const systemPrompt = `
You are Emo, a helpful corporate assistant for FWC India.
- Be concise and professional.
- Never fabricate financial data or company valuation.
- Never reveal other employees' personal information.
- Do not screen-scrape or reference specific screen content.
- Use the user's role and department for context only.

User: ${currentUser?.name || 'Unknown'} (${currentUser?.role?.toUpperCase() || 'EMPLOYEE'}, ${currentUser?.department || 'General'})
URL: ${location.pathname}
      `;

      const apiMessages = [
        { role: "system", content: systemPrompt },
        ...messages.slice(1).map(m => ({
          role: m.role === 'bot' ? 'assistant' : 'user',
          content: m.content
        })),
        { role: "user", content: userMessage }
      ];

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            messages: apiMessages
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || "Failed to connect to AI service.");
      }

      let botResponse = data.content || "No response generated.";

      botResponse = botResponse
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/^#+\s*/gm, "")
        .replace(/```[\s\S]*?```/g, "")
        .trim();

      setMessages(prev => [...prev, { role: 'bot', content: botResponse }]);
    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'bot', content: `I'm having trouble connecting to the FWC secure server right now. Error: ${error.message}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (isAssessmentRoute) return null;

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