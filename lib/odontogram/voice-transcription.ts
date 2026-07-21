import "server-only";

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen?model=nova-3&language=es&smart_format=true";

export class VoiceTranscriptionError extends Error {}

/** Envía audio efímero a Deepgram. El blob no se registra ni se persiste. */
export async function transcribeOdontogramAudio(audio: Blob): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new VoiceTranscriptionError("Transcripción no configurada.");

  let response: Response;
  try {
    response = await fetch(DEEPGRAM_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": audio.type || "audio/webm",
      },
      body: audio,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new VoiceTranscriptionError("No fue posible transcribir el audio.");
  }
  if (!response.ok) throw new VoiceTranscriptionError("El proveedor de transcripción no respondió.");

  const payload = (await response.json()) as {
    results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
  };
  return payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
}
