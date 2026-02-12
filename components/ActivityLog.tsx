'use client';

import { LogEntry } from '@/lib/simulation/World';

interface ActivityLogProps {
    logs: LogEntry[];
}

function getLogStyle(type: string) {
    switch (type) {
        case 'FIGHT': return { badge: 'bg-red-900/50 text-red-400', box: 'bg-red-950/20 border-red-900/30 text-red-200', name: 'text-red-300' };
        case 'TALK': return { badge: 'bg-blue-900/50 text-blue-400', box: 'bg-blue-950/20 border-blue-900/30 text-slate-200', name: 'text-blue-300' };
        case 'ALLIANCE': return { badge: 'bg-cyan-900/50 text-cyan-400', box: 'bg-cyan-950/20 border-cyan-900/30 text-cyan-200', name: 'text-cyan-300' };
        default: return { badge: 'bg-slate-800 text-slate-400', box: 'bg-slate-800/50 border-slate-700/50 text-slate-400', name: 'text-slate-300' };
    }
}

export default function ActivityLog({ logs }: ActivityLogProps) {
    return (
        <div className="h-full flex flex-col bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden backdrop-blur-sm">
            <div className="p-3 border-b border-slate-800 bg-slate-900">
                <h3 className="text-sm font-bold text-slate-300 flex justify-between items-center">
                    <span>LIVE LOGS</span>
                    <span className="text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                        {logs.length} events
                    </span>
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {logs.length === 0 && (
                    <div className="text-center text-slate-600 mt-10 text-sm">
                        System initialized. Waiting for agent activity...
                    </div>
                )}

                {logs.map((log) => {
                    const parts = log.message.split(':');
                    const author = parts.length > 1 ? parts[0] : null;
                    const content = parts.length > 1 ? parts.slice(1).join(':') : log.message;
                    const style = getLogStyle(log.type);

                    return (
                        <div key={log.id} className="flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex items-base gap-2">
                                <span className="text-[10px] text-slate-500 font-mono pt-1">
                                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span className={`text-[10px] px-1 rounded font-bold uppercase ${style.badge}`}>
                                    {log.type}
                                </span>
                            </div>

                            <div className={`text-sm p-3 rounded-md border ${style.box}`}>
                                {author ? (
                                    <>
                                        <span className={`${style.name} font-bold`}>
                                            {author}
                                        </span>
                                        <span className={log.type === 'TALK' ? 'text-slate-300' : 'text-slate-400'}>
                                            : {content}
                                        </span>
                                    </>
                                ) : (
                                    content
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
