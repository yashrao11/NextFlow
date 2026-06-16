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

