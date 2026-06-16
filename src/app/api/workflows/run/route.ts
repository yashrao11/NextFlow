import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tasks, runs } from '@trigger.dev/sdk/v3';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { Jimp } from 'jimp';

const execAsync = promisify(exec);

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
async function pollTriggerRun(runId: string, fallbackTask: () => Promise<any>): Promise<any> {
  const apiKey = process.env.TRIGGER_API_KEY;

  // If Trigger.dev credentials are missing or unconfigured, execute task locally as fallback
  if (!apiKey || apiKey.startsWith('tr_dev_dummy')) {
    console.warn('[Run Poller] Trigger.dev API key missing, executing task locally as fallback.');
    return await fallbackTask();
  }

  const isDev = process.env.NODE_ENV === 'development';
  const maxAttempts = isDev ? 4 : 30;
  const delayMs = isDev ? 1000 : 3000;

  // Poll status periodically until completion or failure
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const run = await runs.retrieve(runId);

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
    } catch (err) {
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
  // Simulate heavy computation delay
  await new Promise((resolve) => setTimeout(resolve, 30000));

  console.log("[DEBUG] Local fallback: Starting crop using Jimp.", { imageUrl: imageUrl.substring(0, 50), x, y, width, height });
  try {
    let inputBuffer: Buffer | string = imageUrl;
    if (imageUrl.startsWith("data:image/")) {
      const base64Data = imageUrl.split(",")[1];
      inputBuffer = Buffer.from(base64Data, "base64");
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
    console.error("[DEBUG] Local fallback crop failed:", err);
    throw err;
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
  
  // Model candidates fallback list
  const modelCandidates = [
    "gemini-3.5-flash",
    "gemini-3.1-pro",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro"
  ];

  let lastError: any = null;
  let responseText = "";

  for (const candidateModel of modelCandidates) {
    try {
      console.log(`[DEBUG] Local fallback: Attempting live API execution with Google model: ${candidateModel}`);
      const model = genAI.getGenerativeModel({
        model: candidateModel,
        systemInstruction: systemPrompt || undefined,
      });

      // Prepare request payload content structures
      const contents: any[] = [prompt];
      if (images && images.length > 0) {
        for (const imgUrl of images) {
          if (imgUrl.startsWith('data:image/')) {
            let cleanBase64 = imgUrl;
            if (cleanBase64.includes(',')) {
              cleanBase64 = cleanBase64.split(',')[1];
            }
            contents.push({
              inlineData: {
                data: cleanBase64,
                mimeType: 'image/png',
              },
            });
          } else {
            const response = await fetch(imgUrl);
            const buffer = await response.arrayBuffer();
            contents.push({
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
        contents.push({
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
        contents.push({
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
        contents.push({
          inlineData: {
            data: cleanBase64,
            mimeType: file.type || 'application/pdf',
          },
        });
      }

      // Execute generative AI request
      const result = await model.generateContent(contents);
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
        const fieldId = edge.sourceHandle?.split('-')[0] || '';
        const field = parentOutput.fields.find((f: any) => f.id.startsWith(fieldId));
        imgUrl = field?.value || '';
      }
      if (imgUrl) inputs.images.push(imgUrl);
    } else if (edge.targetHandle === 'video-input') {
      let videoVal = null;
      if (parentOutput.video) {
        videoVal = parentOutput.video;
      } else if (parentOutput.fields) {
        const fieldId = edge.sourceHandle?.split('-')[0] || '';
        const field = parentOutput.fields.find((f: any) => f.id.startsWith(fieldId));
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
        const fieldId = edge.sourceHandle?.split('-')[0] || '';
        const field = parentOutput.fields.find((f: any) => f.id.startsWith(fieldId));
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
        const fieldId = edge.sourceHandle?.split('-')[0] || '';
        const field = parentOutput.fields.find((f: any) => f.id.startsWith(fieldId));
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
        const fieldId = edge.sourceHandle?.split('-')[0] || '';
        const field = parentOutput.fields.find((f: any) => f.id.startsWith(fieldId));
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
        const fieldId = edge.sourceHandle?.split('-')[0] || '';
        const field = parentOutput.fields.find((f: any) => f.id.startsWith(fieldId));
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
      // 1. Fetch current status of node executions in this run
      const executions = await prisma.nodeExecution.findMany({
        where: { runId },
      });

      // Break if all scope nodes have finished processing (either success or failed)
      const finished = executions.filter((e) => e.status === 'SUCCESS' || e.status === 'FAILED');
      if (finished.length === executions.length) {
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

              // Trigger async crop task using Trigger.dev v3
              const triggerRun = await tasks.trigger('crop-image', {
                imageUrl,
                x: crop.x,
                y: crop.y,
                width: crop.width,
                height: crop.height,
              });

              // Poll status or fall back to local execution
              output = await pollTriggerRun(triggerRun.id, () =>
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

              const triggerPayload: any = {
                prompt,
                systemPrompt,
                images,
              };

              if (video) {
                triggerPayload.video = typeof video === 'string' ? { data: video, type: 'video/mp4' } : { data: video.data, type: video.type };
              }
              if (audio) {
                triggerPayload.audio = typeof audio === 'string' ? { data: audio, type: 'audio/mp3' } : { data: audio.data, type: audio.type };
              }
              if (file) {
                triggerPayload.file = typeof file === 'string' ? { data: file, type: 'application/pdf' } : { data: file.data, type: file.type };
              }

              // Trigger async Gemini prompt task using Trigger.dev v3
              const triggerRun = await tasks.trigger('gemini-prompt', triggerPayload);

              // Poll status or fall back to local execution
              output = await pollTriggerRun(triggerRun.id, () =>
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

    const finalExecutions = await prisma.nodeExecution.findMany({
      where: { runId },
    });
    const totalDuration = (Date.now() - startTime) / 1000;
    const hasFailed = finalExecutions.some((e) => e.status === 'FAILED');

    // Update workflow run state to SUCCESS or FAILED in database
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: hasFailed ? 'FAILED' : 'SUCCESS',
        duration: totalDuration,
      },
    });
  } catch (err: any) {
    console.error(`[Orchestrator Run ${runId}] Error:`, err);
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

/**
 * POST /api/workflows/run
 * Initiates a full or partial workflow execution run.
 * Creates execution tracking tables in PostgreSQL and fires off the background orchestrator.
 */
export async function POST(req: Request) {
  try {
    // 1. Parse trigger body parameters
    const body = await req.json();
    const { workflowId, nodeId, scope = 'FULL' } = body;

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

    // 3. Create the database Run record with RUNNING status
    const run = await prisma.run.create({
      data: {
        workflowId,
        status: 'RUNNING',
        duration: 0,
        scope: scope,
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
