import { create } from 'zustand';
import {
  Connection,
  Edge,
  Node,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';

/**
 * Represents a snapshot of the canvas layout for undo/redo state tracking.
 */
interface CanvasState {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Main Zustand store type definition for managing global workflow canvas state.
 */
interface WorkflowState {
  nodes: Node[];
  edges: Edge[];
  undoStack: CanvasState[]; // Holds historical snapshots for the 'undo' operation
  redoStack: CanvasState[]; // Holds historical snapshots for the 'redo' operation
  notification: { message: string; type: 'error' | 'success' | 'warning' } | null; // Toast alert state
  isRunning: boolean;
  pollingIntervalId: any;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: Node) => void;
  updateNodeData: (nodeId: string, data: any) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  saveStateToHistory: () => void;
  undo: () => void;
  redo: () => void;
  isConnectionValid: (connection: Connection) => boolean;
  showNotification: (message: string, type?: 'error' | 'success' | 'warning') => void;
  clearNotification: () => void;
  setIsRunning: (isRunning: boolean) => void;
  startPolling: (runId: string) => void;
  stopPolling: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  undoStack: [],
  redoStack: [],
  notification: null,
  isRunning: false,
  pollingIntervalId: null,

  setIsRunning: (isRunning) => {
    set({ isRunning });
  },

  /** Sets the current nodes array state. */
  setNodes: (nodes) => {
    set({ nodes });
  },

  /** Sets the current edges array state. */
  setEdges: (edges) => {
    set({ edges });
  },

  /** Adds a new node to the workspace. */
  addNode: (node) => {
    set((state) => ({
      nodes: [...state.nodes, node],
    }));
  },

  /** Updates the local data object parameter of a specific node by ID. */
  updateNodeData: (nodeId, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              ...data,
            },
          };
        }
        return node;
      }),
    }));
  },

  /** Callback invoked by React Flow when a node is dragged, scaled, or removed. */
  onNodesChange: (changes) => {
    const hasRemove = changes.some((c) => c.type === 'remove');
    if (hasRemove) {
      get().saveStateToHistory(); // Backup current layout before node deletion
    }
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },

  /** Callback invoked by React Flow when an edge relationship is updated or removed. */
  onEdgesChange: (changes) => {
    const hasRemove = changes.some((c) => c.type === 'remove');
    if (hasRemove) {
      get().saveStateToHistory(); // Backup current layout before edge deletion
    }
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  /** Pushes the current canvas node/edge configuration to the undo stack. */
  saveStateToHistory: () => {
    const { nodes, edges, undoStack } = get();
    const currentState: CanvasState = JSON.parse(JSON.stringify({ nodes, edges }));
    set({
      undoStack: [...undoStack, currentState],
      redoStack: [], // Clear redo history whenever a fresh action occurs
    });
  },

  /** Restores the previous canvas configuration from the undo stack. */
  undo: () => {
    const { undoStack, redoStack, nodes, edges } = get();
    if (undoStack.length === 0) return;

    const previousState = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);
    const currentState: CanvasState = JSON.parse(JSON.stringify({ nodes, edges }));

    set({
      nodes: previousState.nodes,
      edges: previousState.edges,
      undoStack: newUndoStack,
      redoStack: [...redoStack, currentState],
    });
  },

  /** Restores a configuration from the redo stack. */
  redo: () => {
    const { undoStack, redoStack, nodes, edges } = get();
    if (redoStack.length === 0) return;

    const nextState = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);
    const currentState: CanvasState = JSON.parse(JSON.stringify({ nodes, edges }));

    set({
      nodes: nextState.nodes,
      edges: nextState.edges,
      undoStack: [...undoStack, currentState],
      redoStack: newRedoStack,
    });
  },

  /** Validates basic local edge configurations. */
  isConnectionValid: (connection: Connection) => {
    const { source, target } = connection;
    if (!source || !target) return false;
    if (source === target) return false; // Block connecting a node directly to itself
    return true;
  },

  /**
   * Action invoked when the user connects handles between two canvas nodes.
   * Handles node type checking, circular graph loops (DAG check), and duplicate checks.
   */
  onConnect: (connection) => {
    const { source, target, sourceHandle, targetHandle } = connection;
    if (!source || !target) return;

    // Reject self-connections
    if (source === target) {
      get().showNotification('Not allowed: Cannot connect a node to itself.', 'error');
      return;
    }

    /** Helper to resolve human-readable node names for alerts. */
    const getNodeLabel = (nodeId: string) => {
      const node = get().nodes.find((n) => n.id === nodeId);
      if (!node) return nodeId;
      if (node.type === 'requestInputs') return 'Request Inputs';
      if (node.type === 'cropImage') return 'Crop Image';
      if (node.type === 'gemini') return 'Gemini';
      if (node.type === 'response') return 'Response';
      return node.data?.label || node.type || nodeId;
    };

    /** Helper to translate handle IDs into descriptive labels. */
    const getHandleLabel = (handleId: string) => {
      const h = handleId.toLowerCase();
      if (h.includes('prompt')) return 'Prompt (Text)';
      if (h.includes('system')) return 'System Prompt (Text)';
      if (h.includes('image')) return 'Image';
      if (h.includes('video')) return 'Video';
      if (h.includes('audio')) return 'Audio';
      if (h.includes('file')) return 'File';
      if (h.includes('result')) return 'Result';
      if (h.includes('response')) return 'Response Output (Text)';
      return handleId;
    };

    // Ensure connection doesn't duplicate an existing edge
    const edges = get().edges;
    const exists = edges.some(
      (e) =>
        e.source === source &&
        e.target === target &&
        e.sourceHandle === sourceHandle &&
        e.targetHandle === targetHandle
    );
    if (exists) {
      return;
    }

    // --- DIRECTED ACYCLIC GRAPH (DAG) CYCLE DETECTION ---
    // Uses DFS to check if drawing the connection from target to source is possible
    const adj: Record<string, string[]> = {};
    edges.forEach((edge) => {
      if (!adj[edge.source]) {
        adj[edge.source] = [];
      }
      adj[edge.source].push(edge.target);
    });

    const visited = new Set<string>();

    const dfs = (node: string): boolean => {
      if (node === source) return true;
      visited.add(node);

      const neighbors = adj[node] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        }
      }
      return false;
    };

    if (dfs(target)) {
      get().showNotification(
        'Not allowed: Connecting these nodes would create a circular dependency (loop) in the workflow.',
        'error'
      );
      return;
    }

    // --- TYPE COMPATIBILITY VALIDATION ---
    const sHandle = sourceHandle?.toLowerCase() || '';
    const tHandle = targetHandle?.toLowerCase() || '';

    // Determine output data type of source handle
    let sourceType = 'text';
    if (sHandle.includes('image')) {
      sourceType = 'image';
    } else if (sHandle.includes('text') || sHandle.includes('prompt') || sHandle.includes('response')) {
      sourceType = 'text';
    }

    // Determine expected target parameter input type
    let targetType = 'any';
    if (tHandle.includes('image')) {
      targetType = 'image';
    } else if (tHandle.includes('text') || tHandle.includes('prompt') || tHandle.includes('system')) {
      targetType = 'text';
    } else if (tHandle.includes('video')) {
      targetType = 'video';
    } else if (tHandle.includes('audio')) {
      targetType = 'audio';
    } else if (tHandle.includes('file')) {
      targetType = 'file';
    } else if (tHandle.includes('result')) {
      targetType = 'any';
    }

    // Validate type compatibility matches between output -> input handles
    if (targetType !== 'any') {
      if (targetType === 'image' && sourceType !== 'image') {
        const sourceName = getNodeLabel(source);
        const targetName = getNodeLabel(target);
        get().showNotification(
          `Not allowed: Cannot connect ${sourceName} output (Text) to ${targetName} input (Image).`,
          'error'
        );
        return;
      }
      if (targetType === 'text' && sourceType !== 'text') {
        const sourceName = getNodeLabel(source);
        const targetName = getNodeLabel(target);
        get().showNotification(
          `Not allowed: Cannot connect ${sourceName} output (Image) to ${targetName} input (${getHandleLabel(targetHandle || '')}).`,
          'error'
        );
        return;
      }
      if (targetType !== 'image' && targetType !== 'text') {
        const sourceName = getNodeLabel(source);
        const targetName = getNodeLabel(target);
        get().showNotification(
          `Not allowed: Cannot connect ${sourceName} output (${sourceType}) to ${targetName} input (${getHandleLabel(targetHandle || '')}).`,
          'error'
        );
        return;
      }
    }

    get().saveStateToHistory();
    // Add the new connection edge styled with our custom flow properties
    set({
      edges: addEdge({ ...connection, type: 'custom', data: { isRunning: false } }, get().edges),
    });
  },

  /** Renders a popup notification toast. Auto-dismisses after 4 seconds. */
  showNotification: (message, type = 'error') => {
    set({ notification: { message, type } });
    if ((globalThis as any).__notificationTimeout) {
      clearTimeout((globalThis as any).__notificationTimeout);
    }
    (globalThis as any).__notificationTimeout = setTimeout(() => {
      set({ notification: null });
    }, 4000);
  },

  /** Clears active notification. */
  clearNotification: () => {
    if ((globalThis as any).__notificationTimeout) {
      clearTimeout((globalThis as any).__notificationTimeout);
    }
    set({ notification: null });
  },

  startPolling: (runId) => {
    const existingInterval = get().pollingIntervalId;
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    set({ isRunning: true });

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok) {
          throw new Error('Failed to fetch run status');
        }
        const run = await res.json();
        const runFinished = run.status === 'SUCCESS' || run.status === 'FAILED';

        // Update nodes and edges based on dynamic executions
        const executions = run.nodeExecutions || [];
        const liveNodes = get().nodes;
        const liveEdges = get().edges;

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

        if (runFinished) {
          const currentInterval = get().pollingIntervalId;
          if (currentInterval) {
            clearInterval(currentInterval);
          }
          set({
            isRunning: false,
            pollingIntervalId: null,
            nodes: updatedNodes,
            edges: updatedEdges,
          });
        } else {
          set({
            nodes: updatedNodes,
            edges: updatedEdges,
          });
        }
      } catch (err) {
        console.error('Zustand polling error:', err);
      }
    }, 1500);

    set({ pollingIntervalId: intervalId });
  },

  stopPolling: () => {
    const intervalId = get().pollingIntervalId;
    if (intervalId) {
      clearInterval(intervalId);
    }
    set({
      isRunning: false,
      pollingIntervalId: null,
    });
  },
}));

