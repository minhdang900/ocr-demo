"use client";

import React, { useEffect, useRef, useState } from "react";
import { ocrApiClient, OcrRequest, OcrResponse } from "../lib/api-client";

// ==========================
// Types
// ==========================
type OcrBox = {
  id: string;
  x: number; // normalized 0..1 (left)
  y: number; // normalized 0..1 (top)
  w: number; // normalized 0..1 (width)
  h: number; // normalized 0..1 (height)
  text: string;
  kind?: "word" | "line"; // aggregate intentionally not rendered
  meta?: any;
};

// ==========================
// Utils
// ==========================
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function toPixels(box: OcrBox, imgW: number, imgH: number) {
  return {
    x: Math.round(box.x * imgW),
    y: Math.round(box.y * imgH),
    w: Math.round(box.w * imgW),
    h: Math.round(box.h * imgH),
  };
}

function rectNormalize(r: { x: number; y: number; w: number; h: number }) {
  const x1 = r.w >= 0 ? r.x : r.x + r.w;
  const y1 = r.h >= 0 ? r.y : r.y + r.h;
  return { x: x1, y: y1, w: Math.abs(r.w), h: Math.abs(r.h) };
}

function normWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

// Helper function to transform coordinates based on rotation
function transformCoordinates(x: number, y: number, width: number, height: number, rotation: number, imgW: number, imgH: number) {
  switch (rotation) {
    case 90:
      return {
        x: imgW - y - height,
        y: x,
        width: height,
        height: width
      };
    case 180:
      return {
        x: imgW - x - width,
        y: imgH - y - height,
        width: width,
        height: height
      };
    case 270:
      return {
        x: y,
        y: imgH - x - width,
        width: height,
        height: width
      };
    default:
      return { x, y, width, height };
  }
}



// ==========================
// Component Helpers
// ==========================

function parseOverlayToBoxes(overlay: any, cropOriginX: number, cropOriginY: number, imgW: number, imgH: number): OcrBox[] {
  const out: OcrBox[] = [];
  if (!overlay?.Lines?.length) return out;
  overlay.Lines.forEach((line: any) => {
    const words = (line.Words || []).slice();
    if (!words.length) return;

    const left   = Math.min(...words.map((w: any) => (w.Left   ?? 0)));
    const top    = Math.min(...words.map((w: any) => (w.Top    ?? 0)));
    const right  = Math.max(...words.map((w: any) => (w.Left   ?? 0) + (w.Width  ?? 0)));
    const bottom = Math.max(...words.map((w: any) => (w.Top    ?? 0) + (w.Height ?? 0)));

    const nx = (cropOriginX + left)  / imgW;
    const ny = (cropOriginY + top)   / imgH;
    const nw = (right - left)        / imgW;
    const nh = (bottom - top)        / imgH;

    out.push({ id: uid("line"), x: nx, y: ny, w: nw, h: nh, text: words.map((w:any)=> String(w.WordText || w.text || "")).join(" "), kind: "line" });

    words.forEach((w: any) => {
      const wx = (cropOriginX + (w.Left   ?? 0)) / imgW;
      const wy = (cropOriginY + (w.Top    ?? 0)) / imgH;
      const ww = (w.Width  ?? 0) / imgW;
      const wh = (w.Height ?? 0) / imgH;
      out.push({ id: uid("word"), x: wx, y: wy, w: ww, h: wh, text: String(w.WordText || w.text || ""), kind: "word" });
    });
  });
  return out;
}

