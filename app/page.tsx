'use client';

import { useState, useEffect, useRef } from 'react';
import { World } from '@/lib/simulation/World';
import WorldCanvas from '@/components/WorldCanvas';
import ActivityLog from '@/components/ActivityLog';
import { LLMService } from '@/lib/llm/LLMService';
import { CameraEvent } from '@/lib/simulation/types';

// Configuration
const GRID_W = 35;
const GRID_H = 25;

function getStatusLabel(gs: string | undefined): { text: string; className: string } {
  switch (gs) {
    case 'LOBBY': return { text: 'STANDBY', className: 'bg-slate-900/50 border-slate-600 text-slate-400' };
    case 'PRE_GAME': return { text: 'FREE TIME', className: 'bg-yellow-900/50 border-yellow-600 text-yellow-300 animate-pulse' };
    case 'GAME_INTRO': return { text: 'ANNOUNCEMENT', className: 'bg-amber-900/50 border-amber-500 text-amber-200 animate-pulse' };
    case 'GAME_COUNTDOWN': return { text: 'COUNTDOWN', className: 'bg-red-900/50 border-red-500 text-red-200 animate-pulse' };
    case 'ROUND_ACTIVE': return { text: 'ZOMBIE OUTBREAK', className: 'bg-red-900/50 border-red-500 text-red-200 animate-pulse' };
    case 'ROUND_RESULT': return { text: 'RESULTS', className: 'bg-purple-900/50 border-purple-500 text-purple-200' };
    case 'GAME_OVER': return { text: 'TERMINATED', className: 'bg-gray-900/50 border-gray-600 text-gray-400' };
    default: return { text: 'STANDBY', className: 'bg-slate-900/50 border-slate-600 text-slate-400' };
  }
}

