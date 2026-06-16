import { task } from "@trigger.dev/sdk/v3";
import { Jimp } from "jimp";

/**
 * Trigger.dev task for cropping images on the backend.
 * Uses Jimp to process the image asynchronously.
 */
export const cropImageTask = task({
  id: "crop-image",
  run: async (payload: { imageUrl: string; x: number; y: number; width: number; height: number }) => {
    // 1. MANDATORY 30-second artificial delay to simulate a complex background job
    await new Promise((resolve) => setTimeout(resolve, 31000));

    console.log("[DEBUG] Starting live crop-image task using Jimp.", payload);

    try {
      let inputBuffer: Buffer | string = payload.imageUrl;
      // Parse base64 data URLs to raw Buffer for Jimp reading
      if (payload.imageUrl.startsWith("data:image/")) {
        const base64Data = payload.imageUrl.split(",")[1];
        inputBuffer = Buffer.from(base64Data, "base64");
      }

      // Read image dimensions using Jimp
      const image = await Jimp.read(inputBuffer as any);
      const imgWidth = image.bitmap.width;
      const imgHeight = image.bitmap.height;

      // 2. Calculate absolute pixel coordinates from percentage parameters
      // Clamp coordinates to prevent cropping out of bounds
      const cropX = Math.max(0, Math.min(imgWidth - 1, Math.round((payload.x / 100) * imgWidth)));
      const cropY = Math.max(0, Math.min(imgHeight - 1, Math.round((payload.y / 100) * imgHeight)));
      const cropW = Math.max(1, Math.min(imgWidth - cropX, Math.round((payload.width / 100) * imgWidth)));
      const cropH = Math.max(1, Math.min(imgHeight - cropY, Math.round((payload.height / 100) * imgHeight)));

      console.log(`[DEBUG] Crop coordinates resolved: x=${cropX}, y=${cropY}, w=${cropW}, h=${cropH} (Source size: ${imgWidth}x${imgHeight})`);

      // 3. Perform the actual crop operation
      image.crop({ x: cropX, y: cropY, w: cropW, h: cropH });
      
      // Get the image buffer as a PNG and format it back to base64 Data URL
      const buffer = await image.getBuffer("image/png");
      const base64Result = `data:image/png;base64,${buffer.toString("base64")}`;

      return { imageUrl: base64Result };
    } catch (err) {
      console.error("[DEBUG] Jimp crop failed:", err);
      throw err;
    }
  },
});

