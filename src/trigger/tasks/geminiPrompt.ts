import { task } from "@trigger.dev/sdk/v3";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Trigger.dev task for running Gemini model prompt instructions.
 * Orchestrates calls to Google's Generative AI API with fallback support.
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

    // 1. Fallback Loop: Sequential execution over candidate models.
    for (const modelName of modelCandidates) {
      try {
        console.log(`[DEBUG] Attempting live API execution with Google model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });

        // Initialize request contents array with the text prompt
        let contents: any[] = [payload.prompt];

        // 2. Assemble connected Images (if any)
        if (payload.images && payload.images.length > 0) {
          for (const imgUrl of payload.images) {
            // Process base64 formatted data URLs
            if (imgUrl.startsWith('data:image/')) {
              let cleanBase64 = imgUrl;
              if (cleanBase64.includes(',')) {
                cleanBase64 = cleanBase64.split(',')[1];
              }
              contents.push({
                inlineData: {
                  data: cleanBase64,
                  mimeType: 'image/png'
                }
              });
            } else {
              // Fetch remote image resources and convert to base64 inlineData
              const response = await fetch(imgUrl);
              const buffer = await response.arrayBuffer();
              contents.push({
                inlineData: {
                  data: Buffer.from(buffer).toString("base64"),
                  mimeType: "image/jpeg"
                }
              });
            }
          }
        }

        // 3. Assemble connected Videos (if any)
        if (payload.video && payload.video.data) {
          let cleanBase64 = payload.video.data;
          if (cleanBase64.includes(',')) {
            cleanBase64 = cleanBase64.split(',')[1];
          }
          contents.push({
            inlineData: {
              data: cleanBase64,
              mimeType: payload.video.type || 'video/mp4'
            }
          });
        }

        // 4. Assemble connected Audio (if any)
        if (payload.audio && payload.audio.data) {
          let cleanBase64 = payload.audio.data;
          if (cleanBase64.includes(',')) {
            cleanBase64 = cleanBase64.split(',')[1];
          }
          contents.push({
            inlineData: {
              data: cleanBase64,
              mimeType: payload.audio.type || 'audio/mp3'
            }
          });
        }

        // 5. Assemble other files/documents like PDFs (if any)
        if (payload.file && payload.file.data) {
          let cleanBase64 = payload.file.data;
          if (cleanBase64.includes(',')) {
            cleanBase64 = cleanBase64.split(',')[1];
          }
          contents.push({
            inlineData: {
              data: cleanBase64,
              mimeType: payload.file.type || 'application/pdf'
            }
          });
        }

        // 6. Invoke Google's API to generate content with system prompt instructions
        const result = await model.generateContent({
          contents,
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

