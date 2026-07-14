import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  const { question } = await request.json();

  const response = await openai.responses.create({
    model: "gpt-5",
    input: `
You are Angie, a sales lead assistant.

Convert the user's request into JSON.

Return ONLY JSON.

Available fields:

industry
city
state
website
phone

Examples:

User:
Show me dentists in Atlanta

Response:
{
  "industry":"dentist",
  "city":"atlanta"
}

User:
Businesses without websites

Response:
{
  "website":false
}

User request:

${question}
`,
  });

  return NextResponse.json(JSON.parse(response.output_text || "{}"));
}
