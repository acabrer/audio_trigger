/*
 * ESP32 Multi-Touch Sensor UDP Sender - 8 Beer Cans Edition
 * Sends messages with composite IDs (DEVICE_BUTTON format)
 * Compatible with ESP Audio Trigger App multi-button support
 * 
 * Features:
 * - Auto-calibration for each touch sensor
 * - Per-button threshold support
 * - GPIO33 software fix for 7th can
 * - GPIO13 mitigation for 8th can
 * - Correct pin mappings for HUZZAH32
 * - Touch value monitoring in heartbeat
 */
/*
 * ESP32 Multi-Touch Sensor UDP Sender - OPTIMIZED FOR INSTRUMENT RESPONSIVENESS
 * High-performance, low-latency version for musical instrument applications
 */

#include <WiFi.h>
#include <WiFiUdp.h>
#include <string.h>
#include "driver/gpio.h"

// WiFi settings
const char* ssid = "yourSSID";
const char* password = "yourPASSWORD";

// UDP settings
const IPAddress broadcastIP(255, 255, 255, 255);
const int udpPort = 4210;
WiFiUDP UDP;

const int DEVICE_ID = 2;

// Touch sensor pins - optimized order for best performance
const int touchPins[] = {T0, T3, T4, T5, T6, T7, T8, T9};
const int NUM_BUTTONS = 8;

// OPTIMIZED TIMING - Much more responsive!
const int DEFAULT_THRESHOLD = 500;
const float THRESHOLD_PERCENTAGE = 0.55;
const float GPIO13_THRESHOLD_PERCENTAGE = 0.15;

// CRITICAL: Reduced delays for instrument responsiveness
const unsigned long debounceDelay = 15;        // Reduced from 50ms to 15ms
const unsigned long touchCooldown = 20;        // Reduced from 500ms to 20ms!
const unsigned long retriggerDelay = 50;       // New: minimum time between same-button hits

// LED pin
const int ledPin = 13;

struct TouchButton {
  int pin;
  int buttonNumber;
  int baseline;
  int threshold;
  bool currentlyTouched;
  bool lastTouchState;
  unsigned long lastDebounceTime;
  unsigned long lastTouchTime;
  unsigned long lastRetriggerTime;  // New: for rapid retriggering
  unsigned long touchCount;
  int lastTouchValue;
  bool isGPIO13;
};

TouchButton buttons[NUM_BUTTONS];
char message[50];

void enableGPIO33Touch() {
  Serial.println("Enabling GPIO33 for touch sensing...");
  gpio_reset_pin(GPIO_NUM_33);
  Serial.println("✓ GPIO33 configured");
}

void mitigateGPIO13() {
  Serial.println("Applying GPIO13 mitigation...");
  gpio_reset_pin(GPIO_NUM_13);
  Serial.println("✓ GPIO13 configured");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("🎹 ESP32 OPTIMIZED INSTRUMENT CONTROLLER 🎹");
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);

  enableGPIO33Touch();
  mitigateGPIO13();

  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);

  // Initialize buttons
  for (int i = 0; i < NUM_BUTTONS; i++) {
    buttons[i].pin = touchPins[i];
    buttons[i].buttonNumber = i + 1;
    buttons[i].currentlyTouched = false;
    buttons[i].lastTouchState = false;
    buttons[i].lastDebounceTime = 0;
    buttons[i].lastTouchTime = 0;
    buttons[i].lastRetriggerTime = 0;  // Initialize new field
    buttons[i].touchCount = 0;
    buttons[i].baseline = 0;
    buttons[i].threshold = DEFAULT_THRESHOLD;
    buttons[i].lastTouchValue = 0;
    buttons[i].isGPIO13 = (touchPins[i] == T4);

    Serial.print("🎹 Button ");
    Serial.print(buttons[i].buttonNumber);
    Serial.print(" on pin ");

    switch(i) {
      case 0: Serial.print("T0 (GPIO 4/A5)"); break;
      case 1: Serial.print("T3 (GPIO 15)"); break;
      case 2: Serial.print("T4 (GPIO 13 - LED)"); break;
      case 3: Serial.print("T5 (GPIO 12)"); break;
      case 4: Serial.print("T6 (GPIO 14)"); break;
      case 5: Serial.print("T7 (GPIO 27)"); break;
      case 6: Serial.print("T8 (GPIO 33)"); break;
      case 7: Serial.print("T9 (GPIO 32)"); break;
    }
    Serial.println();
  }

  // Connect to WiFi (non-blocking approach)
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(250);  // Reduced delay
    Serial.print(".");
    attempts++;
    digitalWrite(ledPin, !digitalRead(ledPin));
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n📶 WiFi connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());

    // Quick success indication
    for (int i = 0; i < 2; i++) {
      digitalWrite(ledPin, HIGH);
      delay(50);
      digitalWrite(ledPin, LOW);
      delay(50);
    }
  } else {
    Serial.println("\n❌ WiFi failed, continuing anyway");
  }

  calibrateTouchSensors();
  fixZeroBaselines();

  Serial.println("\n🎹 INSTRUMENT READY - OPTIMIZED FOR LOW LATENCY! 🎹");
  Serial.println("Touch multiple buttons simultaneously for polyphonic play!");

  // Send initial status (faster)
  for (int i = 0; i < NUM_BUTTONS; i++) {
    sendTouchState(buttons[i].buttonNumber, false);
    delay(10);  // Reduced delay
  }
}

