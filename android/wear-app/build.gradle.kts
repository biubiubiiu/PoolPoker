import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.poolpoker.wear"
    compileSdk = libs.versions.compileSdk.get().toInt()

    val localProps = Properties()
    val localFile = rootProject.file("gradle.properties.local")
    if (localFile.exists()) {
        localProps.load(localFile.inputStream())
    }
    val serverUrl = localProps.getProperty("POOLPOKER_SERVER_URL") ?: "https://www.shyren.xyz:3000"

    defaultConfig {
        applicationId = "com.poolpoker.wear"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = 1
        versionName = "1.0"

        buildConfigField("String", "SERVER_URL", "\"$serverUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("debug")
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

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.material.icons.core)
    implementation(libs.androidx.compose.material.icons.extended)

    // Wear OS Compose (Material 3 & Foundation)
    implementation(libs.androidx.wear.compose.material3)
    implementation(libs.androidx.wear.compose.foundation)
    implementation(libs.androidx.wear.compose.navigation)

    implementation(libs.androidx.activity.compose)

    // Google Play Services Wearable
    implementation(libs.play.services.wearable)

    // Gson & Socket.IO
    implementation(libs.socket.io.client)
    implementation(libs.gson)
}

