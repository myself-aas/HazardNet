import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  PhoneOff, 
  Radio, 
  MapPin, 
  AlertCircle,
  Database,
  Sparkles,
  RefreshCw,
  HelpCircle,
  MessageSquare
} from 'lucide-react';

interface TranscriptItem {
  id: string;
  sender: 'user' | 'model' | 'tool' | 'system';
  text: string;
  timestamp: string;
  toolName?: string;
}

interface LiveVoiceAdvisorProps {
  initialDistrict?: string;
  onSwitchToText?: () => void;
  onClose?: () => void;
}

const BANGLADESH_DISTRICTS = [
  'Sunamganj', 'Sylhet', 'Habiganj', 'Moulvibazar',
  'Kurigram', 'Gaibandha', 'Bogura', 'Sirajganj', 'Jamalpur', 'Tangail',
  'Satkhira', 'Khulna', 'Bagerhat', 'Cox\'s Bazar', 'Chattogram', 'Noakhali',
  'Patuakhali', 'Bhola', 'Barishal', 'Barguna', 'Pirojpur', 'Jhalokati',
  'Dhaka', 'Gazipur', 'Narayanganj', 'Narsingdi', 'Munshiganj', 'Manikganj',
  'Mymensingh', 'Netrokona', 'Sherpur', 'Kishoreganj',
  'Rajshahi', 'Naogaon', 'Natore', 'Chapai Nawabganj', 'Pabna',
  'Rangpur', 'Dinajpur', 'Nilphamari', 'Lalmonirhat', 'Panchagarh', 'Thakurgaon'
];

