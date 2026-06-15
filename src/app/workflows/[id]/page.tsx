'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, Save, Edit3, Loader2, Check, History, X } from 'lucide-react';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import WorkflowCanvas from '@/components/canvas/WorkflowCanvas';
import { ReactFlowProvider } from 'reactflow';

interface RunHistoryItem {
  id: string;
  status: 'SUCCESS' | 'FAILED' | 'RUNNING';
  duration: string;
  timestamp: string;
  scope: string;
}

export default function WorkflowBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const setNodes = useWorkflowStore((state) => state.setNodes);
  const setEdges = useWorkflowStore((state) => state.setEdges);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const [name, setName] = useState('Untitled Workflow');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const [showSidebar, setShowSidebar] = useState(true);
  const [runHistory, setRunHistory] = useState<RunHistoryItem[]>([]);

  // --- INITIALIZE & LOAD CANVAS DATA ---
  useEffect(() => {
    async function loadWorkflow() {
      setIsLoading(true);
      if (id === 'new') {
        const defaultNodes = [
          {
            id: 'request-inputs',
            type: 'requestInputs',
            position: { x: 100, y: 200 },
            data: { fields: [], isRunning: false },
            deletable: false,
          },
          {
            id: 'response',
            type: 'response',
            position: { x: 700, y: 200 },
            data: { result: '', isRunning: false },
            deletable: false,
          },
        ];
        setNodes(defaultNodes);
        setEdges([]);
        setName('Untitled Workflow');
        setIsLoading(false);
      } else {
        try {
          const res = await fetch(`/api/workflows/${id}`);
          if (!res.ok) {
            router.replace('/workflows/new');
            return;
          }
          const data = await res.json();
          setName(data.name || 'Untitled Workflow');

          const loadedNodes = typeof data.nodes === 'string' ? JSON.parse(data.nodes) : data.nodes;
          const loadedEdges = typeof data.edges === 'string' ? JSON.parse(data.edges) : data.edges;

          const sanitizedNodes = loadedNodes.map((n: any) => {
            if (n.id === 'request-inputs' || n.id === 'response') {
              return { ...n, deletable: false };
            }
            return n;
          });

          setNodes(sanitizedNodes || []);
          setEdges(loadedEdges || []);

          if (data.runs && Array.isArray(data.runs)) {
            const history = data.runs.map((r: any) => ({
              id: r.id,
              status: r.status as 'SUCCESS' | 'FAILED' | 'RUNNING',
              duration: r.duration.toFixed(1) + 's',
              timestamp: new Date(r.timestamp).toLocaleTimeString(),
              scope: r.scope,
            }));
            setRunHistory(history);
          } else {
            setRunHistory([]);
          }
        } catch (error) {
          console.error('Failed to load workflow:', error);
        } finally {
          setIsLoading(false);
        }
      }
    }

    loadWorkflow();
  }, [id, setNodes, setEdges, router]);

  // --- DOUBLE CLICK RENAME HANDLERS ---
  const handleStartRename = () => {
    setTempName(name);
    setIsEditingName(true);
  };

  const handleFinishRename = () => {
    if (tempName.trim()) {
      setName(tempName.trim());
    }
    setIsEditingName(false);
  };

  // --- SAVE WORKFLOW TO DATABASE ---
  const handleSaveWorkflow = async () => {
    setIsSaving(true);
    setIsSaved(false);
    try {
      if (id === 'new') {
        const createRes = await fetch('/api/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });

        if (!createRes.ok) throw new Error('Failed to create workflow');
        const created = await createRes.json();

        const updateRes = await fetch(`/api/workflows/${created.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodes,
            edges,
          }),
        });

        if (updateRes.ok) {
          setIsSaved(true);
          router.replace(`/workflows/${created.id}`);
        }
      } else {
        const res = await fetch(`/api/workflows/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            nodes,
            edges,
          }),
        });

        if (res.ok) {
          setIsSaved(true);
          setTimeout(() => setIsSaved(false), 3000);
        }
      }
    } catch (err) {
      console.error('Error saving workflow:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // --- RUN WORKFLOW WITH ACTUAL TRIGGER.DEV POLLING ---
  const handleRunWorkflow = async (targetNodeId?: string) => {
    if (isExecuting) return;
    setIsExecuting(true);

    const startTime = Date.now();
    const scope = targetNodeId ? 'PARTIAL' : 'FULL';

    // 1. Reset visual node execution states in store
    nodes.forEach((n) => {
      updateNodeData(n.id, { isRunning: false });
    });

    try {
      // Auto-save the current canvas state first so the backend gets the latest inputs
      const saveRes = await fetch(`/api/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          nodes,
          edges,
        }),
      });

      if (!saveRes.ok) {
        throw new Error('Failed to auto-save workflow state before execution');
      }

      // 2. POST to trigger run API
      const res = await fetch('/api/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: id,
          nodeId: targetNodeId,
          scope,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to start workflow execution');
      }

      const runResponse = await res.json();
      const runId = runResponse.runId;

      // 3. Start local recursive setTimeout polling
      let isPollActive = true;
      const poll = async () => {
        if (!isPollActive) return;
        try {
          const statusRes = await fetch(`/api/runs/${runId}`);
          if (!statusRes.ok) {
            if (isPollActive) setTimeout(poll, 1500);
            return;
          }

          const runState = await statusRes.json();
          if (!isPollActive) return;

          const executions = runState.nodeExecutions || [];

          // Map node execution statuses directly to React Flow store
          executions.forEach((exec: any) => {
            const node = nodes.find((n) => n.id === exec.nodeId);
            if (!node) return;

            if (exec.status === 'RUNNING') {
              updateNodeData(exec.nodeId, { isRunning: true });
            } else if (exec.status === 'SUCCESS') {
              // Node succeeded: update outputs
              updateNodeData(exec.nodeId, {
                isRunning: false,
                duration: exec.duration,
                ...(node.type === 'gemini' && { response: exec.output?.response || '' }),
                ...(node.type === 'cropImage' && { imageUrl: exec.output?.imageUrl || '' }),
                ...(node.type === 'response' && { result: exec.output?.result || '' }),
                ...(node.type === 'requestInputs' && { fields: exec.output?.fields || [] }),
              });
            } else if (exec.status === 'FAILED') {
              updateNodeData(exec.nodeId, {
                isRunning: false,
                duration: exec.duration,
                error: exec.errorMessage || 'Execution failed',
              });
            }
          });

          // Check if overall run has completed
          if (runState.status === 'SUCCESS' || runState.status === 'FAILED') {
            isPollActive = false;
            setIsExecuting(false);

            const durationStr = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
            const finalRunHistoryItem: RunHistoryItem = {
              id: runId,
              status: runState.status,
              duration: durationStr,
              timestamp: new Date().toLocaleTimeString(),
              scope,
            };
            setRunHistory((prev) => {
              if (prev.some((item) => item.id === runId)) return prev;
              return [finalRunHistoryItem, ...prev];
            });

            // Set edges isRunning to false
            useWorkflowStore.setState({
              edges: edges.map((e) => ({ ...e, data: { isRunning: false } })),
            });
          } else {
            // Highlight active flowing edges
            useWorkflowStore.setState({
              edges: edges.map((e) => {
                const sourceExec = executions.find((ex: any) => ex.nodeId === e.source);
                const targetExec = executions.find((ex: any) => ex.nodeId === e.target);
                // Edge is animating if source is success and target is running/pending
                const isEdgeActive =
                  sourceExec?.status === 'SUCCESS' &&
                  (targetExec?.status === 'RUNNING' || targetExec?.status === 'PENDING');
                return {
                  ...e,
                  data: { isRunning: isEdgeActive },
                };
              }),
            });

            // Schedule next poll
            if (isPollActive) {
              setTimeout(poll, 1500);
            }
          }
        } catch (pollErr) {
          console.error('Error polling execution status:', pollErr);
          if (isPollActive) {
            setTimeout(poll, 1500);
          }
        }
      };

      // Start the recursive poll
      setTimeout(poll, 1500);

    } catch (err) {
      console.error('Trigger workflow execution failed:', err);
      alert('Failed to start workflow execution.');
      setIsExecuting(false);
    }
  };

  // --- RESET WORKFLOW OUTPUTS & INPUTS ---
  const handleResetWorkflow = async () => {
    if (isExecuting || isSaving) return;

    // Reset visual nodes execution data locally
    const resetNodes = nodes.map((node) => {
      const updatedData = { ...node.data };

      // Clear execution parameters and statuses
      delete updatedData.duration;
      delete updatedData.error;
      updatedData.isRunning = false;

      // Clear specific output properties depending on the node type
      if (node.type === 'cropImage') {
        updatedData.imageUrl = '';
        updatedData.output = {};
      } else if (node.type === 'gemini') {
        updatedData.response = '';
        updatedData.imageUrl = '';
        updatedData.output = {};
      } else if (node.type === 'response') {
        updatedData.result = '';
        updatedData.output = {};
      }

      return {
        ...node,
        data: updatedData,
      };
    });

    setNodes(resetNodes);

    // Save the reset state in the database immediately so that reloading does not restore old state
    setIsSaving(true);
    try {
      const res = await fetch(`/api/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: resetNodes,
          edges,
        }),
      });

      if (res.ok) {
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
      } else {
        alert('Failed to save reset state to the database.');
      }
    } catch (err) {
      console.error('Error saving reset state:', err);
      alert('Failed to save reset state.');
    } finally {
      setIsSaving(false);
    }
  };

  // Listen to the node-level run play event from CustomNodes
  useEffect(() => {
    const handleRunNodeEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const nodeId = customEvent.detail?.nodeId;
      if (nodeId) {
        handleRunWorkflow(nodeId);
      }
    };

    window.addEventListener('run-node', handleRunNodeEvent);
    return () => {
      window.removeEventListener('run-node', handleRunNodeEvent);
    };
  }, [nodes, edges, isExecuting]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 text-zinc-500 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <span className="text-xs uppercase tracking-widest font-mono font-semibold">Loading Workspace...</span>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#fafafa] text-zinc-900 flex flex-col overflow-hidden">
      {/* HEADER PANEL */}
      <header className="h-14 border-b border-zinc-200 bg-white flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-zinc-550 hover:text-zinc-800 transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>

          <div className="h-4 w-px bg-zinc-200" />

          {/* RENAME INPUT CONTAINER */}
          {isEditingName ? (
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={(e) => e.key === 'Enter' && handleFinishRename()}
              className="bg-zinc-50 border border-zinc-200 rounded px-2 py-0.5 text-sm text-zinc-800 focus:outline-none focus:border-purple-500 font-semibold"
              autoFocus
            />
          ) : (
            <div
              onDoubleClick={handleStartRename}
              className="flex items-center gap-2 cursor-pointer group"
              title="Double-click to rename"
            >
              <span className="text-sm font-semibold text-zinc-850">{name}</span>
              <Edit3 className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
        </div>

        {/* CONTROLS BUTTONS */}
        <div className="flex items-center gap-3">
          {/* Reset Button */}
          <button
            onClick={handleResetWorkflow}
            disabled={isExecuting || isSaving}
            className="flex items-center gap-1.5 px-3.5 py-1.5 border border-zinc-200 hover:border-red-200 hover:bg-red-50/50 rounded-lg text-xs font-semibold text-red-650 transition-all disabled:opacity-50"
          >
            Reset Flow
          </button>

          {/* Save Button */}
          <button
            onClick={handleSaveWorkflow}
            disabled={isSaving}
            className={`flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-50 rounded-lg text-xs font-semibold text-zinc-750 transition-all ${isSaving ? 'opacity-70 pointer-events-none' : ''
              }`}
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isSaved ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Save className="w-3.5 h-3.5 text-zinc-600" />
            )}
            {isSaving ? 'Saving...' : isSaved ? 'Saved' : 'Save Flow'}
          </button>

          {/* Run Button */}
          <button
            onClick={() => handleRunWorkflow()}
            disabled={isExecuting}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-purple-500/10"
          >
            {isExecuting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            {isExecuting ? 'Running...' : 'Run Workflow'}
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Central Canvas Area */}
        <div className="flex-1 h-full w-full relative">
          <ReactFlowProvider>
            <WorkflowCanvas />
          </ReactFlowProvider>
        </div>

        {/* Right Sidebar Panel - Collapsible */}
        {showSidebar ? (
          <div className="w-80 border-l border-zinc-200 bg-white flex flex-col shrink-0 z-20 shadow-sm text-zinc-900">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
              <div className="flex items-center gap-1.5">
                <History className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Run History</span>
              </div>
              <button
                onClick={() => setShowSidebar(false)}
                className="p-1 hover:bg-zinc-100 rounded transition-colors text-zinc-400 hover:text-zinc-655"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-zinc-200">
              {runHistory.map((run) => (
                <div key={run.id} className="bg-zinc-50/50 p-3 rounded-lg border border-zinc-200/80 flex flex-col gap-1 hover:border-zinc-300 hover:bg-zinc-50 transition-all">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">
                      {run.status}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono font-semibold">{run.duration}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2 text-[10px]">
                    <span className="text-zinc-500">Scope: {run.scope}</span>
                    <span className="text-zinc-450 font-medium">{run.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowSidebar(true)}
            className="absolute top-4 right-4 z-20 w-8 h-8 bg-white border border-zinc-200 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 shadow-md transition-all animate-fade-in"
            title="Show Run History"
          >
            <History className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
