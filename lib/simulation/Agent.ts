import { Utils } from './Utils';
import { AgentState, AgentStats, Gender, Position, Direction, AgentRole, AgentStatus, GameState } from './types';
import { LLMService } from '@/lib/llm/LLMService';

export type SurvivalBehavior = 'STRATEGIC' | 'PANIC' | 'HIDE' | 'GIVE_UP';

export class Agent {
    id: string;
    name: string;
    gender: Gender;
    position: Position;
    state: AgentState;
    stats: AgentStats;
    direction: Direction;
    color: string = '';
    traits: string[] = [];

    // Game Props
    role: AgentRole;
    status: AgentStatus;
    killCooldown: number;

    // Message system
    currentMessage: string | null;
    messageTimer: number;

    // Smooth rendering
    renderX: number;
    renderY: number;

    // Survival AI
    survivalBehavior: SurvivalBehavior;

    // Alliance
    allianceId: string | null = null;
    allianceColor: string = '';

    constructor(id: string, name: string, gender: Gender, startPos: Position) {
        this.id = id;
        this.gender = gender;
        this.position = startPos;
        this.state = 'IDLE';
        this.direction = 'IDLE';
        this.currentMessage = null;
        this.messageTimer = 0;

        this.renderX = startPos.x;
        this.renderY = startPos.y;

        this.stats = {
            health: 100,
            social: 50 + Math.random() * 50,
            energy: 80 + Math.random() * 20,
        };

        this.role = 'HUMAN';
        this.status = 'ALIVE';
        this.killCooldown = 0;

        // Assign traits first (before name prefix)
        const traitPool = ['소심함', '다혈질', '낙천적', '염세적', '수다쟁이', '과묵함', '4차원'];
        this.traits = [
            traitPool[Math.floor(Math.random() * traitPool.length)],
            traitPool[Math.floor(Math.random() * traitPool.length)]
        ];

        // Name with personality prefix (소심윤우, 폭력지우 등)
        const prefix = Utils.getTraitPrefix(this.traits[0]);
        this.name = prefix + name;

        this.survivalBehavior = this.decideSurvivalBehavior();
        this.updateColor();
    }

    private decideSurvivalBehavior(): SurvivalBehavior {
        if (this.traits.includes('과묵함')) return 'HIDE';
        if (this.traits.includes('염세적')) return 'GIVE_UP';
        if (this.traits.includes('소심함') || this.traits.includes('수다쟁이')) return 'PANIC';
        if (this.traits.includes('낙천적') || this.traits.includes('다혈질')) return 'STRATEGIC';
        if (this.traits.includes('4차원')) return Math.random() < 0.5 ? 'HIDE' : 'PANIC';
        return 'PANIC';
    }

    async tick(worldWidth: number, worldHeight: number, others: Agent[], gamePhase: GameState = 'LOBBY') {
        if (this.status !== 'ALIVE') return;

        // Decrease message timer
        if (this.messageTimer > 0) {
            this.messageTimer--;
            if (this.messageTimer <= 0) {
                this.currentMessage = null;
                this.state = 'IDLE';
            }
        }

        if (this.state === 'FIGHTING') {
            if (this.messageTimer <= 0) this.state = 'IDLE';
            return;
        }

        // Zombie periodic sounds
        if (this.role === 'ZOMBIE') {
            if (this.messageTimer <= 0 && Math.random() < 0.08) {
                const zombieSounds = ['크르르...', '으르르...', '끄아아...', '크크크...', '으아아...', '카악...', '흐르르...', '크...르...'];
                this.say(zombieSounds[Math.floor(Math.random() * zombieSounds.length)], 20);
            }
            const action = this.decideAction(others);
            if (action === 'MOVE') this.move(worldWidth, worldHeight, others);
            return;
        }

        // Survival thoughts when zombies are nearby (frequency varies by behavior)
        if (this.role === 'HUMAN' && this.messageTimer <= 0 && gamePhase === 'ROUND_ACTIVE') {
            const nearestZombie = this.findNearest(others, 'ZOMBIE');
            if (nearestZombie) {
                const dist = Utils.getDistance(this.position, nearestZombie.position);
                const thoughtChance =
                    this.survivalBehavior === 'PANIC' ? 0.09 :
                    this.survivalBehavior === 'STRATEGIC' ? 0.07 :
                    this.survivalBehavior === 'GIVE_UP' ? 0.05 : 0.03;
                if (dist < 12 && Math.random() < thoughtChance) {
                    this.say(this.getSurvivalThought(), 25);
                }
            }
        }

        // Phase-aware autonomous thoughts
        if (this.state === 'IDLE' && this.messageTimer <= 0) {
            const thoughtChance =
                gamePhase === 'LOBBY' ? 0.07 :
                gamePhase === 'PRE_GAME' ? 0.05 :
                gamePhase === 'ROUND_ACTIVE' ? 0.03 : 0;

            if (Math.random() < thoughtChance) {
                const context = this.buildThoughtContext(others, gamePhase);
                if (LLMService.hasKey()) {
                    LLMService.generateThinking(this.name, this.gender, this.traits, context).then((msg: string) => {
                        if (this.state === 'IDLE') this.say(msg, 35);
                    });
                } else {
                    this.say(this.getPhaseThought(gamePhase, others), 35);
                }
            }
        }

        const action = this.decideAction(others);

        if (action === 'MOVE') {
            this.move(worldWidth, worldHeight, others);
        }
    }

