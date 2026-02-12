import { Agent } from './Agent';
import { SimulationConfig, Position, GameState, Alliance, AnnouncementStyle, CameraEvent } from './types';
import { Utils } from './Utils';
import { LLMService } from '@/lib/llm/LLMService';

interface AnnouncementItem {
    text: string;
    duration: number;
    style: AnnouncementStyle;
    onComplete?: () => void;
}

export interface LogEntry {
    id: string;
    tick: number;
    message: string;
    type: 'INFO' | 'TALK' | 'FIGHT' | 'ALLIANCE';
}

const ALLIANCE_COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#A8E6CF', '#FF8A5C'];

export class World {
    config: SimulationConfig;
    agents: Agent[];
    tickCount: number;
    logs: LogEntry[];
    gameState: GameState;
    alliances: Alliance[];
    currentRound: number;

    // Announcement system
    private announcementQueue: AnnouncementItem[];
    currentAnnouncement: { text: string; style: AnnouncementStyle } | null;
    private announcementTimer: number;
    private _currentOnComplete?: () => void;

    // Camera system
    cameraEvents: CameraEvent[];
    slowMotionTicks: number;

    // Timers
    private autoSpawnTimer: number;
    private preGameTimer: number;
    private roundTimer: number;
    private lobbyComplete: boolean;
    private preGameComplete: boolean;

    // Config
    private readonly TARGET_AGENTS = 24;
    private readonly PRE_GAME_DURATION = 75;
    private readonly ROUND_DURATION = 250;

    constructor(config: SimulationConfig) {
        this.config = config;
        this.agents = [];
        this.tickCount = 0;
        this.logs = [];
        this.gameState = 'LOBBY';
        this.alliances = [];
        this.currentRound = 1;

        this.announcementQueue = [];
        this.currentAnnouncement = null;
        this.announcementTimer = 0;

        this.cameraEvents = [];
        this.slowMotionTicks = 0;

        this.autoSpawnTimer = 0;
        this.preGameTimer = 0;
        this.roundTimer = 0;
        this.lobbyComplete = false;
        this.preGameComplete = false;

        this.enqueue('MIDNIGHT STATION에 오신 것을 환영합니다.', 25, 'DRAMATIC');
        this.enqueue('참가자가 모이고 있습니다...', 18, 'SYSTEM');
    }

    spawnAgent(gender: 'MALE' | 'FEMALE') {
        const id = Utils.generateId();
        const name = Utils.getRandomName(gender);
        const pos: Position = {
            x: Math.floor(Math.random() * this.config.width),
            y: Math.floor(Math.random() * this.config.height),
        };
        const agent = new Agent(id, name, gender, pos);
        this.agents.push(agent);
        this.addLog(`${agent.name} 입장.`, 'INFO');
    }

    consumeCameraEvents(): CameraEvent[] {
        const events = this.cameraEvents;
        this.cameraEvents = [];
        return events;
    }

    private emitCamera(event: CameraEvent) {
        this.cameraEvents.push(event);
    }

    tick() {
        if (this.gameState === 'GAME_OVER') return;
        this.tickCount++;
        if (this.slowMotionTicks > 0) this.slowMotionTicks--;
        this.processQueue();

        switch (this.gameState) {
            case 'LOBBY': this.tickLobby(); break;
            case 'PRE_GAME': this.tickPreGame(); break;
            case 'GAME_INTRO':
            case 'GAME_COUNTDOWN':
                break;
            case 'ROUND_ACTIVE': this.tickRoundActive(); break;
            case 'ROUND_RESULT':
                break;
        }
    }

    // === Announcement Queue ===

    private enqueue(text: string, duration: number, style: AnnouncementStyle, onComplete?: () => void) {
        this.announcementQueue.push({ text, duration, style, onComplete });
    }

