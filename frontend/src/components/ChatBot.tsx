import { useState, useEffect, useRef } from 'react';
import { useDialogBehavior } from '../hooks/useDialogBehavior';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { LiveVoiceAdvisor } from './LiveVoiceAdvisor';
import { ExternalLink, Loader2, MapPin, MessageSquare, Mic, Search, Send, X } from 'lucide-react';

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
  const reduceMotion = Boolean(useReducedMotion());
  const chatPanelRef = useRef<HTMLDivElement>(null);
  // The chat window declares `aria-modal="true"` but had no Escape handler and
  // no focus containment: Tab walked out of the conversation into the page
  // behind it. This supplies all three (Escape, save/restore, Tab cycle).
  useDialogBehavior({
    isOpen,
    onClose: () => setIsOpen(false),
    containerRef: chatPanelRef,
  });
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
      messagesEndRef.current.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }, [messages, loading, reduceMotion]);

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
    if (!text.trim() || loading) return;
    
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
      if (!loading) sendMessage(input);
    }
  };

  const chooseGroundingMode = (mode: 'auto' | 'maps' | 'search') => {
    setGroundingMode(mode);
    if (mode === 'maps') requestLocation();
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <div className="fixed bottom-20 right-4 z-[var(--ap-z-overlay)] flex items-center sm:bottom-6 sm:right-6">
            <motion.button
              key="ai-advisor-fab"
              id="launch-ai-advisor-fab"
              type="button"
              onClick={() => {
                setIsOpen(true);
                requestLocation();
              }}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
              className="flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-primary text-ap-action-fg shadow-lg transition-colors hover:bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary focus-visible:ring-offset-2"
              aria-label="Open AI Advisor chat"
              aria-haspopup="dialog"
            >
              <MessageSquare className="h-6 w-6" aria-hidden="true" />
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-window"
            ref={chatPanelRef}
            tabIndex={-1}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
            className="fixed inset-x-0 bottom-0 top-0 z-[var(--ap-z-overlay)] flex h-dvh w-full max-w-full flex-col overflow-hidden border border-carbon-20 bg-white pb-[env(safe-area-inset-bottom)] shadow-xl sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[640px] sm:max-h-[calc(100dvh-3rem)] sm:w-[min(480px,calc(100vw-3rem))] sm:rounded-2xl sm:pb-0"
            role="dialog"
            aria-modal="true"
            aria-label="HazardNet AI Advisor chat"
          >
            {chatMode === 'text' ? (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-carbon-20 bg-white px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-ap-link">
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5 text-carbon-90 dark:text-white">AI Advisor</p>
                    <p className="text-xs text-carbon-60">HazardNet · Bangladesh</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    id="tab-voice-mode-btn"
                    type="button"
                    onClick={() => setChatMode('voice')}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-carbon-20 px-3 text-sm font-medium text-carbon-90 transition-colors hover:bg-carbon-05 dark:hover:bg-carbon-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary"
                    aria-label="Switch to Live Voice Advisor"
                  >
                    <Mic className="h-4 w-4" aria-hidden="true" />
                    <span>Voice</span>
                  </button>
                  {/* The accessible name is pinned by the mobile contract
                      (e2e/mobile-responsive.spec.ts: /close assistant/i); the panel is
                      labelled "AI Advisor" and this control keeps the name that shipped. */}
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-carbon-60 transition-colors hover:bg-carbon-05 dark:hover:bg-carbon-70 hover:text-carbon-90 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary"
                    aria-label="Close Assistant"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : null}

            {chatMode === 'voice' ? (
              <div className="min-h-0 flex-1 overflow-hidden">
                <LiveVoiceAdvisor onSwitchToText={() => setChatMode('text')} onClose={() => setIsOpen(false)} />
              </div>
            ) : (
              <>
                <div
                  className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-carbon-05 px-4 py-4"
                  role="log"
                  aria-label="Conversation"
                  aria-relevant="additions"
                >
                  {messages.length === 0 ? (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-carbon-20 bg-white p-4">
                        <h2 className="text-sm font-semibold text-carbon-90 dark:text-white">How can I help?</h2>
                        <p className="mt-1 text-sm leading-relaxed text-carbon-70">
                          Ask about hazards, farming guidance, or nearby services. Choose a source below when you need a local lookup or current information.
                        </p>
                      </div>

                      <section aria-labelledby="chat-suggestions-heading" className="space-y-2.5">
                        <h3 id="chat-suggestions-heading" className="text-sm font-semibold text-carbon-70">
                          Try asking
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => sendMessage('Where is the nearest Upazila Agriculture Office (DAE) in Sunamganj?', 'maps')}
                            className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-carbon-20 bg-white px-3 text-left text-xs font-medium text-carbon-90 transition-colors hover:border-ap-primary/50 hover:bg-blue-50 dark:hover:bg-carbon-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary disabled:opacity-50"
                          >
                            <MapPin className="h-4 w-4 shrink-0 text-ap-link" aria-hidden="true" />
                            <span>Find a DAE office</span>
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => sendMessage("Locate cyclone and flood shelters near Cox's Bazar", 'maps')}
                            className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-carbon-20 bg-white px-3 text-left text-xs font-medium text-carbon-90 transition-colors hover:border-ap-primary/50 hover:bg-blue-50 dark:hover:bg-carbon-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary disabled:opacity-50"
                          >
                            <MapPin className="h-4 w-4 shrink-0 text-ap-link" aria-hidden="true" />
                            <span>Find a cyclone shelter</span>
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => sendMessage('Latest Bangladesh flood situation and river danger levels today', 'search')}
                            className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-carbon-20 bg-white px-3 text-left text-xs font-medium text-carbon-90 transition-colors hover:border-ap-primary/50 hover:bg-blue-50 dark:hover:bg-carbon-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary disabled:opacity-50"
                          >
                            <Search className="h-4 w-4 shrink-0 text-ap-link" aria-hidden="true" />
                            <span>Latest flood situation</span>
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => sendMessage('Current BMD cyclone and severe weather bulletins', 'search')}
                            className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-carbon-20 bg-white px-3 text-left text-xs font-medium text-carbon-90 transition-colors hover:border-ap-primary/50 hover:bg-blue-50 dark:hover:bg-carbon-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary disabled:opacity-50"
                          >
                            <Search className="h-4 w-4 shrink-0 text-ap-link" aria-hidden="true" />
                            <span>Current BMD bulletins</span>
                          </button>
                        </div>
                      </section>

                      {sampleQuestions[0]?.questions?.length > 0 ? (
                        <section aria-labelledby="chat-protocols-heading" className="space-y-2.5">
                          <h3 id="chat-protocols-heading" className="text-sm font-semibold text-carbon-70">
                            More questions
                          </h3>
                          <div className="space-y-2">
                            {sampleQuestions[0].questions.slice(0, 3).map((question: string, index: number) => (
                              <button
                                key={`${index}-${question}`}
                                type="button"
                                disabled={loading}
                                onClick={() => sendMessage(question)}
                                className="flex min-h-[44px] w-full items-center rounded-xl border border-carbon-20 bg-white px-3 py-2 text-left text-sm text-carbon-90 transition-colors hover:bg-carbon-05 dark:hover:bg-carbon-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary disabled:opacity-50"
                              >
                                {question}
                              </button>
                            ))}
                          </div>
                        </section>
                      ) : null}
                    </div>
                  ) : null}

                  {messages.map((message, index) => (
                    <motion.div
                      key={`${index}-${message.role}`}
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.16 }}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className="min-w-0 max-w-[88%] space-y-2">
                        {message.role === 'assistant' ? (
                          <div className="flex flex-wrap items-center gap-2 px-1">
                            <span className="text-xs font-semibold text-carbon-70">AI Advisor</span>
                            {message.groundingType === 'maps' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">
                                <MapPin className="h-3 w-3" aria-hidden="true" /> Google Maps
                              </span>
                            ) : null}
                            {message.groundingType === 'search' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">
                                <Search className="h-3 w-3" aria-hidden="true" /> Web sources
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        <div className={`rounded-2xl border px-3.5 py-3 text-sm leading-relaxed ${message.role === 'user' ? 'rounded-tr-md border-blue-700 bg-blue-700 text-ap-action-fg' : 'rounded-tl-md border-carbon-20 bg-white text-carbon-90 '}`}>
                          <div className={`prose prose-sm max-w-none ${message.role === 'user' ? 'prose-invert' : 'dark:prose-invert'}`}>
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </div>
                        </div>

                        {message.facilities && message.facilities.length > 0 ? (
                          <section className="overflow-hidden rounded-xl border border-carbon-20 bg-white" aria-label={`Nearby places, ${message.facilities.length} results`}>
                            <div className="flex items-center gap-2 border-b border-carbon-20 px-3 py-2 text-xs font-semibold text-carbon-80">
                              <MapPin className="h-4 w-4 text-ap-link" aria-hidden="true" />
                              <span>Nearby places ({message.facilities.length})</span>
                            </div>
                            <div className="divide-y divide-carbon-10">
                              {message.facilities.map((facility, facilityIndex) => (
                                <div key={`${facilityIndex}-${facility.uri}`} className="flex items-start justify-between gap-3 px-3 py-2.5">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-carbon-90 dark:text-white">{facility.title}</p>
                                    {facility.snippet ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-carbon-60">{facility.snippet}</p> : null}
                                  </div>
                                  <a
                                    href={facility.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`View ${facility.title} on Google Maps`}
                                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ap-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary"
                                  >
                                    <span>Map</span>
                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                  </a>
                                </div>
                              ))}
                            </div>
                          </section>
                        ) : null}

                        {message.groundingSources && message.groundingSources.length > 0 ? (
                          <section className="overflow-hidden rounded-xl border border-carbon-20 bg-white" aria-label={`Web sources, ${message.groundingSources.length} results`}>
                            <div className="flex items-center gap-2 border-b border-carbon-20 px-3 py-2 text-xs font-semibold text-carbon-80">
                              <Search className="h-4 w-4 text-ap-link" aria-hidden="true" />
                              <span>Sources ({message.groundingSources.length})</span>
                            </div>
                            <div className="divide-y divide-carbon-10">
                              {message.groundingSources.map((source, sourceIndex) => (
                                <a
                                  key={`${sourceIndex}-${source.uri}`}
                                  href={source.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Open source: ${source.title}`}
                                  className="flex min-h-[44px] items-center justify-between gap-3 px-3 py-2 text-sm text-carbon-90 transition-colors hover:bg-carbon-05 dark:hover:bg-carbon-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ap-primary"
                                >
                                  <span className="min-w-0 truncate font-medium">{source.title}</span>
                                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-carbon-60">
                                    {source.domain || 'Source'}
                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                  </span>
                                </a>
                              ))}
                            </div>
                          </section>
                        ) : null}

                        {message.providerSource ? (
                          <p className="px-1 text-xs text-carbon-60">Answered via {message.providerSource}</p>
                        ) : null}
                      </div>
                    </motion.div>
                  ))}

                  {loading ? (
                    <div className="flex items-center gap-2 px-1 py-2 text-sm text-carbon-60" role="status" aria-live="polite">
                      {reduceMotion ? (
                        <Search className="h-4 w-4 text-ap-link" aria-hidden="true" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-ap-link" aria-hidden="true" />
                      )}
                      <span>{groundingMode === 'maps' ? 'Looking for nearby places…' : groundingMode === 'search' ? 'Checking current sources…' : 'Preparing an answer…'}</span>
                    </div>
                  ) : null}

                  <div ref={messagesEndRef} />
                </div>

                <div className="shrink-0 border-t border-carbon-20 bg-white px-3 pb-3 pt-3 sm:px-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <label htmlFor="chat-grounding-mode" className="shrink-0 text-xs font-medium text-carbon-60">Sources</label>
                      <select
                        id="chat-grounding-mode"
                        aria-label="Answer sources"
                        value={groundingMode}
                        onChange={(event) => chooseGroundingMode(event.target.value as 'auto' | 'maps' | 'search')}
                        className="min-h-[44px] max-w-[160px] rounded-lg border border-carbon-20 bg-white px-2.5 text-sm text-carbon-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary"
                      >
                        <option value="auto">Automatic</option>
                        <option value="maps">Nearby places</option>
                        <option value="search">Live web</option>
                      </select>
                    </div>
                    {userLocation ? (
                      <span className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 text-xs font-medium text-blue-800">
                        <MapPin className="h-4 w-4" aria-hidden="true" /> Location on
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={requestLocation}
                        className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-carbon-70 transition-colors hover:bg-carbon-05 dark:hover:bg-carbon-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary"
                        aria-label="Enable location for nearby results"
                      >
                        <MapPin className="h-4 w-4" aria-hidden="true" /> Location
                      </button>
                    )}
                  </div>

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!loading) sendMessage(input);
                    }}
                  >
                    <label htmlFor="chat-message-input" className="sr-only">Message the AI Advisor</label>
                    <div className="relative">
                      <textarea
                        id="chat-message-input"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about hazards, farming, or local services…"
                        aria-describedby="chat-input-help"
                        className="max-h-32 min-h-[48px] w-full resize-y rounded-xl border border-carbon-20 bg-carbon-05 py-3 pl-3.5 pr-14 text-sm leading-relaxed text-carbon-90 dark:text-white placeholder:text-carbon-60 dark:placeholder:text-carbon-50 focus:border-ap-primary focus:outline-none focus:ring-2 focus:ring-ap-primary/20"
                        rows={1}
                      />
                      <button
                        type="submit"
                        disabled={!input.trim() || loading}
                        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg bg-primary text-ap-action-fg transition-colors hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Send message"
                        title="Send message"
                      >
                        <Send className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </form>
                  <p id="chat-input-help" className="mt-1.5 px-1 text-xs text-carbon-60">
                    Enter to send · Shift+Enter for a new line
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
