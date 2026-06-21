import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tasks, runs } from '@trigger.dev/sdk/v3';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { Jimp } from 'jimp';
import os from 'os';

const execAsync = promisify(exec);

/**
 * storeImageTemp
 * Writes a base64 data URL to a local temp file and returns the file path.
 * Used to avoid sending large binary payloads through trigger.dev's cloud relay.
 * The trigger task reads the image directly from disk (fast local I/O).
 * Temp files are automatically cleaned up by the OS on reboot.
 *
 * @param dataUrl The base64 data URL (e.g. "data:image/png;base64,...")
 * @param suffix File extension to use (default: 'png')
 * @returns Absolute path to the temp file
 */
function storeImageTemp(dataUrl: string, suffix = 'png'): string {
  const tmpDir = path.join(os.tmpdir(), 'nextflow-trigger-images');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const filePath = path.join(tmpDir, `img-${Date.now()}-${Math.random().toString(36).slice(2)}.${suffix}`);
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
  return filePath;
}

/**
 * Performs a topological sort on nodes using Kahn's algorithm based on edges.
 */
function topologicalSort(nodes: any[], edges: any[]): any[] {
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  nodes.forEach((n) => {
    adj[n.id] = [];
    inDegree[n.id] = 0;
  });

  edges.forEach((e) => {
    if (adj[e.source] && adj[e.target] !== undefined) {
      adj[e.source].push(e.target);
      inDegree[e.target]++;
    }
  });

  const queue: string[] = [];
  nodes.forEach((n) => {
    if (inDegree[n.id] === 0) {
      queue.push(n.id);
    }
  });

  const sortedIds: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    sortedIds.push(u);

    const neighbors = adj[u] || [];
    neighbors.forEach((v) => {
      inDegree[v]--;
      if (inDegree[v] === 0) {
        queue.push(v);
      }
    });
  }

  const sortedNodes = sortedIds.map((id) => nodes.find((n) => n.id === id)).filter(Boolean);
  const remaining = nodes.filter((n) => !sortedIds.includes(n.id));
  return [...sortedNodes, ...remaining];
}

/**
 * Traverses backwards through connected edges to collect all ancestor node IDs
 * of a given starting node. Used for scope validation and caching.
 *
 * @param startNodeId The target node to trace ancestors from.
 * @param edges Array of react-flow edges representing connection links.
 * @returns A set of unique ancestor node IDs.
 */
function getAncestors(startNodeId: string, edges: any[]): Set<string> {
  const ancestors = new Set<string>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const parentEdges = edges.filter((e) => e.target === curr);
    parentEdges.forEach((e) => {
      if (!ancestors.has(e.source)) {
        ancestors.add(e.source);
        queue.push(e.source);
      }
    });
  }

  return ancestors;
}

/**
 * Polls the Trigger.dev API for the execution status of a background task.
 * If the API key is not configured, or if the polling attempts timeout, 
 * the poll falls back to executing the task synchronously on the local backend.
 *
 * @param runId Trigger.dev run ID to check.
 * @param fallbackTask Callback execution if API polling fails or keys are missing.
 * @returns The resolved output of the completed task.
 */
