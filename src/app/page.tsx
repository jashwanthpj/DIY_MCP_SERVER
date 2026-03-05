"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Server, Wrench, FileText, MessageSquare, Sparkles, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { projectApiHeaders } from "@/lib/anon-id";

interface ProjectListItem {
  id: string;
  name: string;
  description: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  _count: { tools: number; resources: number; prompts: number };
}

type BuildMode = "agent" | "manual" | null;

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects", { headers: projectApiHeaders() });
    const data = await res.json();
    setProjects(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const resetDialog = () => {
    setBuildMode(null);
    setNewName("");
    setNewDesc("");
    setCreating(false);
  };

  const createProject = async () => {
    setCreating(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...projectApiHeaders() },
      body: JSON.stringify({ name: newName || "Untitled MCP Server", description: newDesc }),
    });
    const project = await res.json();
    resetDialog();
    setDialogOpen(false);

    if (buildMode === "agent") {
      router.push(`/builder/${project.id}?mode=agent`);
    } else {
      router.push(`/builder/${project.id}`);
    }
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE", headers: projectApiHeaders() });
    fetchProjects();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Server className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">DIY MCP Server Builder</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Server
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create MCP Server</DialogTitle>
                <DialogDescription>
                  {!buildMode
                    ? "Choose how you'd like to build your MCP server."
                    : "Give your new MCP server a name and description."}
                </DialogDescription>
              </DialogHeader>

              {!buildMode ? (
                <div className="grid grid-cols-2 gap-4 py-4">
                  <button
                    onClick={() => setBuildMode("agent")}
                    className="group flex flex-col items-center gap-3 rounded-xl border-2 border-border p-6 text-center transition-all hover:border-primary hover:bg-primary/5 cursor-pointer"
                  >
                    <div className="rounded-full bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">AI Agent</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Describe what you need in plain English and let our AI build the tools for you
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">Recommended for beginners</Badge>
                  </button>

                  <button
                    onClick={() => setBuildMode("manual")}
                    className="group flex flex-col items-center gap-3 rounded-xl border-2 border-border p-6 text-center transition-all hover:border-primary hover:bg-primary/5 cursor-pointer"
                  >
                    <div className="rounded-full bg-muted p-3 group-hover:bg-muted/80 transition-colors">
                      <Settings2 className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold">Manual Builder</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use the form-based builder to create tools, resources, and prompts step by step
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Full control</Badge>
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => setBuildMode(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                      &larr; Change mode
                    </button>
                    <Badge variant={buildMode === "agent" ? "default" : "outline"} className="text-[10px]">
                      {buildMode === "agent" ? (
                        <><Sparkles className="mr-1 h-3 w-3" />AI Agent</>
                      ) : (
                        <><Settings2 className="mr-1 h-3 w-3" />Manual</>
                      )}
                    </Badge>
                  </div>
                  <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Server Name</Label>
                      <Input
                        id="name"
                        placeholder="my-mcp-server"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && createProject()}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="desc">Description</Label>
                      <Textarea
                        id="desc"
                        placeholder="A brief description of what your server does..."
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setDialogOpen(false); resetDialog(); }}>
                      Cancel
                    </Button>
                    <Button onClick={createProject} disabled={creating}>
                      {creating ? "Creating..." : buildMode === "agent" ? (
                        <><Sparkles className="mr-2 h-4 w-4" />Create & Open Agent</>
                      ) : (
                        "Create"
                      )}
                    </Button>
                  </DialogFooter>
                </>
              )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading projects...</div>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Server className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h2 className="text-2xl font-semibold mb-2">No MCP Servers Yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Create your first MCP server to get started. Define tools, resources, and prompts
              that AI models can use.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Server
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer transition-shadow hover:shadow-lg"
                onClick={() => router.push(`/builder/${project.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {project.description || "No description"}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-xs">v{project.version}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Wrench className="h-3.5 w-3.5" />
                      {project._count.tools} tools
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {project._count.resources} resources
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {project._count.prompts} prompts
                    </span>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between text-xs text-muted-foreground">
                  <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => deleteProject(project.id, e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
