import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const latestRun = await prisma.run.findFirst({
      where: { workflowId: id },
      orderBy: { timestamp: 'desc' },
      include: { nodeExecutions: true }
    });

    if (!latestRun) {
      return NextResponse.json({ status: 'NONE' });
    }

    return NextResponse.json(latestRun);
  } catch (error: any) {
    console.error('[API workflows runs latest GET] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}
