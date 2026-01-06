
import { GoogleGenAI } from "@google/genai";
import { AppContext, Language } from "./types";

export class GuardianAIService {
  constructor() {
    // API key initialization is handled within request context for reliability.
  }

  async getResponse(userInput: string, context: AppContext): Promise<{text: string, grounding?: any[]}> {
    const isMapQuery = userInput.toLowerCase().includes('hospital') || userInput.toLowerCase().includes('police') || userInput.toLowerCase().includes('nearby');
    
    const systemInstruction = `
      You are Guardian AI, an emergency-aware safety assistant inside "Silent Signals".
      
      Responsibilities:
      1. Detect distress, panic, or emergency situations.
      2. Respond calmly, clearly, and reassuringly.
      3. Support English, Hindi, and Hinglish.
      4. Adapt tone based on risk levels.
      5. Provide location-based guidance if asked for help.

      CONTEXT:
      - Current Language: ${context.language}
      - Risk Level: ${context.riskLevel}/100
      - Location Status: ${context.locationAccess}
    `;

    try {
      // Fix: Create a new GoogleGenAI instance right before making an API call to ensure it always uses the most up-to-date API key from environment.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const config: any = {
        systemInstruction: systemInstruction,
        temperature: 0.3,
        // Fix: Removed maxOutputTokens to follow the recommendation: "Avoid setting this if not required to prevent the response from being blocked due to reaching max tokens."
      };

      if (isMapQuery) {
        config.tools = [{ googleMaps: {} }];
        // In a real browser we'd use geolocation. For now we use a fixed point for demo.
        config.toolConfig = {
          retrievalConfig: {
            latLng: { latitude: 28.6139, longitude: 77.2090 } // New Delhi coordinates
          }
        };
      }

      // Fix: Use the appropriate models as per task type and feature support (maps grounding requires 2.5 series).
      const response = await ai.models.generateContent({
        model: isMapQuery ? 'gemini-2.5-flash' : 'gemini-3-flash-preview',
        contents: userInput,
        config: config,
      });

      return {
        // Fix: Correctly access the .text property as per guidelines (it is a property, not a method).
        text: response.text || "I am here. Stay calm.",
        grounding: response.candidates?.[0]?.groundingMetadata?.groundingChunks
      };
    } catch (error) {
      console.error("Guardian AI Communication Error:", error);
      return { text: "I am here. Stay calm and reach for help." };
    }
  }
}