void fixZeroBaselines() {
  Serial.println("🔧 Checking baselines...");

  for (int i = 0; i < NUM_BUTTONS; i++) {
    if (buttons[i].baseline < 100) {
      Serial.print("🔧 Fixing Button ");
      Serial.print(buttons[i].buttonNumber);

      // Faster calibration for problematic pins
      int sum = 0;
      for (int j = 0; j < 5; j++) {  // Reduced from 10 to 5 readings
        sum += touchRead(buttons[i].pin);
        delay(10);  // Reduced from 50ms
      }
      int currentReading = sum / 5;

      if (currentReading < 100) {
        if (buttons[i].isGPIO13) {
          // GPIO13: baseline is very low (0-5), trigger when > 50
          buttons[i].baseline = currentReading;
          buttons[i].threshold = 50;  // Trigger when value goes ABOVE 50
        } else {
          buttons[i].baseline = 500;
          buttons[i].threshold = 200;
        }
      } else {
        buttons[i].baseline = currentReading;
        if (buttons[i].isGPIO13) {
          // GPIO13: trigger when 50+ points above baseline
          buttons[i].threshold = buttons[i].baseline + 50;
        } else {
          buttons[i].threshold = currentReading * 0.55;
        }
      }

      Serial.print(" - NEW baseline=");
      Serial.print(buttons[i].baseline);
      Serial.print(", threshold=");
      Serial.println(buttons[i].threshold);
    }
  }
}

void calibrateTouchSensors() {
  Serial.println("\n----- FAST CALIBRATION -----");
  Serial.println("🎹 Don't touch buttons for 2 seconds...");

  // Faster calibration indication
  for(int i = 0; i < 4; i++) {  // Reduced blinks
    digitalWrite(ledPin, HIGH);
    delay(125);
    digitalWrite(ledPin, LOW);
    delay(125);
  }

  for (int i = 0; i < NUM_BUTTONS; i++) {
    int baseline = 0;

    // Fewer readings for faster startup
    for(int j = 0; j < 10; j++) {  // Reduced from 25
      baseline += touchRead(buttons[i].pin);
      delay(10);  // Reduced from 20ms
    }

    buttons[i].baseline = baseline / 10;
    if (buttons[i].isGPIO13) {
      // GPIO13: trigger when value goes 50+ points above baseline
      buttons[i].threshold = buttons[i].baseline + 50;
    } else {
      buttons[i].threshold = buttons[i].baseline * THRESHOLD_PERCENTAGE;
    }

    Serial.print("🎹 Button ");
    Serial.print(buttons[i].buttonNumber);
    Serial.print(": baseline=");
    Serial.print(buttons[i].baseline);
    Serial.print(", threshold=");
    Serial.print(buttons[i].threshold);
    if (buttons[i].isGPIO13) Serial.print(" [GPIO13]");
    Serial.println();
  }

  Serial.println("✅ Fast calibration complete!");
}

