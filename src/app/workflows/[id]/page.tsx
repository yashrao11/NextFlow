'use client';

declare global {
  interface Window {
    activePollInterval?: NodeJS.Timeout;
  }
}

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  Square,
  Loader2,
  X,
  Clock,
  Settings2,
  Edit3,
  Check,
  CreditCard,
  Wallet,
  PanelLeft,
  Save,
} from 'lucide-react';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import WorkflowCanvas from '@/components/canvas/WorkflowCanvas';
import { ReactFlowProvider } from 'reactflow';

interface RunHistoryItem {
  id: string;
  status: 'SUCCESS' | 'FAILED' | 'RUNNING';
  duration: string;
  timestamp: string;
  scope: string;
  triggerType: string;
  nodeExecutions?: any[];
}

function NodeExecutionRow({ nodeExecution }: { nodeExecution: any }) {
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    if (nodeExecution.status !== 'RUNNING') {
      return;
    }

    const start = nodeExecution.startedAt ? new Date(nodeExecution.startedAt).getTime() : Date.now();
    setElapsed((Date.now() - start) / 1000);

    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - new Date(nodeExecution.startedAt || new Date()).getTime()) / 1000;
      setElapsed(elapsedSeconds);
    }, 100);

    return () => clearInterval(interval);
  }, [nodeExecution.status, nodeExecution.startedAt]);

  let statusColor = 'text-zinc-400';
  let statusDot = 'bg-zinc-300';
  if (nodeExecution.status === 'SUCCESS') {
    statusColor = 'text-emerald-600 font-semibold';
    statusDot = 'bg-emerald-500';
  } else if (nodeExecution.status === 'FAILED') {
    statusColor = 'text-rose-600 font-semibold';
    statusDot = 'bg-rose-500';
  } else if (nodeExecution.status === 'RUNNING') {
    statusColor = 'text-amber-600 font-bold animate-pulse';
    statusDot = 'bg-amber-500 animate-pulse';
  }

  // Map internal names to friendly API call names
  let friendlyName = nodeExecution.nodeName;
  if (nodeExecution.nodeName === 'gemini') friendlyName = 'Trigger.dev Gemini API Call';
  else if (nodeExecution.nodeName === 'cropImage') friendlyName = 'Trigger.dev Crop Task';
  else if (nodeExecution.nodeName === 'requestInputs') friendlyName = 'Prisma DB / Fetch Inputs';
  else if (nodeExecution.nodeName === 'response') friendlyName = 'Prisma DB / Write Output';

  const displayDuration = nodeExecution.status === 'RUNNING'
    ? `${elapsed.toFixed(1)}s`
    : `${(nodeExecution.duration || 0).toFixed(1)}s`;

  return (
    <div className="flex items-center justify-between text-[10px] text-zinc-500">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
        <span className={statusColor}>{friendlyName}</span>
      </div>
      <span className="font-mono text-zinc-450">{displayDuration}</span>
    </div>
  );
}