    private processQueue() {
        if (this.currentAnnouncement) {
            this.announcementTimer--;
            if (this.announcementTimer <= 0) {
                const callback = this._currentOnComplete;
                this.currentAnnouncement = null;
                this._currentOnComplete = undefined;
                callback?.();
            }
        }

        if (!this.currentAnnouncement && this.announcementQueue.length > 0) {
            const item = this.announcementQueue.shift()!;
            this.currentAnnouncement = { text: item.text, style: item.style };
            this.announcementTimer = item.duration;
            this._currentOnComplete = item.onComplete;
        }
    }

    // === State: LOBBY ===

    private tickLobby() {
        this.autoSpawnTimer++;
        if (this.autoSpawnTimer >= 3 && this.agents.length < this.TARGET_AGENTS) {
            this.autoSpawnTimer = 0;
            const gender: 'MALE' | 'FEMALE' = Math.random() < 0.5 ? 'MALE' : 'FEMALE';
            this.spawnAgent(gender);

            if (this.agents.length % 8 === 0 && this.agents.length < this.TARGET_AGENTS) {
                this.enqueue(`참가자 ${this.agents.length}명 도착...`, 12, 'SYSTEM');
            }
        }

        if (this.agents.length >= this.TARGET_AGENTS && !this.lobbyComplete) {
            this.lobbyComplete = true;
            this.enqueue(`참가자 ${this.agents.length}명 전원 도착.`, 20, 'DRAMATIC');
            this.enqueue('곧 게임이 시작됩니다.', 18, 'DRAMATIC', () => {
                this.gameState = 'PRE_GAME';
                this.preGameTimer = this.PRE_GAME_DURATION;
                this.enqueue('자유 시간입니다. 팀을 만들어 전략을 세우세요.', 25, 'SYSTEM');
                this.addLog('=== 자유 시간 시작 ===', 'INFO');
            });
        }

        this.agents.forEach(a => {
            try { a.tick(this.config.width, this.config.height, this.agents, 'LOBBY'); } catch (e) { console.error(e); }
        });
        this.checkInteractions();
        this.proximityDialogue();
    }

    // === State: PRE_GAME ===

    private tickPreGame() {
        this.preGameTimer--;

        this.tryFormAlliances();

        this.agents.forEach(a => {
            try { a.tick(this.config.width, this.config.height, this.agents, 'PRE_GAME'); } catch (e) { console.error(e); }
        });
        this.checkInteractions();
        this.proximityDialogue();

        if (this.preGameTimer <= 0 && !this.preGameComplete) {
            this.preGameComplete = true;
            this.enqueue('자유 시간이 종료됩니다.', 18, 'SYSTEM', () => {
                this.gameState = 'GAME_INTRO';
                this.queueGameIntro();
                this.addLog('=== 게임 발표 ===', 'INFO');
            });
        }
    }

    // === Alliance Formation ===

    private tryFormAlliances() {
        const alive = this.agents.filter(a => a.status === 'ALIVE');

        for (let i = 0; i < alive.length; i++) {
            for (let j = i + 1; j < alive.length; j++) {
                const a1 = alive[i];
                const a2 = alive[j];
                if (a1.allianceId || a2.allianceId) continue;

                const dist = Utils.getDistance(a1.position, a2.position);
                if (dist <= 3 && Math.random() < 0.04) {
                    this.createAlliance(a1, a2);
                }
            }
        }

        for (const agent of alive) {
            if (agent.allianceId) continue;

            for (const alliance of this.alliances) {
                if (alliance.memberIds.length >= 5) continue;

                const members = alive.filter(a => alliance.memberIds.includes(a.id));
                const nearMember = members.find(m =>
                    Utils.getDistance(agent.position, m.position) <= 3
                );

                if (nearMember && Math.random() < 0.03) {
                    alliance.memberIds.push(agent.id);
                    agent.allianceId = alliance.id;
                    agent.allianceColor = alliance.color;
                    this.addLog(`${agent.name}이(가) ${alliance.name}에 합류!`, 'ALLIANCE');
                    break;
                }
            }
        }
    }

