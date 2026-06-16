import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// Force dynamic execution for API routes
export const dynamic = 'force-dynamic';

// Validation schema for updating a workflow
const updateWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name cannot be empty').optional(),
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
});

/**
 * GET /api/workflows/[id]
 * Fetches a single workflow by its ID along with its historical runs.
 * If the workflow is a seeded system template and the user does not own it,
 * it automatically clones the template under the user's account.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate user
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    // 2. Fetch the workflow from database
    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: {
        runs: {
          orderBy: { timestamp: 'desc' },
          include: {
            nodeExecutions: true,
          },
        },
      },
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // 3. Authorization check
    if (workflow.userId !== userId) {
      // Auto-cloning for seed system templates:
      // If the template belongs to 'seed-user-id', clone it for this user
      if (workflow.userId === 'seed-user-id') {
        const existingClone = await prisma.workflow.findFirst({
          where: {
            userId: userId,
            name: workflow.name,
          },
          include: {
            runs: {
              orderBy: { timestamp: 'desc' },
              include: {
                nodeExecutions: true,
              },
            },
          },
        });

        if (existingClone) {
          return NextResponse.json(existingClone);
        }

        // Create the clone record
        const clonedWorkflow = await prisma.workflow.create({
          data: {
            name: workflow.name,
            userId: userId,
            nodes: workflow.nodes as any,
            edges: workflow.edges as any,
          },
        });
        return NextResponse.json(clonedWorkflow);
      }

      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(workflow);
  } catch (error: any) {
    console.error('[API workflow GET] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/workflows/[id]
 * Updates workflow configuration (name, nodes layout, edges connection list).
 */
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate user
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    // 2. Fetch target workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id },
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // 3. Verify ownership
    if (workflow.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 4. Validate schema
    const body = await req.json();
    const parsed = updateWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.format() },
        { status: 400 }
      );
    }

    // 5. Update data inside Database
    const updatedWorkflow = await prisma.workflow.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.nodes !== undefined && { nodes: parsed.data.nodes }),
        ...(parsed.data.edges !== undefined && { edges: parsed.data.edges }),
      },
    });

    return NextResponse.json(updatedWorkflow);
  } catch (error: any) {
    console.error('[API workflow PUT] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/workflows/[id]
 * Deletes the specified workflow from PostgreSQL.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate user
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    // 2. Fetch target workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id },
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // 3. Verify ownership
    if (workflow.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 4. Delete from Database
    await prisma.workflow.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Workflow deleted successfully' });
  } catch (error: any) {
    console.error('[API workflow DELETE] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}

