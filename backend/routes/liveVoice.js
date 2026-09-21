import { WebSocketServer } from 'ws';
import express from 'express';
import { GoogleGenAI, Modality } from '@google/genai';
import { routeSkills, searchRAG, GOVT_OFFICE_DIRECTORY } from '../../rag_pipeline/index.js';

export const liveVoiceRouter = express.Router();

// GET /api/live-voice/status
liveVoiceRouter.get('/status', (req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_BACKUP);
  res.json({
    status: 'ok',
    model: 'gemini-3.8-live',
    hasApiKey: hasKey,
    voices: ['Aoede', 'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'],
    defaultVoice: 'Aoede',
    defaultSampleRateInput: 16000,
    defaultSampleRateOutput: 24000,
    supportedHazards: ['Flood', 'Cyclone', 'Drought', 'Cold Wave', 'Multi-Hazard'],
    ragIntegrated: true,
    skillsRouted: true
  });
});

// POST /api/live-voice/context (Preview dynamic RAG and skills context)
liveVoiceRouter.post('/context', (req, res) => {
  const { district = 'Sunamganj', hazard = 'Flood' } = req.body || {};
  const ragData = searchRAG(district, { district });
  let routedSkills = '';
  try {
    routedSkills = routeSkills({
      district_name: district,
      hazard_type: hazard,
      severity_score: 0.75,
      confidence: 0.90
    });
  } catch (err) {
    routedSkills = err.message;
  }

  res.json({
    district,
    hazard,
    districtBaseline: ragData.districtBaseline,
    topKnowledgeSources: ragData.results.slice(0, 3).map(r => ({ title: r.title, category: r.category })),
    routedSkillsLength: routedSkills.length,
    protocolsSummary: ['DAE', 'BRRI', 'BARI', 'DLS', 'DoF', 'DPHE', 'BMD', 'BWDB']
  });
});

/**
 * Builds the comprehensive, voice-optimized system instructions
 * grounding the Live API model in the official RAG pipeline and institutional skills.
 */
function buildVoiceSystemInstruction(district = 'Sunamganj', hazard = 'Flood') {
  const ragData = searchRAG(district, { district });
  let routedSkills = '';
  try {
    routedSkills = routeSkills({
      district_name: district,
      hazard_type: hazard,
      severity_score: 0.75,
      confidence: 0.90
    });
  } catch (e) {
    console.warn('[Live Voice] routeSkills warning:', e.message);
  }

  const baseline = ragData.districtBaseline;
  const baselineSection = baseline ? `
DISTRICT CONTEXT (${baseline.name || baseline.district || district}):
- Division: ${baseline.division || 'Bangladesh'}
- Primary Hazards: ${(baseline.predominant_hazards || []).join(', ')}
- Critical Assets at Risk: ${(baseline.critical_infrastructure_at_risk || []).join(', ')}
- Field Extension Officers: DAE (${baseline.dae_officer || 'Upazila Agriculture Officer'}), DLS (${baseline.dls_officer || 'Upazila Livestock Officer'}), DoF (${baseline.dof_officer || 'Upazila Fisheries Officer'})
- Emergency Control Room: ${baseline.control_room || 'District Disaster Control Room'}
` : '';

  return `You are the HazardNet Real-Time Voice Advisor for Bangladesh, powered by Gemini Live API (gemini-3.8-live).
Your mission is to provide life-saving agricultural, livestock, fisheries, and disaster risk management guidance directly to farmers, local officers, and responders over spoken conversation.

CRITICAL VOICE CONVERSATION DIRECTIVES:
1. Speak naturally, warmly, and concisely in spoken conversation. Speak in 1-3 short, clear sentences per turn so the user can easily listen and respond.
2. Ground all answers in official Bangladesh Department of Agricultural Extension (DAE), BRRI, DLS, and DoF statutory protocols.
3. Recommend specific resilient crop varieties:
   - For Floods / Submergence: BRRI dhan51, BRRI dhan52 (survive 14 days submerged), BINA dhan-11, BRRI dhan79.
   - For Coastal Salinity / Storm Surge: BRRI dhan47, BRRI dhan53, BRRI dhan54, BRRI dhan73, BRRI dhan89.
   - For Drought / Dry Spells: BRRI dhan56, BRRI dhan65, BRRI dhan82, Alternate Wetting & Drying (AWD).
   - For Cold Waves / Fog: Polythene sheet covers for Boro seedbeds, Mancozeb (2g/L) for potato late blight.
4. Provide government emergency helplines when relevant:
   - Krishi Call Centre: 16123
   - Pranishampad (Livestock) Helpline: 16333
   - Disaster Early Warning: 1090
   - National Emergency: 999
5. You have real-time tool calling enabled ('search_hazard_knowledge' and 'get_emergency_contacts'). Use them whenever the user asks for specific technical details, chemical dosages, or local contacts.

${routedSkills}

${baselineSection}
`;
}

