import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const updateWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name cannot be empty').optional(),
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

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

    if (workflow.userId !== userId) {
      // If it's a seed workflow, clone it for this user!
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

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const workflow = await prisma.workflow.findUnique({
      where: { id },
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    if (workflow.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = updateWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.format() },
        { status: 400 }
      );
    }

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

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const workflow = await prisma.workflow.findUnique({
      where: { id },
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    if (workflow.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.workflow.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Workflow deleted successfully' });
  } catch (error: any) {
    console.error('[API workflow DELETE] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}
