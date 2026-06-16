import { task } from "@trigger.dev/sdk/v3";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Trigger.dev task for running Gemini model prompt instructions.
 * Orchestrates calls to Google's Generative AI API with fallback support.
 * Uses a fully structured Parts array of Part objects to prevent 400 Bad Request error.
 */
export const geminiPromptTask = task({
  id: "gemini-prompt",
  run: async (payload: {
    prompt: string;
    systemPrompt?: string;
    images?: string[];
    video?: { data: string; type: string };
    audio?: { data: string; type: string };
    file?: { data: string; type: string };
  }) => {
    const apiKey = process.env.GEMINI_API_KEY || "";

    console.log("[DEBUG] Starting live Gemini prompt execution using active model candidates.");
    const genAI = new GoogleGenerativeAI(apiKey);

    // ACTIVE GOOGLE AI STUDIO 2026 MODELS (Fallback Candidates List)
    const modelCandidates = [
      "gemini-3.5-flash",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-2.0-pro"
    ];

    let lastError: any = null;
    let responseText = "";

    // 1. Structure the contents array using Part objects (wrapping text inside { text: ... })
    // This prevents mixing plain string prompts and inlineData objects, which causes Google 400 error.
    const parts: any[] = [
      { text: payload.prompt }
    ];

    // 2. Assemble connected Images (if any) as inlineData Part objects
    if (payload.images && payload.images.length > 0) {
      for (const imgUrl of payload.images) {
        try {
          if (imgUrl.startsWith('data:image/')) {
            let cleanBase64 = imgUrl;
            if (cleanBase64.includes(',')) {
              cleanBase64 = cleanBase64.split(',')[1];
            }
            parts.push({
              inlineData: {
                data: cleanBase64,
                mimeType: 'image/png'
              }
            });
          } else {
            const response = await fetch(imgUrl);
            const buffer = await response.arrayBuffer();
            parts.push({
              inlineData: {
                data: Buffer.from(buffer).toString("base64"),
                mimeType: "image/jpeg"
              }
            });
          }
        } catch (fetchErr) {
          console.error("Failed to fetch image:", imgUrl, fetchErr);
        }
      }
    }

    // 3. Assemble connected Videos (if any) as inlineData Part objects
    if (payload.video && payload.video.data) {
      let cleanBase64 = payload.video.data;
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
      }
      parts.push({
        inlineData: {
          data: cleanBase64,
          mimeType: payload.video.type || 'video/mp4'
        }
      });
    }

    // 4. Assemble connected Audio (if any) as inlineData Part objects
    if (payload.audio && payload.audio.data) {
      let cleanBase64 = payload.audio.data;
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
      }
      parts.push({
        inlineData: {
          data: cleanBase64,
          mimeType: payload.audio.type || 'audio/mp3'
        }
      });
    }

    // 5. Assemble other files/documents like PDFs (if any) as inlineData Part objects
    if (payload.file && payload.file.data) {
      let cleanBase64 = payload.file.data;
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
      }
      parts.push({
        inlineData: {
          data: cleanBase64,
          mimeType: payload.file.type || 'application/pdf'
        }
      });
    }

    // 6. Try candidates sequentially with the structured parts array
    for (const modelName of modelCandidates) {
      try {
        console.log(`[DEBUG] Attempting live API execution with Google model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent({
          contents: parts,
          systemInstruction: payload.systemPrompt
        });

        responseText = result.response.text();
        console.log(`[DEBUG] Live API execution succeeded with model: ${modelName}`);
        break; // Successfully got response, exit the candidate loop
      } catch (err) {
        console.warn(`[DEBUG] Model ${modelName} returned an API error:`, err);
        lastError = err;
      }
    }

    // Throw the final API error if all candidates failed to execute
    if (!responseText && lastError) {
      throw lastError; 
    }

    return { response: responseText };
  },
});
