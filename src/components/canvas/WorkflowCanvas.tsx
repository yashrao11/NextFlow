import 'reactflow/dist/style.css';
import React, { useState, useRef } from 'react';
import ReactFlow, {
  Background,
  MiniMap,
  BackgroundVariant,
  EdgeProps,
  getBezierPath,
  useReactFlow,
} from 'reactflow';
import {
  XCircle,
  AlertTriangle,
  CheckCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Hand,
  Undo2,
  Redo2,
  Command,
  Minus,
  Plus,
  Maximize2,
  Expand,
  Grid3X3,
  FileJson,
  Download,
  Upload,
  RotateCcw,
  Save,
  Check,
  Loader2,
  ZoomIn,
  ZoomOut,
  Move,
} from 'lucide-react';

import { useWorkflowStore } from '@/store/useWorkflowStore';
import {
  RequestInputsNode,
  CropImageNode,
  GeminiNode,
  ResponseNode,
} from './CustomNodes';
import NodePicker from './NodePicker';

interface WorkflowCanvasProps {
  onExportJSON: () => void;
  onImportJSON: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onReset: () => void;
  isSaving: boolean;
  isSaved: boolean;
}

// --- CUSTOM EDGE PATH COMPONENT ---
/**
 * Renders custom bezier link lines between node handles.
 * Blue: Image data handle connections.
 * Orange: Text or Prompt data handle connections.
 * Purple: Default connections.
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
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const isRunning = data?.isRunning;
  const isImage = sourceHandleId?.toLowerCase().includes('image');
  const isText =
    sourceHandleId?.toLowerCase().includes('text') ||
    sourceHandleId?.toLowerCase().includes('prompt') ||
    sourceHandleId?.toLowerCase().includes('response');
  const strokeColor = isImage ? '#3b82f6' : isText ? '#f59e0b' : '#7c3aed';
  const edgeClassName = `react-flow__edge-path transition-all duration-300 ${
    isImage ? 'edge-image-animated' : isText ? 'edge-text-animated' : ''
  } ${isRunning ? 'edge-path-running' : ''}`;

  return (
    <path
      id={id}
      d={edgePath}
      markerEnd={markerEnd}
      style={{ ...style, strokeWidth: 2, stroke: strokeColor }}
      className={edgeClassName}
    />
  );
}

const nodeTypes = {
  requestInputs: RequestInputsNode,
  cropImage: CropImageNode,
  gemini: GeminiNode,
  response: ResponseNode,
};

const edgeTypes = { custom: CustomEdge };

/**
 * WorkflowCanvasInner
 * Inner component that has access to useReactFlow() hook (must be inside ReactFlowProvider).
 * Renders the primary React Flow sandbox, custom bottom toolbar, and floating controls.
 */
