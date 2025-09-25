import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/store.js";
import { useChatStore } from "../store/useChatStore.js";
import { X, Paintbrush, Eraser as EraserIcon } from "lucide-react";

export default function SketchBoard({ onClose }) {
  const { socket } = useStore();
  const { selectedUser } = useChatStore();
  const authUser = useStore.getState().authUser;

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const strokeRef = useRef(null);

  const [color, setColor] = useState("#000000");
  const [width, setWidth] = useState(4);
  const [strokes, setStrokes] = useState([]); // local draw cache
  const [tool, setTool] = useState("pen"); // pen or eraser

  const COLORS = [
    "#000000",
    "#FF3B30",
    "#FF9500",
    "#FFD60A",
    "#34C759",
    "#0A84FF",
    "#5856D6",
    "#AF52DE",
    "#FFFFFF",
  ];

  const peerId = selectedUser?._id;

  // Socket listeners
  useEffect(() => {
    if (!socket || !peerId) return;
    socket.emit("join-sketch", { peerId });

    socket.on("sketch-init", ({ strokes: s }) => {
      setStrokes(s || []);
      setTimeout(() => redrawCanvas(s || []), 0);
    });

    socket.on("sketch-stroke", (stroke) => {
      setStrokes((prev) => {
        const next = [...prev, stroke];
        drawStrokeOnCtx(ctxRef.current, stroke);
        return next;
      });
    });

    socket.on("sketch-cleared", () => {
      setStrokes([]);
      clearCanvasDisplay();
    });

    return () => {
      socket.emit("leave-sketch", { peerId });
      socket.off("sketch-init");
      socket.off("sketch-stroke");
      socket.off("sketch-cleared");
    };
  }, [socket, peerId]); // eslint-disable-line

  // Canvas setup & resize handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const dpi = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const styleWidth = Math.max(rect.width, 100);
      const styleHeight = Math.max(rect.height, 100);
      canvas.width = Math.floor(styleWidth * dpi);
      canvas.height = Math.floor(styleHeight * dpi);
      const ctx = canvas.getContext("2d");
      ctx.scale(dpi, dpi);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctxRef.current = ctx;
      redrawCanvas(strokes);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
    // eslint-disable-next-line
  }, []);

  // Clear only local canvas
  function clearCanvasDisplay() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Redraw all strokes
  function redrawCanvas(strokesToDraw) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    clearCanvasDisplay();
    for (const s of strokesToDraw) drawStrokeOnCtx(ctx, s);
  }

  // Draw a single stroke or segment
  function drawStrokeOnCtx(ctx, stroke) {
    if (!ctx || !stroke?.path?.length) return;
    ctx.save();
    if (stroke.type === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = stroke.width || 12;
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = stroke.color || "#000";
      ctx.lineWidth = stroke.width || 4;
    }
    ctx.beginPath();
    const p0 = stroke.path[0];
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < stroke.path.length; i++) {
      const p = stroke.path[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Input handlers
  function onPointerDown(e) {
    e.preventDefault?.();
    drawing.current = true;
    const pos = getPointerPos(e);
    const newStroke = {
      id: `s_${Date.now()}_${Math.random()}`,
      from: authUser?._id,
      color,
      width,
      path: [pos],
      timestamp: Date.now(),
      type: tool === "eraser" ? "eraser" : "pen",
    };
    strokeRef.current = newStroke;
    setStrokes((s) => [...s, newStroke]);
    drawStrokeOnCtx(ctxRef.current, newStroke);
  }

  function onPointerMove(e) {
    if (!drawing.current || !strokeRef.current) return;
    e.preventDefault?.();
    const pos = getPointerPos(e);
    strokeRef.current.path.push(pos);
    const len = strokeRef.current.path.length;
    if (len >= 2) {
      const lastSegment = {
        ...strokeRef.current,
        path: [
          strokeRef.current.path[len - 2],
          strokeRef.current.path[len - 1],
        ],
      };
      drawStrokeOnCtx(ctxRef.current, lastSegment);
    }
  }

  function onPointerUp(e) {
    if (!drawing.current) return;
    drawing.current = false;
    const lastStroke = strokeRef.current;
    if (lastStroke && socket && peerId) {
      socket.emit("sketch-stroke", { peerId, stroke: lastStroke });
    }
    strokeRef.current = null;
  }

  function getPointerPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX =
      e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    const clientY =
      e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // Clear for everyone
  function doClear() {
    if (!socket || !peerId) return;
    socket.emit("sketch-clear", { peerId });
    setStrokes([]);
    clearCanvasDisplay();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[90%] h-[80%] bg-base-100 rounded-lg shadow-lg p-3 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Paintbrush />
            <div className="font-medium">Sketch with {selectedUser?.name}</div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tool buttons */}
            <div className="flex items-center gap-1 mr-2">
              <button
                className={`btn btn-xs ${
                  tool === "pen" ? "btn-primary" : "btn-ghost"
                }`}
                onClick={() => setTool("pen")}
                title="Pen"
              >
                Pen
              </button>
              <button
                className={`btn btn-xs ${
                  tool === "eraser" ? "btn-primary" : "btn-ghost"
                } ml-1`}
                onClick={() => setTool("eraser")}
                title="Eraser"
              >
                <EraserIcon />
              </button>
            </div>

            {/* Color palette */}
            <div className="flex items-center gap-1 mr-3">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setColor(c);
                    setTool("pen");
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: c,
                    border:
                      c === "#FFFFFF"
                        ? "1px solid #ccc"
                        : "1px solid rgba(0,0,0,0.12)",
                  }}
                  className={`inline-block ${
                    c === color ? "ring-2 ring-offset-1" : ""
                  }`}
                  title={c}
                />
              ))}
            </div>

            {/* Stroke width */}
            <input
              type="range"
              min={1}
              max={40}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              title="Stroke width"
            />

            {/* Clear + Close */}
            <button onClick={doClear} className="btn btn-sm btn-error">
              Clear
            </button>
            <button onClick={onClose} className="btn btn-ghost btn-sm">
              <X />
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 border rounded overflow-hidden relative">
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              height: "100%",
              touchAction: "none",
              background: "#fff",
              cursor: "crosshair",
            }}
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
            onTouchStart={(e) => {
              e.preventDefault();
              onPointerDown(e);
            }}
            onTouchMove={(e) => {
              e.preventDefault();
              onPointerMove(e);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              onPointerUp(e);
            }}
          />
        </div>
      </div>
    </div>
  );
}
