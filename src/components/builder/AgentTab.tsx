"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Bot, User, ChevronDown, ChevronRight, Sparkles, Save,
  Check, Loader2, Brain, Cloud, Settings2, Code, Globe, Database,
  AlertCircle, Pencil, Trash2, FileText, MessageSquare, KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AI_MODELS, PROVIDER_LABELS, type AIProvider } from "@/lib/ai-models";
import type {
  McpProject, McpTool, McpResource, McpPrompt, EnvVar,
  AgentChatMessage, GeneratedEntity, AgentEntityType,
  ParamField, PromptArgument,
} from "@/types/mcp";
import { projectApiHeaders } from "@/lib/anon-id";

/* ------------------------------------------------------------------ */
/*  Parser: extract all entity blocks from streamed text               */
/* ------------------------------------------------------------------ */

const BLOCK_TYPES: { tag: string; entityType: AgentEntityType }[] = [
  { tag: "mcp-tool", entityType: "tool" },
  { tag: "mcp-resource", entityType: "resource" },
  { tag: "mcp-prompt", entityType: "prompt" },
  { tag: "mcp-env", entityType: "env" },
];

function parseEntities(text: string, project: McpProject): GeneratedEntity[] {
  const entities: GeneratedEntity[] = [];

  for (const { tag, entityType } of BLOCK_TYPES) {
    const regex = new RegExp("```" + tag + "\\s*\\n([\\s\\S]*?)```", "g");
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        const action = parsed._action || "create";
        const entity = buildEntity(entityType, action, parsed, project);
        if (entity) entities.push(entity);
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return entities;
}

function buildEntity(
  entityType: AgentEntityType,
  action: string,
  parsed: Record<string, unknown>,
  project: McpProject
): GeneratedEntity | null {
  const base = {
    _entityType: entityType,
    _action: action as GeneratedEntity["_action"],
    saved: false,
    saving: false,
    existingId: undefined as string | undefined,
  };

  switch (entityType) {
    case "tool": {
      const name = (parsed.name as string) || "unnamed_tool";
      if (action === "edit" || action === "delete") {
        const found = (project.tools || []).find((t) => t.name.toLowerCase() === name.toLowerCase());
        if (found) base.existingId = found.id;
      }
      return {
        ...base,
        name,
        description: (parsed.description as string) || "",
        inputSchema: Array.isArray(parsed.inputSchema) ? parsed.inputSchema as ParamField[] : [],
        handlerType: (parsed.handlerType as "code" | "http_request" | "db_query") || "code",
        handlerCode: (parsed.handlerCode as string) || "",
        handlerConfig: (parsed.handlerConfig as Record<string, never>) || {},
      };
    }
    case "resource": {
      const name = (parsed.name as string) || "unnamed_resource";
      if (action === "edit" || action === "delete") {
        const found = (project.resources || []).find((r) => r.name.toLowerCase() === name.toLowerCase());
        if (found) base.existingId = found.id;
      }
      return {
        ...base,
        name,
        description: (parsed.description as string) || "",
        uri: (parsed.uri as string) || "resource://example",
        mimeType: (parsed.mimeType as string) || "text/plain",
        handlerCode: (parsed.handlerCode as string) || "",
      };
    }
    case "prompt": {
      const name = (parsed.name as string) || "unnamed_prompt";
      if (action === "edit" || action === "delete") {
        const found = (project.prompts || []).find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (found) base.existingId = found.id;
      }
      return {
        ...base,
        name,
        description: (parsed.description as string) || "",
        arguments: Array.isArray(parsed.arguments) ? parsed.arguments as PromptArgument[] : [],
        template: (parsed.template as string) || "",
      };
    }
    case "env": {
      const key = (parsed.key as string) || "NEW_VAR";
      if (action === "edit" || action === "delete") {
        const found = (project.envVars || []).find((e) => e.key.toLowerCase() === key.toLowerCase());
        if (found) base.existingId = found.id;
      }
      return {
        ...base,
        name: key,
        description: (parsed.description as string) || "",
        key,
        value: (parsed.value as string) || "",
      };
    }
  }
}

function stripEntityBlocks(text: string): string {
  let result = text;
  for (const { tag } of BLOCK_TYPES) {
    result = result.replace(new RegExp("```" + tag + "\\s*\\n[\\s\\S]*?```", "g"), "");
  }
  return result.trim();
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function AgentTab({ project, onUpdate }: { project: McpProject; onUpdate: () => void }) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const [provider, setProvider] = useState<AIProvider>("openai");
  const [model, setModel] = useState("o3");
  const [apiKey, setApiKey] = useState("");
  const [useHub, setUseHub] = useState(false);
  const [hubAvailability, setHubAvailability] = useState<Record<string, boolean>>({});
  const [configOpen, setConfigOpen] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${project.id}/agent`, { headers: projectApiHeaders() })
      .then((r) => r.json())
      .then((data) => {
        setHubAvailability(data.hub || {});
        if (Object.values(data.hub || {}).some(Boolean)) setUseHub(true);
      })
      .catch(() => {});
  }, [project.id]);

  const filteredModels = AI_MODELS.filter((m) => m.provider === provider);

  useEffect(() => {
    if (!filteredModels.some((m) => m.id === model) && filteredModels.length > 0) {
      setModel(filteredModels[0].id);
    }
  }, [provider, filteredModels, model]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const buildProjectContext = () => ({
    tools: (project.tools || []).map((t) => ({
      name: t.name,
      description: t.description,
      handlerType: t.handlerType,
      parameters: (t.inputSchema || []).map(
        (p: ParamField) => `${p.name} (${p.type}${p.required ? ", required" : ""})`
      ),
      handlerCode: t.handlerType === "code" ? t.handlerCode : undefined,
    })),
    resources: (project.resources || []).map((r) => ({
      name: r.name,
      uri: r.uri,
      description: r.description,
      mimeType: r.mimeType,
    })),
    prompts: (project.prompts || []).map((p) => ({
      name: p.name,
      description: p.description,
      arguments: (p.arguments || []).map(
        (a: PromptArgument) => `${a.name}${a.required ? " (required)" : ""}`
      ),
      template: p.template,
    })),
    envVars: (project.envVars || []).map((e) => ({
      key: e.key,
      description: e.description,
    })),
  });

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    if (!useHub && !apiKey) return;

    const userMsg: AgentChatMessage = { id: crypto.randomUUID(), role: "user", content: text, entities: [] };
    const assistantMsg: AgentChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "", thinking: "", entities: [] };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);
    setConfigOpen(false);

    const conversationHistory = [
      ...messages.map((m) => ({ role: m.role, content: m.content, thinking: m.thinking })),
      { role: "user" as const, content: text },
    ];

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const res = await fetch(`/api/projects/${project.id}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...projectApiHeaders() },
        body: JSON.stringify({
          messages: conversationHistory,
          provider,
          model,
          apiKey: useHub ? undefined : apiKey,
          useHub,
          projectContext: buildProjectContext(),
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: `Error: ${err.error || res.statusText}` } : m))
        );
        setStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accText = "";
      let accThinking = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.trim()) continue;
          let eventType = "";
          let eventData = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData += line.slice(6);
          }
          if (!eventData) continue;

          try {
            const data = JSON.parse(eventData);
            if (eventType === "thinking") {
              accThinking += data.content || "";
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, thinking: accThinking } : m))
              );
            } else if (eventType === "text") {
              accText += data.content || "";
              const entities = parseEntities(accText, project);
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: accText, entities } : m))
              );
            } else if (eventType === "error") {
              accText += `\n\nError: ${data.message}`;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: accText } : m))
              );
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: m.content + "\n\nError: Connection failed" } : m
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  /* ---- Save / update / delete any entity ---- */

  const saveEntity = async (messageId: string, entityIndex: number, entity: GeneratedEntity) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const entities = [...(m.entities || [])];
        entities[entityIndex] = { ...entities[entityIndex], saving: true };
        return { ...m, entities };
      })
    );

    try {
      await performEntityApiCall(project.id, entity);

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const entities = [...(m.entities || [])];
          entities[entityIndex] = { ...entities[entityIndex], saved: true, saving: false };
          return { ...m, entities };
        })
      );
      onUpdate();
    } catch {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const entities = [...(m.entities || [])];
          entities[entityIndex] = { ...entities[entityIndex], saving: false };
          return { ...m, entities };
        })
      );
    }
  };

  const currentModel = AI_MODELS.find((m) => m.id === model);
  const canSend = input.trim() && !streaming && (useHub ? hubAvailability[provider] : !!apiKey);

  const totalEntities =
    (project.tools?.length ?? 0) +
    (project.resources?.length ?? 0) +
    (project.prompts?.length ?? 0) +
    (project.envVars?.length ?? 0);

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[600px]">
      {/* Config panel */}
      <Card className="mb-4 shrink-0">
        <button
          onClick={() => setConfigOpen(!configOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/50 rounded-t-lg transition-colors"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Model Configuration
            {currentModel && (
              <Badge variant="secondary" className="ml-2 font-normal">
                {PROVIDER_LABELS[provider]} / {currentModel.name}
                {currentModel.thinking && <Brain className="ml-1 h-3 w-3 inline" />}
              </Badge>
            )}
          </span>
          {configOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {configOpen && (
          <CardContent className="pt-0 pb-4">
            <Separator className="mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="grid gap-2">
                <Label className="text-xs">Provider</Label>
                <Select value={provider} onValueChange={(v) => setProvider(v as AIProvider)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {filteredModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2">
                          {m.name}
                          {m.thinking && <Brain className="h-3 w-3 text-purple-500" />}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">API Key Source</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">{useHub ? "Model Hub" : "Own Key"}</Label>
                    <Switch checked={useHub} onCheckedChange={setUseHub} disabled={!hubAvailability[provider]} />
                  </div>
                </div>
                {useHub ? (
                  <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${hubAvailability[provider] ? "text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-950" : "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950"}`}>
                    <Cloud className="h-4 w-4 shrink-0" />
                    <span>{hubAvailability[provider] ? "Hub key available" : "No hub key configured"}</span>
                  </div>
                ) : (
                  <Input
                    type="password"
                    placeholder={`Enter ${PROVIDER_LABELS[provider]} API key`}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="font-mono text-xs"
                  />
                )}
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">&nbsp;</Label>
                {currentModel?.thinking ? (
                  <div className="flex items-center gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300">
                    <Brain className="h-4 w-4 shrink-0" />
                    <span>Thinking enabled</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <span>Standard mode</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">AI Agent Builder</h3>
                <p className="text-muted-foreground max-w-md text-sm">
                  Describe what you need in plain English — tools, resources, prompts, or environment
                  variables. The agent will build everything for your MCP server.
                  {totalEntities > 0 && (
                    <span className="block mt-1">
                      Your project already has {totalEntities} item{totalEntities !== 1 ? "s" : ""}. You can ask the agent to edit or delete them too.
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 max-w-2xl">
                  {(totalEntities > 0
                    ? [
                        "Show me everything in my project and suggest improvements",
                        `Add a resource that provides system configuration data`,
                        "Create a prompt template for summarizing documents",
                      ]
                    : [
                        "Create a tool that fetches weather data for any city using an API",
                        "I need tools to manage a PostgreSQL database — read, create, and delete records",
                        "Build a complete server with tools, prompts, and env vars for a todo app",
                      ]
                  ).map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(suggestion)}
                      className="text-left text-xs p-3 rounded-lg border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                message={msg}
                streaming={streaming && msg === messages[messages.length - 1]}
                onSaveEntity={(idx, entity) => saveEntity(msg.id, idx, entity)}
              />
            ))}
          </div>
        </ScrollArea>

        <Separator />

        <div className="p-4 shrink-0">
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
              }}
              placeholder="Describe what you need — tools, resources, prompts, env vars..."
              className="min-h-[44px] max-h-[120px] resize-none text-sm"
              rows={1}
              disabled={streaming}
            />
            {streaming ? (
              <Button variant="destructive" size="icon" onClick={() => { abortRef.current?.abort(); setStreaming(false); }} className="shrink-0 h-[44px] w-[44px]">
                <Loader2 className="h-4 w-4 animate-spin" />
              </Button>
            ) : (
              <Button size="icon" onClick={sendMessage} disabled={!canSend} className="shrink-0 h-[44px] w-[44px]">
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          {!useHub && !apiKey && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Enter an API key to start chatting
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  API call dispatcher for all entity types                           */
/* ------------------------------------------------------------------ */

async function performEntityApiCall(projectId: string, entity: GeneratedEntity) {
  const headers = { "Content-Type": "application/json", ...projectApiHeaders() };

  switch (entity._entityType) {
    case "tool": {
      const payload = {
        name: entity.name, description: entity.description,
        inputSchema: entity.inputSchema, handlerType: entity.handlerType,
        handlerCode: entity.handlerCode, handlerConfig: entity.handlerConfig,
      };
      if (entity._action === "delete" && entity.existingId) {
        await fetch(`/api/projects/${projectId}/tools/${entity.existingId}`, { method: "DELETE", headers: projectApiHeaders() });
      } else if (entity.existingId) {
        await fetch(`/api/projects/${projectId}/tools/${entity.existingId}`, { method: "PATCH", headers, body: JSON.stringify(payload) });
      } else {
        await fetch(`/api/projects/${projectId}/tools`, { method: "POST", headers, body: JSON.stringify(payload) });
      }
      break;
    }
    case "resource": {
      const payload = {
        name: entity.name, description: entity.description,
        uri: entity.uri, mimeType: entity.mimeType, handlerCode: entity.handlerCode,
      };
      if (entity._action === "delete" && entity.existingId) {
        await fetch(`/api/projects/${projectId}/resources/${entity.existingId}`, { method: "DELETE", headers: projectApiHeaders() });
      } else if (entity.existingId) {
        await fetch(`/api/projects/${projectId}/resources/${entity.existingId}`, { method: "PATCH", headers, body: JSON.stringify(payload) });
      } else {
        await fetch(`/api/projects/${projectId}/resources`, { method: "POST", headers, body: JSON.stringify(payload) });
      }
      break;
    }
    case "prompt": {
      const payload = {
        name: entity.name, description: entity.description,
        arguments: entity.arguments, template: entity.template,
      };
      if (entity._action === "delete" && entity.existingId) {
        await fetch(`/api/projects/${projectId}/prompts/${entity.existingId}`, { method: "DELETE", headers: projectApiHeaders() });
      } else if (entity.existingId) {
        await fetch(`/api/projects/${projectId}/prompts/${entity.existingId}`, { method: "PATCH", headers, body: JSON.stringify(payload) });
      } else {
        await fetch(`/api/projects/${projectId}/prompts`, { method: "POST", headers, body: JSON.stringify(payload) });
      }
      break;
    }
    case "env": {
      if (entity._action === "delete" && entity.existingId) {
        await fetch(`/api/projects/${projectId}/env?envId=${entity.existingId}`, { method: "DELETE", headers: projectApiHeaders() });
      } else if (entity.existingId) {
        await fetch(`/api/projects/${projectId}/env`, {
          method: "PATCH", headers,
          body: JSON.stringify({ id: entity.existingId, key: entity.key, value: entity.value, description: entity.description }),
        });
      } else {
        await fetch(`/api/projects/${projectId}/env`, {
          method: "POST", headers,
          body: JSON.stringify({ key: entity.key, value: entity.value, description: entity.description }),
        });
      }
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Chat bubble                                                        */
/* ------------------------------------------------------------------ */

function ChatBubble({
  message, streaming, onSaveEntity,
}: {
  message: AgentChatMessage;
  streaming: boolean;
  onSaveEntity: (idx: number, entity: GeneratedEntity) => void;
}) {
  const isUser = message.role === "user";
  const [thinkingOpen, setThinkingOpen] = useState(false);

  useEffect(() => {
    if (streaming && message.thinking) setThinkingOpen(true);
  }, [streaming, message.thinking]);

  const displayContent = stripEntityBlocks(message.content);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={`flex flex-col gap-2 max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && message.thinking && (
          <div className="w-full">
            <button
              onClick={() => setThinkingOpen(!thinkingOpen)}
              className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 mb-1 transition-colors"
            >
              <Brain className="h-3 w-3" />
              <span>{streaming && !message.content ? "Thinking..." : "View thinking"}</span>
              {thinkingOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {thinkingOpen && (
              <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 text-xs text-purple-900 whitespace-pre-wrap max-h-[200px] overflow-y-auto font-mono leading-relaxed dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-200">
                {message.thinking}
                {streaming && !message.content && <span className="inline-block w-1.5 h-3.5 bg-purple-400 animate-pulse ml-0.5 align-middle" />}
              </div>
            )}
          </div>
        )}

        {(displayContent || (streaming && !message.thinking)) && (
          <div className={`rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            {displayContent}
            {streaming && message.role === "assistant" && !displayContent && !message.thinking && (
              <span className="inline-block w-1.5 h-3.5 bg-foreground/40 animate-pulse align-middle" />
            )}
            {streaming && message.role === "assistant" && displayContent && (
              <span className="inline-block w-1.5 h-3.5 bg-foreground/40 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        )}

        {!isUser && message.entities && message.entities.length > 0 && (
          <div className="w-full space-y-3 mt-1">
            {message.entities.map((entity, i) => (
              <EntityCard key={`${message.id}-entity-${i}`} entity={entity} onSave={() => onSaveEntity(i, entity)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Entity card — renders differently per type                         */
/* ------------------------------------------------------------------ */

const ENTITY_META: Record<AgentEntityType, { label: string; icon: React.ReactNode; color: string }> = {
  tool: { label: "Tool", icon: <Code className="h-3 w-3" />, color: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950 dark:border-blue-800" },
  resource: { label: "Resource", icon: <FileText className="h-3 w-3" />, color: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950 dark:border-emerald-800" },
  prompt: { label: "Prompt", icon: <MessageSquare className="h-3 w-3" />, color: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-950 dark:border-violet-800" },
  env: { label: "Env Var", icon: <KeyRound className="h-3 w-3" />, color: "text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-950 dark:border-orange-800" },
};

function handlerLabel(type?: string) {
  switch (type) {
    case "code": return "Code";
    case "http_request": return "HTTP";
    case "db_query": return "DB";
    default: return "";
  }
}

function EntityCard({ entity, onSave }: { entity: GeneratedEntity; onSave: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isEdit = entity._action === "edit" && !!entity.existingId;
  const isDelete = entity._action === "delete" && !!entity.existingId;
  const meta = ENTITY_META[entity._entityType];

  const borderClass = isDelete ? "border-red-300" : isEdit ? "border-amber-300" : "";

  const displayName = entity._entityType === "env" ? entity.key || entity.name : entity.name;

  const previewContent = getPreviewContent(entity);

  return (
    <div className={`rounded-lg border bg-card shadow-sm overflow-hidden ${borderClass}`}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-mono font-semibold text-sm ${isDelete ? "line-through text-muted-foreground" : ""}`}>
                {displayName}
              </span>
              <Badge className={`shrink-0 text-[10px] flex items-center gap-1 border ${meta.color}`}>
                {meta.icon}
                {meta.label}
              </Badge>
              {entity._entityType === "tool" && entity.handlerType && !isDelete && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {handlerLabel(entity.handlerType)}
                </Badge>
              )}
              {isDelete && (
                <Badge className="shrink-0 text-[10px] flex items-center gap-1 bg-red-100 text-red-800 border-red-300 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-950">
                  <Trash2 className="h-2.5 w-2.5" />
                  Delete
                </Badge>
              )}
              {isEdit && (
                <Badge className="shrink-0 text-[10px] flex items-center gap-1 bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-950">
                  <Pencil className="h-2.5 w-2.5" />
                  Edit
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {isDelete ? `This ${meta.label.toLowerCase()} will be removed from the project.` : entity.description}
            </p>
          </div>

          <Button
            size="sm"
            variant={entity.saved ? "outline" : isDelete ? "destructive" : isEdit ? "outline" : "default"}
            onClick={onSave}
            disabled={entity.saved || entity.saving || ((isDelete || isEdit) && !entity.existingId)}
            className={`shrink-0 ${isEdit && !entity.saved && !isDelete ? "border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-950" : ""}`}
          >
            {entity.saving ? (
              <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />{isDelete ? "Deleting" : isEdit ? "Updating" : "Saving"}</>
            ) : entity.saved ? (
              <><Check className="mr-1.5 h-3 w-3" />{isDelete ? "Deleted" : isEdit ? "Updated" : "Saved"}</>
            ) : isDelete ? (
              <><Trash2 className="mr-1.5 h-3 w-3" />Delete</>
            ) : isEdit ? (
              <><Pencil className="mr-1.5 h-3 w-3" />Update</>
            ) : (
              <><Save className="mr-1.5 h-3 w-3" />Add to Project</>
            )}
          </Button>
        </div>

        {/* Inline metadata badges */}
        {!isDelete && <EntityMetaBadges entity={entity} />}
      </div>

      {/* Expandable preview */}
      {!isDelete && previewContent && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 border-t transition-colors"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {expanded ? "Hide" : "Show"} details
          </button>
          {expanded && (
            <div className="border-t bg-muted/30 p-3">
              <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-[200px] overflow-y-auto text-muted-foreground">
                {previewContent}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EntityMetaBadges({ entity }: { entity: GeneratedEntity }) {
  switch (entity._entityType) {
    case "tool":
      return entity.inputSchema && entity.inputSchema.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {entity.inputSchema.map((p, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] font-mono">
              {p.name}: {p.type}{p.required && <span className="text-destructive ml-0.5">*</span>}
            </Badge>
          ))}
        </div>
      ) : null;

    case "resource":
      return (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {entity.uri && <Badge variant="secondary" className="text-[10px] font-mono">{entity.uri}</Badge>}
          {entity.mimeType && <Badge variant="secondary" className="text-[10px]">{entity.mimeType}</Badge>}
        </div>
      );

    case "prompt":
      return entity.arguments && entity.arguments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {entity.arguments.map((a, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] font-mono">
              {a.name}{a.required && <span className="text-destructive ml-0.5">*</span>}
            </Badge>
          ))}
        </div>
      ) : null;

    case "env":
      return entity.value ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Badge variant="secondary" className="text-[10px] font-mono">
            {entity.value.length > 30 ? entity.value.slice(0, 30) + "..." : entity.value || "(empty)"}
          </Badge>
        </div>
      ) : null;

    default:
      return null;
  }
}

function getPreviewContent(entity: GeneratedEntity): string | null {
  switch (entity._entityType) {
    case "tool":
      if (entity.handlerType === "code" && entity.handlerCode) return entity.handlerCode;
      if (entity.handlerConfig && Object.keys(entity.handlerConfig).length > 0) {
        return JSON.stringify(entity.handlerConfig, null, 2);
      }
      return null;
    case "resource":
      return entity.handlerCode || null;
    case "prompt":
      return entity.template || null;
    case "env":
      return null;
    default:
      return null;
  }
}
