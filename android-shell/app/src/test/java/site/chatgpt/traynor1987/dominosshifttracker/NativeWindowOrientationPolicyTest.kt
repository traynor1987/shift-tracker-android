package site.chatgpt.traynor1987.dominosshifttracker

import java.io.File
import kotlin.test.*

class NativeWindowOrientationPolicyTest {
    @Test fun narrowAndFoldedWindowsStayPortraitInEitherRotation() {
        assertEquals(NativeWindowOrientationPolicy.Mode.PORTRAIT, NativeWindowOrientationPolicy.mode(380, 840, 380))
        assertEquals(NativeWindowOrientationPolicy.Mode.PORTRAIT, NativeWindowOrientationPolicy.mode(840, 380, 380))
        assertEquals(NativeWindowOrientationPolicy.Mode.PORTRAIT, NativeWindowOrientationPolicy.mode(599, 800, 599))
    }
    @Test fun expandedWindowsAllowSensorRotationAt600DpAndRemainStable() {
        assertEquals(NativeWindowOrientationPolicy.Mode.FULL_SENSOR, NativeWindowOrientationPolicy.mode(600, 800, 380))
        assertEquals(NativeWindowOrientationPolicy.Mode.FULL_SENSOR, NativeWindowOrientationPolicy.mode(800, 600, 380))
    }
    @Test fun missingWindowDimensionsUseConservativeConfigurationFallback() {
        assertEquals(NativeWindowOrientationPolicy.Mode.PORTRAIT, NativeWindowOrientationPolicy.mode(0, 0, 0))
        assertEquals(NativeWindowOrientationPolicy.Mode.FULL_SENSOR, NativeWindowOrientationPolicy.mode(0, 0, 600))
    }
    @Test fun shippedConfigurationChangeReusesWebViewAndKeepsPortraitFallback() {
        val root = File(System.getProperty("nativeSourceDirectory", "src/main/java/site/chatgpt/traynor1987/dominosshifttracker"))
        val activity = File(root, "MainActivity.kt").readText()
        val handler = activity.substringAfter("override fun onConfigurationChanged(").substringBefore("    override fun onResume()")
        assertTrue(handler.contains("super.onConfigurationChanged(newConfig)"))
        assertTrue(handler.contains("applyWindowOrientation(newConfig)"))
        assertTrue(handler.contains("webView.requestLayout()"))
        assertFalse(handler.contains("WebView(this)")); assertFalse(handler.contains("loadTracker()"))
        assertTrue(activity.contains("applyWindowOrientation(resources.configuration)"))
        val manifest = File(System.getProperty("nativeManifestPath", "src/main/AndroidManifest.xml")).readText()
        assertTrue(manifest.contains("android:screenOrientation=\"portrait\""))
        assertTrue(manifest.contains("orientation|screenSize|smallestScreenSize|screenLayout|density"))
    }
}
