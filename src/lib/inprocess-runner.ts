import { generateHandlerBody } from "./codegen";
import type { McpProject } from "@/types/mcp";

const DB_QUERY_ERROR =
  "Database tools are not supported in the deployed test. Use custom code or HTTP request handlers, or run the app locally to test.";

function applyEnvVars(envVars: { key: string; value: string }[] = []): () => void {
  const prev: Record<string, string | undefined> = {};
  for (const v of envVars) {
    prev[v.key] = process.env[v.key];
    process.env[v.key] = v.value;
  }
  return () => {
    for (const v of envVars) {
      if (prev[v.key] !== undefined) process.env[v.key] = prev[v.key];
      else delete process.env[v.key];
    }
  };
}

export async function runToolInProcess(
  project: McpProject,
  toolName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const tool = (project.tools || []).find((t) => t.name === toolName);
  if (!tool) throw new Error(`Tool not found: ${toolName}`);

  if (tool.handlerType === "db_query") {
    throw new Error(DB_QUERY_ERROR);
  }

  const paramNames = (tool.inputSchema || []).map((f) => f.name);
  const values = paramNames.map((p) => params[p]);
  const body = generateHandlerBody(tool);

  const restoreEnv = applyEnvVars(
    (project.envVars || []).map((v) => ({ key: v.key, value: v.value }))
  );
  try {
    const fn = new Function(
      ...paramNames,
      `return (async () => { ${body} })();`
    );
    const result = await fn(...values);
    return result;
  } finally {
    restoreEnv();
  }
}

export async function runResourceInProcess(
  project: McpProject,
  uri: string
): Promise<unknown> {
  const resource = (project.resources || []).find((r) => r.uri === uri);
  if (!resource) throw new Error(`Resource not found: ${uri}`);

  const restoreEnv = applyEnvVars(
    (project.envVars || []).map((v) => ({ key: v.key, value: v.value }))
  );
  try {
    const fn = new Function(
      "uri",
      `return (async () => { ${resource.handlerCode} })();`
    );
    const result = await fn(uri);
    return result;
  } finally {
    restoreEnv();
  }
}

export function runPromptInProcess(
  project: McpProject,
  promptName: string,
  args: Record<string, unknown>
): { messages: Array<{ role: string; content: { type: string; text: string } }> } {
  const prompt = (project.prompts || []).find((p) => p.name === promptName);
  if (!prompt) throw new Error(`Prompt not found: ${promptName}`);

  let text = prompt.template;
  for (const a of prompt.arguments || []) {
    const val = args[a.name];
    text = text.replace(
      new RegExp(`\\{\\{\\s*${a.name}\\s*\\}\\}`, "g"),
      String(val ?? "")
    );
  }
  return {
    messages: [
      {
        role: "user",
        content: { type: "text", text },
      },
    ],
  };
}
