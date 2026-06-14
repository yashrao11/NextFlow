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
} from 'lucide-react';

const handleClass = "!w-3 !h-3 !bg-purple-500 !border-2 !border-white hover:scale-125 transition-transform shadow";

// --- INLINE MARKDOWN RENDERER ---
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
export function RequestInputsNode({ id, data }: NodeProps) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const [isAdding, setIsAdding] = useState(false);
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<'text' | 'image'>('text');

  const fields = data.fields || [];

  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldName.trim()) return;

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
      const reader = new FileReader();
      reader.onloadend = () => {
        handleValueChange(fieldId, reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div
      className={`w-[320px] max-w-[320px] flex flex-col bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden p-4 text-zinc-900 transition-all duration-300 ${
        data.isRunning ? 'animate-pulse-glow border-purple-500' : 'hover:border-zinc-300'
      }`}
    >
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-purple-600" />
          <span className="font-semibold text-xs tracking-wider uppercase text-zinc-505">
            {data.label || 'Request Inputs'}
          </span>
        </div>
        <span className="text-[9px] bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-mono font-semibold">
          SYSTEM
        </span>
      </div>

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
                      <label className="flex flex-col items-center justify-center w-full h-16 border border-dashed border-zinc-300 hover:border-zinc-450 bg-white rounded cursor-pointer transition-colors">
                        <div className="flex flex-col items-center justify-center py-2">
                          <Upload className="w-4 h-4 text-zinc-400 mb-1" />
                          <p className="text-[10px] text-zinc-455 font-medium">Upload image file</p>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(e, field.id)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                )}

                {/* Output Handle */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`${field.id}-${field.type}-output`}
                  className={handleClass}
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
export function CropImageNode({ id, data }: NodeProps) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);

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
          const fieldId = edge.sourceHandle?.split('-')[0] || '';
          const imgField = fields.find((f: any) => f.id.startsWith(fieldId) && f.type === 'image');
          if (imgField?.value) {
            resolvedInputImage = imgField.value;
          }
        } else if (parentNode.type === 'cropImage') {
          resolvedInputImage = parentNode.data.output?.imageUrl || parentNode.data.imageUrl || '';
        }
      }
    }
  }

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
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-zinc-500 font-semibold uppercase">{label}</label>
          <span className="text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100 rounded px-1">{crop[field]}%</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="100"
            value={crop[field]}
            onChange={(e) => handleValChange(field, parseInt(e.target.value) || 0)}
            className="flex-1 accent-purple-600 bg-zinc-200 h-1 rounded-lg cursor-pointer nodrag"
          />
          <input
            type="number"
            min="0"
            max="100"
            value={crop[field]}
            onChange={(e) => handleValChange(field, parseInt(e.target.value) || 0)}
            className="w-12 text-center text-xs bg-zinc-50 border border-zinc-200 rounded px-1 py-0.5 text-zinc-800 font-medium focus:outline-none focus:border-purple-500 font-mono nodrag"
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className={`w-[320px] max-w-[320px] flex flex-col bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden p-4 text-zinc-900 transition-all duration-300 ${
        data.isRunning ? 'animate-pulse-glow border-purple-500' : 'hover:border-zinc-300'
      }`}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="image-input"
        className={handleClass}
        style={{ left: '-22px' }}
      />

      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <Crop className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-xs tracking-wider uppercase text-zinc-505">
            {data.label || 'Crop Image'}
          </span>
        </div>
        
        {/* Miniature run play button in header */}
        <button
          onClick={handleTriggerLocalRun}
          disabled={data.isRunning}
          className={`p-1.5 rounded-lg transition-all ${
            data.isRunning 
              ? 'bg-purple-105 text-purple-600 animate-pulse'
              : 'hover:bg-purple-50 text-zinc-400 hover:text-purple-600'
          }`}
          title="Run from this node upstream"
        >
          {data.isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
        </button>
      </div>

      <div className="space-y-3">
        {/* Input Image URL Field overrides when connected */}
        <div className="space-y-1">
          <span className="text-[9px] text-zinc-400 font-bold uppercase flex items-center justify-between">
            Input Image URL
            <span className="text-[8px] text-zinc-500 font-mono">handle: image-input</span>
          </span>
          <input
            type="text"
            value={isImageConnected ? '(Connected to flow input)' : imageUrl}
            onChange={(e) => updateNodeData(id, { imageUrl: e.target.value })}
            placeholder="Paste image URL here..."
            disabled={isImageConnected}
            className={`w-full text-xs bg-zinc-50 border border-zinc-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-purple-500 text-zinc-855 nodrag ${
              isImageConnected ? 'opacity-50 bg-zinc-100 cursor-not-allowed' : ''
            }`}
          />
        </div>

        {/* Visual Crop selection overlay inside bounding box */}
        {resolvedInputImage ? (
          <div className="relative w-full aspect-video bg-zinc-50 border border-zinc-200 rounded-lg overflow-hidden flex items-center justify-center mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolvedInputImage} alt="Crop Bounding Box Source" className="w-full h-full object-cover" />
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
      </div>
      
      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="image-output"
        className={handleClass}
        style={{ right: '-22px' }}
      />
    </div>
  );
}

// --- 3. GEMINI NODE ---
export function GeminiNode({ id, data }: NodeProps) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);
  const [showSettings, setShowSettings] = useState(false);

  const model = data.model || 'Gemini 3.1 Pro';
  const temperature = data.temperature ?? 0.7;
  const maxTokens = data.maxTokens ?? 2048;
  const prompt = data.prompt || '';
  const systemPrompt = data.systemPrompt || '';
  const responseText = data.output?.response || data.response || '';

  const isPromptConnected = edges.some(
    (edge) => edge.target === id && edge.targetHandle === 'prompt-text-input'
  );
  const isSystemPromptConnected = edges.some(
    (edge) => edge.target === id && edge.targetHandle === 'system-text-input'
  );

  // Resolve connected image inputs dynamically for vision preview
  const incomingImageEdges = edges.filter(
    (e) => e.target === id && e.targetHandle === 'image-input'
  );

  const resolvedImageUrls: string[] = [];
  incomingImageEdges.forEach((edge) => {
    const parentNode = nodes.find((n) => n.id === edge.source);
    if (!parentNode) return;

    if (parentNode.type === 'cropImage') {
      const croppedUrl = parentNode.data.output?.imageUrl || parentNode.data.imageUrl || '';
      if (croppedUrl) {
        resolvedImageUrls.push(croppedUrl);
      }
    } else if (parentNode.type === 'requestInputs') {
      const fields = parentNode.data.fields || [];
      const fieldId = edge.sourceHandle?.split('-')[0] || '';
      const imgField = fields.find((f: any) => f.id.startsWith(fieldId) && f.type === 'image');
      if (imgField?.value) {
        resolvedImageUrls.push(imgField.value);
      }
    }
  });

  if (data.imageUrl && !resolvedImageUrls.includes(data.imageUrl)) {
    resolvedImageUrls.push(data.imageUrl);
  }

  // Run downstream from this node
  const handleTriggerLocalRun = () => {
    const event = new CustomEvent('run-node', { detail: { nodeId: id } });
    window.dispatchEvent(event);
  };

  return (
    <div
      className={`w-[320px] max-w-[320px] flex flex-col bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden p-4 text-zinc-900 transition-all duration-300 ${
        data.isRunning ? 'animate-pulse-glow border-purple-500' : 'hover:border-zinc-300'
      }`}
    >
      {/* Input Handles (Left) */}
      <div className="relative">
        <Handle type="target" position={Position.Left} id="prompt-text-input" className={handleClass} style={{ left: '-22px', top: '50px' }} />
        <Handle type="target" position={Position.Left} id="system-text-input" className={handleClass} style={{ left: '-22px', top: '80px' }} />
        <Handle type="target" position={Position.Left} id="image-input" className={handleClass} style={{ left: '-22px', top: '110px' }} />
        <Handle type="target" position={Position.Left} id="video-input" className={handleClass} style={{ left: '-22px', top: '140px' }} />
        <Handle type="target" position={Position.Left} id="audio-input" className={handleClass} style={{ left: '-22px', top: '170px' }} />
        <Handle type="target" position={Position.Left} id="file-input" className={handleClass} style={{ left: '-22px', top: '200px' }} />
      </div>

      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-605" />
          <span className="font-semibold text-xs tracking-wider uppercase text-zinc-505">
            {data.label || 'Gemini 3.1 Pro'}
          </span>
        </div>
        
        {/* Miniature run play button in header */}
        <button
          onClick={handleTriggerLocalRun}
          disabled={data.isRunning}
          className={`p-1.5 rounded-lg transition-all ${
            data.isRunning 
              ? 'bg-purple-105 text-purple-600 animate-pulse'
              : 'hover:bg-purple-50 text-zinc-400 hover:text-purple-600'
          }`}
          title="Run from this node upstream"
        >
          {data.isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
        </button>
      </div>

      <div className="flex flex-col bg-zinc-50 border border-zinc-200/80 rounded-lg p-2.5 mb-3 gap-1.5">
        <select
          value={model}
          onChange={(e) => updateNodeData(id, { model: e.target.value })}
          className="text-xs bg-white border border-zinc-200 rounded px-2 py-1.2 focus:outline-none focus:border-purple-500 text-zinc-708 w-full font-medium nodrag"
        >
          <option value="Gemini 3.5 Flash">Gemini 3.5 Flash</option>
          <option value="Gemini 3.1 Pro">Gemini 3.1 Pro</option>
          <option value="Gemini 3.1 Flash-Lite">Gemini 3.1 Flash-Lite</option>
          <option value="Gemini 2.5 Pro">Gemini 2.5 Pro</option>
          <option value="Gemini 2.5 Flash">Gemini 2.5 Flash</option>
        </select>
      </div>

      <div className="space-y-4">
        {/* Core Prompt Inputs */}
        <div className="space-y-3">
          <div className="space-y-1 pl-1">
            <span className="text-[9px] text-zinc-400 font-bold uppercase flex items-center justify-between">
              Prompt (Required)
              <span className="text-[8px] text-zinc-500 font-mono">handle: prompt-text-input</span>
            </span>
            <textarea
              value={isPromptConnected ? '(Connected to flow input)' : prompt}
              onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
              placeholder="Describe what Gemini should do..."
              disabled={isPromptConnected}
              className={`w-full text-xs bg-zinc-50 border border-zinc-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-purple-500 resize-y text-zinc-900 min-h-[50px] nodrag nowheel ${
                isPromptConnected ? 'opacity-50 bg-zinc-100 cursor-not-allowed font-medium' : ''
              }`}
            />
          </div>

          <div className="space-y-1 pl-1">
            <span className="text-[9px] text-zinc-400 font-bold uppercase flex items-center justify-between">
              System Prompt
              <span className="text-[8px] text-zinc-500 font-mono">handle: system-text-input</span>
            </span>
            <textarea
              value={isSystemPromptConnected ? '(Connected to flow input)' : systemPrompt}
              onChange={(e) => updateNodeData(id, { systemPrompt: e.target.value })}
              placeholder="You are a helpful coding assistant..."
              disabled={isSystemPromptConnected}
              className={`w-full text-xs bg-zinc-50 border border-zinc-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-purple-500 resize-y text-zinc-900 min-h-[40px] nodrag nowheel ${
                isSystemPromptConnected ? 'opacity-50 bg-zinc-100 cursor-not-allowed font-medium' : ''
              }`}
            />
          </div>
        </div>

        {/* Collapsible Settings */}
        <div className="border-t border-zinc-100 pt-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center justify-between w-full text-xs text-zinc-550 hover:text-zinc-700 transition-colors"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <Settings className="w-3.5 h-3.5" />
              Advanced Settings
            </span>
            {showSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showSettings && (
            <div className="grid grid-cols-2 gap-3 mt-3 bg-zinc-50 p-3 rounded-lg border border-zinc-200">
              <div className="space-y-1">
                <label className="text-[9px] text-zinc-500 font-bold uppercase">Temp ({temperature})</label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => updateNodeData(id, { temperature: parseFloat(e.target.value) })}
                  className="w-full accent-purple-600 bg-zinc-200 nodrag"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-zinc-550 font-bold uppercase">Max Tokens</label>
                <input
                  type="number"
                  min="1"
                  max="8192"
                  value={maxTokens}
                  onChange={(e) => updateNodeData(id, { maxTokens: parseInt(e.target.value) || 2048 })}
                  className="w-full text-xs bg-white border border-zinc-200 rounded px-2 py-1 text-zinc-805 focus:outline-none focus:border-purple-500 nodrag"
                />
              </div>
            </div>
          )}
        </div>

        {/* Image (Vision) Multi-image side-by-side layout list */}
        {resolvedImageUrls.length > 0 && (
          <div className="border-t border-zinc-100 pt-3 space-y-1.5">
            <span className="text-[10px] text-zinc-505 font-semibold uppercase block pl-1">
              Image (Vision)
            </span>
            <div className="flex flex-col items-center gap-2.5 nodrag nowheel">
              {resolvedImageUrls.map((url, idx) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={idx}
                  src={url}
                  alt={`Vision Input ${idx + 1}`}
                  className="max-w-full max-h-48 object-contain rounded-lg border border-zinc-200 bg-zinc-50 nodrag"
                />
              ))}
            </div>
          </div>
        )}

        {/* Response preview */}
        <div className="border-t border-zinc-100 pt-3 space-y-1.5">
          <span className="text-[9px] text-zinc-455 font-bold uppercase flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            Response
          </span>
          <div className="w-full min-h-[100px] max-h-56 bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 nodrag nowheel">
            {responseText ? (
              <MarkdownRenderer content={responseText} />
            ) : (
              <span className="text-[11px] font-mono text-zinc-400 italic">No output yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="response-text-output"
        className={handleClass}
        style={{ right: '-22px', top: '50%' }}
      />
    </div>
  );
}

