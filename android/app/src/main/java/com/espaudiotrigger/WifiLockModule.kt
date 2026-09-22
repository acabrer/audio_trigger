package com.espaudiotrigger

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Holds a high-performance Wi-Fi lock so the radio does not drop into power-save
 * mode while the screen is off. Combined with the foreground service, this keeps
 * incoming UDP packets flowing during device sleep (the classic "stops receiving
 * until I wake the phone" symptom).
 *
 * Exposed to JS as NativeModules.WifiLock with acquire()/release(). The lock is
 * NOT reference counted here (setReferenceCounted(false)) — acquire/release are
 * idempotent, which matches the JS-side guard in src/services/wifiLock.ts.
 */
class WifiLockModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var wifiLock: WifiManager.WifiLock? = null

    override fun getName(): String = NAME

    @ReactMethod
    fun acquire(promise: Promise) {
        try {
            val lock = wifiLock ?: createLock().also { wifiLock = it }
            if (!lock.isHeld) {
                lock.acquire()
            }
            Log.i(NAME, "Wi-Fi lock acquired")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(NAME, "Failed to acquire Wi-Fi lock", e)
            promise.reject("WIFI_LOCK_ACQUIRE_FAILED", e)
        }
    }

    @ReactMethod
    fun release(promise: Promise) {
        try {
            wifiLock?.let { if (it.isHeld) it.release() }
            Log.i(NAME, "Wi-Fi lock released")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(NAME, "Failed to release Wi-Fi lock", e)
            promise.reject("WIFI_LOCK_RELEASE_FAILED", e)
        }
    }

    private fun createLock(): WifiManager.WifiLock {
        // Use applicationContext so the lock outlives the current Activity.
        val wifi = reactApplicationContext.applicationContext
            .getSystemService(Context.WIFI_SERVICE) as WifiManager
        // WIFI_MODE_FULL_HIGH_PERF is deprecated on API 29+ but is still honored
        // and, unlike LOW_LATENCY, keeps the radio awake with the screen off —
        // which is exactly what we need for background UDP reception.
        @Suppress("DEPRECATION")
        return wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "$NAME:udp")
            .apply { setReferenceCounted(false) }
    }

    companion object {
        private const val NAME = "WifiLock"
    }
}