void loop() {
  unsigned long currentTime = millis();

  // OPTIMIZED: Check all buttons in rapid succession
  for (int i = 0; i < NUM_BUTTONS; i++) {
    checkTouchButton(&buttons[i], currentTime);
  }

  // Reduced heartbeat frequency to minimize serial overhead
  static unsigned long lastHeartbeat = 0;
  if (currentTime - lastHeartbeat > 60000) {  // Every 60 seconds
    printHeartbeat();
    lastHeartbeat = currentTime;
  }

  // OPTIONAL: Disable debug prints for maximum performance
  // Comment out this block for fastest operation:
  static unsigned long lastDebugPrint = 0;
  static bool debugMode = false;  // Set to false for max performance

  if (debugMode && (currentTime - lastDebugPrint > 5000)) {
    Serial.print("🎹 Values: ");
    for (int i = 0; i < NUM_BUTTONS; i++) {
      Serial.print("B");
      Serial.print(i + 1);
      Serial.print(":");
      Serial.print(buttons[i].lastTouchValue);
      if (buttons[i].currentlyTouched) Serial.print("●");
      Serial.print(" ");
    }
    Serial.println();
    lastDebugPrint = currentTime;
  }

  // Quick WiFi check (reduced frequency)
  static unsigned long lastWiFiCheck = 0;
  if (currentTime - lastWiFiCheck > 10000) {  // Every 10 seconds
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.begin(ssid, password);
    }
    lastWiFiCheck = currentTime;
  }
}

// OPTIMIZED: Pass current time to avoid multiple millis() calls
void checkTouchButton(TouchButton* button, unsigned long currentTime) {
  // OPTIMIZED: Single reading for most pins, optimized reading for GPIO13
  int touchValue;
  if (button->isGPIO13) {
    // Quick double-read for GPIO13
    touchValue = max(touchRead(button->pin), touchRead(button->pin));
  } else {
    touchValue = touchRead(button->pin);
  }

  button->lastTouchValue = touchValue;

  // GPIO13 has INVERTED behavior - higher values mean touched!
  bool touched;
  if (button->isGPIO13) {
    touched = (touchValue > button->threshold);  // INVERTED: higher = touched
  } else {
    touched = (touchValue < button->threshold);  // Normal: lower = touched
  }

  // OPTIMIZED: Faster debounce logic
  if (touched != button->lastTouchState) {
    button->lastDebounceTime = currentTime;
  }

  if ((currentTime - button->lastDebounceTime) > debounceDelay) {
    if (touched != button->currentlyTouched) {
      button->currentlyTouched = touched;

      if (button->currentlyTouched) {  // Just touched
        // CRITICAL: Allow rapid retriggering for instrument response!
        bool canTrigger = (currentTime - button->lastRetriggerTime) > retriggerDelay;

        if (canTrigger || (currentTime - button->lastTouchTime) > touchCooldown) {
          button->touchCount++;
          button->lastTouchTime = currentTime;
          button->lastRetriggerTime = currentTime;

          // Minimal serial output for performance
          Serial.print("🎹B");
          Serial.print(button->buttonNumber);
          Serial.print(" HIT! (");
          Serial.print(touchValue);
          Serial.println(")");

          // Send UDP immediately
          sendTouchState(button->buttonNumber, true);

          // Quick LED feedback (avoid for GPIO13)
          if (!button->isGPIO13) {
            digitalWrite(ledPin, HIGH);
          }
        }
      } else {  // Just released
        // Quick release notification
        sendTouchState(button->buttonNumber, false);

        // LED management
        if (!button->isGPIO13) {
          bool anyPressed = false;
          for (int i = 0; i < NUM_BUTTONS; i++) {
            if (buttons[i].currentlyTouched && !buttons[i].isGPIO13) {
              anyPressed = true;
              break;
            }
          }
          if (!anyPressed) {
            digitalWrite(ledPin, LOW);
          }
        }
      }
    }
  }

  button->lastTouchState = touched;
}

// OPTIMIZED: Streamlined UDP sending
void sendTouchState(int buttonNumber, bool touched) {
  snprintf(message, sizeof(message), "BUTTON:%d_%d:%d",
           DEVICE_ID, buttonNumber, touched ? 1 : 0);

  UDP.beginPacket(broadcastIP, udpPort);
  UDP.write((uint8_t*)message, strlen(message));
  UDP.endPacket();  // Removed error checking for speed
}

void printHeartbeat() {
  Serial.println("\n🎹----- INSTRUMENT STATUS -----🎹");
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);
  Serial.print("Uptime: ");
  Serial.print(millis() / 1000);
  Serial.println("s");

  for (int i = 0; i < NUM_BUTTONS; i++) {
    Serial.print("  🎹 B");
    Serial.print(buttons[i].buttonNumber);
    Serial.print(": ");
    Serial.print(buttons[i].touchCount);
    Serial.print(" hits, val=");
    Serial.print(buttons[i].lastTouchValue);
    if (buttons[i].currentlyTouched) Serial.print(" ●");
    Serial.println();
  }

  Serial.print("📶 WiFi: ");
  Serial.println(WiFi.status() == WL_CONNECTED ? "OK" : "DISCONNECTED");
  Serial.println("🎹-----------------------------🎹");
}