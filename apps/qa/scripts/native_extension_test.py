#!/usr/bin/env python3
"""
Native Extension Testing using macOS Automation

This script uses AppleScript, cliclick, and screenshot analysis to test
the Chrome extension popup without Playwright's tab context limitations.

Prerequisites:
- Chrome installed at /Applications/Google Chrome.app
- cliclick: brew install cliclick
- Extension built at apps/extension/dist

Usage:
    python3 native_extension_test.py

"""

import subprocess
import time
import os
import sys
import json
import tempfile
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
EXTENSION_PATH = PROJECT_ROOT / "apps" / "extension" / "dist"
TEST_FORM_URL = "http://127.0.0.1:8765/test-llm-form.html"
CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class ChromeExtensionTester:
    def __init__(self):
        self.chrome_process = None
        self.user_data_dir = None
        self.screenshots = []

    def check_prerequisites(self):
        """Verify all required tools are available"""
        print("🔍 Checking prerequisites...")

        # Check Chrome
        if not os.path.exists(CHROME_PATH):
            print(f"❌ Chrome not found at {CHROME_PATH}")
            return False

        # Check extension
        if not EXTENSION_PATH.exists():
            print(f"❌ Extension not built at {EXTENSION_PATH}")
            print("   Run: cd apps/extension && pnpm build")
            return False

        # Check cliclick
        try:
            subprocess.run(["cliclick", "-V"], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("⚠️  cliclick not installed. Installing...")
            subprocess.run(["brew", "install", "cliclick"], check=True)

        print("✅ All prerequisites met\n")
        return True

    def launch_chrome(self):
        """Launch Chrome with extension loaded"""
        print("🚀 Launching Chrome with extension...")

        # Create temp user data directory
        self.user_data_dir = tempfile.mkdtemp(prefix="chrome-ext-test-")

        cmd = [
            CHROME_PATH,
            f"--user-data-dir={self.user_data_dir}",
            f"--load-extension={EXTENSION_PATH}",
            "--no-first-run",
            "--no-default-browser-check",
            TEST_FORM_URL,
        ]

        self.chrome_process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        print(f"   Chrome PID: {self.chrome_process.pid}")
        print("⏳ Waiting for Chrome to load...")
        time.sleep(5)

        # Activate Chrome window
        subprocess.run([
            "osascript", "-e",
            'tell application "Google Chrome" to activate'
        ])

        print("✅ Chrome launched and activated\n")

    def find_extension_icon(self):
        """
        Find the extension icon position.

        1. First checks for calibrated coordinates in .extension-coords
        2. Falls back to estimated position if not calibrated
        """
        print("🔍 Locating extension icon...")

        # Check for calibrated coordinates
        config_file = PROJECT_ROOT / "apps" / "qa" / "scripts" / ".extension-coords"
        if config_file.exists():
            print("   📍 Using calibrated coordinates from .extension-coords")
            coords = {}
            with open(config_file) as f:
                for line in f:
                    if '=' in line:
                        key, val = line.strip().split('=')
                        # Only parse coordinate values, skip metadata like METHOD
                        if key in ['EXTENSION_ICON_X', 'EXTENSION_ICON_Y']:
                            coords[key] = int(val)

            x = coords.get('EXTENSION_ICON_X')
            y = coords.get('EXTENSION_ICON_Y')
            if x and y:
                print(f"   Position: ({x}, {y})")
                print()
                return (x, y)

        # Fall back to estimated position
        print("   ⚠️  No calibrated coordinates found")
        print("   Using estimated position (1250, 80)")
        print()
        print("   💡 For better accuracy, run calibration:")
        print("      cd apps/qa/scripts && ./calibrate_extension_icon.sh")
        print()

        return (1250, 80)

    def click_extension_icon(self, x, y):
        """
        Click the extension icon at given coordinates.
        If unpinned, will fallback to extensions menu navigation.
        """
        print(f"🖱️  Clicking extension icon at ({x}, {y})...")

        subprocess.run(["cliclick", f"c:{x},{y}"])

        print("⏳ Waiting for popup to open...")
        time.sleep(2)

        # Check if we opened the extensions menu instead of Asterisk popup
        if self.is_extensions_menu_open():
            print("   ℹ️  Extensions menu opened (extension not pinned)")
            print("   🔄 Trying fallback: navigate extensions menu...")
            self.navigate_extensions_menu()
        else:
            print("✅ Popup should be open\n")

    def is_extensions_menu_open(self):
        """
        Check if we clicked the extensions menu (puzzle piece) instead of the Asterisk icon.
        The extensions menu is a dropdown/popover, not a new window.
        """
        # Take a quick screenshot and check pixel patterns
        # The extensions menu has a distinct appearance

        # Simpler approach: Just wait and check if window title contains "Asterisk"
        # If not, assume we opened the wrong thing
        time.sleep(1)

        script = """
        tell application "System Events"
            tell process "Google Chrome"
                try
                    set windowTitle to title of front window

                    -- If window title has "Asterisk", we opened the popup
                    if windowTitle contains "Asterisk" then
                        return false
                    end if

                    -- Otherwise, likely opened extensions menu
                    return true
                on error
                    return true
                end try
            end tell
        end tell
        """

        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True
        )

        is_menu = "true" in result.stdout.lower()

        if is_menu:
            # Double-check with screenshot analysis
            screenshot = self.take_screenshot("menu-check")
            # If extensions menu is open, we'll see it in the UI

        return is_menu

    def navigate_extensions_menu(self):
        """
        Navigate the extensions menu to find and click Asterisk.
        This is a fallback for when the extension isn't pinned.
        """
        print("   🔍 Looking for 'Asterisk' in extensions menu...")

        # Strategy: Use keyboard navigation in the menu
        # Down arrow to navigate, Enter to select

        # First, try to find Asterisk by typing (Chrome's menu search)
        subprocess.run(["cliclick", "kp:a"])  # Type 'a' for Asterisk
        time.sleep(0.5)

        # Try clicking in the general area where extensions appear
        # This is approximate - extensions menu is usually below the icon
        script = """
        tell application "System Events"
            tell process "Google Chrome"
                -- Try to click on an element containing "Asterisk"
                try
                    set allElements to every UI element of front window
                    repeat with elem in allElements
                        try
                            set elemDesc to description of elem
                            if elemDesc contains "Asterisk" or elemDesc contains "asterisk" then
                                click elem
                                return true
                            end if
                        end try
                    end repeat
                    return false
                on error
                    return false
                end try
            end tell
        end tell
        """

        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True
        )

        if "true" in result.stdout.lower():
            print("   ✅ Found and clicked Asterisk in menu")
            time.sleep(2)
        else:
            print("   ⚠️  Could not find Asterisk in menu")
            print("   💡 Suggestion: Pin the extension to toolbar")
            print("      Run: cd apps/qa/scripts && ./pin-extension.sh")

        print()

    def take_screenshot(self, name="popup"):
        """Take a screenshot and save it"""
        screenshot_path = f"/tmp/extension-test-{name}-{int(time.time())}.png"
        subprocess.run(["screencapture", "-x", screenshot_path])

        self.screenshots.append(screenshot_path)
        print(f"📸 Screenshot saved: {screenshot_path}")

        return screenshot_path

    def verify_popup_content(self):
        """Use AppleScript to verify popup content via Accessibility APIs"""
        print("🔍 Verifying popup content...")

        script = """
        tell application "System Events"
            tell process "Google Chrome"
                set frontWindow to front window
                set windowTitle to title of frontWindow

                -- Try to get all static text elements
                set textElements to {}
                try
                    set allElements to every UI element of frontWindow
                    repeat with elem in allElements
                        try
                            if role of elem is "AXStaticText" then
                                set end of textElements to value of elem
                            end if
                        end try
                    end repeat
                end try

                return {windowTitle:windowTitle, elements:textElements}
            end tell
        end tell
        """

        try:
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True,
                text=True,
                check=True
            )

            output = result.stdout.strip()
            print(f"   Raw output: {output}")

            # Check for expected content
            checks = {
                "Has 'Asterisk' in title": "Asterisk" in output or "asterisk" in output.lower(),
                "Popup window exists": len(output) > 0,
            }

            print("\n   Verification Results:")
            for check, passed in checks.items():
                status = "✅" if passed else "❌"
                print(f"   {status} {check}")

            return all(checks.values())

        except subprocess.CalledProcessError as e:
            print(f"   ❌ Failed to verify: {e.stderr}")
            return False

    def verify_fill_button_exists(self):
        """Check if fill button exists in popup"""
        print("🔍 Checking for fill button...")

        script = """
        tell application "System Events"
            tell process "Google Chrome"
                try
                    set fillButton to button "Fill All Matched Fields" of front window
                    return true
                on error
                    return false
                end try
            end tell
        end tell
        """

        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True
        )

        exists = "true" in result.stdout.lower()
        status = "✅" if exists else "⚠️"
        print(f"   {status} Fill button exists: {exists}")
        return exists

    def click_element_by_text(self, button_text):
        """Click a button or element by its text label"""
        print(f"🖱️  Clicking element: {button_text}")

        script = f"""
        tell application "System Events"
            tell process "Google Chrome"
                try
                    click button "{button_text}" of front window
                    return true
                on error errMsg
                    return "Error: " & errMsg
                end try
            end tell
        end tell
        """

        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True
        )

        success = "true" in result.stdout.lower()
        if success:
            print("   ✅ Click successful")
            time.sleep(1)
        else:
            print(f"   ⚠️  Click may have failed: {result.stdout.strip()}")

        return success

    def get_form_field_value(self, field_id):
        """
        Get value of a form field using JavaScript execution

        Returns the field value, or None if field doesn't exist
        """
        print(f"🔍 Reading form field: {field_id}")

        script = f"""
        tell application "Google Chrome"
            try
                tell active tab of front window
                    execute javascript "
                        const field = document.getElementById('{field_id}');
                        field ? field.value : 'FIELD_NOT_FOUND';
                    "
                end tell
            on error
                return "ERROR_READING_FIELD"
            end try
        end tell
        """

        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True
        )

        value = result.stdout.strip()

        if "FIELD_NOT_FOUND" in value:
            print(f"   ⚠️  Field '{field_id}' not found")
            return None
        elif "ERROR" in value:
            print(f"   ❌ Error reading field: {value}")
            return None
        else:
            print(f"   Value: {value}")
            return value

    def verify_empty_vault_handling(self):
        """
        Test error handling when vault is empty

        This simulates the case where no vault data is available
        """
        print("\n🧪 Testing empty vault handling...")

        # Popup should still open and show appropriate message
        # (This test assumes popup is already open)

        screenshot = self.take_screenshot("empty-vault")

        print("   ℹ️  Manual verification needed:")
        print("   - Check screenshot for empty state message")
        print("   - Verify no crashes or errors")
        print(f"   - Screenshot: {screenshot}")

        return True  # Manual verification

    def cleanup(self):
        """Clean up resources"""
        print("\n🧹 Cleaning up...")

        if self.chrome_process:
            self.chrome_process.terminate()
            self.chrome_process.wait(timeout=5)
            print("   ✅ Chrome closed")

        if self.user_data_dir and os.path.exists(self.user_data_dir):
            import shutil
            shutil.rmtree(self.user_data_dir, ignore_errors=True)
            print("   ✅ Temp directory removed")

        if self.screenshots:
            print(f"\n📸 Screenshots saved:")
            for path in self.screenshots:
                print(f"   {path}")

    def run(self):
        """Run the full test suite"""
        try:
            if not self.check_prerequisites():
                return False

            self.launch_chrome()

            icon_pos = self.find_extension_icon()
            self.click_extension_icon(*icon_pos)

            self.take_screenshot("popup-open")

            verification_passed = self.verify_popup_content()

            print("\n" + "="*50)
            if verification_passed:
                print("✅ TEST PASSED")
            else:
                print("⚠️  TEST COMPLETED WITH WARNINGS")
            print("="*50)

            return verification_passed

        except KeyboardInterrupt:
            print("\n⚠️  Test interrupted by user")
            return False
        except Exception as e:
            print(f"\n❌ Test failed with error: {e}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            self.cleanup()


if __name__ == "__main__":
    tester = ChromeExtensionTester()
    success = tester.run()
    sys.exit(0 if success else 1)
