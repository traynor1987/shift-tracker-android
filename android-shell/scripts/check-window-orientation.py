#!/usr/bin/env python3
"""Guard narrow portrait fallback and in-place wide-window configuration changes."""
from pathlib import Path
import xml.etree.ElementTree as ET

ns = "{http://schemas.android.com/apk/res/android}"
root = ET.parse("app/src/main/AndroidManifest.xml").getroot()
activity = next(a for a in root.findall("application/activity") if a.get(ns + "name") == ".MainActivity")
assert activity.get(ns + "screenOrientation") == "portrait"
assert set(activity.get(ns + "configChanges", "").split("|")) >= {
    "orientation", "screenSize", "smallestScreenSize", "screenLayout", "density",
}
source = Path("app/src/main/java/site/chatgpt/traynor1987/dominosshifttracker/MainActivity.kt").read_text()
assert "applyWindowOrientation(resources.configuration)" in source
handler = source.split("override fun onConfigurationChanged(", 1)[1].split("override fun onResume()", 1)[0]
assert "applyWindowOrientation(newConfig)" in handler
assert "webView.requestLayout()" in handler
assert "WebView(this)" not in handler and "loadTracker()" not in handler
print("Portrait fallback, responsive policy wiring and in-place fold configuration guard passed")