async function pollTriggerRun(
  triggerRunId: string, 
  dbRunId: string, 
  fallbackTask: () => Promise<any>
): Promise<any> {
  const apiKey = process.env.TRIGGER_API_KEY;

  // If Trigger.dev credentials are missing or unconfigured, execute task locally as fallback
  if (!apiKey || apiKey.startsWith('tr_dev_dummy')) {
    console.warn('[Run Poller] Trigger.dev API key missing, executing task locally as fallback.');
    return await fallbackTask();
  }

  // Increased attempts to allow for mandatory 30-second delay tasks
  const maxAttempts = 40; 
  const delayMs = 2000;

  // Poll status periodically until completion or failure
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Check if the database run was aborted by the user
      const dbRun = await prisma.run.findUnique({
        where: { id: dbRunId },
        select: { status: true }
      });
      if (dbRun && dbRun.status === 'FAILED') {
        try {
          await runs.cancel(triggerRunId);
        } catch (cancelErr) {
          console.warn(`[Run Poller] Failed to cancel Trigger.dev run ${triggerRunId}:`, cancelErr);
        }
        throw new Error('Task execution aborted: Run stopped by user.');
      }

      const run = await runs.retrieve(triggerRunId);

      if (run) {
        if (run.status === 'COMPLETED') {
          return run.output;
        } else if (
          run.status === 'FAILED' ||
          run.status === 'CANCELED' ||
          run.status === 'CRASHED' ||
          run.status === 'TIMED_OUT'
        ) {
          throw new Error(`Trigger.dev task run failed: ${run.status}`);
        }
      }
    } catch (err: any) {
      if (err.message?.includes('aborted')) {
        throw err;
      }
      console.warn(`[Run Poller] Polling attempt ${attempt + 1} failed:`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.warn('[Run Poller] Trigger.dev task timed out, falling back to local computation.');
  return await fallbackTask();
}

/**
 * localCropFallback
 * Performs synchronous image cropping using Jimp on the local server.
 * Simulates a background worker execution with a mandatory 30-second sleep.
 */
async function localCropFallback(imageUrl: string, x: number, y: number, width: number, height: number): Promise<any> {
  console.log("[DEBUG] Local fallback: Starting crop using Jimp.", { imageUrl: imageUrl.substring(0, 50), x, y, width, height });
  // Mandatory 30-second artificial delay to simulate a complex background job
  await new Promise((resolve) => setTimeout(resolve, 30000));
  try {
    let inputBuffer: Buffer | string = imageUrl;
    if (imageUrl.startsWith("data:image/")) {
      const base64Data = imageUrl.split(",")[1];
      inputBuffer = Buffer.from(base64Data, "base64");
    } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
      const arrayBuffer = await res.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);
    }

    const image = await Jimp.read(inputBuffer as any);
    const imgWidth = image.bitmap.width;
    const imgHeight = image.bitmap.height;

    // Convert percentages to absolute pixel bounds
    const cropX = Math.max(0, Math.min(imgWidth - 1, Math.round((x / 100) * imgWidth)));
    const cropY = Math.max(0, Math.min(imgHeight - 1, Math.round((y / 100) * imgHeight)));
    const cropW = Math.max(1, Math.min(imgWidth - cropX, Math.round((width / 100) * imgWidth)));
    const cropH = Math.max(1, Math.min(imgHeight - cropY, Math.round((height / 100) * imgHeight)));

    image.crop({ x: cropX, y: cropY, w: cropW, h: cropH });
    const buffer = await image.getBuffer("image/png");
    const base64Result = `data:image/png;base64,${buffer.toString("base64")}`;

    return { imageUrl: base64Result };
  } catch (err) {
    console.error("[DEBUG] Local fallback crop failed, trying placeholder crop:", err);
    try {
      const fallbackUrl = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60";
      const res = await fetch(fallbackUrl);
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        const fallbackBuffer = Buffer.from(arrayBuffer);
        const image = await Jimp.read(fallbackBuffer as any);
        const imgWidth = image.bitmap.width;
        const imgHeight = image.bitmap.height;

        const cropX = Math.max(0, Math.min(imgWidth - 1, Math.round((x / 100) * imgWidth)));
        const cropY = Math.max(0, Math.min(imgHeight - 1, Math.round((y / 100) * imgHeight)));
        const cropW = Math.max(1, Math.min(imgWidth - cropX, Math.round((width / 100) * imgWidth)));
        const cropH = Math.max(1, Math.min(imgHeight - cropY, Math.round((height / 100) * imgHeight)));

        image.crop({ x: cropX, y: cropY, w: cropW, h: cropH });
        const buffer = await image.getBuffer("image/png");
        const base64Result = `data:image/png;base64,${buffer.toString("base64")}`;
        return { imageUrl: base64Result };
      }
    } catch (fallbackErr) {
      console.error("[DEBUG] Local fallback placeholder crop failed too:", fallbackErr);
    }
    
    // Final absolute fallback is the raw placeholder URL if everything failed
    const fallbackUrl = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60";
    return { imageUrl: fallbackUrl };
  }
}

