import { groq } from '@ai-sdk/groq';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { search, SafeSearchType } from 'duck-duck-scrape';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const messagesString = formData.get('messages') as string;
    const currentMode = formData.get('mode') as string || 'normal';
    
    if (!messagesString) throw new Error("No messages provided.");
    const messages = JSON.parse(messagesString);

    const currentIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const creatorName = process.env.NEXT_PUBLIC_CREATOR_NAME || "Jones Krishwin";

    // 1. BASE SYSTEM INSTRUCTIONS (Applies to all modes)
    let systemPrompt = `Your name is SnowGPT. You are an advanced AI assistant created by ${creatorName}. 
The current date and time is ${currentIST}.

[USER CONTEXT & BEHAVIOR]
The user is Jones Krishwin.
- Be concise. If asked about yourself or your creator, answer in 1 or 2 simple sentences (e.g., "I am SnowGPT, created by Jones Krishwin."). 
- Do NOT generate biographies, feature lists, or over-explain.`;

    // 2. DYNAMIC HARDWARE INSTRUCTIONS (Based on active mode)
    if (currentMode === 'esp32') {
      systemPrompt += `\n\n[CRITICAL INSTRUCTIONS FOR ESP32 HARDWARE]
If the user asks you to write hardware code, you MUST write code specifically for the ESP32.
1. Provide extremely clear, bulleted physical wiring instructions.
2. Provide the complete, valid C++ Arduino code inside a standard markdown code block (\`\`\`cpp). 
3. Ensure the code includes 'Serial.begin(115200);' and prints data clearly so the user can read it in the Serial Monitor.
4. MODERN DEPENDENCIES ONLY: You must strictly use the latest API syntax compliant with Arduino ESP32 Core v3.0+. 
   - NEVER use deprecated v2.x commands like 'ledcSetup' or 'ledcAttachPin'. 
   - ONLY use the modern 'ledcAttach(pin, freq, res)' and 'ledcWrite(pin, duty)'.
   - Assume all modern Core v3.0 breaking changes are in effect.`;
    } 
    else if (currentMode === 'arduino') {
      systemPrompt += `\n\n[CRITICAL INSTRUCTIONS FOR ARDUINO HARDWARE]
If the user asks you to write hardware code, you MUST write code specifically for standard Arduino boards (like Arduino Uno, Nano, or Mega).
1. Provide extremely clear, bulleted physical wiring instructions using standard Arduino pinouts.
2. Provide the complete, valid C++ Arduino code inside a standard markdown code block (\`\`\`cpp). 
3. Use standard Arduino commands only (e.g., 'analogWrite()', 'digitalWrite()'). NEVER use ESP32 commands like 'ledcAttach()'.
4. Ensure the code includes 'Serial.begin(9600);' or 'Serial.begin(115200);' and prints data clearly.`;
    }

    // 3. COMMON HARDWARE CLOSING
    if (currentMode === 'esp32' || currentMode === 'arduino') {
      systemPrompt += `\n\nDo NOT attempt to flash the code yourself. The user has a UI button to flash the code manually.`;
    }

    const result = await generateText({
      model: groq('openai/gpt-oss-120b', { apiKey: process.env.GROQ_API_KEY || '' }),
      system: systemPrompt,
      messages,
      tools: {
        web_search: tool({
          description: 'Search the web for current events, news, or facts.',
          parameters: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            try {
              const searchResults = await search(query, { safeSearch: SafeSearchType.STRICT });
              if (searchResults.noResults || !searchResults.results) return "No results.";
              return searchResults.results.slice(0, 5).map((r: any) => `${r.title}: ${r.snippet}`).join('\n');
            } catch (err) {
              return "Search tool unavailable.";
            }
          },
        }),
      },
      maxSteps: 5,
    });

    return Response.json({ text: result.text || "Empty response from model." });
    
  } catch (error: any) {
    return Response.json({ text: `System Alert: ${error.message}` });
  }
}