function WorkflowCanvasInner({ onExportJSON, onImportJSON, onSave, onReset, isSaving, isSaved }: WorkflowCanvasProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange);
  const onConnect = useWorkflowStore((state) => state.onConnect);
  const isConnectionValid = useWorkflowStore((state) => state.isConnectionValid);
  const notification = useWorkflowStore((state) => state.notification);
  const clearNotification = useWorkflowStore((state) => state.clearNotification);
  const saveStateToHistory = useWorkflowStore((state) => state.saveStateToHistory);
  const undo = useWorkflowStore((state) => state.undo);
  const redo = useWorkflowStore((state) => state.redo);
  const undoStack = useWorkflowStore((state) => state.undoStack);
  const redoStack = useWorkflowStore((state) => state.redoStack);

  const [currentZoom, setCurrentZoom] = useState(1);
  const [nodePickerOpen, setNodePickerOpen] = useState(false);
  const [showJsonPanel, setShowJsonPanel] = useState(false);
  const [isZoomMinimised, setIsZoomMinimised] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const nodesWithCallbacks = React.useMemo(() => {
    return nodes.map((node) => {
      if (node.type === 'cropImage' || node.type === 'gemini') {
        return {
          ...node,
          data: {
            ...node.data,
            onRunNode: (nodeId: string) => {
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
        onNodeDragStart={saveStateToHistory}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        isValidConnection={isConnectionValid}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={2}
        className="text-zinc-800"
        onMove={(_event, viewport) => setCurrentZoom(viewport.zoom)}
        proOptions={{ hideAttribution: false }}
      >
        {/* Dot grid background matching reference */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="#c8c8cc"
        />

        {/* Floating MiniMap — bottom right, above toolbar */}
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
          nodeBorderRadius={6}
          maskColor="rgba(244, 244, 245, 0.75)"
          className="!bg-white !border !border-zinc-200 !rounded-xl !shadow-lg"
          style={{ bottom: 48, right: 8 }}
        />
      </ReactFlow>

      {/* ======== NODE PICKER POPUP ======== */}
      <NodePicker
        isOpen={nodePickerOpen}
        onClose={() => setNodePickerOpen(false)}
      />

      {/* ======== BOTTOM-LEFT FLOATING PILL (Zoom & Nav) ======== */}
      <div className="absolute bottom-4 left-4 z-40 bg-white/95 backdrop-blur border border-zinc-200/80 rounded-full shadow-lg px-2.5 py-1.5 flex items-center select-none transition-all duration-300">
        {isZoomMinimised ? (
          <button
            onClick={() => setIsZoomMinimised(false)}
            className="p-1 hover:bg-zinc-150 rounded-full text-zinc-500 hover:text-zinc-800 transition-colors"
            title="Expand Controls"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            {/* Collapse button */}
            <button
              onClick={() => setIsZoomMinimised(true)}
              className="p-1 hover:bg-zinc-150 rounded-full text-zinc-400 hover:text-zinc-700 transition-colors"
              title="Minimize Controls"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-zinc-200 mx-0.5" />

            {/* Undo */}
            <button
              onClick={undo}
              disabled={undoStack.length === 0}
              className="p-1 hover:bg-zinc-150 rounded-full text-zinc-500 hover:text-zinc-700 disabled:opacity-30 transition-colors"
              title="Undo (Cmd+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>

            {/* Redo */}
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              className="p-1 hover:bg-zinc-150 rounded-full text-zinc-500 hover:text-zinc-700 disabled:opacity-30 transition-colors"
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>

            {/* Command Shortcuts */}
            <button
              className="p-1 hover:bg-zinc-150 rounded-full text-zinc-500 hover:text-zinc-700 transition-colors"
              title="Keyboard shortcuts"
            >
              <Command className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-zinc-200 mx-0.5" />

            {/* Zoom out (magnifying glass minus) */}
            <button
              onClick={() => zoomOut({ duration: 200 })}
              className="p-1 hover:bg-zinc-150 rounded-full text-zinc-500 hover:text-zinc-700 transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            {/* Zoom percentage */}
            <span className="text-xs font-semibold text-zinc-650 w-9 text-center tabular-nums">
              {Math.round(currentZoom * 100)}%
            </span>

            {/* Zoom in (magnifying glass plus) */}
            <button
              onClick={() => zoomIn({ duration: 200 })}
              className="p-1 hover:bg-zinc-150 rounded-full text-zinc-500 hover:text-zinc-700 transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-zinc-200 mx-0.5" />

            {/* Fit view */}
            <button
              onClick={() => fitView({ duration: 400, padding: 0.15 })}
              className="p-1 hover:bg-zinc-150 rounded-full text-zinc-500 hover:text-zinc-700 transition-colors"
              title="Fit view"
            >
              <Expand className="w-4 h-4" />
            </button>

            {/* Grid toggle */}
            <button
              className="p-1 hover:bg-zinc-150 rounded-full text-zinc-500 hover:text-zinc-700 transition-colors"
              title="Toggle grid"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ======== BOTTOM-CENTER FLOATING PILL (Actions / picker) ======== */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur border border-zinc-200/80 rounded-full shadow-lg px-3 py-1.5 flex items-center gap-3 select-none">
        {/* Document/File icon (toggles Dropdown Menu) */}
        <div className="relative">
          <button
            onClick={() => setShowJsonPanel((v) => !v)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              showJsonPanel
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:bg-zinc-150 hover:text-zinc-800'
            }`}
            title="File Menu"
          >
            <FileJson className="w-4 h-4" />
          </button>

          {/* Floating File Actions Dropdown Menu */}
          {showJsonPanel && (
            <div className="absolute bottom-11 left-1/2 -translate-x-1/2 z-50 bg-white border border-zinc-200 rounded-xl shadow-2xl w-48 p-2 flex flex-col gap-1 text-xs select-none">
              <button
                onClick={() => {
                  onSave();
                  setShowJsonPanel(false);
                }}
                disabled={isSaving}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 rounded-lg text-left text-zinc-700 font-semibold transition-colors disabled:opacity-40"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isSaved ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 animate-fade-in" />
                ) : (
                  <Save className="w-3.5 h-3.5 text-zinc-500" />
                )}
                <span>Save Flow</span>
              </button>

              <button
                onClick={() => {
                  onReset();
                  setShowJsonPanel(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 hover:text-red-600 rounded-lg text-left text-zinc-700 font-semibold transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-zinc-500" />
                <span>Reset Flow</span>
              </button>

              <div className="h-px bg-zinc-150 my-1" />

              <button
                onClick={() => {
                  onExportJSON();
                  setShowJsonPanel(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 rounded-lg text-left text-zinc-700 font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-zinc-500" />
                <span>Export JSON</span>
              </button>

              <label className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 rounded-lg text-left text-zinc-700 font-semibold transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-zinc-500" />
                <span>Import JSON</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    onImportJSON(e);
                    setShowJsonPanel(false);
                  }}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {/* Plus (+) Node Picker button */}
        <button
          onClick={() => setNodePickerOpen((v) => !v)}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
            nodePickerOpen
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-500 hover:bg-zinc-150 hover:text-zinc-800'
          }`}
          title="Add Node"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* ======== TOAST NOTIFICATION ======== */}
      {notification && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-3 rounded-xl border bg-zinc-900/95 backdrop-blur-md text-white border-zinc-800 shadow-2xl animate-toast-in pointer-events-auto max-w-lg">
          {notification.type === 'error' && <XCircle className="w-4 h-4 text-rose-500 shrink-0" />}
          {notification.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
          {notification.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />}
          <span className="text-xs font-semibold tracking-wide leading-relaxed pr-1">{notification.message}</span>
          <button
            onClick={clearNotification}
            className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-white shrink-0 ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * WorkflowCanvas Component (exported wrapper)
 * Passes props into the inner component which has access to useReactFlow().
 */
export default function WorkflowCanvas(props: WorkflowCanvasProps) {
  return <WorkflowCanvasInner {...props} />;
}
