'use client';

import { LogEntry } from '@/lib/simulation/World';

interface ActivityLogProps {
    logs: LogEntry[];
}

function getLogStyle(type: string) {
    switch (type) {
        case 'FIGHT': return {
            badge: 'bg-red-950/60 text-red-500 border border-red-900/30',
            box: 'border-l-2 border-l-red-800/50 bg-[#0f0808]',
            name: 'text-red-400',
            icon: '✕',
        };
        case 'TALK': return {
            badge: 'bg-blue-950/40 text-blue-400/80 border border-blue-900/20',
            box: 'border-l-2 border-l-blue-900/40 bg-[#08080f]',
            name: 'text-blue-300/80',
            icon: '◈',
        };
        case 'ALLIANCE': return {
            badge: 'bg-cyan-950/40 text-cyan-400/80 border border-cyan-900/20',
            box: 'border-l-2 border-l-cyan-800/40 bg-[#080f0f]',
            name: 'text-cyan-300/80',
            icon: '◆',
        };
        default: return {
            badge: 'bg-[#12100a] text-[#8a7235] border border-[#2a2520]',
            box: 'border-l-2 border-l-[#2a2520] bg-[#0a0a08]',
            name: 'text-[#c9a84c]',
            icon: '▸',
        };
    }
}

function getLogLabel(type: string) {
    switch (type) {
        case 'FIGHT': return 'INCIDENT';
        case 'TALK': return 'INTERCEPT';
        case 'ALLIANCE': return 'FACTION';
        default: return 'SYSTEM';
    }
}

export default function ActivityLog({ logs }: ActivityLogProps) {
    return (
        <div className="h-full flex flex-col bg-[#0a0a0f] vip-border rounded-lg overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-[#1a1815] bg-[#0c0b08]">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-3 bg-[#8a7235] rounded-full" />
                        <span className="text-[10px] font-mono tracking-[0.25em] text-[#8a7235]">INTELLIGENCE FEED</span>
                    </div>
                    <span className="text-[9px] font-mono text-[#3a3530] bg-[#0f0e0a] px-2 py-0.5 rounded border border-[#1a1815]">
                        {logs.length}
                    </span>
                </div>
            </div>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {logs.length === 0 && (
                    <div className="text-center mt-12">
                        <div className="text-[#2a2520] text-lg mb-2">◇</div>
                        <div className="text-[10px] font-mono tracking-wider text-[#2a2520]">
                            AWAITING SIGNAL...
                        </div>
                    </div>
                )}

                {logs.map((log) => {
                    const parts = log.message.split(':');
                    const author = parts.length > 1 ? parts[0] : null;
                    const content = parts.length > 1 ? parts.slice(1).join(':') : log.message;
                    const style = getLogStyle(log.type);
                    const label = getLogLabel(log.type);

                    return (
                        <div key={log.id} className={`log-enter rounded px-3 py-2.5 ${style.box}`}>
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono tracking-wider ${style.badge}`}>
                                    {label}
                                </span>
                                <span suppressHydrationWarning className="text-[9px] text-[#2a2520] font-mono ml-auto">
                                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                            </div>
                            <div className="text-xs leading-relaxed">
                                {author ? (
                                    <>
                                        <span className={`${style.name} font-bold`}>
                                            {author}
                                        </span>
                                        <span className="text-[#6a6560]">
                                            :{content}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-[#6a6560]">{content}</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
