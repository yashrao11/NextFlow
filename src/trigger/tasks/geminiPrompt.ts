import { task } from "@trigger.dev/sdk/v3";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

/**
 * Trigger.dev task for running Gemini model prompt instructions.
 * Orchestrates calls to Google's Generative AI API with fallback support.
 * Uses a fully structured Parts array of Part objects to prevent 400 Bad Request error.
 *
 * Images may be provided as:
 *  - { __inline: "data:image/..." }  — small/URL images passed directly
 *  - { __filePath: "/tmp/..." }      — large images offloaded to local disk by the server
 */
export const geminiPromptTask = task({
  id: "gemini-prompt",
  run: async (payload: {
    prompt: string;
    systemPrompt?: string;
    /** Each element is either { __inline: string } (base64/URL) or { __filePath: string } (temp file) */
    images?: Array<{ __inline?: string; __filePath?: string } | string>;
    video?: { data: string; type: string };
    videoFilePath?: string;
    videoType?: string;
    audio?: { data: string; type: string };
    audioFilePath?: string;
    audioType?: string;
    file?: { data: string; type: string };
    fileFilePath?: string;
    fileType?: string;
    model?: string;
  }) => {
    const apiKey = process.env.GEMINI_API_KEY || "";

    console.log("[DEBUG] Starting live Gemini prompt execution using active model candidates.");
    const genAI = new GoogleGenerativeAI(apiKey);

    // Map UI model display name options to Google Generative AI API IDs
    const modelMap: Record<string, string> = {
      "Gemini 3.5 Flash": "gemini-3.5-flash",
      "Gemini 3.1 Pro": "gemini-3.1-pro",
      "Gemini 3.1 Flash-Lite": "gemini-3.1-flash-lite",
      "Gemini 2.5 Pro": "gemini-2.5-pro",
      "Gemini 2.5 Flash": "gemini-2.5-flash",
      "gemini-3.5-flash": "gemini-3.5-flash",
      "gemini-3.1-pro": "gemini-3.1-pro",
      "gemini-3.1-flash-lite": "gemini-3.1-flash-lite",
      "gemini-2.5-pro": "gemini-2.5-pro",
      "gemini-2.5-flash": "gemini-2.5-flash"
    };

    const selectedModelId = modelMap[payload.model || ""] || "gemini-3.1-flash-lite";

    // Build candidates list, prioritizing the selected model first
    const modelCandidates = Array.from(new Set([
      selectedModelId,
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.1-pro",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-2.0-pro"
    ]));

    let lastError: any = null;
    let responseText = "";

    // 1. Structure the contents array using Part objects (wrapping text inside { text: ... })
    // This prevents mixing plain string prompts and inlineData objects, which causes Google 400 error.
    const parts: any[] = [
      { text: payload.prompt }
    ];

    // Helper to read base64 from either a temp file or an inline data URL
    const resolveBase64 = (filePath: string | undefined, inlineData: string | undefined): string | null => {
      if (filePath) {
        try {
          const buf = fs.readFileSync(filePath);
          try { fs.unlinkSync(filePath); } catch (_) {}
          return buf.toString("base64");
        } catch (err) {
          console.error("[DEBUG] Failed to read temp file:", filePath, err);
          return null;
        }
      }
      if (inlineData) {
        return inlineData.includes(",") ? inlineData.split(",")[1] : inlineData;
      }
      return null;
    };

    // 2. Assemble connected Images (if any) as inlineData Part objects
    if (payload.images && payload.images.length > 0) {
      for (const imgEntry of payload.images) {
        try {
          let base64: string | null = null;
          let mimeType = "image/png";

          if (typeof imgEntry === "string") {
            // Legacy: plain string URL or base64
            if (imgEntry.startsWith("data:image/")) {
              const [header, data] = imgEntry.split(",");
              mimeType = header.split(";")[0].split(":")[1] || "image/png";
              base64 = data;
            } else if (imgEntry.startsWith("http")) {
              const response = await fetch(imgEntry);
              const buffer = await response.arrayBuffer();
              base64 = Buffer.from(buffer).toString("base64");
              mimeType = "image/jpeg";
            }
          } else if ("__filePath" in imgEntry && imgEntry.__filePath) {
            base64 = resolveBase64(imgEntry.__filePath, undefined);
          } else if ("__inline" in imgEntry && imgEntry.__inline) {
            const inline = imgEntry.__inline;
            if (inline.startsWith("data:image/")) {
              const [header, data] = inline.split(",");
              mimeType = header.split(";")[0].split(":")[1] || "image/png";
              base64 = data;
            } else if (inline.startsWith("http")) {
              const response = await fetch(inline);
              const buffer = await response.arrayBuffer();
              base64 = Buffer.from(buffer).toString("base64");
              mimeType = "image/jpeg";
            } else {
              base64 = inline;
            }
          }

          if (base64) {
            parts.push({ inlineData: { data: base64, mimeType } });
          }
        } catch (fetchErr) {
          console.error("[DEBUG] Failed to process image:", fetchErr);
        }
      }
    }

    // 3. Assemble connected Videos (if any) as inlineData Part objects
    const videoBase64 = resolveBase64(payload.videoFilePath, payload.video?.data);
    if (videoBase64) {
      parts.push({
        inlineData: {
          data: videoBase64,
          mimeType: payload.videoType || payload.video?.type || "video/mp4"
        }
      });
    }

    // 4. Assemble connected Audio (if any) as inlineData Part objects
    const audioBase64 = resolveBase64(payload.audioFilePath, payload.audio?.data);
    if (audioBase64) {
      parts.push({
        inlineData: {
          data: audioBase64,
          mimeType: payload.audioType || payload.audio?.type || "audio/mp3"
        }
      });
    }

    // 5. Assemble other files/documents like PDFs (if any) as inlineData Part objects
    const fileBase64 = resolveBase64(payload.fileFilePath, payload.file?.data);
    if (fileBase64) {
      parts.push({
        inlineData: {
          data: fileBase64,
          mimeType: payload.fileType || payload.file?.type || "application/pdf"
        }
      });
    }

    // 6. Try candidates sequentially with the structured parts array
    for (const modelName of modelCandidates) {
      try {
        console.log(`[DEBUG] Attempting live API execution with Google model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent({
          contents: [{ role: "user", parts }],
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
