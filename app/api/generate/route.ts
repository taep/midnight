import OpenAI from "openai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const apiKey = body.apiKey || process.env.OPENAI_API_KEY;

        if (!apiKey) {
            return NextResponse.json({ error: "API Key is required" }, { status: 400 });
        }

        const openai = new OpenAI({ apiKey });

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "너는 게임 속 NPC 캐릭터의 대사를 생성하는 AI야. 짧고 자연스러운 한국어 반말 대사를 만들어." },
                { role: "user", content: body.prompt }
            ],
            max_tokens: 60,
            temperature: 0.9,
        });

        const text = completion.choices[0]?.message?.content || "";
        return NextResponse.json({ text });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to generate content";
        console.error("LLM Generation Error:", message);

        if (message.includes('429') || message.includes('quota') || message.includes('rate')) {
            return NextResponse.json({ error: message }, { status: 429 });
        }

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
