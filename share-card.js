/* Share card: turns one of your sightings into a 1080×1350 image (Instagram portrait size)
   with the photo, species, rarity and place, then opens the phone's share sheet. */
import { TIER_LABEL, displayName, formatDateTime } from './shared.js';

const W = 1080, H = 1350, PHOTO_H = 960;
const TIER_STYLE = {
  veryrare: { color: '#e0558d', icon: '🦄' },
  rare: { color: '#e9a93f', icon: '💎' },
  uncommon: { color: '#4cb5c6', icon: '🔎' },
  common: { color: '#8db685', icon: '🌿' },
  unranked: { color: '#b5bcae', icon: '🌿' },
};
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

async function decode(blob) {
  if ('createImageBitmap' in window) return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
}

// Rounded rectangle path (ctx.roundRect only exists on newer browsers, e.g. iOS 16+).
function pill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Biggest font size (down to `min`) at which `text` fits in `maxWidth`.
function fitFont(ctx, text, maxWidth, start, min, family, style = '') {
  let size = start;
  do { ctx.font = `${style} ${size}px ${family}`; } while (ctx.measureText(text).width > maxWidth && (size -= 4) > min);
  return size;
}

function placeLine(s) {
  if (!s.loc) return '';
  return s.loc.source === 'gps' ? `${s.loc.lat.toFixed(2)}°, ${s.loc.lng.toFixed(2)}°` : `near ${s.loc.label}`;
}

export async function makeShareCard(s) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background + photo (cropped to fill the top area).
  ctx.fillStyle = '#16301f';
  ctx.fillRect(0, 0, W, H);
  if (s.photo) {
    const img = await decode(s.photo);
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const scale = Math.max(W / iw, PHOTO_H / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (W - dw) / 2, (PHOTO_H - dh) / 2, dw, dh);
    img.close?.();
  }
  const fade = ctx.createLinearGradient(0, PHOTO_H - 260, 0, PHOTO_H + 2);
  fade.addColorStop(0, 'rgba(22,48,31,0)');
  fade.addColorStop(1, 'rgba(22,48,31,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, PHOTO_H - 260, W, 262);

  // Rarity pill.
  const tier = s.rating?.tier;
  let y = PHOTO_H - 40;
  if (tier && TIER_STYLE[tier]) {
    const { color, icon } = TIER_STYLE[tier];
    const label = `${icon} ${TIER_LABEL[tier].toUpperCase()}${tier === 'unranked' ? '' : ' AROUND HERE'}`;
    ctx.font = `700 34px ${SANS}`;
    const pw = ctx.measureText(label).width + 56;
    ctx.fillStyle = color;
    ctx.beginPath();
    pill(ctx, 60, y - 44, pw, 68, 34);
    ctx.fill();
    ctx.fillStyle = '#101b14';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 88, y - 9);
  }

  // Names.
  ctx.textBaseline = 'alphabetic';
  const name = displayName(s.taxon);
  ctx.fillStyle = '#ffffff';
  fitFont(ctx, name, W - 120, 96, 48, SERIF, '700');
  y += 120;
  ctx.fillText(name, 60, y);
  if (s.taxon.common) {
    ctx.fillStyle = '#b8cbb2';
    fitFont(ctx, s.taxon.name, W - 120, 44, 28, SERIF, 'italic');
    y += 64;
    ctx.fillText(s.taxon.name, 60, y);
  }

  // When + where.
  ctx.fillStyle = '#e8f0e4';
  const meta = [formatDateTime(s.createdAt, { year: 'numeric', hour: undefined, minute: undefined }), placeLine(s)].filter(Boolean).join('  ·  ');
  fitFont(ctx, meta, W - 120, 36, 24, SANS, '500');
  y += 76;
  ctx.fillText(meta, 60, y);

  // Brand, bottom right: radar rings + name.
  const bx = W - 60, by = H - 60;
  ctx.font = `700 40px ${SERIF}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Nature Radar', bx, by);
  const tw = ctx.measureText('Nature Radar').width;
  const cx = bx - tw - 44, cy = by - 14;
  ctx.strokeStyle = '#b9e0a5';
  ctx.lineWidth = 4;
  for (const [r, a] of [[26, 0.35], [16, 0.7]]) {
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#b9e0a5';
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2b544';
  ctx.beginPath(); ctx.arc(cx + 17, cy - 17, 7, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/jpeg', 0.9));
}

// Opens the share sheet (Instagram, Messages…) where supported; otherwise saves the image.
export async function shareCard(blob, s) {
  const file = new File([blob], `nature-radar-${(s.taxon.common || s.taxon.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`, { type: 'image/jpeg' });
  const text = `${displayName(s.taxon)}${s.rating && s.rating.tier !== 'unranked' ? `: ${TIER_LABEL[s.rating.tier].toLowerCase()} around here` : ''} 🌿 #NatureRadar`;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
      // fall through to saving the file
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'saved';
}
