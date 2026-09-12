// Removed direct import of GoogleGenAI; will be loaded lazily when needed
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate an advisory text for a given hazard prediction using Google GenAI SDK.
 * @param {Object} payload - { hazard, probability, metadata }
 * @returns {Promise<string>} advisory text
 */
export async function generateAdvisory(payload) {
  const { hazard, probability, metadata } = payload;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return `Advisory for ${hazard}: Probability ${(probability * 100).toFixed(1)}%. Monitor local weather and coordinate with Upazila Agriculture Officer.`;
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are an expert Bangladesh agricultural disaster response advisor. Based on the following hazard prediction:

Hazard: ${hazard}
Probability: ${probability}
Metadata: ${JSON.stringify(metadata)}

Provide a concise, practical, action-oriented advisory for agricultural extension officers and farmers.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || 'Monitor local weather conditions and maintain field drainage.';
  } catch (error) {
    console.warn(`[AdvisoryAgent] Generation fallback for ${hazard}:`, error.message);
    return `Advisory for ${hazard} (Probability ${(probability * 100).toFixed(1)}%): Maintain active field vigilance, clear drainage canals, and contact Union Parishad Extension Officer.`;
  }
}

export default { generateAdvisory };
