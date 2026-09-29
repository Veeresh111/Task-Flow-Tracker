import { useState, useRef, useEffect, useCallback } from "react";
import { X, Loader2, Bot, Send, User, Sparkles, DollarSign, CheckSquare, Target, Clock, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useLocation } from "react-router-dom";
import { AgenticAssistantEngine, UserLiveContext } from "@/lib/agentic-assistant";

export function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'bot'; content: string }[]>([
    {
      role: 'bot',
      content: 'Hi! I am Emo, your FWC India Corporate Strategist. How can I help you advance your work, check your payroll, or review your sprint deliverables today?'
    }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [liveContext, setLiveContext] = useState<UserLiveContext | null>(null);

  // Draggable state (pointer events work for mouse and touch).
  // Position is stored as an offset from the default bottom-right anchor.
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y };
    setIsDragging(true);
    e.preventDefault();
  }, [position]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStateRef.current) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    setPosition({ x: dragStateRef.current.originX + dx, y: dragStateRef.current.originY + dy });
  }, []);

  const onPointerUp = useCallback(() => {
    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

  // Keep the panel fully on-screen when the window resizes.
  useEffect(() => {
    const PANEL_W = 380, PANEL_H = 520, MARGIN = 8;
    const onResize = () => {
      setPosition(prev => {
        const left = window.innerWidth - 24 - PANEL_W + prev.x;
        const top = window.innerHeight - 24 - PANEL_H + prev.y;
        const clampedLeft = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, window.innerWidth - PANEL_W - MARGIN));
        const clampedTop = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, window.innerHeight - PANEL_H - MARGIN));
        return { x: clampedLeft - (window.innerWidth - 24 - PANEL_W), y: clampedTop - (window.innerHeight - 24 - PANEL_H) };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const isAssessmentRoute = location.pathname.startsWith("/assessment");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const refreshContext = useCallback(async (): Promise<UserLiveContext | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const context = await AgenticAssistantEngine.fetchUserLiveContext(user.id);
      setLiveContext(context);
      return context;
    } catch (err) {
      console.error("Failed to load agentic live context for Emo:", err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (isOpen) refreshContext();
  }, [isOpen, refreshContext]);

  const handleSend = async (customPrompt?: string) => {
    const userMessage = (customPrompt || input).trim();
    if (!userMessage) return;

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    if (!customPrompt) setInput("");
    setIsTyping(true);

    try {
      // Fresh context per question — answers always reflect the database now.
      const ctx = await refreshContext();
      const botResponse = await AgenticAssistantEngine.answerUserQuery(userMessage, ctx);
      setMessages(prev => [...prev, { role: 'bot', content: botResponse }]);
    } catch (error: any) {
      console.error("Emo chat processing error:", error);
      setMessages(prev => [
        ...prev,
        {
          role: 'bot',
          content: "I could not complete that request. Please try again — I can help with payroll, tasks, performance, attendance, and your reporting line."
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  if (isAssessmentRoute) return null;

  const quickPrompts = [
    { label: "What's my salary?", icon: DollarSign, query: "What's my salary and payroll breakdown?" },
    { label: "My Sprint Tasks", icon: CheckSquare, query: "What are my active sprint tasks?" },
    { label: "Performance Score", icon: Target, query: "What is my performance score and how are marks calculated?" },
    { label: "Shift Clock Status", icon: Clock, query: "What is my attendance and shift clock status today?" }
  ];

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed h-14 w-14 rounded-full shadow-2xl bg-indigo-600 hover:bg-indigo-700 p-0 z-50 flex items-center justify-center border-[3px] border-white"
          style={{ right: 24, bottom: 24 }}
        >
          <Bot className="w-7 h-7 text-white" />
        </Button>
      )}

      {isOpen && (
        <div
          className="fixed w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl z-50 flex flex-col border border-slate-200 overflow-hidden"
          style={{ right: 24 - position.x, bottom: 24 - position.y, left: 'auto', touchAction: isDragging ? 'none' : 'auto' }}
        >
          {/* Header — drag surface (double-click snaps back to default spot) */}
          <div
            className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 flex justify-between items-center text-white select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={() => setPosition({ x: 0, y: 0 })}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <div className="flex items-center gap-2 pointer-events-none">
              <div className="bg-indigo-500/30 border border-indigo-400/40 p-1.5 rounded-lg">
                <Bot className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h3 className="font-bold text-sm flex items-center gap-1.5">
                  Emo AI Assistant <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                </h3>
                <p className="text-[10px] text-indigo-200/80">
                  {liveContext ? `${liveContext.name} (${liveContext.role.toUpperCase()})` : "FWC Corporate Support"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <GripVertical className="w-4 h-4 text-indigo-300/60" />
              <button
                onClick={() => setIsOpen(false)}
                className="text-indigo-200 hover:text-white transition-colors p-1"
                aria-label="Close assistant"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Suggestion Chips */}
          <div className="bg-slate-100/80 border-b border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickPrompts.map((qp, idx) => {
              const Icon = qp.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleSend(qp.query)}
                  disabled={isTyping}
                  className="bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-slate-200 shrink-0 shadow-2xs flex items-center gap-1 transition-all"
                >
                  <Icon className="w-3 h-3 text-indigo-500" /> {qp.label}
                </button>
              );
            })}
          </div>

          {/* Message Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'bot' && (
                  <div className="w-6 h-6 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow-xs whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-xs font-medium'
                      : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-1">
                    <User className="w-3.5 h-3.5 text-slate-600" />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2 justify-start items-center">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2 text-xs flex items-center gap-1.5 text-slate-500 shadow-2xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span>Emo is reading your live records...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-slate-200 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about your salary, tasks, marks..."
              className="flex-1 text-xs border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
            />
            <Button
              onClick={() => handleSend()}
              disabled={isTyping || !input.trim()}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-3 h-auto"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}