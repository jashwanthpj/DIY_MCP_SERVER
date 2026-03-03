import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prompts = await prisma.prompt.findMany({ where: { projectId: id } });
  return NextResponse.json(prompts);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const prompt = await prisma.prompt.create({
    data: {
      projectId: id,
      name: body.name || "new_prompt",
      description: body.description || "",
      arguments: JSON.stringify(body.arguments || []),
      template: body.template || "Hello {{name}}, how can I help you?",
    },
  });
  return NextResponse.json(prompt, { status: 201 });
}
