const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: 'Hello'
    });
    console.log(res.text);
  } catch (e) {
    console.error(e.message);
  }
}
test();
