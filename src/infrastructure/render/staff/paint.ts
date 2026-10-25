import type { Paint, Shape } from './shapes';

/*
 * The staff's shapes on a canvas: each as SVG would draw it (a text's `y` is its baseline, a path is
 * read through Path2D), in the colours `colour` gives for the theme's names.
 */

/** What a theme's colour (a CSS variable) stands for now. */
export type Colours = (paint: Paint) => string;

/** Draws `shape`; what is painted `currentColor` takes `current`, or the colour of the group it is in. */
export function paintShape(ctx: CanvasRenderingContext2D, shape: Shape, colour: Colours, current: string): void {
  const of = (paint: Paint | undefined): string | null => (paint === undefined || paint === 'none' ? null : paint === 'currentColor' ? current : colour(paint));
  switch (shape.kind) {
    case 'group': {
      const color = shape.color === undefined ? current : (of(shape.color) ?? current);
      for (const child of shape.children) paintShape(ctx, child, colour, color);
      return;
    }
    case 'text': {
      const fill = of(shape.fill);
      if (!fill) return;
      ctx.font = `${shape.italic ? 'italic ' : ''}${shape.bold ? 'bold ' : ''}${shape.size}px ${shape.font}`;
      ctx.textAlign = shape.anchor === 'middle' ? 'center' : (shape.anchor ?? 'start');
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = fill;
      ctx.globalAlpha = shape.opacity ?? 1;
      ctx.fillText(shape.text, shape.x, shape.y);
      ctx.globalAlpha = 1;
      return;
    }
    case 'line': {
      const stroke = of(shape.stroke);
      if (!stroke) return;
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = shape.width;
      ctx.lineCap = 'butt';
      ctx.stroke();
      return;
    }
    case 'polyline': {
      const stroke = of(shape.stroke);
      if (!stroke) return;
      trace(ctx, shape.points);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = shape.width;
      ctx.lineCap = 'butt';
      ctx.setLineDash(shape.dash ? [...shape.dash] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    case 'polygon': {
      const fill = of(shape.fill);
      if (!fill) return;
      trace(ctx, shape.points);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      return;
    }
    case 'rect': {
      const fill = of(shape.fill);
      if (!fill) return;
      ctx.globalAlpha = shape.opacity ?? 1;
      ctx.fillStyle = fill;
      ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
      ctx.globalAlpha = 1;
      return;
    }
    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, 2 * Math.PI);
      const fill = of(shape.fill);
      const stroke = of(shape.stroke);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = shape.width;
        ctx.stroke();
      }
      return;
    }
    case 'path': {
      const path = new Path2D(shape.d);
      const fill = of(shape.fill);
      const stroke = of(shape.stroke);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill(path);
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = shape.width ?? 1;
        ctx.lineCap = shape.round ? 'round' : 'butt';
        ctx.stroke(path);
      }
      return;
    }
  }
}

/** A path through points (x, y, x, y…). */
function trace(ctx: CanvasRenderingContext2D, points: readonly number[]): void {
  ctx.beginPath();
  for (let i = 0; i + 1 < points.length; i += 2) {
    if (i === 0) ctx.moveTo(points[i]!, points[i + 1]!);
    else ctx.lineTo(points[i]!, points[i + 1]!);
  }
}
