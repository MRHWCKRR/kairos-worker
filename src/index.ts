export interface Env {
  HACKCLUB_KEY?: string;
  SHARED_SECRET: string;
  RATE_LIMIT_KV: KVNamespace;
}

const RATE_LIMIT_MAX_REQUESTS = 20; // per window, per IP
const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 4000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Kairos-Auth"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    // The Worker is an internal relay target. Only the trusted Vercel relay
    // may call it; the browser must never know this shared secret.
    const providedSecret = request.headers.get("X-Kairos-Auth");
    if (!providedSecret || providedSecret !== env.SHARED_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // --- 1. Per-IP rate limiting ---
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const bucket = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
    const rateLimitKey = `rl:${ip}:${bucket}`;

    const currentCountStr = await env.RATE_LIMIT_KV.get(rateLimitKey);
    const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

    if (currentCount >= RATE_LIMIT_MAX_REQUESTS) {
      return new Response(JSON.stringify({ error: "Too many requests. Please slow down." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    await env.RATE_LIMIT_KV.put(rateLimitKey, String(currentCount + 1), {
      expirationTtl: RATE_LIMIT_WINDOW_SECONDS + 5
    });

    // --- 2. Payload validation ---
    try {
      const body = await request.json() as { messages?: unknown };
      const messages = body.messages;

      if (!Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: "messages array required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (messages.length > MAX_MESSAGES) {
        return new Response(JSON.stringify({ error: "Conversation too long" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      for (const m of messages as Array<{ role?: string; content?: string }>) {
        if (typeof m.content !== "string" || m.content.length > MAX_MESSAGE_LENGTH) {
          return new Response(JSON.stringify({ error: "Message too long" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      if (!env.HACKCLUB_KEY) {
        return new Response(JSON.stringify({ error: "AI relay is not configured" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const upstreamHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.HACKCLUB_KEY}`
      };

      const upstream = await fetch("https://ai.hackclub.com/proxy/v1/chat/completions", {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify({
          model: "qwen/qwen3-32b",
          messages,
          stream: false
        })
      });

      const data = await upstream.json();

      return new Response(JSON.stringify(data), {
        status: upstream.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Relay error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
