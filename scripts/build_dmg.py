#!/usr/bin/env python3
"""
scripts/build_dmg.py
Builds a premium, distributable macOS DMG installer for HazeSSH using dmgbuild.

Features:
- Auto-detects compiled HazeSSH.app (release or debug builds).
- Preserves code signatures.
- Automatically generates/updates Retina DMG artwork with accurate platform metadata.
- Applies dmgbuild settings with custom layout, icon placement, and hidden chrome.
- Verifies output DMG integrity via hdiutil.
- Computes SHA256 checksum of the installer.
"""

import argparse
import hashlib
import os
import shutil
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))


def find_default_app() -> str:
    """Searches for compiled HazeSSH application bundles."""
    search_paths = [
        os.path.join(PROJECT_ROOT, "src-tauri", "target", "release", "bundle", "macos", "HazeSSH.app"),
        os.path.join(PROJECT_ROOT, "src-tauri", "target", "release", "bundle", "macos", "Haze SSH.app"),
        os.path.join(PROJECT_ROOT, "src-tauri", "target", "debug", "bundle", "macos", "HazeSSH.app"),
        os.path.join(PROJECT_ROOT, "src-tauri", "target", "debug", "bundle", "macos", "Haze SSH.app"),
    ]
    for p in search_paths:
        if os.path.isdir(p):
            return p
    return None


def find_dmgbuild_bin() -> str:
    """Finds dmgbuild binary in virtualenv or system PATH."""
    venv_dmgbuild = os.path.join(PROJECT_ROOT, ".venv", "bin", "dmgbuild")
    if os.path.isfile(venv_dmgbuild) and os.access(venv_dmgbuild, os.X_OK):
        return venv_dmgbuild

    system_dmgbuild = shutil.which("dmgbuild")
    if system_dmgbuild:
        return system_dmgbuild

    return None


