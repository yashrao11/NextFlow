'use client';

import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import {
  Plus,
  Trash2,
  Settings,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Brain,
  Crop,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Play,
  Upload,
  Copy,
  ArrowUp,
  ArrowDown,
  Loader2,
  ExternalLink,
  Video as VideoIcon,
  Volume2 as AudioIcon,
  File as FileIcon,
  SlidersHorizontal,
  MoreHorizontal,
  X,
  Info,
  RotateCcw,
} from 'lucide-react';

const handleClass = "!w-3 !h-3 !bg-purple-500 !border-2 !border-white hover:scale-125 transition-transform shadow";

/**
 * Renders custom CSS Tailwind classes for React Flow source/target handle circles.
 * Maps clean string names to specific background colors.
 *
 * @param colorType Color name (orange, teal, green, blue, purple, pink).
 * @returns Fully compiled class name string.
 */
const getHandleClass = (colorType: 'orange' | 'teal' | 'green' | 'blue' | 'purple' | 'pink') => {
  const colorMap = {
    orange: '!bg-amber-500',
    teal: '!bg-teal-500',
    green: '!bg-emerald-500',
    blue: '!bg-blue-500',
    purple: '!bg-purple-500',
    pink: '!bg-pink-500',
  };
  return `!w-3 !h-3 ${colorMap[colorType]} !border-2 !border-white hover:scale-125 transition-transform shadow`;
};

/**
 * Renders status badges in custom node headers.
 */
const getStatusBadge = (isRunning: boolean, duration?: number, error?: string) => {
  if (isRunning) {
    return (
      <span className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full font-mono font-bold animate-pulse">
        Running
      </span>
    );
  }
  if (error) {
    return (
      <span className="text-[9px] bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full font-mono font-bold">
        Failed
      </span>
    );
  }
  if (duration !== undefined) {
    return (
      <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-250 px-2 py-0.5 rounded-full font-mono font-bold">
        Success
      </span>
    );
  }
  return (
    <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-250 px-2 py-0.5 rounded-full font-mono font-bold">
      Pending
    </span>
  );
};

/**
 * --- INLINE MARKDOWN RENDERER ---
 * Simple, custom inline parser that splits content by newlines and bold markers (**).
 * Renders text blocks safely inside standard React paragraph layout tags.
 */
function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;
  const paragraphs = content.split('\n');
  return (
    <div className="space-y-2 text-zinc-850 leading-relaxed font-sans text-[11px]">
      {paragraphs.map((para, idx) => {
        if (!para.trim()) return null;
        const parts = para.split(/(\*\*.*?\*\*)/g);
        return (
          <p key={idx}>
            {parts.map((part, pidx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return (
                  <strong key={pidx} className="font-bold text-zinc-950">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return part;
            })}
          </p>
        );
      })}
    </div>
  );
}

// --- 1. REQUEST INPUTS NODE ---
/**
 * RequestInputsNode
 * React Flow custom node representing workflow inputs.
 * Allows creation, duplication, re-ordering, and removal of variables (text or image).
 * Images uploaded are scaled down via HTML5 canvas to prevent huge base64 payload overhead.
 */
