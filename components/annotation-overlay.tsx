"use client";

import type { Annotation } from "@/lib/rendering/render-plan";

type AnnotationOverlayProps = {
  annotations: Annotation[];
  segmentOutputOffsetSeconds: number;
  isEditable?: boolean;
};

function isAnnotationVisible(
  annotation: Annotation,
  segmentOutputOffsetSeconds: number
) {
  return (
    segmentOutputOffsetSeconds >= annotation.startOffsetSeconds &&
    segmentOutputOffsetSeconds <= annotation.endOffsetSeconds
  );
}

export function AnnotationOverlay({
  annotations,
  segmentOutputOffsetSeconds,
  isEditable = false
}: AnnotationOverlayProps) {
  const visibleAnnotations = annotations.filter((annotation) =>
    isAnnotationVisible(annotation, segmentOutputOffsetSeconds)
  );

  if (!visibleAnnotations.length) {
    return null;
  }

  return (
    <div className={`absolute inset-0 ${isEditable ? "pointer-events-auto" : "pointer-events-none"}`}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <marker
            id="ghostcrew-arrowhead"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 z" fill="#facc15" />
          </marker>
        </defs>
        {visibleAnnotations.map((annotation) => {
          const x = annotation.x * 100;
          const y = annotation.y * 100;
          const width = annotation.width * 100;
          const height = annotation.height * 100;

          if (annotation.type === "box") {
            return (
              <rect
                key={annotation.id}
                x={x}
                y={y}
                width={width}
                height={height}
                rx="3"
                fill="rgba(250, 204, 21, 0.12)"
                stroke="#facc15"
                strokeWidth="1.2"
              />
            );
          }

          if (annotation.type === "arrow") {
            return (
              <line
                key={annotation.id}
                x1={x}
                y1={y}
                x2={x + width}
                y2={y + height}
                stroke="#facc15"
                strokeWidth="1.4"
                markerEnd="url(#ghostcrew-arrowhead)"
              />
            );
          }

          return null;
        })}
      </svg>
      {visibleAnnotations
        .filter((annotation) => annotation.type === "label")
        .map((annotation) => (
          <div
            key={annotation.id}
            className="absolute rounded-xl border border-yellow-300/30 bg-black/75 px-3 py-2 text-xs font-medium text-yellow-100 shadow-lg backdrop-blur"
            style={{
              left: `${annotation.x * 100}%`,
              top: `${annotation.y * 100}%`,
              maxWidth: "44%"
            }}
          >
            {annotation.text}
          </div>
        ))}
    </div>
  );
}
