"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Server, Sparkles, Settings2,
  Wrench, FileText, MessageSquare, KeyRound,
  Play, Download, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { McpProject } from "@/types/mcp";
import { OverviewTab } from "@/components/builder/OverviewTab";
import { ToolsTab } from "@/components/builder/ToolsTab";
import { ResourcesTab } from "@/components/builder/ResourcesTab";
import { PromptsTab } from "@/components/builder/PromptsTab";
import { EnvVarsTab } from "@/components/builder/EnvVarsTab";
import { TestTab } from "@/components/builder/TestTab";
import { ExportTab } from "@/components/builder/ExportTab";
import { AgentTab } from "@/components/builder/AgentTab";
import { projectApiHeaders } from "@/lib/anon-id";

type BuilderMode = "agent" | "manual";

function BuilderInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<McpProject | null>(null);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<BuilderMode>(
    searchParams.get("mode") === "agent" ? "agent" : "manual"
  );
  const [manualTab, setManualTab] = useState("overview");

  const goToManualTab = (tab: string) => {
    setManualTab(tab);
    setMode("manual");
  };

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`, { headers: projectApiHeaders() });
    if (!res.ok) {
      router.push("/");
      return;
    }
    const data = await res.json();
    data.tools = data.tools.map((t: Record<string, unknown>) => ({
      ...t,
      inputSchema: typeof t.inputSchema === "string" ? JSON.parse(t.inputSchema as string) : t.inputSchema,
      handlerConfig: typeof t.handlerConfig === "string" ? JSON.parse(t.handlerConfig as string) : t.handlerConfig,
    }));
    data.prompts = data.prompts.map((p: Record<string, unknown>) => ({
      ...p,
      arguments: typeof p.arguments === "string" ? JSON.parse(p.arguments as string) : p.arguments,
    }));
    setProject(data);
    setLoading(false);
  }, [projectId, router]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  if (loading || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  const toolCount = project.tools?.length ?? 0;
  const resourceCount = project.resources?.length ?? 0;
  const promptCount = project.prompts?.length ?? 0;
  const envCount = project.envVars?.length ?? 0;
  const totalEntities = toolCount + resourceCount + promptCount + envCount;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b shrink-0">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Server className="h-5 w-5 text-primary" />
          <div className="mr-auto">
            <h1 className="text-lg font-semibold leading-tight">{project.name}</h1>
            <p className="text-xs text-muted-foreground">v{project.version}</p>
          </div>

          <ThemeToggle />

          <div className="flex items-center rounded-lg border bg-muted p-1 gap-1">
            <button
              onClick={() => setMode("agent")}
              className={`
                relative flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-all
                ${mode === "agent"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                }
              `}
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Agent
            </button>
            <button
              onClick={() => setMode("manual")}
              className={`
                flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-all
                ${mode === "manual"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                }
              `}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Manual
            </button>
          </div>
        </div>
      </header>

      {mode === "agent" ? (
        <main className="container mx-auto px-4 py-4 flex-1 flex flex-col min-h-0 gap-4">
          {/* ---- Project status strip ---- */}
          <div className="shrink-0 flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5">
            <span className="text-xs font-medium text-muted-foreground mr-1">Your server</span>

            <button onClick={() => goToManualTab("tools")} className="group flex items-center gap-1.5 transition-colors hover:text-blue-600">
              <Wrench className="h-3.5 w-3.5 text-muted-foreground group-hover:text-blue-600" />
              <Badge variant={toolCount > 0 ? "default" : "secondary"} className="text-[11px] font-mono tabular-nums">
                {toolCount}
              </Badge>
              <span className="text-xs text-muted-foreground group-hover:text-blue-600 hidden sm:inline">tools</span>
            </button>

            <button onClick={() => goToManualTab("resources")} className="group flex items-center gap-1.5 transition-colors hover:text-emerald-600">
              <FileText className="h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-600" />
              <Badge variant={resourceCount > 0 ? "default" : "secondary"} className="text-[11px] font-mono tabular-nums">
                {resourceCount}
              </Badge>
              <span className="text-xs text-muted-foreground group-hover:text-emerald-600 hidden sm:inline">resources</span>
            </button>

            <button onClick={() => goToManualTab("prompts")} className="group flex items-center gap-1.5 transition-colors hover:text-violet-600">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground group-hover:text-violet-600" />
              <Badge variant={promptCount > 0 ? "default" : "secondary"} className="text-[11px] font-mono tabular-nums">
                {promptCount}
              </Badge>
              <span className="text-xs text-muted-foreground group-hover:text-violet-600 hidden sm:inline">prompts</span>
            </button>

            <button onClick={() => goToManualTab("env")} className="group flex items-center gap-1.5 transition-colors hover:text-orange-600">
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground group-hover:text-orange-600" />
              <Badge variant={envCount > 0 ? "default" : "secondary"} className="text-[11px] font-mono tabular-nums">
                {envCount}
              </Badge>
              <span className="text-xs text-muted-foreground group-hover:text-orange-600 hidden sm:inline">env</span>
            </button>

            <div className="ml-auto flex items-center gap-2">
              {totalEntities > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => goToManualTab("test")}
                  >
                    <Play className="h-3 w-3" />
                    Test
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => goToManualTab("export")}
                  >
                    <Download className="h-3 w-3" />
                    Export
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-muted-foreground"
                onClick={() => goToManualTab("overview")}
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <AgentTab project={project} onUpdate={fetchProject} />
        </main>
      ) : (
        <main className="container mx-auto px-4 py-6">
          <Tabs value={manualTab} onValueChange={setManualTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="resources">Resources</TabsTrigger>
              <TabsTrigger value="prompts">Prompts</TabsTrigger>
              <TabsTrigger value="env">Env Vars</TabsTrigger>
              <TabsTrigger value="test">Test</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab project={project} onUpdate={fetchProject} />
            </TabsContent>
            <TabsContent value="tools">
              <ToolsTab project={project} onUpdate={fetchProject} />
            </TabsContent>
            <TabsContent value="resources">
              <ResourcesTab project={project} onUpdate={fetchProject} />
            </TabsContent>
            <TabsContent value="prompts">
              <PromptsTab project={project} onUpdate={fetchProject} />
            </TabsContent>
            <TabsContent value="env">
              <EnvVarsTab project={project} onUpdate={fetchProject} />
            </TabsContent>
            <TabsContent value="test">
              <TestTab project={project} />
            </TabsContent>
            <TabsContent value="export">
              <ExportTab project={project} />
            </TabsContent>
          </Tabs>
        </main>
      )}
    </div>
  );
}

export default function BuilderPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    }>
      <BuilderInner />
    </Suspense>
  );
}
