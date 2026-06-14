'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import {
  Plus,
  Trash2,
  Edit3,
  ExternalLink,
  Layers,
  Clock,
  Loader2,
  Check,
  X,
  Search,
  Sparkles,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface Run {
  id: string;
  status: string;
  duration: number;
  scope: string;
  timestamp: string;
}

interface Workflow {
  id: string;
  name: string;
  userId: string;
  nodes: string;
  edges: string;
  createdAt: string;
  lastEdited: string;
  runs?: Run[];
}

export default function WorkflowsDashboard() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Creation state
  const [isCreating, setIsCreating] = useState(false);

  // Renaming states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Deletion states
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch workflows on mount
  const fetchWorkflows = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/workflows');
      if (!res.ok) {
        throw new Error('Failed to fetch workflows');
      }
      const data = await res.json();
      setWorkflows(data || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong while loading workflows.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  // Format date helper
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (isNaN(date.getTime())) return 'Unknown time';
    if (diffMins < 1) return 'Edited just now';
    if (diffMins === 1) return 'Edited 1m ago';
    if (diffMins < 60) return `Edited ${diffMins}m ago`;
    if (diffHours === 1) return 'Edited 1h ago';
    if (diffHours < 24) return `Edited ${diffHours}h ago`;
    if (diffDays === 1) return 'Edited 1d ago';
    return `Edited ${diffDays}d ago`;
  };

  // Create new blank flow
  const handleCreateWorkflow = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled Workflow' }),
      });

      if (!res.ok) {
        throw new Error('Failed to create workflow');
      }

      const newWorkflow = await res.json();
      router.push(`/workflows/${newWorkflow.id}`);
    } catch (err) {
      console.error('Failed to create workflow:', err);
      alert('Failed to create new workflow. Please try again.');
      setIsCreating(false);
    }
  };

  // Rename workflow
  const handleStartRename = (wf: Workflow) => {
    setEditingId(wf.id);
    setRenameValue(wf.name);
  };

  const handleSaveRename = async (id: string) => {
    if (!renameValue.trim() || isRenaming) return;
    setIsRenaming(true);
    try {
      const res = await fetch(`/api/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      });

      if (!res.ok) {
        throw new Error('Failed to rename workflow');
      }

      const updated = await res.json();
      setWorkflows((prev) =>
        prev.map((wf) => (wf.id === id ? { ...wf, name: updated.name } : wf))
      );
      setEditingId(null);
    } catch (err) {
      console.error('Rename failed:', err);
      alert('Failed to rename workflow.');
    } finally {
      setIsRenaming(false);
    }
  };

  // Delete workflow
  const handleDeleteWorkflow = async (id: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/workflows/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete workflow');
      }

      // Smooth removal animation trigger state updates
      setWorkflows((prev) => prev.filter((wf) => wf.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete workflow.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter workflows based on search
  const filteredWorkflows = workflows.filter((wf) =>
    wf.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-zinc-50 min-h-screen text-zinc-900 flex flex-col font-sans">
      {/* HEADER BAR */}
      <header className="bg-white border-b border-zinc-200 h-16 flex items-center justify-between px-8 shadow-sm shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-650 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
            <Layers className="w-4.5 h-4.5" />
          </div>
          <span className="font-bold text-lg tracking-tight text-zinc-900">NextFlow</span>
          <span className="text-[10px] bg-zinc-100 text-zinc-500 font-semibold px-2 py-0.5 rounded border border-zinc-200 ml-1 font-mono uppercase tracking-wider">
            Workspace
          </span>
        </div>
        <div className="flex items-center gap-4">
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <main className="flex-1 max-w-5xl w-full mx-auto py-12 px-6">
        
        {/* WELCOME BANNER */}
        <div className="mb-10 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-1.5">
              Welcome to NextFlow <Sparkles className="w-5 h-5 text-purple-600 animate-pulse" />
            </h2>
            <p className="text-sm text-zinc-550 mt-1 max-w-lg leading-relaxed">
              Design, configure, and execute automated pipelines with high-fidelity visual cards and Trigger.dev background execution.
            </p>
          </div>
          <button
            onClick={handleCreateWorkflow}
            disabled={isCreating}
            className="shrink-0 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-400 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-purple-500/15 flex items-center gap-2 self-start sm:self-auto"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4.5 h-4.5" />
            )}
            Create New Workflow
          </button>
        </div>

        {/* WORKFLOW CONTAINER HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-lg font-bold text-zinc-800 tracking-tight">My Workflows</h3>
          
          {/* Search bar */}
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workflows..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-purple-500 transition-all placeholder:text-zinc-400 text-zinc-800"
            />
          </div>
        </div>

        {/* WORKFLOW LIST OR LOADING SKELETONS */}
        {isLoading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="bg-white border border-zinc-200 rounded-xl p-5 flex items-center justify-between animate-pulse">
                <div className="space-y-2.5 w-1/3">
                  <div className="h-4 bg-zinc-200 rounded w-3/4"></div>
                  <div className="h-3 bg-zinc-100 rounded w-1/2"></div>
                </div>
                <div className="h-6 bg-zinc-100 rounded w-16"></div>
                <div className="flex gap-2">
                  <div className="h-8 w-8 bg-zinc-100 rounded-lg"></div>
                  <div className="h-8 w-8 bg-zinc-100 rounded-lg"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700 flex flex-col items-center gap-3">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <h4 className="font-semibold">Failed to load workflows</h4>
            <p className="text-xs text-red-650 max-w-md">{error}</p>
            <button
              onClick={fetchWorkflows}
              className="mt-2 text-xs bg-red-100 hover:bg-red-200 text-red-800 px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              Retry Connection
            </button>
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center flex flex-col items-center justify-center shadow-sm">
            <div className="w-14 h-14 bg-zinc-100 text-zinc-400 rounded-full flex items-center justify-center mb-4 border border-zinc-200">
              <Layers className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-zinc-850 text-base">No workflows found</h4>
            <p className="text-sm text-zinc-400 mt-1 max-w-sm mx-auto">
              {searchQuery ? "No workflows match your search query." : "Pre-seeded campaign workflow template was not loaded, or you have deleted your list. Create a new workflow to get started!"}
            </p>
            {!searchQuery && (
              <button
                onClick={handleCreateWorkflow}
                className="mt-6 inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold px-4.5 py-2.5 rounded-xl text-sm transition-all shadow-md shadow-purple-500/10"
              >
                <Plus className="w-4 h-4" />
                Create First Workflow
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredWorkflows.map((wf) => {
              const isRunning = wf.runs?.[0]?.status === 'RUNNING';
              const isEditing = editingId === wf.id;

              return (
                <div
                  key={wf.id}
                  className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all duration-300 relative overflow-hidden group"
                >
                  {/* Visual Left Accent */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                  {/* Left: Info & Rename Input */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-2 max-w-md">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(wf.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="w-full text-sm bg-zinc-50 border border-zinc-200 rounded px-2.5 py-1 focus:outline-none focus:border-purple-500 text-zinc-800 font-semibold"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveRename(wf.id)}
                          disabled={isRenaming}
                          className="p-1.5 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors"
                          title="Save Name"
                        >
                          {isRenaming ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 text-zinc-500 rounded-lg transition-colors"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <button
                          onClick={() => router.push(`/workflows/${wf.id}`)}
                          className="text-sm font-bold text-zinc-850 hover:text-purple-650 transition-colors text-left flex items-center gap-1.5 truncate group"
                        >
                          {wf.name}
                          <ExternalLink className="w-3.5 h-3.5 text-zinc-300 group-hover:text-purple-500 transition-colors opacity-0 group-hover:opacity-100" />
                        </button>
                        <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatRelativeTime(wf.lastEdited)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Middle: Running Badge */}
                  <div className="flex items-center">
                    {isRunning ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                        Running
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-500 border border-zinc-200">
                        Idle
                      </span>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/workflows/${wf.id}`)}
                      className="p-2 bg-zinc-50 hover:bg-purple-50 text-zinc-500 hover:text-purple-650 rounded-xl border border-zinc-200 hover:border-purple-200 transition-all"
                      title="Open Workflow Canvas"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleStartRename(wf)}
                      className="p-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 rounded-xl border border-zinc-200 transition-all"
                      title="Rename Workflow"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(wf.id)}
                      className="p-2 bg-zinc-50 hover:bg-red-50 text-zinc-500 hover:text-red-600 rounded-xl border border-zinc-200 hover:border-red-200 transition-all"
                      title="Delete Workflow"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* CONFIRM DELETION MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-2xl max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center border border-red-150">
                <Trash2 className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-zinc-900">Delete Workflow</h4>
            </div>
            
            <p className="text-xs text-zinc-500 leading-relaxed">
              Are you sure you want to permanently delete this workflow? This action will remove all custom nodes, connection configurations, and execution histories, and cannot be undone.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2 text-xs font-semibold border border-zinc-200 hover:bg-zinc-50 text-zinc-500 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteConfirmId && handleDeleteWorkflow(deleteConfirmId)}
                disabled={isDeleting}
                className="flex-1 py-2 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-md shadow-red-500/10 transition-all flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Delete Flow</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
