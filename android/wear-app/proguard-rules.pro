# ProGuard rules for PoolPoker Wear OS App

# Preserve attributes required for reflection, annotations, and readable stack traces
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations

# Gson Keep Rules
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keepclassmembers enum * {
    @com.google.gson.annotations.SerializedName <fields>;
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
-keep class com.google.gson.** { *; }

# PoolPoker Shared Data Models
# Keep all models used for Gson serialization over Socket.IO and Wear OS Data Layer
-keep class com.poolpoker.shared.** { *; }
-keepclassmembers class com.poolpoker.shared.** { *; }

# Socket.IO / Engine.IO Client
-keep class io.socket.** { *; }
-keep class engine.io.** { *; }

# OkHttp & Okio (used by Socket.IO)
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# Google Play Services Wearable Data Layer API
-keep class com.google.android.gms.wearable.** { *; }
-dontwarn com.google.android.gms.wearable.**

# Kotlin Coroutines
-dontwarn kotlinx.coroutines.**