    private buildThoughtContext(others: Agent[], phase: GameState): string {
        if (phase === 'LOBBY') {
            return `서바이벌 게임쇼 대기실. ${others.filter(o => o.status === 'ALIVE').length}명이 모여있다. 아직 게임 시작 전`;
        }
        if (phase === 'PRE_GAME') {
            const hasTeam = !!this.allianceId;
            const allyCount = hasTeam ? others.filter(o => o.allianceId === this.allianceId && o.id !== this.id).length : 0;
            return hasTeam
                ? `자유 시간. ${allyCount}명의 팀원과 함께. 곧 게임 시작`
                : '자유 시간. 아직 팀이 없다. 곧 위험한 게임이 시작된다';
        }
        if (phase === 'ROUND_ACTIVE') {
            const zombie = this.findNearest(others, 'ZOMBIE');
            const zombieDist = zombie ? Math.floor(Utils.getDistance(this.position, zombie.position)) : 99;
            const hasTeam = !!this.allianceId;
            const aliveAllies = hasTeam ? others.filter(o => o.allianceId === this.allianceId && o.status === 'ALIVE' && o.id !== this.id).length : 0;
            return `좀비 게임 중. 가장 가까운 좀비 ${zombieDist}칸. ${hasTeam ? `팀원 ${aliveAllies}명 생존` : '혼자 도망 중'}`;
        }
        return '';
    }

    private getPhaseThought(phase: GameState, others: Agent[]): string {
        if (phase === 'LOBBY') return this.getLobbyThought();
        if (phase === 'PRE_GAME') return this.getPreGameThought(others);
        if (phase === 'ROUND_ACTIVE') return this.getRoundThought(others);
        return Utils.getRandomThough();
    }

    say(message: string, duration: number = 40) {
        this.currentMessage = message;
        this.messageTimer = duration;
    }

    private decideAction(others: Agent[]): 'MOVE' | 'IDLE' {
        if (this.role === 'ZOMBIE') {
            return 'MOVE';
        }

        const nearestZombie = this.findNearest(others, 'ZOMBIE');
        if (nearestZombie) {
            const dist = Utils.getDistance(this.position, nearestZombie.position);

            if (dist < 8) {
                switch (this.survivalBehavior) {
                    case 'STRATEGIC':
                    case 'PANIC':
                        return 'MOVE';
                    case 'HIDE':
                        return dist < 5 ? 'MOVE' : 'IDLE';
                    case 'GIVE_UP':
                        return dist < 3 ? 'MOVE' : 'IDLE';
                }
            }
        }

        if (this.stats.energy < 10) {
            this.stats.energy += 5;
            return 'IDLE';
        }

        if (Math.random() < 0.2) return 'IDLE';
        return 'MOVE';
    }

