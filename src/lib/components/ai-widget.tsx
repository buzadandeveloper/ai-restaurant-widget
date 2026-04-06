import { useCallback, useEffect, useRef, useState } from "react";
import { aiAgentService } from "../services/ai-agent/ai-agent-service";
import { MicHintIcon, MicIcon, PauseIcon, SpeakerIcon } from "../icons";
import "./ai-widget.css";

interface AiAgentWidgetProps {
  configKey: string;
}

export const AiAgentWidget = ({ configKey }: AiAgentWidgetProps) => {
  // ── Session state ──────────────────────────────────────────
  const [sessionState, setSessionState] = useState({ isActive: false, isListening: false, isSpeaking: false });
  // ── Waveform bars ──────────────────────────────────────────
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(BASE_HEIGHT));

  // ── Animation and audio context refs ───────────────────────
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── WebRTC refs ────────────────────────────────────────────
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Tool call buffer ───────────────────────────────────────
  const toolArgsBufferRef = useRef<string>("");

  const { isActive, isListening, isSpeaking } = sessionState;

  const theme = isListening
    ? {
        glow: "bg-[rgba(224,85,85,0.45)]",
        button:
          "bg-linear-to-br from-[#c0392b] to-[#8e2519] shadow-[0_8px_28px_rgba(224,85,85,0.45),0_2px_8px_rgba(224,85,85,0.45)]",
      }
    : isSpeaking
      ? {
          glow: "bg-[rgba(46,184,122,0.45)]",
          button:
            "bg-linear-to-br from-[#1a9960] to-[#116644] shadow-[0_8px_28px_rgba(46,184,122,0.45),0_2px_8px_rgba(46,184,122,0.45)]",
        }
      : {
          glow: "bg-[rgba(232,98,30,0.4)]",
          button:
            "bg-linear-to-br from-[#e8621e] to-[#c04a10] shadow-[0_8px_28px_rgba(232,98,30,0.4),0_2px_8px_rgba(232,98,30,0.4)]",
        };

  // ── Start waveform animation ───────────────────────────────
  const startWaveform = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const newBars = Array.from({ length: BAR_COUNT }, (_, i) => {
        const val = data[Math.floor((i / BAR_COUNT) * data.length)] ?? 0;
        return BASE_HEIGHT + (val / 255) * 38;
      });
      setBars(newBars);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Stop waveform animation ────────────────────────────────
  const stopWaveform = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    analyserRef.current?.disconnect();
    audioCtxRef.current?.close();
    animFrameRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
    setBars(Array(BAR_COUNT).fill(BASE_HEIGHT));
  }, []);

  // ── Start conversation ─────────────────────────────────────
  const startConversation = useCallback(async () => {
    if (isActive) return;
    setSessionState((prev) => ({ ...prev, isActive: true, isListening: true, isSpeaking: false }));

    try {
      // STEP 1: Create AI session
      const data = await aiAgentService.createSession({ configKey });
      const EPHEMERAL_KEY = data?.client_secret?.value;
      if (!EPHEMERAL_KEY) throw new Error("Missing EPHEMERAL_KEY in response");

      // STEP 2: WebRTC peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
          audioRef.current.play().catch(() => {});
        }
        setSessionState((prev) => ({ ...prev, isListening: false, isSpeaking: true }));
      };

      // Mic → AI
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      startWaveform(stream);

      // STEP 3: Data channel for tool calls
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onmessage = async (e) => {
        try {
          const msg = JSON.parse(e.data as string);

          // Detect when user is speaking (input audio starts)
          if (msg.type === "input_audio_buffer.speech_started")
            setSessionState((prev) => ({ ...prev, isListening: true, isSpeaking: false }));

          // Detect when AI starts speaking
          if (msg.type === "response.audio.delta")
            setSessionState((prev) => ({ ...prev, isListening: false, isSpeaking: true }));

          // Detect when AI finishes speaking
          if (msg.type === "response.audio.done" || msg.type === "response.done")
            setSessionState((prev) => ({ ...prev, isListening: true, isSpeaking: false }));

          // Accumulate tool call arguments (streaming)
          if (msg.type === "response.function_call_arguments.delta") toolArgsBufferRef.current += msg.delta ?? "";

          // Tool call complete — execute it
          if (msg.type === "response.function_call_arguments.done") {
            const toolName: string = msg.name;
            const callId: string = msg.call_id;
            const args = JSON.parse(toolArgsBufferRef.current || "{}");

            console.log("🛠️ Tool call:", toolName);
            console.log("📨 Arguments:", args);
            console.log("🔑 Call ID:", callId);

            if (!toolName || !callId) {
              console.error("❌ Missing tool name or call_id");
              toolArgsBufferRef.current = "";
              return;
            }

            try {
              const result = await aiAgentService.executeTool(toolName, args);
              console.log("✅ Tool result:", result);

              dc.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify(result),
                  },
                }),
              );
              dc.send(JSON.stringify({ type: "response.create" }));
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : "Tool execution failed";
              console.error("❌ Tool execution failed:", err);

              dc.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify({ error: message }),
                  },
                }),
              );
              dc.send(JSON.stringify({ type: "response.create" }));
            }

            toolArgsBufferRef.current = "";
          }

          if (!msg.type?.startsWith("response.function_call_arguments")) {
            console.log("📥 AI event:", msg.type);
          }
        } catch (err) {
          console.error("❌ Error parsing message:", err);
        }
      };

      // STEP 4: Connect to OpenAI Realtime API
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const answerSDP = await aiAgentService.startSdp(offer.sdp!, EPHEMERAL_KEY);

      if (!answerSDP) throw new Error("OpenAI connection error");
      await pc.setRemoteDescription({ type: "answer", sdp: answerSDP });

      console.log("✅ Connected to AI Agent!");
    } catch (err) {
      console.error("❌ Error starting:", err);
      stopWaveform();
      setSessionState((prev) => ({ ...prev, isActive: false, isListening: false, isSpeaking: false }));
    }
  }, [isActive, configKey, startWaveform, stopWaveform]);

  // ── Stop conversation ──────────────────────────────────────
  const stopConversation = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.getSenders().forEach((s: RTCRtpSender) => s.track?.stop());
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());

    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    toolArgsBufferRef.current = "";

    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }

    stopWaveform();
    setSessionState({ isActive: false, isListening: false, isSpeaking: false });
    console.log("🛑 Session stopped");
  }, [stopWaveform]);

  // ── Button click handler ───────────────────────────────────
  const handleClick = useCallback(() => {
    if (isActive) {
      stopConversation();
      return;
    }

    void startConversation();
  }, [isActive, startConversation, stopConversation]);

  // ── Cleanup on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => stopConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Hidden audio element for AI voice output */}
      <audio ref={audioRef} autoPlay hidden />

      <div className="fixed bottom-8 right-7 z-50 flex items-center">
        {/* ── Voice listener panel ── */}
        <div
          className={`
            flex flex-col gap-2.5 overflow-hidden rounded-[20px] border bg-[#161210]
            shadow-[0_16px_48px_rgba(0,0,0,0.6)]
            transition-all duration-400 ease-in-out
            ${isActive ? "w-64 opacity-100 px-4 py-3.5 mr-3" : "w-0 opacity-0 px-0 py-3.5 mr-0"}
            ${isListening ? "border-[#e05555]/35" : isSpeaking ? "border-[#2eb87a]/35" : "border-[#e8621e]/35"}
          `}
        >
          {/* Status row */}
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span
              className={`
                w-1.75 h-1.75 rounded-full shrink-0 transition-all duration-300
                ${isListening ? "bg-[#e05555] shadow-[0_0_7px_#e05555]" : "bg-[#2eb87a] shadow-[0_0_7px_#2eb87a]"}
              `}
            />
            <span
              className={`
                text-[12px] tracking-[0.07em] font-serif italic transition-colors duration-300
                ${isListening ? "text-[#e05555]" : "text-[#2eb87a]"}
              `}
            >
              {isListening ? "Listening..." : "Speaking..."}
            </span>
          </div>

          {/* Waveform visualizer */}
          <div className="relative h-13 rounded-[10px] bg-white/3 flex items-center justify-center overflow-hidden">
            {/* Ripple rings — listening only */}
            {isListening && (
              <>
                <span className="ripple-ring border-[#e05555] animate-[rpl_2s_ease-out_infinite]" />
                <span className="ripple-ring border-[#e05555] animate-[rpl_2s_ease-out_infinite_0.65s]" />
              </>
            )}
            {/* Bars */}
            <div className="relative z-10 flex items-center gap-1">
              {bars.map((bar, index) => (
                <div
                  key={index}
                  style={{ height: getHeight(bar) }}
                  className={`
                    w-0.75 rounded-full transition-[height] duration-55 ease-linear
                    ${isListening ? "bg-[#e05555]" : "bg-[#2eb87a]"}
                  `}
                />
              ))}
            </div>
          </div>

          {/* Hint label */}
          <div className="flex items-center gap-1.5 min-h-5 whitespace-nowrap">
            {isListening ? <MicHintIcon /> : <SpeakerIcon />}
            <span className="text-[11px] font-serif italic text-[#5a4a3a]">
              {isListening ? "Speak now…" : "AI is responding…"}
            </span>
          </div>
        </div>

        {/* ── Circle button ── */}
        <div className="relative w-15.5 h-15.5 flex items-center justify-center shrink-0">
          {/* Blur glow */}
          <div
            className={`
              absolute -inset-2 rounded-full blur-[14px] transition-all duration-300 pointer-events-none
              ${theme.glow}
              ${isActive ? "opacity-65" : "opacity-30"}
            `}
          />

          {/* Spinning dashed ring */}
          <div
            className={`
              absolute -inset-2.5 rounded-full border-[1.5px] border-dashed pointer-events-none
              transition-all duration-300
              ${isListening ? "border-[#e05555]" : isSpeaking ? "border-[#2eb87a]" : "border-[#e8621e]"}
              ${isActive ? "opacity-55 animate-spin" : "opacity-0"}
            `}
            style={{ animationDuration: "3s" }}
          />

          {/* Idle pulse ring */}
          {!isActive && (
            <div className="absolute -inset-1.25 rounded-full border-[1.5px] border-[#e8621e] animate-[idlePulse_2s_ease-out_infinite] pointer-events-none" />
          )}

          {/* Main button */}
          <button
            onClick={handleClick}
            className={`
              relative z-10 w-15.5 h-15.5 rounded-full border-none flex items-center justify-center
              cursor-pointer transition-all duration-300 active:scale-95
              ${theme.button}
            `}
          >
            {isActive ? <PauseIcon /> : <MicIcon />}
          </button>
        </div>
      </div>
    </>
  );
};

const BAR_COUNT = 18;
const BASE_HEIGHT = 4;

// ── Waveform helpers ───────────────────────────────────────
const getHeight = (value: number): string => `${value}px`;
