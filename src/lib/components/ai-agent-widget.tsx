import { useCallback, useEffect, useRef, useState } from "react";
import { AiAgentService, ApiClient } from "../services";
import { MicHintIcon, MicIcon, PauseIcon, SpeakerIcon } from "../icons";
import "./ai-agent-widget.css";

interface AiAgentWidgetProps {
  configKey: string;
  url: string;
  aiProviderUrl: string;
  aiProviderApiKey: string;
  aiWsProviderUrl: string;
}

export const AiAgentWidget = ({
  configKey,
  url,
  aiProviderUrl,
  aiProviderApiKey,
  aiWsProviderUrl,
}: AiAgentWidgetProps) => {
  const apiClient = new ApiClient(url);
  const aiAgentService = new AiAgentService(apiClient);

  // ── Session state ──────────────────────────────────────────
  const [sessionState, setSessionState] = useState({ isActive: false, isListening: false, isSpeaking: false });
  // ── Waveform bars ──────────────────────────────────────────
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(BASE_HEIGHT));

  // ── Animation and audio context refs ───────────────────────
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const aiSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

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

  // ── Connect AI output stream to the existing analyser ─────
  const connectAiStream = useCallback((stream: MediaStream) => {
    const ctx = audioCtxRef.current;
    const analyser = analyserRef.current;
    if (!ctx || !analyser) return;
    // Disconnect any previous AI source
    aiSourceRef.current?.disconnect();
    const aiSource = ctx.createMediaStreamSource(stream);
    aiSource.connect(analyser);
    aiSourceRef.current = aiSource;
  }, []);

  // ── Stop waveform animation ────────────────────────────────
  const stopWaveform = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    aiSourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    audioCtxRef.current?.close();
    animFrameRef.current = null;
    aiSourceRef.current = null;
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
      const data = await aiAgentService.createSession({ configKey, aiProviderUrl, aiProviderApiKey });
      const EPHEMERAL_KEY = data?.client_secret?.value;
      if (!EPHEMERAL_KEY) console.error("Missing EPHEMERAL_KEY in response");

      // STEP 2: WebRTC peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
          audioRef.current.play().catch(() => {});
        }
        // Connect AI audio stream to the analyser so waveform reacts while AI speaks
        connectAiStream(event.streams[0]);
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

      // Trigger the AI to speak first as soon as the data channel is open
      dc.onopen = () => {
        dc.send(JSON.stringify({ type: "response.create" }));
      };

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

            console.log("Tool call:", toolName);
            console.log("Arguments:", args);
            console.log("Call ID:", callId);

            if (!toolName || !callId) {
              console.error("Missing tool name or call_id");
              toolArgsBufferRef.current = "";
              return;
            }

            try {
              const result = await aiAgentService.executeTool(toolName, args);
              console.log("Tool result:", result);

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
              console.error("Tool execution failed:", err);

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
            console.log("AI event:", msg.type);
          }
        } catch (err) {
          console.error("Error parsing message:", err);
        }
      };

      // STEP 4: Connect to OpenAI Realtime API
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const answerSDP = await aiAgentService.startSdp(aiWsProviderUrl, offer.sdp, EPHEMERAL_KEY);

      if (!answerSDP) console.error("OpenAI connection error");
      await pc.setRemoteDescription({ type: "answer", sdp: answerSDP });

      console.log("Connected to AI Agent!");
    } catch (err) {
      console.error("Error starting:", err);
      stopWaveform();
      setSessionState((prev) => ({ ...prev, isActive: false, isListening: false, isSpeaking: false }));
    }
  }, [
    isActive,
    configKey,
    aiWsProviderUrl,
    aiProviderApiKey,
    aiProviderUrl,
    aiAgentService,
    startWaveform,
    stopWaveform,
    connectAiStream,
  ]);

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
    console.log("Session stopped");
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
  }, []);

  return (
    <>
      {/* Hidden audio element for AI voice output */}
      <audio ref={audioRef} autoPlay hidden />

      <div className="vb-root">
        {/* ── Voice listener panel ── */}
        <div
          className={`
            vb-panel
            ${isActive ? "vb-panel--active" : "vb-panel--collapsed"}
            ${isListening ? "vb-panel--listening" : isSpeaking ? "vb-panel--speaking" : "vb-panel--idle"}
          `}
        >
          {/* Status row */}
          <div className="vb-status">
            <span
              className={`
                vb-dot
                ${isListening ? "vb-dot--listening" : "vb-dot--speaking"}
              `}
            />
            <span
              className={`
                vb-status-label
                ${isListening ? "vb-status-label--listening" : "vb-status-label--speaking"}
              `}
            >
              {isListening ? "Listening..." : "Speaking..."}
            </span>
          </div>

          {/* Waveform visualizer */}
          <div className="vb-waveform">
            {/* Ripple rings — listening only */}
            {isListening && (
              <>
                <span className="ripple-ring ripple-ring--1" />
                <span className="ripple-ring ripple-ring--2" />
              </>
            )}
            {/* Bars */}
            <div className="vb-bars">
              {bars.map((bar, index) => (
                <div
                  key={index}
                  style={{ height: getHeight(bar) }}
                  className={`
                    vb-bar
                    ${isListening ? "vb-bar--listening" : "vb-bar--speaking"}
                  `}
                />
              ))}
            </div>
          </div>

          {/* Hint label */}
          <div className="vb-hint">
            {isListening ? <MicHintIcon /> : <SpeakerIcon />}
            <span className="vb-hint-text">{isListening ? "Speak now…" : "AI is responding…"}</span>
          </div>
        </div>

        {/* ── Circle button ── */}
        <div className="vb-btn-wrap">
          {/* Blur glow */}
          <div
            className={`
              vb-glow
              ${theme.glow}
              ${isActive ? "vb-glow--active" : "vb-glow--inactive"}
            `}
          />

          {/* Spinning dashed ring */}
          <div
            className={`
              vb-spin-ring
              ${isListening ? "vb-spin-ring--listening" : isSpeaking ? "vb-spin-ring--speaking" : "vb-spin-ring--idle"}
              ${isActive ? "vb-spin-ring--active" : "vb-spin-ring--inactive"}
            `}
            style={{ animationDuration: "3s" }}
          />

          {/* Idle pulse ring */}
          {!isActive && <div className="vb-idle-ring" />}

          {/* Main button */}
          <button
            onClick={handleClick}
            className={`
              vb-btn
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
