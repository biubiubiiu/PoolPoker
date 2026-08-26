plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.poolpoker.app"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.poolpoker.app"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = 1
        versionName = "1.0"

        ndk {
            abiFilters.addAll(listOf("arm64-v8a", "x86_64"))
        }
    }

    splits {
        abi {
            isEnable = false
        }
    }

    buildTypes {
        getByName("debug") {
            isMinifyEnabled = false
        }
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("debug")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
                "proguard-tauri.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation(project(":shared-models"))
    implementation(project(":tauri-android"))
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.google.material)
    implementation(libs.play.services.wearable)
    implementation(libs.gson)
    implementation(libs.socket.io.client)
}

apply(from = "tauri.build.gradle.kts")

listOf("Debug", "Release").forEach { variantName ->
    val isDebug = variantName.equals("debug", ignoreCase = true)

    val tauriTaskName = "buildTauri$variantName"
    val tauriTask = tasks.register(tauriTaskName, Exec::class.java) {
        group = "build"
        description = "Builds frontend and Rust shared library using Tauri CLI for $variantName"

        onlyIf {
            System.getenv("TAURI_CLI_VERBOSITY") == null && System.getenv("WRY_ANDROID_PACKAGE") == null
        }

        workingDir = rootDir.parentFile

        val javaHome = System.getProperty("java.home")
        if (javaHome != null) {
            environment("JAVA_HOME", javaHome)
        }

        val androidHome = System.getenv("ANDROID_HOME") ?: "${System.getProperty("user.home")}/Library/Android/sdk"
        environment("ANDROID_HOME", androidHome)

        val ndkParent = file("$androidHome/ndk")
        if (ndkParent.exists()) {
            val subFiles = ndkParent.listFiles()
            if (subFiles != null && subFiles.size > 0) {
                var newestNdk = subFiles[0]
                for (f in subFiles) {
                    if (f.isDirectory && f.name > newestNdk.name) {
                        newestNdk = f
                    }
                }
                environment("NDK_HOME", newestNdk.absolutePath)
            }
        }

        val cmdStr = if (isDebug) {
            "npx tauri android build --debug --apk"
        } else {
            "npx tauri android build --apk"
        }

        val isWindows = System.getProperty("os.name").lowercase().contains("win")
        if (isWindows) {
            commandLine("cmd", "/c", cmdStr)
        } else {
            val shellScript = """
                if [ -s "${'$'}HOME/.nvm/nvm.sh" ]; then
                    . "${'$'}HOME/.nvm/nvm.sh"
                    nvm use 24 >/dev/null 2>&1 || nvm use >/dev/null 2>&1 || true
                fi
                exec $cmdStr
            """.trimIndent()
            commandLine("sh", "-c", shellScript)
        }
    }

    tasks.matching { it.name == "merge${variantName}JniLibFolders" || it.name == "merge${variantName}Assets" }.configureEach {
        dependsOn(tauriTask)
    }
}

