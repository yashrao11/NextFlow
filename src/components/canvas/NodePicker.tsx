'use client';

import React, { useState, useMemo } from 'react';
import { useReactFlow } from 'reactflow';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import {
  Plus,
  Search,
  Crop,
  Brain,
  Clock,
} from 'lucide-react';

interface NodeOption {
  type: string;
  name: string;
  description: string;
  category: 'Recent' | 'Image' | 'Video' | 'Audio' | 'Others';
  icon: React.ReactNode;
}

export default function NodePicker() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { getViewport } = useReactFlow();
  const addNode = useWorkflowStore((state) => state.addNode);
  const saveStateToHistory = useWorkflowStore((state) => state.saveStateToHistory);

  const nodeOptions: NodeOption[] = useMemo(() => [
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
  ], []);

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

  const handleSpawnNode = (type: string) => {
    saveStateToHistory();

    const { x, y, zoom } = getViewport();
    const flowX = (-x + window.innerWidth / 2) / zoom;
    const flowY = (-y + window.innerHeight / 2) / zoom;

    const cleanType = type.replace('Recent: ', '');
    const id = `${cleanType}-${Date.now()}`;

    let newNode: any = {
      id,
      type: cleanType,
      position: { x: flowX, y: flowY },
      data: {
        isRunning: false,
      },
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
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      {/* Searchable overlay */}
      {isOpen && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-white border border-zinc-200 rounded-xl p-4 w-96 shadow-xl flex flex-col gap-4 max-h-[380px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-200 text-zinc-900">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
            <Search className="w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nodes..."
              className="bg-transparent border-none outline-none text-xs text-zinc-800 placeholder-zinc-400 w-full"
              autoFocus
            />
          </div>

          <div className="space-y-4">
            {categories.map((cat) => {
              const catOpts = filteredOptions.filter((opt) => opt.category === cat);
              if (catOpts.length === 0) return null;

              return (
                <div key={cat} className="space-y-1.5">
                  <span className="text-[9px] text-zinc-450 font-bold tracking-wider uppercase pl-1">
                    {cat}
                  </span>
                  <div className="grid grid-cols-1 gap-1">
                    {catOpts.map((opt) => (
                      <button
                        key={`${opt.category}-${opt.name}`}
                        onClick={() => handleSpawnNode(opt.type)}
                        className="flex items-start gap-3 p-2 hover:bg-zinc-50 border border-transparent hover:border-zinc-150 rounded-lg text-left transition-all"
                      >
                        <div className="p-1.5 bg-zinc-50 rounded border border-zinc-150">
                          {opt.icon}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-zinc-800">{opt.name}</span>
                          <span className="text-[10px] text-zinc-500">{opt.description}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {filteredOptions.length === 0 && (
              <div className="text-center py-6 text-xs text-zinc-450">
                No matching nodes found.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main bar */}
      <div className="bg-white/90 backdrop-blur-md border border-zinc-200 rounded-full px-4 py-2 shadow-xl flex items-center justify-between gap-3 w-80">
        <div className="flex items-center gap-2 flex-1">
          <Search className="w-4.5 h-4.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Add node to canvas..."
            onClick={() => setIsOpen(true)}
            value={search}
            onChange={(e) => {
              setIsOpen(true);
              setSearch(e.target.value);
            }}
            className="bg-transparent border-none outline-none text-xs text-zinc-800 placeholder-zinc-400 w-full"
          />
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-7 h-7 bg-purple-600 hover:bg-purple-500 text-white rounded-full flex items-center justify-center transition-all duration-350 cursor-pointer shadow-md hover:shadow-purple-600/10 ${
            isOpen ? 'rotate-45 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-500' : ''
          }`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