// --- 4. RESPONSE NODE ---
export function ResponseNode({ id, data }: NodeProps) {
  const result = data.output?.result || data.result || '';

  const isBase64Image = (str: string) => {
    return typeof str === 'string' && (str.startsWith('data:image/') || str.startsWith('http://') || str.startsWith('https://'));
  };

  return (
    <div
      className={`w-[320px] max-w-[320px] flex flex-col bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden p-4 text-zinc-900 transition-all duration-300 ${
        data.isRunning ? 'animate-pulse-glow border-purple-500' : 'hover:border-zinc-300'
      }`}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="result-input"
        className={handleClass}
        style={{ left: '-22px' }}
      />

      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-emerald-600" />
          <span className="font-semibold text-xs tracking-wider uppercase text-zinc-505">
            {data.label || 'Response'}
          </span>
        </div>
        <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-250 px-2 py-0.5 rounded-full font-mono font-semibold">
          SYSTEM
        </span>
      </div>

      <div className="space-y-2">
        <span className="text-[9px] text-zinc-400 font-bold uppercase">Output Result</span>
        {result ? (
          <div className="w-full min-h-[100px] max-h-56 bg-zinc-50 border border-zinc-200 rounded-lg p-3 overflow-y-auto text-xs text-zinc-800 font-mono leading-relaxed nodrag nowheel">
            {isBase64Image(result) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result} alt="Response Output Preview" className="w-full max-h-48 object-contain rounded-md animate-fade-in nodrag" />
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
