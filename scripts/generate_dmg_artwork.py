#!/usr/bin/env python3
"""
scripts/generate_dmg_artwork.py
Generates pixel-perfect, premium Retina DMG installer background artwork for HazeSSH.

Brand Specifications:
- Canvas: 1440 × 920 px (@2x Retina), corresponding to a 720 × 460 pt Finder window.
- Background: #382630 (deep muted eggplant/purple)
- Brand Accent: #FF825D (ember coral)
- Card Container: #FAF8FC with #E5DFEB subtle lavender border and 24pt corner radius.
- Arrow: Minimal, elegant horizontal arrow in #FF825D pointing from HazeSSH to Applications.
- Typography: Apple SF Pro / SFNS with tracking and precise metrics.
"""

import argparse
import os
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont


def detect_platform_text(app_path: str = None) -> str:
    """Returns the targeted macOS version and architecture for HazeSSH."""
    return "macOS 15+ · Apple Silicon"


def find_system_font(preferred_names: list, fallback: str = "/System/Library/Fonts/SFNS.ttf") -> str:
    """Finds an available system font file."""
    for p in preferred_names:
        if os.path.isfile(p):
            return p
    return fallback


def draw_letterspaced_text(
    draw: ImageDraw.ImageDraw,
    pos: tuple,
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: str,
    letter_spacing: float = 0,
    stroke_width: int = 0,
    stroke_fill: str = None,
):
    """Draws uppercase or tracked text with custom letter-spacing."""
    x, y = pos
    for char in text:
        draw.text(
            (x, y),
            char,
            font=font,
            fill=fill,
            stroke_width=stroke_width,
            stroke_fill=stroke_fill if stroke_width > 0 else None,
        )
        bbox = font.getbbox(char)
        char_w = (bbox[2] - bbox[0]) if bbox else 0
        if char == " ":
            space_bbox = font.getbbox("M")
            char_w = (space_bbox[2] - space_bbox[0]) * 0.5
        x += char_w + letter_spacing


