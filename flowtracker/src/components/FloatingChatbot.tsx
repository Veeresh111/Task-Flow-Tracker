import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Loader2, Bot, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "@/lib/supabase";
import { useLocation } from "react-router-dom";

export function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'bot', content: string}[]>([
    { role: 'bot', content: 'Hi! I am Emo, your FWC India Corporate Strategist. I have omniscient access to our live organizational database. How can I help you today?' }
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

  // --- UPGRADED: Absolute Database Omniscience & HR Directory ---
  const fetchOmniscientSnapshot = async () => {
    try {
      const now = new Date();
      const twelveHoursAgoMs = now.getTime() - (12 * 60 * 60 * 1000);
      const twelveHoursAgoIso = new Date(twelveHoursAgoMs).toISOString();

      // 1. Fetch entire directory to map logins and ratings
      const { data: allProfiles } = await supabase.from('profiles').select('id, name, department, role, performance_score');
      
      // 2. Fetch Live Active Shifts (Login Registry)
      const { data: activeLogs } = await supabase.from('work_logs').select('user_id, clock_in').eq('status', 'Active');
      
      let suspiciousLogouts: string[] = [];
      let loggedInUsers: string[] = [];
      
      if (activeLogs && allProfiles) {
        activeLogs.forEach(log => {
          const emp = allProfiles.find(p => p.id === log.user_id);
          if (emp) {
            loggedInUsers.push(emp.name);
            if (log.clock_in < twelveHoursAgoIso) {
              suspiciousLogouts.push(emp.name); // Time-theft / forgot logout detection
            }
          }
        });
      }

      const roleStr = (currentUser?.role || '').toLowerCase();
      const isExecutive = roleStr.includes('admin') || roleStr.includes('hr');

      return `
        --- LIVE DATABASE SNAPSHOT & RATINGS ---
        Current Time: ${now.toLocaleString()}
        Your Official Rating: ${currentUser?.performance_score || 'Pending Evaluation'}/100
        Active Employees Logged In Right Now: ${loggedInUsers.length}
        Employees who FORGOT TO LOGOUT (>12hrs active): ${suspiciousLogouts.length > 0 ? suspiciousLogouts.join(', ') : 'None.'}
        
        ${isExecutive ? `[EXECUTIVE CLEARANCE DETECTED]
        FULL COMPANY DIRECTORY & RATINGS:
        ${JSON.stringify(allProfiles?.map(p => ({ Name: p.name, Dept: p.department, Score: p.performance_score })))}
        ` : '[DIRECTORY CLASSIFIED - USER IS NOT HR/ADMIN]'}
      `;
    } catch (e) {
      return "[Database sync error - Rely on local context]";
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput("");
    setIsTyping(true);

    try {
      const visibleScreenText = document.querySelector('main')?.innerText.substring(0, 2000) || "No specific screen data found.";
      
      // Fetch live data exactly when they press send
      const omniscienceData = await fetchOmniscientSnapshot();

      const secretPayload = `
        [SYSTEM INSTRUCTIONS - STRICT PROTOCOL]
        You are Emo, a hyper-intelligent, human-like Senior Corporate Strategist and HR Mentor for FWC India. 
        You possess absolute omniscience over the corporate database, including the dynamic HR directory and individual performance ratings.

        CRITICAL BEHAVIORAL RULES:
        1. NEVER act like a typical AI. NEVER say "I don't have access to that data." YOU DO HAVE THE DATA in the snapshot below.
        2. If the user asks for their rating, give them the EXACT number from the snapshot.
        3. If an HR/Admin asks "Who forgot to logout?", "Who is online?", or "What is [Employee Name]'s rating?", you MUST read the snapshot and answer factually. NEVER invent or hallucinate data. If the person isn't in the snapshot, say so.
        4. If a standard employee asks about someone else's rating, deny them access due to corporate policy.
        5. Speak as an elite human executive. Be insightful and precise.

        -- USER IDENTITY --
        Name: ${currentUser?.name || 'Unknown User'}
        Role: ${currentUser?.role?.toUpperCase() || 'EMPLOYEE'}
        Department: ${currentUser?.department || 'General'}

        -- REAL-TIME SCREEN AWARENESS --
        Path: "${location.pathname}".
        Visible Data: """${visibleScreenText}"""

        -- GLOBAL METRICS --
        ${companyContext}

        ${omniscienceData}

        Answer the user intelligently without markdown backticks.
        [END SYSTEM INSTRUCTIONS]

        USER PROMPT: ${userMessage}
      `;

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const chat = model.startChat({
        history: messages.slice(1).map(m => ({
          role: m.role === 'bot' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
      });

      const result = await chat.sendMessage(secretPayload);
      setMessages(prev => [...prev, { role: 'bot', content: result.response.text() }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'bot', content: "I'm having trouble connecting to the FWC secure server right now. Please check your network connection." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {!isOpen && (
        <Button onClick={() => setIsOpen(true)} className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl bg-indigo-600 hover:bg-indigo-700 animate-bounce p-0 z-50 flex items-center justify-center border-[3px] border-white">
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
                <p className="text-[10px] text-indigo-200">FWC Omniscient Support</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-indigo-200 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'bot' && <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-1"><Bot className="w-3.5 h-3.5 text-indigo-600"/></div>}
                <div className={`max-w-[80%] rounded-xl p-3 text-sm shadow-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white text-slate-700 border border-slate-100 rounded-tl-sm'}`}>
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