import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with NextFlow sample Headphone Campaign workflow...');

  // 1. Create a Seed User
  const seedUser = await prisma.user.upsert({
    where: { id: 'seed-user-id' },
    update: {},
    create: {
      id: 'seed-user-id',
      email: 'developer@nextflow.ai',
    },
  });

  console.log(`Seed user ensured: ${seedUser.email}`);

  // 2. Define Campaign Nodes
  const nodes = [
    {
      id: 'request-inputs',
      type: 'requestInputs',
      position: { x: 100, y: 300 },
      data: {
        label: 'Request-Inputs',
        isRunning: false,
        fields: [
          {
            id: 'text-field-id',
            name: 'text_field',
            type: 'text',
            value: 'Product: Wireless Bluetooth Headphones. Features: Noise cancellation, 30-hour battery, foldable design.',
          },
          {
            id: 'image-field-id',
            name: 'image_field',
            type: 'image',
            value: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=400',
          },
        ],
      },
    },
    {
      id: 'crop-1',
      type: 'cropImage',
      position: { x: 450, y: 150 },
      data: {
        label: 'Crop Image #1',
        isRunning: false,
        crop: { x: 20, y: 20, width: 60, height: 60 },
        imageUrl: '',
      },
    },
    {
      id: 'crop-2',
      type: 'cropImage',
      position: { x: 450, y: 500 },
      data: {
        label: 'Crop Image #2',
        isRunning: false,
        crop: { x: 0, y: 0, width: 100, height: 50 },
        imageUrl: '',
      },
    },
    {
      id: 'gemini-1',
      type: 'gemini',
      position: { x: 450, y: 320 },
      data: {
        label: 'Gemini 3.1 Pro #1',
        isRunning: false,
        model: 'Gemini 3.1 Pro',
        systemPrompt: 'You are a marketing copywriter. Write a one-paragraph product description.',
        prompt: '',
        temperature: 0.7,
        maxTokens: 2048,
        response: 'Awaiting execution run...',
      },
    },
    {
      id: 'gemini-2',
      type: 'gemini',
      position: { x: 800, y: 320 },
      data: {
        label: 'Gemini 3.1 Pro #2',
        isRunning: false,
        model: 'Gemini 3.1 Pro',
        systemPrompt: 'Condense the following product description into a tweet-length hook (under 240 characters).',
        prompt: '',
        temperature: 0.7,
        maxTokens: 2048,
        response: 'Awaiting execution run...',
      },
    },
    {
      id: 'gemini-3',
      type: 'gemini',
      position: { x: 1150, y: 300 },
      data: {
        label: 'Gemini 3.1 Pro #3 (Final)',
        isRunning: false,
        model: 'Gemini 3.1 Pro',
        systemPrompt: 'You are a social media manager. Combine the tweet hook and the two product crops into a final marketing post.',
        prompt: '',
        temperature: 0.7,
        maxTokens: 2048,
        response: 'Awaiting execution run...',
      },
    },
    {
      id: 'response',
      type: 'response',
      position: { x: 1500, y: 300 },
      data: {
        label: 'Response',
        isRunning: false,
        result: '',
      },
    },
  ];

  // 3. Define Campaign Connections (Edges)
  const edges = [
    {
      id: 'edge-1',
      source: 'request-inputs',
      sourceHandle: 'image-field-id-image-output',
      target: 'crop-1',
      targetHandle: 'image-input',
      type: 'custom',
      data: { isRunning: false },
    },
    {
      id: 'edge-2',
      source: 'request-inputs',
      sourceHandle: 'image-field-id-image-output',
      target: 'crop-2',
      targetHandle: 'image-input',
      type: 'custom',
      data: { isRunning: false },
    },
    {
      id: 'edge-3',
      source: 'request-inputs',
      sourceHandle: 'text-field-id-text-output',
      target: 'gemini-1',
      targetHandle: 'prompt-text-input',
      type: 'custom',
      data: { isRunning: false },
    },
    {
      id: 'edge-4',
      source: 'gemini-1',
      sourceHandle: 'response-text-output',
      target: 'gemini-2',
      targetHandle: 'prompt-text-input',
      type: 'custom',
      data: { isRunning: false },
    },
    {
      id: 'edge-5',
      source: 'gemini-2',
      sourceHandle: 'response-text-output',
      target: 'gemini-3',
      targetHandle: 'prompt-text-input',
      type: 'custom',
      data: { isRunning: false },
    },
    {
      id: 'edge-6',
      source: 'crop-1',
      sourceHandle: 'image-output',
      target: 'gemini-3',
      targetHandle: 'image-input',
      type: 'custom',
      data: { isRunning: false },
    },
    {
      id: 'edge-7',
      source: 'crop-2',
      sourceHandle: 'image-output',
      target: 'gemini-3',
      targetHandle: 'image-input',
      type: 'custom',
      data: { isRunning: false },
    },
    {
      id: 'edge-8',
      source: 'gemini-3',
      sourceHandle: 'response-text-output',
      target: 'response',
      targetHandle: 'result-input',
      type: 'custom',
      data: { isRunning: false },
    },
  ];

  // 4. Create the Workflow
  const headphoneWorkflow = await prisma.workflow.upsert({
    where: { id: 'headphone-campaign-workflow-id' },
    update: {
      name: 'Headphones Marketing Campaign',
      nodes: JSON.stringify(nodes),
      edges: JSON.stringify(edges),
    },
    create: {
      id: 'headphone-campaign-workflow-id',
      userId: 'seed-user-id',
      name: 'Headphones Marketing Campaign',
      nodes: JSON.stringify(nodes),
      edges: JSON.stringify(edges),
    },
  });

  console.log(`Workflow seeded successfully: ${headphoneWorkflow.name} (${headphoneWorkflow.id})`);
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
