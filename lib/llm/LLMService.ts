export class LLMService {
    private static apiKey: string = '';
    private static serverKeyAvailable: boolean = true;
    private static disabled: boolean = false;
    private static disabledUntil: number = 0;

    private static lastThinkTime: number = 0;
    private static lastDialogueTime: number = 0;
    private static readonly THINK_INTERVAL = 3000;
    private static readonly DIALOGUE_INTERVAL = 1000;

    static setApiKey(key: string) {
        this.apiKey = key;
    }

    static hasKey(): boolean {
        if (this.disabled) {
            if (Date.now() > this.disabledUntil) {
                this.disabled = false;
            } else {
                return false;
            }
        }
        return this.apiKey.length > 0 || this.serverKeyAvailable;
    }

    static isDisabled(): boolean {
        return this.disabled && Date.now() < this.disabledUntil;
    }

    static disableServerKey() {
        this.serverKeyAvailable = false;
    }

    static async generateThinking(agentName: string, gender: string, traits: string[], context?: string): Promise<string> {
        const now = Date.now();
        if (now - this.lastThinkTime < this.THINK_INTERVAL) {
            return getRandomThought();
        }

        const genderKr = gender === 'MALE' ? '남자' : '여자';
        const contextLine = context ? `\n상황: ${context}` : '';
        const prompt = `너는 서바이벌 게임쇼 "MIDNIGHT STATION"의 참가자 "${agentName}" (${genderKr})이야.
너의 핵심 성격: ${traits.join(', ')}${contextLine}

지금 머릿속 혼잣말을 해봐. 반드시 너의 성격(${traits[0]})이 극단적으로 드러나야 해!

규칙:
- ${traits[0]}한 사람이 실제로 할 법한 말투 그대로
- 15자 이내, 한국어 반말, 구어체
- 따옴표 없이 대사만
- 소심함이면 불안하게, 다혈질이면 공격적으로, 낙천적이면 밝게, 과묵하면 짧게
- 감탄사, 말줄임표, 비속어(가벼운) 적극 사용`;

        try {
            this.lastThinkTime = now;
            const data = await this.callAPI(prompt);
            if (!data) return getRandomThought();
            return cleanResponse(data) || getRandomThought();
        } catch (e) {
            console.error("LLM Think Error:", e);
            return getRandomThought();
        }
    }

    static async generateDialogue(
        agentA: { name: string, gender: string, traits: string[] },
        agentB: { name: string },
        situation?: string
    ): Promise<{ a: string, b: string }> {
        const now = Date.now();
        if (now - this.lastDialogueTime < this.DIALOGUE_INTERVAL) {
            return { a: getRandomGreeting(), b: getRandomReply() };
        }

        const genderKr = agentA.gender === 'MALE' ? '남자' : '여자';
        const sitLine = situation ? `\n상황: ${situation}` : '';
        const prompt = `서바이벌 게임쇼에서 두 참가자가 만났어.${sitLine}

${agentA.name} (${genderKr}, 성격: ${agentA.traits.join(', ')}) — 이 성격이 대사에 극단적으로 드러나야 함!
${agentB.name} (상대)

규칙:
- ${agentA.name}의 성격 "${agentA.traits[0]}"이 말투/내용에 확실히 반영
- 각 15자 이내, 한국어 반말, 실제 대화처럼 자연스럽게
- 감탄사, 줄임말, 비속어(가벼운) OK
- 정확히 이 형식:
A: (대사)
B: (대사)`;

        try {
            this.lastDialogueTime = now;
            const data = await this.callAPI(prompt);
            if (!data) return { a: getRandomGreeting(), b: getRandomReply() };

            const lines = data.split('\n');
            let msgA = "";
            let msgB = "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('A:')) msgA = trimmed.replace('A:', '').trim();
                if (trimmed.startsWith('B:')) msgB = trimmed.replace('B:', '').trim();
            }

            msgA = cleanResponse(msgA);
            msgB = cleanResponse(msgB);

            if (!msgA || !msgB) return { a: getRandomGreeting(), b: getRandomReply() };
            return { a: msgA, b: msgB };
        } catch (e) {
            console.error("LLM Dialogue Error:", e);
            return { a: getRandomGreeting(), b: getRandomReply() };
        }
    }

    private static async callAPI(prompt: string): Promise<string | null> {
        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: this.apiKey, prompt }),
            });
            const data = await response.json();

            if (response.status === 429 || (data.error && (data.error.includes('429') || data.error.includes('quota')))) {
                console.warn("LLM quota exceeded. Disabling for 60 seconds.");
                this.disabled = true;
                this.disabledUntil = Date.now() + 60_000;
                return null;
            }

            if (data.error) {
                console.error("LLM API Error:", data.error);
                if (this.apiKey.length === 0 && (data.error.includes('API') || data.error.includes('key') || data.error.includes('401') || data.error.includes('403'))) {
                    console.warn("Server API key invalid. Disabling LLM.");
                    this.serverKeyAvailable = false;
                }
                return null;
            }

            return data.text?.trim() || null;
        } catch (e) {
            console.error("LLM Fetch Error:", e);
            return null;
        }
    }
}

// --- Helpers ---
function cleanResponse(text: string): string {
    return text.replace(/^["'""*]+|["'""*]+$/g, '').trim();
}

// --- Fallback Data ---
function getRandomThought() {
    const thoughts = [
        "휴...", "배고프네.", "심심하다.", "오늘 날씨 좋네.",
        "집에 가고 싶다.", "뭐 재미있는 거 없나?", "졸려...",
        "멍 때리는 중.", "하늘 좀 봐...", "오늘은 뭔가 다른데.",
        "아 커피...", "누가 말 좀 걸어줘.", "혼자 있는 것도 나쁘진 않아.",
        "코인 확인해야 하는데.", "운동해야 하는데...", "내일은 뭐 하지?",
        "이상한 소리 들렸나?", "여기 처음인데...", "갑자기 옛날 생각.",
    ];
    return thoughts[Math.floor(Math.random() * thoughts.length)];
}

function getRandomGreeting() {
    const greetings = [
        "안녕!", "반가워~", "오 여기서 만나네?", "밥 먹었어?",
        "오늘 날씨 좋다!", "여기서 뭐 해?", "오랜만이야~",
        "심심했는데 잘 만났다!", "오! 사람이다!", "같이 걸을래?",
        "별일 없지?", "오늘 기분 어때?", "뭐 재밌는 거 없어?",
        "너 아까도 봤는데?", "이쪽은 처음이야.", "나 좀 심심한데...",
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
}

function getRandomReply() {
    const replies = [
        "응 반가워!", "그러게~ 신기하다.", "나도 심심했어.",
        "ㅋㅋ 그러네.", "어 나도~", "진짜? 대박.",
        "그래 같이 가자.", "뭐 별일 없어.", "나도 그래~",
        "맞아 맞아.", "오 좋아!", "ㅎㅎ 고마워.",
        "나중에 또 보자~", "그건 몰랐네.", "같이 있으니 좋다.",
        "ㅋㅋㅋ", "어 알겠어~", "오 그럼 가보자!",
    ];
    return replies[Math.floor(Math.random() * replies.length)];
}
