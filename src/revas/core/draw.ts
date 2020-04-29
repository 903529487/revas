import { Node, Frame } from './Node';
import {
  getMergedStyleFromNode,
  getFrameFromNode,
  sortByZIndexAscending,
  setShadow,
  pushOpacity,
  adapter
} from './utils';
import { Container } from './Container';
import { getCache, createCache, autoCacheId } from './offscreen';
import { RevasCanvas } from './Canvas';

function getRadius(style: any) {
  return {
    tl: style.borderTopLeftRadius || style.borderRadius || 0,
    tr: style.borderTopRightRadius || style.borderRadius || 0,
    bl: style.borderBottomLeftRadius || style.borderRadius || 0,
    br: style.borderBottomRightRadius || style.borderRadius || 0,
  };
}

export function drawNode(canvas: RevasCanvas, node: Node, root: Container) {
  const style = getMergedStyleFromNode(node, root.draw);
  const frame = getFrameFromNode(node);

  if (style.opacity <= 0) {
    return;
  }

  // flags
  const hasTransform =
    style.translateX || style.translateY || style.rotate || style.scaleX || style.scaleY || style.scale;
  const hasClip = style.overflow === 'hidden';

  if (hasClip) {
    canvas.context.save();
  } // Area Range

  // Opacity:
  const popOpacity = pushOpacity(canvas, style.opacity);

  if (hasTransform) {
    canvas.transform.save();
  }

  // Translation:
  if (style.translateX || style.translateY) {
    canvas.transform.translate(style.translateX || 0, style.translateY || 0);
  }
  // Rotate && Scale
  if (style.rotate || style.scaleX || style.scaleY || style.scale) {
    // Origin Center
    const originX = frame.x + frame.width / 2;
    const originY = frame.y + frame.height / 2;
    canvas.transform.translate(originX, originY);
    if (style.rotate) {
      canvas.transform.rotate(style.rotate);
    }
    if (style.scaleX || style.scaleY || style.scale) {
      canvas.transform.scale(style.scaleX || style.scale, style.scaleY || style.scale);
    }
    canvas.transform.translate(-originX, -originY);
  }

  canvas.apply();

  if (node.props.cache && adapter.createOffscreenCanvas && frame.height > 0 && frame.width > 0) {
    drawCache(canvas, node, root, style, frame, hasClip);
  } else {
    drawContent(canvas, node, root, style, frame, hasClip);
  }

  if (hasTransform) {
    canvas.transform.restore();
  }

  popOpacity();

  if (hasClip) {
    canvas.context.save();
  }
}

function drawCache(canvas: RevasCanvas, node: Node, root: Container, style: any, frame: Frame, hasClip: boolean) {
  const cachedId: string = node.props.cache === true ? autoCacheId(node) : node.props.cache;
  let cached = getCache(cachedId);
  if (!cached) {
    if (!node.$ready) {
      return drawContent(canvas, node, root, style, frame, hasClip);
    }
    cached = createCache(frame.width, frame.height, cachedId);
    cached.canvas.transform.translate(-frame.x, -frame.y);
    cached.canvas.apply();
    drawContent(cached.canvas, node, root, style, frame, hasClip);
  }
  canvas.context.drawImage(cached.canvas.context.canvas, frame.x, frame.y, frame.width, frame.height);
}

function drawContent(canvas: RevasCanvas, node: Node, root: Container, style: any, frame: Frame, hasClip: boolean) {
  const hasBG = style.backgroundColor && style.backgroundColor !== 'transparent';
  const hasBorder = style.borderColor && style.borderWidth > 0;
  const hasRadius =
    style.borderRadius ||
    style.borderTopLeftRadius ||
    style.borderTopRightRadius ||
    style.borderBottomLeftRadius ||
    style.borderBottomRightRadius;

  // consts
  const useFrame = hasBG || hasBorder || hasClip || style.path;
  const usePath = hasRadius || hasClip || style.path;

  if (useFrame) {
    const { context: ctx } = canvas;
    if (usePath) {
      // Draw Path
      ctx.beginPath();
      if (hasRadius) {
        const radius = getRadius(style);
        ctx.moveTo(frame.x + radius.tl, frame.y);
        ctx.arcTo(frame.x + frame.width, frame.y, frame.x + frame.width, frame.y + frame.height, radius.tr);
        ctx.arcTo(frame.x + frame.width, frame.y + frame.height, frame.x, frame.y + frame.height, radius.br);
        ctx.arcTo(frame.x, frame.y + frame.height, frame.x, frame.y, radius.bl);
        ctx.arcTo(frame.x, frame.y, frame.x + frame.width, frame.y, radius.tl);
      } else {
        ctx.rect(frame.x, frame.y, frame.width, frame.height);
      }
      ctx.closePath();

      if (hasClip) {
        ctx.clip();
      }
    }

    if (hasBG || hasBorder) {
      // Shadow:
      const resetShadow = setShadow(
        canvas,
        style.shadowColor,
        style.shadowOffsetX,
        style.shadowOffsetY,
        style.shadowBlur
      );
      // Background color & Shadow
      if (hasBG) {
        ctx.fillStyle = style.backgroundColor;
        if (usePath) {
          ctx.fill();
        } else {
          ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
        }
      }

      // Border with border radius:
      if (hasBorder) {
        ctx.lineWidth = style.borderWidth;
        ctx.strokeStyle = style.borderColor;
        if (usePath) {
          ctx.stroke();
        } else {
          ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
        }
      }
      resetShadow();
    }
  }

  if (node.props.customDrawer) {
    node.props.customDrawer(canvas, node);
  }

  // Draw child layers, sorted by their z-index.
  node.children
    .slice()
    .sort(sortByZIndexAscending)
    .forEach(child => {
      drawNode(canvas, child, root);
    });
}
