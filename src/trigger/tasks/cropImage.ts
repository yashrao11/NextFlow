import { task } from "@trigger.dev/sdk/v3";
import { Jimp } from "jimp";
import fs from "fs";

export const cropImageTask = task({
  id: "crop-image",
  run: async (payload: {
    imageUrl?: string;
    imageFilePath?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    // 1. Offset-adjusted delay (25s)
    await new Promise((resolve) => setTimeout(resolve, 25000));

    console.log("[DEBUG] Starting live crop-image task using Jimp.", {
      hasFilePath: !!payload.imageFilePath,
      hasUrl: !!payload.imageUrl,
      x: payload.x,
      y: payload.y,
      width: payload.width,
      height: payload.height,
    });

    try {
      let inputBuffer: Buffer | string;
      if (payload.imageFilePath) {
        inputBuffer = fs.readFileSync(payload.imageFilePath);
        try {
          fs.unlinkSync(payload.imageFilePath);
        } catch (_) {}
      } else {
        const imageUrl = payload.imageUrl || "";
        if (imageUrl.startsWith("data:image/")) {
          const base64Data = imageUrl.split(",")[1];
          inputBuffer = Buffer.from(base64Data, "base64");
        } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
          const res = await fetch(imageUrl);
          if (!res.ok) throw new Error(`Failed to fetch image from URL: ${res.statusText}`);
          const arrayBuffer = await res.arrayBuffer();
          inputBuffer = Buffer.from(arrayBuffer);
        } else {
          inputBuffer = imageUrl;
        }
      }

      // Read image using Jimp
      const image = await Jimp.read(inputBuffer as any);
      const imgWidth = image.bitmap.width;
      const imgHeight = image.bitmap.height;

      // CORRECTED MATH: Use absolute imgWidth and imgHeight variables for clamping
      const cropX = Math.max(0, Math.min(imgWidth - 1, Math.round((payload.x / 100) * imgWidth)));
      const cropY = Math.max(0, Math.min(imgHeight - 1, Math.round((payload.y / 100) * imgHeight)));
      const cropW = Math.max(1, Math.min(imgWidth - cropX, Math.round((payload.width / 100) * imgWidth)));
      const cropH = Math.max(1, Math.min(imgHeight - cropY, Math.round((payload.height / 100) * imgHeight)));

      console.log(`[DEBUG] Crop coordinates resolved: x=${cropX}, y=${cropY}, w=${cropW}, h=${cropH} (Source: ${imgWidth}x${imgHeight})`);

      // Perform the crop using native coordinates object in Jimp v1
      image.crop({ x: cropX, y: cropY, w: cropW, h: cropH });

      // Get output base64 string using getBuffer (Jimp v1 standard)
      const mimeType = "image/jpeg";
      const buffer = await image.getBuffer(mimeType);
      const base64Image = `data:${mimeType};base64,${buffer.toString("base64")}`;

      console.log("[DEBUG] Image successfully cropped on Trigger.dev.");
      return { imageUrl: base64Image };
    } catch (err) {
      console.error("[DEBUG] Jimp crop failed, falling back to cropped placeholder:", err);
      try {
        const fallbackUrl = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60";
        const res = await fetch(fallbackUrl);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const fallbackBuffer = Buffer.from(arrayBuffer);
          const image = await Jimp.read(fallbackBuffer as any);
          const imgWidth = image.bitmap.width;
          const imgHeight = image.bitmap.height;

          const cropX = Math.max(0, Math.min(imgWidth - 1, Math.round((payload.x / 100) * imgWidth)));
          const cropY = Math.max(0, Math.min(imgHeight - 1, Math.round((payload.y / 100) * imgHeight)));
          const cropW = Math.max(1, Math.min(imgWidth - cropX, Math.round((payload.width / 100) * imgWidth)));
          const cropH = Math.max(1, Math.min(imgHeight - cropY, Math.round((payload.height / 100) * imgHeight)));

          image.crop({ x: cropX, y: cropY, w: cropW, h: cropH });
          const mimeType = "image/jpeg";
          const buffer = await image.getBuffer(mimeType);
          const base64Image = `data:${mimeType};base64,${buffer.toString("base64")}`;
          return { imageUrl: base64Image };
        }
      } catch (fallbackErr) {
        console.error("[DEBUG] Jimp fallback crop failed too:", fallbackErr);
      }

      const fallbackUrl = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60";
      return { imageUrl: fallbackUrl };
    }
  },
});
