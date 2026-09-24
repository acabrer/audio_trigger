package com.espaudiotrigger

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Registers this app's native modules (WifiLockModule, AudioDeviceModule). Added
 * manually in MainApplication.getPackages(). Legacy ReactPackage modules are
 * bridged into the New Architecture via the TurboModule interop layer, the same
 * path react-native-udp/notifee use here.
 */
class WifiLockPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): List<NativeModule> = listOf(
        WifiLockModule(reactContext),
        AudioDeviceModule(reactContext),
    )

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<*, *>> = emptyList()
}
