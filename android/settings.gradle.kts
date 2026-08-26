pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "PoolPokerAndroid"
include(":shared-models")
include(":wear-app")
include(":app")

apply(from = "tauri.settings.gradle")

// Auto-patch all subprojects (e.g. :tauri-android, :tauri-plugin-*) for AGP 9.0+ compatibility & missing ProGuard files
rootProject.children.forEach { child ->
    if (child.projectDir.exists()) {
        val consumerRulesFile = java.io.File(child.projectDir, "consumer-rules.pro")
        if (!consumerRulesFile.exists()) {
            try {
                consumerRulesFile.createNewFile()
            } catch (_: Exception) {}
        }
    }

    val buildScriptFiles = listOf(
        java.io.File(child.projectDir, "build.gradle.kts"),
        java.io.File(child.projectDir, "build.gradle")
    )
    for (buildScriptFile in buildScriptFiles) {
        if (buildScriptFile.exists()) {
            var text = buildScriptFile.readText()
            var modified = false
            if (text.contains("org.jetbrains.kotlin.android") || text.contains("kotlinOptions {")) {
                text = text.replace(Regex("""id\s*\(\s*["']org\.jetbrains\.kotlin\.android["']\s*\)"""), "")
                text = text.replace(Regex("""id\s+["']org\.jetbrains\.kotlin\.android["']"""), "")
                text = text.replace(Regex("""kotlinOptions\s*\{[\s\S]*?\}"""), "")
                modified = true
            }
            if (modified) {
                buildScriptFile.writeText(text)
            }
        }
    }
}


