import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resources = await prisma.resource.findMany({ where: { projectId: id } });
  return NextResponse.json(resources);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const resource = await prisma.resource.create({
    data: {
      projectId: id,
      uri: body.uri || "resource://example",
      name: body.name || "new_resource",
      description: body.description || "",
      mimeType: body.mimeType || "text/plain",
      handlerCode: body.handlerCode || 'return { contents: [{ uri, text: "Hello from resource!" }] };',
    },
  });
  return NextResponse.json(resource, { status: 201 });
}
