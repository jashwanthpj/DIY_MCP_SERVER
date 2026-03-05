import { NextRequest, NextResponse } from "next/server";
import { getProjectWithAccess } from "@/lib/project-access";
import { HUB_ENV_KEYS, type AIProvider } from "@/lib/ai-models";

const SYSTEM_PROMPT_BASE = `You are an MCP (Model Context Protocol) Server Builder Agent. You help users create, edit, and delete all parts of an MCP server: **tools**, **resources**, **prompts**, and **environment variables**.

# Entity Types

## 1. Tools
Functions that AI models can call. Each tool has a name, description, input parameters, and a handler.

### Create / Edit a Tool
\`\`\`mcp-tool
{
  "_action": "create",
  "name": "tool_name_snake_case",
  "description": "Clear description",
  "inputSchema": [
    { "name": "param", "type": "string", "description": "What this is", "required": true }
  ],
  "handlerType": "code",
  "handlerCode": "const result = 'hello';\\nreturn { content: [{ type: \\"text\\", text: result }] };"
}
\`\`\`
For edits, set \`"_action": "edit"\` and match the name exactly. Include ALL fields.

### Tool Handler Types
- **code** — TypeScript function body. Receives destructured params. Must return \`{ content: [{ type: "text", text: "..." }] }\`.
- **http_request** — handlerType "http_request", handlerCode "", handlerConfig: \`{ "url": "...", "method": "GET", "headers": [], "bodyTemplate": "", "responseMapping": "" }\`. Use \`{{param}}\` placeholders.
- **db_query** — handlerType "db_query", handlerCode "", handlerConfig: \`{ "dbType": "postgresql", "connectionEnvVar": "DATABASE_URL", "query": "SELECT * FROM t WHERE id = {{id}}" }\`.
Set handlerConfig to {} for code handlers.

### Input Parameter Types
string, number, boolean, object, array. For object: include \`children\` array. For array: include \`itemType\`.

## 2. Resources
Static or dynamic data that AI models can read. Each resource has a URI, name, MIME type, and handler code.

### Create / Edit a Resource
\`\`\`mcp-resource
{
  "_action": "create",
  "name": "resource_name",
  "uri": "resource://my-data",
  "description": "What this resource provides",
  "mimeType": "text/plain",
  "handlerCode": "return { contents: [{ uri, text: \\"Hello from resource!\\" }] };"
}
\`\`\`
For edits, set \`"_action": "edit"\` and match the name exactly. Include ALL fields.
The handler receives \`uri\` as a variable. Must return \`{ contents: [{ uri, text: "..." }] }\`.

## 3. Prompts
Reusable prompt templates with arguments. Each prompt has a name, arguments list, and a template string.

### Create / Edit a Prompt
\`\`\`mcp-prompt
{
  "_action": "create",
  "name": "prompt_name",
  "description": "What this prompt does",
  "arguments": [
    { "name": "topic", "description": "The topic to write about", "required": true }
  ],
  "template": "Write a detailed article about {{topic}}. Make it informative and engaging."
}
\`\`\`
For edits, set \`"_action": "edit"\` and match the name exactly. Include ALL fields.
Use \`{{arg_name}}\` in the template for argument placeholders.

## 4. Environment Variables
Configuration values like API keys and connection strings that tools/resources reference at runtime.

### Create / Edit an Env Variable
\`\`\`mcp-env
{
  "_action": "create",
  "key": "VARIABLE_NAME",
  "value": "",
  "description": "What this variable is for"
}
\`\`\`
For edits, set \`"_action": "edit"\` and match the key exactly. Include ALL fields.
For env vars, the \`key\` field acts as the name/identifier.

## Deleting Any Entity
To delete any entity type, use its block format with \`"_action": "delete"\` and the name/key:

\`\`\`mcp-tool
{ "_action": "delete", "name": "tool_to_delete" }
\`\`\`

\`\`\`mcp-resource
{ "_action": "delete", "name": "resource_to_delete" }
\`\`\`

\`\`\`mcp-prompt
{ "_action": "delete", "name": "prompt_to_delete" }
\`\`\`

\`\`\`mcp-env
{ "_action": "delete", "key": "VAR_TO_DELETE" }
\`\`\`

# Guidelines
- Ask clarifying questions if requirements are unclear
- You can output multiple blocks of different types in one response
- Use snake_case for tool/resource/prompt names, UPPER_SNAKE_CASE for env keys
- Write practical, working handler code with error handling
- When the user references something existing, use _action "edit" to update it
- When the user asks to delete/remove something, use _action "delete"
- NEVER create a new entity when the user asks to delete one
- When creating tools that need API keys or connection strings, also create the corresponding env variables
- When editing, always include the FULL definition, not just changed parts`;

