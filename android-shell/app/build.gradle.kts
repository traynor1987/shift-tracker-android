import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val releaseKeystorePath = providers.environmentVariable("SHIFT_TRACKER_KEYSTORE_PATH").orNull
val releaseKeystorePassword = providers.environmentVariable("SHIFT_TRACKER_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("SHIFT_TRACKER_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("SHIFT_TRACKER_KEY_PASSWORD").orNull
val releaseSigningReady = listOf(
    releaseKeystorePath,
    releaseKeystorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { !it.isNullOrBlank() }

android {
    namespace = "site.chatgpt.traynor1987.dominosshifttracker"
    compileSdk = 35

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        // Permanent signed identity. It installs beside the legacy debug APK,
        // avoiding any need to uninstall it before data transfer is verified.
        applicationId = "site.chatgpt.traynor1987.dominosshifttracker.stable"
        minSdk = 26
        targetSdk = 35
        // versionCode is the authoritative Android update comparator. Keep it
        // ahead of the public 2.2.22 / 27 production APK.
        versionCode = 30
        versionName = "2.2.25"
        manifestPlaceholders["appLabel"] = "Shift Tracker"
    }

    signingConfigs {
        if (releaseSigningReady) {
            create("shiftTrackerRelease") {
                storeFile = file(requireNotNull(releaseKeystorePath))
                storePassword = requireNotNull(releaseKeystorePassword)
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
            }
        }
    }

    buildTypes {
        getByName("debug") {
            // GitHub-hosted debug runners do not retain a stable signing key.
            // Keep test builds side-by-side with the installed production shell
            // so device verification cannot overwrite or uninstall its WebView data.
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-gps-test"
            manifestPlaceholders["appLabel"] = "Shift Tracker GPS Test"
        }
        getByName("release") {
            signingConfig = signingConfigs.findByName("shiftTrackerRelease")
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    jvmToolchain(17)
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("com.google.android.gms:play-services-wearable:18.2.0")
    testImplementation(kotlin("test"))
}
