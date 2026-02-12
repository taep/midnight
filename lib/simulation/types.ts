export type Position = {
    x: number;
    y: number;
};

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'IDLE';

export type AgentState = 'IDLE' | 'MOVING' | 'TALKING' | 'FIGHTING';

export type Gender = 'MALE' | 'FEMALE';

export interface AgentStats {
    health: number;
    social: number;
    energy: number;
}

export interface SimulationConfig {
    width: number;
    height: number;
    tickRate: number;
}

// --- Game Logic Types ---

export type GameState =
    | 'LOBBY'
    | 'PRE_GAME'
    | 'GAME_INTRO'
    | 'GAME_COUNTDOWN'
    | 'ROUND_ACTIVE'
    | 'ROUND_RESULT'
    | 'GAME_OVER';

export type AgentRole = 'HUMAN' | 'ZOMBIE';

export type AgentStatus = 'ALIVE' | 'DEAD' | 'ELIMINATED';

export type AnnouncementStyle = 'SYSTEM' | 'DRAMATIC' | 'COUNTDOWN';

export interface Alliance {
    id: string;
    name: string;
    leaderAgentId: string;
    memberIds: string[];
    color: string;
}

// --- Camera Event System ---

export type CameraEventType = 'ZOOM_TO' | 'SHAKE' | 'SLOW_MO' | 'RESET';

export interface CameraEvent {
    type: CameraEventType;
    targetX?: number;       // grid position
    targetY?: number;       // grid position
    zoom?: number;          // zoom level (1.0 = normal, 2.0 = 2x zoom)
    intensity?: number;     // shake intensity (pixels)
    duration: number;       // in frames (60fps)
    delay?: number;         // delay before starting (frames)
    label?: string;         // optional text overlay (e.g. agent name)
}
