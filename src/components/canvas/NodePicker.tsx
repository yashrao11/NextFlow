'use client';

import React, { useState, useMemo } from 'react';
import { useReactFlow } from 'reactflow';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import {
  Search,
  Crop,
  Brain,
  Clock,
  X,
} from 'lucide-react';

interface NodeOption {
  type: string;
  name: string;
  description: string;
  category: 'Recent' | 'Image' | 'Video' | 'Audio' | 'Others';
  icon: React.ReactNode;
}

interface NodePickerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * NodePicker Component
 * Renders a floating popup panel that allows users to pick and create
 * new nodes onto the React Flow canvas workspace.
 * Triggered externally via the + button in the bottom toolbar.
 */
export default function NodePicker({ isOpen, onClose }: NodePickerProps) {
  const [search, setSearch] = useState('');
  const { getViewport } = useReactFlow();
  const addNode = useWorkflowStore((state) => state.addNode);
  const saveStateToHistory = useWorkflowStore((state) => state.saveStateToHistory);

  const nodeOptions: NodeOption[] = useMemo(
    () => [
      {
        type: 'cropImage',
        name: 'Crop Image',
        description: 'Crop images using manual or dynamic coordinates',
        category: 'Image',
        icon: <Crop className="w-4 h-4 text-blue-500" />,
      },
      {
        type: 'gemini',
        name: 'Gemini 3.1 Pro',
        description: 'Run inference prompts, vision models, and files with Gemini',
        category: 'Others',
        icon: <Brain className="w-4 h-4 text-purple-600" />,
      },
      {
        type: 'cropImage',
        name: 'Recent: Crop Image',
        description: 'Quick add Crop Image node',
        category: 'Recent',
        icon: <Clock className="w-4 h-4 text-zinc-400" />,
      },
      {
        type: 'gemini',
        name: 'Recent: Gemini 3.1 Pro',
        description: 'Quick add Gemini node',
        category: 'Recent',
        icon: <Clock className="w-4 h-4 text-zinc-400" />,
      },
    ],
    []
  );

  const filteredOptions = useMemo(() => {
    return nodeOptions.filter(
      (opt) =>
        opt.name.toLowerCase().includes(search.toLowerCase()) ||
        opt.description.toLowerCase().includes(search.toLowerCase())
    );
  }, [nodeOptions, search]);

  const categories: Array<'Recent' | 'Image' | 'Video' | 'Audio' | 'Others'> = [
    'Recent',
    'Image',
    'Video',
    'Audio',
    'Others',
  ];

  /**
   * Spawns a new node onto the center of the canvas viewport.
   */
  const handleSpawnNode = (type: string) => {
    saveStateToHistory();

    const { x, y, zoom } = getViewport();
    const flowX = (-x + window.innerWidth / 2) / zoom;
    const flowY = (-y + window.innerHeight / 2) / zoom;

    const cleanType = type.replace('Recent: ', '');
    const nodeId = `${cleanType}-${Date.now()}`;

    let newNode: any = {
      id: nodeId,
      type: cleanType,
      position: { x: flowX - 160, y: flowY - 100 },
      data: { isRunning: false },
    };

    if (cleanType === 'cropImage') {
      newNode.data.crop = { x: 0, y: 0, width: 100, height: 100 };
    } else if (cleanType === 'gemini') {
      newNode.data.model = 'Gemini 3.1 Pro';
      newNode.data.prompt = '';
      newNode.data.systemPrompt = '';
      newNode.data.temperature = 0.7;
      newNode.data.maxTokens = 2048;
      newNode.data.response = 'Awaiting execution run...';
    }

    addNode(newNode);
    onClose();
    setSearch('');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop to close on outside click */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Node picker popup — centered bottom */}
      <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-50 bg-white border border-zinc-200 rounded-xl shadow-2xl w-[400px] flex flex-col max-h-[420px] overflow-hidden animate-fade-in-up">
        {/* Search header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="bg-transparent border-none outline-none text-sm text-zinc-800 placeholder-zinc-400 w-full"
            autoFocus
          />
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Node options list */}
        <div className="overflow-y-auto flex-1 p-3 space-y-4">
          {categories.map((cat) => {
            const catOpts = filteredOptions.filter((opt) => opt.category === cat);
            if (catOpts.length === 0) return null;

            return (
              <div key={cat} className="space-y-1">
                <span className="text-[10px] text-zinc-400 font-bold tracking-wider uppercase px-1 block">
                  {cat}
                </span>
                <div className="space-y-0.5">
                  {catOpts.map((opt) => (
                    <button
                      key={`${opt.category}-${opt.name}`}
                      onClick={() => handleSpawnNode(opt.type)}
                      className="w-full flex items-start gap-3 px-2.5 py-2.5 hover:bg-zinc-50 border border-transparent hover:border-zinc-150 rounded-lg text-left transition-all group"
                    >
                      <div className="p-1.5 bg-zinc-50 group-hover:bg-white rounded-md border border-zinc-150 shrink-0">
                        {opt.icon}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-zinc-800 truncate">{opt.name}</span>
                        <span className="text-[11px] text-zinc-500 leading-relaxed mt-0.5">{opt.description}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {filteredOptions.length === 0 && (
            <div className="text-center py-8 text-sm text-zinc-400">
              No matching nodes found.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
