import { Grid3x3, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ImageEditorState = {
  x: number;
  y: number;
  scale: number;
};

type ImageEditorProps = {
  image: File;
  onConfirm: (state: ImageEditorState) => void;
  onCancel: () => void;
  minScale?: number;
  maxScale?: number;
};

export function ImageEditor({
  image,
  onConfirm,
  onCancel,
  minScale = 1,
  maxScale = 3,
}: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageData, setImageData] = useState<HTMLImageElement | null>(null);
  const [state, setState] = useState<ImageEditorState>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);

  // Load image
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setImageData(img);
        // Center the image
        const canvas = canvasRef.current;
        if (canvas) {
          setState({
            x: (canvas.width - img.width) / 2,
            y: (canvas.height - img.height) / 2,
            scale: 1,
          });
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(image);
  }, [image]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!(canvas && imageData)) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.save();
    ctx.translate(
      state.x + (imageData.width * state.scale) / 2,
      state.y + (imageData.height * state.scale) / 2
    );
    ctx.scale(state.scale, state.scale);
    ctx.translate(-imageData.width / 2, -imageData.height / 2);
    ctx.drawImage(imageData, 0, 0);
    ctx.restore();

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = "rgba(59, 130, 246, 0.2)";
      ctx.lineWidth = 1;

      const cellWidth = canvas.width / 3;
      const cellHeight = canvas.height / 3;

      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cellWidth * i, 0);
        ctx.lineTo(cellWidth * i, canvas.height);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, cellHeight * i);
        ctx.lineTo(canvas.width, cellHeight * i);
        ctx.stroke();
      }
    }

    // Draw center point
    ctx.fillStyle = "rgba(59, 130, 246, 0.5)";
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [imageData, state, showGrid]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - state.x,
      y: e.clientY - state.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) {
      return;
    }
    setState((prev) => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setState((prev) => ({
      ...prev,
      scale: Math.max(minScale, Math.min(maxScale, prev.scale + delta)),
    }));
  };

  const zoom = (direction: "in" | "out") => {
    const delta = direction === "in" ? 0.2 : -0.2;
    setState((prev) => ({
      ...prev,
      scale: Math.max(minScale, Math.min(maxScale, prev.scale + delta)),
    }));
  };

  const reset = () => {
    if (!imageData) {
      return;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      setState({
        x: (canvas.width - imageData.width) / 2,
        y: (canvas.height - imageData.height) / 2,
        scale: 1,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Preview and adjust your image</Label>
        <p className="text-muted-foreground text-sm">
          Drag to move, scroll to zoom, or use the buttons below.
        </p>
      </div>

      <canvas
        className={cn(
          "w-full cursor-move rounded-lg border border-gray-200 bg-gray-100",
          isDragging && "cursor-grabbing"
        )}
        height={400}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        ref={canvasRef}
        width={400}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={state.scale >= maxScale}
            onClick={() => zoom("in")}
            size="sm"
            type="button"
            variant="outline"
          >
            <ZoomIn className="mr-2 h-4 w-4" />
            Zoom in
          </Button>
          <Button
            disabled={state.scale <= minScale}
            onClick={() => zoom("out")}
            size="sm"
            type="button"
            variant="outline"
          >
            <ZoomOut className="mr-2 h-4 w-4" />
            Zoom out
          </Button>
          <Button
            onClick={() => setShowGrid(!showGrid)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Grid3x3
              className={cn("mr-2 h-4 w-4", showGrid && "text-blue-600")}
            />
            Grid
          </Button>
          <Button onClick={reset} size="sm" type="button" variant="outline">
            Reset
          </Button>
        </div>

        <div className="flex justify-end gap-3">
          <Button onClick={onCancel} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => onConfirm(state)}
            type="button"
          >
            Use this image
          </Button>
        </div>
      </div>
    </div>
  );
}
