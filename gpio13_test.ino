/*
 * Simple GPIO13 Touch Test
 * Tests touch sensor on GPIO13 (T4) to see live readings
 */

// Global baseline variable
int baseline = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("GPIO13 Touch Test Starting...");
  Serial.println("Touch the cable connected to GPIO13 to see readings change");
  Serial.println("Format: TouchValue | Baseline | Difference");
  Serial.println("----------------------------------------");

  // Take baseline reading (don't touch for 3 seconds)
  Serial.println("Calibrating baseline - don't touch for 3 seconds...");
  delay(3000);

  baseline = 0;  // Reset baseline
  for (int i = 0; i < 20; i++) {
    baseline += touchRead(T4);  // T4 = GPIO13
    delay(50);
  }
  baseline = baseline / 20;

  Serial.print("Baseline established: ");
  Serial.println(baseline);
  Serial.println("Now you can touch the cable to see changes:");
  Serial.println();
}

void loop() {
  int touchValue = touchRead(T4);  // T4 = GPIO13
  int difference = touchValue - baseline;

  Serial.print("Touch: ");
  Serial.print(touchValue);
  Serial.print(" | Baseline: ");
  Serial.print(baseline);
  Serial.print(" | Diff: ");
  Serial.print(difference);

  // Indicate if this would trigger (using various thresholds)
  if (touchValue < 10) {
    Serial.print(" [TRIGGER @ 10]");
  }
  if (touchValue < 50) {
    Serial.print(" [TRIGGER @ 50]");
  }
  if (touchValue < 100) {
    Serial.print(" [TRIGGER @ 100]");
  }

  Serial.println();

  delay(200);  // Update 5 times per second
}