export default function Home() {
  const worldRef = useRef<World | null>(null);
  const [tick, setTick] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [cameraEvents, setCameraEvents] = useState<CameraEvent[]>([]);

  useEffect(() => {
    worldRef.current = new World({
      width: GRID_W,
      height: GRID_H,
      tickRate: 500
    });
    setTick(t => t + 1);
  }, []);

  // Game loop with dynamic speed (slow motion support)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const loop = () => {
      if (worldRef.current) {
        worldRef.current.tick();
        const events = worldRef.current.consumeCameraEvents();
        if (events.length > 0) setCameraEvents(events);
        setTick(t => t + 1);
      }
      const delay = worldRef.current && worldRef.current.slowMotionTicks > 0 ? 500 : 200;
      timeoutId = setTimeout(loop, delay);
    };
    timeoutId = setTimeout(loop, 200);
    return () => clearTimeout(timeoutId);
  }, []);

  const handleSpawn = (gender: 'MALE' | 'FEMALE') => {
    worldRef.current?.spawnAgent(gender);
    setTick(t => t + 1);
  };

  const handleSaveKey = () => {
    LLMService.setApiKey(apiKey);
    setShowSettings(false);
    alert('API Key가 저장되었습니다. 에이전트들이 곧 대화를 시작합니다!');
  };

  const currentAgents = worldRef.current?.agents || [];
  const currentLogs = worldRef.current?.logs || [];
  const gameState = worldRef.current?.gameState || 'LOBBY';
  const selectedAgent = currentAgents.find(a => a.id === selectedAgentId);
  const status = getStatusLabel(gameState);

  // Alliance info for selected agent
  const selectedAlliance = selectedAgent?.allianceId
    ? worldRef.current?.alliances.find(al => al.id === selectedAgent.allianceId)
    : null;

  return (
    <main className="min-h-screen bg-black text-gray-200 p-4 lg:p-8 font-sans">
      <header className="mb-4 lg:mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
            MIDNIGHT STATION
          </h1>
          <p className="text-gray-500 text-sm">Autonomous Agent Observation Terminal</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className={`px-4 py-2 border rounded font-mono font-bold text-sm ${status.className}`}>
            {status.text}
          </div>
          {gameState !== 'LOBBY' && (
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 text-white font-bold rounded hover:bg-red-500"
            >
              RESTART
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition-colors"
          >
            SETTINGS
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 w-96 shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-white">System Configuration</h2>
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-2">OpenAI API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-xs text-slate-500 mt-2">
                키가 없으면 랜덤 대사로 작동합니다.<br />
                (Keys are not stored persistently)
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveKey}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 max-w-[1600px] mx-auto h-[85vh]">

        {/* Left Col: Canvas */}
        <div className="lg:col-span-3 space-y-4 flex flex-col h-full">
          <div className="bg-gray-900/50 p-1 rounded-xl border border-gray-800 flex-1 overflow-hidden relative">
            <div className="w-full h-full flex items-center justify-center bg-[#0f172a]">
              <WorldCanvas
                agents={currentAgents}
                width={GRID_W}
                height={GRID_H}
                onAgentClick={setSelectedAgentId}
                trigger={tick}
                gameState={gameState}
                announcement={worldRef.current?.currentAnnouncement || null}
                cameraEvents={cameraEvents}
              />
            </div>
          </div>

          {/* Quick Controls */}
          <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg flex justify-between items-center">
            <div className="flex gap-4 text-xs font-bold text-gray-400">
              <span>TOTAL: {currentAgents.length}</span>
              <span className="text-green-500">ALIVE: {currentAgents.filter(a => a.status === 'ALIVE').length}</span>
              <span className="text-red-500">DEAD: {currentAgents.filter(a => a.status !== 'ALIVE').length}</span>
              <span className="text-cyan-400">TEAMS: {worldRef.current?.alliances.length || 0}</span>
              <span className={LLMService.isDisabled() ? 'text-red-400' : LLMService.hasKey() ? 'text-emerald-400' : 'text-gray-600'}>
                LLM: {LLMService.isDisabled() ? 'QUOTA EXCEEDED' : LLMService.hasKey() ? 'ON' : 'OFF'}
              </span>
            </div>
            {gameState === 'LOBBY' && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleSpawn('MALE')}
                  className="px-3 py-1 bg-blue-900/40 border border-blue-800 text-blue-300 rounded text-xs hover:bg-blue-800/60 transition-colors"
                >
                  + 남성 투입
                </button>
                <button
                  onClick={() => handleSpawn('FEMALE')}
                  className="px-3 py-1 bg-pink-900/40 border border-pink-800 text-pink-300 rounded text-xs hover:bg-pink-800/60 transition-colors"
                >
                  + 여성 투입
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Info & Logs */}
        <div className="lg:col-span-1 space-y-4 flex flex-col h-full">

          {/* Agent Detail */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 min-h-[200px]">
            <h3 className="text-gray-400 mb-4 uppercase tracking-wider text-xs font-bold">Target Analysis</h3>
            {selectedAgent ? (
              <div className="space-y-2">
                <div className="text-xl font-bold flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedAgent.color }} />
                  {selectedAgent.name}
                </div>
                <div className="text-sm text-gray-500 font-mono">ID: {selectedAgent.id}</div>
                <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                  <div className="bg-gray-950 p-2 rounded">
                    <div className="text-gray-600 text-xs">STATE</div>
                    <div className={`${selectedAgent.state === 'FIGHTING' ? 'text-red-400 font-bold' :
                      selectedAgent.state === 'TALKING' ? 'text-blue-400' :
                        'text-gray-300'
                      }`}>
                      {selectedAgent.state}
                    </div>
                  </div>
                  <div className="bg-gray-950 p-2 rounded">
                    <div className="text-gray-600 text-xs">ROLE</div>
                    <div className={selectedAgent.role === 'ZOMBIE' ? 'text-red-400 font-bold' : 'text-green-400'}>
                      {selectedAgent.role}
                    </div>
                  </div>
                  <div className="bg-gray-950 p-2 rounded">
                    <div className="text-gray-600 text-xs">ENERGY</div>
                    <div className="text-yellow-500">{Math.floor(selectedAgent.stats.energy)}%</div>
                  </div>
                  <div className="bg-gray-950 p-2 rounded">
                    <div className="text-gray-600 text-xs">STATUS</div>
                    <div className={selectedAgent.status === 'ALIVE' ? 'text-green-400' : 'text-red-400'}>
                      {selectedAgent.status}
                    </div>
                  </div>
                </div>
                {/* Alliance Info */}
                {selectedAlliance && (
                  <div className="mt-3 p-2 rounded border" style={{ borderColor: selectedAlliance.color + '80', backgroundColor: selectedAlliance.color + '15' }}>
                    <div className="text-xs text-gray-500 mb-1">ALLIANCE</div>
                    <div className="font-bold text-sm" style={{ color: selectedAlliance.color }}>
                      {selectedAlliance.name}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Members: {selectedAlliance.memberIds.length}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-600 italic mt-8 text-center">
                Select a target on the grid to monitor.
              </div>
            )}
          </div>

          {/* Logs */}
          <div className="flex-1 min-h-0">
            <ActivityLog logs={currentLogs} />
          </div>
        </div>
      </div>
    </main>
  );
}