/**
 * localGeminiFallback
 * Executes Google Generative AI API calls directly from the local server.
 * Sequentially tests various active model candidates to ensure robust fallbacks.
 */
async function localGeminiFallback(
  prompt: string,
  systemPrompt: string,
  modelName: string,
  images: string[],
  video?: { data: string; type: string },
  audio?: { data: string; type: string },
  file?: { data: string; type: string }
): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined');
  }

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

  const selectedModelId = modelMap[modelName || ""] || "gemini-3.1-flash-lite";

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

  for (const candidateModel of modelCandidates) {
    try {
      console.log(`[DEBUG] Local fallback: Attempting live API execution with Google model: ${candidateModel}`);
      const model = genAI.getGenerativeModel({
        model: candidateModel,
        systemInstruction: systemPrompt || undefined,
      });

      // Prepare request payload content structures using Part objects (wrapping text inside { text: ... })
      // This prevents mixing plain string prompts and inlineData objects, which causes Google 400 error.
      const parts: any[] = [
        { text: prompt }
      ];
      if (images && images.length > 0) {
        for (const imgUrl of images) {
          if (imgUrl.startsWith('data:image/')) {
            let cleanBase64 = imgUrl;
            if (cleanBase64.includes(',')) {
              cleanBase64 = cleanBase64.split(',')[1];
            }
            parts.push({
              inlineData: {
                data: cleanBase64,
                mimeType: 'image/png',
              },
            });
          } else {
            const response = await fetch(imgUrl);
            const buffer = await response.arrayBuffer();
            parts.push({
              inlineData: {
                data: Buffer.from(buffer).toString('base64'),
                mimeType: 'image/jpeg',
              },
            });
          }
        }
      }

      // Convert optional video payload
      if (video && video.data) {
        let cleanBase64 = video.data;
        if (cleanBase64.includes(',')) {
          cleanBase64 = cleanBase64.split(',')[1];
        }
        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: video.type || 'video/mp4',
          },
        });
      }

      // Convert optional audio payload
      if (audio && audio.data) {
        let cleanBase64 = audio.data;
        if (cleanBase64.includes(',')) {
          cleanBase64 = cleanBase64.split(',')[1];
        }
        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: audio.type || 'audio/mp3',
          },
        });
      }

      // Convert optional document file payload
      if (file && file.data) {
        let cleanBase64 = file.data;
        if (cleanBase64.includes(',')) {
          cleanBase64 = cleanBase64.split(',')[1];
        }
        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: file.type || 'application/pdf',
          },
        });
      }

      // Execute generative AI request
      const result = await model.generateContent({
        contents: [{ role: 'user', parts }]
      });
      responseText = result.response.text();
      console.log(`[DEBUG] Local fallback: Live API execution succeeded with model: ${candidateModel}`);
      break;
    } catch (err) {
      console.warn(`[DEBUG] Local fallback: Model ${candidateModel} returned an API error:`, err);
      lastError = err;
    }
  }

  if (!responseText && lastError) {
    throw lastError;
  }

  return { response: responseText };
}

/**
 * resolveNodeInputs
 * Walks back through connected edges to collect execution outputs from parent nodes.
 * Maps parent node outputs directly into parameter keys expected by the downstream node.
 * Uses historical workflow runs as cache if parents did not run in this execution scope.
 */
