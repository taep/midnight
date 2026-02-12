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

function getStatusLabel(gs: string | undefined): { text: string; icon: string } {
  switch (gs) {
    case 'LOBBY': return { text: 'STANDBY', icon: '◆' };
    case 'PRE_GAME': return { text: 'PREPARATION', icon: '◈' };
    case 'GAME_INTRO': return { text: 'BRIEFING', icon: '▣' };
    case 'GAME_COUNTDOWN': return { text: 'COMMENCING', icon: '▶' };
    case 'ROUND_ACTIVE': return { text: 'LIVE', icon: '●' };
    case 'ROUND_RESULT': return { text: 'SETTLEMENT', icon: '◇' };
    case 'GAME_OVER': return { text: 'CONCLUDED', icon: '■' };
    default: return { text: 'STANDBY', icon: '◆' };
  }
}

export default function Home() {
  const worldRef = useRef<World | null>(null);
  const mainRef = useRef<HTMLElement>(null);
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

  // Force-reset any scroll drift every tick
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
      // Also reset all scrollable children
      mainRef.current.querySelectorAll('*').forEach(el => {
        if (el.scrollTop > 0 && !el.classList.contains('overflow-y-auto')) {
          (el as HTMLElement).scrollTop = 0;
        }
      });
    }
  });

  const handleSpawn = (gender: 'MALE' | 'FEMALE') => {
    worldRef.current?.spawnAgent(gender);
    setTick(t => t + 1);
  };

  const handleSaveKey = () => {
    LLMService.setApiKey(apiKey);
    setShowSettings(false);
  };

  const currentAgents = worldRef.current?.agents || [];
  const currentLogs = worldRef.current?.logs || [];
  const gameState = worldRef.current?.gameState || 'LOBBY';
  const selectedAgent = currentAgents.find(a => a.id === selectedAgentId);
  const status = getStatusLabel(gameState);
  const aliveCount = currentAgents.filter(a => a.status === 'ALIVE').length;
  const deadCount = currentAgents.filter(a => a.status !== 'ALIVE').length;
  const isLive = gameState === 'ROUND_ACTIVE';

  // Alliance info for selected agent
  const selectedAlliance = selectedAgent?.allianceId
    ? worldRef.current?.alliances.find(al => al.id === selectedAgent.allianceId)
    : null;

  return (
    <main ref={mainRef} className="h-screen bg-[#050508] text-gray-200 flex flex-col overflow-hidden">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-[#0a0a0f] p-6 rounded-lg vip-border-strong w-96 vip-corner">
            <h2 className="text-lg font-bold mb-4 vip-text tracking-wider">SYSTEM CONFIG</h2>
            <div className="mb-4">
              <label className="block text-xs text-[#8a7235] mb-2 tracking-wider">OPENAI API KEY</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-black border border-[#2a2520] rounded p-2 text-white text-sm focus:outline-none focus:border-[#c9a84c]/50"
              />
              <p className="text-xs text-[#4a4035] mt-2">
                API Key 미입력 시 랜덤 대사로 작동합니다.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-[#555] hover:text-white text-sm">
                Cancel
              </button>
              <button onClick={handleSaveKey} className="px-4 py-2 bg-[#1a1810] border border-[#c9a84c]/30 text-[#c9a84c] rounded text-sm hover:bg-[#2a2520]">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === MAIN LAYOUT: TV + Sidebar === */}
      <div className="flex flex-1 min-h-0 gap-8 overflow-hidden" style={{ padding: '5vh 6vw' }}>

        {/* ===== TV MONITOR (main area) ===== */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="tv-frame flex-1 flex flex-col overflow-hidden">
            {/* Top bezel: branding + status */}
            <div className="flex items-center justify-between px-4 py-1.5 bg-[#0e0e0e] border-b border-[#1a1a1a] shrink-0">
              <div className="flex items-center gap-3">
                <div className={`tv-led ${isLive ? 'bg-red-500 text-red-500' : 'bg-emerald-700 text-emerald-700'}`} />
                <span className="text-[9px] font-mono tracking-[0.3em] text-[#444]">
                  MIDNIGHT STATION
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-[9px] font-mono tracking-wider ${isLive ? 'text-red-500/70' : 'text-[#333]'}`}>
                  {status.icon} {status.text}
                </span>
                <span className="text-[9px] font-mono text-[#2a2a2a]">CH-01</span>
              </div>
            </div>

            {/* Screen */}
            <div className="tv-screen flex-1 relative min-h-0 overflow-hidden bg-[#060610]">
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
              {/* TV overlays */}
              <div className="tv-glare" />
              <div className="tv-noise" />
              {/* OSD top-left */}
              <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
                {isLive && <div className="w-1.5 h-1.5 rounded-full bg-red-500 vip-pulse" />}
                <span className="text-[9px] font-mono tracking-widest text-[#3a3a3a]" style={{ textShadow: '0 0 10px rgba(0,0,0,0.8)' }}>
                  {isLive ? 'REC' : 'CAM-01'}
                </span>
              </div>
              {/* OSD top-right */}
              <div className="absolute top-3 right-4 z-10">
                <span suppressHydrationWarning className="text-[9px] font-mono text-[#3a3a3a]" style={{ textShadow: '0 0 10px rgba(0,0,0,0.8)' }}>
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </div>

            {/* Bottom bezel: stats + controls */}
            <div className="flex items-center justify-between px-4 py-1.5 bg-[#0e0e0e] border-t border-[#1a1a1a] shrink-0">
              <div className="flex gap-4 text-[9px] font-mono tracking-wider">
                <span className="text-[#444]">SUBJ <span className="text-[#8a7235]">{currentAgents.length}</span></span>
                <span className="text-[#444]">ALIVE <span className="text-emerald-600">{aliveCount}</span></span>
                <span className="text-[#444]">DEAD <span className="text-red-800">{deadCount}</span></span>
                <span className="text-[#444]">TEAM <span className="text-[#8a7235]">{worldRef.current?.alliances.length || 0}</span></span>
              </div>
              <div className="flex items-center gap-3">
                {gameState === 'LOBBY' && (
                  <>
                    <button
                      onClick={() => handleSpawn('MALE')}
                      className="px-2 py-0.5 text-[9px] font-mono text-blue-400/50 hover:text-blue-300 transition-colors"
                    >
                      [+M]
                    </button>
                    <button
                      onClick={() => handleSpawn('FEMALE')}
                      className="px-2 py-0.5 text-[9px] font-mono text-pink-400/50 hover:text-pink-300 transition-colors"
                    >
                      [+F]
                    </button>
                  </>
                )}
                {gameState !== 'LOBBY' && (
                  <button
                    onClick={() => window.location.reload()}
                    className="px-2 py-0.5 text-[9px] font-mono text-red-600/40 hover:text-red-400 transition-colors"
                  >
                    [RESET]
                  </button>
                )}
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="px-2 py-0.5 text-[9px] font-mono text-[#333] hover:text-[#8a7235] transition-colors"
                >
                  [CFG]
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ===== RIGHT SIDEBAR ===== */}
        <div className="w-[320px] shrink-0 flex flex-col gap-3 min-h-0 overflow-hidden">

          {/* Subject Dossier (compact) */}
          <div className="bg-[#0a0a0f] vip-border rounded-lg p-3 shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-0.5 h-2.5 bg-[#8a7235] rounded-full" />
              <span className="text-[9px] font-mono tracking-[0.2em] text-[#8a7235]">SUBJECT DOSSIER</span>
            </div>
            {selectedAgent ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: selectedAgent.color + '40', borderColor: selectedAgent.color }} />
                  <span className="text-sm font-bold text-white">{selectedAgent.name}</span>
                  <span className="text-[9px] text-[#333] font-mono ml-auto">{selectedAgent.id.slice(0, 8)}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <div className="bg-black/50 px-2 py-1.5 rounded border border-[#1a1a20] text-center">
                    <div className="text-[7px] text-[#4a4035] font-mono">STATE</div>
                    <div className={`text-[10px] font-bold ${
                      selectedAgent.state === 'FIGHTING' ? 'text-red-400' :
                      selectedAgent.state === 'TALKING' ? 'text-blue-400' : 'text-[#8a7235]'
                    }`}>{selectedAgent.state}</div>
                  </div>
                  <div className="bg-black/50 px-2 py-1.5 rounded border border-[#1a1a20] text-center">
                    <div className="text-[7px] text-[#4a4035] font-mono">ROLE</div>
                    <div className={`text-[10px] font-bold ${selectedAgent.role === 'ZOMBIE' ? 'text-red-500' : 'text-emerald-500'}`}>
                      {selectedAgent.role}
                    </div>
                  </div>
                  <div className="bg-black/50 px-2 py-1.5 rounded border border-[#1a1a20] text-center">
                    <div className="text-[7px] text-[#4a4035] font-mono">HP</div>
                    <div className="text-[10px] font-bold text-amber-500">{Math.floor(selectedAgent.stats.energy)}%</div>
                  </div>
                  <div className="bg-black/50 px-2 py-1.5 rounded border border-[#1a1a20] text-center">
                    <div className="text-[7px] text-[#4a4035] font-mono">STATUS</div>
                    <div className={`text-[10px] font-bold ${selectedAgent.status === 'ALIVE' ? 'text-emerald-500' : 'text-red-500'}`}>
                      {selectedAgent.status === 'ALIVE' ? 'ALIVE' : 'DEAD'}
                    </div>
                  </div>
                </div>
                {selectedAlliance && (
                  <div className="flex items-center gap-2 px-2 py-1 rounded bg-black/30 border border-[#1a1a20]">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedAlliance.color }} />
                    <span className="text-[10px] font-bold" style={{ color: selectedAlliance.color }}>{selectedAlliance.name}</span>
                    <span className="text-[9px] text-[#333] font-mono ml-auto">{selectedAlliance.memberIds.length}명</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[#2a2520] text-center py-3">
                <span className="text-[9px] font-mono tracking-wider">SELECT A SUBJECT</span>
              </div>
            )}
          </div>

          {/* Intelligence Feed (fills rest) */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ActivityLog logs={currentLogs} />
          </div>
        </div>
      </div>
    </main>
  );
}
