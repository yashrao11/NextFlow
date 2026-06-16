import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// Force dynamic execution for API routes since they query user-specific database records
export const dynamic = 'force-dynamic';

// Validation schema for creating a workflow
const createWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required and cannot be empty'),
});

/**
 * POST /api/workflows
 * Creates a brand new workflow configuration with default Request Inputs and Response nodes.
 */
export async function POST(req: Request) {
  try {
    // 1. Authenticate the request using Clerk
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses[0]?.emailAddress || 'no-email@clerk.com';

    // 2. Proactively upsert User record to ensure foreign key integrity constraints
    await prisma.user.upsert({
      where: { id: userId },
      update: { email },
      create: { id: userId, email },
    });

    // 3. Parse and validate JSON request body
    const body = await req.json();
    const parsed = createWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.format() },
        { status: 400 }
      );
    }

    // 4. Set up default canvas nodes: Request Inputs (start) and Response (end)
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

    // 5. Create workflow in Prisma DB
    const workflow = await prisma.workflow.create({
      data: {
        name: parsed.data.name,
        userId,
        nodes: defaultNodes,
        edges: [],
      },
    });

    return NextResponse.json(workflow, { status: 210 }); // Status 210 Custom Success
  } catch (error: any) {
    console.error('[API workflows POST] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}

/**
 * GET /api/workflows
 * Lists all workflows belonging to the current Clerk user.
 * If the user has zero workflows, it clones the default Headphones seed campaign.
 */
export async function GET() {
  try {
    // 1. Authenticate user
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses[0]?.emailAddress || 'no-email@clerk.com';

    // 2. Proactively upsert User record
    await prisma.user.upsert({
      where: { id: userId },
      update: { email },
      create: { id: userId, email },
    });

    // 3. Find user's workflows and include their latest execution runs
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

    // 4. Auto-seeding: If user is new (0 workflows), clone the Headphones workflow for them!
    if (userWorkflows.length === 0) {
      const seedWorkflow = await prisma.workflow.findUnique({
        where: { id: 'headphone-campaign-workflow-id' },
      });

      if (seedWorkflow) {
        // Clone the template workflow owned by 'seed-user-id' to the active user's credentials
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