export const LiveVoiceAdvisor: React.FC<LiveVoiceAdvisorProps> = ({
  initialDistrict = 'Sunamganj',
  onSwitchToText,
  onClose,
}) => {
  const [district, setDistrict] = useState<string>(initialDistrict);
  const [hazard, setHazard] = useState<string>('Flood');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking' | 'interrupted' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const isMutedRef = useRef<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  isMutedRef.current = isMuted;

  const addTranscript = (sender: TranscriptItem['sender'], text: string, toolName?: string) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setTranscripts(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, sender, text, timestamp: timeStr, toolName }
    ]);
  };

  const stopAllAudioPlayback = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (_) {}
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;
    setStatus(prev => (prev === 'speaking' ? 'listening' : prev));
  }, []);

  const play24kHzAudioChunk = useCallback((base64Data: string) => {
    try {
      if (!outputAudioCtxRef.current || outputAudioCtxRef.current.state === 'closed') {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        outputAudioCtxRef.current = new AudioCtxClass({ sampleRate: 24000 });
      }

      const ctx = outputAudioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const binary = atob(base64Data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const dataView = new DataView(bytes.buffer);
      const numSamples = Math.floor(bytes.length / 2);
      const float32 = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const int16 = dataView.getInt16(i * 2, true);
        float32[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7FFF;
      }

      const audioBuffer = ctx.createBuffer(1, numSamples, 24000);
      audioBuffer.copyToChannel(float32, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      const startTime = Math.max(currentTime, nextStartTimeRef.current);
      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;

      activeSourcesRef.current.push(source);
      setStatus('speaking');

      source.onended = () => {
        const index = activeSourcesRef.current.indexOf(source);
        if (index > -1) {
          activeSourcesRef.current.splice(index, 1);
        }
        if (activeSourcesRef.current.length === 0 && ctx.currentTime >= nextStartTimeRef.current - 0.05) {
          setStatus('listening');
        }
      };
    } catch (err) {
      console.warn('[LiveVoice] Audio chunk decoding error:', err);
    }
  }, []);

  const setupMicrophone = async (ws: WebSocket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      mediaStreamRef.current = stream;

      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const inputCtx = new AudioCtxClass({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputCtx;

      const source = inputCtx.createMediaStreamSource(stream);
      const analyser = inputCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      analyser.connect(processor);
      processor.connect(inputCtx.destination);

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current || !ws || ws.readyState !== WebSocket.OPEN) return;

        const inputBuffer = e.inputBuffer.getChannelData(0);
        const buffer = new ArrayBuffer(inputBuffer.length * 2);
        const view = new DataView(buffer);

        let sumSquares = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          const s = Math.max(-1, Math.min(1, inputBuffer[i]));
          sumSquares += s * s;
          view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        const rms = Math.sqrt(sumSquares / inputBuffer.length);
        setAudioLevel(Math.min(1, rms * 5));

        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Audio = btoa(binary);

        ws.send(JSON.stringify({
          type: 'audio',
          audio: base64Audio
        }));
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied or unavailable.';
      console.error('[LiveVoice] Mic error:', msg);
      setErrorMessage(`Microphone access is required for real-time voice: ${msg}`);
      setStatus('error');
    }
  };

  const connectWebSocket = useCallback(() => {
    setStatus('connecting');
    setErrorMessage(null);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/live-voice`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'setup',
        district,
        hazard
      }));
      setupMicrophone(ws);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'connection_established' || msg.type === 'session_ready') {
          setStatus('listening');
          addTranscript('system', `Connected to Gemini Live (${msg.model || 'gemini-3.8-live'}) for ${district} with active RAG protocols.`);
        } else if (msg.type === 'audio' && msg.audio) {
          play24kHzAudioChunk(msg.audio);
        } else if (msg.type === 'interrupted') {
          stopAllAudioPlayback();
          setStatus('interrupted');
          setTimeout(() => setStatus('listening'), 800);
        } else if (msg.type === 'model_transcript' && msg.text) {
          addTranscript('model', msg.text);
        } else if (msg.type === 'user_transcript' && msg.text) {
          addTranscript('user', msg.text);
        } else if (msg.type === 'tool_call') {
          setActiveTool(msg.name);
          const toolDesc = msg.name === 'search_hazard_knowledge' 
            ? `Retrieved BRRI/DAE/DLS RAG protocols for "${msg.args?.query || district}"`
            : `Consulted official government emergency directory for ${district}`;
          addTranscript('tool', toolDesc, msg.name);
          setTimeout(() => setActiveTool(null), 3000);
        } else if (msg.type === 'warning' || msg.type === 'info') {
          addTranscript('system', msg.message);
        } else if (msg.type === 'error') {
          setErrorMessage(msg.message);
          setStatus('error');
        }
      } catch (err) {
        console.warn('[LiveVoice] WS message parse error:', err);
      }
    };

    ws.onerror = (e) => {
      console.error('[LiveVoice] WS Error:', e);
      setErrorMessage('Failed to connect to Live Voice WebSocket server.');
      setStatus('error');
    };

    ws.onclose = () => {
      setStatus('idle');
    };
  }, [district, hazard, play24kHzAudioChunk, stopAllAudioPlayback]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
        inputAudioCtxRef.current.close();
      }
      if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== 'closed') {
        outputAudioCtxRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [connectWebSocket]);

  // Audio waveform animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;
    const render = () => {
      phase += 0.08;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;
      const centerY = h / 2;

      const isLive = status === 'listening' || status === 'speaking';
      const amp = status === 'speaking' 
        ? 24 
        : status === 'listening' && !isMuted 
        ? Math.max(6, audioLevel * 28) 
        : 3;

      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = status === 'speaking' 
        ? '#0284c7' 
        : isMuted 
        ? '#94a3b8' 
        : '#10b981';

      for (let x = 0; x < w; x++) {
        const normX = x / w;
        const envelope = Math.sin(normX * Math.PI);
        const y = centerY + Math.sin(normX * 8 + phase) * amp * envelope;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (isLive) {
        ctx.beginPath();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = status === 'speaking' ? 'rgba(56, 189, 248, 0.4)' : 'rgba(74, 222, 128, 0.4)';
        for (let x = 0; x < w; x++) {
          const normX = x / w;
          const envelope = Math.sin(normX * Math.PI);
          const y = centerY + Math.cos(normX * 12 - phase * 0.8) * (amp * 0.6) * envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [status, isMuted, audioLevel]);

  const handleDistrictChange = (newDistrict: string) => {
    setDistrict(newDistrict);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update_context',
        district: newDistrict,
        hazard
      }));
      addTranscript('system', `Switched context to ${newDistrict}. Routing local RAG baseline.`);
    }
  };

  const handleHazardChange = (newHazard: string) => {
    setHazard(newHazard);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update_context',
        district,
        hazard: newHazard
      }));
      addTranscript('system', `Updated hazard protocol to ${newHazard}.`);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleInterrupt = () => {
    stopAllAudioPlayback();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text: '[User interrupted model speech]' }));
    }
  };

  return (
    <div className="flex flex-col h-full bg-white text-slate-900 select-none">
      {/* Top Bar / Status Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700">
            <Radio className={`w-4 h-4 ${status === 'listening' || status === 'speaking' ? 'animate-pulse' : ''}`} />
            {status === 'speaking' && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-sky-500 rounded-full animate-ping" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-tight text-slate-800">
                Live Voice Advisor
              </span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                gemini-3.8-live
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className={`w-1.5 h-1.5 rounded-full ${
                status === 'speaking' ? 'bg-sky-500 animate-pulse' :
                status === 'listening' ? 'bg-emerald-500' :
                status === 'connecting' ? 'bg-amber-400 animate-ping' :
                'bg-slate-400'
              }`} />
              <span className="capitalize font-medium">
                {status === 'speaking' ? 'HazardNet Speaking...' :
                 status === 'listening' ? (isMuted ? 'Mic Muted' : 'Listening for your voice...') :
                 status === 'connecting' ? 'Connecting to Live API...' :
                 status === 'interrupted' ? 'Interrupted' :
                 'Idle'}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Mode Toggle */}
        <div className="flex items-center gap-1.5">
          {onSwitchToText && (
            <button
              id="switch-to-text-chat-btn"
              onClick={onSwitchToText}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors flex items-center gap-1.5"
              title="Switch to text chat"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Text Mode</span>
            </button>
          )}
          {onClose && (
            <button
              id="close-live-voice-btn"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* District & Hazard Context Strip */}
      <div className="px-4 py-2 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>District:</span>
          <select
            id="live-voice-district-select"
            value={district}
            onChange={(e) => handleDistrictChange(e.target.value)}
            className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {BANGLADESH_DISTRICTS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
          <Database className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>Hazard:</span>
          <select
            id="live-voice-hazard-select"
            value={hazard}
            onChange={(e) => handleHazardChange(e.target.value)}
            className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="Flood">Flood (BRRI Submergence)</option>
            <option value="Cyclone">Cyclone (Surge & Salinity)</option>
            <option value="Drought">Drought (AWD & Resilient)</option>
            <option value="Cold Wave">Cold Wave & Fog</option>
            <option value="Multi-Hazard">Multi-Hazard</option>
          </select>
        </div>
      </div>

      {/* Central Visualizer & Reactive Waveform */}
      <div className="p-4 flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white border-b border-slate-200 shrink-0">
        <div className="w-full max-w-sm flex flex-col items-center">
          <canvas
            ref={canvasRef}
            width={320}
            height={64}
            className="w-full h-16 rounded-xl bg-slate-900 shadow-inner"
          />

          <div className="mt-2 text-center">
            {activeTool && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium"
              >
                <Sparkles className="w-3 h-3 text-amber-600 animate-spin" />
                <span>RAG Protocol: Executing {activeTool}...</span>
              </motion.div>
            )}
            {!activeTool && (
              <span className="text-[11px] text-slate-500 font-medium">
                {status === 'speaking' 
                  ? 'Speaking through 24kHz audio stream' 
                  : isMuted 
                  ? 'Unmute mic to speak with the advisor' 
                  : 'Speak into your microphone in English or Bengali'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Live Transcript / Activity Log */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
        {transcripts.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <Radio className="w-10 h-10 mb-2 opacity-30 text-blue-600" />
            <p className="text-sm font-semibold text-slate-700">Live Voice Conversation Initialized</p>
            <p className="text-xs text-slate-500 max-w-xs mt-1">
              Ask anything about flood-tolerant rice varieties, livestock evacuation killas, cyclone salinity management, or DAE extension hotlines.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5 max-w-sm">
              <button
                onClick={() => {
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                      type: 'text',
                      text: `Which BRRI submergence rice varieties survive flash floods in ${district}?`
                    }));
                  }
                }}
                className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                "Which BRRI rice survives floods in {district}?"
              </button>
              <button
                onClick={() => {
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                      type: 'text',
                      text: `What is the hotline for livestock medical care in ${district}?`
                    }));
                  }
                }}
                className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                "Livestock medical emergency hotline"
              </button>
            </div>
          </div>
        )}

        {transcripts.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex flex-col text-xs ${
              item.sender === 'user' ? 'items-end' :
              item.sender === 'model' ? 'items-start' :
              'items-center'
            }`}
          >
            {item.sender === 'user' && (
              <div className="max-w-[85%] bg-blue-600 text-white px-3 py-2 rounded-2xl rounded-tr-none shadow-sm">
                <p className="font-sans leading-relaxed">{item.text}</p>
                <span className="text-[10px] text-blue-200 mt-0.5 block text-right">{item.timestamp}</span>
              </div>
            )}

            {item.sender === 'model' && (
              <div className="max-w-[85%] bg-slate-100 text-slate-900 border border-slate-200 px-3 py-2 rounded-2xl rounded-tl-none shadow-sm">
                <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold text-blue-700">
                  <Sparkles className="w-3 h-3" />
                  <span>HazardNet Voice (gemini-3.8-live)</span>
                </div>
                <p className="font-sans leading-relaxed">{item.text}</p>
                <span className="text-[10px] text-slate-400 mt-0.5 block">{item.timestamp}</span>
              </div>
            )}

            {item.sender === 'tool' && (
              <div className="my-1 px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-1.5 max-w-sm">
                <Database className="w-3 h-3 text-amber-600 shrink-0" />
                <span>{item.text}</span>
              </div>
            )}

            {item.sender === 'system' && (
              <div className="my-1 px-2 py-0.5 rounded text-slate-500 text-[10px] font-mono">
                {item.text}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Error Banner */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-2 bg-rose-50 border-t border-rose-200 text-rose-700 text-xs flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={connectWebSocket}
              className="px-2 py-1 bg-rose-600 text-white rounded text-[11px] font-medium hover:bg-rose-700 transition"
            >
              Retry
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice Controls Action Bar */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {/* Mute / Unmute Button */}
          <button
            id="live-voice-mute-toggle-btn"
            onClick={toggleMute}
            className={`p-3 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center font-medium transition shadow-sm ${
              isMuted 
                ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-300' 
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Interrupt Button (Stops AI Voice Immediately) */}
          <button
            id="live-voice-interrupt-btn"
            onClick={handleInterrupt}
            disabled={status !== 'speaking'}
            className="px-3 py-2 min-h-[44px] rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition"
            title="Interrupt AI speaking immediately"
          >
            <VolumeX className="w-4 h-4" />
            <span>Interrupt</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Reconnect button */}
          <button
            id="live-voice-reconnect-btn"
            onClick={connectWebSocket}
            className="p-2.5 min-w-[44px] min-h-[44px] text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition"
            title="Reset Voice Session"
            aria-label="Reset Voice Session"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* End Call / Disconnect */}
          <button
            id="live-voice-end-call-btn"
            onClick={() => {
              if (wsRef.current) wsRef.current.close();
              if (onClose) onClose();
              else if (onSwitchToText) onSwitchToText();
            }}
            className="px-3.5 py-2 min-h-[44px] bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition"
          >
            <PhoneOff className="w-4 h-4" />
            <span>End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveVoiceAdvisor;
