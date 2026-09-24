package com.espaudiotrigger

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Watches for audio OUTPUT device changes (Bluetooth speaker connect/disconnect,
 * wired headset plug, etc.) and notifies JS via the "audioDeviceChanged" event.
 *
 * Why: react-native-audio-api's Oboe output stream does not survive an output
 * route change — the stream is disconnected and never reopened, so all playback
 * goes silent until the app restarts. JS listens to this event and rebuilds the
 * AudioContext on a fresh stream for the current device. See
 * src/services/audio.ts (rebuildContext) and src/services/audioDeviceMonitor.ts.
 */
class AudioDeviceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var callback: AudioDeviceCallback? = null
    // registerAudioDeviceCallback fires onAudioDevicesAdded once immediately with
    // the CURRENT devices — skip that initial call so we don't rebuild at startup.
    private var sawInitialCallback = false

    override fun getName(): String = NAME

    @ReactMethod
    fun start() {
        if (callback != null) return
        val am =
            reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val cb = object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
                if (!sawInitialCallback) {
                    // The immediate post-register callback — current devices, not a change.
                    sawInitialCallback = true
                    return
                }
                emitChange("added")
            }

            override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
                emitChange("removed")
            }
        }
        am.registerAudioDeviceCallback(cb, Handler(Looper.getMainLooper()))
        callback = cb
        Log.i(NAME, "Audio device observer started")
    }

    @ReactMethod
    fun stop() {
        val am =
            reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        callback?.let { am.unregisterAudioDeviceCallback(it) }
        callback = null
        sawInitialCallback = false
    }

    // Required no-ops so JS NativeEventEmitter/DeviceEventEmitter is satisfied.
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    private fun emitChange(type: String) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT, type)
            Log.i(NAME, "audioDeviceChanged: $type")
        } catch (e: Exception) {
            Log.w(NAME, "Failed to emit audioDeviceChanged", e)
        }
    }

    companion object {
        private const val NAME = "AudioDeviceObserver"
        private const val EVENT = "audioDeviceChanged"
    }
}
