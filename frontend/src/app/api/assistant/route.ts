import type { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getUserRecords } from "@/lib/server/data";
import { withUserTransaction } from "@/lib/server/db";
import {
  computeAssistantAnswer,
  safeFiguresForGemini,
  type AssistantEvidence,
} from "@/lib/server/assistant-core";
import { checkRateLimit, errorResponse, logApiError, readJsonObject, requireSameOrigin, serviceUnavailableResponse } from "@/lib/server/http";
import type { AgentChatMessage } from "@/lib/types";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

function isGeminiResponse(value: unknown): value is GeminiResponse {
  if (typeof value !== "object" || value === null || !("candidates" in value)) {
    return false;
  }
  const candidates = value.candidates;
  if (!Array.isArray(candidates)) return false;
  return candidates.every((candidate: unknown) => {
    if (typeof candidate !== "object" || candidate === null || !("content" in candidate)) return false;
    const content = candidate.content;
    if (typeof content !== "object" || content === null || !("parts" in content)) return false;
    const parts = content.parts;
    if (!Array.isArray(parts)) return false;
    return parts.every((part: unknown) => {
      if (typeof part !== "object" || part === null) return false;
      return !("text" in part) || typeof part.text === "string";
    });
  });
}

async function phraseWithGemini(
  question: string,
  figures: Record<string, unknown>,
): Promise<{ answer: string | null; notice: string | null }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      answer: null,
      notice: "Gemini is not configured; this answer uses the computed figures only.",
    };
  }

  const prompt = [
    "You are ScaleUp, a business data assistant.",
    "Phrase a concise answer using only the supplied aggregated figures.",
    "Do not invent values or claim that a metric caused another metric.",
    "If the figures do not support a conclusion, say so plainly.",
    `Question: ${question}`,
    `Aggregated figures: ${JSON.stringify(figures)}`,
  ].join("\n\n");
  const endpoint = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  endpoint.searchParams.set("key", apiKey);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok) {
      logApiError("gemini-phrase", new Error(`Gemini returned HTTP ${response.status}.`));
      return {
        answer: null,
        notice: "Gemini could not phrase this answer. The computed result is shown instead.",
      };
    }

    const result: unknown = await response.json();
    if (!isGeminiResponse(result)) {
      logApiError("gemini-phrase", new Error("Gemini returned an unexpected response shape."));
      return {
        answer: null,
        notice: "Gemini returned an unusable answer. The computed result is shown instead.",
      };
    }
    const candidate = result;
    const text = candidate.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!text || text.length > 5_000) {
      logApiError("gemini-phrase", new Error("Gemini returned an empty or oversized answer."));
      return {
        answer: null,
        notice: "Gemini returned an unusable answer. The computed result is shown instead.",
      };
    }
    return { answer: text, notice: null };
  } catch (error) {
    logApiError("gemini-phrase", error);
    return {
      answer: null,
      notice: "Gemini could not be reached. The computed result is shown instead.",
    };
  }
}

function toEvidenceItem(evidence: AssistantEvidence[]) {
  return evidence.map((row) => ({
    source: row.source,
    metric: `Source row ${row.rowNumber}`,
    value: row.fileName,
    detail: Object.entries(row.rowData)
      .map(([column, value]) => `${column}: ${value}`)
      .join(" | "),
    fileName: row.fileName,
    rowNumber: row.rowNumber,
    rowData: row.rowData,
  }));
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) return csrfError;
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse(401, "Sign in to ask a question about your data.");
    const limited = await checkRateLimit(request, "assistant", user.id, 20, 60);
    if (limited) return limited;

    const body = await readJsonObject(request);
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question || question.length > 500) {
      return errorResponse(400, "Enter a question of 1 to 500 characters.");
    }

    const records = await withUserTransaction(user.id, (client) =>
      getUserRecords(client, user.id),
    );
    const computed = computeAssistantAnswer(question, records);
    let answer = computed.answer;
    let generationNotice: string | undefined;
    if (computed.type !== "unsupported" && computed.evidence.length > 0) {
      const phrased = await phraseWithGemini(
        question,
        safeFiguresForGemini(computed),
      );
      if (phrased.answer) answer = phrased.answer;
      if (phrased.notice) generationNotice = phrased.notice;
    }

    const response: AgentChatMessage = {
      id: `agent-${Date.now()}`,
      role: "agent",
      content: answer,
      timestamp: new Date().toLocaleTimeString("en", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      toolsUsed: computed.toolsUsed.length ? computed.toolsUsed : ["No records checked"],
      evidence: toEvidenceItem(computed.evidence),
      generationNotice,
    };
    if (!user.demo) {
      await withUserTransaction(user.id, async (client) => {
        await client.query(
          `INSERT INTO assistant_history (user_id, question, answer, records_used)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [user.id, question, answer, JSON.stringify(response.evidence)],
        );
      });
    }
    return Response.json({ response });
  } catch (error) {
    logApiError("assistant", error);
    return serviceUnavailableResponse();
  }
}