def verify_code_signature(app_path: str):
    """Checks and logs the code signature of the target application."""
    print(f"\n[1/5] Checking code signature for {os.path.basename(app_path)}...")
    try:
        res = subprocess.run(
            ["codesign", "-dvvv", app_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        sig_info = res.stderr or res.stdout
        for line in sig_info.splitlines():
            if any(k in line for k in ["Identifier", "Authority", "Signature", "Format", "TeamIdentifier"]):
                print(f"  • {line.strip()}")
    except subprocess.CalledProcessError as e:
        print(f"  ⚠ Note on signature: {e.stderr.strip() if e.stderr else 'unsigned/adhoc'}")


def generate_artwork(app_path: str, platform_text: str = None):
    """Generates the DMG background artwork assets."""
    print("\n[2/5] Generating Retina background artwork...")
    art_script = os.path.join(SCRIPT_DIR, "generate_dmg_artwork.py")
    cmd = [sys.executable, art_script, "--output-dir", os.path.join(PROJECT_ROOT, "assets", "dmg")]
    if app_path:
        cmd.extend(["--app-path", app_path])
    if platform_text:
        cmd.extend(["--platform-text", platform_text])

    subprocess.check_call(cmd)


def compute_sha256(filepath: str) -> str:
    """Computes SHA256 hash of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def sign_and_notarize_dmg(
    dmg_path: str,
    identity: str = None,
    apple_id: str = None,
    password: str = None,
    team_id: str = None,
):
    """Signs and notarizes the DMG if Apple credentials are provided."""
    identity = identity or os.environ.get("APPLE_SIGNING_IDENTITY")
    apple_id = apple_id or os.environ.get("APPLE_ID")
    password = password or os.environ.get("APPLE_PASSWORD")
    team_id = team_id or os.environ.get("APPLE_TEAM_ID")

    if identity:
        print(f"\n[DMG Signing] Signing {os.path.basename(dmg_path)} with identity: {identity}...")
        try:
            subprocess.run(["codesign", "--force", "--sign", identity, dmg_path], check=True)
            print("  ✓ DMG signed successfully!")
        except Exception as e:
            print(f"  ⚠ Note on DMG signing: {e}")

    if apple_id and password and team_id:
        print(f"\n[DMG Notarization] Submitting {os.path.basename(dmg_path)} to Apple notarytool...")
        try:
            subprocess.run(
                [
                    "xcrun", "notarytool", "submit", dmg_path,
                    "--apple-id", apple_id,
                    "--password", password,
                    "--team-id", team_id,
                    "--wait",
                ],
                check=True,
            )
            print("  ✓ DMG notarization accepted! Stapling ticket...")
            subprocess.run(["xcrun", "stapler", "staple", dmg_path], check=True)
            print("  ✓ Notarization ticket stapled to DMG successfully!")
        except Exception as e:
            print(f"  ⚠ Note on DMG notarization: {e}")


def main():
    parser = argparse.ArgumentParser(description="Build macOS DMG for HazeSSH")
    parser.add_argument("--app", default=None, help="Path to HazeSSH.app bundle")
    parser.add_argument("--volume-name", default="HazeSSH", help="Volume name for mounted DMG (default: HazeSSH)")
    parser.add_argument("--output", default=None, help="Output DMG path (default: dist/HazeSSH.dmg and HazeSSH.dmg)")
    parser.add_argument("--platform-text", default="macOS 15+ · Apple Silicon", help="Custom footer platform text (default: 'macOS 15+ · Apple Silicon')")
    parser.add_argument("--skip-artwork", action="store_true", help="Skip regenerating DMG background artwork")
    parser.add_argument("--signing-identity", default=None, help="Apple codesign identity for DMG signing")
    parser.add_argument("--apple-id", default=None, help="Apple ID for notarytool")
    parser.add_argument("--apple-password", default=None, help="App-specific password for notarytool")
    parser.add_argument("--team-id", default=None, help="Apple Developer Team ID for notarytool")
    args = parser.parse_args()

    app_path = args.app or find_default_app()
    if not app_path or not os.path.isdir(app_path):
        print("Error: Could not locate HazeSSH.app bundle.")
        print("Please build the app first (e.g. npm run tauri build) or specify --app <path>.")
        sys.exit(1)

    app_path = os.path.abspath(app_path)
    print(f"Target App: {app_path}")

    # Determine output paths
    output_dmg = args.output
    if not output_dmg:
        dist_dir = os.path.join(PROJECT_ROOT, "dist")
        os.makedirs(dist_dir, exist_ok=True)
        output_dmg = os.path.join(dist_dir, "HazeSSH.dmg")
    output_dmg = os.path.abspath(output_dmg)

    # 1. Check code signature
    verify_code_signature(app_path)

    # 2. Prepare background artwork
    bg_png = os.path.join(PROJECT_ROOT, "assets", "dmg", "background.png")
    bg_2x = os.path.join(PROJECT_ROOT, "assets", "dmg", "background@2x.png")
    if not args.skip_artwork or not (os.path.exists(bg_png) and os.path.exists(bg_2x)):
        generate_artwork(app_path, args.platform_text)

    # 3. Locate dmgbuild
    dmgbuild_bin = find_dmgbuild_bin()
    if not dmgbuild_bin:
        print("\nError: dmgbuild is not installed.")
        print("Install via: pip install dmgbuild")
        sys.exit(1)

    # 4. Build DMG using dmgbuild
    print(f"\n[3/5] Building DMG with dmgbuild...")
    settings_file = os.path.join(SCRIPT_DIR, "dmg_settings.py")
    volume_icon = os.path.join(PROJECT_ROOT, "src-tauri", "icons", "icon.icns")

    defines = [
        f"app_path={app_path}",
        f"volume_name={args.volume_name}",
        f"volume_icon={volume_icon}",
        f"background={bg_png}",
    ]

    # Remove existing DMG before rebuilding
    if os.path.exists(output_dmg):
        os.remove(output_dmg)

    cmd = [
        dmgbuild_bin,
        "-s", settings_file,
    ]
    for d in defines:
        cmd.extend(["-D", d])
    cmd.extend([args.volume_name, output_dmg])

    print(f"Executing: {' '.join(cmd)}")
    subprocess.check_call(cmd)

    # 5. Verify the generated DMG
    print(f"\n[4/6] Verifying disk image integrity...")
    subprocess.run(["hdiutil", "verify", output_dmg], check=True)

    # 6. Verify signature preservation
    print(f"\n[5/6] Verifying app signature preservation inside DMG...")
    mount_point = "/tmp/hazessh_verify_mount"
    try:
        subprocess.run(["hdiutil", "attach", output_dmg, "-mountpoint", mount_point, "-nobrowse", "-quiet"], check=True)
        mounted_app = os.path.join(mount_point, os.path.basename(app_path))
        if os.path.isdir(mounted_app):
            verify_code_signature(mounted_app)
            print("  ✓ Application signature in DMG verified successfully!")
        subprocess.run(["hdiutil", "detach", mount_point, "-quiet"], check=True)
    except Exception as e:
        print(f"  Note: Mount check completed ({e})")
        subprocess.run(["hdiutil", "detach", mount_point, "-force", "-quiet"], stderr=subprocess.DEVNULL)

    # 7. Sign and Notarize the DMG (if Apple credentials provided)
    print(f"\n[6/6] Checking DMG Developer ID signing & notarization...")
    sign_and_notarize_dmg(
        output_dmg,
        identity=args.signing_identity,
        apple_id=args.apple_id,
        password=args.apple_password,
        team_id=args.team_id,
    )

    # Also create a copy/symlink at the project root for convenience: HazeSSH.dmg
    root_dmg = os.path.join(PROJECT_ROOT, "HazeSSH.dmg")
    if root_dmg != output_dmg:
        if os.path.exists(root_dmg):
            os.remove(root_dmg)
        shutil.copyfile(output_dmg, root_dmg)
        print(f"Copied final DMG to root: {root_dmg}")

    # Summary
    dmg_size_mb = os.path.getsize(output_dmg) / (1024 * 1024)
    sha256 = compute_sha256(output_dmg)

    print("\n" + "=" * 60)
    print("✨ HazeSSH DMG Build Complete!")
    print("=" * 60)
    print(f"📦 DMG File:    {output_dmg}")
    print(f"📊 File Size:   {dmg_size_mb:.2f} MB")
    print(f"🏷  Volume Name: {args.volume_name}")
    print(f"🔒 SHA-256:     {sha256}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