    private createAlliance(a1: Agent, a2: Agent) {
        const id = Utils.generateId();
        const color = ALLIANCE_COLORS[this.alliances.length % ALLIANCE_COLORS.length];
        const name = `${a1.name}팀`;

        const alliance: Alliance = {
            id,
            name,
            leaderAgentId: a1.id,
            memberIds: [a1.id, a2.id],
            color,
        };

        this.alliances.push(alliance);
        a1.allianceId = id;
        a1.allianceColor = color;
        a2.allianceId = id;
        a2.allianceColor = color;

        this.addLog(`${a1.name}와 ${a2.name}이(가) 팀 결성! [${name}]`, 'ALLIANCE');
    }

    // === Game Sequences ===

    private queueGameIntro() {
        this.enqueue('첫 번째 게임을 발표합니다.', 20, 'DRAMATIC');
        this.enqueue('게임: 좀비 서바이벌', 25, 'DRAMATIC', () => {
            // Agents react to game announcement
            this.triggerGameReactions();
        });
        this.enqueue('참가자 중 한 명이 감염자로 지정됩니다.', 20, 'SYSTEM');
        this.enqueue('감염자에게 잡히면 탈락입니다.', 20, 'SYSTEM');
        this.enqueue('살아남으세요.', 22, 'DRAMATIC', () => {
            this.gameState = 'GAME_COUNTDOWN';
            this.queueCountdown();
        });
    }

    private triggerGameReactions() {
        const alive = this.agents.filter(a => a.status === 'ALIVE');
        // ~30% of agents react to the announcement
        alive.forEach(a => {
            if (a.messageTimer <= 0 && Math.random() < 0.3) {
                a.say(a.getGameReaction(), 30);
            }
        });
    }

    private queueCountdown() {
        this.enqueue('3', 8, 'COUNTDOWN');
        this.enqueue('2', 8, 'COUNTDOWN');
        this.enqueue('1', 8, 'COUNTDOWN');
        this.enqueue('시작!', 10, 'COUNTDOWN', () => {
            this.startRound();
        });
    }

    private startRound() {
        this.gameState = 'ROUND_ACTIVE';
        this.roundTimer = 0;

        this.agents.forEach(a => {
            if (a.status === 'ALIVE') {
                a.role = 'HUMAN';
                a.updateColor();
            }
        });

        const alive = this.agents.filter(a => a.status === 'ALIVE');
        if (alive.length === 0) return;

        const index = Math.floor(Math.random() * alive.length);
        const patientZero = alive[index];
        patientZero.role = 'ZOMBIE';
        patientZero.updateColor();
        patientZero.say('크르르르...', 30);

        if (patientZero.allianceId) {
            const alliance = this.alliances.find(a => a.id === patientZero.allianceId);
            if (alliance) {
                alliance.memberIds = alliance.memberIds.filter(id => id !== patientZero.id);
            }
            patientZero.allianceId = null;
            patientZero.allianceColor = '';
        }

        // Camera: zoom to patient zero + shake
        this.emitCamera({
            type: 'ZOOM_TO', targetX: patientZero.position.x, targetY: patientZero.position.y,
            zoom: 2.5, duration: 180, label: patientZero.name,
        });
        this.emitCamera({ type: 'SHAKE', intensity: 8, duration: 40, delay: 20 });
        this.emitCamera({ type: 'SLOW_MO', duration: 12 });

        this.enqueue(`${patientZero.name}이(가) 감염되었습니다!`, 20, 'DRAMATIC');
        this.addLog('=== ROUND 1: ZOMBIE SURVIVAL ===', 'INFO');
        this.addLog(`${patientZero.name}이(가) 좀비가 되었습니다!`, 'FIGHT');
    }

    // === State: ROUND_ACTIVE ===

    private tickRoundActive() {
        this.roundTimer++;

        this.agents.forEach(a => {
            try { a.tick(this.config.width, this.config.height, this.agents, 'ROUND_ACTIVE'); } catch (e) { console.error(e); }
        });
        this.checkInteractions();
        this.proximityDialogue();
        this.zombieWarningSystem();

        const humans = this.agents.filter(a => a.role === 'HUMAN' && a.status === 'ALIVE');

        if (humans.length === 0) {
            this.gameState = 'ROUND_RESULT';
            this.queueRoundResult([]);
        } else if (this.roundTimer >= this.ROUND_DURATION) {
            this.gameState = 'ROUND_RESULT';
            this.queueRoundResult(humans);
        }
    }