export function RequestInputsNode({ id, data }: NodeProps) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const saveStateToHistory = useWorkflowStore((state) => state.saveStateToHistory);
  const setNodes = useWorkflowStore((state) => state.setNodes);
  const setEdges = useWorkflowStore((state) => state.setEdges);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const [isAdding, setIsAdding] = useState(false);
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<'text' | 'image'>('text');
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const handleDeleteNode = () => {
    saveStateToHistory();
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(edges.filter((e) => e.source !== id && e.target !== id));
  };

  const handleResetNode = () => {
    saveStateToHistory();
    const fieldsList = data.fields || [];
    const clearedFields = fieldsList.map((f: any) => ({ ...f, value: '' }));
    updateNodeData(id, { fields: clearedFields });
  };

  const fields = data.fields || [];

  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldName.trim()) return;

    saveStateToHistory();

    const cleanName = fieldName.trim().replace(/\s+/g, '-').toLowerCase();
    const newField = {
      id: `${cleanName}-${Date.now()}`,
      name: fieldName.trim(),
      type: fieldType,
      value: '',
    };

    updateNodeData(id, { fields: [...fields, newField] });
    setFieldName('');
    setIsAdding(false);
  };

  const handleRemoveField = (fieldId: string) => {
    saveStateToHistory();
    updateNodeData(id, {
      fields: fields.filter((f: any) => f.id !== fieldId),
    });
  };

  const handleValueChange = (fieldId: string, val: string) => {
    updateNodeData(id, {
      fields: fields.map((f: any) => (f.id === fieldId ? { ...f, value: val } : f)),
    });
  };

  // Re-ordering arrow shift
  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    saveStateToHistory();
    const newFields = [...fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex >= 0 && targetIndex < newFields.length) {
      const temp = newFields[index];
      newFields[index] = newFields[targetIndex];
      newFields[targetIndex] = temp;
      updateNodeData(id, { fields: newFields });
    }
  };

  // Duplication command
  const handleDuplicateField = (field: any) => {
    saveStateToHistory();
    const cleanName = `${field.name.toLowerCase().replace(/\s+/g, '-')}-copy`;
    const newField = {
      ...field,
      id: `${cleanName}-${Date.now()}`,
      name: `${field.name} Copy`,
    };
    updateNodeData(id, { fields: [...fields, newField] });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, fieldId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      saveStateToHistory();
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;
          
          const MAX_DIM = 1200;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            handleValueChange(fieldId, jpegDataUrl);
          } else {
            handleValueChange(fieldId, reader.result as string);
          }
        };
        img.onerror = () => {
          handleValueChange(fieldId, reader.result as string);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div
      className={`w-[330px] max-w-[330px] flex flex-col bg-white border border-zinc-200/90 rounded-xl shadow-md overflow-hidden p-3.5 text-zinc-900 transition-all duration-300 cursor-default ${
        data.isRunning ? 'animate-pulse-glow border-purple-500' : 'hover:border-zinc-300 hover:shadow-lg'
      }`}
    >
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 relative react-flow__drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileText className="w-4 h-4 text-purple-650 shrink-0" />
          <span className="font-bold text-xs text-zinc-700 tracking-wide truncate">
            {data.label || 'Request Inputs'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 nodrag">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setInfoOpen(!infoOpen);
            }} 
            className="text-zinc-400 hover:text-zinc-600 transition-colors shrink-0" 
            title="Node Info"
          >
            <Info className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handleResetNode();
            }} 
            className="text-zinc-400 hover:text-zinc-600 transition-colors shrink-0" 
            title="Reset Inputs"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>

          <span className="text-[9px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-mono font-bold select-none">
            SYSTEM
          </span>
          
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className={`p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-650 transition-colors ${menuOpen ? 'bg-zinc-100 text-zinc-600' : ''}`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-7 z-50 bg-white border border-zinc-200 rounded-lg shadow-xl py-1 w-32 text-xs nodrag">
                  <button
                    onClick={() => {
                      handleDeleteNode();
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-655 font-bold transition-colors cursor-pointer"
                  >
                    Delete Node
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {infoOpen && (
        <div className="mb-3.5 p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-[10px] text-zinc-600 leading-normal relative nodrag">
          <button 
            onClick={() => setInfoOpen(false)}
            className="absolute top-1.5 right-1.5 text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-2.5 h-2.5" />
          </button>
          <div className="font-semibold text-zinc-800 mb-0.5">About Request Inputs</div>
          Configure parameters (text values or images) to trigger workflow execution paths. Connect these outputs to other nodes in the workspace.
        </div>
      )}

      <div className="space-y-4">
        {fields.length === 0 ? (
          <p className="text-[11px] text-zinc-405 italic">No inputs added. Click '+' to add fields.</p>
        ) : (
          <div className="space-y-3">
            {fields.map((field: any, index: number) => (
              <div key={field.id} className="relative flex flex-col gap-1.5 bg-zinc-50 p-2.5 rounded border border-zinc-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-650 flex items-center gap-1.5">
                    {field.type === 'image' ? (
                      <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-zinc-500" />
                    )}
                    {field.name}
                  </span>
                  
                  {/* Polish Field Actions (Re-ordering, Duplicate, Delete) */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMoveField(index, 'up')}
                      disabled={index === 0}
                      className="p-0.5 hover:bg-zinc-200 rounded text-zinc-400 disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Move Up"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleMoveField(index, 'down')}
                      disabled={index === fields.length - 1}
                      className="p-0.5 hover:bg-zinc-200 rounded text-zinc-400 disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Move Down"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDuplicateField(field)}
                      className="p-0.5 hover:bg-zinc-200 rounded text-zinc-400 hover:text-zinc-650 transition-colors"
                      title="Duplicate Field"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleRemoveField(field.id)}
                      className="p-0.5 hover:bg-zinc-200 rounded text-zinc-400 hover:text-red-500 transition-colors"
                      title="Delete Field"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {field.type === 'text' ? (
                  <textarea
                    value={field.value}
                    onChange={(e) => handleValueChange(field.id, e.target.value)}
                    onFocus={saveStateToHistory}
                    placeholder="Enter text input..."
                    className="w-full text-xs bg-white border border-zinc-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-purple-500 resize-y text-zinc-850 min-h-[48px] nodrag nowheel"
                  />
                ) : (
                  <div className="mt-1 flex flex-col gap-2">
                    {field.value ? (
                      <div className="relative group w-full h-28 border border-zinc-200 rounded overflow-hidden bg-zinc-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={field.value} alt={field.name} className="w-full h-full object-contain" />
                        <button
                          onClick={() => handleValueChange(field.id, '')}
                          className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Change Image
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(`request-image-upload-${field.id}`);
                          if (el) el.click();
                        }}
                        className="flex flex-col items-center justify-center w-full h-16 border border-dashed border-zinc-300 hover:border-zinc-450 bg-white rounded cursor-pointer transition-colors nodrag"
                      >
                        <div className="flex flex-col items-center justify-center py-2 pointer-events-none">
                          <Upload className="w-4 h-4 text-zinc-400 mb-1" />
                          <p className="text-[10px] text-zinc-455 font-medium">Upload image file</p>
                        </div>
                        <input
                          id={`request-image-upload-${field.id}`}
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(e, field.id)}
                          className="hidden"
                        />
                      </button>
                    )}
                  </div>
                )}

                {/* Output Handle */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`${field.id}-${field.type}-output`}
                  className={getHandleClass(field.type === 'image' ? 'teal' : 'orange')}
                  style={{ top: '50%', right: '-22px', transform: 'translateY(-50%)' }}
                />
              </div>
            ))}
          </div>
        )}

        {isAdding ? (
          <form onSubmit={handleAddField} className="bg-zinc-50 p-3 border border-zinc-200 rounded-lg space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 font-semibold uppercase">Field Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFieldType('text')}
                  className={`flex-1 py-1.2 text-xs border rounded-md font-medium transition-colors ${
                    fieldType === 'text'
                      ? 'bg-purple-50 border-purple-500 text-purple-700'
                      : 'bg-white border-zinc-200 text-zinc-550 hover:border-zinc-300'
                  }`}
                >
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => setFieldType('image')}
                  className={`flex-1 py-1.2 text-xs border rounded-md font-medium transition-colors ${
                    fieldType === 'image'
                      ? 'bg-purple-50 border-purple-500 text-purple-700'
                      : 'bg-white border-zinc-200 text-zinc-550 hover:border-zinc-300'
                  }`}
                >
                  Image
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 font-semibold uppercase">Field Name</label>
              <input
                type="text"
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="e.g. Input Prompt"
                className="w-full text-xs bg-white border border-zinc-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-purple-500 text-zinc-805 nodrag"
                autoFocus
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="flex-1 py-1 text-xs border border-zinc-200 text-zinc-505 hover:bg-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-1 text-xs bg-purple-605 hover:bg-purple-500 text-white rounded font-medium transition-colors"
              >
                Add
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-zinc-200 hover:border-zinc-300 bg-zinc-50 hover:bg-zinc-100 rounded-lg text-xs text-zinc-500 hover:text-zinc-700 transition-all font-semibold"
          >
            <Plus className="w-4 h-4" />
            Add Field
          </button>
        )}
      </div>
    </div>
  );
}

// --- 2. CROP IMAGE NODE ---
/**
 * CropImageNode
 * Custom node representing image cropping operations.
 * Resolves source image URLs from upstream connected parent nodes.
 * Renders a visual preview with dragging crop boundaries and slider control ranges.
 */
