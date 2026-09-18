import MaterialIcon from "./MaterialIcon";
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { HazardNetBrand } from './HazardNetLogo';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  answer: string;
  suggested_followups?: string[];
  district_contacts?: any;
  provider_source?: string;
  retrieved_sources?: any[];
}

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sampleQuestions, setSampleQuestions] = useState<any[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && sampleQuestions.length === 0) {
      fetchSampleQuestions();
    }
  }, [isOpen]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const fetchSampleQuestions = async () => {
    try {
      const res = await fetch('/api/chat/sample-questions');
      const data = await res.json();
      if (data.categories) setSampleQuestions(data.categories);
    } catch (e) {
      console.error('Failed to load sample questions', e);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    
    const newMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: text,
          conversationHistory: messages.slice(-4)
        })
      });

      const data: ChatResponse = await res.json();
      
      let answer = data.answer || 'Sorry, I am having trouble connecting to the knowledge base.';
      
      if (data.suggested_followups && data.suggested_followups.length > 0) {
         answer += `\n\n**Suggested Questions:**\n` + data.suggested_followups.map(q => `- ${q}`).join('\n');
      }

      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'There was an error communicating with the AI. Please try again later.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="chat-fab"
            onClick={() => setIsOpen(true)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-[9995] px-4 sm:px-5 py-2.5 sm:py-3 rounded-full bg-nasa-red hover:bg-nasa-red-shade text-slate-950 font-extrabold text-xs shadow-xl flex items-center gap-2 cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-slate-950/70 animate-ping" />
            AI Advisor
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-window"
            initial={{ opacity: 0, scale: 0.85, y: 30, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 30 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="fixed inset-x-0 bottom-0 top-12 sm:top-auto sm:bottom-6 sm:right-6 sm:left-auto z-[10000] w-full sm:w-[450px] h-auto sm:h-[600px] sm:max-h-[calc(100dvh-3rem)] bg-white sm:rounded-2xl shadow-2xl flex flex-col border border-slate-200 pb-[env(safe-area-inset-bottom)] sm:pb-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 text-slate-900 sm:rounded-t-2xl">
              <div className="flex items-center gap-2">
                <HazardNetBrand size="sm" />
              </div>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-md text-xs font-black transition-colors cursor-pointer flex items-center gap-1 border border-slate-200"
                title="Close Assistant"
                aria-label="Close Assistant"
              >
                <MaterialIcon name="close" className="w-4 h-4" />
                <span>Close</span>
              </motion.button>
            </div>

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
              
              {/* Welcome Message */}
              {messages.length === 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-nasa-red text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-sm">
                      AI
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 shadow-sm text-sm text-slate-800">
                      <p className="mb-2 font-semibold">Hello! I'm HazardNet.</p>
                      <p>You can ask me anything about:</p>
                      <ul className="list-disc pl-4 mt-2 space-y-1 text-xs text-slate-600">
                        <li>Disaster risk management & flood protocols</li>
                        <li>Agricultural advice, crop stages, and resilient seeds</li>
                        <li>Veterinary emergency & livestock care</li>
                        <li>Fisheries, aquaculture, and pond protection</li>
                        <li>Govt offices, helplines, NGOs, and resources</li>
                      </ul>
                    </div>
                  </div>

                  {/* Sample Questions Grid */}
                  {sampleQuestions.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 mt-4">
                      {sampleQuestions[0].questions.map((q: string, i: number) => (
                        <motion.button
                          key={i}
                          whileHover={{ scale: 1.01, x: 2 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => sendMessage(q)}
                          className="text-left text-xs bg-white border border-slate-200 text-slate-700 p-3 rounded-xl hover:bg-amber-50 hover:border-amber-200 hover:text-nasa-red-shade transition-colors shadow-sm cursor-pointer"
                        >
                          {q}
                        </motion.button>
                      ))}
                      <button 
                        className="text-center text-xs text-slate-500 hover:text-slate-800 mt-2 font-medium cursor-pointer"
                        onClick={() => {
                          if (sampleQuestions.length > 1) {
                             const cat = sampleQuestions[Math.floor(Math.random() * sampleQuestions.length)];
                             sendMessage(cat.questions[Math.floor(Math.random() * cat.questions.length)]);
                          }
                        }}
                      >
                        Show more suggestions...
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Chat Bubbles */}
              {messages.map((msg, idx) => (
                <motion.div 
                  key={idx} 
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs shadow-sm ${msg.role === 'user' ? 'bg-slate-800 text-white' : 'bg-amber-400 text-slate-950'}`}>
                    {msg.role === 'user' ? 'You' : 'AI'}
                  </div>
                  <div 
                    className={`max-w-[85%] rounded-2xl p-4 shadow-sm text-sm prose prose-sm max-w-none ${
                      msg.role === 'user' 
                        ? 'bg-amber-100 text-amber-950 border border-amber-200 rounded-tr-none font-medium' 
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                    }`}
                  >
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </motion.div>
              ))}

              {/* Loading Indicator */}
              {loading && (
                <motion.div 
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-nasa-red text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-sm">
                    AI
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
                    <span className="text-sm text-slate-500 animate-pulse font-medium">Searching knowledge base...</span>
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 sm:p-4 border-t border-slate-200 bg-white sm:rounded-b-2xl pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="relative flex items-center">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about agriculture, hazards, contacts..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-4 pr-16 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-nasa-blue resize-none h-[50px] scrollbar-hide"
                  rows={1}
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="absolute right-2 px-3 py-1.5 bg-nasa-red text-white font-bold text-xs rounded-control hover:bg-nasa-red-shade disabled:opacity-40 transition-colors cursor-pointer"
                >
                  Send
                </motion.button>
              </div>
              <div className="text-center mt-2">
                 <span className="text-[10px] text-slate-400 font-medium">HazardNet can make mistakes. Verify critical information.</span>
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
