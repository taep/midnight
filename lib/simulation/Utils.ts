import { Position } from './types';

export class Utils {
    static generateId(): string {
        return Math.random().toString(36).substr(2, 9);
    }

    static getRandomName(gender: 'MALE' | 'FEMALE'): string {
        const maleNames = ['민수', '준호', '서준', '도윤', '예준', '시우', '하준', '지호', '은우', '건우'];
        const femaleNames = ['서연', '서윤', '지우', '하윤', '민서', '지유', '윤서', '채원', '수아', '시아'];

        const names = gender === 'MALE' ? maleNames : femaleNames;
        return names[Math.floor(Math.random() * names.length)];
    }

    static getRandomThough(): string {
        const thoughts = [
            "오늘 점심 뭐 먹지...",
            "집에 가고 싶다.",
            "여기 좀 춥네.",
            "심심하다.",
            "로또 1등 되고 싶어.",
            "아, 커피 마시고 싶다.",
            "뭔가 재미있는 일 없나?",
            "다리가 좀 아픈데.",
            "주말에 뭐 하지?",
            "졸리다...",
            "이 세계는 진짜일까?",
            "배고파...",
            "새로운 사람 없을까?",
            "하늘이 예쁘다.",
            "음악 듣고 싶네.",
            "오늘도 평화롭군.",
            "뭔가 불안한 느낌...",
            "아까 뭐 먹었더라.",
            "코인은 올랐으려나.",
            "넷플릭스 뭐 볼까.",
            "산책이나 할까.",
            "옆에 누가 있으면 좋겠다.",
            "이쪽은 처음 와보네.",
            "아무도 없나...",
            "요즘 잠이 안 와.",
            "어디서 냄새 나는데?",
            "갑자기 옛날 생각나네.",
            "운동 좀 해야 하는데.",
            "내일 뭐 하지?",
            "이상한 소리 들렸나?",
        ];
        return thoughts[Math.floor(Math.random() * thoughts.length)];
    }

    static getRandomGreeting(): string {
        const greetings = [
            "안녕!",
            "반가워~",
            "오 여기서 만나네?",
            "밥 먹었어?",
            "오늘 날씨 좋다!",
            "여기서 뭐 해?",
            "처음 보는 얼굴이네.",
            "어디 가는 길이야?",
            "오랜만이야~",
            "심심했는데 잘 만났다!",
            "오! 사람이다!",
            "같이 걸을래?",
            "너도 여기 사는 거야?",
            "별일 없지?",
            "좋은 아침~",
            "오늘 기분 어때?",
            "뭐 재밌는 거 없어?",
            "어 너 아까도 봤는데?",
            "이쪽은 처음이야.",
            "혹시 길 알아?",
            "나 좀 심심한데...",
            "같이 얘기하자~",
            "넌 여기 자주 와?",
            "오 반갑다!",
        ];
        return greetings[Math.floor(Math.random() * greetings.length)];
    }

    static getRandomReply(): string {
        const replies = [
            "응 반가워!",
            "그러게~ 신기하다.",
            "나도 심심했어.",
            "ㅋㅋ 그러네.",
            "어 나도~",
            "진짜? 대박.",
            "그래 같이 가자.",
            "뭐 별일 없어.",
            "나도 그래~",
            "맞아 맞아.",
            "아 그래?",
            "오 좋아!",
            "ㅎㅎ 고마워.",
            "나중에 또 보자~",
            "이야기 해줘!",
            "그건 몰랐네.",
            "같이 있으니 좋다.",
            "ㅋㅋㅋ",
            "어 알겠어~",
            "오 그럼 가보자!",
        ];
        return replies[Math.floor(Math.random() * replies.length)];
    }

    static getTraitPrefix(trait: string): string {
        const map: Record<string, string> = {
            '소심함': '소심',
            '다혈질': '폭력',
            '낙천적': '해피',
            '염세적': '우울',
            '수다쟁이': '수다',
            '과묵함': '과묵',
            '4차원': '몽상',
        };
        return map[trait] || '';
    }

    static getDistance(p1: Position, p2: Position): number {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    }
}
