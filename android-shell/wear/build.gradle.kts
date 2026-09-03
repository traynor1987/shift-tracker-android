import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val releaseKeystorePath = providers.environmentVariable("SHIFT_TRACKER_KEYSTORE_PATH").orNull
val releaseKeystorePassword = providers.environmentVariable("SHIFT_TRACKER_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("SHIFT_TRACKER_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("SHIFT_TRACKER_KEY_PASSWORD").orNull
val releaseSigningReady = listOf(releaseKeystorePath, releaseKeystorePassword, releaseKeyAlias, releaseKeyPassword).all { !it.isNullOrBlank() }

android {
    namespace = "site.chatgpt.traynor1987.dominosshifttracker.wear"
    compileSdk = 35
    defaultConfig {
        // Same signed application identity is required for the phone/watch Data Layer relationship.
        applicationId = "site.chatgpt.traynor1987.dominosshifttracker.stable"
        minSdk = 30
        targetSdk = 35
        versionCode = 35
        versionName = "2.2.30"
    }
    signingConfigs {
        if (releaseSigningReady) create("shiftTrackerRelease") {
            storeFile = file(requireNotNull(releaseKeystorePath)); storePassword = requireNotNull(releaseKeystorePassword)
            keyAlias = requireNotNull(releaseKeyAlias); keyPassword = requireNotNull(releaseKeyPassword)
        }
    }
    buildTypes {
        getByName("release") { signingConfig = signingConfigs.findByName("shiftTrackerRelease"); isMinifyEnabled = false }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

kotlin { jvmToolchain(17); compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.wear:wear:1.3.0")
    implementation("androidx.wear.tiles:tiles:1.6.2")
    implementation("androidx.wear.protolayout:protolayout:1.4.2")
    implementation("androidx.concurrent:concurrent-futures:1.2.0")
    implementation("com.google.android.gms:play-services-wearable:18.2.0")
}