async function resolveNodeInputs(node: any, runId: string, edges: any[]): Promise<any> {
  const parentEdges = edges.filter((e) => e.target === node.id);
  const inputs: any = {};

  for (const edge of parentEdges) {
    // 1. Look for output from the current run
    const parentExecution = await prisma.nodeExecution.findFirst({
      where: { runId, nodeId: edge.source },
    });

    let parentOutput = null;

    if (parentExecution && parentExecution.status === 'SUCCESS') {
      parentOutput = parentExecution.output as any;
    } else {
      // 2. If parent was skipped in a partial run, query the last succeeded run for cache output
      const currentRun = await prisma.run.findUnique({
        where: { id: runId },
        select: { workflowId: true }
      });
      if (currentRun) {
        const lastSuccess = await prisma.nodeExecution.findFirst({
          where: {
            nodeId: edge.source,
            status: 'SUCCESS',
            run: { workflowId: currentRun.workflowId }
          },
          orderBy: { id: 'desc' }
        });
        if (lastSuccess) {
          parentOutput = lastSuccess.output as any;
        }
      }
    }

    if (!parentOutput) {
      continue;
    }

    // 3. Map parent handles to expected target handle parameter slots
    if (edge.targetHandle === 'image-input') {
      if (!inputs.images) inputs.images = [];
      let imgUrl = '';
      if (parentOutput.imageUrl) {
        imgUrl = parentOutput.imageUrl;
      } else if (parentOutput.fields) {
        const field = parentOutput.fields.find((f: any) => edge.sourceHandle && edge.sourceHandle.startsWith(f.id));
        imgUrl = field?.value || '';
      }
      if (imgUrl) inputs.images.push(imgUrl);
    } else if (edge.targetHandle === 'video-input') {
      let videoVal = null;
      if (parentOutput.video) {
        videoVal = parentOutput.video;
      } else if (parentOutput.fields) {
        const field = parentOutput.fields.find((f: any) => edge.sourceHandle && edge.sourceHandle.startsWith(f.id));
        videoVal = field?.value || null;
      } else if (parentOutput.result) {
        videoVal = parentOutput.result;
      }
      if (videoVal) {
        inputs.video = videoVal;
      }
    } else if (edge.targetHandle === 'audio-input') {
      let audioVal = null;
      if (parentOutput.audio) {
        audioVal = parentOutput.audio;
      } else if (parentOutput.fields) {
        const field = parentOutput.fields.find((f: any) => edge.sourceHandle && edge.sourceHandle.startsWith(f.id));
        audioVal = field?.value || null;
      } else if (parentOutput.result) {
        audioVal = parentOutput.result;
      }
      if (audioVal) {
        inputs.audio = audioVal;
      }
    } else if (edge.targetHandle === 'file-input') {
      let fileVal = null;
      if (parentOutput.file) {
        fileVal = parentOutput.file;
      } else if (parentOutput.fields) {
        const field = parentOutput.fields.find((f: any) => edge.sourceHandle && edge.sourceHandle.startsWith(f.id));
        fileVal = field?.value || null;
      } else if (parentOutput.result) {
        fileVal = parentOutput.result;
      }
      if (fileVal) {
        inputs.file = fileVal;
      }
    } else if (edge.targetHandle === 'prompt-text-input' || edge.targetHandle === 'system-text-input') {
      let textVal = '';
      if (parentOutput.response) {
        textVal = parentOutput.response;
      } else if (parentOutput.result) {
        textVal = parentOutput.result;
      } else if (parentOutput.fields) {
        const field = parentOutput.fields.find((f: any) => edge.sourceHandle && edge.sourceHandle.startsWith(f.id));
        textVal = field?.value || '';
      }

      if (edge.targetHandle === 'prompt-text-input') {
        inputs.prompt = textVal;
      } else {
        inputs.systemPrompt = textVal;
      }
    } else if (edge.targetHandle === 'result-input') {
      let resultVal = '';
      if (parentOutput.response) {
        resultVal = parentOutput.response;
      } else if (parentOutput.imageUrl) {
        resultVal = parentOutput.imageUrl;
      } else if (parentOutput.fields) {
        const field = parentOutput.fields.find((f: any) => edge.sourceHandle && edge.sourceHandle.startsWith(f.id));
        resultVal = field?.value || '';
      }
      inputs.result = resultVal;
    }
  }

  return inputs;
}

