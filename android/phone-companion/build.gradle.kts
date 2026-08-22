import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.poolpoker.companion"
    compileSdk = libs.versions.compileSdk.get().toInt()

    val localProps = Properties()
    val localFile = rootProject.file("gradle.properties.local")
    if (localFile.exists()) {
        localProps.load(localFile.inputStream())
    }
    val serverUrl = localProps.getProperty("POOLPOKER_SERVER_URL") ?: "https://www.shyren.xyz:3000"

    defaultConfig {
        applicationId = "com.poolpoker.companion"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = 1
        versionName = "1.0"

        buildConfigField("String", "SERVER_URL", "\"$serverUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(project(":shared-models"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)

    // Compose Material 3
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)

    // Google Play Services Wearable (DataLayer API)
    implementation(libs.play.services.wearable)

    // Socket.IO Java Client & Gson
    implementation(libs.socket.io.client)
    implementation(libs.gson)
}