export function CropImageNode({ id, data }: NodeProps) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);
  const saveStateToHistory = useWorkflowStore((state) => state.saveStateToHistory);
  const setNodes = useWorkflowStore((state) => state.setNodes);
  const setEdges = useWorkflowStore((state) => state.setEdges);
  const showNotification = useWorkflowStore((state) => state.showNotification);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const handleDeleteNode = () => {
    saveStateToHistory();
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(edges.filter((e) => e.source !== id && e.target !== id));
  };

  const handleResetNode = () => {
    saveStateToHistory();
    updateNodeData(id, {
      crop: { x: 0, y: 0, width: 100, height: 100 },
      imageUrl: '',
      output: {},
      duration: undefined,
      error: undefined,
    });
  };

  const isImageConnected = edges.some(
    (edge) => edge.target === id && edge.targetHandle === 'image-input'
  );

  const crop = data.crop || { x: 0, y: 0, width: 100, height: 100 };
  const imageUrl = data.imageUrl || '';

  // Resolve input image dynamically from parent outputs when connected
  let resolvedInputImage = imageUrl;
  if (isImageConnected) {
    const incomingImageEdges = edges.filter(
      (e) => e.target === id && e.targetHandle === 'image-input'
    );
    if (incomingImageEdges.length > 0) {
      const edge = incomingImageEdges[0];
      const parentNode = nodes.find((n) => n.id === edge.source);
      if (parentNode) {
        if (parentNode.type === 'requestInputs') {
          const fields = parentNode.data.fields || [];
          const imgField = fields.find((f: any) => edge.sourceHandle && edge.sourceHandle.startsWith(f.id) && f.type === 'image');
          if (imgField?.value) {
            resolvedInputImage = imgField.value;
          }
        } else if (parentNode.type === 'cropImage') {
          resolvedInputImage = parentNode.data.output?.imageUrl || parentNode.data.imageUrl || '';
        }
      }
    }
  }

  const getConnectedValue = (handleId: string, defaultValue: number): number => {
    const edge = edges.find((e) => e.target === id && e.targetHandle === handleId);
    if (!edge) return defaultValue;
    const parentNode = nodes.find((n) => n.id === edge.source);
    if (!parentNode) return defaultValue;
    
    let valStr = '';
    if (parentNode.type === 'gemini') {
      valStr = parentNode.data.output?.response || parentNode.data.response || '';
    } else if (parentNode.type === 'response') {
      valStr = parentNode.data.output?.result || parentNode.data.result || '';
    } else if (parentNode.type === 'requestInputs') {
      const fields = parentNode.data.fields || [];
      const textVal = fields.find((f: any) => edge.sourceHandle && edge.sourceHandle.startsWith(f.id) && f.type === 'text');
      valStr = textVal?.value || '';
    }
    
    const parsed = parseInt(valStr);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  const handleValChange = (field: string, val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    updateNodeData(id, {
      crop: {
        ...crop,
        [field]: clamped,
      },
    });
  };

  // Run downstream from this node
  const handleTriggerLocalRun = () => {
    const event = new CustomEvent('run-node', { detail: { nodeId: id } });
    window.dispatchEvent(event);
  };

  const renderSliderInput = (label: string, field: 'x' | 'y' | 'width' | 'height') => {
    const handleId = `${field}-input`;
    const isConnected = edges.some(
      (edge) => edge.target === id && edge.targetHandle === handleId
    );

    const displayVal = isConnected ? getConnectedValue(handleId, crop[field]) : crop[field];

    return (
      <div className="relative flex items-center justify-between gap-2.5 w-full py-1">
        <Handle
          type="target"
          position={Position.Left}
          id={handleId}
          className={getHandleClass('pink')}
          style={{ left: '-22px', top: '50%', transform: 'translateY(-50%)' }}
        />
        
        <div className="flex items-center gap-1 select-none w-28 truncate">
          <span className="text-[10px] font-bold text-zinc-700">{label}</span>
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              showNotification(`Sets the ${label} parameter for image cropping.`, 'warning');
            }}
            className="text-zinc-400 hover:text-zinc-600 transition-colors shrink-0 nodrag"
          >
            <Info className="w-3 h-3 inline" strokeWidth={1.5} />
          </button>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          value={displayVal}
          disabled={isConnected}
          onChange={(e) => handleValChange(field, parseInt(e.target.value) || 0)}
          onMouseDown={saveStateToHistory}
          className={`w-20 accent-purple-600 bg-zinc-200 h-1 rounded-lg cursor-pointer nodrag ${
            isConnected ? 'opacity-40 cursor-not-allowed' : ''
          }`}
        />

        <input
          type="number"
          min="0"
          max="100"
          value={displayVal}
          disabled={isConnected}
          onChange={(e) => handleValChange(field, parseInt(e.target.value) || 0)}
          onFocus={saveStateToHistory}
          className={`w-9 text-center text-[10px] bg-[#f1f3f4] border border-[#dadce0] rounded-lg py-0.5 text-zinc-800 font-bold focus:outline-none focus:bg-white focus:border-purple-500 font-mono nodrag ${
            isConnected ? 'opacity-40 bg-zinc-100 cursor-not-allowed' : ''
          }`}
        />

        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleValChange(field, field === 'width' || field === 'height' ? 100 : 0);
          }}
          disabled={isConnected}
          className="flex items-center justify-center w-7 h-7 bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-zinc-500 hover:text-zinc-850 transition-colors nodrag disabled:opacity-30 shrink-0 text-xs font-bold"
          title="Reset parameter"
        >
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>

        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleValChange(field, crop[field] + 5);
          }}
          disabled={isConnected}
          className="flex items-center justify-center w-7 h-7 bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-zinc-500 hover:text-zinc-850 transition-colors nodrag shrink-0 disabled:opacity-30"
          title="Increment parameter"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div
      className={`w-[330px] max-w-[330px] flex flex-col bg-white border border-zinc-200/90 rounded-xl shadow-md overflow-hidden p-3.5 text-zinc-900 transition-all duration-300 cursor-default ${
        data.isRunning ? 'animate-pulse-glow border-purple-500' : 'hover:border-zinc-300 hover:shadow-lg'
      }`}
    >
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 relative react-flow__drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1.5 min-w-0">
          <Crop className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="font-bold text-xs text-zinc-700 tracking-wide truncate">
            Crop Image
          </span>
        </div>
        
        <div className="flex items-center gap-1.5 shrink-0 nodrag">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setInfoOpen(!infoOpen);
            }} 
            className="text-zinc-400 hover:text-zinc-600 transition-colors shrink-0" 
            title="Node Info"
          >
            <Info className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handleResetNode();
            }} 
            className="text-zinc-400 hover:text-zinc-600 transition-colors shrink-0" 
            title="Reset Node Inputs"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>

          {data.isRunning ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('run-node', { detail: { nodeId: null } }));
              }}
              className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 bg-red-100 hover:bg-red-200 text-red-750 transition-all animate-pulse"
              title="Stop Run"
            >
              <X className="w-2.5 h-2.5 text-red-650" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTriggerLocalRun();
              }}
              className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-850 transition-all"
              title="Run from this node"
            >
              <Play className="w-2 h-2 fill-current text-emerald-700" />
              <span>Run</span>
            </button>
          )}

          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className={`p-1 hover:bg-zinc-150 rounded text-zinc-400 hover:text-zinc-655 transition-colors ${menuOpen ? 'bg-zinc-100 text-zinc-600' : ''}`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-7 z-50 bg-white border border-zinc-200 rounded-lg shadow-xl py-1 w-32 text-xs nodrag">
                  <button
                    onClick={() => {
                      handleDeleteNode();
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-bold transition-colors cursor-pointer"
                  >
                    Delete Node
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {infoOpen && (
        <div className="mb-3.5 p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-[10px] text-zinc-600 leading-normal relative nodrag">
          <button 
            onClick={() => setInfoOpen(false)}
            className="absolute top-1.5 right-1.5 text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-2.5 h-2.5" />
          </button>
          <div className="font-semibold text-zinc-800 mb-0.5">About Crop Image</div>
          Crops an input image using X/Y coordinates, width, and height. Can receive dynamic inputs for percentage values.
        </div>
      )}

      <div className="space-y-3">
        {/* Input Image URL Field overrides when connected */}
        <div className="relative flex items-center justify-between gap-2.5 py-1 w-full">
          <Handle
            type="target"
            position={Position.Left}
            id="image-input"
            className={getHandleClass('teal')}
            style={{ left: '-22px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <div className="flex items-center gap-1 select-none shrink-0 w-24">
            <span className="text-[10px] font-bold text-zinc-700">Input Image</span>
            <span className="text-red-500 text-[10px] font-bold">*</span>
          </div>
          
          {isImageConnected ? (
            <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-100 border border-[#dadce0] rounded-lg text-[10px] font-bold text-zinc-500 select-none nodrag">
              <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
              <span>Connected</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`crop-image-upload-${id}`);
                if (el) el.click();
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-[10px] font-bold text-zinc-705 transition-colors cursor-pointer nodrag"
            >
              <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
              <span>Upload image</span>
            </button>
          )}
          <input
            id={`crop-image-upload-${id}`}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                saveStateToHistory();
                const reader = new FileReader();
                reader.onloadend = () => {
                  updateNodeData(id, { imageUrl: reader.result as string });
                };
                reader.readAsDataURL(file);
              }
            }}
            className="hidden"
          />
        </div>

        {/* Visual Crop selection overlay inside bounding box */}
        {resolvedInputImage ? (
          <div className="relative w-full bg-zinc-50 border border-zinc-200 rounded-lg overflow-hidden mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolvedInputImage} alt="Crop Bounding Box Source" className="w-full h-auto block" />
            <div 
              className="border-2 border-purple-500 absolute pointer-events-none"
              style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.width}%`,
                height: `${crop.height}%`
              }}
            />
          </div>
        ) : (
          <div className="w-full aspect-video bg-zinc-50 border border-dashed border-zinc-200 rounded-lg flex flex-col items-center justify-center text-zinc-400 text-xs italic mb-3">
            No input image connected
          </div>
        )}

        {/* Sliders Middle Section */}
        <div className="space-y-2.5">
          {renderSliderInput('X Position (%)', 'x')}
          {renderSliderInput('Y Position (%)', 'y')}
          {renderSliderInput('Width (%)', 'width')}
          {renderSliderInput('Height (%)', 'height')}
        </div>

        {/* Output Image Box section */}
        <div className="border-t border-zinc-100 pt-3 space-y-1.5 relative">
          <div className="flex items-center gap-1 select-none pl-1">
            <span className="text-[10px] text-zinc-700 font-bold">Output Image</span>
          </div>
          <div className="w-full min-h-[100px] bg-[#f8f9fa] border border-[#dadce0] rounded-xl p-3 flex items-center justify-center overflow-hidden nodrag nowheel select-none">
            {data.output?.imageUrl ? (
              <img
                src={data.output.imageUrl}
                alt="Cropped Output Preview"
                className="max-w-full h-auto object-contain rounded"
                style={{ width: `${crop.width}%` }}
              />
            ) : (
              <span className="text-[11px] text-zinc-400 font-semibold italic">No output yet</span>
            )}
          </div>
          
          <div className="flex justify-end pt-1">
            <div className="flex items-center gap-1 text-[9px] text-zinc-400 font-bold select-none">
              <span>🔗</span>
              <span>~0.005M</span>
            </div>
          </div>
          
          <Handle
            type="source"
            position={Position.Right}
            id="image-output"
            className={getHandleClass('teal')}
            style={{ right: '-22px', top: '65%' }}
          />
        </div>
      </div>
    </div>
  );
}

// --- 3. GEMINI NODE ---
/**
 * GeminiNode
 * Custom node representing inference execution using Gemini API.
 * Configures model models parameters (temperature, maxTokens).
 * Collects input sources dynamically (text flow prompt, system prompt, attached images/audio/video/PDFs).
 */
export function GeminiNode({ id, data }: NodeProps) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);
  const saveStateToHistory = useWorkflowStore((state) => state.saveStateToHistory);
  const showNotification = useWorkflowStore((state) => state.showNotification);
  const setNodes = useWorkflowStore((state) => state.setNodes);
  const setEdges = useWorkflowStore((state) => state.setEdges);
  const [showSettings, setShowSettings] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const handleDeleteNode = () => {
    saveStateToHistory();
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(edges.filter((e) => e.source !== id && e.target !== id));
  };

  const handleResetNode = () => {
    saveStateToHistory();
    updateNodeData(id, {
      prompt: '',
      systemPrompt: '',
      response: '',
      output: {},
      uploadedImages: [],
      uploadedVideo: null,
      uploadedAudio: null,
      uploadedFile: null,
      duration: undefined,
      error: undefined,
    });
  };

  const model = data.model || 'Gemini 3.1 Pro';
  const temperature = data.temperature ?? 0.7;
  const maxTokens = data.maxTokens ?? 2048;
  const prompt = data.prompt || '';
  const systemPrompt = data.systemPrompt || '';
  const responseText = data.output?.response || data.response || '';

  const uploadedImages = data.uploadedImages || [];
  const uploadedVideo = data.uploadedVideo || null;
  const uploadedAudio = data.uploadedAudio || null;
  const uploadedFile = data.uploadedFile || null;

  const isPromptConnected = edges.some(
    (edge) => edge.target === id && edge.targetHandle === 'prompt-text-input'
  );
  const isSystemPromptConnected = edges.some(
    (edge) => edge.target === id && edge.targetHandle === 'system-text-input'
  );
  const isImageConnected = edges.some(
    (edge) => edge.target === id && edge.targetHandle === 'image-input'
  );
  const isVideoConnected = edges.some(
    (edge) => edge.target === id && edge.targetHandle === 'video-input'
  );
  const isAudioConnected = edges.some(
    (edge) => edge.target === id && edge.targetHandle === 'audio-input'
  );
  const isFileConnected = edges.some(
    (edge) => edge.target === id && edge.targetHandle === 'file-input'
  );

  // Run downstream from this node
  const handleTriggerLocalRun = () => {
    const event = new CustomEvent('run-node', { detail: { nodeId: id } });
    window.dispatchEvent(event);
  };

  const getConnectedImages = (): { url: string; cropWidth?: number }[] => {
    const incomingEdges = edges.filter(
      (e) => e.target === id && e.targetHandle === 'image-input'
    );
    const images: { url: string; cropWidth?: number }[] = [];
    incomingEdges.forEach((edge) => {
      const parentNode = nodes.find((n) => n.id === edge.source);
      if (!parentNode) return;
      
      if (parentNode.type === 'cropImage') {
        const img = parentNode.data.output?.imageUrl || parentNode.data.imageUrl;
        const cropWidth = parentNode.data.crop?.width;
        if (img) {
          images.push({ url: img, cropWidth });
        }
      } else if (parentNode.type === 'requestInputs') {
        const fields = parentNode.data.fields || [];
        const imgField = fields.find((f: any) => edge.sourceHandle && edge.sourceHandle.startsWith(f.id) && f.type === 'image');
        if (imgField?.value) {
          images.push({ url: imgField.value });
        }
      }
    });
    return images;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Check size limit (4.5MB)
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > 4.5 * 1024 * 1024) {
        showNotification(`File "${files[i].name}" exceeds the 4.5MB limit. Please upload a smaller image.`, 'error');
        return;
      }
    }

    saveStateToHistory();

    const readers = Array.from(files).map((file) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers).then((newImages) => {
      updateNodeData(id, {
        uploadedImages: [...uploadedImages, ...newImages]
      });
    });
    e.target.value = '';
  };

  const handleSingleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (4.5MB)
    if (file.size > 4.5 * 1024 * 1024) {
      showNotification(`File "${file.name}" exceeds the 4.5MB limit. Please upload a smaller file.`, 'error');
      return;
    }

    saveStateToHistory();

    const reader = new FileReader();
    reader.onloadend = () => {
      updateNodeData(id, {
        [fieldName]: {
          name: file.name,
          type: file.type,
          size: file.size,
          data: reader.result as string
        }
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSystemPromptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    saveStateToHistory();
    const reader = new FileReader();
    reader.onloadend = () => {
      updateNodeData(id, { systemPrompt: reader.result as string });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div
      className={`w-[330px] max-w-[330px] flex flex-col bg-white border border-[#dadce0] rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden p-4 text-zinc-900 transition-all duration-300 cursor-default ${
        data.isRunning ? 'animate-pulse-glow border-purple-500' : 'hover:border-zinc-300 hover:shadow-xl'
      }`}
    >
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 relative react-flow__drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-bold text-[13px] text-zinc-800 tracking-wide truncate">
            Gemini 3.1 Pro
          </span>
        </div>
        
        <div className="flex items-center gap-1.5 shrink-0 nodrag">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setInfoOpen(!infoOpen);
            }} 
            className="text-zinc-400 hover:text-zinc-600 transition-colors shrink-0" 
            title="Node Info"
          >
            <Info className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handleResetNode();
            }} 
            className="text-zinc-400 hover:text-zinc-600 transition-colors shrink-0" 
            title="Reset Inputs"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>

          {data.isRunning ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('run-node', { detail: { nodeId: null } }));
              }}
              className="px-3 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-750 transition-colors animate-pulse shrink-0"
              title="Stop Run"
            >
              <X className="w-2.5 h-2.5 text-red-650" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTriggerLocalRun();
              }}
              className="px-3 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 bg-[#e6f4ea] hover:bg-[#d2ebd9] text-[#137333] transition-colors shrink-0"
              title="Run from this node"
            >
              <Play className="w-2.5 h-2.5 fill-current text-[#137333]" />
              <span>Run</span>
            </button>
          )}

          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className={`w-7 h-7 flex items-center justify-center bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-zinc-500 transition-colors shrink-0 ${menuOpen ? 'bg-[#f1f3f4]' : ''}`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-7 z-50 bg-white border border-zinc-200 rounded-lg shadow-xl py-1 w-32 text-xs nodrag">
                  <button
                    onClick={() => {
                      handleDeleteNode();
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-bold transition-colors cursor-pointer"
                  >
                    Delete Node
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {infoOpen && (
        <div className="mb-3.5 p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-[10px] text-zinc-600 leading-normal relative nodrag">
          <button 
            onClick={() => setInfoOpen(false)}
            className="absolute top-1.5 right-1.5 text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-2.5 h-2.5" />
          </button>
          <div className="font-semibold text-zinc-800 mb-0.5">About Gemini</div>
          Runs a prompt with the Google Gemini AI model. Supports system instructions, Vision input, and media files.
        </div>
      )}

      <div className="space-y-4">
        {/* Core Prompt Inputs */}
        <div className="space-y-3.5">
          {/* Prompt (Required) Input row */}
          <div className="relative space-y-1.5 pl-1">
            <Handle
              type="target"
              position={Position.Left}
              id="prompt-text-input"
              className={getHandleClass('orange')}
              style={{ left: '-22px', top: '10px' }}
            />
            <div className="flex items-center gap-1 select-none font-semibold text-[11px] text-zinc-550">
              <span>Prompt</span>
              <span className="text-red-500 font-bold -ml-0.5">*</span>
              <span 
                onClick={(e) => {
                  e.stopPropagation();
                  showNotification('Enter a text prompt to run the model. Can connect inputs dynamically.', 'warning');
                }}
                className="text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <Info className="w-3.5 h-3.5 inline" strokeWidth={1.5} />
              </span>
            </div>
            <div className="relative w-full">
              <textarea
                value={isPromptConnected ? '(Connected to flow input)' : prompt}
                onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
                onFocus={saveStateToHistory}
                placeholder="Enter your prompt..."
                disabled={isPromptConnected}
                className={`w-full text-xs bg-[#f8f9fa] border border-[#dadce0] rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500 focus:bg-white resize-y text-zinc-800 min-h-[60px] nodrag nowheel transition-all ${
                  isPromptConnected ? 'opacity-50 bg-zinc-100 cursor-not-allowed font-medium' : ''
                }`}
              />
              <div className="absolute bottom-1.5 right-1.5 pointer-events-none text-zinc-400">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 8L16 16M8 12V8H12M12 16H16V12" />
                </svg>
              </div>
            </div>
          </div>

          {/* System Prompt Input row */}
          <div className="relative space-y-1.5 pl-1">
            <Handle
              type="target"
              position={Position.Left}
              id="system-text-input"
              className={getHandleClass('orange')}
              style={{ left: '-22px', top: '10px' }}
            />
            <div className="flex items-center justify-between select-none">
              <div className="flex items-center gap-1 font-semibold text-[11px] text-zinc-550">
                <span>System Prompt</span>
                <span 
                  onClick={(e) => {
                    e.stopPropagation();
                    showNotification('Define system instructions to set behavior of the AI agent.', 'warning');
                  }}
                  className="text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5 inline" strokeWidth={1.5} />
                </span>
              </div>
              <button 
                type="button"
                onClick={() => {
                  const el = document.getElementById(`system-prompt-upload-${id}`);
                  if (el) el.click();
                }}
                disabled={isSystemPromptConnected}
                className="w-7 h-7 flex items-center justify-center bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-zinc-500 hover:text-zinc-700 transition-colors font-semibold nodrag disabled:opacity-30"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <input
                id={`system-prompt-upload-${id}`}
                type="file"
                accept=".txt,.md,.json,text/*"
                onChange={handleSystemPromptUpload}
                className="hidden"
              />
            </div>
            <div className="relative w-full">
              <textarea
                value={isSystemPromptConnected ? '(Connected to flow input)' : systemPrompt}
                onChange={(e) => updateNodeData(id, { systemPrompt: e.target.value })}
                onFocus={saveStateToHistory}
                placeholder="You are a helpful coding assistant..."
                disabled={isSystemPromptConnected}
                className={`w-full text-xs bg-[#f8f9fa] border border-[#dadce0] rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500 focus:bg-white resize-y text-zinc-800 min-h-[50px] nodrag nowheel transition-all ${
                  isSystemPromptConnected ? 'opacity-50 bg-zinc-100 cursor-not-allowed font-medium' : ''
                }`}
              />
              <div className="absolute bottom-1.5 right-1.5 pointer-events-none text-zinc-400">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 8L16 16M8 12V8H12M12 16H16V12" />
                </svg>
              </div>
            </div>
          </div>

          {/* Image (Vision) Input row */}
          <div className="relative flex items-center justify-between gap-2 py-1 w-full pl-1">
            <Handle
              type="target"
              position={Position.Left}
              id="image-input"
              className={getHandleClass('teal')}
              style={{ left: '-22px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <div className="flex items-center select-none shrink-0 pr-2">
              <span className="text-[11px] font-semibold text-zinc-555">Image (Vision)</span>
            </div>
            
            {isImageConnected ? (
              <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-100 border border-[#dadce0] rounded-lg text-[10px] font-semibold text-zinc-500 select-none nodrag">
                <span>Connected</span>
              </div>
            ) : uploadedImages.length > 0 ? (
              <div className="flex-1 flex items-center justify-between gap-1.5 py-1.5 px-3 bg-white border border-[#dadce0] rounded-lg text-[10px] font-medium text-zinc-700 nodrag">
                <span className="truncate">{uploadedImages.length} Image(s)</span>
                <button
                  type="button"
                  onClick={() => {
                    saveStateToHistory();
                    updateNodeData(id, { uploadedImages: [] });
                  }}
                  className="text-red-500 hover:text-red-750 font-bold ml-1"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById(`image-upload-${id}`);
                  if (el) el.click();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-[10px] font-medium text-zinc-650 transition-colors cursor-pointer nodrag"
              >
                <Upload className="w-3.5 h-3.5 text-zinc-400" />
                <span>Upload image</span>
              </button>
            )}
            
            <input
              id={`image-upload-${id}`}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`image-upload-${id}`);
                if (el) el.click();
              }}
              disabled={isImageConnected}
              className="flex items-center justify-center w-7 h-7 bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-zinc-500 hover:text-zinc-700 transition-colors font-semibold shrink-0 nodrag"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Connected images display section */}
          {isImageConnected && (
            <div className="flex flex-col items-center gap-2.5 mt-1 select-none nodrag w-full">
              {getConnectedImages().map((imgObj, idx) => (
                <img
                  key={idx}
                  src={imgObj.url}
                  alt={`Cropped input ${idx + 1}`}
                  style={{
                    width: imgObj.cropWidth ? `${imgObj.cropWidth}%` : undefined,
                  }}
                  className="max-w-full max-h-48 object-contain rounded-lg border border-zinc-200 bg-zinc-50 nodrag"
                />
              ))}
              {getConnectedImages().length === 0 && (
                <span className="text-[10px] text-zinc-400 italic">Connected (waiting for output)</span>
              )}
            </div>
          )}

          {!isImageConnected && uploadedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1 select-none nodrag">
              {uploadedImages.map((imgUrl: string, idx: number) => (
                <div key={idx} className="relative group h-16 w-auto max-w-full shrink-0">
                  <img
                    src={imgUrl}
                    alt={`Manual upload ${idx + 1}`}
                    className="h-full w-auto border border-zinc-200 rounded bg-white shadow-sm object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      saveStateToHistory();
                      updateNodeData(id, {
                        uploadedImages: uploadedImages.filter((_: string, i: number) => i !== idx)
                      });
                    }}
                    className="absolute inset-0 bg-black/60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Video Input row */}
          <div className="relative flex items-center justify-between gap-2 py-1 w-full pl-1">
            <Handle
              type="target"
              position={Position.Left}
              id="video-input"
              className={getHandleClass('green')}
              style={{ left: '-22px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <div className="flex items-center select-none shrink-0 pr-2">
              <span className="text-[11px] font-semibold text-zinc-555">Video</span>
            </div>
            
            {isVideoConnected ? (
              <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-100 border border-[#dadce0] rounded-lg text-[10px] font-semibold text-zinc-500 select-none nodrag">
                <span>Connected</span>
              </div>
            ) : uploadedVideo ? (
              <div className="flex-1 flex items-center justify-between gap-1.5 py-1.5 px-3 bg-white border border-[#dadce0] rounded-lg text-[10px] font-medium text-zinc-700 nodrag">
                <span className="truncate" title={uploadedVideo.name}>{uploadedVideo.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    saveStateToHistory();
                    updateNodeData(id, { uploadedVideo: null });
                  }}
                  className="text-red-500 hover:text-red-700 font-bold ml-1 shrink-0"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById(`video-upload-${id}`);
                  if (el) el.click();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-[10px] font-medium text-zinc-600 transition-colors cursor-pointer nodrag"
              >
                <Upload className="w-3.5 h-3.5 text-zinc-400" />
                <span>Upload video</span>
              </button>
            )}
            <input
              id={`video-upload-${id}`}
              type="file"
              accept="video/*"
              onChange={(e) => handleSingleFileUpload(e, 'uploadedVideo')}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`video-upload-${id}`);
                if (el) el.click();
              }}
              disabled={isVideoConnected}
              className="flex items-center justify-center w-7 h-7 bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-zinc-500 hover:text-zinc-700 transition-colors font-semibold shrink-0 nodrag"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Audio Input row */}
          <div className="relative flex items-center justify-between gap-2 py-1 w-full pl-1">
            <Handle
              type="target"
              position={Position.Left}
              id="audio-input"
              className={getHandleClass('blue')}
              style={{ left: '-22px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <div className="flex items-center select-none shrink-0 pr-2">
              <span className="text-[11px] font-semibold text-zinc-555">Audio</span>
            </div>
            
            {isAudioConnected ? (
              <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-100 border border-[#dadce0] rounded-lg text-[10px] font-semibold text-zinc-500 select-none nodrag">
                <span>Connected</span>
              </div>
            ) : uploadedAudio ? (
              <div className="flex-1 flex items-center justify-between gap-1.5 py-1.5 px-3 bg-white border border-[#dadce0] rounded-lg text-[10px] font-medium text-zinc-700 nodrag">
                <span className="truncate" title={uploadedAudio.name}>{uploadedAudio.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    saveStateToHistory();
                    updateNodeData(id, { uploadedAudio: null });
                  }}
                  className="text-red-500 hover:text-red-700 font-bold ml-1 shrink-0"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById(`audio-upload-${id}`);
                  if (el) el.click();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-[10px] font-medium text-zinc-600 transition-colors cursor-pointer nodrag"
              >
                <Upload className="w-3.5 h-3.5 text-zinc-400" />
                <span>Upload audio</span>
              </button>
            )}
            <input
              id={`audio-upload-${id}`}
              type="file"
              accept="audio/*"
              onChange={(e) => handleSingleFileUpload(e, 'uploadedAudio')}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`audio-upload-${id}`);
                if (el) el.click();
              }}
              disabled={isAudioConnected}
              className="flex items-center justify-center w-7 h-7 bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-zinc-500 hover:text-zinc-700 transition-colors font-semibold shrink-0 nodrag"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* File Input row */}
          <div className="relative flex items-center justify-between gap-2 py-1 w-full pl-1">
            <Handle
              type="target"
              position={Position.Left}
              id="file-input"
              className={getHandleClass('purple')}
              style={{ left: '-22px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <div className="flex items-center select-none shrink-0 pr-2">
              <span className="text-[11px] font-semibold text-zinc-555">File</span>
            </div>
            
            {isFileConnected ? (
              <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-100 border border-[#dadce0] rounded-lg text-[10px] font-semibold text-zinc-500 select-none nodrag">
                <span>Connected</span>
              </div>
            ) : uploadedFile ? (
              <div className="flex-1 flex items-center justify-between gap-1.5 py-1.5 px-3 bg-white border border-[#dadce0] rounded-lg text-[10px] font-medium text-zinc-700 nodrag">
                <span className="truncate" title={uploadedFile.name}>{uploadedFile.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    saveStateToHistory();
                    updateNodeData(id, { uploadedFile: null });
                  }}
                  className="text-red-500 hover:text-red-700 font-bold ml-1 shrink-0"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById(`file-upload-${id}`);
                  if (el) el.click();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-[10px] font-medium text-zinc-600 transition-colors cursor-pointer nodrag"
              >
                <Upload className="w-3.5 h-3.5 text-zinc-400" />
                <span>Upload file</span>
              </button>
            )}
            <input
              id={`file-upload-${id}`}
              type="file"
              accept="application/pdf,text/*"
              onChange={(e) => handleSingleFileUpload(e, 'uploadedFile')}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`file-upload-${id}`);
                if (el) el.click();
              }}
              disabled={isFileConnected}
              className="flex items-center justify-center w-7 h-7 bg-[#f8f9fa] border border-[#dadce0] hover:bg-[#f1f3f4] rounded-lg text-zinc-500 hover:text-zinc-700 transition-colors font-semibold shrink-0 nodrag"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Collapsible Settings */}
        <div className="pt-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1 w-full text-[11px] text-zinc-500 hover:text-zinc-700 transition-colors font-semibold nodrag"
          >
            {showSettings ? (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            )}
            <span>Settings</span>
          </button>

          {showSettings && (
            <div className="space-y-3 mt-3 bg-[#f8f9fa] p-3 rounded-xl border border-[#dadce0]">
              <div className="space-y-1">
                <label className="text-[9px] text-zinc-500 font-bold uppercase">Model</label>
                <select
                  value={model}
                  onChange={(e) => {
                    saveStateToHistory();
                    updateNodeData(id, { model: e.target.value });
                  }}
                  className="text-xs bg-white border border-[#dadce0] rounded px-2 py-1 focus:outline-none focus:border-purple-500 text-zinc-700 w-full font-medium nodrag"
                >
                  <option value="Gemini 3.5 Flash">Gemini 3.5 Flash</option>
                  <option value="Gemini 3.1 Pro">Gemini 3.1 Pro</option>
                  <option value="Gemini 3.1 Flash-Lite">Gemini 3.1 Flash-Lite</option>
                  <option value="Gemini 2.5 Pro">Gemini 2.5 Pro</option>
                  <option value="Gemini 2.5 Flash">Gemini 2.5 Flash</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] text-zinc-500 font-bold uppercase">Temp ({temperature})</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onMouseDown={saveStateToHistory}
                    onChange={(e) => updateNodeData(id, { temperature: parseFloat(e.target.value) })}
                    className="w-full accent-purple-600 bg-zinc-200 nodrag"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-zinc-500 font-bold uppercase">Max Tokens</label>
                  <input
                    type="number"
                    min="1"
                    max="8192"
                    value={maxTokens}
                    onFocus={saveStateToHistory}
                    onChange={(e) => updateNodeData(id, { maxTokens: parseInt(e.target.value) || 2048 })}
                    className="w-full text-xs bg-white border border-[#dadce0] rounded px-2 py-1 text-zinc-700 focus:outline-none focus:border-purple-500 nodrag"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Response preview */}
        <div className="border-t border-zinc-100 pt-3.5 space-y-2 relative">
          <div className="flex items-center select-none">
            <span className="text-[11px] text-zinc-500 font-semibold">Response</span>
          </div>
          <div className="w-full min-h-[100px] max-h-56 bg-[#f8f9fa] border border-[#dadce0] rounded-xl p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 nodrag nowheel">
            {responseText ? (
              <MarkdownRenderer content={responseText} />
            ) : (
              <div className="h-16 flex items-center justify-center text-zinc-400 text-[11px] font-semibold italic">
                No output yet
              </div>
            )}
          </div>
          
          <div className="flex justify-end pt-1">
            <div className="flex items-center gap-1 text-[9px] text-zinc-400 font-bold select-none">
              <span>🔗</span>
              <span>~0.0001M</span>
            </div>
          </div>
          
          <Handle
            type="source"
            position={Position.Right}
            id="response-text-output"
            className={getHandleClass('orange')}
            style={{ right: '-22px', top: '65%' }}
          />
        </div>
      </div>
    </div>
  );
}

// --- 4. RESPONSE NODE ---
/**
 * ResponseNode
 * Terminal node of the workflow canvas.
 * Renders final results (markdown strings or cropped images) resolved from upstream parent nodes.
 */
export function ResponseNode({ id, data }: NodeProps) {
  const result = data.output?.result || data.result || '';
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);
  const setNodes = useWorkflowStore((state) => state.setNodes);
  const setEdges = useWorkflowStore((state) => state.setEdges);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const saveStateToHistory = useWorkflowStore((state) => state.saveStateToHistory);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const handleDeleteNode = () => {
    saveStateToHistory();
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(edges.filter((e) => e.source !== id && e.target !== id));
  };

  const handleResetNode = () => {
    saveStateToHistory();
    updateNodeData(id, {
      result: '',
      output: {},
      duration: undefined,
      error: undefined,
    });
  };

  const isBase64Image = (str: string) => {
    return typeof str === 'string' && (str.startsWith('data:image/') || str.startsWith('http://') || str.startsWith('https://'));
  };

  const getCropWidth = (): number | undefined => {
    const incomingEdge = edges.find((e) => e.target === id && e.targetHandle === 'result-input');
    if (!incomingEdge) return undefined;
    const parentNode = nodes.find((n) => n.id === incomingEdge.source);
    if (parentNode?.type === 'cropImage') {
      return parentNode.data.crop?.width;
    }
    return undefined;
  };

  const cropWidth = getCropWidth();

  return (
    <div
      className={`w-[280px] max-w-[280px] flex flex-col bg-white border border-zinc-200/90 rounded-xl shadow-md overflow-hidden p-3.5 text-zinc-900 transition-all duration-300 cursor-default ${
        data.isRunning ? 'animate-pulse-glow border-purple-500' : 'hover:border-zinc-300 hover:shadow-lg'
      }`}
    >
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 relative react-flow__drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1.5 min-w-0">
          <Play className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-bold text-xs text-zinc-700 tracking-wide truncate">
            {data.label || 'Response'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 nodrag">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setInfoOpen(!infoOpen);
            }} 
            className="text-zinc-400 hover:text-zinc-600 transition-colors shrink-0" 
            title="Node Info"
          >
            <Info className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handleResetNode();
            }} 
            className="text-zinc-400 hover:text-zinc-600 transition-colors shrink-0" 
            title="Reset Node Output"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>

          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className={`p-1 hover:bg-zinc-150 rounded text-zinc-400 hover:text-zinc-655 transition-colors ${menuOpen ? 'bg-zinc-100 text-zinc-600' : ''}`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-7 z-50 bg-white border border-zinc-200 rounded-lg shadow-xl py-1 w-32 text-xs nodrag">
                  <button
                    onClick={() => {
                      handleDeleteNode();
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-bold transition-colors cursor-pointer"
                  >
                    Delete Node
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {infoOpen && (
        <div className="mb-3.5 p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-[10px] text-zinc-600 leading-normal relative nodrag">
          <button 
            onClick={() => setInfoOpen(false)}
            className="absolute top-1.5 right-1.5 text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-2.5 h-2.5" />
          </button>
          <div className="font-semibold text-zinc-800 mb-0.5">About Response</div>
          Displays the final response output text or cropped image preview from the workflow execution.
        </div>
      )}

      <div className="space-y-2 relative">
        <Handle
          type="target"
          position={Position.Left}
          id="result-input"
          className={getHandleClass('orange')}
          style={{ left: '-22px', top: '10px' }}
        />
        <div className="flex items-center gap-1 select-none">
          <span className="text-[10px] text-zinc-600 font-semibold">result</span>
        </div>
        {result ? (
          <div className="w-full min-h-[100px] max-h-56 bg-zinc-50 border border-zinc-200 rounded-lg p-3 overflow-y-auto text-xs text-zinc-800 font-mono leading-relaxed nodrag nowheel">
            {isBase64Image(result) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result}
                alt="Response Output Preview"
                style={{
                  width: cropWidth ? `${cropWidth}%` : undefined,
                }}
                className="max-w-full h-auto object-contain rounded-md animate-fade-in nodrag mx-auto"
              />
            ) : (
              <span>{result}</span>
            )}
          </div>
        ) : (
          <div className="w-full h-24 flex items-center justify-center bg-zinc-50 border border-zinc-200 border-dashed rounded-lg text-zinc-400 text-xs italic">
            No output yet
          </div>
        )}
      </div>
    </div>
  );
}