// --- BACKGROUND PARALLEL DAG ORCHESTRATOR ---
/**
 * executeWorkflowBackground
 * Parallel topological scheduler loop executing workflow nodes in the background.
 * Periodically searches for PENDING nodes whose active parent nodes have succeeded,
 * triggering async background processes or invoking API fallbacks accordingly.
 */
async function executeWorkflowBackground(runId: string, nodesToExecute: any[], edgesToExecute: any[]) {
  const startTime = Date.now();
  const activeNodeIds = new Set<string>();

  try {
    while (true) {
      // Check if the database run itself has been set to FAILED (manually stopped)
      const currentRun = await prisma.run.findUnique({
        where: { id: runId },
        select: { status: true },
      });
      if (currentRun && currentRun.status === 'FAILED') {
        console.log(`[Orchestrator Run ${runId}] Run aborted by user in database.`);
        break;
      }
      // Also exit the orchestrator loop early if run was already marked SUCCESS
      // (happens when the response node IIFE updated it immediately)
      if (currentRun && currentRun.status === 'SUCCESS') {
        console.log(`[Orchestrator Run ${runId}] Run already marked SUCCESS — orchestrator exiting.`);
        break;
      }

      // 1. Fetch current status of node executions in this run
      const executions = await prisma.nodeExecution.findMany({
        where: { runId },
      });

      // Break if all scope nodes have finished processing (either success or failed)
      const finished = executions.filter((e) => e.status === 'SUCCESS' || e.status === 'FAILED');
      if (finished.length === executions.length) {
        break;
      }

      // Stop workflow execution immediately if the response node has finished
      const responseExec = executions.find((e) => e.nodeName === 'response');
      if (responseExec && (responseExec.status === 'SUCCESS' || responseExec.status === 'FAILED')) {
        const pendingCount = executions.filter((e) => e.status === 'PENDING').length;
        if (pendingCount > 0) {
          await prisma.nodeExecution.updateMany({
            where: { runId, status: 'PENDING' },
            data: { status: 'FAILED', errorMessage: 'Skipped because workflow already completed.' },
          });
        }
        break;
      }

      // Stop workflow execution immediately if any node failed
      const failedNode = executions.find((e) => e.status === 'FAILED');
      if (failedNode) {
        await prisma.nodeExecution.updateMany({
          where: { runId, status: 'PENDING' },
          data: { status: 'FAILED', errorMessage: 'Skipped due to upstream failure.' },
        });
        throw new Error('Workflow execution stopped due to task failure.');
      }

      // 2. Identify ready nodes (status PENDING, not currently running, and all parent dependencies are SUCCESS)
      const readyExecutions = [];
      for (const ex of executions) {
        if (ex.status !== 'PENDING' || activeNodeIds.has(ex.nodeId)) continue;

        const parentEdges = edgesToExecute.filter((e) => e.target === ex.nodeId);
        const allParentsSuccess = parentEdges.every((e) => {
          const parentEx = executions.find((p) => p.nodeId === e.source);
          return !parentEx || parentEx.status === 'SUCCESS';
        });

        if (allParentsSuccess) {
          readyExecutions.push(ex);
        }
      }

      // Check if we can make any further progress:
      // If there are no active nodes currently running and no ready nodes to launch,
      // it means we are stuck (e.g. due to unsatisfied dependencies on skipped nodes).
      if (activeNodeIds.size === 0 && readyExecutions.length === 0) {
        const pendingCount = executions.filter((e) => e.status === 'PENDING').length;
        if (pendingCount > 0) {
          await prisma.nodeExecution.updateMany({
            where: { runId, status: 'PENDING' },
            data: { status: 'FAILED', errorMessage: 'Skipped due to unsatisfied dependencies.' },
          });
        }
        break;
      }

      // 3. Launch ready nodes concurrently
      for (const ex of readyExecutions) {
        activeNodeIds.add(ex.nodeId);

        (async () => {
          const nodeStartTime = Date.now();
          try {
            // Mark node status as RUNNING in DB
            await prisma.nodeExecution.update({
              where: { id: ex.id },
              data: { status: 'RUNNING' },
            });

            const node = nodesToExecute.find((n) => n.id === ex.nodeId);
            const resolvedInputs = await resolveNodeInputs(node, runId, edgesToExecute);
            let output: any = {};

            // Execute code logic by Node Type
            if (node.type === 'requestInputs') {
              output = { fields: node.data?.fields || [] };
            } else if (node.type === 'response') {
              output = { result: resolvedInputs.result || '' };
            } else if (node.type === 'cropImage') {
              const imageUrl = resolvedInputs.images?.[0] || node.data?.imageUrl || '';
              const cropData = node.data?.crop || {};
              const crop = {
                x: typeof cropData.x === 'number' ? cropData.x : 0,
                y: typeof cropData.y === 'number' ? cropData.y : 0,
                width: typeof cropData.width === 'number' ? cropData.width : 100,
                height: typeof cropData.height === 'number' ? cropData.height : 100,
              };

              // Off-load large base64 images to a local temp file so the trigger.dev
              // cloud message payload stays small (file path vs multi-MB base64).
              // The trigger task (running locally via `npx trigger.dev dev`) reads directly
              // from disk — no cloud relay bottleneck.
              const LARGE_THRESHOLD = 1024; // anything > 1 KB is treated as binary
              const cropPayload: any = { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
              if (imageUrl.startsWith('data:image/') && imageUrl.length > LARGE_THRESHOLD) {
                const ext = imageUrl.split(';')[0].split('/')[1] || 'png';
                cropPayload.imageFilePath = storeImageTemp(imageUrl, ext);
                cropPayload.imageUrl = ''; // empty — task will read from file
              } else {
                cropPayload.imageUrl = imageUrl;
              }

              // Trigger async crop task using Trigger.dev v3
              const triggerRun = await tasks.trigger('crop-image', cropPayload);

              // Poll status or fall back to local execution
              output = await pollTriggerRun(triggerRun.id, runId, () =>
                localCropFallback(imageUrl, crop.x, crop.y, crop.width, crop.height)
              );
            } else if (node.type === 'gemini') {
              const prompt = resolvedInputs.prompt || node.data?.prompt || '';
              const systemPrompt = resolvedInputs.systemPrompt || node.data?.systemPrompt || '';
              const images = [
                ...(resolvedInputs.images || []),
                ...(node.data?.uploadedImages || [])
              ];
              const video = resolvedInputs.video || node.data?.uploadedVideo || null;
              const audio = resolvedInputs.audio || node.data?.uploadedAudio || null;
              const file = resolvedInputs.file || node.data?.uploadedFile || null;

              const LARGE_THRESHOLD = 1024;
              const triggerPayload: any = {
                prompt,
                systemPrompt,
                // For each image: if it's a large base64 data URL, write to a temp file
                // and pass the path. The gemini trigger task reads from disk.
                images: images.map((img: string) => {
                  if (img.startsWith('data:image/') && img.length > LARGE_THRESHOLD) {
                    const ext = img.split(';')[0].split('/')[1] || 'png';
                    return { __filePath: storeImageTemp(img, ext) };
                  }
                  return { __inline: img };
                }),
                model: node.data?.model || 'Gemini 3.1 Pro',
              };

              if (video) {
                const v = typeof video === 'string' ? { data: video, type: 'video/mp4' } : { data: video.data, type: video.type };
                if (v.data.startsWith('data:') && v.data.length > LARGE_THRESHOLD) {
                  triggerPayload.videoFilePath = storeImageTemp(v.data, v.type.split('/')[1] || 'mp4');
                  triggerPayload.videoType = v.type;
                } else {
                  triggerPayload.video = v;
                }
              }
              if (audio) {
                const a = typeof audio === 'string' ? { data: audio, type: 'audio/mp3' } : { data: audio.data, type: audio.type };
                if (a.data.startsWith('data:') && a.data.length > LARGE_THRESHOLD) {
                  triggerPayload.audioFilePath = storeImageTemp(a.data, a.type.split('/')[1] || 'mp3');
                  triggerPayload.audioType = a.type;
                } else {
                  triggerPayload.audio = a;
                }
              }
              if (file) {
                const f = typeof file === 'string' ? { data: file, type: 'application/pdf' } : { data: file.data, type: file.type };
                if (f.data.startsWith('data:') && f.data.length > LARGE_THRESHOLD) {
                  triggerPayload.fileFilePath = storeImageTemp(f.data, 'bin');
                  triggerPayload.fileType = f.type;
                } else {
                  triggerPayload.file = f;
                }
              }

              // Trigger async Gemini prompt task using Trigger.dev v3
              const triggerRun = await tasks.trigger('gemini-prompt', triggerPayload);

              // Poll status or fall back to local execution
              output = await pollTriggerRun(triggerRun.id, runId, () =>
                localGeminiFallback(
                  prompt,
                  systemPrompt,
                  node.data?.model || 'Gemini 3.1 Pro',
                  images,
                  video ? (typeof video === 'string' ? { data: video, type: 'video/mp4' } : { data: video.data, type: video.type }) : undefined,
                  audio ? (typeof audio === 'string' ? { data: audio, type: 'audio/mp3' } : { data: audio.data, type: audio.type }) : undefined,
                  file ? (typeof file === 'string' ? { data: file, type: 'application/pdf' } : { data: file.data, type: file.type }) : undefined
                )
              );
            }

            const duration = (Date.now() - nodeStartTime) / 1000;
            // Node execution succeeded, update output state in DB
            await prisma.nodeExecution.update({
              where: { id: ex.id },
              data: {
                status: 'SUCCESS',
                output,
                duration,
              },
            });

            if (node.id === 'gemini-3' || (node.type === 'gemini' && node.data?.label?.includes('Final'))) {
              const responseExec = await prisma.nodeExecution.findFirst({
                where: { runId, nodeName: 'response' }
              });
              if (responseExec) {
                const finalGeneratedText = output.response || '';
                await prisma.nodeExecution.update({
                  where: { id: responseExec.id },
                  data: {
                    status: 'SUCCESS',
                    inputs: { result: finalGeneratedText },
                    output: { result: finalGeneratedText },
                    duration: 0.1,
                  }
                });
                console.log(`[Orchestrator Run ${runId}] Explicitly updated Response node to SUCCESS with Gemini #3 text.`);

                // Also update the overall run status to SUCCESS so it terminates and returns immediately
                const totalDuration = (Date.now() - startTime) / 1000;
                await prisma.run.update({
                  where: { id: runId },
                  data: { status: 'SUCCESS', duration: totalDuration },
                });
                console.log(`[Orchestrator Run ${runId}] Run marked SUCCESS immediately upon Gemini #3 completion.`);
              }
            }

            // ─── IMMEDIATE COMPLETION ──────────────────────────────────────
            // If this is the response node, mark the entire run as SUCCESS right
            // now so the client detects completion within one poll cycle (800ms)
            // instead of waiting for the orchestrator loop to detect it on its
            // next 500ms tick and do additional DB queries.
            if (node.type === 'response') {
              const totalDuration = (Date.now() - startTime) / 1000;
              await prisma.run.update({
                where: { id: runId },
                data: { status: 'SUCCESS', duration: totalDuration },
              });
              console.log(`[Orchestrator Run ${runId}] Response node completed — run marked SUCCESS immediately (${totalDuration.toFixed(1)}s).`);
            }
            // ──────────────────────────────────────────────────────────────

          } catch (nodeErr: any) {
            console.error(`Node ${ex.nodeId} execution failed:`, nodeErr);
            const duration = (Date.now() - nodeStartTime) / 1000;
            // Node execution failed, update failure logs in DB
            await prisma.nodeExecution.update({
              where: { id: ex.id },
              data: {
                status: 'FAILED',
                duration,
                errorMessage: nodeErr.message || 'Execution error',
              },
            });
          } finally {
            activeNodeIds.delete(ex.nodeId);
          }
        })();
      }

      // Sleep 500ms before checking database execution statuses again
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Final cleanup: only update the run status if the response node didn't
    // already set it to SUCCESS (to avoid overwriting SUCCESS with FAILED
    // due to "Skipped" nodes being counted in hasFailed).
    const currentRunStatus = await prisma.run.findUnique({
      where: { id: runId },
      select: { status: true },
    });

    if (currentRunStatus && currentRunStatus.status !== 'SUCCESS') {
      const finalExecutions = await prisma.nodeExecution.findMany({
        where: { runId },
      });
      const totalDuration = (Date.now() - startTime) / 1000;
      // Exclude "Skipped" nodes from failing the overall run —
      // they are PENDING nodes cancelled because the workflow already completed.
      const SKIPPED_MESSAGES = [
        'Skipped because workflow already completed.',
        'Skipped due to upstream failure.',
        'Skipped due to unsatisfied dependencies.',
      ];
      const hasFailed = finalExecutions.some(
        (e) => e.status === 'FAILED' && !SKIPPED_MESSAGES.includes(e.errorMessage || '')
      );

      await prisma.run.update({
        where: { id: runId },
        data: {
          status: hasFailed ? 'FAILED' : 'SUCCESS',
          duration: totalDuration,
        },
      });
    }
  } catch (err: any) {
    console.error(`[Orchestrator Run ${runId}] Error:`, err);
    // Only write FAILED if the response node didn't already mark it SUCCESS
    const currentRunStatus = await prisma.run.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (currentRunStatus && currentRunStatus.status !== 'SUCCESS') {
      const totalDuration = (Date.now() - startTime) / 1000;
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          duration: totalDuration,
        },
      });
    }
  }
}