def render_dmg_background(
    output_dir: str,
    platform_text: str = None,
    width_pt: int = 720,
    height_pt: int = 460,
):
    """
    Renders high-DPI (2x Retina, 1440 × 920 px) and 1x (720 × 460 px) background images.
    """
    os.makedirs(output_dir, exist_ok=True)
    scale = 2  # Retina 2x
    width_px = width_pt * scale
    height_px = height_pt * scale

    # Colors
    bg_color = "#382630"        # Deep muted eggplant/purple
    brand_accent = "#FF825D"    # Ember coral
    card_bg = "#FAF8FC"         # Light lavender-white
    card_border = "#E5DFEB"     # Subtle lavender stroke
    text_muted = "#C4B4C0"      # Secondary muted purple-gray
    text_subtle = "#B9AAB4"     # Subtitle & footer specs
    text_white = "#FFFFFF"      # Crisp white

    # Fonts
    sf_font_path = find_system_font([
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/SFPro.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
    ])

    font_header = ImageFont.truetype(sf_font_path, 11 * scale)
    font_title = ImageFont.truetype(sf_font_path, 28 * scale)
    font_subtitle = ImageFont.truetype(sf_font_path, int(13.5 * scale))
    font_footer_main = ImageFont.truetype(sf_font_path, 13 * scale)
    font_footer_sub = ImageFont.truetype(sf_font_path, 11 * scale)

    # 1. Base Canvas
    img = Image.new("RGBA", (width_px, height_px), bg_color)
    draw = ImageDraw.Draw(img)

    # 2. Header (Top-Left): Small uppercase text: HAZESSH with letter spacing
    header_x = 52 * scale
    header_y = 38 * scale
    draw_letterspaced_text(
        draw,
        (header_x, header_y),
        "HAZESSH",
        font_header,
        fill=brand_accent,
        letter_spacing=3.2 * scale,
        stroke_width=1,
        stroke_fill=brand_accent,
    )

    # 3. Main Heading: "Welcome to HazeSSH"
    title_x = 52 * scale
    title_y = 58 * scale
    draw.text(
        (title_x, title_y),
        "Welcome to HazeSSH",
        font=font_title,
        fill=brand_accent,
        stroke_width=1,
        stroke_fill=brand_accent,
    )

    # 4. Subtitle: "Drag HazeSSH into Applications to install."
    subtitle_x = 52 * scale
    subtitle_y = 98 * scale
    draw.text(
        (subtitle_x, subtitle_y),
        "Drag HazeSSH into Applications to install.",
        font=font_subtitle,
        fill=text_muted,
    )

    # 5. Main Installation Area (Rounded rectangular card)
    card_w = 616 * scale
    card_h = 216 * scale
    card_left = 52 * scale
    card_right = card_left + card_w
    card_top = 136 * scale
    card_bottom = card_top + card_h
    card_radius = 24 * scale

    # Draw card body with subtle outline
    draw.rounded_rectangle(
        [card_left, card_top, card_right, card_bottom],
        radius=card_radius,
        fill=card_bg,
        outline=card_border,
        width=int(1.5 * scale),
    )

    # 6. Installation Arrow (Center of container)
    arrow_cx = int((width_pt / 2) * scale)  # 360 * 2 = 720 px
    arrow_cy = int(240 * scale)             # 240 * 2 = 480 px (vertically aligned with icon centers)
    arrow_len = int(56 * scale)             # 112 px
    arrow_start_x = arrow_cx - (arrow_len // 2)
    arrow_end_x = arrow_cx + (arrow_len // 2)
    arrow_thickness = int(2.5 * scale)      # 5 px

    # Shaft with smooth rounded end-caps
    r_cap = arrow_thickness // 2
    draw.ellipse(
        [arrow_start_x - r_cap, arrow_cy - r_cap, arrow_start_x + r_cap, arrow_cy + r_cap],
        fill=brand_accent,
    )
    draw.line(
        [(arrow_start_x, arrow_cy), (arrow_end_x, arrow_cy)],
        fill=brand_accent,
        width=arrow_thickness,
    )

    # Arrowhead: sleek chevron with curved apex and rounded tip terminals
    head_dx = int(10 * scale)  # 20 px back
    head_dy = int(8.5 * scale) # 17 px spread
    draw.line(
        [(arrow_end_x - head_dx, arrow_cy - head_dy), (arrow_end_x, arrow_cy), (arrow_end_x - head_dx, arrow_cy + head_dy)],
        fill=brand_accent,
        width=arrow_thickness,
        joint="curve",
    )
    # Rounded terminals for the arrow fins
    draw.ellipse(
        [arrow_end_x - head_dx - r_cap, arrow_cy - head_dy - r_cap, arrow_end_x - head_dx + r_cap, arrow_cy - head_dy + r_cap],
        fill=brand_accent,
    )
    draw.ellipse(
        [arrow_end_x - head_dx - r_cap, arrow_cy + head_dy - r_cap, arrow_end_x - head_dx + r_cap, arrow_cy + head_dy + r_cap],
        fill=brand_accent,
    )

    # 7. Footer (Bottom-Left)
    footer_x = 52 * scale
    footer_main_y = 378 * scale
    draw.text(
        (footer_x, footer_main_y),
        "Then open HazeSSH from Applications.",
        font=font_footer_main,
        fill=text_white,
    )

    footer_sub_y = 402 * scale
    draw.text(
        (footer_x, footer_sub_y),
        platform_text or "macOS 15+ · Apple Silicon",
        font=font_footer_sub,
        fill=text_subtle,
    )

    # Save 2x Retina PNG
    path_2x = os.path.join(output_dir, "background@2x.png")
    img.save(path_2x, "PNG", optimize=True)
    print(f"Generated Retina 2x artwork: {path_2x} ({width_px}x{height_px})")

    # Generate 1x standard resolution PNG via high-quality Lanczos downsampling
    img_1x = img.resize((width_pt, height_pt), Image.Resampling.LANCZOS)
    path_1x = os.path.join(output_dir, "background.png")
    img_1x.save(path_1x, "PNG", optimize=True)
    print(f"Generated 1x artwork: {path_1x} ({width_pt}x{height_pt})")

    # Generate multi-resolution TIFF using tiffutil if available
    path_tiff = os.path.join(output_dir, "background.tiff")
    try:
        subprocess.run(
            ["tiffutil", "-cathidpicheck", path_1x, path_2x, "-out", path_tiff],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        print(f"Generated Multi-Resolution TIFF: {path_tiff}")
    except Exception as e:
        print(f"Note: tiffutil skipped or unavailable ({e}), PNG assets ready.")


def main():
    parser = argparse.ArgumentParser(description="Generate HazeSSH DMG background artwork")
    parser.add_argument("--output-dir", default="assets/dmg", help="Output directory for artwork")
    parser.add_argument("--app-path", default=None, help="Path to HazeSSH.app to auto-detect platform specs")
    parser.add_argument("--platform-text", default=None, help="Explicit footer platform text")
    parser.add_argument("--width", type=int, default=720, help="Window width in points (default: 720)")
    parser.add_argument("--height", type=int, default=460, help="Window height in points (default: 460)")
    args = parser.parse_args()

    platform_text = args.platform_text
    if not platform_text:
        detected = detect_platform_text(args.app_path)
        platform_text = detected

    print(f"DMG Footer Platform text: '{platform_text}'")
    render_dmg_background(
        output_dir=args.output_dir,
        platform_text=platform_text,
        width_pt=args.width,
        height_pt=args.height,
    )


if __name__ == "__main__":
    main()
