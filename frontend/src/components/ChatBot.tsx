import MaterialIcon from "./MaterialIcon";
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { HazardNetBrand } from './HazardNetLogo';
import { LiveVoiceAdvisor } from './LiveVoiceAdvisor';
import { Mic, MessageSquare, Radio } from 'lucide-react';

interface GroundingFacility {
  title: string;
  uri: string;
  snippet?: string;
  type?: string;
}

interface GroundingSource {
  title: string;
  uri: string;
  domain?: string;
  type?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  groundingType?: 'maps' | 'search' | 'auto' | 'none';
  facilities?: GroundingFacility[];
  groundingSources?: GroundingSource[];
  searchQueries?: string[];
  providerSource?: string;
}

interface ChatResponse {
  answer: string;
  suggested_followups?: string[];
  district_contacts?: any;
  provider_source?: string;
  retrieved_sources?: any[];
  grounding_type?: 'maps' | 'search';
  facilities?: GroundingFacility[];
  grounding_sources?: GroundingSource[];
  search_queries?: string[];
}

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'text' | 'voice'>('text');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [groundingMode, setGroundingMode] = useState<'auto' | 'maps' | 'search'>('auto');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
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

  // Request browser location if available for Google Maps grounding
  const requestLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          });
        },
        (err) => {
          console.log('[ChatBot] Geolocation access optional or denied:', err.message);
        },
        { timeout: 5000 }
      );
    }
  };

  const fetchSampleQuestions = async () => {
    try {
      const res = await fetch('/api/chat/sample-questions');
      const data = await res.json();
      if (data.categories) setSampleQuestions(data.categories);
    } catch (e) {
      console.error('Failed to load sample questions', e);
    }
  };

  const sendMessage = async (text: string, overrideMode?: 'auto' | 'maps' | 'search') => {
    if (!text.trim()) return;
    
    const modeToUse = overrideMode || groundingMode;
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
          groundingMode: modeToUse,
          userCoordinates: userLocation,
          conversationHistory: messages.slice(-4)
        })
      });

      const data: ChatResponse = await res.json().catch(() => ({}) as ChatResponse);

      let answer = data.answer ||
        (res.ok
          ? 'Sorry, I am having trouble connecting to the knowledge base.'
          : `The AI service is unreachable (HTTP ${res.status}). Please try again shortly.`);
      
      if (data.suggested_followups && data.suggested_followups.length > 0) {
         answer += `\n\n**Suggested Questions:**\n` + data.suggested_followups.map(q => `- ${q}`).join('\n');
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: answer,
        groundingType: data.grounding_type,
        facilities: data.facilities,
        groundingSources: data.grounding_sources,
        searchQueries: data.search_queries,
        providerSource: data.provider_source
      };

      setMessages(prev => [...prev, assistantMsg]);
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
      {/* Floating Action Button - Unified Icon-Only 60x60px Circular FAB */}
      <AnimatePresence>
        {!isOpen && (
          <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-[var(--z-sticky)] flex items-center">
            <motion.button
              key="ai-advisor-fab"
              id="launch-ai-advisor-fab"
              onClick={() => {
                setIsOpen(true);
                requestLocation();
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              className="w-[60px] h-[60px] rounded-full bg-nasa-blue hover:bg-nasa-blue-shade text-white shadow-[0_12px_20px_-5px_rgba(0,0,0,0.3),0_6px_12px_rgba(28,103,227,0.3)] border border-white/20 flex items-center justify-center cursor-pointer touch-manipulation tap-target focus:outline-none focus:ring-2 focus:ring-nasa-blue focus:ring-offset-2 transition-transform duration-150"
              aria-label="Open AI Advisor"
              title="Open AI Advisor"
            >
              <svg 
                viewBox="0 0 24 24" 
                className="w-8 h-8 fill-white shrink-0" 
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path 
                  d="M17.7530511,13.999921 C18.9956918,13.999921 20.0030511,15.0072804 20.0030511,16.249921 L20.0030511,17.1550008 C20.0030511,18.2486786 19.5255957,19.2878579 18.6957793,20.0002733 C17.1303315,21.344244 14.8899962,22.0010712 12,22.0010712 C9.11050247,22.0010712 6.87168436,21.3444691 5.30881727,20.0007885 C4.48019625,19.2883988 4.00354153,18.2500002 4.00354153,17.1572408 L4.00354153,16.249921 C4.00354153,15.0072804 5.01090084,13.999921 6.25354153,13.999921 L17.7530511,13.999921 Z M11.8985607,2.00734093 L12.0003312,2.00049432 C12.380027,2.00049432 12.6938222,2.2826482 12.7434846,2.64872376 L12.7503312,2.75049432 L12.7495415,3.49949432 L16.25,3.5 C17.4926407,3.5 18.5,4.50735931 18.5,5.75 L18.5,10.254591 C18.5,11.4972317 17.4926407,12.504591 16.25,12.504591 L7.75,12.504591 C6.50735931,12.504591 5.5,11.4972317 5.5,10.254591 L5.5,5.75 C5.5,4.50735931 6.50735931,3.5 7.75,3.5 L11.2495415,3.49949432 L11.2503312,2.75049432 C11.2503312,2.37079855 11.5324851,2.05700336 11.8985607,2.00734093 L12.0003312,2.00049432 L11.8985607,2.00734093 Z M9.74928905,6.5 C9.05932576,6.5 8.5,7.05932576 8.5,7.74928905 C8.5,8.43925235 9.05932576,8.99857811 9.74928905,8.99857811 C10.4392523,8.99857811 10.9985781,8.43925235 10.9985781,7.74928905 C10.9985781,7.05932576 10.4392523,6.5 9.74928905,6.5 Z M14.2420255,6.5 C13.5520622,6.5 12.9927364,7.05932576 12.9927364,7.74928905 C12.9927364,8.43925235 13.5520622,8.99857811 14.2420255,8.99857811 C14.9319888,8.99857811 15.4913145,8.43925235 15.4913145,7.74928905 C15.4913145,7.05932576 14.9319888,6.5 14.2420255,6.5 Z" 
                />
              </svg>
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-window"
            initial={{ opacity: 0, scale: 0.88, y: 30, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 30 }}
            transition={{ type: 'spring', stiffness: 350, damping: 26 }}
            className="fixed inset-x-0 bottom-0 top-0 sm:top-auto sm:bottom-6 sm:right-6 sm:left-auto z-[var(--z-sticky)] w-full sm:w-[480px] h-auto sm:h-[640px] sm:max-h-[calc(100dvh-3rem)] max-h-dvh bg-white flex flex-col border border-carbon-20 shadow-2xl pb-[env(safe-area-inset-bottom)] sm:pb-0 sm:rounded-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="HazardNet AI Advisor chat"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-carbon-20 bg-carbon-05 text-carbon-90 shrink-0">
              <div className="flex items-center gap-2">
                <HazardNetBrand size="sm" />
                <div className="flex items-center bg-carbon-10 rounded-lg p-0.5 border border-carbon-20">
                  <button
                    id="tab-text-mode-btn"
                    type="button"
                    onClick={() => setChatMode('text')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer ${
                      chatMode === 'text' 
                        ? 'bg-white text-carbon-90 shadow-2xs border border-carbon-20' 
                        : 'text-carbon-60 hover:text-carbon-90'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>Text</span>
                  </button>
                  <button
                    id="tab-voice-mode-btn"
                    type="button"
                    onClick={() => setChatMode('voice')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer ${
                      chatMode === 'voice' 
                        ? 'bg-blue-600 text-white shadow-2xs' 
                        : 'text-blue-700 hover:text-blue-900'
                    }`}
                  >
                    <Radio className="w-3 h-3 animate-pulse" />
                    <span>Live Voice</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsOpen(false)}
                  className="min-h-[36px] px-2.5 hover:bg-carbon-20 text-carbon-70 hover:text-carbon-90 text-sm font-semibold cursor-pointer flex items-center gap-1 border border-carbon-20 rounded touch-manipulation"
                  title="Close Assistant"
                  aria-label="Close Assistant"
                >
                  <MaterialIcon name="close" className="w-4 h-4" />
                  <span>Close</span>
                </motion.button>
              </div>
            </div>

            {chatMode === 'voice' ? (
              <div className="flex-1 overflow-hidden flex flex-col">
                <LiveVoiceAdvisor onSwitchToText={() => setChatMode('text')} onClose={() => setIsOpen(false)} />
              </div>
            ) : (
              <>

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-carbon-05">
              
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
                    <div className="bg-white border border-carbon-20 p-4 text-sm text-carbon-80 rounded-xl shadow-xs">
                      <p className="mb-2 font-semibold text-carbon-90">Hello! I am HazardNet AI Advisor.</p>
                      <p className="text-xs text-carbon-70 mb-3">
                        Grounded with <strong>gemini-3.5-flash</strong>, <strong>Google Maps</strong>, and <strong>Google Search</strong> for real-time agricultural advice, flood alerts, and emergency facilities.
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 bg-blue-50/70 border border-blue-200/60 rounded-lg">
                          <div className="font-semibold text-blue-900 flex items-center gap-1 mb-1">
                            <span>📍</span> Google Maps Data
                          </div>
                          <span className="text-blue-800/80">Locate nearest DAE offices, veterinary clinics, cyclone and flood shelters.</span>
                        </div>
                        <div className="p-2 bg-emerald-50/70 border border-emerald-200/60 rounded-lg">
                          <div className="font-semibold text-emerald-900 flex items-center gap-1 mb-1">
                            <span>🌐</span> Google Search Data
                          </div>
                          <span className="text-emerald-800/80">Retrieve live BMD weather warnings, FFWC river danger levels, and news.</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grounded Quick Actions */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-carbon-60 uppercase tracking-wider px-1">
                      Quick Grounded Inquiries:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        onClick={() => sendMessage('Where is the nearest Upazila Agriculture Office (DAE) in Sunamganj?', 'maps')}
                        className="text-left text-xs bg-white border border-carbon-20 text-carbon-80 p-2.5 rounded-lg hover:border-nasa-blue hover:bg-blue-50/50 transition-colors flex items-start gap-2 shadow-2xs cursor-pointer"
                      >
                        <span className="text-base shrink-0">📍</span>
                        <span>Find nearest DAE Agriculture Office (Sunamganj)</span>
                      </button>

                      <button
                        onClick={() => sendMessage("Locate cyclone and flood shelters near Cox's Bazar", 'maps')}
                        className="text-left text-xs bg-white border border-carbon-20 text-carbon-80 p-2.5 rounded-lg hover:border-nasa-blue hover:bg-blue-50/50 transition-colors flex items-start gap-2 shadow-2xs cursor-pointer"
                      >
                        <span className="text-base shrink-0">📍</span>
                        <span>Locate Cyclone Shelters (Cox's Bazar)</span>
                      </button>

                      <button
                        onClick={() => sendMessage('Latest Bangladesh flood situation and river danger levels today', 'search')}
                        className="text-left text-xs bg-white border border-carbon-20 text-carbon-80 p-2.5 rounded-lg hover:border-emerald-500 hover:bg-emerald-50/50 transition-colors flex items-start gap-2 shadow-2xs cursor-pointer"
                      >
                        <span className="text-base shrink-0">🌐</span>
                        <span>Latest Flood Situation & Warnings (Live Search)</span>
                      </button>

                      <button
                        onClick={() => sendMessage('Current BMD cyclone and severe weather bulletins', 'search')}
                        className="text-left text-xs bg-white border border-carbon-20 text-carbon-80 p-2.5 rounded-lg hover:border-emerald-500 hover:bg-emerald-50/50 transition-colors flex items-start gap-2 shadow-2xs cursor-pointer"
                      >
                        <span className="text-base shrink-0">🌐</span>
                        <span>Current BMD Weather Bulletins (Live Search)</span>
                      </button>
                    </div>
                  </div>

                  {/* Sample Questions Grid */}
                  {sampleQuestions.length > 0 && (
                    <div className="space-y-2 mt-2">
                      <p className="text-xs font-semibold text-carbon-60 uppercase tracking-wider px-1">
                        Agronomic & Disaster Protocols:
                      </p>
                      <div className="grid grid-cols-1 gap-1.5">
                        {sampleQuestions[0].questions.slice(0, 3).map((q: string, i: number) => (
                          <motion.button
                            key={i}
                            whileHover={{ scale: 1.01, x: 2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => sendMessage(q)}
                            className="text-left text-xs bg-white border border-carbon-20 text-carbon-70 p-2.5 rounded-lg hover:bg-amber-50 hover:border-amber-200 transition-colors shadow-2xs cursor-pointer"
                          >
                            {q}
                          </motion.button>
                        ))}
                      </div>
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
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs shadow-sm ${msg.role === 'user' ? 'bg-carbon-80 text-white' : 'bg-amber-400 text-carbon-black'}`}>
                    {msg.role === 'user' ? 'You' : 'AI'}
                  </div>
                  
                  <div className="max-w-[88%] space-y-2">
                    {/* Assistant Message Bubble */}
                    <div 
                      className={`p-4 text-sm prose prose-sm max-w-none rounded-xl ${
                        msg.role === 'user' 
                          ? 'bg-amber-100 text-amber-950 border border-amber-200 font-medium' 
                          : 'bg-white border border-carbon-20 text-carbon-80 shadow-2xs'
                      }`}
                    >
                      {/* Grounding Header Pill */}
                      {msg.role === 'assistant' && msg.groundingType === 'maps' && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-3 bg-blue-50 border border-blue-200 rounded-md text-xs font-semibold text-blue-900 not-prose">
                          <span>📍</span>
                          <span>Grounded with Google Maps (gemini-3.5-flash)</span>
                        </div>
                      )}
                      {msg.role === 'assistant' && msg.groundingType === 'search' && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs font-semibold text-emerald-900 not-prose">
                          <span>🌐</span>
                          <span>Grounded with Google Search (gemini-3.5-flash)</span>
                        </div>
                      )}

                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>

                    {/* Google Maps Grounded Facilities (Always extracted & linked as required by SKILL.md) */}
                    {msg.facilities && msg.facilities.length > 0 && (
                      <div className="bg-white border border-blue-200 rounded-xl p-3 shadow-xs space-y-2 text-xs">
                        <div className="flex items-center justify-between text-blue-900 font-semibold border-b border-blue-100 pb-1.5">
                          <span className="flex items-center gap-1.5">
                            <span>📍</span> Verified Google Maps Locations ({msg.facilities.length})
                          </span>
                          <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">Google Maps Data</span>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {msg.facilities.map((fac, fIdx) => (
                            <div key={fIdx} className="p-2 bg-blue-50/50 rounded-lg border border-blue-100/70 hover:bg-blue-50 transition-colors">
                              <div className="font-semibold text-carbon-90 flex items-start justify-between gap-2">
                                <span>{fac.title}</span>
                                <a
                                  href={fac.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-nasa-blue hover:text-nasa-blue-shade font-semibold whitespace-nowrap flex items-center gap-0.5 text-[11px] underline underline-offset-2"
                                  title="Open in Google Maps"
                                >
                                  <span>View on Maps</span>
                                  <span>↗</span>
                                </a>
                              </div>
                              {fac.snippet && (
                                <p className="text-carbon-60 text-[11px] mt-1 line-clamp-2">
                                  {fac.snippet}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Google Search Grounded Sources (Extracted & linked as required by SKILL.md) */}
                    {msg.groundingSources && msg.groundingSources.length > 0 && (
                      <div className="bg-white border border-emerald-200 rounded-xl p-3 shadow-xs space-y-2 text-xs">
                        <div className="flex items-center justify-between text-emerald-900 font-semibold border-b border-emerald-100 pb-1.5">
                          <span className="flex items-center gap-1.5">
                            <span>🌐</span> Verified Search Citations ({msg.groundingSources.length})
                          </span>
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Google Search Data</span>
                        </div>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {msg.groundingSources.map((src, sIdx) => (
                            <a
                              key={sIdx}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block p-2 bg-emerald-50/50 rounded-lg border border-emerald-100/70 hover:bg-emerald-50 transition-colors group"
                            >
                              <div className="font-medium text-emerald-950 group-hover:text-emerald-700 flex items-center justify-between">
                                <span className="line-clamp-1">{src.title}</span>
                                <span className="text-[10px] font-mono text-emerald-700 ml-2 shrink-0">{src.domain || 'source'} ↗</span>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Provenance Footer */}
                    {msg.providerSource && (
                      <div className="text-[11px] text-carbon-50 px-1 flex items-center justify-between">
                        <span>Engine: {msg.providerSource}</span>
                      </div>
                    )}
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
                  <div className="bg-white border border-carbon-20 px-4 py-3 rounded-xl flex items-center gap-2.5 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-nasa-blue animate-ping" />
                    <span className="text-xs text-carbon-70 font-medium">
                      {groundingMode === 'maps' 
                        ? 'Grounding with Google Maps data (gemini-3.5-flash)...' 
                        : groundingMode === 'search' 
                        ? 'Retrieving live Google Search bulletins (gemini-3.5-flash)...' 
                        : 'Querying RAG knowledge base & grounding engine...'}
                    </span>
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Grounding Mode Selector Toolbar */}
            <div className="px-3 pt-2.5 pb-1 bg-white border-t border-carbon-20 flex items-center justify-between text-xs gap-1.5 overflow-x-auto">
              <span className="text-[11px] font-semibold text-carbon-60 uppercase shrink-0">Grounding:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setGroundingMode('auto')}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    groundingMode === 'auto'
                      ? 'bg-carbon-90 text-white font-semibold'
                      : 'bg-carbon-10 text-carbon-70 hover:bg-carbon-20'
                  }`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGroundingMode('maps');
                    requestLocation();
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                    groundingMode === 'maps'
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
                  }`}
                >
                  <span>📍</span>
                  <span>Google Maps</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGroundingMode('search')}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                    groundingMode === 'search'
                      ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  <span>🌐</span>
                  <span>Google Search</span>
                </button>
              </div>
            </div>

            {/* Input Area */}
            <div className="p-3 sm:p-4 bg-white border-t border-carbon-20 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="relative flex items-center">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    groundingMode === 'maps'
                      ? "Ask to locate emergency shelters, DAE offices, veterinary clinics..."
                      : groundingMode === 'search'
                      ? "Search current weather warnings, flood updates, river levels..."
                      : "Ask about agriculture, hazards, emergency contacts..."
                  }
                  className="w-full bg-carbon-05 border border-carbon-20 rounded-xl py-2.5 pl-3.5 pr-28 text-xs sm:text-sm text-carbon-90 placeholder-carbon-40 focus:outline-none focus:border-nasa-blue resize-none h-[48px] scrollbar-hide"
                  rows={1}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    type="button"
                    onClick={() => setChatMode('voice')}
                    className="min-h-[32px] px-2 bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-xs rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Switch to Live Voice Advisor (gemini-3.8-live)"
                  >
                    <Mic className="w-3.5 h-3.5 text-blue-600" />
                    <span className="hidden sm:inline">Voice</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || loading}
                    className="min-h-[32px] px-3 py-1 bg-nasa-blue text-white font-bold text-xs rounded-lg hover:bg-nasa-blue-shade disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    Send
                  </motion.button>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-carbon-50 mt-1.5 px-0.5">
                <span>Grounded with gemini-3.5-flash & Live API</span>
                {userLocation ? (
                  <span className="text-blue-700 flex items-center gap-0.5">
                    <span>📍</span> Location Active
                  </span>
                ) : (
                  <button 
                    onClick={requestLocation}
                    className="hover:underline text-carbon-60 cursor-pointer"
                  >
                    Enable Location
                  </button>
                )}
              </div>
            </div>
            </>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
