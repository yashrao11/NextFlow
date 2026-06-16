import 'reactflow/dist/style.css';
import React from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  EdgeProps,
  getBezierPath,
} from 'reactflow';
import { XCircle, AlertTriangle, CheckCircle, X } from 'lucide-react';

import { useWorkflowStore } from '@/store/useWorkflowStore';
import {
  RequestInputsNode,
  CropImageNode,
  GeminiNode,
  ResponseNode,
} from './CustomNodes';
import NodePicker from './NodePicker';

// --- CUSTOM EDGE PATH COMPONENT ---
/**
 * Renders custom bezier link lines between node handles.
 * Generates custom stroke colors and animations depending on handle type:
 * - Blue: Image data handle connections.
 * - Orange: Text or Prompt data handle connections.
 * - Purple: Default connections.
 * 
 * Animates flow markers when `data.isRunning` is active.
 */
function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  sourceHandleId,
}: EdgeProps) {
  // 1. Calculate bezier curve path parameters
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isRunning = data?.isRunning;

  const isImage = sourceHandleId?.toLowerCase().includes('image');
  const isText =
    sourceHandleId?.toLowerCase().includes('text') ||
    sourceHandleId?.toLowerCase().includes('prompt') ||
    sourceHandleId?.toLowerCase().includes('response');

  // Blue for image handles, orange for text handles, purple for default
  const strokeColor = isImage ? '#3b82f6' : isText ? '#f59e0b' : '#7c3aed';
  const edgeClassName = `react-flow__edge-path transition-all duration-300 ${
    isImage ? 'edge-image-animated' : isText ? 'edge-text-animated' : ''
  } ${isRunning ? 'edge-path-running' : ''}`;

  return (
    <path
      id={id}
      d={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        strokeWidth: 2.5,
        stroke: strokeColor,
      }}
      className={edgeClassName}
    />
  );
}

// Custom React Flow node components mapping
const nodeTypes = {
  requestInputs: RequestInputsNode,
  cropImage: CropImageNode,
  gemini: GeminiNode,
  response: ResponseNode,
};

// Custom React Flow edge links mapping
const edgeTypes = {
  custom: CustomEdge,
};

/**
 * WorkflowCanvas Component
 * Renders the primary React Flow sandbox layout with background, minimap,
 * toolbar controls, and floating error/success toast elements.
 */
export default function WorkflowCanvas() {
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange);
  const onConnect = useWorkflowStore((state) => state.onConnect);
  const isConnectionValid = useWorkflowStore((state) => state.isConnectionValid);
  const notification = useWorkflowStore((state) => state.notification);
  const clearNotification = useWorkflowStore((state) => state.clearNotification);
  const saveStateToHistory = useWorkflowStore((state) => state.saveStateToHistory);

  // Map onRunNode callback dynamically to avoid storing callbacks in the database
  const nodesWithCallbacks = React.useMemo(() => {
    return nodes.map((node) => {
      if (node.type === 'cropImage' || node.type === 'gemini') {
        return {
          ...node,
          data: {
            ...node.data,
            onRunNode: (nodeId: string) => {
              // Fire standard CustomEvent to be processed by index page listener
              window.dispatchEvent(new CustomEvent('run-node', { detail: { nodeId } }));
            },
          },
        };
      }
      return node;
    });
  }, [nodes]);

  return (
    <div className="w-full h-full absolute inset-0">
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={saveStateToHistory} // Track visual modifications in history stack
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        isValidConnection={isConnectionValid}
        fitView
        minZoom={0.2}
        maxZoom={2}
        className="text-zinc-800"
      >
        {/* Dotted grid background layout matching Galaxy.ai reference */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="#e4e4e7"
        />
        {/* Navigation control zoom buttons */}
        <Controls className="!bg-white border border-zinc-200 rounded-lg shadow-md" />
        
        {/* Floating MiniMap layout preview panel */}
        <MiniMap
          nodeStrokeColor={(n) => {
            if (n.type === 'requestInputs') return '#a78bfa';
            if (n.type === 'cropImage') return '#3b82f6';
            if (n.type === 'gemini') return '#8b5cf6';
            if (n.type === 'response') return '#10b981';
            return '#e4e4e7';
          }}
          nodeColor={(n) => {
            if (n.type === 'requestInputs') return '#7c3aed';
            if (n.type === 'cropImage') return '#2563eb';
            if (n.type === 'gemini') return '#6d28d9';
            if (n.type === 'response') return '#059669';
            return '#f4f4f5';
          }}
          nodeBorderRadius={8}
          maskColor="rgba(250, 250, 250, 0.7)"
          className="!bg-white border border-zinc-200 rounded-lg shadow-lg"
        />
      </ReactFlow>

      {/* Floating searchable node picker bottom widget */}
      <NodePicker />

      {/* Toast Alert panel triggered by canvas validation hooks */}
      {notification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-3 rounded-xl border bg-zinc-900/95 backdrop-blur-md text-white border-zinc-800 shadow-2xl animate-toast-in pointer-events-auto max-w-lg">
          {notification.type === 'error' && (
            <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
          )}
          {notification.type === 'warning' && (
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          )}
          {notification.type === 'success' && (
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          )}
          <span className="text-xs font-semibold tracking-wide leading-relaxed pr-1">
            {notification.message}
          </span>
          <button
            onClick={clearNotification}
            className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-white shrink-0 ml-1 animate-fade-in"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

