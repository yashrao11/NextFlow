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

interface CanvasState {
  nodes: Node[];
  edges: Edge[];
}

interface WorkflowState {
  nodes: Node[];
  edges: Edge[];
  undoStack: CanvasState[];
  redoStack: CanvasState[];
  notification: { message: string; type: 'error' | 'success' | 'warning' } | null;
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
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  undoStack: [],
  redoStack: [],
  notification: null,

  setNodes: (nodes) => {
    set({ nodes });
  },

  setEdges: (edges) => {
    set({ edges });
  },

  addNode: (node) => {
    set((state) => ({
      nodes: [...state.nodes, node],
    }));
  },

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

  onNodesChange: (changes) => {
    const hasRemove = changes.some((c) => c.type === 'remove');
    if (hasRemove) {
      get().saveStateToHistory();
    }
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },

  onEdgesChange: (changes) => {
    const hasRemove = changes.some((c) => c.type === 'remove');
    if (hasRemove) {
      get().saveStateToHistory();
    }
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  saveStateToHistory: () => {
    const { nodes, edges, undoStack } = get();
    const currentState: CanvasState = JSON.parse(JSON.stringify({ nodes, edges }));
    set({
      undoStack: [...undoStack, currentState],
      redoStack: [],
    });
  },

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

  isConnectionValid: (connection: Connection) => {
    const { source, target } = connection;
    if (!source || !target) return false;
    if (source === target) return false;
    return true;
  },

  onConnect: (connection) => {
    const { source, target, sourceHandle, targetHandle } = connection;
    if (!source || !target) return;

    if (source === target) {
      get().showNotification('Not allowed: Cannot connect a node to itself.', 'error');
      return;
    }

    // Helper to resolve user-friendly node names
    const getNodeLabel = (nodeId: string) => {
      const node = get().nodes.find((n) => n.id === nodeId);
      if (!node) return nodeId;
      if (node.type === 'requestInputs') return 'Request Inputs';
      if (node.type === 'cropImage') return 'Crop Image';
      if (node.type === 'gemini') return 'Gemini';
      if (node.type === 'response') return 'Response';
      return node.data?.label || node.type || nodeId;
    };

    // Helper to resolve user-friendly handle names
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

    // Check duplicate connections
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

    // DAG Check (Cycle Detection using Depth-First Search)
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

    // Type-Safe Validation:
    const sHandle = sourceHandle?.toLowerCase() || '';
    const tHandle = targetHandle?.toLowerCase() || '';

    // Determine source type
    let sourceType = 'text';
    if (sHandle.includes('image')) {
      sourceType = 'image';
    } else if (sHandle.includes('text') || sHandle.includes('prompt') || sHandle.includes('response')) {
      sourceType = 'text';
    }

    // Determine target expected type
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

    // Validate type compatibility
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
    set({
      edges: addEdge({ ...connection, type: 'custom', data: { isRunning: false } }, get().edges),
    });
  },

  showNotification: (message, type = 'error') => {
    set({ notification: { message, type } });
    if ((globalThis as any).__notificationTimeout) {
      clearTimeout((globalThis as any).__notificationTimeout);
    }
    (globalThis as any).__notificationTimeout = setTimeout(() => {
      set({ notification: null });
    }, 4000);
  },

  clearNotification: () => {
    if ((globalThis as any).__notificationTimeout) {
      clearTimeout((globalThis as any).__notificationTimeout);
    }
    set({ notification: null });
  },
}));
