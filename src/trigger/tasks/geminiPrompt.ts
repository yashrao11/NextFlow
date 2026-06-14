import { task } from "@trigger.dev/sdk/v3";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const geminiPromptTask = task({
  id: "gemini-prompt",
  run: async (payload: { prompt: string; systemPrompt?: string; images?: string[] }) => {
    const apiKey = process.env.GEMINI_API_KEY || "";

    console.log("[DEBUG] Starting live Gemini prompt execution using active model candidates.");
    const genAI = new GoogleGenerativeAI(apiKey);

    // ACTIVE GOOGLE AI STUDIO 2026 MODELS
    const modelCandidates = [
      "gemini-3.5-flash",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-2.0-pro"
    ];

    let lastError: any = null;
    let responseText = "";

    for (const modelName of modelCandidates) {
      try {
        console.log(`[DEBUG] Attempting live API execution with Google model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });

        let contents: any[] = [payload.prompt];

        if (payload.images && payload.images.length > 0) {
          for (const imgUrl of payload.images) {
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

    if (!responseText && lastError) {
      throw lastError; // Throw the actual Google API error if all candidates fail
    }

    return { response: responseText };
  },
});
