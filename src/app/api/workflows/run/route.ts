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

// --- HELPER TO COLLECT ALL UPSTREAM ANCESTORS ---
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

// --- HELPER TO POLL TRIGGER.DEV RUN STATE WITH LOCAL FALLBACK ---
async function pollTriggerRun(runId: string, fallbackTask: () => Promise<any>): Promise<any> {
  const apiKey = process.env.TRIGGER_API_KEY;

  if (!apiKey || apiKey.startsWith('tr_dev_dummy')) {
    console.warn('[Run Poller] Trigger.dev API key missing, executing task locally as fallback.');
    return await fallbackTask();
  }

  const isDev = process.env.NODE_ENV === 'development';
  const maxAttempts = isDev ? 4 : 30;
  const delayMs = isDev ? 1000 : 3000;

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

// --- LOCAL FALLBACK CROPPING ---
async function localCropFallback(imageUrl: string, x: number, y: number, width: number, height: number): Promise<any> {
  // 1. MANDATORY 30-second artificial delay
  await new Promise((resolve) => setTimeout(resolve, 31000));

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

// --- LOCAL FALLBACK GEMINI PROMPT ---
async function localGeminiFallback(prompt: string, systemPrompt: string, modelName: string, images: string[]): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
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

// --- HELPER TO RESOLVE INCOMING NODE INPUTS FROM COMPLETED PARENTS ---
async function resolveNodeInputs(node: any, runId: string, edges: any[]): Promise<any> {
  const parentEdges = edges.filter((e) => e.target === node.id);
  const inputs: any = {};

  for (const edge of parentEdges) {
    const parentExecution = await prisma.nodeExecution.findFirst({
      where: { runId, nodeId: edge.source },
    });

    let parentOutput = null;

    if (parentExecution && parentExecution.status === 'SUCCESS') {
      parentOutput = parentExecution.output as any;
    } else {
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
async function executeWorkflowBackground(runId: string, nodesToExecute: any[], edgesToExecute: any[]) {
  const startTime = Date.now();

  try {
    while (true) {
      const executions = await prisma.nodeExecution.findMany({
        where: { runId },
      });

      const finished = executions.filter((e) => e.status === 'SUCCESS' || e.status === 'FAILED');
      if (finished.length === executions.length) {
        break;
      }

      const failedNode = executions.find((e) => e.status === 'FAILED');
      if (failedNode) {
        // Upstream failure, skip pending nodes and set to FAILED
        await prisma.nodeExecution.updateMany({
          where: { runId, status: 'PENDING' },
          data: { status: 'FAILED', errorMessage: 'Skipped due to upstream failure.' },
        });
        throw new Error('Workflow execution stopped due to task failure.');
      }

      // Ready nodes: PENDING status and all upstream direct parent nodes in execution scope are SUCCESS
      const readyExecutions = [];
      for (const ex of executions) {
        if (ex.status !== 'PENDING') continue;

        const parentEdges = edgesToExecute.filter((e) => e.target === ex.nodeId);
        const allParentsSuccess = parentEdges.every((e) => {
          const parentEx = executions.find((p) => p.nodeId === e.source);
          return !parentEx || parentEx.status === 'SUCCESS';
        });

        if (allParentsSuccess) {
          readyExecutions.push(ex);
        }
      }

      if (readyExecutions.length === 0) {
        const running = executions.filter((e) => e.status === 'RUNNING');
        if (running.length === 0) {
          // Safety fallback for cycle detection or config loops
          await prisma.nodeExecution.updateMany({
            where: { runId, status: 'PENDING' },
            data: { status: 'FAILED', errorMessage: 'Deadlock or circular path detected.' },
          });
          throw new Error('Configuration deadlock detected in DAG.');
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // Run ready sibling nodes concurrently
      await Promise.all(
        readyExecutions.map(async (ex) => {
          await prisma.nodeExecution.update({
            where: { id: ex.id },
            data: { status: 'RUNNING' },
          });

          const node = nodesToExecute.find((n) => n.id === ex.nodeId);
          const nodeStartTime = Date.now();

          try {
            const resolvedInputs = await resolveNodeInputs(node, runId, edgesToExecute);
            let output: any = {};

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

              const triggerRun = await tasks.trigger('crop-image', {
                imageUrl,
                x: crop.x,
                y: crop.y,
                width: crop.width,
                height: crop.height,
              });

              output = await pollTriggerRun(triggerRun.id, () =>
                localCropFallback(imageUrl, crop.x, crop.y, crop.width, crop.height)
              );
            } else if (node.type === 'gemini') {
              const prompt = resolvedInputs.prompt || node.data?.prompt || '';
              const systemPrompt = resolvedInputs.systemPrompt || node.data?.systemPrompt || '';
              const images = resolvedInputs.images || [];

              const triggerRun = await tasks.trigger('gemini-prompt', {
                prompt,
                systemPrompt,
                images,
              });

              output = await pollTriggerRun(triggerRun.id, () =>
                localGeminiFallback(prompt, systemPrompt, node.data?.model || 'Gemini 3.1 Pro', images)
              );
            }

            const duration = (Date.now() - nodeStartTime) / 1000;
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
            await prisma.nodeExecution.update({
              where: { id: ex.id },
              data: {
                status: 'FAILED',
                duration,
                errorMessage: nodeErr.message || 'Execution error',
              },
            });
          }
        })
      );
    }

    const finalExecutions = await prisma.nodeExecution.findMany({
      where: { runId },
    });
    const totalDuration = (Date.now() - startTime) / 1000;
    const hasFailed = finalExecutions.some((e) => e.status === 'FAILED');

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

export async function POST(req: Request) {
  try {
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

    const nodes = typeof workflow.nodes === 'string' ? JSON.parse(workflow.nodes) : workflow.nodes;
    const edges = typeof workflow.edges === 'string' ? JSON.parse(workflow.edges) : workflow.edges;

    let nodesToExecute = nodes;
    let edgesToExecute = edges;

    if (scope === 'PARTIAL' && nodeId) {
      nodesToExecute = nodes.filter((n: any) => n.id === nodeId);
      edgesToExecute = edges;
    }

    // Create the database Run record with RUNNING status
    const run = await prisma.run.create({
      data: {
        workflowId,
        status: 'RUNNING',
        duration: 0,
        scope: scope,
      },
    });

    // Initialize all participating NodeExecution records to PENDING status
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

    // Trigger background execution loop asynchronously
    executeWorkflowBackground(run.id, nodesToExecute, edgesToExecute).catch((err) => {
      console.error(`Background workflow run executor crashed:`, err);
    });

    return NextResponse.json({ runId: run.id, status: 'RUNNING' });
  } catch (error: any) {
    console.error('[Workflow Run API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}
