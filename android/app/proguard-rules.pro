# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt

# React Native specific rules
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.common.internal.DoNotStrip

# Keep native methods
-keepclassmembers class * {
    native <methods>;
}

# React Native dev support classes
-keep class com.facebook.react.devsupport.** { *; }
-dontwarn com.facebook.react.devsupport.**
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# Hermes
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.hermes.**

# Keep our application classes
-keep class com.espaudiotrigger.** { *; }

# React Native Bridge
-keep,allowobfuscation class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep,allowobfuscation class * extends com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers,allowobfuscation class * extends com.facebook.react.bridge.NativeModule {
    @com.facebook.react.bridge.ReactMethod *;
}
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }

# For native libraries
-keepclasseswithmembernames class * {
    native <methods>;
}

# For ReactNativeBridgePackage
-keep class * implements com.facebook.react.ReactPackage

# Fresco
-keep class com.facebook.fresco.** { *; }
-keep interface com.facebook.fresco.** { *; }
-keep enum com.facebook.fresco.** { *; }

# Okio
-keep class sun.misc.Unsafe { *; }
-dontwarn java.nio.file.*
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-dontwarn okio.**