import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Force dynamic execution for API routes
export const dynamic = 'force-dynamic';

/**
 * GET /api/runs/[id]
 * Retrieves the database execution status, duration, and individual node 
 * execution steps for a specific Trigger.dev run.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    // Query database for the target run and eagerly include all its node execution details
    const run = await prisma.run.findUnique({
      where: { id: params.id },
      include: { nodeExecutions: true }
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (error: any) {
    console.error("[API Run GET] Error:", error);
    return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/runs/[id]
 * Updates a run's status (e.g. marking it as FAILED if aborted by the user)
 * and marks any unfinished node executions as FAILED.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    const updatedRun = await prisma.run.update({
      where: { id: params.id },
      data: { status }
    });

    // If marked as FAILED, ensure all node executions are aborted and updated in database
    if (status === 'FAILED') {
      await prisma.nodeExecution.updateMany({
        where: { runId: params.id, status: { in: ['PENDING', 'RUNNING'] } },
        data: { status: 'FAILED', errorMessage: 'Execution stopped by user.' }
      });
    }

    return NextResponse.json(updatedRun);
  } catch (error: any) {
    console.error("[API Run PATCH] Error:", error);
    return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
  }
}