    private queueRoundResult(survivors: Agent[]) {
        this.enqueue('게임 종료.', 22, 'DRAMATIC');
        this.enqueue(`생존자: ${survivors.length}명 / ${this.TARGET_AGENTS}명`, 25, 'DRAMATIC', () => {
            // Survivors react
            survivors.forEach(s => {
                if (s.messageTimer <= 0 && Math.random() < 0.5) {
                    s.say(s.getVictoryReaction(), 40);
                }
            });
        });

        if (survivors.length > 0) {
            survivors.slice(0, 10).forEach((s, i) => {
                this.enqueue(`${s.name} - 생존`, 12, 'SYSTEM', i < 3 ? () => {
                    this.emitCamera({
                        type: 'ZOOM_TO', targetX: s.position.x, targetY: s.position.y,
                        zoom: 2.0, duration: 70, label: s.name,
                    });
                } : undefined);
            });
            if (survivors.length > 10) {
                this.enqueue(`외 ${survivors.length - 10}명...`, 12, 'SYSTEM');
            }
            this.enqueue('축하합니다.', 20, 'DRAMATIC', () => {
                this.gameState = 'GAME_OVER';
                this.addLog(`=== 게임 종료: ${survivors.length}명 생존 ===`, 'INFO');
            });
        } else {
            this.enqueue('생존자가 없습니다...', 22, 'DRAMATIC', () => {
                this.gameState = 'GAME_OVER';
                this.addLog('=== 게임 종료: 전원 탈락 ===', 'INFO');
            });
        }
    }

    // === Proximity Dialogue (3-tile range, no collision needed) ===

    private proximityDialogue() {
        const alive = this.agents.filter(a => a.status === 'ALIVE' && a.role === 'HUMAN');

        const chance =
            this.gameState === 'LOBBY' ? 0.025 :
            this.gameState === 'PRE_GAME' ? 0.04 :
            this.gameState === 'ROUND_ACTIVE' ? 0.008 : 0;

        if (chance === 0) return;

        // Pick a random pair within range 3
        for (let attempt = 0; attempt < 3; attempt++) {
            if (alive.length < 2) break;
            const i = Math.floor(Math.random() * alive.length);
            let j = Math.floor(Math.random() * alive.length);
            if (i === j) continue;

            const a1 = alive[i];
            const a2 = alive[j];

            if (a1.state === 'TALKING' || a2.state === 'TALKING') continue;
            if (a1.messageTimer > 0 || a2.messageTimer > 0) continue;

            const dist = Utils.getDistance(a1.position, a2.position);
            if (dist > 4) continue;

            // Same alliance gets higher chance
            const sameTeam = a1.allianceId && a1.allianceId === a2.allianceId;
            const finalChance = sameTeam ? chance * 2.5 : chance;

            if (Math.random() < finalChance) {
                this.triggerProximityChat(a1, a2);
                break; // Only one proximity dialogue per tick
            }
        }
    }

    private triggerProximityChat(a1: Agent, a2: Agent) {
        a1.state = 'TALKING';
        a2.state = 'TALKING';

        const sameAlliance = a1.allianceId && a1.allianceId === a2.allianceId;
        const situation = this.buildDialogueSituation(a1, a2);

        if (sameAlliance && this.gameState === 'ROUND_ACTIVE') {
            // Teammates encourage each other during game
            const msg1 = a1.getTeamStrategyLine();
            const msg2 = a2.getTeamStrategyLine();
            a1.say(msg1, 25);
            a2.say(msg2, 25);
            const alliance = this.alliances.find(a => a.id === a1.allianceId);
            this.addLog(`[${alliance?.name}] ${a1.name}: "${msg1}" / ${a2.name}: "${msg2}"`, 'ALLIANCE');
        } else if (LLMService.hasKey()) {
            LLMService.generateDialogue(
                { name: a1.name, gender: a1.gender, traits: a1.traits },
                { name: a2.name },
                situation
            ).then((d: { a: string, b: string }) => {
                a1.say(d.a, 28);
                a2.say(d.b, 28);
                this.addLog(`${a1.name}: "${d.a}" -> ${a2.name}: "${d.b}"`, 'TALK');
            });
        } else {
            if (this.gameState === 'PRE_GAME' && !a1.allianceId && !a2.allianceId) {
                const msg1 = a1.getTeamProposal();
                const msg2 = a2.getTeamResponse();
                a1.say(msg1, 25);
                a2.say(msg2, 25);
                this.addLog(`${a1.name}: "${msg1}" -> ${a2.name}: "${msg2}"`, 'TALK');
            } else {
                const msg1 = a1.getTraitGreeting();
                const msg2 = a2.getTraitReply();
                a1.say(msg1, 25);
                a2.say(msg2, 25);
                this.addLog(`${a1.name}: "${msg1}" -> ${a2.name}: "${msg2}"`, 'TALK');
            }
        }
    }