/**
 * WorkflowBuilderPage
 * Main workspace React page for designing and executing visual canvas workflows.
 * Redesigned to match Galaxy.ai layout: full-screen canvas with floating overlays.
 */
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
  const [showSidebar, setShowSidebar] = useState(false);
  // Removed activeTab to show UI runs directly in execution history
  const [runHistory, setRunHistory] = useState<RunHistoryItem[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Ref to cancel polling when stop is pressed
  const pollActiveRef = useRef(false);
  const lastProcessedRunRef = useRef<{ id: string; status: string } | null>(null);
  const activeUiRunIdRef = useRef<string | null>(null);
  const isStartingRunRef = useRef(false);
  const pollingRunIdRef = useRef<string | null>(null);
  // Tracks run IDs manually stopped by user — prevents background poller from re-activating them
  const manuallyStoppedRunIdsRef = useRef<Set<string>>(new Set());
  const isExecutingRef = useRef(false);
  const isTriggeringRef = useRef(false);

  // Compute active running run selector variables for stable polling dependencies
  const activeRun = runHistory.find((r) => r.status === 'RUNNING' && !manuallyStoppedRunIdsRef.current.has(r.id));
  const activeRunId = activeRun?.id || null;
  const activeRunStatus = activeRun?.status || null;

  const isRunning = useWorkflowStore((state) => state.isRunning);
  const startPolling = useWorkflowStore((state) => state.startPolling);
  const stopPolling = useWorkflowStore((state) => state.stopPolling);

  useEffect(() => {
    setIsExecuting(isRunning);
    isExecutingRef.current = isRunning;
  }, [isRunning]);

  const startGlobalPolling = (runId: string) => {
    if (typeof window === 'undefined') return;

    if (window.activePollInterval) {
      clearInterval(window.activePollInterval);
    }

    useWorkflowStore.getState().setIsRunning(true);
    setIsExecuting(true);
    isExecutingRef.current = true;
    pollActiveRef.current = true;

    window.activePollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok) throw new Error('Failed to fetch run status');
        const data = await res.json();

        const executions = data.nodeExecutions || [];
        const runFinished = data.status === 'SUCCESS' || data.status === 'FAILED';

        // 1. Update Zustand store nodes & edges
        const liveNodes = useWorkflowStore.getState().nodes;
        const liveEdges = useWorkflowStore.getState().edges;

        const updatedNodes = liveNodes.map((node) => {
          const exec = executions.find((e: any) => e.nodeId === node.id);
          if (!exec) return node;

          if (exec.status === 'RUNNING') {
            return { ...node, data: { ...node.data, isRunning: true } };
          } else if (exec.status === 'SUCCESS') {
            return {
              ...node,
              data: {
                ...node.data,
                isRunning: false,
                duration: exec.duration,
                ...(node.type === 'gemini' && { response: exec.output?.response || '', output: exec.output || {} }),
                ...(node.type === 'cropImage' && { output: exec.output || {} }),
                ...(node.type === 'response' && {
                  result: exec.output?.result || '',
                  output: exec.output || {},
                  inputs: {
                    ...node.data.inputs,
                    result: exec.output?.result || '',
                  }
                }),
                ...(node.type === 'requestInputs' && { fields: exec.output?.fields || [] }),
              }
            };
          } else if (exec.status === 'FAILED') {
            return {
              ...node,
              data: {
                ...node.data,
                isRunning: false,
                duration: exec.duration,
                error: exec.errorMessage || 'Execution failed'
              }
            };
          }
          return node;
        });

        const updatedEdges = liveEdges.map((e) => {
          if (runFinished) {
            return { ...e, data: { ...e.data, isRunning: false } };
          }
          const sourceExec = executions.find((ex: any) => ex.nodeId === e.source);
          const targetExec = executions.find((ex: any) => ex.nodeId === e.target);
          const isEdgeActive = sourceExec?.status === 'SUCCESS' && (targetExec?.status === 'RUNNING' || targetExec?.status === 'PENDING');
          return { ...e, data: { ...e.data, isRunning: isEdgeActive } };
        });

        useWorkflowStore.setState({
          nodes: updatedNodes,
          edges: updatedEdges,
        });

        // 2. Update run history state
        const durationStr = runFinished
          ? data.duration.toFixed(1) + 's'
          : (Math.max(0, Date.now() - new Date(data.timestamp).getTime()) / 1000).toFixed(1) + 's';

        setRunHistory((prev) =>
          prev.map((item) =>
            item.id === runId
              ? {
                  ...item,
                  status: data.status,
                  duration: durationStr,
                  nodeExecutions: executions,
                }
              : item
          )
        );

        if (runFinished) {
          if (window.activePollInterval) {
            clearInterval(window.activePollInterval);
            window.activePollInterval = undefined;
          }
          useWorkflowStore.getState().setIsRunning(false);
          setIsExecuting(false);
          isExecutingRef.current = false;
          pollActiveRef.current = false;
        }
      } catch (err) {
        console.error('Global polling error:', err);
      }
    }, 1500);
  };

  const stopGlobalPolling = () => {
    if (typeof window !== 'undefined' && window.activePollInterval) {
      clearInterval(window.activePollInterval);
      window.activePollInterval = undefined;
    }
    useWorkflowStore.getState().setIsRunning(false);
    setIsExecuting(false);
    isExecutingRef.current = false;
    pollActiveRef.current = false;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.activePollInterval) {
        clearInterval(window.activePollInterval);
        window.activePollInterval = undefined;
      }
    };
  }, []);

  // Auto-reconnect to active execution on load
  useEffect(() => {
    if (!id || id === 'new') return;
    async function checkActiveRun() {
      try {
        const response = await fetch(`/api/workflows/${id}/runs/latest`);
        if (!response.ok) return;
        const latestRun = await response.json();

        if (latestRun && latestRun.status === 'RUNNING') {
          activeUiRunIdRef.current = latestRun.id;
          useWorkflowStore.getState().setIsRunning(true);
          setIsExecuting(true);
          isExecutingRef.current = true;
          pollActiveRef.current = true;
          startGlobalPolling(latestRun.id);
        }
      } catch (err) {
        console.error('Failed to reconnect active run on load:', err);
      }
    }
    checkActiveRun();
  }, [id]);

  // --- INITIALIZE & LOAD CANVAS DATA ---
  useEffect(() => {
    async function loadWorkflow() {
      setIsLoading(true);
      if (id === 'new') {
        const defaultNodes = [
          {
            id: 'request-inputs',
            type: 'requestInputs',
            position: { x: 80, y: 240 },
            data: { fields: [], isRunning: false },
            deletable: false,
          },
          {
            id: 'response',
            type: 'response',
            position: { x: 1050, y: 240 },
            data: { result: '', isRunning: false },
            deletable: false,
          },
        ];
        setNodes(defaultNodes);
        setEdges([]);
        setName('New Workflow');
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
            const history = data.runs.map((r: any) => {
              const isRunning = r.status === 'RUNNING';
              const durationStr = isRunning
                ? (Math.max(0, Date.now() - new Date(r.timestamp).getTime()) / 1000).toFixed(1) + 's'
                : r.duration.toFixed(1) + 's';
              return {
                id: r.id,
                status: r.status as 'SUCCESS' | 'FAILED' | 'RUNNING',
                duration: durationStr,
                timestamp: r.timestamp,
                scope: r.scope,
                triggerType: r.triggerType || 'API',
                nodeExecutions: r.nodeExecutions || [],
              };
            });
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

  // --- KEYBOARD SHORTCUTS FOR UNDO / REDO ---
  useEffect(() => {
    const undo = useWorkflowStore.getState().undo;
    const redo = useWorkflowStore.getState().redo;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      if (cmdOrCtrl && e.key?.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (cmdOrCtrl && e.key?.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- POLL RUN HISTORY FOR API RUNS AND EXTERNAL TRIGGERS ---
  useEffect(() => {
    if (!id || id === 'new') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/workflows/${id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.runs && Array.isArray(data.runs)) {
            const history: RunHistoryItem[] = data.runs.map((r: any) => {
              // If this run was manually stopped, always show it as FAILED regardless of server state
              const wasManuallyStopped = manuallyStoppedRunIdsRef.current.has(r.id);
              const effectiveStatus = wasManuallyStopped && r.status === 'RUNNING' ? 'FAILED' : r.status;
              const isRunning = effectiveStatus === 'RUNNING';
              const durationStr = isRunning
                ? (Math.max(0, Date.now() - new Date(r.timestamp).getTime()) / 1000).toFixed(1) + 's'
                : r.duration.toFixed(1) + 's';
              return {
                id: r.id,
                status: effectiveStatus as 'SUCCESS' | 'FAILED' | 'RUNNING',
                duration: durationStr,
                timestamp: r.timestamp,
                scope: r.scope,
                triggerType: r.triggerType || 'API',
                nodeExecutions: r.nodeExecutions || [],
              };
            });

            setRunHistory((prev) => {
              // Construct the updated history by merging server items with existing client ticking states
              const mergedHistory = history.map((serverRun) => {
                const existingRun = prev.find((r) => r.id === serverRun.id);
                if (serverRun.status === 'RUNNING' && existingRun) {
                  // Merge node executions to preserve local ticking durations of running nodes
                  const mergedExecutions = serverRun.nodeExecutions?.map((serverExec: any) => {
                    const existingExec = existingRun.nodeExecutions?.find((e: any) => e.id === serverExec.id);
                    if (serverExec.status === 'RUNNING' && existingExec) {
                      return {
                        ...serverExec,
                        duration: existingExec.duration,
                      };
                    }
                    return serverExec;
                  });

                  return {
                    ...serverRun,
                    duration: existingRun.duration,
                    nodeExecutions: mergedExecutions || serverRun.nodeExecutions,
                  };
                }
                return serverRun;
              });

              // Make sure the active local UI run is preserved if it's not on the server list yet
              let finalHistory = mergedHistory;
              if (activeUiRunIdRef.current && !mergedHistory.some((r) => r.id === activeUiRunIdRef.current)) {
                const localActiveRun = prev.find((r) => r.id === activeUiRunIdRef.current);
                if (localActiveRun) {
                  finalHistory = [localActiveRun, ...mergedHistory];
                }
              }

              // Check if anything is different to avoid rendering thrash
              const isDifferent = finalHistory.length !== prev.length || finalHistory.some((h, i) => {
                const p = prev[i];
                if (!p) return true;
                if (p.id !== h.id || p.status !== h.status) return true;
                if (p.status !== 'RUNNING' && p.duration !== h.duration) return true;
                if (p.nodeExecutions?.length !== h.nodeExecutions?.length) return true;
                return p.nodeExecutions?.some((pe: any, idx: number) => {
                  const he = h.nodeExecutions?.[idx];
                  return !he || pe.id !== he.id || pe.status !== he.status;
                });
              });

              if (isDifferent) {
                return finalHistory;
              }
              return prev;
            });
          }
        }
      } catch (err) {
        console.error('Failed to poll background run history:', err);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [id]);

  // --- REAL-TIME RUNNING DURATION TICKING ---
  useEffect(() => {
    const interval = setInterval(() => {
      setRunHistory((prev) => {
        const hasRunning = prev.some((r) => r.status === 'RUNNING');
        if (!hasRunning) return prev;
        return prev.map((run) => {
          if (run.status === 'RUNNING') {
            const currentSec = parseFloat(run.duration) || 0;
            const updatedExecutions = run.nodeExecutions?.map((exec: any) => {
              if (exec.status === 'RUNNING') {
                return {
                  ...exec,
                  duration: (exec.duration || 0) + 0.1,
                };
              }
              return exec;
            });
            return {
              ...run,
              duration: (currentSec + 0.1).toFixed(1) + 's',
              nodeExecutions: updatedExecutions,
            };
          }
          return run;
        });
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Removed concurrent visual highlights poller in favor of window.activePollInterval

  // --- RENAME HANDLERS ---
  const handleStartRename = () => { setTempName(name); setIsEditingName(true); };
  const handleFinishRename = () => { if (tempName.trim()) setName(tempName.trim()); setIsEditingName(false); };

  // --- SAVE WORKFLOW ---
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
          body: JSON.stringify({ nodes, edges }),
        });
        if (updateRes.ok) { setIsSaved(true); router.replace(`/workflows/${created.id}`); }
      } else {
        const res = await fetch(`/api/workflows/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, nodes, edges }),
        });
        if (res.ok) { setIsSaved(true); setTimeout(() => setIsSaved(false), 3000); }
      }
    } catch (err) {
      console.error('Error saving workflow:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // --- STOP WORKFLOW ---
  const handleStopWorkflow = async () => {
    // Stop Zustand store polling
    stopGlobalPollingRef.current();

    // Immediately kill the polling loop and reset all start/run refs
    pollActiveRef.current = false;
    isStartingRunRef.current = false;  // Prevent background poller from re-enabling isExecuting
    setIsExecuting(false);
    isExecutingRef.current = false;

    let runIdToAbort = activeUiRunIdRef.current;
    if (!runIdToAbort) {
      // Find the first running run in the history
      const runningRun = runHistory.find((r) => r.status === 'RUNNING');
      if (runningRun) {
        runIdToAbort = runningRun.id;
      }
    }
    activeUiRunIdRef.current = null;

    // Clear canvas node running states immediately
    const currentNodes = useWorkflowStore.getState().nodes;
    currentNodes.forEach((n) => updateNodeData(n.id, { isRunning: false }));

    const currentEdges = useWorkflowStore.getState().edges;
    useWorkflowStore.setState({
      edges: currentEdges.map((e) => ({ ...e, data: { isRunning: false } })),
    });

    if (runIdToAbort) {
      // Register run as manually stopped BEFORE any state updates
      // This ensures the background poller never re-activates it
      manuallyStoppedRunIdsRef.current.add(runIdToAbort);

      // Optimistically update runHistory immediately so the history UI stops running instantly
      setRunHistory((prev) =>
        prev.map((item) =>
          item.id === runIdToAbort
            ? {
                ...item,
                status: 'FAILED',
                nodeExecutions: item.nodeExecutions?.map((exec: any) =>
                  exec.status === 'RUNNING' || exec.status === 'PENDING'
                    ? { ...exec, status: 'FAILED' }
                    : exec
                )
              }
            : item
        )
      );

      // Clean up the stopped run ID after a delay once server has updated
      setTimeout(() => {
        manuallyStoppedRunIdsRef.current.delete(runIdToAbort);
      }, 10000);

      try {
        await fetch(`/api/runs/${runIdToAbort}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'FAILED' }),
        });
      } catch (err) {
        console.error('Failed to abort run on server:', err);
      }
    }
  };

  // --- RUN WORKFLOW ---
  const handleRunWorkflow = async (
    e?: React.MouseEvent | string,
    targetNodeId?: string
  ) => {
    if (e && typeof e !== 'string' && 'stopPropagation' in e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (isRunning || isTriggeringRef.current || isExecutingRef.current) return;

    const actualTargetNodeId = typeof e === 'string' ? e : targetNodeId;

    isExecutingRef.current = true;
    isStartingRunRef.current = true;
    setIsExecuting(true);
    pollActiveRef.current = true;

    const scope = actualTargetNodeId ? 'PARTIAL' : 'FULL';

    // Clear execution states and mark starting node immediately
    const currentNodes = useWorkflowStore.getState().nodes;
    currentNodes.forEach((n) => {
      updateNodeData(n.id, { isRunning: false, duration: undefined, error: undefined });
    });

    const startNode = currentNodes.find(n => n.id === 'request-inputs' || n.type === 'requestInputs');
    if (startNode && !actualTargetNodeId) {
      updateNodeData(startNode.id, { isRunning: true });
    } else if (actualTargetNodeId) {
      updateNodeData(actualTargetNodeId, { isRunning: true });
    }

    try {
      isTriggeringRef.current = true;
      const currentEdges = useWorkflowStore.getState().edges;

      if (!actualTargetNodeId) {
        // FULL run: auto-save to capture the latest field values and any newly uploaded images.
        // This is blocking so the orchestrator reads the freshest workflow state.
        const saveRes = await fetch(`/api/workflows/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, nodes: currentNodes, edges: currentEdges }),
        });
        if (!saveRes.ok) throw new Error('Failed to auto-save workflow state before execution');
      }

      const res = await fetch('/api/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: id, nodeId: actualTargetNodeId, scope, triggerType: 'UI' }),
      });
      if (!res.ok) throw new Error('Failed to start workflow execution');


      const runResponse = await res.json();
      const runId = runResponse.runId;

      // If stop was pressed while the launch API call was in-flight, bail out cleanly
      if (!pollActiveRef.current) {
        isStartingRunRef.current = false;
        // Mark the newly created server run as stopped
        manuallyStoppedRunIdsRef.current.add(runId);
        setTimeout(() => manuallyStoppedRunIdsRef.current.delete(runId), 10000);
        fetch(`/api/runs/${runId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'FAILED' }),
        }).catch(() => {});
        return;
      }

      activeUiRunIdRef.current = runId;

      // Add to runHistory immediately with RUNNING status
      const initialRunItem: RunHistoryItem = {
        id: runId,
        status: 'RUNNING',
        duration: '0.0s',
        timestamp: new Date().toISOString(),
        scope,
        triggerType: 'UI',
      };
      setRunHistory((prev) => [initialRunItem, ...prev]);

      isStartingRunRef.current = false;
      // Start Zustand store polling
      startGlobalPollingRef.current(runId);
    } catch (err) {
      console.error('Trigger workflow execution failed:', err);
      alert('Failed to start workflow execution.');
      setIsExecuting(false);
      isExecutingRef.current = false;
      pollActiveRef.current = false;
      isStartingRunRef.current = false;
    } finally {
      isTriggeringRef.current = false;
    }
  };

  // --- EXPORT JSON ---
  const handleExportWorkflow = () => {
    const workflowData = { name, nodes, edges };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(workflowData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${name.toLowerCase().replace(/\s+/g, '_')}_workflow.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // --- IMPORT JSON ---
  const handleImportWorkflow = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (!imported.nodes || !imported.edges) { alert('Invalid workflow file format: Must contain nodes and edges'); return; }
        const sanitizedNodes = imported.nodes.map((n: any) => {
          if (n.id === 'request-inputs' || n.id === 'response') return { ...n, deletable: false };
          return n;
        });
        const hasRequestInputs = sanitizedNodes.some((n: any) => n.id === 'request-inputs');
        const hasResponse = sanitizedNodes.some((n: any) => n.id === 'response');
        if (!hasRequestInputs || !hasResponse) { alert("Invalid workflow: Must contain 'request-inputs' and 'response' nodes"); return; }
        if (imported.name) setName(imported.name);
        setNodes(sanitizedNodes);
        setEdges(imported.edges);
      } catch (err) {
        console.error('Failed to parse JSON file:', err);
        alert('Failed to parse workflow file. Ensure it is a valid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- RESET WORKFLOW ---
  const handleResetWorkflow = async () => {
    if (isExecuting || isSaving) return;
    const saveStateToHistory = useWorkflowStore.getState().saveStateToHistory;
    saveStateToHistory();
    const resetNodes = nodes.map((node) => {
      const updatedData = { ...node.data };
      delete updatedData.duration;
      delete updatedData.error;
      updatedData.isRunning = false;
      if (node.type === 'cropImage') { updatedData.imageUrl = ''; updatedData.output = {}; }
      else if (node.type === 'gemini') { updatedData.response = ''; updatedData.imageUrl = ''; updatedData.output = {}; updatedData.uploadedImages = []; updatedData.uploadedVideo = null; updatedData.uploadedAudio = null; updatedData.uploadedFile = null; }
      else if (node.type === 'response') { updatedData.result = ''; updatedData.output = {}; }
      return { ...node, data: updatedData };
    });
    setNodes(resetNodes);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: resetNodes, edges }),
      });
      if (res.ok) { setIsSaved(true); setTimeout(() => setIsSaved(false), 2000); }
    } catch (err) {
      console.error('Error saving reset state:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunWorkflowRef = useRef(handleRunWorkflow);
  const handleStopWorkflowRef = useRef(handleStopWorkflow);
  const startGlobalPollingRef = useRef<(runId: string) => void>(() => {});
  const stopGlobalPollingRef = useRef<() => void>(() => {});
  useEffect(() => {
    handleRunWorkflowRef.current = handleRunWorkflow;
    handleStopWorkflowRef.current = handleStopWorkflow;
    startGlobalPollingRef.current = startGlobalPolling;
    stopGlobalPollingRef.current = stopGlobalPolling;
  });

  // Listen to node-level run event
  useEffect(() => {
    const handleRunNodeEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const nodeId = customEvent.detail?.nodeId;
      if (nodeId) {
        handleRunWorkflowRef.current(nodeId);
      } else if (customEvent.detail && 'nodeId' in customEvent.detail && customEvent.detail.nodeId === null) {
        handleStopWorkflowRef.current();
      }
    };
    window.addEventListener('run-node', handleRunNodeEvent);
    return () => window.removeEventListener('run-node', handleRunNodeEvent);
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#f4f4f5] text-zinc-500 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="text-xs uppercase tracking-widest font-mono font-semibold">Loading Workspace...</span>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative" style={{ background: '#fafafa' }}>
      {/* ======== FULL-SCREEN CANVAS ======== */}
      <div className="absolute inset-0">
        <ReactFlowProvider>
          <WorkflowCanvas
            onExportJSON={handleExportWorkflow}
            onImportJSON={handleImportWorkflow}
            onSave={handleSaveWorkflow}
            onReset={handleResetWorkflow}
            isSaving={isSaving}
            isSaved={isSaved}
          />
        </ReactFlowProvider>
      </div>

      {/* ======== TOP-LEFT FLOATING: Panel toggle + Back + Title ======== */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2 pointer-events-auto">
        {/* Panel sidebar toggle */}
        <button
          onClick={() => setShowSidebar((v) => !v)}
          className="w-9 h-9 bg-white/95 backdrop-blur-sm border border-zinc-200/80 rounded-lg shadow-sm flex items-center justify-center hover:bg-zinc-50 transition-colors text-zinc-500 hover:text-zinc-700"
          title="Toggle Panel"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        {/* Back arrow + Workflow name white pill */}
        <div className="bg-white/95 backdrop-blur-sm border border-zinc-200/80 rounded-xl shadow-sm px-3 py-2 flex items-center gap-2 min-w-[160px]">
          <Link
            href="/"
            className="flex items-center text-zinc-500 hover:text-zinc-800 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          {isEditingName ? (
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={(e) => e.key === 'Enter' && handleFinishRename()}
              className="bg-transparent border-none outline-none text-sm font-medium text-zinc-800 w-full"
              autoFocus
            />
          ) : (
            <div
              onDoubleClick={handleStartRename}
              className="flex items-center gap-1.5 cursor-pointer group"
              title="Double-click to rename"
            >
              <span className="text-sm font-medium text-zinc-800 truncate max-w-[180px]">{name}</span>
              <Edit3 className="w-3 h-3 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
          )}
        </div>
      </div>

      {/* ======== TOP-RIGHT FLOATING: Viewing live run... + Est + Bal + Play/Stop + Clock ======== */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2 pointer-events-auto">
        {/* Viewing live run */}
        <div className="bg-white/95 backdrop-blur-sm border border-zinc-200/80 rounded-lg shadow-sm px-3 py-1.5 flex items-center gap-2 text-xs text-zinc-500">
          <span className={`w-2.5 h-2.5 rounded-full ${isExecuting ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-300'}`} />
          <span className="font-medium">Viewing live run...</span>
        </div>

        {/* Estimated cost */}
        <div className="bg-white/95 backdrop-blur-sm border border-zinc-200/80 rounded-lg shadow-sm px-3 py-1.5 flex items-center gap-1 text-xs text-zinc-500">
          <span>Est</span>
          <span className="font-semibold text-zinc-800">0.01 M</span>
        </div>

        {/* Balance */}
        <div className="bg-white/95 backdrop-blur-sm border border-zinc-200/80 rounded-lg shadow-sm px-3 py-1.5 flex items-center gap-1 text-xs text-zinc-500">
          <span>Bal</span>
          <span className="font-semibold text-zinc-800">30.33 M</span>
        </div>

        {/* Play / Stop button — indigo-purple play, red stop with cross icon */}
        <button
          onClick={isExecuting ? handleStopWorkflow : (e) => handleRunWorkflow(e)}
          className={`w-9 h-9 rounded-lg flex items-center justify-center shadow-sm transition-all duration-200 text-white ${isExecuting
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          title={isExecuting ? 'Stop execution' : 'Run workflow'}
        >
          {isExecuting ? (
            <X className="w-4 h-4 text-white stroke-[2.5]" />
          ) : (
            <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
          )}
        </button>

        {/* Clock / Run History toggle */}
        <button
          onClick={() => setShowSidebar((v) => !v)}
          className={`w-9 h-9 rounded-lg border shadow-sm flex items-center justify-center transition-colors ${showSidebar
              ? 'bg-zinc-150 border-zinc-300 text-zinc-800'
              : 'bg-white/95 backdrop-blur-sm border-zinc-200/80 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700'
            }`}
          title="Run History"
        >
          <Clock className="w-4 h-4" />
        </button>
      </div>

      {/* ======== NEW RUN DROPDOWN BUTTON (underneath the run button) ======== */}
      <div className="absolute top-14 right-3 z-30 flex flex-col items-end pointer-events-auto">
        <button
          onClick={() => {
            if (!isExecuting) {
              handleRunWorkflow();
            }
          }}
          disabled={isExecuting}
          className="px-3 py-1.5 bg-white border border-zinc-200/80 hover:bg-zinc-50 text-[11px] font-semibold text-zinc-700 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <Play className="w-2.5 h-2.5 fill-current text-zinc-500" />
          New run
        </button>
      </div>
      {showSidebar && (
        <div className="absolute right-0 top-14 bottom-0 w-80 bg-white border-l border-t border-zinc-200 z-50 shadow-2xl flex flex-col font-sans select-none animate-slide-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-150">
            <span className="text-sm font-bold text-zinc-800">Execution History</span>
            <button
              onClick={() => setShowSidebar(false)}
              className="px-2.5 py-1 text-xs font-semibold border border-zinc-200 text-zinc-500 hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>

          {/* Runs list (Removed Tabs, showing UI Runs directly) */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {runHistory.filter((r) => r.triggerType === 'UI').length === 0 ? (
              <div className="text-center py-16 text-xs text-zinc-400 italic">No execution history found.</div>
            ) : (
              runHistory
                .filter((r) => r.triggerType === 'UI')
                .map((run, index, filteredList) => {
                  const runNum = filteredList.length - index;
                  let dotColor = 'bg-zinc-300';
                  if (run.status === 'SUCCESS') dotColor = 'bg-emerald-500';
                  else if (run.status === 'FAILED') dotColor = 'bg-red-500';
                  else if (run.status === 'RUNNING') dotColor = 'bg-orange-500 animate-pulse';

                  const titleText = `Run #${runNum}`;
                  const subtitleText = run.id.slice(0, 8);

                  const isExpanded = expandedRunId === run.id || run.status === 'RUNNING';

                  return (
                    <div key={run.id} className="flex flex-col border-b border-zinc-100 last:border-none">
                      <div
                        onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                        className="flex items-center justify-between px-3 py-2.5 hover:bg-zinc-50 rounded-lg cursor-pointer transition-colors group border border-transparent hover:border-zinc-150"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-zinc-850">{titleText}</span>
                            <span className="text-[10px] text-zinc-400 font-semibold font-mono">{subtitleText}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end text-[10px] text-zinc-400 font-semibold font-mono">
                          <span>{run.duration}</span>
                          <span className="text-[9px] text-zinc-400 mt-0.5">{new Date(run.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-7 pb-2.5 space-y-1.5 bg-zinc-50/50 rounded-b-lg border-t border-dashed border-zinc-100 pt-1.5 select-none animate-slide-in">
                          {run.nodeExecutions && run.nodeExecutions.length > 0 ? (
                            (() => {
                              const typeOrder: Record<string, number> = {
                                'requestInputs': 1,
                                'cropImage': 2,
                                'gemini': 3,
                                'response': 4
                              };
                              return [...run.nodeExecutions]
                                .sort((a, b) => (typeOrder[a.nodeName] || 99) - (typeOrder[b.nodeName] || 99))
                                .map((exec: any) => (
                                  <NodeExecutionRow nodeExecution={exec} key={exec.id} />
                                ));
                            })()
                          ) : (
                            <div className="text-[10px] text-zinc-400 italic">No steps logged.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