interface ProjectContext {
  tools: { name: string; description: string; handlerType: string; parameters: string[]; handlerCode?: string }[];
  resources: { name: string; uri: string; description: string; mimeType: string }[];
  prompts: { name: string; description: string; arguments: string[]; template: string }[];
  envVars: { key: string; description: string }[];
}

function buildSystemPrompt(ctx?: ProjectContext): string {
  let prompt = SYSTEM_PROMPT_BASE;

  if (!ctx) return prompt;

  prompt += `\n\n# CURRENT PROJECT STATE\n`;

  if (ctx.tools.length > 0) {
    prompt += `\n## Existing Tools (${ctx.tools.length})\n`;
    for (const t of ctx.tools) {
      prompt += `- **${t.name}** (${t.handlerType}) — ${t.description}`;
      if (t.parameters.length > 0) prompt += ` | Params: ${t.parameters.join(", ")}`;
      prompt += `\n`;
    }
  } else {
    prompt += `\n## Tools: none yet\n`;
  }

  if (ctx.resources.length > 0) {
    prompt += `\n## Existing Resources (${ctx.resources.length})\n`;
    for (const r of ctx.resources) {
      prompt += `- **${r.name}** (${r.uri}) — ${r.description} [${r.mimeType}]\n`;
    }
  } else {
    prompt += `\n## Resources: none yet\n`;
  }

  if (ctx.prompts.length > 0) {
    prompt += `\n## Existing Prompts (${ctx.prompts.length})\n`;
    for (const p of ctx.prompts) {
      prompt += `- **${p.name}** — ${p.description}`;
      if (p.arguments.length > 0) prompt += ` | Args: ${p.arguments.join(", ")}`;
      prompt += `\n`;
    }
  } else {
    prompt += `\n## Prompts: none yet\n`;
  }

  if (ctx.envVars.length > 0) {
    prompt += `\n## Existing Env Variables (${ctx.envVars.length})\n`;
    for (const e of ctx.envVars) {
      prompt += `- **${e.key}** — ${e.description}\n`;
    }
  } else {
    prompt += `\n## Env Variables: none yet\n`;
  }

  return prompt;
}

type SendFn = (event: string, data: Record<string, unknown>) => void;

interface ClientMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
}

function getHubKey(provider: AIProvider): string | null {
  const envKey = HUB_ENV_KEYS[provider];
  return process.env[envKey] || null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectWithAccess(req, id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hub: Record<string, boolean> = {
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    google: !!process.env.GOOGLE_API_KEY,
  };
  return NextResponse.json({ hub });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectWithAccess(req, id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { messages, provider, model, apiKey, useHub, projectContext } = (await req.json()) as {
    messages: ClientMessage[];
    provider: AIProvider;
    model: string;
    apiKey?: string;
    useHub?: boolean;
    projectContext?: ProjectContext;
  };

  const systemPrompt = buildSystemPrompt(projectContext);

  const key = useHub ? getHubKey(provider) : apiKey;
  if (!key) {
    return NextResponse.json(
      { error: useHub ? `No API key configured for ${provider} in the model hub` : "API key is required" },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: SendFn = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        switch (provider) {
          case "anthropic":
            await streamAnthropic(key, model, messages, systemPrompt, send);
            break;
          case "openai":
            await streamOpenAI(key, model, messages, systemPrompt, send);
            break;
          case "google":
            await streamGoogle(key, model, messages, systemPrompt, send);
            break;
          default:
            send("error", { message: `Unsupported provider: ${provider}` });
        }
        send("done", {});
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/* ------------------------------------------------------------------ */
/*  SSE parser — works for all three providers                        */
/* ------------------------------------------------------------------ */

async function* parseSSE(response: Response): AsyncGenerator<{ event?: string; data: string }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      if (!part.trim()) continue;
      let event: string | undefined;
      let data = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
        else if (line.startsWith("data:")) data += line.slice(5);
      }
      if (data) yield { event, data };
    }
  }

  if (buffer.trim()) {
    let event: string | undefined;
    let data = "";
    for (const line of buffer.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) data += line.slice(6);
      else if (line.startsWith("data:")) data += line.slice(5);
    }
    if (data) yield { event, data };
  }
}