    // === Zombie Warning System ===

    private zombieWarningSystem() {
        if (this.gameState !== 'ROUND_ACTIVE') return;

        const alive = this.agents.filter(a => a.status === 'ALIVE' && a.role === 'HUMAN');
        const zombies = this.agents.filter(a => a.role === 'ZOMBIE' && a.status === 'ALIVE');

        for (const agent of alive) {
            if (!agent.allianceId || agent.messageTimer > 0) continue;

            // Check if zombie is close (within 5)
            const nearZombie = zombies.find(z => Utils.getDistance(agent.position, z.position) < 5);
            if (!nearZombie) continue;

            // 3% chance to warn allies
            if (Math.random() < 0.03) {
                const allies = alive.filter(a =>
                    a.allianceId === agent.allianceId && a.id !== agent.id && a.messageTimer <= 0
                );
                if (allies.length > 0) {
                    agent.say(agent.getWarningShout(), 20);
                    this.addLog(`[경고] ${agent.name}: "${agent.currentMessage}"`, 'FIGHT');
                }
            }
        }
    }

    // === Death Broadcast System ===

    private broadcastDeath(victim: Agent, killer: Agent) {
        const nearby = this.agents.filter(a =>
            a.status === 'ALIVE' && a.id !== killer.id && a.role === 'HUMAN' &&
            Utils.getDistance(a.position, victim.position) < 6
        );

        // Nearby witnesses react (up to 3)
        let reactCount = 0;
        for (const witness of nearby) {
            if (reactCount >= 3) break;
            if (witness.messageTimer > 0) continue;

            const msg = witness.getDeathReaction(victim.name);
            witness.say(msg, 25);
            reactCount++;
        }

        // Alliance members react regardless of distance
        if (victim.allianceId) {
            const allyMembers = this.agents.filter(a =>
                a.status === 'ALIVE' && a.allianceId === victim.allianceId && a.id !== victim.id
            );
            for (const ally of allyMembers) {
                if (ally.messageTimer > 0) continue;
                const msg = ally.getAllyDeathReaction(victim.name);
                ally.say(msg, 30);
                const alliance = this.alliances.find(al => al.id === victim.allianceId);
                this.addLog(`[${alliance?.name}] ${ally.name}: "${msg}"`, 'ALLIANCE');
            }

            // Remove victim from alliance
            const alliance = this.alliances.find(a => a.id === victim.allianceId);
            if (alliance) {
                alliance.memberIds = alliance.memberIds.filter(id => id !== victim.id);
            }
        }
    }

    // === Build Dialogue Situation Context ===

