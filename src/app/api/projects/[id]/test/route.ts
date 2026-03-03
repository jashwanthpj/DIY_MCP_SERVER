import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { startTestServer, stopTestServer, getTestServerStatus } from "@/lib/test-runner";
import type { McpProject, ToolHandlerType, ToolHandlerConfig } from "@/types/mcp";

function safeParse(value: string, fallback: unknown = {}) {
  if (!value || value.trim() === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function extractJsonFromSse(text: string): unknown {
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const payload = line.slice(6).trim();
      if (payload) {
        try {
          return JSON.parse(payload);
        } catch {
          continue;
        }
      }
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function mcpRequest(
  port: number,
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  const url = `http://localhost:${port}/mcp`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  const initRes = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "mcp-builder-test", version: "1.0.0" },
      },
      id: 1,
    }),
  });

  const initText = await initRes.text();
  const initData = extractJsonFromSse(initText) as Record<string, unknown> | null;

  if (!initData || initData.error) {
    const errMsg = initData
      ? JSON.stringify(initData.error)
      : "no response from server";
    throw new Error(`MCP init failed: ${errMsg}`);
  }

  const sessionId = initRes.headers.get("mcp-session-id");
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: 2,
    }),
  });

  const text = await res.text();
  if (!text || text.trim() === "") {
    throw new Error("Empty response from MCP server");
  }

  const data = extractJsonFromSse(text) as Record<string, unknown> | null;
  if (!data) {
    throw new Error(`Invalid response: ${text.substring(0, 200)}`);
  }
  if (data.error) {
    const err = data.error as Record<string, unknown>;
    throw new Error(String(err.message || JSON.stringify(err)));
  }
  return data.result;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const status = getTestServerStatus(id);
  return NextResponse.json(status);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (body.action === "stop") {
    const stopped = stopTestServer(id);
    return NextResponse.json({ stopped });
  }

  if (body.action === "call_tool") {
    try {
      const result = await mcpRequest(body.port, "tools/call", {
        name: body.toolName,
        arguments: body.params || {},
      });
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  }

  if (body.action === "read_resource") {
    try {
      const result = await mcpRequest(body.port, "resources/read", {
        uri: body.uri,
      });
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  }

  if (body.action === "get_prompt") {
    try {
      const result = await mcpRequest(body.port, "prompts/get", {
        name: body.promptName,
        arguments: body.args || {},
      });
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: { tools: true, resources: true, prompts: true, envVars: true },
  });

  if (!project)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const mcpProject = {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    tools: project.tools.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      name: t.name,
      description: t.description,
      inputSchema: safeParse(t.inputSchema, []),
      handlerType: (t.handlerType || "code") as ToolHandlerType,
      handlerCode: t.handlerCode,
      handlerConfig: safeParse(t.handlerConfig, {}) as ToolHandlerConfig,
    })),
    prompts: project.prompts.map((p) => ({
      ...p,
      arguments: safeParse(p.arguments, []),
    })),
  } as McpProject;

  try {
    const { port, pid } = await startTestServer(mcpProject);
    return NextResponse.json({ running: true, port, pid });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to start server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