    private move(width: number, height: number, others: Agent[]) {
        let bestDir: Direction = 'IDLE';

        if (this.role === 'ZOMBIE') {
            const target = this.findNearest(others, 'HUMAN');
            if (target) {
                bestDir = this.getDirectionTowards(target.position);
            } else {
                bestDir = this.getRandomDirection();
            }
        } else {
            const zombie = this.findNearest(others, 'ZOMBIE');
            const zombieDist = zombie ? Utils.getDistance(this.position, zombie.position) : Infinity;

            if (zombie && zombieDist < 8) {
                switch (this.survivalBehavior) {
                    case 'STRATEGIC':
                        bestDir = this.getStrategicEscape(others, width, height);
                        break;
                    case 'PANIC':
                        bestDir = this.getPanicDirection(zombie.position);
                        break;
                    case 'HIDE':
                        bestDir = this.getDirectionAway(zombie.position);
                        break;
                    case 'GIVE_UP':
                        bestDir = zombieDist < 3 ? this.getDirectionAway(zombie.position) : 'IDLE';
                        break;
                }
            } else {
                if (this.direction === 'IDLE' || Math.random() < 0.2) {
                    bestDir = this.getRandomDirection();
                } else {
                    bestDir = this.direction;
                }
            }

            // Alliance: stay near team members
            if (this.allianceId) {
                const allies = others.filter(o =>
                    o.allianceId === this.allianceId && o.status === 'ALIVE' && o.id !== this.id
                );
                if (allies.length > 0) {
                    let cx = 0, cy = 0;
                    allies.forEach(a => { cx += a.position.x; cy += a.position.y; });
                    cx /= allies.length; cy /= allies.length;
                    const allyDist = Utils.getDistance(this.position, { x: cx, y: cy });

                    if (zombie && zombieDist < 8) {
                        // In danger: only regroup if allies are in safer direction
                        const allyToZombie = Utils.getDistance({ x: cx, y: cy }, zombie.position);
                        if (allyDist > 6 && allyToZombie > zombieDist) {
                            bestDir = this.getDirectionTowards({ x: cx, y: cy });
                        }
                    } else if (allyDist > 5) {
                        // Safe: regroup with team
                        bestDir = this.getDirectionTowards({ x: cx, y: cy });
                    }
                }
            }
        }

        this.direction = bestDir;

        let newX = this.position.x;
        let newY = this.position.y;

        if (this.direction === 'UP') newY--;
        if (this.direction === 'DOWN') newY++;
        if (this.direction === 'LEFT') newX--;
        if (this.direction === 'RIGHT') newX++;

        if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
            this.position = { x: newX, y: newY };
            this.stats.energy -= 0.5;
        } else {
            this.direction = this.getRandomDirection();
        }
    }

    private getStrategicEscape(others: Agent[], _width: number, _height: number): Direction {
        const zombies = others.filter(o => o.role === 'ZOMBIE' && o.status === 'ALIVE');
        if (zombies.length === 0) return this.getRandomDirection();

        // Move away from center of mass of all zombies
        let avgX = 0, avgY = 0;
        zombies.forEach(z => { avgX += z.position.x; avgY += z.position.y; });
        avgX /= zombies.length;
        avgY /= zombies.length;

        // 10% chance to feint (perpendicular movement to confuse)
        if (Math.random() < 0.1) {
            const awayDir = this.getDirectionAway({ x: avgX, y: avgY });
            if (awayDir === 'UP' || awayDir === 'DOWN') {
                return Math.random() < 0.5 ? 'LEFT' : 'RIGHT';
            } else {
                return Math.random() < 0.5 ? 'UP' : 'DOWN';
            }
        }

        return this.getDirectionAway({ x: avgX, y: avgY });
    }

    private getPanicDirection(zombiePos: Position): Direction {
        // 30% random direction (panicking, erratic)
        if (Math.random() < 0.3) {
            return this.getRandomDirection();
        }
        return this.getDirectionAway(zombiePos);
    }

    private getSurvivalThought(): string {
        const thoughts: Record<SurvivalBehavior, string[]> = {
            STRATEGIC: [
                '저쪽이 안전해 보여...',
                '침착하게... 패턴을 읽어',
                '경로를 바꿔야겠어',
                '벽 쪽으로 몰리면 안 돼',
                '빠져나갈 수 있어',
                '좀비 속도를 생각하면... 왼쪽이다',
                '3시 방향으로 빠지자',
                '지그재그로 움직여야 해',
                '좁은 곳은 위험해. 넓은 쪽으로',
                '여기서 직진하면 걸려... 돌아가자',
                '다른 사람 근처는 위험해',
                '타이밍 맞춰서... 지금!',
                '한 놈만 따돌리면 돼',
                '저기 빈 공간이 보여',
                '뒤를 보여주면 안 돼... 측면으로',
                '거리를 벌려야 해',
                '합류하면 더 위험해. 흩어지자',
                '속도 계산... 7초 여유 있어',
                '페이크 넣고 반대로!',
                '일단 시야 밖으로 빠지자',
            ],
            PANIC: [
                '으아아아악!!!',
                '살려줘!! 누구 없어?!',
                '오지마 오지마 오지마!!',
                '왜 나한테 와!!!',
                '도망쳐!!!',
                '싫어어어!!',
                '다리가 떨려...',
                '죽고 싶지 않아!!!',
                '제발!!! 저리 가!!',
                '뛰어!! 무조건 뛰어!!',
                '어디로 가지?! 어디로?!',
                '심장이 터질 것 같아!',
                '안 돼 안 돼!!',
                '빨리!! 빨리빨리!!',
                '잡히면 끝이야!!',
                '헉헉... 숨이...!!',
                '무서워!!!',
                '누가 좀 도와줘!!',
            ],
            HIDE: [
                '...조용히 해야 해',
                '움직이면 들켜',
                '숨 참자...',
                '여기서 안 보이겠지...',
                '제발 이쪽으로 오지 마...',
                '소리 내면 안 돼...',
                '......',
                '가만히... 가만히...',
                '눈 마주치면 안 돼',
                '저기 숨을 곳이...',
                '...나를 못 봤으면',
                '심장 소리가 너무 커...',
                '...제발',
                '이 자리에서 움직이지 말자',
                '지나갈 때까지만...',
            ],
            GIVE_UP: [
                '...더 이상 못 뛰겠어',
                '어차피 다 끝났어',
                '포기하면 편해...',
                '뛰어봤자 의미 없어',
                '...피곤해',
                '다리에 힘이 없어...',
                '...됐다 그냥',
                '어차피 여기서 끝이야',
                '...이게 운명인가',
                '그냥 받아들이자...',
                '아무도 못 살아남아...',
                '...왜 뛰는 거지',
                '눈 감으면 끝이야...',
                '...힘들다',
                '도망쳐봤자 뭐...',
            ],
        };

        const pool = thoughts[this.survivalBehavior];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    getTraitGreeting(): string {
        const greetings: Record<string, string[]> = {
            '소심함': ['아... 안녕...', '저기... 말 걸어도 돼?', '혹시... 나 보여?', '안녕... 하하...', '어... 그... 반가워...'],
            '다혈질': ['야! 너 뭐야!', '어이! 거기!', '뭘 봐!', '오! 왔어?!', '야 같이 다니자!'],
            '낙천적': ['안녕~ 좋은 날이다!', '오~ 반갑다!', '헤이~ 기분 좋아!', '우와 사람이다~!', '하이하이~!'],
            '염세적': ['...또 만났네', '뭐... 안녕', '살아있었구나...', '...어', '...만나서 뭐가 달라지나'],
            '수다쟁이': ['안녕안녕! 나 할 말 많아!', '오! 드디어 사람! 있잖아~', '너 여기서 뭐 해? 나는~', '반가워! 심심했어!', '야 야 잠깐만! 나 좀 들어봐!'],
            '과묵함': ['...', '어.', '응.', '...안녕', '......반가워'],
            '4차원': ['우주에서 왔어?', '넌 NPC야 진짜야?', '여기 중력 이상해', '꿈인가...?', '너 전생에 고양이였지?'],
        };
        const pool = greetings[this.traits[0]] || ['안녕!'];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    getTraitReply(): string {
        const replies: Record<string, string[]> = {
            '소심함': ['아... 그래...', '응... 맞아...', '그런가...', '아 네...', '...어 응...'],
            '다혈질': ['그래서?!', '알았어 알았어!', '시끄러!', 'ㅋㅋ 뭐래', '아 몰라!'],
            '낙천적': ['좋아좋아~', '그거 재밌다!', '맞아 맞아! ㅎㅎ', '오~ 좋은데?', '완전 공감~!'],
            '염세적': ['...그래서 뭐', '의미 없어...', '...그렇겠지', '뭐... 그래', '...알았어 됐어'],
            '수다쟁이': ['맞아맞아! 그리고 있잖아~', '어어 그래서 나도~', '진짜?! 나도!', '그거 알아?!', '아 맞다 그러고보니!'],
            '과묵함': ['...응', '...', '그래.', '...알겠어', '......'],
            '4차원': ['그건 4차원에서 온 신호야', '보이지? 저 빛!', '시간이 멈춘 것 같아', '...뭐라고?', '아 그거 전생의 기억이야'],
        };
        const pool = replies[this.traits[0]] || ['응!'];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    getTeamProposal(): string {
        const proposals: Record<string, string[]> = {
            '소심함': ['저기... 같이 다닐래...?', '혼자는 무서운데...', '나... 팀 좀...', '같이 있으면 안 무서울까...'],
            '다혈질': ['야! 나랑 팀하자!', '내가 앞장설게!', '같이 가면 이긴다!', '뭉쳐야 산다!'],
            '낙천적': ['우리 힘 합치자~!', '같이 하면 재밌겠다!', '팀하자 팀~!', '셋이면 더 좋겠다!'],
            '염세적': ['...팀? 의미 없을 것 같은데', '어차피 다 죽는데... 뭐', '...같이 가든가', '상관없어...'],
            '수다쟁이': ['야야 팀 만들자! 작전도 짜고!', '나 혼자 있으면 못 참아! 같이 다니자!', '있잖아 팀으로 뭉치면~', '우리 팀하면 진짜 잘 될 거야!'],
            '과묵함': ['...같이 가자.', '...팀.', '...옆에 있을게.', '......(고개 끄덕)'],
            '4차원': ['운명적 만남이야!', '전생에 우리 팀이었어', '별자리가 맞아!', '우주가 연결해줬어'],
        };
        const pool = proposals[this.traits[0]] || ['팀하자!'];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    getTeamResponse(): string {
        const responses: Record<string, string[]> = {
            '소심함': ['어... 응 좋아...', '정말? 고마워...', '그래... 같이 가자...', '...으응'],
            '다혈질': ['좋아! 가자!', '오케이! 따라와!', '콜!', '당연하지!'],
            '낙천적': ['좋아좋아~!', '완전 찬성!', '최고다~!', '같이 하자!'],
            '염세적': ['...뭐 상관없어', '...알았어', '어차피...', '...좋을 게 뭐가 있어'],
            '수다쟁이': ['오 좋아! 그러면 작전은~', '찬성! 있잖아 나 아이디어 있어!', '당근이지! 그리고~', '완전 좋아! 근데 있잖아~'],
            '과묵함': ['...응.', '...좋아.', '(고개 끄덕)', '...'],
            '4차원': ['그래 이건 운명이야', '우주의 뜻이지', '3차원 동맹!', '꿈에서 봤어'],
        };
        const pool = responses[this.traits[0]] || ['응!'];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    getTeamStrategyLine(): string {
        const strategies: Record<string, string[]> = {
            '소심함': ['우리 뒤쪽으로 가자...', '앞에 나서기 싫어...', '조용히 가자...', '무서워... 꼭 붙어있자'],
            '다혈질': ['내가 앞에 설게!', '겁먹지 마!', '돌파하자!', '따라와! 빨리!'],
            '낙천적': ['괜찮아 잘 될 거야~', '우리 팀이 최고야!', '힘내자~!', '같이 있으니 든든해!'],
            '염세적': ['...살 수 있을까', '작전 짜봤자...', '누가 먼저 잡히려나', '...기대 안 해'],
            '수다쟁이': ['있잖아 내 작전은~', '들어봐! 이쪽으로 가면~', '아 그리고 저쪽은~', '내가 봤는데 저기가~'],
            '과묵함': ['...이쪽.', '...가자.', '(손가락으로 가리킴)', '...조용히'],
            '4차원': ['별이 저쪽을 가리켜', '4차원 루트로 가자', '이건 시뮬레이션이야', '텔레파시 보낼게'],
        };
        const pool = strategies[this.traits[0]] || ['작전 짜자!'];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // === Phase-specific autonomous thoughts ===

    private getLobbyThought(): string {
        const thoughts: Record<string, string[]> = {
            '소심함': ['여기 어디지...', '사람이 너무 많아...', '불안해...', '나 여기 왜 온 거지...', '아무도 날 안 건드렸으면...'],
            '다혈질': ['빨리 시작하자!', '누가 한번 덤벼봐!', '자신 있어!', '내가 1등 할 거야!', '지루해 죽겠네!'],
            '낙천적': ['오~ 재밌겠다!', '사람 많다 신난다~', '좋은 예감이야!', '다들 좋은 사람 같아~', '설레는데?!'],
            '염세적': ['...또 이런 짓을', '어차피 안 좋은 일이겠지', '다 끝나면 좋겠다...', '...살아서 나갈 수 있으려나', '의미 없는 게임이겠지...'],
            '수다쟁이': ['와 사람 엄청 많다!', '저 사람은 누구지?!', '빨리 누구한테 말 걸어야지!', '심심해 죽겠어!!', '있잖아 나 너무 떨려!'],
            '과묵함': ['......', '...둘러본다', '...조용히 관찰', '(주변을 살핌)', '...'],
            '4차원': ['여기 평행세계인가?', '데자뷰... 전에 왔었나?', '공기가 이상해', '시뮬레이션 냄새가 나', '별이 세 개 보여...'],
        };
        const pool = thoughts[this.traits[0]] || ['...'];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    private getPreGameThought(others: Agent[]): string {
        const hasTeam = !!this.allianceId;
        const allyCount = hasTeam ? others.filter(o => o.allianceId === this.allianceId && o.status === 'ALIVE' && o.id !== this.id).length : 0;

        if (hasTeam) {
            const teamThoughts: Record<string, string[]> = {
                '소심함': [`${allyCount}명이면 괜찮겠지...?`, '팀이 있어서 다행이야...', '이 팀 믿어도 되려나...', '혼자가 아니라 다행...'],
                '다혈질': ['우리 팀이 최강이다!', `${allyCount}명이면 충분해!`, '다 쓸어버리자!', '내가 다 지켜줄게!'],
                '낙천적': ['팀원들 다 좋은 사람이야~', '우리가 이길 거야!', '같이 하니까 든든해~', '최고의 팀이야!'],
                '염세적': ['이 팀도 결국...', '누가 먼저 배신하려나', '...기대는 안 해', '같이 죽는 건가...'],
                '수다쟁이': ['우리 팀 작전 더 짜야 돼!', '있잖아 나 아이디어 있어!', '팀원들이랑 더 얘기해야지!', '다들 준비됐어?!'],
                '과묵함': ['...팀. 좋아.', '(팀원을 바라봄)', '...믿는다', '...'],
                '4차원': ['이 팀은 전생의 인연이야', '팀 오라가 보여...', '우주가 이 팀을 원해', '운명의 동지들...'],
            };
            const pool = teamThoughts[this.traits[0]] || ['팀이 있어서 다행이야'];
            return pool[Math.floor(Math.random() * pool.length)];
        } else {
            const soloThoughts: Record<string, string[]> = {
                '소심함': ['나만 팀이 없어...', '아무도 안 받아줄 거야...', '혼자 어떡하지...', '말 걸 용기가 없어...'],
                '다혈질': ['팀? 혼자서도 충분해!', '누가 날 필요로 하겠지!', '나한테 오라고!', '쫄보들만 팀 만들어!'],
                '낙천적': ['금방 팀 생길 거야~', '누구든 환영이야!', '혼자도 괜찮아~', '인연은 만들어가는 거지!'],
                '염세적': ['어차피 혼자 죽어...', '팀이 있으면 뭐가 달라...', '...상관없어', '혼자가 편해...'],
                '수다쟁이': ['빨리 팀 만들어야 해!', '저 사람한테 말 걸까?!', '나 혼자 있기 싫은데!', '팀! 팀 구해요!!'],
                '과묵함': ['...혼자도 괜찮아', '...굳이', '(멀리서 관찰)', '...'],
                '4차원': ['운명의 동료가 올 거야', '별이 아직 방향을 안 알려줘', '혼자도 4차원이면 돼', '인연의 실이 보여...'],
            };
            const pool = soloThoughts[this.traits[0]] || ['팀이 없네...'];
            return pool[Math.floor(Math.random() * pool.length)];
        }
    }

    private getRoundThought(others: Agent[]): string {
        const hasTeam = !!this.allianceId;
        const aliveAllies = hasTeam ? others.filter(o => o.allianceId === this.allianceId && o.status === 'ALIVE' && o.id !== this.id).length : 0;

        if (hasTeam && aliveAllies > 0) {
            const teamRound: Record<string, string[]> = {
                '소심함': ['팀원들 다 무사한 거지...?', '떨어지면 안 돼...', '같이 있어야 해...', '다들 살아있지...?'],
                '다혈질': ['다 따라와! 내가 길 열어!', '흩어지지 마!', '내 뒤에 붙어!', '포기하는 놈 없어?!'],
                '낙천적': ['같이 있으면 괜찮아!', '우리 잘하고 있어~!', '조금만 더 버티자!', '팀워크 최고야!'],
                '염세적': ['이 팀도 언제까지...', '한 명씩 잡히겠지...', '...누가 먼저일까', '결국 혼자 남겠지...'],
                '수다쟁이': ['야 저쪽으로 가자!', '있잖아 좀비가 3시에!', '다들 이쪽이야!', '빨리 빨리!'],
                '과묵함': ['...이쪽. 가자.', '(손짓)', '...빨리', '...따라와'],
                '4차원': ['4차원 통로가 보여...', '팀 오라가 약해지고 있어', '저 좀비 전생에 친구야...', '우주가 우리 편이야'],
            };
            const pool = teamRound[this.traits[0]] || ['팀원들...!'];
            return pool[Math.floor(Math.random() * pool.length)];
        } else {
            // Solo during round — use existing getSurvivalThought
            return this.getSurvivalThought();
        }
    }

    getGameReaction(): string {
        const reactions: Record<string, string[]> = {
            '소심함': ['좀비...? 싫어...', '으... 무서워...', '나 못할 것 같아...', '왜 하필 좀비야...'],
            '다혈질': ['좀비?! 재밌겠네!', '오 드디어!', '한번 해보자!', '좀비 따위!'],
            '낙천적': ['좀비래! 재밌겠다~', '오 스릴 있는데?', '괜찮아 살아남을 수 있어!', '게임이다~!'],
            '염세적': ['...끝났다', '어차피 다 잡힐 텐데', '좀비라... 예상했어', '...시작도 전에 결과가 보여'],
            '수다쟁이': ['좀비?! 대박!!', '어떡해어떡해!!', '야 들었어?! 좀비래!!', '작전 빨리 짜야 돼!!'],
            '과묵함': ['...좀비.', '(표정이 굳어짐)', '...알겠어', '......'],
            '4차원': ['좀비는 4차원에서 온 존재야', '전생에 좀비였던 적 있어', '흥미로운 시뮬레이션이야', '좀비 주파수가 느껴져...'],
        };
        const pool = reactions[this.traits[0]] || ['...!'];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    getDeathReaction(victimName: string): string {
        const reactions: Record<string, string[]> = {
            '소심함': [`${victimName}...?! 으아...`, '저 사람이...!', '안 돼...!!', '무서워...!!'],
            '다혈질': [`${victimName}!! 젠장!`, '이런...!', '도망쳐!!', '다음은 없어!'],
            '낙천적': [`${victimName}...!`, '거짓말...!', '우리는 살아야 해!', '힘내자...!'],
            '염세적': ['...또 한 명', '예상했어...', `...${victimName}도`, '다음은 나겠지...'],
            '수다쟁이': [`${victimName}!! 안 돼!!`, '방금 봤어?! 잡혔어!', '어떡해!!', '빨리 도망쳐야 해!!'],
            '과묵함': ['...!', '(눈을 감음)', '......', '...가자'],
            '4차원': ['영혼이 떠나가는 게 보여...', `${victimName}... 다음 세계에서...`, '차원이 흔들렸어...', '...안녕'],
        };
        const pool = reactions[this.traits[0]] || ['...!!'];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    getAllyDeathReaction(allyName: string): string {
        const reactions: Record<string, string[]> = {
            '소심함': [`${allyName}...!! 안 돼!!`, '우리 팀원이...!!', '이제 어떡해...', '나 혼자 남는 거야...?!'],
            '다혈질': [`${allyName}!!! 복수할게!!`, '그 좀비 가만 안 둬!', '빌어먹을!!', `${allyName}!! 일어나!!`],
            '낙천적': [`${allyName}... 거짓말이지...?`, '우리 팀이...', '미안해... 지켜주지 못해서', '나머지라도 살아야 해...'],
            '염세적': ['...알고 있었어', `${allyName}... 예상했지만`, '이래서 팀은 의미 없어...', '...끝이 보여'],
            '수다쟁이': [`${allyName}!!! 안 돼!!!`, '우리 팀원인데!! 우리 팀원이!!', '어떡해 어떡해!!', '이건 아니야!!'],
            '과묵함': [`...${allyName}.`, '......!!', '(주먹을 꽉 쥠)', '...반드시 살아남는다'],
            '4차원': [`${allyName}의 별이 꺼졌어...`, '팀 오라가 찢어졌어...', '이 세계는 잔인해...', '다음 차원에서 다시 만나...'],
        };
        const pool = reactions[this.traits[0]] || [`${allyName}...!!`];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    getWarningShout(): string {
        const shouts: Record<string, string[]> = {
            '소심함': ['뒤...뒤에!!', '저기...! 조심...!', '위험해...!!', '도...도망쳐!'],
            '다혈질': ['야!! 뒤에 좀비!!', '도망쳐!! 빨리!!', '이쪽으로 와!!', '뒤돌아보지 마!!'],
            '낙천적': ['조심해~!! 좀비야!', '이쪽이야! 빨리!', '위험해! 같이 가자!', '괜찮아 이쪽으로!'],
            '염세적': ['...뒤에 있어', '도망쳐... 소용없겠지만', '...좀비다', '끝났어... 뛰어'],
            '수다쟁이': ['야야야!! 좀비!! 좀비 온다!!', '뒤에!! 뒤에 있어!!', '빨리!! 이쪽으로!!', '위험해위험해!!'],
            '과묵함': ['...! (가리킴)', '뒤.', '...위험', '...뛰어'],
            '4차원': ['좀비 오라가!!', '4차원 경보!!', '차원의 틈에서 나왔어!!', '도망쳐! 주파수가!'],
        };
        const pool = shouts[this.traits[0]] || ['위험해!!'];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    getVictoryReaction(): string {
        const reactions: Record<string, string[]> = {
            '소심함': ['살...살았어...?', '끝...끝난 거야...?', '으으... 다리에 힘이...', '살아있다... 살아있어...!'],
            '다혈질': ['살았다!! 이겼어!!', '내가 살아남았다고!!', '누가 날 잡아!! 못 잡지!!', '최고다!!!'],
            '낙천적': ['살았다~!! 최고!!', '역시 난 운이 좋아~!', '다들 고생했어~!', '살아있다는 건 좋은 거야!'],
            '염세적': ['...살았나', '이게 끝일까...', '다음 게임이 있겠지...', '...기쁘지 않아'],
            '수다쟁이': ['살았어!! 살았다고!!', '대박!! 진짜 살아남았어!!', '이 이야기 꼭 해야 돼!!', '너무 무서웠어!! 근데 살았어!!'],
            '과묵함': ['...살았다', '(깊은 한숨)', '...다행이야', '......'],
            '4차원': ['이 차원에서 살아남았어', '별들이 축하하고 있어', '시뮬레이션 클리어...', '운명이 나를 선택했어'],
        };
        const pool = reactions[this.traits[0]] || ['살았다...!'];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    private findNearest(others: Agent[], targetRole: AgentRole): Agent | null {
        let nearest: Agent | null = null;
        let minDist = Infinity;

        others.forEach(other => {
            if (other.id === this.id) return;
            if (other.status !== 'ALIVE') return;
            if (other.role === targetRole) {
                const dist = Utils.getDistance(this.position, other.position);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = other;
                }
            }
        });
        return nearest;
    }

    private getDirectionTowards(target: Position): Direction {
        const dx = target.x - this.position.x;
        const dy = target.y - this.position.y;

        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? 'RIGHT' : 'LEFT';
        } else {
            return dy > 0 ? 'DOWN' : 'UP';
        }
    }

    private getDirectionAway(target: Position): Direction {
        const dx = this.position.x - target.x;
        const dy = this.position.y - target.y;

        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? 'RIGHT' : 'LEFT';
        } else {
            return dy > 0 ? 'DOWN' : 'UP';
        }
    }

    private getRandomDirection(): Direction {
        const directions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
        return directions[Math.floor(Math.random() * directions.length)];
    }

    updateColor() {
        if (this.role === 'ZOMBIE') {
            this.color = '#22c55e';
        } else {
            this.color = this.gender === 'MALE' ? '#60A5FA' : '#F472B6';
        }
    }

    kill() {
        if (this.status !== 'ALIVE') return;
        this.status = 'DEAD';
        this.state = 'IDLE';
        this.direction = 'IDLE';
        this.currentMessage = null;
        this.messageTimer = 0;
    }
}