/* ------------------------------------------------------------------ */
/*  Anthropic — supports extended thinking                            */
/* ------------------------------------------------------------------ */

async function streamAnthropic(apiKey: string, model: string, messages: ClientMessage[], systemPrompt: string, send: SendFn) {
  const thinkingEnabled = model.includes("sonnet") || model.includes("opus");

  const anthropicMessages = messages.map((m) => {
    if (m.role === "assistant" && m.thinking && thinkingEnabled) {
      return {
        role: "assistant" as const,
        content: [
          { type: "thinking" as const, thinking: m.thinking },
          { type: "text" as const, text: m.content },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const body: Record<string, unknown> = {
    model,
    max_tokens: 16000,
    system: systemPrompt,
    messages: anthropicMessages,
    stream: true,
  };

  if (thinkingEnabled) {
    body.thinking = { type: "enabled", budget_tokens: 10000 };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${err}`);
  }

  for await (const { data } of parseSSE(response)) {
    if (data === "[DONE]") break;
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === "content_block_delta") {
        if (parsed.delta?.type === "thinking_delta") {
          send("thinking", { content: parsed.delta.thinking });
        } else if (parsed.delta?.type === "text_delta") {
          send("text", { content: parsed.delta.text });
        }
      } else if (parsed.type === "error") {
        throw new Error(parsed.error?.message || "Anthropic stream error");
      }
    } catch (e) {
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  OpenAI                                                             */
/* ------------------------------------------------------------------ */

async function streamOpenAI(apiKey: string, model: string, messages: ClientMessage[], systemPrompt: string, send: SendFn) {
  const isReasoning = model.startsWith("o");

  const systemRole = isReasoning ? "developer" : "system";
  const openaiMessages = [
    { role: systemRole, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const body: Record<string, unknown> = {
    model,
    messages: openaiMessages,
    stream: true,
  };

  if (isReasoning) {
    body.reasoning = { effort: "medium" };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${err}`);
  }

  for await (const { data } of parseSSE(response)) {
    if (data === "[DONE]") break;
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta;
      if (delta?.reasoning_content) {
        send("thinking", { content: delta.reasoning_content });
      }
      if (delta?.content) {
        send("text", { content: delta.content });
      }
    } catch (e) {
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Google Gemini — supports thinking for 2.5 models                  */
/* ------------------------------------------------------------------ */

async function streamGoogle(apiKey: string, model: string, messages: ClientMessage[], systemPrompt: string, send: SendFn) {
  const thinkingEnabled = (model.includes("2.5-pro") || model.includes("2.5-flash")) && !model.includes("lite");

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };

  if (thinkingEnabled) {
    body.generationConfig = { thinkingConfig: { thinkingBudget: 8000 } };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google API error (${response.status}): ${err}`);
  }

  for await (const { data } of parseSSE(response)) {
    if (data === "[DONE]") break;
    try {
      const parsed = JSON.parse(data);
      const parts = parsed.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.thought) {
            send("thinking", { content: part.text || "" });
          } else if (part.text) {
            send("text", { content: part.text });
          }
        }
      }
    } catch (e) {
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }
}
