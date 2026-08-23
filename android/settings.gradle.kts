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

// Auto-patch :tauri-android for AGP 9.0+ compatibility on any machine
val tauriProject = rootProject.children.find { it.name == "tauri-android" }
if (tauriProject != null) {
    val buildScriptFile = java.io.File(tauriProject.projectDir, "build.gradle.kts")
    if (buildScriptFile.exists()) {
        var text = buildScriptFile.readText()
        if (text.contains("id(\"org.jetbrains.kotlin.android\")") || text.contains("kotlinOptions {")) {
            text = text.replace("id(\"org.jetbrains.kotlin.android\")", "")
            text = text.replace(Regex("""kotlinOptions\s*\{[\s\S]*?\}"""), "")
            buildScriptFile.writeText(text)
        }
    }
}


