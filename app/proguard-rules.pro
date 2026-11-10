# DramaPocket ProGuard Rules

# Preserve all JavascriptInterface annotations and methods
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve the bridge and main activity
-keep class com.dramapocket.app.MainActivity { *; }
-keep class com.dramapocket.app.AndroidBridge { *; }
-keepclassmembers class com.dramapocket.app.AndroidBridge {
    public *;
}

# Preserve Android framework callback methods in views
-keepclassmembers class * extends android.view.View {
    void set*(...);
    void get*(...);
}

# Keep line numbers and source file names for clean crash stack traces
-keepattributes SourceFile,LineNumberTable
