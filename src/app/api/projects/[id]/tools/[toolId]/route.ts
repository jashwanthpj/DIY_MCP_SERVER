import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  const { toolId } = await params;
  const body = await req.json();
  const tool = await prisma.tool.update({
    where: { id: toolId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.inputSchema !== undefined && {
        inputSchema: JSON.stringify(body.inputSchema),
      }),
      ...(body.handlerType !== undefined && { handlerType: body.handlerType }),
      ...(body.handlerCode !== undefined && { handlerCode: body.handlerCode }),
      ...(body.handlerConfig !== undefined && {
        handlerConfig: JSON.stringify(body.handlerConfig),
      }),
    },
  });
  return NextResponse.json(tool);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  const { toolId } = await params;
  await prisma.tool.delete({ where: { id: toolId } });
  return NextResponse.json({ success: true });
}