// ==========================
// Component
// ==========================
export default function OcrDemoUI() {
  // Upload
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // OCR results
  const [boxes, setBoxes] = useState<OcrBox[]>([]);
  const [hoverBox, setHoverBox] = useState<OcrBox | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Viewer
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [showHighlights, setShowHighlights] = useState(true);

  // Refs
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Drag select
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // ==========================
  // Tiny runtime tests (sanity)
  // ==========================
  useEffect(() => {
    try {
      console.assert(clamp(5, 0, 3) === 3, "clamp upper bound");
      console.assert(clamp(-1, 0, 3) === 0, "clamp lower bound");
      const rn = rectNormalize({ x: 10, y: 10, w: -5, h: -6 });
      console.assert(rn.x === 5 && rn.y === 4 && rn.w === 5 && rn.h === 6, "rectNormalize");
      const px = toPixels({ id: "t", x: 0.5, y: 0.25, w: 0.1, h: 0.2, text: "" }, 200, 100);
      console.assert(px.x === 100 && px.y === 25, "toPixels");
    } catch {}
  }, []);

  // ==========================
  // Upload helpers
  // ==========================
  const validateFile = (f: File): string | null => {
    const maxMB = 25;
    if (!f.type.startsWith("image/")) return "Only PNG/JPG images are supported.";
    if (f.size > maxMB * 1024 * 1024) return `Max file size is ${maxMB}MB.`;
    return null;
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || !files[0]) return;
    const f = files[0];
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setError(null);
    setUploadProgress(0);

    const reader = new FileReader();
    reader.onload = () => {
      setImgUrl(reader.result as string);
      setUploadProgress(100);
    };
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        setUploadProgress((event.loaded / event.total) * 100);
      }
    };
    reader.readAsDataURL(f);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  // ==========================
  // Prepare image after upload
  // ==========================
  useEffect(() => {
    if (!imgUrl) return;
    const img = new Image();
    imageRef.current = img;
    img.onload = () => {
      setImgNaturalSize({ w: img.width, h: img.height });
      setBoxes([]); setStatus(null); setHoverBox(null);
      setZoom(1); setRotation(0);
    };
    img.src = imgUrl;
  }, [imgUrl]);

  // ==========================
  // Drawing pipeline
  // ==========================
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl || !imgUrl || !imgNaturalSize) return;
    const ctx = canvasEl.getContext("2d"); if (!ctx) return;

    const container = containerRef.current;
    const maxW = container ? container.clientWidth : 800;
    const maxH = container ? container.clientHeight : 600;

    const imgW = imgNaturalSize.w; const imgH = imgNaturalSize.h;
    let drawW = imgW; let drawH = imgH;
    if (rotation === 90 || rotation === 270) { drawW = imgH; drawH = imgW; }
    const scaleFit = Math.min(maxW / drawW, maxH / drawH, 1);
    const scale = scaleFit * zoom;

    canvasEl.width = Math.round(drawW * scale);
    canvasEl.height = Math.round(drawH * scale);

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0,0,canvasEl.width,canvasEl.height);
      ctx.save();
      if (rotation === 90) { ctx.translate(canvasEl.width, 0); ctx.rotate(Math.PI/2); }
      else if (rotation === 180) { ctx.translate(canvasEl.width, canvasEl.height); ctx.rotate(Math.PI); }
      else if (rotation === 270) { ctx.translate(0, canvasEl.height); ctx.rotate(3*Math.PI/2); }
      ctx.drawImage(img, 0, 0, Math.round(imgW * scale), Math.round(imgH * scale));
      ctx.restore();

      if (showHighlights) {
        const dw = Math.round(imgW * scale);
        const dh = Math.round(imgH * scale);
        boxes.forEach((b) => {
          const abs = toPixels(b, dw, dh);
          ctx.lineWidth = 2;
          ctx.strokeStyle = b.kind === "word" ? "#7c3aed" : "#22c55e";
          ctx.fillStyle = b.kind === "word" ? "rgba(124,58,237,0.15)" : "rgba(34,197,94,0.12)";
          ctx.fillRect(abs.x, abs.y, abs.w, abs.h);
          ctx.strokeRect(abs.x, abs.y, abs.w, abs.h);
        });
      }

      if (dragRect) {
        const r = rectNormalize(dragRect);
        ctx.save();
        
        // Draw the drag rectangle in the same coordinate space as the mouse events
        // (untransformed canvas space)
        ctx.strokeStyle = "#111"; 
        ctx.setLineDash([6]);
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x, r.y, r.w, r.h); 
        ctx.restore();
      }
    };
    img.src = imgUrl;
  }, [imgUrl, imgNaturalSize, boxes, zoom, rotation, showHighlights, dragRect]);

  // ==========================
  // Canvas Interactions
  // ==========================
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    const canvasEl = canvasRef.current; if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const onCanvasMouseMove = (e: React.MouseEvent) => {
    const canvasEl = canvasRef.current; if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const container = containerRef.current;
    const x = e.clientX - rect.left; 
    const y = e.clientY - rect.top;

    if (dragStart) setDragRect({ x: dragStart.x, y: dragStart.y, w: x - dragStart.x, h: y - dragStart.y });

    if (imgNaturalSize) {
      const dw = canvasEl.width; const dh = canvasEl.height;
      
      // Convert canvas coordinates to normalized image coordinates
      let nx = clamp(x / dw, 0, 1); 
      let ny = clamp(y / dh, 0, 1);
      
      // Transform coordinates based on rotation for hit detection
      if (rotation === 90) {
        const tempX = nx;
        nx = ny;
        ny = 1 - tempX;
      } else if (rotation === 180) {
        nx = 1 - nx;
        ny = 1 - ny;
      } else if (rotation === 270) {
        const tempX = nx;
        nx = 1 - ny;
        ny = tempX;
      }
      
      const hit = boxes.find((b) => nx >= b.x && nx <= b.x + b.w && ny >= b.y && ny <= b.y + b.h) || null;
      setHoverBox(hit);

      if (container) {
        setCursorPos({ x: x + (container.scrollLeft || 0) + 12, y: y + (container.scrollTop || 0) + 12 });
      }
    }
  };

  const onCanvasMouseUp = async () => {
    // Drag-to-select → crop → Gateway API → add word/line boxes
    const canvasEl = canvasRef.current;
    const imgEl = imageRef.current;
    if (!dragRect || !imgNaturalSize || !canvasEl || !imgEl) {
      setDragStart(null); setDragRect(null); return;
    }

    // Map selection (canvas space) → original image pixels
    const r = rectNormalize(dragRect);
    const dw = canvasEl.width; const dh = canvasEl.height;
    const imgW = imgNaturalSize.w; const imgH = imgNaturalSize.h;

    // Calculate the actual image dimensions after rotation
    let actualImgW = imgW;
    let actualImgH = imgH;
    if (rotation === 90 || rotation === 270) {
      actualImgW = imgH;
      actualImgH = imgW;
    }

    // Convert canvas coordinates to image coordinates
    let sx = Math.floor((r.x / dw) * actualImgW);
    let sy = Math.floor((r.y / dh) * actualImgH);
    let sw = Math.ceil((r.w / dw) * actualImgW);
    let sh = Math.ceil((r.h / dh) * actualImgH);

    // Handle rotation by transforming coordinates back to original image space
    const transformed = transformCoordinates(sx, sy, sw, sh, rotation, imgW, imgH);
    sx = transformed.x;
    sy = transformed.y;
    sw = transformed.width;
    sh = transformed.height;

    // Clamp to bounds
    sx = clamp(sx, 0, imgW - 1);
    sy = clamp(sy, 0, imgH - 1);
    sw = clamp(sw, 1, imgW - sx);
    sh = clamp(sh, 1, imgH - sy);



    try {
      setStatus("⏳ Processing OCR...");

      // Crop to a blob
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = sw; cropCanvas.height = sh;
      const cctx = cropCanvas.getContext("2d");
      if (!cctx) throw new Error("Canvas 2D context unavailable");
      cctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh);

      const blob: Blob = await new Promise((resolve, reject) =>
        cropCanvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png")
      );

      // Prepare OCR request using secure API client
      const ocrRequest: OcrRequest = {
        file: blob,
        region: { x: sx, y: sy, width: sw, height: sh },
        language: "eng",
        options: {
          OCREngine: '2',
          isOverlayRequired: 'true',
          detectOrientation: 'true',
          scale: 'true'
        }
      };

      // Process OCR using secure API client
      const data: OcrResponse = await ocrApiClient.processOcr(ocrRequest);
      
      if (!data.result) {
        throw new Error("OCR processing failed: No result received");
      }
      
      const result = data.result;
      const parsedText: string = normWhitespace(result.text || "");

      // Use the new API response format with words and lines arrays
      let newBoxes: OcrBox[] = [];
      
      if (result.words && Array.isArray(result.words)) {
        // Process individual words
        result.words.forEach((word: any) => {
          const boundingBox = word.boundingBox;
          if (boundingBox) {
            // Convert OCR result coordinates to original image coordinates
            let nx = (sx + boundingBox.x) / imgW;
            let ny = (sy + boundingBox.y) / imgH;
            let nw = boundingBox.width / imgW;
            let nh = boundingBox.height / imgH;
            
            newBoxes.push({ 
              id: uid("word"), 
              x: nx, 
              y: ny, 
              w: nw, 
              h: nh, 
              text: String(word.text || ""), 
              kind: "word",
              meta: {
                confidence: word.confidence,
                lineIndex: word.lineIndex
              }
            });
          }
        });
      }
      
      if (result.lines && Array.isArray(result.lines)) {
        // Process lines
        result.lines.forEach((line: any) => {
          const boundingBox = line.boundingBox;
          if (boundingBox) {
            // Convert OCR result coordinates to original image coordinates
            let nx = (sx + boundingBox.x) / imgW;
            let ny = (sy + boundingBox.y) / imgH;
            let nw = boundingBox.width / imgW;
            let nh = boundingBox.height / imgH;
            
            newBoxes.push({ 
              id: uid("line"), 
              x: nx, 
              y: ny, 
              w: nw, 
              h: nh, 
              text: String(line.text || ""), 
              kind: "line",
              meta: {
                lineIndex: line.lineIndex,
                wordCount: line.words?.length || 0
              }
            });
          }
        });
      }
      
      // Fallback: if no words/lines found but we have text, create a single line box
      if (newBoxes.length === 0 && parsedText) {
        newBoxes = [{ id: uid("line"), x: sx / imgW, y: sy / imgH, w: sw / imgW, h: sh / imgH, text: parsedText, kind: "line" }];
      }

      if (newBoxes.length === 0) {
        setStatus("⚠️ No text detected in selected area");
      } else {
        setBoxes((prev) => [...prev, ...newBoxes]);
        // Use actual counts from API response if available, otherwise count from boxes
        const wordCount = result.word_count || newBoxes.filter(b => b.kind === 'word').length;
        const lineCount = result.line_count || newBoxes.filter(b => b.kind === 'line').length;
        const confidence = result.confidence ? ` (${Math.round(result.confidence * 100)}% confidence)` : '';
        setStatus(`✅ Extracted ${wordCount} words, ${lineCount} lines${confidence}`);
      }
    } catch (e: any) {
      console.error("OCR processing error:", e);
      let errorMessage = "OCR processing failed";
      
      if (e.name === 'AbortError') {
        errorMessage = "OCR request timed out. Please try again.";
      } else if (e.message.includes('Gateway API error')) {
        errorMessage = e.message;
      } else if (e.message.includes('network') || e.message.includes('fetch')) {
        errorMessage = "Network error. Please check your connection.";
      } else {
        errorMessage = e.message || "Unknown error occurred";
      }
      
      setStatus(`❌ ${errorMessage}`);
    } finally {
      setDragStart(null); setDragRect(null);
    }
  };

  // ==========================
  // UI
  // ==========================
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-neutral-900">
      {/* Header/status */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-neutral-200 shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white grid place-items-center font-bold">OCR</div>
            <h1 className="text-lg font-semibold">OCR Demo</h1>
          </div>
          {status && <div className="text-xs text-neutral-600 italic">{status}</div>}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {!imgUrl && (
          <section className="flex flex-col items-center justify-center h-[60vh] text-center">
            <h2 className="text-2xl font-semibold mb-4">Upload a Document</h2>
            <div
              className={`w-full max-w-md border-2 border-dashed rounded-2xl p-10 bg-white shadow-sm transition ${dragOver ? "border-blue-500 bg-blue-50" : "border-neutral-300"}`}
              onDragOver={(e)=>{ e.preventDefault(); setDragOver(true); }}
              onDragLeave={()=> setDragOver(false)}
              onDrop={onDrop}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="text-6xl">📄</div>
                <p className="text-sm text-neutral-600">Drag & drop a PNG/JPG or click below</p>
                <button onClick={()=> inputRef.current?.click()} className="px-5 py-2 rounded-xl bg-indigo-600 text-white shadow hover:bg-indigo-700 transition-colors">Choose File</button>
                <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e)=> handleFiles(e.target.files)} />
                
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="w-full">
                    <div className="text-xs text-neutral-500 mb-1">Uploading...</div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {error && <div className="mt-4 p-3 rounded bg-red-100 text-red-800 w-full max-w-md text-sm">{error}</div>}
          </section>
        )}

        {imgUrl && (
          <section className="grid grid-cols-1 lg:grid-cols-10 gap-6">
            {/* Canvas / Viewer (70%) */}
            <div className="relative lg:col-span-7 bg-white border rounded-xl shadow-sm">
              <div ref={containerRef} className="relative h-[85vh] grid place-items-center overflow-auto">
                <canvas
                  ref={canvasRef}
                  className="block max-w-full cursor-crosshair"
                  onMouseDown={onCanvasMouseDown}
                  onMouseMove={onCanvasMouseMove}
                  onMouseUp={onCanvasMouseUp}
                  onMouseLeave={()=>{ setHoverBox(null); setCursorPos(null); }}
                />

                {hoverBox && cursorPos && (
                  <div
                    className="pointer-events-none absolute text-xs bg-black/80 text-white rounded px-2 py-1 shadow-lg max-w-xs"
                    style={{ left: cursorPos.x, top: cursorPos.y }}
                  >
                    <div className="font-semibold">{hoverBox.text}</div>
                    <div className="text-gray-300">
                      Type: {hoverBox.kind}
                      {hoverBox.meta?.confidence !== undefined && (
                        <span> • Confidence: {Math.round(hoverBox.meta.confidence * 100)}%</span>
                      )}
                      {hoverBox.meta?.lineIndex !== undefined && (
                        <span> • Line: {hoverBox.meta.lineIndex + 1}</span>
                      )}
                      {hoverBox.meta?.wordCount && (
                        <span> • Words: {hoverBox.meta.wordCount}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Toolbar pinned to column, not scrolling with container */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
                <div className="bg-white/95 backdrop-blur rounded-2xl shadow-md px-3 py-2 flex gap-2 border border-neutral-200">
                  <button className="px-3 py-1.5 rounded-md border hover:bg-neutral-100" title="Zoom out" onClick={()=> setZoom(z=> clamp(z-0.25,0.25,5))}>−</button>
                  <button className="px-3 py-1.5 rounded-md border hover:bg-neutral-100" title="Zoom in" onClick={()=> setZoom(z=> clamp(z+0.25,0.25,5))}>＋</button>
                  <button className="px-3 py-1.5 rounded-md border hover:bg-neutral-100" title="Fit to screen" onClick={()=> setZoom(1)}>Fit</button>
                  <button className="px-3 py-1.5 rounded-md border hover:bg-neutral-100" title="Rotate 90°" onClick={()=> setRotation(r=> ((r+90)%360) as 0|90|180|270)}>↻</button>
                  <button className="px-3 py-1.5 rounded-md border hover:bg-neutral-100" title="Toggle highlights" onClick={()=> setShowHighlights(v=>!v)}>{showHighlights ? 'Hide' : 'Show'}</button>
                  <button className="px-3 py-1.5 rounded-md border hover:bg-neutral-100" title="Upload another" onClick={()=>{ setImgUrl(null); setBoxes([]); setHoverBox(null); setStatus(null); }}>Upload</button>
                </div>
              </div>
            </div>

            {/* Right panel: textarea with hovered text (30%) */}
            <div className="lg:col-span-3">
              <div className="bg-white border rounded-xl p-3 h-[30vh] flex flex-col shadow-sm">
                <div className="font-semibold mb-2">Hovered Text</div>
                <textarea className="w-full h-full border rounded p-2 text-sm" readOnly value={hoverBox?.text || ""} />
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
