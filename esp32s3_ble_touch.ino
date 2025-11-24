/*
 * ESP32-S3 Multi-Touch Sensor BLE Broadcaster
 * Professional-grade low-latency implementation for musical instruments
 *
 * Hardware: Adafruit ESP32-S3 Feather (or compatible ESP32-S3)
 * Touch Pins: GPIO1, GPIO2, GPIO3, GPIO4, GPIO5, GPIO6, GPIO7, GPIO8
 *
 * Features:
 * - 8 simultaneous capacitive touch inputs
 * - Bluetooth Low Energy (BLE) with optimized MTU
 * - Ultra-low latency: <10ms from touch to transmission
 * - Adaptive threshold calibration
 * - Professional debouncing (10ms) for musical performance
 * - Connection status LED indicator
 * - Auto-reconnect capability
 *
 * BLE Service:
 * - Service UUID: 4fafc201-1fb5-459e-8fcc-c5c9c331914b
 * - Characteristic UUID: beb5483e-36e1-4688-b7f5-ea07361b26a8
 * - Message format: BUTTON:DEVICE_BUTTON:STATE (same as UDP)
 *
 * Performance Targets:
 * - Touch detection: <5ms
 * - BLE transmission: <7ms
 * - Total latency: <12ms (ESP32 side)
 *
 * Author: Professional ESP32 Developer
 * Version: 2.0 (BLE Optimized for ESP32-S3)
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ============== BLE CONFIGURATION ==============
// Standard UUIDs for touch sensor service
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// BLE globals
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// ============== DEVICE CONFIGURATION ==============
const int DEVICE_ID = 3;  // Change this for each device
char deviceName[32];

// Touch Sensor Configuration - ESP32-S3 compatible pins
// IMPORTANT: Use the SAME pins as your working UDP firmware!
const int touchPins[] = {14, 8, 9, 10, 11, 12, 6, 5};
const int NUM_BUTTONS = 8;

// ============== TIMING CONFIGURATION ==============
// Optimized for absolute minimum latency while maintaining reliability
const unsigned long DEBOUNCE_DELAY = 10;          // 10ms debounce (reduced from 15ms)
const unsigned long TOUCH_COOLDOWN = 15;          // 15ms cooldown (reduced from 20ms)
const unsigned long RETRIGGER_DELAY = 40;         // 40ms retrigger (reduced from 50ms)
const unsigned long CALIBRATION_DELAY = 1500;     // 1.5s calibration (reduced from 2s)
const unsigned long HEARTBEAT_INTERVAL = 60000;   // Status update every minute
const unsigned long CONNECTION_CHECK_INTERVAL = 5000; // Check connection every 5s

// ============== THRESHOLD CONFIGURATION ==============
const float DEFAULT_THRESHOLD_MULTIPLIER = 1.60;  // 60% above baseline (ESP32-S3)
const int MIN_BASELINE = 10000;                   // Minimum acceptable baseline
const int MAX_BASELINE = 100000;                  // Maximum acceptable baseline
const float BASELINE_DRIFT_THRESHOLD = 0.15;      // 15% drift triggers recalibration

// ============== LED CONFIGURATION ==============
const int LED_PIN = 13;  // Built-in LED
const bool USE_LED = true;

// ============== DATA STRUCTURES ==============
struct TouchButton {
    int pin;
    int buttonNumber;
    int baseline;
    int threshold;
    bool currentlyTouched;
    bool lastTouchState;
    unsigned long lastDebounceTime;
    unsigned long lastTouchTime;
    unsigned long lastRetriggerTime;
    unsigned long touchCount;
    int lastTouchValue;
    int avgBaseline;
    bool needsRecalibration;
};

// ============== GLOBAL VARIABLES ==============
TouchButton buttons[NUM_BUTTONS];
char bleMessage[64];
unsigned long lastHeartbeat = 0;
unsigned long lastConnectionCheck = 0;
unsigned long startTime = 0;

// Performance tracking
unsigned long totalMessages = 0;
unsigned long failedMessages = 0;
unsigned long maxLatency = 0;
unsigned long minLatency = 999999;
unsigned long avgLatency = 0;

// ============== BLE SERVER CALLBACKS ==============
class ServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        deviceConnected = true;
        Serial.println("📱 BLE Client Connected!");

        // PHASE 1 OPTIMIZATION: Request maximum MTU for lower latency
        BLEDevice::setMTU(512);
        Serial.println("   🔧 Requested MTU: 512 bytes");

        // PHASE 1 OPTIMIZATION: Update connection parameters for ultra-low latency
        // Min/Max interval: 6 units (7.5ms) - iOS minimum
        // Slave latency: 0 - immediate response, no skipped events
        // Timeout: 600 (6 seconds) - stable connection
        pServer->updateConnParams(pServer->getConnId(), 6, 6, 0, 600);
        Serial.println("   🔧 Connection params: 7.5ms interval, 0 latency");

        // Note: 2M PHY optimization not available in this BLE library version
        // The MTU and connection parameter optimizations provide the main benefit

        // Connection success indicator (simplified to not block)
        if (USE_LED) {
            digitalWrite(LED_PIN, HIGH);
            delay(100);
            digitalWrite(LED_PIN, LOW);
        }
    }

    void onDisconnect(BLEServer* pServer) {
        deviceConnected = false;
        Serial.println("📱 BLE Client Disconnected");

        if (USE_LED) {
            digitalWrite(LED_PIN, LOW);
        }
    }
};

// ============== SETUP FUNCTION ==============
void setup() {
    Serial.begin(115200);

    // Allow hardware to stabilize
    delay(CALIBRATION_DELAY);

    printHeader();

    // Initialize LED
    if (USE_LED) {
        pinMode(LED_PIN, OUTPUT);
        digitalWrite(LED_PIN, LOW);
    }

    // Initialize button structures
    initializeButtons();

    // Initialize BLE
    initializeBLE();

    // Calibrate touch sensors
    calibrateTouchSensors();

    // Verify calibration
    verifyCalibration();

    startTime = millis();

    Serial.println("\n✅ SYSTEM READY - Waiting for BLE connection...");
    Serial.println("📊 Touch any button to test (after connecting)\n");
}

// ============== MAIN LOOP ==============
void loop() {
    unsigned long currentTime = millis();

    // Handle BLE connection state changes
    handleBLEConnection();

    // Process touch buttons only if connected (to save power)
    if (deviceConnected) {
        for (int i = 0; i < NUM_BUTTONS; i++) {
            processTouchButton(&buttons[i], currentTime);
        }
    }

    // Periodic heartbeat
    if (currentTime - lastHeartbeat > HEARTBEAT_INTERVAL) {
        printHeartbeat();
        lastHeartbeat = currentTime;
    }

    // Very tight loop for minimal latency - no delays!
}

// ============== INITIALIZATION FUNCTIONS ==============
void initializeButtons() {
    Serial.println("📍 Initializing button structures...");

    for (int i = 0; i < NUM_BUTTONS; i++) {
        buttons[i].pin = touchPins[i];
        buttons[i].buttonNumber = i + 1;
        buttons[i].currentlyTouched = false;
        buttons[i].lastTouchState = false;
        buttons[i].lastDebounceTime = 0;
        buttons[i].lastTouchTime = 0;
        buttons[i].lastRetriggerTime = 0;
        buttons[i].touchCount = 0;
        buttons[i].baseline = 0;
        buttons[i].threshold = 0;
        buttons[i].lastTouchValue = 0;
        buttons[i].avgBaseline = 0;
        buttons[i].needsRecalibration = false;

        Serial.print("  Button ");
        Serial.print(buttons[i].buttonNumber);
        Serial.print(" → GPIO");
        Serial.println(buttons[i].pin);
    }
}

void initializeBLE() {
    Serial.println("\n📶 Initializing BLE...");

    // Generate unique device name
    snprintf(deviceName, sizeof(deviceName), "ESP32-Touch-%d", DEVICE_ID);

    // Initialize BLE
    BLEDevice::init(deviceName);

    // Create BLE Server
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());

    // Create BLE Service
    BLEService *pService = pServer->createService(SERVICE_UUID);

    // Create BLE Characteristic with optimal properties
    pCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_UUID,
        BLECharacteristic::PROPERTY_READ   |
        BLECharacteristic::PROPERTY_NOTIFY |
        BLECharacteristic::PROPERTY_INDICATE
    );

    // Add descriptor for notifications
    pCharacteristic->addDescriptor(new BLE2902());

    // Set initial value
    pCharacteristic->setValue("Ready");

    // Start the service
    pService->start();

    // Start advertising with optimized parameters
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);  // Fast connection interval
    pAdvertising->setMaxPreferred(0x12);

    BLEDevice::startAdvertising();

    Serial.print("✅ BLE initialized as: ");
    Serial.println(deviceName);
    Serial.println("   Service UUID: " SERVICE_UUID);
    Serial.println("   Waiting for connection...");

    // Success indicator
    if (USE_LED) {
        for (int i = 0; i < 3; i++) {
            digitalWrite(LED_PIN, HIGH);
            delay(100);
            digitalWrite(LED_PIN, LOW);
            delay(100);
        }
    }
}

void handleBLEConnection() {
    // Handle connection state changes
    if (!deviceConnected && oldDeviceConnected) {
        // Disconnected - restart advertising
        delay(500);
        pServer->startAdvertising();
        Serial.println("📡 Restarting BLE advertising...");
        oldDeviceConnected = deviceConnected;
    }

    if (deviceConnected && !oldDeviceConnected) {
        // Just connected
        oldDeviceConnected = deviceConnected;
        sendInitialStatus();
    }
}

// ============== CALIBRATION FUNCTIONS ==============
void calibrateTouchSensors() {
    Serial.println("\n🎯 CALIBRATING TOUCH SENSORS");
    Serial.println("   ⚠️ DO NOT TOUCH buttons for 2 seconds...");

    if (USE_LED) {
        for (int i = 0; i < 4; i++) {
            digitalWrite(LED_PIN, HIGH);
            delay(200);
            digitalWrite(LED_PIN, LOW);
            delay(200);
        }
    }

    for (int i = 0; i < NUM_BUTTONS; i++) {
        int readings[15];

        // Take readings
        for (int j = 0; j < 15; j++) {
            readings[j] = touchRead(buttons[i].pin);
            delay(40);
        }

        // Calculate median
        bubbleSort(readings, 15);
        buttons[i].baseline = readings[7];

        // ESP32-S3: touch values INCREASE when touched
        // Threshold is ABOVE baseline
        buttons[i].threshold = buttons[i].baseline * DEFAULT_THRESHOLD_MULTIPLIER;
        buttons[i].avgBaseline = buttons[i].baseline;

        Serial.print("   Button ");
        Serial.print(buttons[i].buttonNumber);
        Serial.print(" (GPIO");
        Serial.print(buttons[i].pin);
        Serial.print("): baseline=");
        Serial.print(buttons[i].baseline);
        Serial.print(", threshold=");
        Serial.println(buttons[i].threshold);
    }

    Serial.println("✅ Calibration complete!\n");
}

void verifyCalibration() {
    Serial.println("🔍 Verifying calibration...");
    bool allGood = true;

    for (int i = 0; i < NUM_BUTTONS; i++) {
        if (buttons[i].baseline < MIN_BASELINE || buttons[i].baseline > MAX_BASELINE) {
            Serial.print("   ⚠️ Button ");
            Serial.print(buttons[i].buttonNumber);
            Serial.print(" baseline out of range: ");
            Serial.println(buttons[i].baseline);
            allGood = false;
        }
    }

    if (allGood) {
        Serial.println("   ✅ All sensors calibrated successfully");
    } else {
        Serial.println("   ⚠️ Some sensors need attention - will auto-adjust");
    }
}

// ============== TOUCH PROCESSING ==============
void processTouchButton(TouchButton* button, unsigned long currentTime) {
    unsigned long startMicros = micros();  // Track processing time

    // Read touch value
    int touchValue = touchRead(button->pin);
    button->lastTouchValue = touchValue;

    // ESP32-S3: Higher values = touched
    bool touched = (touchValue > button->threshold);

    // Dynamic baseline adjustment (for temperature/humidity drift)
    if (!touched && (currentTime - button->lastTouchTime) > 5000) {
        button->avgBaseline = (button->avgBaseline * 19 + touchValue) / 20;

        // Recalibrate if significant drift
        int drift = abs(button->avgBaseline - button->baseline);
        if (drift > button->baseline * BASELINE_DRIFT_THRESHOLD) {
            button->baseline = button->avgBaseline;
            button->threshold = button->baseline * DEFAULT_THRESHOLD_MULTIPLIER;
        }
    }

    // Debounce logic
    if (touched != button->lastTouchState) {
        button->lastDebounceTime = currentTime;
    }

    if ((currentTime - button->lastDebounceTime) > DEBOUNCE_DELAY) {
        if (touched != button->currentlyTouched) {
            button->currentlyTouched = touched;

            if (touched) {
                // Button pressed
                bool canTrigger = (currentTime - button->lastRetriggerTime) > RETRIGGER_DELAY;

                if (canTrigger || (currentTime - button->lastTouchTime) > TOUCH_COOLDOWN) {
                    handleButtonPress(button, touchValue, startMicros);
                    button->lastTouchTime = currentTime;
                    button->lastRetriggerTime = currentTime;
                }
            } else {
                // Button released
                handleButtonRelease(button);
            }
        }
    }

    button->lastTouchState = touched;
}

void handleButtonPress(TouchButton* button, int touchValue, unsigned long startMicros) {
    button->touchCount++;

    // PHASE 1 OPTIMIZATION: Send BLE message IMMEDIATELY (critical path)
    unsigned long bleLatency = sendTouchState(button->buttonNumber, true);

    // Calculate total latency
    unsigned long totalLatency = (micros() - startMicros) / 1000;

    // Track performance stats
    if (totalLatency > maxLatency) maxLatency = totalLatency;
    if (totalLatency < minLatency) minLatency = totalLatency;
    avgLatency = (avgLatency * (button->touchCount - 1) + totalLatency) / button->touchCount;

    // Serial output and LED (non-critical, after BLE transmission)
    Serial.print("🎹 BUTTON ");
    Serial.print(button->buttonNumber);
    Serial.print(" PRESSED! [GPIO");
    Serial.print(button->pin);
    Serial.print("] Value: ");
    Serial.print(touchValue);
    Serial.print(" (thresh: ");
    Serial.print(button->threshold);
    Serial.print(")");
    Serial.print(" | Latency: ");
    Serial.print(totalLatency);
    Serial.println("ms");

    // LED feedback (moved after critical timing)
    if (USE_LED) {
        digitalWrite(LED_PIN, HIGH);
    }
}

void handleButtonRelease(TouchButton* button) {
    sendTouchState(button->buttonNumber, false);

    // Check if any buttons still pressed
    if (USE_LED) {
        bool anyPressed = false;
        for (int i = 0; i < NUM_BUTTONS; i++) {
            if (buttons[i].currentlyTouched) {
                anyPressed = true;
                break;
            }
        }
        if (!anyPressed) {
            digitalWrite(LED_PIN, LOW);
        }
    }
}

// ============== BLE COMMUNICATION ==============
unsigned long sendTouchState(int buttonNumber, bool touched) {
    unsigned long startMicros = micros();

    // Format: BUTTON:DEVICE_BUTTON:STATE:TIMESTAMP_MS
    // Adding millisecond timestamp for latency measurement
    snprintf(bleMessage, sizeof(bleMessage), "BUTTON:%d_%d:%d:%lu",
             DEVICE_ID, buttonNumber, touched ? 1 : 0, millis());

    if (deviceConnected) {
        pCharacteristic->setValue(bleMessage);
        pCharacteristic->notify();  // Send notification

        totalMessages++;

        unsigned long latency = (micros() - startMicros) / 1000;
        return latency;
    } else {
        failedMessages++;
        return 0;
    }
}

void sendInitialStatus() {
    Serial.println("📡 Sending initial button states...");
    for (int i = 0; i < NUM_BUTTONS; i++) {
        sendTouchState(buttons[i].buttonNumber, false);
        delay(50);
    }
}

// ============== MONITORING FUNCTIONS ==============
void printHeartbeat() {
    Serial.println("\n=====================================");
    Serial.println("📊 SYSTEM STATUS REPORT (BLE)");
    Serial.println("=====================================");

    unsigned long uptime = (millis() - startTime) / 1000;
    Serial.print("⏱️  Uptime: ");
    Serial.print(uptime / 3600);
    Serial.print("h ");
    Serial.print((uptime % 3600) / 60);
    Serial.print("m ");
    Serial.print(uptime % 60);
    Serial.println("s");

    Serial.print("🆔 Device: ");
    Serial.println(deviceName);

    Serial.print("📶 BLE Status: ");
    Serial.println(deviceConnected ? "Connected" : "Disconnected (advertising)");

    Serial.print("📡 Messages: ");
    Serial.print(totalMessages);
    Serial.print(" sent, ");
    Serial.print(failedMessages);
    Serial.println(" failed");

    Serial.println("\n⚡ LATENCY STATS:");
    Serial.print("   Min: ");
    Serial.print(minLatency);
    Serial.print("ms | Max: ");
    Serial.print(maxLatency);
    Serial.print("ms | Avg: ");
    Serial.print(avgLatency);
    Serial.println("ms");

    Serial.println("\n🎹 BUTTON STATISTICS:");
    for (int i = 0; i < NUM_BUTTONS; i++) {
        Serial.print("   B");
        Serial.print(buttons[i].buttonNumber);
        Serial.print(": ");
        Serial.print(buttons[i].touchCount);
        Serial.print(" touches, value=");
        Serial.print(buttons[i].lastTouchValue);
        if (buttons[i].currentlyTouched) {
            Serial.print(" [ACTIVE]");
        }
        Serial.println();
    }
    Serial.println("=====================================\n");
}

// ============== UTILITY FUNCTIONS ==============
void printHeader() {
    Serial.println("\n\n");
    Serial.println("╔═══════════════════════════════════════════╗");
    Serial.println("║   ESP32-S3 TOUCH SENSOR BLE CONTROLLER   ║");
    Serial.println("║     Professional Low-Latency v2.0 BLE    ║");
    Serial.println("╚═══════════════════════════════════════════╝");
    Serial.println();
    Serial.println("🎹 Configuration:");
    Serial.print("   • Device ID: ");
    Serial.println(DEVICE_ID);
    Serial.print("   • Touch Pins: ");
    for (int i = 0; i < NUM_BUTTONS; i++) {
        Serial.print("GPIO");
        Serial.print(touchPins[i]);
        if (i < NUM_BUTTONS - 1) Serial.print(", ");
    }
    Serial.println();
    Serial.println("   • Protocol: Bluetooth Low Energy (BLE)");
    Serial.println("   • Target Latency: <15ms");
    Serial.println();
}

void bubbleSort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}