    private buildDialogueSituation(a1: Agent, a2: Agent): string {
        const parts: string[] = [];

        if (this.gameState === 'LOBBY') {
            parts.push('서바이벌 게임쇼 대기실에서 만남');
            parts.push(`현재 ${this.agents.length}명 대기 중`);
        } else if (this.gameState === 'PRE_GAME') {
            parts.push('게임 시작 전 자유 시간');
            if (a1.allianceId && a1.allianceId === a2.allianceId) {
                const alliance = this.alliances.find(a => a.id === a1.allianceId);
                parts.push(`같은 팀 (${alliance?.name}, ${alliance?.memberIds.length}명)`);
            } else if (!a1.allianceId && !a2.allianceId) {
                parts.push('둘 다 아직 팀이 없는 상태');
            }
            parts.push('곧 위험한 게임이 시작됨');
        } else if (this.gameState === 'ROUND_ACTIVE') {
            parts.push('좀비 서바이벌 게임 진행 중');
            const zombies = this.agents.filter(a => a.role === 'ZOMBIE').length;
            const alive = this.agents.filter(a => a.status === 'ALIVE' && a.role === 'HUMAN').length;
            parts.push(`좀비 ${zombies}마리, 생존자 ${alive}명`);

            const nearestZ1 = this.agents.find(z =>
                z.role === 'ZOMBIE' && z.status === 'ALIVE' &&
                Utils.getDistance(a1.position, z.position) < 8
            );
            if (nearestZ1) parts.push('좀비가 근처에 있어서 위험한 상황');

            if (a1.allianceId && a1.allianceId === a2.allianceId) {
                parts.push('같은 팀원끼리 도망 중');
            }
        }

        return parts.join('. ');
    }

    // === Interactions ===

    private checkInteractions() {
        for (let i = 0; i < this.agents.length; i++) {
            for (let j = i + 1; j < this.agents.length; j++) {
                const a1 = this.agents[i];
                const a2 = this.agents[j];
                if (a1.status !== 'ALIVE' || a2.status !== 'ALIVE') continue;

                const dx = Math.abs(a1.position.x - a2.position.x);
                const dy = Math.abs(a1.position.y - a2.position.y);

                if (dx <= 1 && dy <= 1) {
                    this.handleCollision(a1, a2);
                }
            }
        }
    }

    private handleCollision(a1: Agent, a2: Agent) {
        if (a1.status !== 'ALIVE' || a2.status !== 'ALIVE') return;

        // ZOMBIE KILL (only in ROUND_ACTIVE)
        if (this.gameState === 'ROUND_ACTIVE') {
            if (a1.role === 'ZOMBIE' && a2.role === 'HUMAN') {
                a2.kill();
                this.emitCamera({
                    type: 'ZOOM_TO', targetX: a2.position.x, targetY: a2.position.y,
                    zoom: 2.2, duration: 120, label: a2.name,
                });
                this.emitCamera({ type: 'SHAKE', intensity: 12, duration: 25 });
                this.emitCamera({ type: 'SLOW_MO', duration: 8 });
                this.addLog(`${a2.name}이(가) ${a1.name}에게 잡혔습니다...`, 'FIGHT');
                this.broadcastDeath(a2, a1);
                return;
            }
            if (a2.role === 'ZOMBIE' && a1.role === 'HUMAN') {
                a1.kill();
                this.emitCamera({
                    type: 'ZOOM_TO', targetX: a1.position.x, targetY: a1.position.y,
                    zoom: 2.2, duration: 120, label: a1.name,
                });
                this.emitCamera({ type: 'SHAKE', intensity: 12, duration: 25 });
                this.emitCamera({ type: 'SLOW_MO', duration: 8 });
                this.addLog(`${a1.name}이(가) ${a2.name}에게 잡혔습니다...`, 'FIGHT');
                this.broadcastDeath(a1, a2);
                return;
            }
        }

        // Dialogue
        if (a1.state === 'TALKING' || a2.state === 'TALKING') return;

        // Higher talk chance for allies
        const sameTeam = a1.allianceId && a1.allianceId === a2.allianceId;
        let talkChance: number;
        if (this.gameState === 'PRE_GAME') {
            talkChance = sameTeam ? 0.35 : 0.25;
        } else if (this.gameState === 'ROUND_ACTIVE') {
            talkChance = sameTeam ? 0.15 : 0.06;
        } else {
            talkChance = 0.15;
        }

        if (Math.random() < talkChance) {
            a1.state = 'TALKING';
            a2.state = 'TALKING';

            const situation = this.buildDialogueSituation(a1, a2);

            if (this.gameState === 'PRE_GAME') {
                this.handlePreGameDialogue(a1, a2, situation);
            } else if (LLMService.hasKey()) {
                LLMService.generateDialogue(
                    { name: a1.name, gender: a1.gender, traits: a1.traits },
                    { name: a2.name },
                    situation
                ).then((d: { a: string, b: string }) => {
                    a1.say(d.a, 30);
                    a2.say(d.b, 30);
                    this.addLog(`${a1.name}: "${d.a}" -> ${a2.name}: "${d.b}"`, 'TALK');
                });
            } else {
                const msg1 = a1.getTraitGreeting();
                const msg2 = a2.getTraitReply();
                a1.say(msg1, 25);
                a2.say(msg2, 25);
                this.addLog(`${a1.name}: "${msg1}" -> ${a2.name}: "${msg2}"`, 'TALK');
            }
        }
    }