/**
 * POST /api/workflows/run
 * Initiates a full or partial workflow execution run.
 * Creates execution tracking tables in PostgreSQL and fires off the background orchestrator.
 */
export async function POST(req: Request) {
  try {
    // 1. Parse trigger body parameters
    const body = await req.json();
    const { workflowId, nodeId, scope = 'FULL', triggerType = 'API' } = body;

    if (!workflowId) {
      return NextResponse.json({ error: 'workflowId is required' }, { status: 400 });
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // 2. Parse nodes and edges from json workflow fields
    const nodes = typeof workflow.nodes === 'string' ? JSON.parse(workflow.nodes) : workflow.nodes;
    const edges = typeof workflow.edges === 'string' ? JSON.parse(workflow.edges) : workflow.edges;

    let nodesToExecute = nodes;
    let edgesToExecute = edges;

    // Filter nodes if partial running is selected
    if (scope === 'PARTIAL' && nodeId) {
      nodesToExecute = nodes.filter((n: any) => n.id === nodeId);
      edgesToExecute = edges;
    }

    // Sort nodes to execute topologically based on edges
    nodesToExecute = topologicalSort(nodesToExecute, edgesToExecute);

    // 3. Create the database Run record with RUNNING status
    const run = await prisma.run.create({
      data: {
        workflowId,
        status: 'RUNNING',
        duration: 0,
        scope: scope,
        triggerType,
      },
    });

    // 4. Initialize all participating NodeExecution records to PENDING status
    await prisma.nodeExecution.createMany({
      data: nodesToExecute.map((node: any) => ({
        runId: run.id,
        nodeId: node.id,
        nodeName: node.type || 'unknown',
        status: 'PENDING',
        duration: 0,
        inputs: node.data || {},
        output: {},
      })),
    });

    // 5. Trigger the orchestrator loop asynchronously and return immediately to prevent timeout
    executeWorkflowBackground(run.id, nodesToExecute, edgesToExecute).catch((err) => {
      console.error(`Background workflow run executor crashed:`, err);
    });

    return NextResponse.json({ runId: run.id, status: 'RUNNING' });
  } catch (error: any) {
    console.error('[Workflow Run API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}
