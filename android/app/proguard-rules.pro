# PoolPoker ProGuard / R8 Obfuscation & Minification Rules

# 1. Keep Tauri Android Core & Plugins
-keep class app.tauri.** { *; }
-keepclassmembers class app.tauri.** { *; }
-keep class com.poolpoker.app.** { *; }
-keepclassmembers class com.poolpoker.app.** {
    native <methods>;
    public static <methods>;
    *;
}
-keep class * implements androidx.annotation.Keep
-keep @androidx.annotation.Keep class * { *; }
-keepclassmembers class * {
    @androidx.annotation.Keep *;
}

# 2. Keep Shared DataLayer Models (Gson Serialization & Wear Sync)
-keep class com.poolpoker.shared.** { *; }
-keepclassmembers class com.poolpoker.shared.** { *; }

# 3. Keep Gson Annotations & Serialized Fields
-keepattributes Signature, *Annotation*, EnclosingMethod, InnerClasses
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# 4. Keep Socket.IO Client & OkHttp
-keep class io.socket.** { *; }
-keepclassmembers class io.socket.** { *; }
-keep class okhttp3.** { *; }