    private handlePreGameDialogue(a1: Agent, a2: Agent, situation: string) {
        const bothNoAlliance = !a1.allianceId && !a2.allianceId;
        const sameAlliance = a1.allianceId && a1.allianceId === a2.allianceId;

        if (bothNoAlliance) {
            if (LLMService.hasKey()) {
                LLMService.generateDialogue(
                    { name: a1.name, gender: a1.gender, traits: a1.traits },
                    { name: a2.name },
                    situation + '. 팀을 만들까 고민 중'
                ).then((d: { a: string, b: string }) => {
                    a1.say(d.a, 25);
                    a2.say(d.b, 25);
                    this.addLog(`${a1.name}: "${d.a}" -> ${a2.name}: "${d.b}"`, 'TALK');
                });
            } else {
                const msg1 = a1.getTeamProposal();
                const msg2 = a2.getTeamResponse();
                a1.say(msg1, 25);
                a2.say(msg2, 25);
                this.addLog(`${a1.name}: "${msg1}" -> ${a2.name}: "${msg2}"`, 'TALK');
            }
        } else if (sameAlliance) {
            if (LLMService.hasKey()) {
                LLMService.generateDialogue(
                    { name: a1.name, gender: a1.gender, traits: a1.traits },
                    { name: a2.name },
                    situation + '. 같은 팀원끼리 전략 회의 중'
                ).then((d: { a: string, b: string }) => {
                    a1.say(d.a, 25);
                    a2.say(d.b, 25);
                    const alliance = this.alliances.find(a => a.id === a1.allianceId);
                    this.addLog(`[${alliance?.name}] ${a1.name}: "${d.a}" / ${a2.name}: "${d.b}"`, 'ALLIANCE');
                });
            } else {
                const alliance = this.alliances.find(a => a.id === a1.allianceId);
                const msg1 = a1.getTeamStrategyLine();
                const msg2 = a2.getTeamStrategyLine();
                a1.say(msg1, 25);
                a2.say(msg2, 25);
                this.addLog(`[${alliance?.name}] ${a1.name}: "${msg1}"`, 'ALLIANCE');
            }
        } else {
            if (LLMService.hasKey()) {
                LLMService.generateDialogue(
                    { name: a1.name, gender: a1.gender, traits: a1.traits },
                    { name: a2.name },
                    situation
                ).then((d: { a: string, b: string }) => {
                    a1.say(d.a, 25);
                    a2.say(d.b, 25);
                    this.addLog(`${a1.name}: "${d.a}" -> ${a2.name}: "${d.b}"`, 'TALK');
                });
            } else {
                const msg1 = a1.getTraitGreeting();
                const msg2 = a2.getTraitReply();
                a1.say(msg1, 25);
                a2.say(msg2, 25);
                this.addLog(`${a1.name}: "${msg1}" -> ${a2.name}: "${msg2}"`, 'TALK');
            }
        }
    }

    // === Logging ===

    private addLog(message: string, type: 'INFO' | 'TALK' | 'FIGHT' | 'ALLIANCE') {
        this.logs.unshift({
            id: Utils.generateId(),
            tick: this.tickCount,
            message,
            type
        });
        if (this.logs.length > 50) this.logs.pop();
    }
}
