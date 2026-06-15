import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const createWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required and cannot be empty'),
});
// GET: List workflows | POST: Create workflow
export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses[0]?.emailAddress || 'no-email@clerk.com';

    // Proactively upsert User to prevent foreign key errors
    await prisma.user.upsert({
      where: { id: userId },
      update: { email },
      create: { id: userId, email },
    });

    const body = await req.json();
    const parsed = createWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const defaultNodes = [
      {
        id: 'request-inputs',
        type: 'requestInputs',
        position: { x: 100, y: 200 },
        data: { label: 'Request Inputs' },
      },
      {
        id: 'response',
        type: 'response',
        position: { x: 500, y: 200 },
        data: { label: 'Response' },
      },
    ];

    const workflow = await prisma.workflow.create({
      data: {
        name: parsed.data.name,
        userId,
        nodes: defaultNodes,
        edges: [],
      },
    });

    return NextResponse.json(workflow, { status: 210 }); // Or 201 Created
  } catch (error: any) {
    console.error('[API workflows POST] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses[0]?.emailAddress || 'no-email@clerk.com';

    // Proactively upsert User to prevent foreign key errors
    await prisma.user.upsert({
      where: { id: userId },
      update: { email },
      create: { id: userId, email },
    });

    // Check if the user already has workflows
    let userWorkflows = await prisma.workflow.findMany({
      where: { userId },
      include: {
        runs: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastEdited: 'desc' },
    });

    // If the user has no workflows, automatically clone the seeded Headphones workflow for them!
    if (userWorkflows.length === 0) {
      const seedWorkflow = await prisma.workflow.findUnique({
        where: { id: 'headphone-campaign-workflow-id' },
      });

      if (seedWorkflow) {
        // Clone the seeded workflow for the user
        const clonedWorkflow = await prisma.workflow.create({
          data: {
            name: seedWorkflow.name,
            userId: userId,
            nodes: seedWorkflow.nodes as any,
            edges: seedWorkflow.edges as any,
          },
        });
        userWorkflows = [{ ...clonedWorkflow, runs: [] }];
      }
    }

    return NextResponse.json(userWorkflows);
  } catch (error: any) {
    console.error('[API workflows GET] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}
