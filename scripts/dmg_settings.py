"""
scripts/dmg_settings.py
dmgbuild settings configuration file for HazeSSH.

This file is loaded by dmgbuild to create the customized, polished macOS DMG.
"""

import os

# Volume & Output Parameters
app_path = defines.get("app_path", "src-tauri/target/debug/bundle/macos/HazeSSH.app")
app_name = os.path.basename(app_path)
volume_name = defines.get("volume_name", "HazeSSH")
volume_icon = defines.get("volume_icon", "src-tauri/icons/icon.icns")
background = defines.get("background", "assets/dmg/background.png")

# Compression & Filesystem: UDZO (zlib compressed, standard for macOS distribution)
format = "UDZO"
filesystem = "HFS+"

# Contents to include
files = [app_path]
symlinks = {"Applications": "/Applications"}

# Volume Icon & Badge (custom HazeSSH icon)
if os.path.isfile(volume_icon):
    icon = volume_icon
    badge_icon = volume_icon

# Window dimensions in logical points (720 × 460 pt)
# Finder window bounds: ((x, y), (w, h))
window_rect = ((200, 120), (720, 460))

# View Configuration
default_view = "icon-view"
icon_size = 112
text_size = 13
label_pos = "bottom"

# Finder Window Chrome (Disable toolbars, status bar, sidebar for a clean installer presentation)
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
sidebar_width = 0

# Icon locations (points from top-left)
# Container is centered from x=52 to x=668, y=136 to y=352.
# HazeSSH icon center: (196, 240)
# Applications folder icon center: (524, 240)
# Central arrow on background is aligned at (360, 240)
icon_locations = {
    app_name: (196, 240),
    "Applications": (524, 240),
}

# Hide file extension for the application in Finder
hide_extensions = [app_name]

# Items to explicitly mark as hidden (leading-dot files are already hidden natively by macOS)
hide = []