/**
 * Attaches the WebSocket Server for real-time bidirectional audio streaming
 * with Gemini Live API (gemini-3.8-live).
 */
export function setupLiveVoiceWebSocket(server) {
  const wss = new WebSocketServer({
    server,
    path: '/api/live-voice'
  });

  wss.on('connection', async (clientWs, req) => {
    console.log('[Live Voice WS] Client connected:', req.url);

    let activeDistrict = 'Sunamganj';
    let activeHazard = 'Flood';
    let liveSession = null;
    let isClosed = false;

    // Send initial handshake acknowledgement
    clientWs.send(JSON.stringify({
      type: 'connection_established',
      message: 'Connected to HazardNet Live Voice Bridge (gemini-3.8-live)',
      model: 'gemini-3.8-live',
      sampleRateInput: 16000,
      sampleRateOutput: 24000
    }));

    async function initGeminiSession(district, hazard) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_BACKUP;
      if (!apiKey) {
        console.warn('[Live Voice WS] GEMINI_API_KEY unset. Notifying client.');
        clientWs.send(JSON.stringify({
          type: 'warning',
          message: 'GEMINI_API_KEY is not configured on the server. Simulated voice assistant mode active.'
        }));
        return null;
      }

      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: { 'User-Agent': 'aistudio-build' }
          }
        });

        const systemInstruction = buildVoiceSystemInstruction(district, hazard);

        const session = await ai.live.connect({
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Aoede'
                }
              }
            },
            systemInstruction,
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            tools: [
              {
                functionDeclarations: [
                  {
                    name: 'search_hazard_knowledge',
                    description: 'Search official Bangladesh agricultural, veterinary, fisheries, and disaster RAG knowledge base for specific technical advice, varieties, or protocols.',
                    parameters: {
                      type: 'object',
                      properties: {
                        query: { type: 'string', description: 'Search term for agricultural or disaster guidance' },
                        district: { type: 'string', description: 'District name in Bangladesh' }
                      },
                      required: ['query']
                    }
                  },
                  {
                    name: 'get_emergency_contacts',
                    description: 'Look up official government hotlines (Krishi Call Centre 16123, Pranishampad 16333, Disaster 1090) and district extension officers.',
                    parameters: {
                      type: 'object',
                      properties: {
                        district: { type: 'string', description: 'District name' }
                      }
                    }
                  }
                ]
              }
            ]
          },
          callbacks: {
            onmessage: async (message) => {
              if (isClosed) return;

              // 1. Forward model output audio chunks (24kHz PCM base64) to client
              const parts = message.serverContent?.modelTurn?.parts || [];
              for (const part of parts) {
                if (part.inlineData?.data) {
                  clientWs.send(JSON.stringify({
                    type: 'audio',
                    audio: part.inlineData.data
                  }));
                }
                if (part.text) {
                  clientWs.send(JSON.stringify({
                    type: 'model_transcript',
                    text: part.text
                  }));
                }
              }

              // 2. Interruption event
              if (message.serverContent?.interrupted) {
                clientWs.send(JSON.stringify({
                  type: 'interrupted'
                }));
              }

              // 3. User speech transcript if emitted
              if (message.serverContent?.inputAudioTranscription?.transcript) {
                clientWs.send(JSON.stringify({
                  type: 'user_transcript',
                  text: message.serverContent.inputAudioTranscription.transcript
                }));
              }

              // 4. Handle Tool Calls
              if (message.toolCall?.functionCalls) {
                const functionResponses = [];
                for (const call of message.toolCall.functionCalls) {
                  clientWs.send(JSON.stringify({
                    type: 'tool_call',
                    name: call.name,
                    args: call.args
                  }));

                  if (call.name === 'search_hazard_knowledge') {
                    const searchRes = searchRAG(call.args.query, { district: call.args.district || activeDistrict });
                    functionResponses.push({
                      response: {
                        output: {
                          results: searchRes.results.slice(0, 3).map(r => ({
                            title: r.title,
                            category: r.category,
                            summary: r.content.slice(0, 250)
                          })),
                          district: searchRes.districtBaseline?.name || activeDistrict
                        }
                      },
                      id: call.id,
                      name: call.name
                    });
                  } else if (call.name === 'get_emergency_contacts') {
                    const searchRes = searchRAG(call.args.district || activeDistrict, { district: call.args.district || activeDistrict });
                    functionResponses.push({
                      response: {
                        output: {
                          directory: GOVT_OFFICE_DIRECTORY,
                          district: call.args.district || activeDistrict,
                          officers: {
                            dae: searchRes.districtBaseline?.dae_officer,
                            dls: searchRes.districtBaseline?.dls_officer,
                            dof: searchRes.districtBaseline?.dof_officer,
                            control_room: searchRes.districtBaseline?.control_room
                          }
                        }
                      },
                      id: call.id,
                      name: call.name
                    });
                  }
                }

                if (functionResponses.length > 0) {
                  try {
                    await session.sendToolResponse({ functionResponses });
                  } catch (toolErr) {
                    console.error('[Live Voice WS] sendToolResponse error:', toolErr);
                  }
                }
              }

              // Turn complete notification
              if (message.serverContent?.turnComplete) {
                clientWs.send(JSON.stringify({ type: 'turn_complete' }));
              }
            },
            onerror: (err) => {
              if (isClosed) return;
              console.error('[Live Voice WS] Gemini Live session error:', err?.message || err);
              clientWs.send(JSON.stringify({
                type: 'error',
                message: err?.message || 'Gemini Live session error'
              }));
            },
            onclose: (e) => {
              if (isClosed) return;
              console.log('[Live Voice WS] Gemini Live session closed');
              clientWs.send(JSON.stringify({ type: 'session_closed' }));
            }
          }
        });

        clientWs.send(JSON.stringify({
          type: 'session_ready',
          district,
          hazard,
          message: `Live session connected to gemini-3.8-live for ${district}`
        }));

        return session;
      } catch (connErr) {
        console.error('[Live Voice WS] Failed to connect to Gemini Live API:', connErr);
        clientWs.send(JSON.stringify({
          type: 'error',
          message: `Live API connection failed: ${connErr.message}`
        }));
        return null;
      }
    }

    // Initialize session with initial defaults
    liveSession = await initGeminiSession(activeDistrict, activeHazard);

    clientWs.on('message', async (data) => {
      try {
        let msg;
        if (typeof data === 'string') {
          msg = JSON.parse(data);
        } else if (Buffer.isBuffer(data)) {
          // Check if buffer is UTF-8 JSON or raw PCM bytes
          const str = data.toString('utf8');
          if (str.startsWith('{') && str.endsWith('}')) {
            msg = JSON.parse(str);
          } else {
            // Raw PCM 16kHz binary buffer
            msg = { type: 'audio', audio: data.toString('base64') };
          }
        }

        if (!msg) return;

        if (msg.type === 'audio' && msg.audio) {
          if (liveSession) {
            liveSession.sendRealtimeInput({
              audio: {
                data: msg.audio,
                mimeType: 'audio/pcm;rate=16000'
              }
            });
          }
        } else if (msg.type === 'text' && msg.text) {
          if (liveSession) {
            liveSession.sendRealtimeInput({
              text: msg.text
            });
          }
        } else if (msg.type === 'setup' || msg.type === 'update_context') {
          activeDistrict = msg.district || activeDistrict;
          activeHazard = msg.hazard || activeHazard;
          if (liveSession) {
            try { liveSession.close(); } catch (_) {}
          }
          liveSession = await initGeminiSession(activeDistrict, activeHazard);
        }
      } catch (err) {
        console.warn('[Live Voice WS] Error handling incoming client payload:', err.message);
      }
    });

    clientWs.on('close', () => {
      isClosed = true;
      if (liveSession) {
        try { liveSession.close(); } catch (_) {}
      }
    });
  });

  return wss;
}
